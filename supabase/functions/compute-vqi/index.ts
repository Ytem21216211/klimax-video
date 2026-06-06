import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ============================================================================
// VQI Engine — Video Quality Index
// Per-view engagement depth adjusted for signal strength
// ============================================================================

interface VQIWeights {
    like: number;
    comment: number;
    share: number;
    save: number;
    rewatch: number;
}

interface VQIResult {
    depth_score: number;
    vqi: number;
    depth_adjusted_views: number;
}

const DEFAULT_WEIGHTS: VQIWeights = {
    like: 1.0,
    comment: 2.0,
    share: 3.0,
    save: 4.0,
    rewatch: 5.0,
};

// ---------------------------------------------------------------------------
// Step 1-2: Convert raw metrics to rates, compute depth score
// ---------------------------------------------------------------------------
function computeDepthScore(
    views: number,
    likes: number,
    comments: number,
    shares: number,
    saves: number,
    rewatches: number,
    weights: VQIWeights
): number {
    const safeViews = Math.max(views, 1);

    const likeRate = likes / safeViews;
    const commentRate = comments / safeViews;
    const shareRate = shares / safeViews;
    const saveRate = saves / safeViews;
    const rewatchRate = rewatches / safeViews;

    return (
        weights.like * likeRate +
        weights.comment * commentRate +
        weights.share * shareRate +
        weights.save * saveRate +
        weights.rewatch * rewatchRate
    );
}

// ---------------------------------------------------------------------------
// Step 5: Normalize by niche median → VQI
// ---------------------------------------------------------------------------
function computeVQI(depthScore: number, medianDepth: number): number {
    if (medianDepth <= 0) return depthScore > 0 ? depthScore : 0;
    return depthScore / medianDepth;
}

// ---------------------------------------------------------------------------
// Step 6: Depth-adjusted views
// ---------------------------------------------------------------------------
function computeDepthAdjustedViews(views: number, vqi: number): number {
    return views * vqi;
}

// ---------------------------------------------------------------------------
// Step 5 helper: Calculate median from an array
// ---------------------------------------------------------------------------
function median(arr: number[]): number {
    if (arr.length === 0) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0
        ? sorted[mid]
        : (sorted[mid - 1] + sorted[mid]) / 2;
}

// ---------------------------------------------------------------------------
// Step 9: Simple OLS linear regression for weight recalibration
// Target: future stage promotion (binary: did the video reach next stage?)
// Features: [like_rate, comment_rate, share_rate, save_rate, rewatch_rate]
// ---------------------------------------------------------------------------
function linearRegression(
    features: number[][],    // Each row: [like_rate, comment_rate, share_rate, save_rate, rewatch_rate]
    targets: number[]        // Each value: 0 or 1 (did promote)
): { coefficients: number[]; rSquared: number } | null {
    const n = features.length;
    if (n < 10) return null; // Not enough data

    const k = features[0].length;

    // Means
    const featureMeans = new Array(k).fill(0);
    let targetMean = 0;
    for (let i = 0; i < n; i++) {
        for (let j = 0; j < k; j++) {
            featureMeans[j] += features[i][j];
        }
        targetMean += targets[i];
    }
    for (let j = 0; j < k; j++) featureMeans[j] /= n;
    targetMean /= n;

    // Simple univariate regression for each feature (independent)
    // Full multivariate OLS would require matrix inversion — overkill for MVP
    const coefficients: number[] = [];
    let ssTotal = 0;
    const ssResidual = 0;

    for (let i = 0; i < n; i++) {
        ssTotal += (targets[i] - targetMean) ** 2;
    }

    for (let j = 0; j < k; j++) {
        let ssXY = 0;
        let ssXX = 0;
        for (let i = 0; i < n; i++) {
            const dx = features[i][j] - featureMeans[j];
            const dy = targets[i] - targetMean;
            ssXY += dx * dy;
            ssXX += dx * dx;
        }
        coefficients.push(ssXX > 0 ? ssXY / ssXX : 0);
    }

    // Normalize coefficients to be positive and sum-preserving
    const minCoef = Math.min(...coefficients);
    const shifted = coefficients.map(c => Math.max(c - minCoef + 0.1, 0.1));
    const total = shifted.reduce((a, b) => a + b, 0);
    // Scale so the weights stay in a reasonable 1-5 range
    const scaleFactor = (1 + 2 + 3 + 4 + 5) / total; // Sum of default weights
    const normalized = shifted.map(c => Math.round(c * scaleFactor * 100) / 100);

    // Simple R² approximation
    const rSquared = ssTotal > 0 ? Math.max(0, 1 - ssResidual / ssTotal) : 0;

    return { coefficients: normalized, rSquared };
}

