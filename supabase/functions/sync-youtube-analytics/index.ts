import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface YouTubeAccount {
  id: string;
  project_id: string;
  channel_id: string;
  channel_name: string;
  access_token: string;
  refresh_token: string;
  token_expires_at: string;
}

const MIN_VIEWS_FOR_WINNER = 100; // Minimum views before declaring a winner
const MIN_HOURS_FOR_DATA = 48; // Minimum hours of data before comparing
const TIE_THRESHOLD = 5; // Percentage difference threshold for inconclusive

// RCCLO: Estimate retention percentiles from average view percentage
function estimateRetentionPercentiles(avgViewPct: number): {
  r25: number; r50: number; r75: number; completion: number;
} {
  const avg = Math.min(Math.max(avgViewPct / 100, 0), 1);
  const lambda = avg > 0 ? -Math.log(avg) : 1;
  return {
    r25: Math.min(Math.exp(-0.25 * lambda), 1),
    r50: Math.min(Math.exp(-0.50 * lambda), 1),
    r75: Math.min(Math.exp(-0.75 * lambda), 1),
    completion: avg,
  };
}

// RCCLO: Compute RetentionScore composite
function computeRetentionScore(
  r25: number, r50: number, r75: number, completion: number, rewatchRate: number
): number {
  return 0.20 * r25 + 0.25 * r50 + 0.25 * r75 + 0.20 * completion + 0.10 * rewatchRate;
}

async function refreshAccessToken(refreshToken: string): Promise<{ access_token: string; expires_in: number } | null> {
  const clientId = Deno.env.get('YOUTUBE_CLIENT_ID');
  const clientSecret = Deno.env.get('YOUTUBE_CLIENT_SECRET');

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId!,
      client_secret: clientSecret!,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  if (!response.ok) {
    console.error('[sync-youtube-analytics] Token refresh failed:', await response.text());
    return null;
  }

  return await response.json();
}

async function getValidAccessToken(supabase: any, account: YouTubeAccount): Promise<string | null> {
  let accessToken = account.access_token;
  const tokenExpiresAt = new Date(account.token_expires_at);

  if (tokenExpiresAt <= new Date()) {
    console.log(`[sync-youtube-analytics] Refreshing token for ${account.channel_name}`);
    const newTokens = await refreshAccessToken(account.refresh_token);

    if (!newTokens) {
      return null;
    }

    accessToken = newTokens.access_token;
    const newExpiresAt = new Date(Date.now() + (newTokens.expires_in * 1000)).toISOString();

    await supabase
      .from('youtube_accounts')
      .update({
        access_token: accessToken,
        token_expires_at: newExpiresAt,
      })
      .eq('id', account.id);
  }

  return accessToken;
}

// Determine performance stage from hours since publish
function getPerformanceStage(publishedAt: string | null): { stage: string | null; hoursSincePublish: number | null } {
  if (!publishedAt) return { stage: null, hoursSincePublish: null };
  const hours = (Date.now() - new Date(publishedAt).getTime()) / (1000 * 60 * 60);
  const stages: [number, string][] = [
    [10 / 60, '10m'], [30 / 60, '30m'], [2, '2h'], [5, '5h'],
    [10, '10h'], [15, '15h'], [24, '1d'], [48, '2d'],
    [72, '3d'], [96, '4d'], [120, '5d'], [144, '6d'], [168, '7d'],
  ];
  let stage = '7d+';
  for (const [threshold, label] of stages) {
    if (hours <= threshold) { stage = label; break; }
  }
  return { stage, hoursSincePublish: parseFloat(hours.toFixed(2)) };
}

// Compute all ratios from raw metrics
function computeRatios(views: number, likes: number, comments: number, favorites: number, engagedViews: number) {
  const safeViews = Math.max(views, 1);
  const safeLikes = Math.max(likes, 1);
  const safeEngaged = Math.max(engagedViews, 1);
  return {
    ratio_like_to_view: likes / safeViews,
    ratio_comment_to_view: comments / safeViews,
    ratio_favorite_to_view: favorites / safeViews,
    ratio_comment_to_like: comments / safeLikes,
    ratio_favorite_to_like: favorites / safeLikes,
    ratio_like_to_favorite: likes / Math.max(favorites, 1),
    ratio_engaged_to_view: engagedViews / safeViews,
    ratio_like_to_engaged: likes / safeEngaged,
    ratio_comment_to_engaged: comments / safeEngaged,
    ratio_favorite_to_engaged: favorites / safeEngaged,
  };
}

