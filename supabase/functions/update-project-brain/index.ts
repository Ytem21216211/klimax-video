import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface BrainInsight {
  insight: string;
  category: string;
  value: string;
  confidence: number;
  evidence_count: number;
  avg_performance?: number;
  discovered_at: string;
}

interface BrainAvoid {
  pattern: string;
  reason: string;
  confidence: number;
  added_at: string;
}

interface Brain {
  version: number;
  last_updated: string;
  summary: string | null;
  what_works: BrainInsight[];
  what_failed: BrainInsight[];
  experiments: any[];
  avoid: BrainAvoid[];
  current_hypothesis: string | null;
  audience_profile: Record<string, any>;
  title_patterns: { works: string[]; fails: string[] };
}

interface BrainUpdateRequest {
  gamemodeId: string;
  updateType: 'weekly_report' | 'ab_test_complete' | 'format_killed' | 'manual' | 'analytics_sync' | 'lab_experiment';
  data: any;
}

const DEFAULT_BRAIN: Brain = {
  version: 1,
  last_updated: new Date().toISOString(),
  summary: null,
  what_works: [],
  what_failed: [],
  experiments: [],
  avoid: [],
  current_hypothesis: null,
  audience_profile: {},
  title_patterns: { works: [], fails: [] },
};

const MAX_INSIGHTS = 20;

function addToWhatWorks(brain: Brain, insight: Omit<BrainInsight, 'discovered_at'>): void {
  const existing = brain.what_works.find(
    w => w.category === insight.category && w.value === insight.value
  );
  
  if (existing) {
    // Update existing insight
    existing.confidence = Math.min(99, Math.max(existing.confidence, insight.confidence));
    existing.evidence_count += 1;
    existing.insight = insight.insight;
    if (insight.avg_performance) existing.avg_performance = insight.avg_performance;
  } else {
    // Add new insight
    brain.what_works.push({
      ...insight,
      evidence_count: insight.evidence_count || 1,
      discovered_at: new Date().toISOString(),
    });
    
    // Remove from what_failed if it exists there
    brain.what_failed = brain.what_failed.filter(
      f => !(f.category === insight.category && f.value === insight.value)
    );
  }
  
  // Sort by confidence and prune
  brain.what_works.sort((a, b) => b.confidence - a.confidence);
  if (brain.what_works.length > MAX_INSIGHTS) {
    brain.what_works = brain.what_works.slice(0, MAX_INSIGHTS);
  }
}

function addToWhatFailed(brain: Brain, insight: Omit<BrainInsight, 'discovered_at'>): void {
  // Don't add if it's in what_works with higher confidence
  const inWorks = brain.what_works.find(
    w => w.category === insight.category && w.value === insight.value
  );
  if (inWorks && inWorks.confidence >= insight.confidence) return;
  
  const existing = brain.what_failed.find(
    f => f.category === insight.category && f.value === insight.value
  );
  
  if (existing) {
    existing.confidence = Math.min(99, Math.max(existing.confidence, insight.confidence));
    existing.evidence_count += 1;
    existing.insight = insight.insight;
    if (insight.avg_performance) existing.avg_performance = insight.avg_performance;
  } else {
    brain.what_failed.push({
      ...insight,
      evidence_count: insight.evidence_count || 1,
      discovered_at: new Date().toISOString(),
    });
  }
  
  // Sort by confidence and prune
  brain.what_failed.sort((a, b) => b.confidence - a.confidence);
  if (brain.what_failed.length > MAX_INSIGHTS) {
    brain.what_failed = brain.what_failed.slice(0, MAX_INSIGHTS);
  }
}

function addToAvoid(brain: Brain, avoid: Omit<BrainAvoid, 'added_at'>): void {
  const existing = brain.avoid.find(a => a.pattern === avoid.pattern);
  
  if (existing) {
    existing.confidence = Math.max(existing.confidence, avoid.confidence);
    existing.reason = avoid.reason;
  } else {
    brain.avoid.push({
      ...avoid,
      added_at: new Date().toISOString(),
    });
  }
  
  // Sort by confidence and prune
  brain.avoid.sort((a, b) => b.confidence - a.confidence);
  if (brain.avoid.length > MAX_INSIGHTS) {
    brain.avoid = brain.avoid.slice(0, MAX_INSIGHTS);
  }
}

function applyConfidenceDecay(brain: Brain): void {
  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
  
  // Decay insights that haven't been updated recently
  for (const insight of brain.what_works) {
    const discoveredAt = new Date(insight.discovered_at);
    if (discoveredAt < oneWeekAgo && insight.evidence_count < 5) {
      insight.confidence = Math.max(50, insight.confidence - 5);
    }
  }
  
  for (const insight of brain.what_failed) {
    const discoveredAt = new Date(insight.discovered_at);
    if (discoveredAt < oneWeekAgo && insight.evidence_count < 5) {
      insight.confidence = Math.max(50, insight.confidence - 5);
    }
  }
  
  // Remove very low confidence insights
  brain.what_works = brain.what_works.filter(w => w.confidence >= 50);
  brain.what_failed = brain.what_failed.filter(f => f.confidence >= 50);
}

