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
  privacy: string;
  category_id: string;
  tags: string[];
  made_for_kids: boolean;
  custom_title?: string;
  custom_description?: string;
  enabled: boolean;
  // Title rotation fields
  title_pool?: string[];
  title_rotation_mode?: string;
  title_rotation_index?: number;
  // Warmup fields
  warmup_status?: string;
  warmup_started_at?: string;
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
    console.error('[youtube-upload] Token refresh failed:', await response.text());
    return null;
  }

  return await response.json();
}

async function uploadToAccount(
  supabase: any,
  account: YouTubeAccount,
  videoBlob: Blob,
  title: string,
  description: string
): Promise<{ success: boolean; video_id?: string; error?: string }> {
  try {
    // Check warmup status
    if (account.warmup_status === 'new' || account.warmup_status === 'warming') {
      const warmupStartedAt = account.warmup_started_at ? new Date(account.warmup_started_at) : new Date();
      const threeDaysAgo = new Date();
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

      if (warmupStartedAt > threeDaysAgo) {
        const remainingHours = Math.ceil((warmupStartedAt.getTime() + (3 * 24 * 60 * 60 * 1000) - Date.now()) / (1000 * 60 * 60));
        console.log(`[youtube-upload] Blocking upload: ${account.channel_name} is in warmup (${remainingHours}h remaining)`);
        return { success: false, error: `Account is in warmup period. Posting enabled in ~${remainingHours} hours.` };
      } else {
        // Auto-advance to 'warmed' if 3 days passed
        console.log(`[youtube-upload] Account ${account.channel_name} completed warmup, updating status...`);
        await supabase
          .from('youtube_accounts')
          .update({ warmup_status: 'warmed' })
          .eq('id', account.id);
      }
    }

    // Check if token needs refresh
    let accessToken = account.access_token;
    const tokenExpiresAt = new Date(account.token_expires_at);

    if (tokenExpiresAt <= new Date()) {
      console.log(`[youtube-upload] Token expired for ${account.channel_name}, refreshing...`);
      const newTokens = await refreshAccessToken(account.refresh_token);

      if (!newTokens) {
        return { success: false, error: 'Failed to refresh YouTube token' };
      }

      accessToken = newTokens.access_token;
      const newExpiresAt = new Date(Date.now() + (newTokens.expires_in * 1000)).toISOString();

      // Update stored tokens
      await supabase
        .from('youtube_accounts')
        .update({
          access_token: accessToken,
          token_expires_at: newExpiresAt,
        })
        .eq('id', account.id);

      console.log('[youtube-upload] Token refreshed successfully');
    }

    // Get title for this upload - check title pool rotation first
    let videoTitle = (account.custom_title || title).substring(0, 100);

    // Title rotation: if account has a title pool, rotate through it
    if (account.title_pool && account.title_pool.length > 0) {
      const pool = account.title_pool;

      if (account.title_rotation_mode === 'random') {
        // Random pick from pool
        videoTitle = pool[Math.floor(Math.random() * pool.length)].substring(0, 100);
        console.log(`[youtube-upload] Title rotation (random): Using "${videoTitle}" from pool of ${pool.length} titles`);
      } else {
        // Sequential rotation (default)
        const currentIndex = account.title_rotation_index || 0;
        videoTitle = pool[currentIndex % pool.length].substring(0, 100);

        // Update index for next upload
        const nextIndex = (currentIndex + 1) % pool.length;
        await supabase
          .from('youtube_accounts')
          .update({ title_rotation_index: nextIndex })
          .eq('id', account.id);

        console.log(`[youtube-upload] Title rotation (sequential): Using "${videoTitle}" (index ${currentIndex}) from pool of ${pool.length} titles. Next: ${nextIndex}`);
      }
    }

    const videoDescription = (account.custom_description || description).substring(0, 5000);

    const metadata = {
      snippet: {
        title: videoTitle,
        description: videoDescription,
        tags: account.tags || [],
        categoryId: account.category_id || '20',
      },
      status: {
        privacyStatus: account.privacy || 'private',
        selfDeclaredMadeForKids: account.made_for_kids || false,
      },
    };

    console.log(`[youtube-upload] Uploading to ${account.channel_name}...`);

    // Initialize resumable upload
    const initResponse = await fetch(
      'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'X-Upload-Content-Length': videoBlob.size.toString(),
          'X-Upload-Content-Type': 'video/mp4',
        },
        body: JSON.stringify(metadata),
      }
    );

    if (!initResponse.ok) {
      const errorText = await initResponse.text();
      console.error('[youtube-upload] Init failed:', errorText);
      return { success: false, error: `Upload init failed: ${errorText}` };
    }

    const uploadUrl = initResponse.headers.get('Location');
    if (!uploadUrl) {
      return { success: false, error: 'No upload URL returned from YouTube' };
    }

    // Upload video data
    const uploadResponse = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Length': videoBlob.size.toString(),
      },
      body: videoBlob,
    });

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      console.error('[youtube-upload] Upload failed:', errorText);
      return { success: false, error: `Upload failed: ${errorText}` };
    }

    const uploadResult = await uploadResponse.json();
    console.log(`[youtube-upload] Success! Video ID: ${uploadResult.id}`);

    return { success: true, video_id: uploadResult.id };

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[youtube-upload] Error uploading to ${account.channel_name}:`, error);
    return { success: false, error: message };
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const {
      project_id,
      video_url,
      title,
      description,
      account_id,
      // For batch processing: exclude these account IDs to ensure unique distribution
      exclude_account_ids = [],
      // Analytics data for video_performance
      hook_text,
      editing_style,
      full_transcript,
    } = await req.json();

    if (!project_id || !video_url) {
      return new Response(JSON.stringify({ error: 'project_id and video_url are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log(`[youtube-upload] Starting upload for project ${project_id}`);
    if (exclude_account_ids.length > 0) {
      console.log(`[youtube-upload] Excluding accounts: ${exclude_account_ids.join(', ')}`);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Get project info
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('title, description, youtube_post_delay_minutes, gamemode_id, user_id, youtube_settings')
      .eq('id', project_id)
      .single();

    if (projectError || !project) {
      console.error('[youtube-upload] Project not found:', projectError);
      return new Response(JSON.stringify({ error: 'Project not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Determine Title and Description to use
    // Priority:
    // 1. Account-specific override (handled in uploadToAccount)
    // 2. Request payload (title/description)
    // 3. Project Global Metadata Pool (Rotated)
    // 4. Project Default Title/Description

    let baseTitle = title || project.title || 'Untitled Video';
    let baseDescription = description || project.description || '';

    // Check for Global Metadata Rotation in project settings
    const youtubeSettings = project.youtube_settings as any;
    if (youtubeSettings?.metadata_pool?.items?.length > 0) {
      const pool = youtubeSettings.metadata_pool.items;
      const mode = youtubeSettings.metadata_pool.mode || 'random';

      let selectedItem;
      if (mode === 'random') {
        const randomIndex = Math.floor(Math.random() * pool.length);
        selectedItem = pool[randomIndex];
        console.log(`[youtube-upload] Global Metadata Rotation (Random): Selected item ${randomIndex + 1}/${pool.length}`);
      } else {
        // Sequential - use a counter if we had one, but for now random is safer for distributed systems without state
        // Or we could use the current hour/minute to deterministically pick one
        const index = Math.floor(Date.now() / 1000) % pool.length;
        selectedItem = pool[index];
        console.log(`[youtube-upload] Global Metadata Rotation (Time-based): Selected item ${index + 1}/${pool.length}`);
      }

      if (selectedItem) {
        if (selectedItem.title) baseTitle = selectedItem.title;
        if (selectedItem.description) baseDescription = selectedItem.description;
      }
    }

    // If specific account_id provided, upload to that account directly
    if (account_id) {
      const { data: account, error: accountError } = await supabase
        .from('youtube_accounts')
        .select('*')
        .eq('id', account_id)
        .single();

      if (accountError || !account) {
        return new Response(JSON.stringify({ error: 'YouTube account not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Download video
      console.log('[youtube-upload] Downloading video...');
      const videoResponse = await fetch(video_url);
      if (!videoResponse.ok) {
        throw new Error(`Failed to download video: ${videoResponse.statusText}`);
      }
      const videoBlob = await videoResponse.blob();
      console.log(`[youtube-upload] Video downloaded: ${(videoBlob.size / 1024 / 1024).toFixed(2)} MB`);

      const result = await uploadToAccount(supabase, account, videoBlob, baseTitle, baseDescription);

      if (result.success) {
        return new Response(JSON.stringify({
          success: true,
          video_id: result.video_id,
          video_url: `https://www.youtube.com/watch?v=${result.video_id}`,
          channel_id: account.channel_id,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      } else {
        return new Response(JSON.stringify({ error: result.error }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // Multi-account distribution: pick an enabled account that hasn't been used yet
    const { data: allAccounts, error: accountsError } = await supabase
      .from('youtube_accounts')
      .select('*')
      .eq('project_id', project_id)
      .eq('enabled', true);

    if (accountsError) {
      console.error('[youtube-upload] Error fetching accounts:', accountsError);
      return new Response(JSON.stringify({ error: 'Failed to fetch YouTube accounts' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (!allAccounts || allAccounts.length === 0) {
      console.log('[youtube-upload] No enabled YouTube accounts found');
      return new Response(JSON.stringify({ error: 'No enabled YouTube accounts' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Filter out excluded accounts (for batch processing - ensures unique distribution)
    const excludeSet = new Set(exclude_account_ids as string[]);
    const availableAccounts = allAccounts.filter(a => !excludeSet.has(a.id));

    // If all accounts are excluded, fall back to all accounts (round-robin reset)
    const accounts = availableAccounts.length > 0 ? availableAccounts : allAccounts;
    console.log(`[youtube-upload] Available accounts after exclusions: ${accounts.length} of ${allAccounts.length}`);

    // Check the post queue for scheduling - PER ACCOUNT cooldown
    const delayMinutes = project.youtube_post_delay_minutes || 30;
    const delayMs = delayMinutes * 60 * 1000;
    const now = new Date();

    // Get the latest scheduled/completed post for EACH account (not just project-wide)
    const { data: accountLastPosts } = await supabase
      .from('youtube_post_queue')
      .select('account_id, scheduled_for, posted_at')
      .eq('project_id', project_id)
      .in('status', ['pending', 'processing', 'completed'])
      .order('scheduled_for', { ascending: false });

    // Build a map of each account's last post time (scheduled or posted)
    const accountCooldowns = new Map<string, Date>();
    if (accountLastPosts) {
      for (const post of accountLastPosts) {
        if (!accountCooldowns.has(post.account_id)) {
          // Use the later of scheduled_for or posted_at
          const postTime = post.posted_at
            ? new Date(Math.max(new Date(post.scheduled_for).getTime(), new Date(post.posted_at).getTime()))
            : new Date(post.scheduled_for);
          accountCooldowns.set(post.account_id, postTime);
        }
      }
    }

    // Calculate when each account becomes available (last post + delay)
    interface AccountAvailability {
      account: typeof accounts[0];
      availableAt: Date;
    }

    const accountAvailabilities: AccountAvailability[] = accounts.map(account => {
      const lastPostTime = accountCooldowns.get(account.id);
      const availableAt = lastPostTime
        ? new Date(lastPostTime.getTime() + delayMs)
        : now; // No previous posts = available immediately
      return { account, availableAt };
    });

    // Sort by availability (soonest first)
    accountAvailabilities.sort((a, b) => a.availableAt.getTime() - b.availableAt.getTime());

    // Pick the account that's available soonest
    const selected = accountAvailabilities[0];
    const selectedAccount = selected.account;

    // Schedule for when this specific account is available (or now if already available)
    const scheduledFor = selected.availableAt > now ? selected.availableAt : now;

    console.log(`[youtube-upload] Account cooldowns:`,
      accounts.map(a => ({
        name: a.channel_name,
        lastPost: accountCooldowns.get(a.id)?.toISOString() || 'never',
        availableAt: accountAvailabilities.find(av => av.account.id === a.id)?.availableAt.toISOString()
      }))
    );
    console.log(`[youtube-upload] Selected account: ${selectedAccount.channel_name} (${selectedAccount.id}), available at: ${scheduledFor.toISOString()}`)

    // If scheduled for now (within 1 minute), upload immediately
    if (scheduledFor <= new Date(now.getTime() + 60000)) {
      // Download and upload immediately
      console.log('[youtube-upload] Uploading immediately...');

      const videoResponse = await fetch(video_url);
      if (!videoResponse.ok) {
        throw new Error(`Failed to download video: ${videoResponse.statusText}`);
      }
      const videoBlob = await videoResponse.blob();
      console.log(`[youtube-upload] Video downloaded: ${(videoBlob.size / 1024 / 1024).toFixed(2)} MB`);

      const videoTitle = baseTitle;
      const videoDescription = baseDescription;

      const result = await uploadToAccount(supabase, selectedAccount, videoBlob, videoTitle, videoDescription);

      // Record in queue (as completed)
      await supabase
        .from('youtube_post_queue')
        .insert({
          project_id,
          account_id: selectedAccount.id,
          video_url,
          title: videoTitle,
          description: videoDescription,
          status: result.success ? 'completed' : 'failed',
          scheduled_for: now.toISOString(),
          posted_at: result.success ? now.toISOString() : null,
          youtube_video_id: result.video_id || null,
          error_message: result.error || null,
        });

      if (result.success) {
        // Create video_performance record for analytics tracking
        if (hook_text || editing_style) {
          // Extract CTA from the last sentence of the transcript
          let ctaText = '';
          if (full_transcript) {
            const sentences = full_transcript.split(/[.!?]+/).filter((s: string) => s.trim().length > 0);
            if (sentences.length > 0) {
              ctaText = sentences[sentences.length - 1].trim();
            }
          }

          const { error: perfError } = await supabase
            .from('video_performance')
            .insert({
              user_id: project.user_id,
              project_id,
              gamemode_id: project.gamemode_id || null,
              youtube_video_id: result.video_id,
              hook_text: hook_text || '',
              cta_text: ctaText,
              editing_style_name: editing_style || 'static',
              video_title: baseTitle,
              video_description: baseDescription,
              published_at: new Date().toISOString(),
            });

          if (perfError) {
            console.error('[youtube-upload] Failed to create video_performance record:', perfError);
          } else {
            console.log('[youtube-upload] Created video_performance record for analytics');
          }
        }

        return new Response(JSON.stringify({
          success: true,
          video_id: result.video_id,
          video_url: `https://www.youtube.com/watch?v=${result.video_id}`,
          account_id: selectedAccount.id, // Include account_id for batch tracking
          channel_id: selectedAccount.channel_id,
          channel_name: selectedAccount.channel_name,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      } else {
        return new Response(JSON.stringify({ error: result.error }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // Schedule for later
    console.log(`[youtube-upload] Scheduling for ${scheduledFor.toISOString()} to ${selectedAccount.channel_name}`);

    const { data: queueEntry, error: queueError } = await supabase
      .from('youtube_post_queue')
      .insert({
        project_id,
        account_id: selectedAccount.id,
        video_url,
        title: baseTitle,
        description: baseDescription,
        status: 'pending',
        scheduled_for: scheduledFor.toISOString(),
      })
      .select()
      .single();

    if (queueError) {
      console.error('[youtube-upload] Failed to queue post:', queueError);
      return new Response(JSON.stringify({ error: 'Failed to queue post' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({
      success: true,
      queued: true,
      queue_id: queueEntry.id,
      account_id: selectedAccount.id, // Include account_id for batch tracking
      scheduled_for: scheduledFor.toISOString(),
      channel_name: selectedAccount.channel_name,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[youtube-upload] Error:', error);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