async function fetchVideoAnalytics(accessToken: string, videoId: string, channelId: string): Promise<any> {
  // 1. YouTube Data API: statistics + snippet
  const videoResponse = await fetch(
    `https://www.googleapis.com/youtube/v3/videos?part=statistics,snippet&id=${videoId}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!videoResponse.ok) {
    console.error('[sync-youtube-analytics] Failed to fetch video stats:', await videoResponse.text());
    return null;
  }

  const videoData = await videoResponse.json();
  const video = videoData.items?.[0];
  if (!video) {
    console.log(`[sync-youtube-analytics] Video ${videoId} not found`);
    return null;
  }

  const stats = video.statistics;
  const snippet = video.snippet;

  const endDate = new Date().toISOString().split('T')[0];
  const startDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  // 2. YouTube Analytics API: main metrics (expanded)
  let avgViewDuration = null, avgViewPercentage = null, watchTimeSeconds = null;
  let subscribersGained = 0, subscribersLost = 0, shares = 0, dislikes = 0;
  let impressions = 0, impressionsCTR = null;

  try {
    const analyticsResponse = await fetch(
      `https://youtubeanalytics.googleapis.com/v2/reports?` +
      `ids=channel==${channelId}&` +
      `startDate=${startDate}&endDate=${endDate}&` +
      `metrics=views,averageViewDuration,averageViewPercentage,estimatedMinutesWatched,` +
      `subscribersGained,subscribersLost,shares,dislikes,likes,` +
      `impressions,impressionClickThroughRate&` +
      `dimensions=video&filters=video==${videoId}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (analyticsResponse.ok) {
      const data = await analyticsResponse.json();
      if (data?.rows?.length > 0) {
        const row = data.rows[0];
        // columns: video, views, avgViewDuration, avgViewPercentage, estimatedMinutesWatched,
        //          subscribersGained, subscribersLost, shares, dislikes, likes,
        //          impressions, impressionClickThroughRate
        avgViewDuration = row[3] ? Math.round(row[3]) : null;
        avgViewPercentage = row[4] ? parseFloat(row[4].toFixed(2)) : null;
        watchTimeSeconds = row[5] ? Math.round(row[5] * 60) : null;
        subscribersGained = row[6] || 0;
        subscribersLost = row[7] || 0;
        shares = row[8] || 0;
        dislikes = row[9] || 0;
        // row[10] = likes from analytics (we use Data API likes instead)
        impressions = row[11] || 0;
        impressionsCTR = row[12] ? parseFloat(row[12].toFixed(4)) : null;
      }
    } else {
      console.log('[sync-youtube-analytics] Analytics not available for:', videoId);
    }
  } catch (e) {
    console.log('[sync-youtube-analytics] Could not fetch analytics:', e);
  }

  // 3. Traffic source breakdown
  let trafficSources: Record<string, number> | null = null;
  try {
    const trafficResponse = await fetch(
      `https://youtubeanalytics.googleapis.com/v2/reports?` +
      `ids=channel==${channelId}&` +
      `startDate=${startDate}&endDate=${endDate}&` +
      `metrics=views&dimensions=insightTrafficSourceType&` +
      `filters=video==${videoId}&sort=-views`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (trafficResponse.ok) {
      const tData = await trafficResponse.json();
      if (tData?.rows?.length > 0) {
        trafficSources = {};
        for (const row of tData.rows) {
          trafficSources[row[0]] = row[1];
        }
      }
    }
  } catch (e) {
    console.log('[sync-youtube-analytics] Traffic source unavailable:', e);
  }

  // 4. Peak hour (hour with most views)
  let peakHour: number | null = null;
  try {
    const hourResponse = await fetch(
      `https://youtubeanalytics.googleapis.com/v2/reports?` +
      `ids=channel==${channelId}&` +
      `startDate=${startDate}&endDate=${endDate}&` +
      `metrics=views&dimensions=hour&` +
      `filters=video==${videoId}&sort=-views&maxResults=1`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (hourResponse.ok) {
      const hData = await hourResponse.json();
      if (hData?.rows?.length > 0) {
        peakHour = parseInt(hData.rows[0][0]);
      }
    }
  } catch (e) {
    console.log('[sync-youtube-analytics] Peak hour unavailable:', e);
  }

  // 5. Compute derived metrics
  const views = parseInt(stats.viewCount) || 0;
  const likes = parseInt(stats.likeCount) || 0;
  const comments = parseInt(stats.commentCount) || 0;
  const favorites = parseInt(stats.favoriteCount) || 0;
  const avgPct = avgViewPercentage || 0;

  // Engaged views: estimate views where viewer watched >= 50%
  const engagedViews = avgPct >= 50 ? views : Math.round(views * (avgPct / 100) * 1.5);
  // Completed views: estimate from avg view percentage using exponential model
  const completedViews = Math.round(views * Math.pow(avgPct / 100, 2.5));

  // Stage
  const { stage, hoursSincePublish } = getPerformanceStage(snippet.publishedAt);

  // Ratios
  const ratios = computeRatios(views, likes, comments, favorites, engagedViews);

  // Peak hour ratio (views in peak hour / total views)
  let peakHourRatio = null;
  if (peakHour !== null && trafficSources) {
    // We don't have per-hour view count, so estimate from traffic sources
    peakHourRatio = null; // Will be set from hourly data if available
  }

  return {
    youtube_views: views,
    youtube_likes: likes,
    youtube_comments: comments,
    youtube_dislikes: dislikes,
    youtube_favorites: favorites,
    youtube_shares: shares,
    youtube_subscribers_gained: subscribersGained,
    youtube_subscribers_lost: subscribersLost,
    youtube_impressions: impressions,
    youtube_impressions_ctr: impressionsCTR,
    youtube_watch_time_seconds: watchTimeSeconds,
    youtube_avg_view_duration_seconds: avgViewDuration,
    youtube_avg_view_percentage: avgViewPercentage,
    youtube_click_through_rate: impressionsCTR,
    youtube_engaged_views: engagedViews,
    youtube_completed_views: completedViews,
    youtube_peak_hour: peakHour,
    youtube_traffic_sources: trafficSources,
    performance_stage: stage,
    hours_since_publish: hoursSincePublish,
    video_title: snippet.title,
    video_description: snippet.description,
    published_at: snippet.publishedAt,
    ...ratios,
  };
}

async function checkAndUpdateABTestWinners(supabase: any) {
  console.log('[sync-youtube-analytics] Checking A/B test winners...');

  // Get all running A/B tests
  const { data: runningTests, error: testsError } = await supabase
    .from('hook_ab_tests')
    .select('*')
    .eq('status', 'running');

  if (testsError || !runningTests) {
    console.error('[sync-youtube-analytics] Error fetching running tests:', testsError);
    return;
  }

  for (const test of runningTests) {
    // Get all variations for this test
    const { data: variations, error: varsError } = await supabase
      .from('hook_variations')
      .select('*')
      .eq('test_id', test.id);

    if (varsError || !variations || variations.length < 2) {
      continue;
    }

    // Check if all variations have enough data
    const completedVariations = variations.filter((v: any) =>
      v.status === 'completed' &&
      v.youtube_views >= MIN_VIEWS_FOR_WINNER &&
      v.youtube_avg_view_percentage !== null
    );

    // Check if enough time has passed (48+ hours since test creation)
    const testAge = (Date.now() - new Date(test.created_at).getTime()) / (1000 * 60 * 60);

    if (completedVariations.length === variations.length && testAge >= MIN_HOURS_FOR_DATA) {
      console.log(`[sync-youtube-analytics] Test ${test.id} ready for winner determination`);

      // Find the winner based on avg_view_percentage
      const sorted = [...completedVariations].sort((a: any, b: any) =>
        (b.youtube_avg_view_percentage || 0) - (a.youtube_avg_view_percentage || 0)
      );

      const best = sorted[0];
      const secondBest = sorted[1];

      const diff = Math.abs(
        (best.youtube_avg_view_percentage || 0) - (secondBest.youtube_avg_view_percentage || 0)
      );

      let winnerVariationId = null;
      let status = 'completed';

      if (diff < TIE_THRESHOLD) {
        // Too close to call
        console.log(`[sync-youtube-analytics] Test ${test.id} is inconclusive (diff: ${diff.toFixed(2)}%)`);
        status = 'completed'; // Still mark as completed, but no winner
      } else {
        // We have a winner!
        winnerVariationId = best.id;
        console.log(`[sync-youtube-analytics] Test ${test.id} winner: ${best.hook_style} (${best.youtube_avg_view_percentage}%)`);

        // Mark winner in variations table
        await supabase
          .from('hook_variations')
          .update({ is_winner: true })
          .eq('id', best.id);
      }

      // Update test status
      await supabase
        .from('hook_ab_tests')
        .update({
          status: status,
          winner_variation_id: winnerVariationId,
          completed_at: new Date().toISOString(),
        })
        .eq('id', test.id);
    }
  }
}

async function syncHookVariations(supabase: any) {
  console.log('[sync-youtube-analytics] Syncing hook variation analytics...');

  // Get all hook variations that have video_performance_id
  const { data: variations, error: varsError } = await supabase
    .from('hook_variations')
    .select('*, video_performance(*)')
    .not('video_performance_id', 'is', null);

  if (varsError || !variations) {
    console.error('[sync-youtube-analytics] Error fetching hook variations:', varsError);
    return;
  }

  for (const variation of variations) {
    if (!variation.video_performance) continue;

    const perf = variation.video_performance;

    // Update variation with latest performance data
    await supabase
      .from('hook_variations')
      .update({
        youtube_views: perf.youtube_views || 0,
        youtube_avg_view_percentage: perf.youtube_avg_view_percentage,
        status: perf.youtube_video_id ? 'completed' : variation.status,
        updated_at: new Date().toISOString(),
      })
      .eq('id', variation.id);
  }
}

// Sync lab video performance
async function syncLabVideos(supabase: any, accessTokenMap: Map<string, string>) {
  console.log('[sync-youtube-analytics] Syncing lab video analytics...');

  // Get all lab videos with youtube_video_id that need syncing
  const { data: labVideos, error: labError } = await supabase
    .from('lab_videos')
    .select('*, youtube_accounts(*)')
    .not('youtube_video_id', 'is', null)
    .in('status', ['pending', 'posted']);

  if (labError || !labVideos || labVideos.length === 0) {
    return;
  }

  console.log(`[sync-youtube-analytics] Found ${labVideos.length} lab videos to sync`);

  for (const labVideo of labVideos) {
    if (!labVideo.youtube_accounts) continue;

    const account = labVideo.youtube_accounts;
    let accessToken: string | null = accessTokenMap.get(account.id) || null;

    if (!accessToken) {
      accessToken = await getValidAccessToken(supabase, account);
      if (accessToken) {
        accessTokenMap.set(account.id, accessToken);
      }
    }

    if (!accessToken) continue;

    try {
      const analytics = await fetchVideoAnalytics(accessToken, labVideo.youtube_video_id, account.channel_id);

      if (analytics) {
        await supabase
          .from('lab_videos')
          .update({
            youtube_views: analytics.youtube_views,
            youtube_retention: analytics.youtube_avg_view_percentage,
            youtube_ctr: analytics.youtube_click_through_rate,
            status: 'synced',
          })
          .eq('id', labVideo.id);

        console.log(`[sync-youtube-analytics] Lab video ${labVideo.id}: ${analytics.youtube_views} views, ${analytics.youtube_avg_view_percentage}% retention`);
      }
    } catch (e) {
      console.error(`[sync-youtube-analytics] Error syncing lab video ${labVideo.id}:`, e);
    }
  }
}

// Check and conclude lab experiments
async function checkLabExperimentCompletion(supabase: any) {
  console.log('[sync-youtube-analytics] Checking lab experiment completion...');

  // Get running experiments older than 48 hours
  const cutoffDate = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

  const { data: experiments, error: expError } = await supabase
    .from('lab_experiments')
    .select('*, lab_videos(*)')
    .eq('status', 'running')
    .lt('created_at', cutoffDate);

  if (expError || !experiments) {
    console.error('[sync-youtube-analytics] Error fetching lab experiments:', expError);
    return;
  }

  for (const experiment of experiments) {
    const videos = experiment.lab_videos || [];
    const syncedVideos = videos.filter((v: any) => v.status === 'synced' && v.youtube_retention !== null);

    // Check if we have enough data (all videos synced or 7 days passed)
    const isOldEnough = Date.now() - new Date(experiment.created_at).getTime() > 7 * 24 * 60 * 60 * 1000;
    const allSynced = syncedVideos.length === videos.length && videos.length > 0;
    const totalViews = syncedVideos.reduce((sum: number, v: any) => sum + (v.youtube_views || 0), 0);

    if ((allSynced || isOldEnough) && syncedVideos.length > 0 && totalViews >= 100) {
      console.log(`[sync-youtube-analytics] Concluding experiment ${experiment.id}`);

      // Find winner
      const sorted = syncedVideos.sort((a: any, b: any) =>
        (b.youtube_retention || 0) - (a.youtube_retention || 0)
      );

      const winner = sorted[0];
      const avgRetention = syncedVideos.reduce((sum: number, v: any) => sum + (v.youtube_retention || 0), 0) / syncedVideos.length;
      const avgCtr = syncedVideos.reduce((sum: number, v: any) => sum + (v.youtube_ctr || 0), 0) / syncedVideos.length;

      // Update experiment
      await supabase
        .from('lab_experiments')
        .update({
          status: 'completed',
          winner_video_id: winner.id,
          avg_retention: avgRetention,
          avg_ctr: avgCtr,
          completed_at: new Date().toISOString(),
          learnings: {
            winner_variables: winner.variables,
            winner_retention: winner.youtube_retention,
            total_videos: syncedVideos.length,
          },
        })
        .eq('id', experiment.id);

      // Update brain with learnings
      if (experiment.gamemode_id) {
        try {
          await supabase.functions.invoke('update-project-brain', {
            body: {
              gamemodeId: experiment.gamemode_id,
              updateType: 'lab_experiment',
              data: {
                hypothesis: experiment.hypothesis,
                winner_variables: winner.variables,
                winner_retention: winner.youtube_retention,
                all_results: syncedVideos.map((v: any) => ({
                  variables: v.variables,
                  retention: v.youtube_retention,
                })),
              },
            },
          });
          console.log(`[sync-youtube-analytics] Updated brain for gamemode ${experiment.gamemode_id}`);
        } catch (e) {
          console.error('[sync-youtube-analytics] Failed to update brain:', e);
        }
      }
    }
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { project_id, video_performance_id } = await req.json();

    console.log('[sync-youtube-analytics] Starting sync...');

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Build query - either sync specific record or all records for a project
    let query = supabase
      .from('video_performance')
      .select('*')
      .not('youtube_video_id', 'is', null);

    if (video_performance_id) {
      query = query.eq('id', video_performance_id);
    } else if (project_id) {
      query = query.eq('project_id', project_id);
    }

    const { data: performanceRecords, error: fetchError } = await query;

    if (fetchError) {
      console.error('[sync-youtube-analytics] Error fetching records:', fetchError);
      return new Response(JSON.stringify({ error: 'Failed to fetch records' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (!performanceRecords || performanceRecords.length === 0) {
      console.log('[sync-youtube-analytics] No records to sync');

      // Still check A/B test winners even if no records to sync
      await syncHookVariations(supabase);
      await checkAndUpdateABTestWinners(supabase);

      return new Response(JSON.stringify({ synced: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log(`[sync-youtube-analytics] Syncing ${performanceRecords.length} records`);

    let synced = 0;
    let failed = 0;

    // Group by account to minimize token refreshes
    const accountMap = new Map<string, { account: YouTubeAccount; records: any[] }>();

    // Group by project to fetch accounts per project
    const projectIds = [...new Set(performanceRecords.map(r => r.project_id).filter(Boolean))];

    // Fetch all accounts for these projects
    const { data: allAccounts } = await supabase
      .from('youtube_accounts')
      .select('*')
      .in('project_id', projectIds)
      .eq('enabled', true);

    const accountsByProject = new Map<string, any[]>();
    for (const account of (allAccounts || [])) {
      if (!accountsByProject.has(account.project_id)) {
        accountsByProject.set(account.project_id, []);
      }
      accountsByProject.get(account.project_id)!.push(account);
    }

    for (const record of performanceRecords) {
      const projectAccounts = accountsByProject.get(record.project_id) || [];
      const account = projectAccounts[0]; // Use first enabled account

      if (!account) {
        console.log(`[sync-youtube-analytics] No account found for record ${record.id}`);
        failed++;
        continue;
      }

      if (!accountMap.has(account.id)) {
        accountMap.set(account.id, { account, records: [] });
      }
      accountMap.get(account.id)!.records.push(record);
    }

    for (const [accountId, { account, records }] of accountMap) {
      const accessToken = await getValidAccessToken(supabase, account);

      if (!accessToken) {
        console.error(`[sync-youtube-analytics] Failed to get token for account ${accountId}`);
        failed += records.length;
        continue;
      }

      for (const record of records) {
        try {
          const analytics = await fetchVideoAnalytics(accessToken, record.youtube_video_id, account.channel_id);

          if (analytics) {
            // Full update with expanded metrics
            const { error: updateError } = await supabase
              .from('video_performance')
              .update({
                youtube_views: analytics.youtube_views,
                youtube_likes: analytics.youtube_likes,
                youtube_comments: analytics.youtube_comments,
                youtube_dislikes: analytics.youtube_dislikes,
                youtube_favorites: analytics.youtube_favorites,
                youtube_shares: analytics.youtube_shares,
                youtube_subscribers_gained: analytics.youtube_subscribers_gained,
                youtube_subscribers_lost: analytics.youtube_subscribers_lost,
                youtube_impressions: analytics.youtube_impressions,
                youtube_impressions_ctr: analytics.youtube_impressions_ctr,
                youtube_watch_time_seconds: analytics.youtube_watch_time_seconds,
                youtube_avg_view_duration_seconds: analytics.youtube_avg_view_duration_seconds,
                youtube_avg_view_percentage: analytics.youtube_avg_view_percentage,
                youtube_click_through_rate: analytics.youtube_click_through_rate,
                youtube_engaged_views: analytics.youtube_engaged_views,
                youtube_completed_views: analytics.youtube_completed_views,
                youtube_peak_hour: analytics.youtube_peak_hour,
                youtube_traffic_sources: analytics.youtube_traffic_sources,
                performance_stage: analytics.performance_stage,
                // Ratios
                ratio_like_to_view: analytics.ratio_like_to_view,
                ratio_comment_to_view: analytics.ratio_comment_to_view,
                ratio_favorite_to_view: analytics.ratio_favorite_to_view,
                ratio_comment_to_like: analytics.ratio_comment_to_like,
                ratio_favorite_to_like: analytics.ratio_favorite_to_like,
                ratio_like_to_favorite: analytics.ratio_like_to_favorite,
                ratio_engaged_to_view: analytics.ratio_engaged_to_view,
                ratio_like_to_engaged: analytics.ratio_like_to_engaged,
                ratio_comment_to_engaged: analytics.ratio_comment_to_engaged,
                ratio_favorite_to_engaged: analytics.ratio_favorite_to_engaged,
                // Metadata
                video_title: analytics.video_title || record.video_title,
                video_description: analytics.video_description || record.video_description,
                published_at: analytics.published_at || record.published_at,
                updated_at: new Date().toISOString(),
              })
              .eq('id', record.id);

            if (updateError) {
              console.error(`[sync-youtube-analytics] Failed to update record ${record.id}:`, updateError);
              failed++;
            } else {
              console.log(`[sync-youtube-analytics] Synced ${record.youtube_video_id}: ${analytics.youtube_views} views, stage=${analytics.performance_stage}`);
              synced++;

              // Insert time-series snapshot for growth tracking
              try {
                // Get previous snapshot to compute deltas
                const { data: prevSnap } = await supabase
                  .from('video_analytics_snapshots')
                  .select('views, likes, comments, subscribers_gained, engaged_views, watch_time_seconds')
                  .eq('video_performance_id', record.id)
                  .order('snapshot_at', { ascending: false })
                  .limit(1)
                  .single();

                const deltaViews = analytics.youtube_views - (prevSnap?.views || 0);
                const deltaLikes = analytics.youtube_likes - (prevSnap?.likes || 0);
                const deltaComments = analytics.youtube_comments - (prevSnap?.comments || 0);
                const deltaSubsGained = analytics.youtube_subscribers_gained - (prevSnap?.subscribers_gained || 0);
                const deltaEngaged = analytics.youtube_engaged_views - (prevSnap?.engaged_views || 0);
                const deltaWatchTime = (analytics.youtube_watch_time_seconds || 0) - (prevSnap?.watch_time_seconds || 0);

                await supabase
                  .from('video_analytics_snapshots')
                  .insert({
                    video_performance_id: record.id,
                    hours_since_publish: analytics.hours_since_publish,
                    performance_stage: analytics.performance_stage,
                    views: analytics.youtube_views,
                    likes: analytics.youtube_likes,
                    comments: analytics.youtube_comments,
                    shares: analytics.youtube_shares,
                    dislikes: analytics.youtube_dislikes,
                    favorites: analytics.youtube_favorites,
                    subscribers_gained: analytics.youtube_subscribers_gained,
                    subscribers_lost: analytics.youtube_subscribers_lost,
                    impressions: analytics.youtube_impressions,
                    watch_time_seconds: analytics.youtube_watch_time_seconds || 0,
                    avg_view_duration_seconds: analytics.youtube_avg_view_duration_seconds || 0,
                    avg_view_percentage: analytics.youtube_avg_view_percentage,
                    impressions_ctr: analytics.youtube_impressions_ctr,
                    engaged_views: analytics.youtube_engaged_views,
                    completed_views: analytics.youtube_completed_views,
                    ratio_like_to_view: analytics.ratio_like_to_view,
                    ratio_comment_to_view: analytics.ratio_comment_to_view,
                    ratio_favorite_to_view: analytics.ratio_favorite_to_view,
                    ratio_comment_to_like: analytics.ratio_comment_to_like,
                    ratio_favorite_to_like: analytics.ratio_favorite_to_like,
                    ratio_engaged_to_view: analytics.ratio_engaged_to_view,
                    delta_views: Math.max(deltaViews, 0),
                    delta_likes: Math.max(deltaLikes, 0),
                    delta_comments: Math.max(deltaComments, 0),
                    delta_subscribers_gained: Math.max(deltaSubsGained, 0),
                    delta_engaged_views: Math.max(deltaEngaged, 0),
                    delta_watch_time_seconds: Math.max(deltaWatchTime, 0),
                  });
              } catch (snapErr) {
                console.error('[sync-youtube-analytics] Snapshot insert error:', snapErr);
              }

              // RCCLO: Compute retention score and update cognitive features
              if (analytics.youtube_avg_view_percentage != null) {
                try {
                  const ret = estimateRetentionPercentiles(analytics.youtube_avg_view_percentage);
                  const rewatchRate = 0;
                  const retScore = computeRetentionScore(ret.r25, ret.r50, ret.r75, ret.completion, rewatchRate);

                  await supabase
                    .from('video_performance')
                    .update({ retention_score: parseFloat(retScore.toFixed(4)) })
                    .eq('id', record.id);

                  await supabase
                    .from('video_cognitive_features')
                    .update({
                      retention_25_pct: parseFloat(ret.r25.toFixed(4)),
                      retention_50_pct: parseFloat(ret.r50.toFixed(4)),
                      retention_75_pct: parseFloat(ret.r75.toFixed(4)),
                      completion_rate: parseFloat(ret.completion.toFixed(4)),
                      rewatch_rate: rewatchRate,
                      retention_score: parseFloat(retScore.toFixed(4)),
                    })
                    .eq('video_performance_id', record.id);

                  console.log(`[sync-youtube-analytics] RetentionScore ${record.id}: ${retScore.toFixed(4)}`);
                } catch (retErr) {
                  console.error('[sync-youtube-analytics] Retention calc error:', retErr);
                }
              }
            }
          } else {
            failed++;
          }
        } catch (e) {
          console.error(`[sync-youtube-analytics] Error syncing ${record.id}:`, e);
          failed++;
        }
      }
    }

    // Build access token map for reuse
    const accessTokenMap = new Map<string, string>();
    for (const [accountId, { account }] of accountMap) {
      const token = await getValidAccessToken(supabase, account);
      if (token) accessTokenMap.set(accountId, token);
    }

    // Sync hook variations with their video_performance data
    await syncHookVariations(supabase);

    // Sync lab video analytics
    await syncLabVideos(supabase, accessTokenMap);

    // Check and update A/B test winners
    await checkAndUpdateABTestWinners(supabase);

    // Check and conclude lab experiments
    await checkLabExperimentCompletion(supabase);

    console.log(`[sync-youtube-analytics] Done. Synced: ${synced}, Failed: ${failed}`);

    return new Response(JSON.stringify({ synced, failed }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[sync-youtube-analytics] Error:', error);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
