import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface DecisionResult {
  type: 'scale' | 'optimize' | 'kill' | 'creative';
  action: string;
  confidence: number;
  reasoning: string;
  dataPoints: Record<string, any>;
  affectedEntities: { type: string; id: string }[];
  previousValues: Record<string, any>;
  newValues: Record<string, any>;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('Starting autonomous decision engine...');

    // Get all automation settings that are enabled
    const { data: settings, error: settingsError } = await supabase
      .from('automation_settings')
      .select('*, gamemodes(name, brain)')
      .eq('enabled', true)
      .or('paused_until.is.null,paused_until.lt.now()');

    if (settingsError) throw settingsError;

    console.log(`Found ${settings?.length || 0} active automation settings`);

    const results = [];

    for (const setting of settings || []) {
      if (setting.autonomy_level === 1) {
        // Advisor mode - skip autonomous processing
        console.log(`Skipping ${setting.gamemodes?.name} - Advisor mode`);
        continue;
      }

      // Get the brain for this gamemode
      const brain = setting.gamemodes?.brain as any;

      // Gather performance data for this gamemode
      const { data: performances } = await supabase
        .from('video_performance')
        .select('*')
        .eq('user_id', setting.user_id)
        .eq('gamemode_id', setting.gamemode_id)
        .gte('created_at', new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString())
        .order('created_at', { ascending: false });

      if (!performances || performances.length < 5) {
        console.log(`Skipping ${setting.gamemodes?.name} - insufficient data (${performances?.length || 0} videos)`);
        continue;
      }

      console.log(`Analyzing ${performances.length} videos for ${setting.gamemodes?.name}`);

      // Analyze and generate decisions, passing brain for context
      const decisions = analyzeAndDecide(performances, setting, brain);

      for (const decision of decisions) {
        // Check confidence threshold
        if (decision.confidence < setting.min_confidence_pct) {
          console.log(`Skipping decision (confidence ${decision.confidence}% < threshold ${setting.min_confidence_pct}%)`);
          continue;
        }

        // Check daily limit
        const { count } = await supabase
          .from('automation_decisions')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', setting.user_id)
          .eq('gamemode_id', setting.gamemode_id)
          .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
          .in('status', ['executed', 'pending']);

        if ((count || 0) >= setting.max_changes_per_day) {
          console.log(`Daily limit reached for user ${setting.user_id}`);
          continue;
        }

        if (setting.autonomy_level === 2) {
          // Co-pilot mode: schedule for later
          const scheduledAt = new Date();
          scheduledAt.setHours(scheduledAt.getHours() + setting.copilot_delay_hours);

          await supabase.from('automation_decisions').insert({
            user_id: setting.user_id,
            gamemode_id: setting.gamemode_id,
            decision_type: decision.type,
            action_summary: decision.action,
            action_details: { ...decision },
            confidence_pct: decision.confidence,
            reasoning: decision.reasoning,
            data_points: decision.dataPoints,
            status: 'pending',
            scheduled_at: scheduledAt.toISOString(),
            affected_entities: decision.affectedEntities,
            previous_values: decision.previousValues,
            new_values: decision.newValues,
          });

          console.log(`Scheduled decision for ${setting.gamemodes?.name}: ${decision.action}`);

          results.push({
            gamemode: setting.gamemodes?.name,
            decision: decision.action,
            status: 'scheduled',
            scheduledAt: scheduledAt.toISOString(),
          });

        } else if (setting.autonomy_level === 3) {
          // Autopilot mode: execute immediately
          const executed = await executeDecision(supabase, decision, setting);

          await supabase.from('automation_decisions').insert({
            user_id: setting.user_id,
            gamemode_id: setting.gamemode_id,
            decision_type: decision.type,
            action_summary: decision.action,
            action_details: { ...decision },
            confidence_pct: decision.confidence,
            reasoning: decision.reasoning,
            data_points: decision.dataPoints,
            status: executed ? 'executed' : 'failed',
            executed_at: executed ? new Date().toISOString() : null,
            affected_entities: decision.affectedEntities,
            previous_values: decision.previousValues,
            new_values: decision.newValues,
          });

          console.log(`Executed decision for ${setting.gamemodes?.name}: ${decision.action} (${executed ? 'success' : 'failed'})`);

          results.push({
            gamemode: setting.gamemodes?.name,
            decision: decision.action,
            status: executed ? 'executed' : 'failed',
          });
        }
      }
    }

    // Process scheduled co-pilot decisions that are due
    const { data: pendingDecisions } = await supabase
      .from('automation_decisions')
      .select('*')
      .eq('status', 'pending')
      .lte('scheduled_at', new Date().toISOString());

    console.log(`Processing ${pendingDecisions?.length || 0} pending scheduled decisions`);

    for (const pending of pendingDecisions || []) {
      const { data: setting } = await supabase
        .from('automation_settings')
        .select('*')
        .eq('user_id', pending.user_id)
        .eq('gamemode_id', pending.gamemode_id)
        .single();

      if (!setting || !setting.enabled) {
        await supabase
          .from('automation_decisions')
          .update({ status: 'rejected', user_response: 'automation_disabled' })
          .eq('id', pending.id);
        continue;
      }

      const executed = await executeDecision(
        supabase,
        pending.action_details as DecisionResult,
        setting
      );

      await supabase
        .from('automation_decisions')
        .update({
          status: executed ? 'executed' : 'failed',
          executed_at: new Date().toISOString(),
        })
        .eq('id', pending.id);

      results.push({
        decision: pending.action_summary,
        status: executed ? 'auto-executed' : 'failed',
        wasScheduled: true,
      });
    }

    console.log(`Decision engine complete. ${results.length} actions taken.`);

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('Autonomous decision engine error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

function analyzeAndDecide(
  performances: any[],
  setting: any,
  brain?: any
): DecisionResult[] {
  const decisions: DecisionResult[] = [];

  // Calculate aggregated metrics
  const avgRetention = performances.reduce((a, p) => a + (p.youtube_avg_view_percentage || 0), 0) / performances.length;
  const avgViews = performances.reduce((a, p) => a + (p.youtube_views || 0), 0) / performances.length;

  console.log(`Gamemode averages: ${avgRetention.toFixed(1)}% retention, ${avgViews.toFixed(0)} views`);

  // Group by hook style (first word of hook text as proxy)
  const hookStyles: Record<string, { count: number; totalRetention: number; totalViews: number; videos: any[] }> = {};
  for (const p of performances) {
    const style = extractHookStyle(p.hook_text);
    if (!hookStyles[style]) hookStyles[style] = { count: 0, totalRetention: 0, totalViews: 0, videos: [] };
    hookStyles[style].count++;
    hookStyles[style].totalRetention += p.youtube_avg_view_percentage || 0;
    hookStyles[style].totalViews += p.youtube_views || 0;
    hookStyles[style].videos.push(p);
  }

  // Check for formats to kill or scale
  for (const [style, data] of Object.entries(hookStyles)) {
    if (data.count < 3) continue; // Need minimum sample size

    const styleAvgRetention = data.totalRetention / data.count;
    const styleAvgViews = data.totalViews / data.count;

    // Apply brain adjustments to confidence
    let brainBoost = 0;
    let brainPenalty = 0;
    
    if (brain) {
      // Check if this style is proven in brain
      const provenWorks = brain.what_works?.find((w: any) => 
        w.category === 'hook_style' && w.value?.toLowerCase() === style.toLowerCase()
      );
      if (provenWorks) {
        brainBoost = Math.min(15, provenWorks.confidence / 10);
      }
      
      // Check if this style should be avoided
      const shouldAvoid = brain.avoid?.find((a: any) => 
        a.pattern?.toLowerCase().includes(style.toLowerCase())
      );
      if (shouldAvoid) {
        brainPenalty = Math.min(25, shouldAvoid.confidence / 4);
      }
    }

    // Kill decision: severely underperforming
    if (styleAvgRetention < setting.kill_threshold_retention) {
      let confidence = Math.min(95, 70 + data.count * 5);
      confidence = Math.min(99, confidence - brainBoost + brainPenalty); // Brain can influence
      
      decisions.push({
        type: 'kill',
        action: `Pause "${style}" hook style - severely underperforming`,
        confidence,
        reasoning: `This hook style has ${styleAvgRetention.toFixed(1)}% retention across ${data.count} videos, well below the ${setting.kill_threshold_retention}% threshold.${brainPenalty > 0 ? ' Brain history supports this decision.' : ''} Continuing to use it is hurting overall channel performance.`,
        dataPoints: {
          hookStyle: style,
          videoCount: data.count,
          avgRetention: styleAvgRetention,
          avgViews: styleAvgViews,
          threshold: setting.kill_threshold_retention,
          channelAvgRetention: avgRetention,
          brainInfluence: brainPenalty > 0 ? 'confirmed_bad' : 'none',
        },
        affectedEntities: [{ type: 'format', id: style }],
        previousValues: { status: 'active' },
        newValues: { status: 'killed' },
      });
    }

    // Scale decision: outperforming average
    if (styleAvgRetention > setting.scale_threshold_retention && styleAvgRetention > avgRetention * 1.2) {
      let confidence = Math.min(92, 65 + data.count * 4);
      confidence = Math.min(99, confidence + brainBoost - brainPenalty); // Brain can boost proven winners
      
      decisions.push({
        type: 'scale',
        action: `Scale "${style}" hook style - outperforming average by ${((styleAvgRetention / avgRetention - 1) * 100).toFixed(0)}%`,
        confidence,
        reasoning: `This hook style has ${styleAvgRetention.toFixed(1)}% retention across ${data.count} videos, exceeding the ${setting.scale_threshold_retention}% scale threshold.${brainBoost > 0 ? ' Brain confirms this is a proven winner.' : ''} Recommend increasing usage of this format.`,
        dataPoints: {
          hookStyle: style,
          videoCount: data.count,
          avgRetention: styleAvgRetention,
          avgViews: styleAvgViews,
          threshold: setting.scale_threshold_retention,
          channelAvgRetention: avgRetention,
          improvementPct: ((styleAvgRetention / avgRetention - 1) * 100),
          brainInfluence: brainBoost > 0 ? 'confirmed_good' : 'none',
        },
        affectedEntities: [{ type: 'format', id: style }],
        previousValues: { priority: 'normal' },
        newValues: { priority: 'high' },
      });
    }
  }

  // Group by editing style
  const editingStyles: Record<string, { count: number; totalRetention: number; totalViews: number }> = {};
  for (const p of performances) {
    const style = p.editing_style_name || 'unknown';
    if (!editingStyles[style]) editingStyles[style] = { count: 0, totalRetention: 0, totalViews: 0 };
    editingStyles[style].count++;
    editingStyles[style].totalRetention += p.youtube_avg_view_percentage || 0;
    editingStyles[style].totalViews += p.youtube_views || 0;
  }

  // Check editing styles for kill/scale
  for (const [style, data] of Object.entries(editingStyles)) {
    if (data.count < 3 || style === 'unknown') continue;

    const styleAvgRetention = data.totalRetention / data.count;

    if (styleAvgRetention < setting.kill_threshold_retention) {
      const confidence = Math.min(90, 65 + data.count * 5);
      decisions.push({
        type: 'kill',
        action: `Pause "${style}" editing style - underperforming`,
        confidence,
        reasoning: `This editing style has ${styleAvgRetention.toFixed(1)}% retention across ${data.count} videos. Consider switching to better-performing styles.`,
        dataPoints: {
          editingStyle: style,
          videoCount: data.count,
          avgRetention: styleAvgRetention,
          threshold: setting.kill_threshold_retention,
        },
        affectedEntities: [{ type: 'editing_style', id: style }],
        previousValues: { status: 'active' },
        newValues: { status: 'killed' },
      });
    }
  }

  return decisions;
}

function extractHookStyle(hookText: string | null): string {
  if (!hookText) return 'unknown';
  
  // Try to categorize hook by common patterns
  const lower = hookText.toLowerCase();
  
  if (lower.includes('?') || lower.startsWith('what') || lower.startsWith('how') || lower.startsWith('why')) {
    return 'question';
  }
  if (lower.includes('secret') || lower.includes('hidden') || lower.includes('nobody knows')) {
    return 'mystery';
  }
  if (lower.includes('wait') || lower.includes('watch') || lower.includes('look')) {
    return 'attention';
  }
  if (lower.includes('!') && lower.length < 30) {
    return 'exclamation';
  }
  if (lower.includes('you') && (lower.includes('won\'t believe') || lower.includes('need to'))) {
    return 'direct';
  }
  
  // Default to first significant word
  const words = hookText.split(' ').filter(w => w.length > 3);
  return words[0]?.toLowerCase() || 'generic';
}

async function executeDecision(
  supabase: any,
  decision: DecisionResult,
  setting: any
): Promise<boolean> {
  try {
    if (decision.type === 'kill') {
      // Update format_performance to mark as killed
      const formatType = decision.dataPoints.editingStyle ? 'editing_style' : 'hook_style';
      const formatValue = decision.dataPoints.hookStyle || decision.dataPoints.editingStyle;
      
      const { error } = await supabase.from('format_performance').upsert({
        user_id: setting.user_id,
        gamemode_id: setting.gamemode_id,
        format_type: formatType,
        format_value: formatValue,
        status: 'killed',
        killed_at: new Date().toISOString(),
        kill_reason: decision.reasoning,
        total_videos: decision.dataPoints.videoCount,
        avg_retention_pct: decision.dataPoints.avgRetention,
        last_analyzed_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id,gamemode_id,format_type,format_value'
      });
      
      if (error) {
        console.error('Error killing format:', error);
        return false;
      }
      
      // Update the project brain with this kill decision
      try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        
        await fetch(`${supabaseUrl}/functions/v1/update-project-brain`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseServiceKey}`,
          },
          body: JSON.stringify({
            gamemodeId: setting.gamemode_id,
            updateType: 'format_killed',
            data: {
              format_type: formatType,
              format_value: formatValue,
              kill_reason: decision.reasoning,
              confidence: decision.confidence,
              avg_retention: decision.dataPoints.avgRetention,
              video_count: decision.dataPoints.videoCount,
            },
          }),
        });
        console.log(`Brain updated for format kill: ${formatValue}`);
      } catch (brainError) {
        console.warn('Failed to update brain after format kill:', brainError);
      }
      
      return true;
    }

    if (decision.type === 'scale') {
      // Update format_performance to mark as priority
      const { error } = await supabase.from('format_performance').upsert({
        user_id: setting.user_id,
        gamemode_id: setting.gamemode_id,
        format_type: 'hook_style',
        format_value: decision.dataPoints.hookStyle,
        status: 'active',
        performance_trend: 'improving',
        total_videos: decision.dataPoints.videoCount,
        avg_retention_pct: decision.dataPoints.avgRetention,
        last_analyzed_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id,gamemode_id,format_type,format_value'
      });
      
      if (error) {
        console.error('Error scaling format:', error);
        return false;
      }
      return true;
    }

    if (decision.type === 'optimize') {
      // Apply optimization to YouTube accounts
      for (const entity of decision.affectedEntities) {
        if (entity.type === 'youtube_account') {
          const { error } = await supabase
            .from('youtube_accounts')
            .update(decision.newValues)
            .eq('id', entity.id);
          
          if (error) {
            console.error('Error optimizing account:', error);
            return false;
          }
        }
      }
      return true;
    }

    return false;
  } catch (error) {
    console.error('Error executing decision:', error);
    return false;
  }
}