async function generateBrainSummary(brain: Brain, openaiKey: string): Promise<string | null> {
  if (brain.what_works.length === 0 && brain.what_failed.length === 0) {
    return null;
  }
  
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          { 
            role: 'system', 
            content: 'Generate a 1-2 sentence summary of what works best for this gamemode based on the learnings. Be specific and actionable.' 
          },
          { 
            role: 'user', 
            content: `What works: ${brain.what_works.slice(0, 5).map(w => w.insight).join('; ')}. What failed: ${brain.what_failed.slice(0, 3).map(f => f.insight).join('; ')}. Avoid: ${brain.avoid.slice(0, 3).map(a => a.pattern).join('; ')}.` 
          },
        ],
        temperature: 0.3,
        max_tokens: 100,
      }),
    });
    
    if (!response.ok) return null;
    
    const data = await response.json();
    return data.choices?.[0]?.message?.content || null;
  } catch (error) {
    console.error('Failed to generate brain summary:', error);
    return null;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { gamemodeId, updateType, data }: BrainUpdateRequest = await req.json();
    
    if (!gamemodeId || !updateType) {
      throw new Error('gamemodeId and updateType are required');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const openaiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openaiKey) throw new Error('OPENAI_API_KEY is not configured');
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log(`Updating brain for gamemode ${gamemodeId} (type: ${updateType})`);

    // Fetch current brain
    const { data: gamemode, error: gamemodeError } = await supabase
      .from('gamemodes')
      .select('brain, name')
      .eq('id', gamemodeId)
      .single();

    if (gamemodeError) throw gamemodeError;

    const brain: Brain = (gamemode?.brain as Brain) || { ...DEFAULT_BRAIN };

    // Apply confidence decay on each update
    applyConfidenceDecay(brain);

    // Update based on type
    if (updateType === 'weekly_report' && data.recommendations) {
      const recs = data.recommendations;
      
      // Hook style insights
      if (recs.hook_style?.recommended) {
        addToWhatWorks(brain, {
          category: 'hook_style',
          value: recs.hook_style.recommended,
          confidence: recs.hook_style.confidence || 75,
          insight: recs.hook_style.reasoning || `${recs.hook_style.recommended} hooks perform well`,
          evidence_count: 1,
        });
      }
      
      // CTA insights
      if (recs.cta_style?.recommended) {
        addToWhatWorks(brain, {
          category: 'cta_style',
          value: recs.cta_style.recommended,
          confidence: recs.cta_style.confidence || 70,
          insight: `CTA timing: ${recs.cta_style.timing || 'end'} works best`,
          evidence_count: 1,
        });
      }
      
      // Editing style insights
      if (recs.editing_style?.recommended) {
        addToWhatWorks(brain, {
          category: 'editing_style',
          value: recs.editing_style.recommended,
          confidence: recs.editing_style.confidence || 70,
          insight: `${recs.editing_style.recommended} editing with ${recs.editing_style.clip_length || 'optimal'} clip length`,
          evidence_count: 1,
        });
      }
      
      // Title patterns
      if (recs.title_optimization?.examples) {
        brain.title_patterns.works = [...new Set([
          ...brain.title_patterns.works,
          ...(recs.title_optimization.examples as string[]).slice(0, 5)
        ])].slice(0, 10);
      }
      
      // Update hypothesis
      if (recs.key_insight) {
        brain.current_hypothesis = recs.key_insight;
      }
      
      console.log('Updated brain from weekly report');
    }

    if (updateType === 'ab_test_complete') {
      const { winner, losers } = data;
      
      if (winner) {
        addToWhatWorks(brain, {
          category: 'hook_style',
          value: winner.hook_style,
          confidence: 85,
          insight: `Won A/B test with ${winner.retention?.toFixed(1) || 'higher'}% retention`,
          avg_performance: winner.retention,
          evidence_count: 1,
        });
      }
      
      if (losers && Array.isArray(losers)) {
        for (const loser of losers) {
          addToWhatFailed(brain, {
            category: 'hook_style',
            value: loser.hook_style,
            confidence: 70,
            insight: `Lost A/B test (${loser.retention?.toFixed(1) || 'lower'}% vs ${winner?.retention?.toFixed(1) || 'higher'}%)`,
            avg_performance: loser.retention,
            evidence_count: 1,
          });
        }
      }
      
      console.log('Updated brain from A/B test completion');
    }

    if (updateType === 'format_killed') {
      addToAvoid(brain, {
        pattern: `${data.format_type}: ${data.format_value}`,
        reason: data.kill_reason || 'Underperformed consistently',
        confidence: data.confidence || 80,
      });
      
      // Also add to what_failed
      addToWhatFailed(brain, {
        category: data.format_type,
        value: data.format_value,
        confidence: data.confidence || 80,
        insight: data.kill_reason || 'Format killed due to poor performance',
        avg_performance: data.avg_retention,
        evidence_count: data.video_count || 1,
      });
      
      console.log('Updated brain from format kill');
    }

    if (updateType === 'analytics_sync' && data.audience_profile) {
      brain.audience_profile = {
        ...brain.audience_profile,
        ...data.audience_profile,
      };
      
      console.log('Updated brain audience profile');
    }

    if (updateType === 'manual' && data) {
      // Allow manual overrides
      if (data.what_works) {
        for (const w of data.what_works) {
          addToWhatWorks(brain, w);
        }
      }
      if (data.avoid) {
        for (const a of data.avoid) {
          addToAvoid(brain, a);
        }
      }
      if (data.hypothesis) {
        brain.current_hypothesis = data.hypothesis;
      }
      
      console.log('Applied manual brain update');
    }

    // Lab experiment results
    if (updateType === 'lab_experiment' && data) {
      const { hypothesis, winner_variables, winner_retention, all_results } = data;
      
      // Record experiment in brain
      brain.experiments.push({
        hypothesis,
        completed_at: new Date().toISOString(),
        winner_variables,
        winner_retention,
        results_count: all_results?.length || 0,
      });
      
      // Keep only last 10 experiments
      if (brain.experiments.length > 10) {
        brain.experiments = brain.experiments.slice(-10);
      }
      
      // Update what_works with winning variables
      if (winner_variables) {
        if (winner_variables.font) {
          addToWhatWorks(brain, {
            category: 'font',
            value: winner_variables.font,
            confidence: 75,
            insight: `Lab experiment winner with ${winner_retention?.toFixed(1) || 'good'}% retention`,
            avg_performance: winner_retention,
            evidence_count: 1,
          });
        }
        
        if (winner_variables.animation) {
          addToWhatWorks(brain, {
            category: 'animation',
            value: winner_variables.animation,
            confidence: 70,
            insight: `Lab experiment: ${winner_variables.animation} animation performed best`,
            avg_performance: winner_retention,
            evidence_count: 1,
          });
        }
        
        if (winner_variables.text_color) {
          addToWhatWorks(brain, {
            category: 'text_color',
            value: winner_variables.text_color,
            confidence: 65,
            insight: `Lab experiment: ${winner_variables.text_color} text color won`,
            avg_performance: winner_retention,
            evidence_count: 1,
          });
        }
        
        if (winner_variables.hook_style) {
          addToWhatWorks(brain, {
            category: 'hook_style',
            value: winner_variables.hook_style,
            confidence: 75,
            insight: `Lab experiment: ${winner_variables.hook_style} hook style performed best`,
            avg_performance: winner_retention,
            evidence_count: 1,
          });
        }
      }
      
      // Add non-winners to what_failed (if they had significantly lower retention)
      if (all_results && winner_retention) {
        for (const result of all_results) {
          if (result.retention && result.retention < winner_retention * 0.8) {
            // 20% worse than winner
            if (result.variables?.font) {
              addToWhatFailed(brain, {
                category: 'font',
                value: result.variables.font,
                confidence: 60,
                insight: `Lab experiment: underperformed by ${((winner_retention - result.retention) / winner_retention * 100).toFixed(0)}%`,
                avg_performance: result.retention,
                evidence_count: 1,
              });
            }
          }
        }
      }
      
      // Update hypothesis based on lab results
      if (winner_variables) {
        brain.current_hypothesis = `${winner_variables.font || 'default'} font with ${winner_variables.animation || 'standard'} animation and ${winner_variables.hook_style || 'mixed'} hooks may continue to perform well`;
      }
      
      console.log('Updated brain from lab experiment');
    }

    // Generate summary if we have enough data
    if (brain.what_works.length >= 2 || brain.what_failed.length >= 2) {
      brain.summary = await generateBrainSummary(brain, openaiKey);
    }
    
    brain.last_updated = new Date().toISOString();

    // Save updated brain
    const { error: updateError } = await supabase
      .from('gamemodes')
      .update({ brain })
      .eq('id', gamemodeId);

    if (updateError) throw updateError;

    console.log(`Brain updated successfully for ${gamemode?.name || gamemodeId}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        summary: brain.summary,
        stats: {
          what_works: brain.what_works.length,
          what_failed: brain.what_failed.length,
          avoid: brain.avoid.length,
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Update project brain error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