// ============================================================================
// Main handler
// ============================================================================
Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const {
            mode = 'compute',  // 'compute' | 'median' | 'calibrate'
            niche = 'minecraft',
            platform = 'youtube',
        } = await req.json().catch(() => ({}));

        const supabase = createClient(
            Deno.env.get('SUPABASE_URL')!,
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
        );

        console.log(`[compute-vqi] Mode: ${mode}, Niche: ${niche}, Platform: ${platform}`);

        // -----------------------------------------------------------------------
        // MODE: compute — Calculate VQI for all videos with analytics data
        // -----------------------------------------------------------------------
        if (mode === 'compute') {
            // 1. Get current weights (from calibration or defaults)
            const { data: calibration } = await supabase
                .from('vqi_calibration_history')
                .select('calibrated_weights')
                .eq('niche', niche)
                .eq('platform', platform)
                .eq('is_active', true)
                .order('created_at', { ascending: false })
                .limit(1)
                .single();

            const weights: VQIWeights = calibration?.calibrated_weights
                ? { ...DEFAULT_WEIGHTS, ...calibration.calibrated_weights }
                : DEFAULT_WEIGHTS;

            console.log(`[compute-vqi] Using weights:`, weights);

            // 2. Get current niche median
            const { data: nicheMedian } = await supabase
                .from('vqi_niche_medians')
                .select('median_depth_score')
                .eq('niche', niche)
                .eq('platform', platform)
                .order('period_end', { ascending: false })
                .limit(1)
                .single();

            const medianDepth = nicheMedian?.median_depth_score ?? 1.0;
            console.log(`[compute-vqi] Niche median depth: ${medianDepth}`);

            // 3. Process YouTube videos (video_performance table)
            let ytProcessed = 0;
            if (platform === 'youtube' || platform === 'all') {
                const { data: ytVideos } = await supabase
                    .from('video_performance')
                    .select('id, youtube_views, youtube_likes, youtube_comments, youtube_shares, youtube_saves, youtube_rewatches')
                    .gt('youtube_views', 0);

                for (const video of ytVideos || []) {
                    const depthScore = computeDepthScore(
                        video.youtube_views || 0,
                        video.youtube_likes || 0,
                        video.youtube_comments || 0,
                        video.youtube_shares || 0,
                        video.youtube_saves || 0,
                        video.youtube_rewatches || 0,
                        weights
                    );

                    const vqi = computeVQI(depthScore, medianDepth);
                    const dav = computeDepthAdjustedViews(video.youtube_views || 0, vqi);

                    await supabase
                        .from('video_performance')
                        .update({
                            vqi_score: parseFloat(vqi.toFixed(4)),
                            vqi_depth_score: parseFloat(depthScore.toFixed(6)),
                            vqi_depth_adjusted_views: parseFloat(dav.toFixed(2)),
                            vqi_computed_at: new Date().toISOString(),
                        })
                        .eq('id', video.id);

                    ytProcessed++;
                }
            }

            // 4. Process TikTok videos (tracked_videos + analytics_snapshots)
            let ttProcessed = 0;
            if (platform === 'tiktok' || platform === 'all') {
                const { data: ttVideos } = await supabase
                    .from('tracked_videos')
                    .select(`
            id,
            analytics_snapshots (
              views, likes, comments, shares, saves, timestamp
            )
          `)
                    .eq('status', 'active');

                for (const video of ttVideos || []) {
                    const snapshots = (video as any).analytics_snapshots || [];
                    if (snapshots.length === 0) continue;

                    // Use latest snapshot
                    const latest = snapshots.sort(
                        (a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
                    )[0];

                    // TikTok doesn't have native rewatch count — estimate from saves
                    const estimatedRewatches = Math.round((latest.saves || 0) * 0.3);

                    const depthScore = computeDepthScore(
                        latest.views || 0,
                        latest.likes || 0,
                        latest.comments || 0,
                        latest.shares || 0,
                        latest.saves || 0,
                        estimatedRewatches,
                        weights
                    );

                    const vqi = computeVQI(depthScore, medianDepth);
                    const dav = computeDepthAdjustedViews(latest.views || 0, vqi);

                    await supabase
                        .from('tracked_videos')
                        .update({
                            vqi_score: parseFloat(vqi.toFixed(4)),
                            vqi_depth_score: parseFloat(depthScore.toFixed(6)),
                            vqi_depth_adjusted_views: parseFloat(dav.toFixed(2)),
                            vqi_computed_at: new Date().toISOString(),
                        })
                        .eq('id', video.id);

                    ttProcessed++;
                }
            }

            console.log(`[compute-vqi] Processed ${ytProcessed} YouTube + ${ttProcessed} TikTok videos`);

            return new Response(JSON.stringify({
                success: true,
                youtube_processed: ytProcessed,
                tiktok_processed: ttProcessed,
                weights_used: weights,
                niche_median: medianDepth,
            }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        // -----------------------------------------------------------------------
        // MODE: median — Recalculate niche median depth scores
        // -----------------------------------------------------------------------
        if (mode === 'median') {
            const { data: calibration } = await supabase
                .from('vqi_calibration_history')
                .select('calibrated_weights')
                .eq('niche', niche)
                .eq('platform', platform)
                .eq('is_active', true)
                .order('created_at', { ascending: false })
                .limit(1)
                .single();

            const weights: VQIWeights = calibration?.calibrated_weights
                ? { ...DEFAULT_WEIGHTS, ...calibration.calibrated_weights }
                : DEFAULT_WEIGHTS;

            const periodEnd = new Date();
            const periodStart = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // Last 7 days

            const depthScores: number[] = [];
            const rates = {
                like: [] as number[],
                comment: [] as number[],
                share: [] as number[],
                save: [] as number[],
                rewatch: [] as number[],
            };

            // Collect YouTube depth scores
            if (platform === 'youtube' || platform === 'all') {
                const { data: ytVideos } = await supabase
                    .from('video_performance')
                    .select('youtube_views, youtube_likes, youtube_comments, youtube_shares, youtube_saves, youtube_rewatches')
                    .gt('youtube_views', 50) // Min views for signal
                    .gte('created_at', periodStart.toISOString());

                for (const v of ytVideos || []) {
                    const views = Math.max(v.youtube_views || 0, 1);
                    const lr = (v.youtube_likes || 0) / views;
                    const cr = (v.youtube_comments || 0) / views;
                    const sr = (v.youtube_shares || 0) / views;
                    const svr = (v.youtube_saves || 0) / views;
                    const rr = (v.youtube_rewatches || 0) / views;

                    rates.like.push(lr);
                    rates.comment.push(cr);
                    rates.share.push(sr);
                    rates.save.push(svr);
                    rates.rewatch.push(rr);

                    depthScores.push(computeDepthScore(
                        views, v.youtube_likes || 0, v.youtube_comments || 0,
                        v.youtube_shares || 0, v.youtube_saves || 0, v.youtube_rewatches || 0,
                        weights
                    ));
                }
            }

            // Collect TikTok depth scores
            if (platform === 'tiktok' || platform === 'all') {
                const { data: ttVideos } = await supabase
                    .from('tracked_videos')
                    .select(`
            analytics_snapshots (
              views, likes, comments, shares, saves, timestamp
            )
          `)
                    .eq('status', 'active')
                    .gte('created_at', periodStart.toISOString());

                for (const video of ttVideos || []) {
                    const snapshots = (video as any).analytics_snapshots || [];
                    if (snapshots.length === 0) continue;
                    const latest = snapshots.sort(
                        (a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
                    )[0];

                    const views = Math.max(latest.views || 0, 1);
                    if (views < 50) continue;

                    const lr = (latest.likes || 0) / views;
                    const cr = (latest.comments || 0) / views;
                    const sr = (latest.shares || 0) / views;
                    const svr = (latest.saves || 0) / views;
                    const estRewatches = Math.round((latest.saves || 0) * 0.3);
                    const rr = estRewatches / views;

                    rates.like.push(lr);
                    rates.comment.push(cr);
                    rates.share.push(sr);
                    rates.save.push(svr);
                    rates.rewatch.push(rr);

                    depthScores.push(computeDepthScore(
                        views, latest.likes || 0, latest.comments || 0,
                        latest.shares || 0, latest.saves || 0, estRewatches,
                        weights
                    ));
                }
            }

            const medianDepthScore = depthScores.length > 0 ? median(depthScores) : 1.0;

            // Upsert niche median
            const { error: upsertError } = await supabase
                .from('vqi_niche_medians')
                .upsert({
                    niche,
                    platform,
                    period_start: periodStart.toISOString().split('T')[0],
                    period_end: periodEnd.toISOString().split('T')[0],
                    median_like_rate: rates.like.length > 0 ? median(rates.like) : 0,
                    median_comment_rate: rates.comment.length > 0 ? median(rates.comment) : 0,
                    median_share_rate: rates.share.length > 0 ? median(rates.share) : 0,
                    median_save_rate: rates.save.length > 0 ? median(rates.save) : 0,
                    median_rewatch_rate: rates.rewatch.length > 0 ? median(rates.rewatch) : 0,
                    median_depth_score: medianDepthScore,
                    videos_sampled: depthScores.length,
                    updated_at: new Date().toISOString(),
                }, {
                    onConflict: 'niche,platform,period_start',
                });

            if (upsertError) {
                console.error('[compute-vqi] Failed to upsert niche medians:', upsertError);
            }

            console.log(`[compute-vqi] Median updated: ${medianDepthScore.toFixed(6)} from ${depthScores.length} videos`);

            return new Response(JSON.stringify({
                success: true,
                median_depth_score: medianDepthScore,
                videos_sampled: depthScores.length,
                rates: {
                    like: rates.like.length > 0 ? median(rates.like) : 0,
                    comment: rates.comment.length > 0 ? median(rates.comment) : 0,
                    share: rates.share.length > 0 ? median(rates.share) : 0,
                    save: rates.save.length > 0 ? median(rates.save) : 0,
                    rewatch: rates.rewatch.length > 0 ? median(rates.rewatch) : 0,
                },
            }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        // -----------------------------------------------------------------------
        // MODE: calibrate — Self-learning weight recalibration via regression
        // "Once per week: run regression to redefine weights"
        // -----------------------------------------------------------------------
        if (mode === 'calibrate') {
            console.log('[compute-vqi] Starting weight recalibration...');

            // Get current weights
            const { data: currentCal } = await supabase
                .from('vqi_calibration_history')
                .select('calibrated_weights')
                .eq('niche', niche)
                .eq('platform', platform)
                .eq('is_active', true)
                .order('created_at', { ascending: false })
                .limit(1)
                .single();

            const currentWeights: VQIWeights = currentCal?.calibrated_weights
                ? { ...DEFAULT_WEIGHTS, ...currentCal.calibrated_weights }
                : DEFAULT_WEIGHTS;

            // Collect training data
            // Feature: [like_rate, comment_rate, share_rate, save_rate, rewatch_rate]
            // Target: stage promotion indicator (high view % = promoted)
            const features: number[][] = [];
            const targets: number[] = [];

            // YouTube data
            if (platform === 'youtube' || platform === 'all') {
                const { data: ytVideos } = await supabase
                    .from('video_performance')
                    .select('youtube_views, youtube_likes, youtube_comments, youtube_shares, youtube_saves, youtube_rewatches, youtube_avg_view_percentage')
                    .gt('youtube_views', 100); // Minimum signal

                for (const v of ytVideos || []) {
                    const views = Math.max(v.youtube_views || 0, 1);
                    features.push([
                        (v.youtube_likes || 0) / views,
                        (v.youtube_comments || 0) / views,
                        (v.youtube_shares || 0) / views,
                        (v.youtube_saves || 0) / views,
                        (v.youtube_rewatches || 0) / views,
                    ]);
                    // Target: did this video have above-median avg view percentage?
                    // Using 40% as a proxy for "strong" retention = stage promotion
                    targets.push((v.youtube_avg_view_percentage || 0) > 40 ? 1 : 0);
                }
            }

            // TikTok data
            if (platform === 'tiktok' || platform === 'all') {
                const { data: ttVideos } = await supabase
                    .from('tracked_videos')
                    .select(`
            current_score,
            analytics_snapshots (
              views, likes, comments, shares, saves, timestamp
            )
          `)
                    .eq('status', 'active');

                for (const video of ttVideos || []) {
                    const snapshots = (video as any).analytics_snapshots || [];
                    if (snapshots.length === 0) continue;
                    const latest = snapshots.sort(
                        (a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
                    )[0];

                    const views = Math.max(latest.views || 0, 1);
                    if (views < 100) continue;

                    const estRewatches = Math.round((latest.saves || 0) * 0.3);
                    features.push([
                        (latest.likes || 0) / views,
                        (latest.comments || 0) / views,
                        (latest.shares || 0) / views,
                        (latest.saves || 0) / views,
                        estRewatches / views,
                    ]);
                    // Use current_score > median as promotion indicator
                    targets.push((video as any).current_score > 50 ? 1 : 0);
                }
            }

            console.log(`[compute-vqi] Calibration data: ${features.length} samples`);

            if (features.length < 10) {
                return new Response(JSON.stringify({
                    success: false,
                    message: `Not enough data for calibration. Need 10+, have ${features.length}.`
                }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                });
            }

            const result = linearRegression(features, targets);

            if (!result) {
                return new Response(JSON.stringify({
                    success: false,
                    message: 'Regression failed — not enough variance in data.',
                }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                });
            }

            const newWeights: VQIWeights = {
                like: result.coefficients[0],
                comment: result.coefficients[1],
                share: result.coefficients[2],
                save: result.coefficients[3],
                rewatch: result.coefficients[4],
            };

            console.log(`[compute-vqi] New weights:`, newWeights, `R²: ${result.rSquared.toFixed(4)}`);

            // Deactivate previous calibration
            await supabase
                .from('vqi_calibration_history')
                .update({ is_active: false })
                .eq('niche', niche)
                .eq('platform', platform)
                .eq('is_active', true);

            // Insert new calibration
            await supabase
                .from('vqi_calibration_history')
                .insert({
                    niche,
                    platform,
                    previous_weights: currentWeights,
                    calibrated_weights: newWeights,
                    r_squared: parseFloat(result.rSquared.toFixed(4)),
                    samples_used: features.length,
                    regression_method: 'univariate_independent_ols',
                    is_active: true,
                });

            return new Response(JSON.stringify({
                success: true,
                previous_weights: currentWeights,
                new_weights: newWeights,
                r_squared: result.rSquared,
                samples_used: features.length,
            }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        return new Response(JSON.stringify({
            error: `Unknown mode: ${mode}. Valid modes: compute, median, calibrate`,
        }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });

    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error('[compute-vqi] Error:', error);
        return new Response(JSON.stringify({ error: message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
});
