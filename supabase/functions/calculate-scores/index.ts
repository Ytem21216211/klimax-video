import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ============================================================================
// Stage Classification with VQI Integration
// A video with high views but shallow engagement no longer gets "strong" status
// ============================================================================

interface ScoringWeights {
  like: number;
  comment: number;
  share: number;
  save: number;
  full_watch: number;
  rewatch: number;
  profile_click: number;
  follow: number;
}

interface StageThresholds {
  stage_0: number;
  stage_1: number;
  stage_2: number;
  stage_3: number;
  stage_4: number;
}

function determineStage(views: number, vqi: number | null, thresholds: StageThresholds): string {
  // VQI-integrated stage logic:
  // StagePassCondition = (Views > threshold) AND (VQI > 0.9 relative baseline)
  const minVQI = 0.9;
  const effectiveVQI = vqi ?? 1.0; // Default to 1.0 if VQI not yet computed

  // If VQI is below baseline, demote by one stage
  const vqiPenalty = effectiveVQI < minVQI ? 1 : 0;

  let rawStage = 0;
  if (views > thresholds.stage_4) rawStage = 4;
  else if (views > thresholds.stage_3) rawStage = 3;
  else if (views > thresholds.stage_2) rawStage = 2;
  else if (views > thresholds.stage_1) rawStage = 1;

  const adjustedStage = Math.max(0, rawStage - vqiPenalty);
  return `stage_${adjustedStage}`;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // 1. Get Configuration Weights
    const { data: config } = await supabase
      .from('scoring_weights')
      .select('*')
      .eq('niche', 'default')
      .single();

    const weights: ScoringWeights = config?.weights || {};
    const thresholds: StageThresholds = config?.thresholds || {};

    // 2. Fetch Active Videos with VQI data
    const { data: videos, error: videoError } = await supabase
      .from('tracked_videos')
      .select(`
        *,
        analytics_snapshots (
          id, views, likes, comments, shares, saves, timestamp
        )
      `)
      .eq('status', 'active')
      .order('created_at', { ascending: false });

    if (videoError) throw videoError;

    const updates = [];
    const competitorScores = [];

    // 3. Calculate Scores for Each Video (with VQI integration)
    for (const video of videos || []) {
      const snapshots = video.analytics_snapshots || [];
      snapshots.sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      if (snapshots.length === 0) continue;

      const current = snapshots[0];
      const previous = snapshots.length > 1 ? snapshots[1] : null;

      // A. Velocity Calculation
      let velocityMultiplier = 1.0;
      if (previous) {
        const timeDeltaHours = (new Date(current.timestamp).getTime() - new Date(previous.timestamp).getTime()) / (1000 * 60 * 60);
        if (timeDeltaHours > 0) {
          const viewsDelta = current.views - previous.views;
          const eventsPerMinute = (viewsDelta / 60) / timeDeltaHours;
          velocityMultiplier = Math.log10(1 + Math.max(0, eventsPerMinute)) + 1;
        }
      }

      // B. Ratio Efficiency
      const views = Math.max(1, current.views);
      const ratios = {
        likeRate: current.likes / views,
        shareRate: current.shares / views,
        commentRate: current.comments / views,
        saveRate: current.saves / views,
      };

      // C. VQI-Integrated Stage Determination
      const vqiScore = video.vqi_score ?? null;
      const stage = determineStage(views, vqiScore, thresholds);

      // D. Efficiency Multiplier
      let efficiencyMultiplier = 1.0;
      if (ratios.shareRate > 0.01) efficiencyMultiplier += 0.2;
      if (ratios.shareRate > 0.03) efficiencyMultiplier += 0.5;
      if (ratios.likeRate > 0.1) efficiencyMultiplier += 0.1;

      // E. VQI Amplifier — reward high VQI videos
      if (vqiScore !== null && vqiScore > 1.2) {
        efficiencyMultiplier *= 1 + (vqiScore - 1.0) * 0.3; // Up to 30% boost for VQI 2.0
      }

      // F. Absolute Performance Score (APS)
      const rawScore = (
        (current.likes * (weights.like || 1)) +
        (current.comments * (weights.comment || 2.2)) +
        (current.shares * (weights.share || 3.5)) +
        (current.saves * (weights.save || 3.8))
      );

      // APS = (WeightedEngagement / Views) * 1000 * Multipliers
      let aps = (rawScore / views) * 1000 * velocityMultiplier * efficiencyMultiplier;
      aps = Math.min(Math.max(aps, 0), 1000);

      if (video.is_competitor) {
        competitorScores.push(aps);
      }

      updates.push({
        id: video.id,
        current_score: aps,
        metadata: {
          ...(video.metadata || {}),
          stage,
          vqi_score: vqiScore,
          vqi_depth_adjusted_views: video.vqi_depth_adjusted_views,
        },
      });
    }

    // 4. Calculate Relative Scores (RCS)
    const competitorMedian = competitorScores.length > 0
      ? competitorScores.sort((a, b) => a - b)[Math.floor(competitorScores.length / 2)]
      : 50;

    const finalUpdates = updates.map(update => ({
      ...update,
      relative_score: competitorMedian > 0 ? (update.current_score / competitorMedian) : 1.0,
      updated_at: new Date().toISOString()
    }));

    // 5. Batch Update
    if (finalUpdates.length > 0) {
      const { error: updateError } = await supabase
        .from('tracked_videos')
        .upsert(finalUpdates);

      if (updateError) throw updateError;
    }

    return new Response(
      JSON.stringify({
        success: true,
        processed: finalUpdates.length,
        competitor_median: competitorMedian,
        vqi_integrated: true,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );

  } catch (error: any) {
    console.error('Error calculating scores:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      },
    );
  }
});
