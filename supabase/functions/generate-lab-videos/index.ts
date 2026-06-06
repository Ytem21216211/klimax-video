import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Available experiment variables
const FONT_OPTIONS = [
  'Montserrat', 'Roboto', 'Bebas Neue', 'Oswald', 'Poppins',
  'Anton', 'Bangers', 'Permanent Marker', 'Righteous', 'Russo One'
];

const ANIMATION_OPTIONS = [
  'static', 'punch', 'smash', 'bounce', 'cinematic', 'slide', 'wave'
];

const HOOK_STYLES = [
  'question', 'mystery', 'bold_claim', 'challenge', 'action'
];

const TEXT_COLORS = [
  '#ffffff', '#ffff00', '#00ff00', '#ff0000', '#00ffff',
  '#ff00ff', '#ffa500', '#ff1493', '#7fff00', '#00bfff'
];

const GLOW_COLORS = [
  '#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff',
  '#00ffff', '#ff8800', '#ff1493', '#7fff00', '#8a2be2'
];

interface ExperimentInsights {
  bestHooks: string[];
  bestStyles: string[];
  avoidPatterns: string[];
  averageRetention: number;
  suggestedExperiments: string[];
}

interface Brain {
  what_works?: Array<{ category: string; value: string; confidence: number }>;
  what_failed?: Array<{ category: string; value: string }>;
  avoid?: Array<{ pattern: string; reason: string }>;
  current_hypothesis?: string;
  injections?: any[];
}

// Analyze performance patterns to generate insights
function analyzePerformancePatterns(performances: any[]): ExperimentInsights {
  const hookPerformance: Record<string, { total: number; count: number }> = {};
  const stylePerformance: Record<string, { total: number; count: number }> = {};

  for (const perf of performances) {
    if (perf.youtube_avg_view_percentage) {
      // Track hook performance
      const hookKey = perf.hook_text?.substring(0, 50) || 'unknown';
      if (!hookPerformance[hookKey]) {
        hookPerformance[hookKey] = { total: 0, count: 0 };
      }
      hookPerformance[hookKey].total += perf.youtube_avg_view_percentage;
      hookPerformance[hookKey].count++;

      // Track style performance
      const styleKey = perf.editing_style_name || 'static';
      if (!stylePerformance[styleKey]) {
        stylePerformance[styleKey] = { total: 0, count: 0 };
      }
      stylePerformance[styleKey].total += perf.youtube_avg_view_percentage;
      stylePerformance[styleKey].count++;
    }
  }

  // Sort by average performance
  const sortedHooks = Object.entries(hookPerformance)
    .map(([key, val]) => ({ key, avg: val.total / val.count }))
    .sort((a, b) => b.avg - a.avg);

  const sortedStyles = Object.entries(stylePerformance)
    .map(([key, val]) => ({ key, avg: val.total / val.count }))
    .sort((a, b) => b.avg - a.avg);

  const avgRetention = performances.length > 0
    ? performances.reduce((sum, p) => sum + (p.youtube_avg_view_percentage || 0), 0) / performances.length
    : 0;

  return {
    bestHooks: sortedHooks.slice(0, 3).map(h => h.key),
    bestStyles: sortedStyles.slice(0, 3).map(s => s.key),
    avoidPatterns: sortedHooks.slice(-2).map(h => h.key),
    averageRetention: Math.round(avgRetention * 10) / 10,
    suggestedExperiments: [],
  };
}

// Generate hypothesis using AI
async function generateLabHypothesis(brain: Brain | null, insights: ExperimentInsights, apiKey: string): Promise<string> {
  const injectedContext = brain?.injections && brain.injections.length > 0
    ? `\n- Injected Angles to Test (PRIORITIZE THESE): ${JSON.stringify(brain.injections.slice(0, 5))}`
    : '';

  const prompt = `Based on these video performance insights:
- Best performing patterns: ${insights.bestHooks.slice(0, 2).join(', ') || 'No data yet'}
- Best editing styles: ${insights.bestStyles.slice(0, 2).join(', ') || 'No data yet'}
- Average retention: ${insights.averageRetention || 0}%
- Current hypothesis from brain: ${brain?.current_hypothesis || 'None'}
- What works: ${brain?.what_works?.slice(0, 3).map(w => w.value).join(', ') || 'Not established'}
- What to avoid: ${brain?.avoid?.slice(0, 2).map(a => a.pattern).join(', ') || 'Not established'}${injectedContext}

Generate a specific, testable hypothesis for the next video experiment. Focus on combining elements that haven't been tested together or pushing successful patterns further. If there are Injected Angles provided, heavily prioritize creating a hypothesis around one of them.
Keep it under 100 words. Be specific about what variables will be tested.

Example: "Combining mystery hooks with fast-paced editing (2s clips) and vibrant yellow text will improve retention by 10%"`;

  try {
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: 'You are an AI video optimization expert. Generate testable hypotheses for video experiments.' },
          { role: 'user', content: prompt }
        ],
        max_tokens: 200,
      }),
    });

    if (!response.ok) {
      console.error('[generate-lab-videos] AI request failed:', await response.text());
      return "Test different font and color combinations to identify optimal visual engagement patterns.";
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content?.trim() ||
      "Test different font and color combinations to identify optimal visual engagement patterns.";
  } catch (e) {
    console.error('[generate-lab-videos] Error generating hypothesis:', e);
    return "Test different font and color combinations to identify optimal visual engagement patterns.";
  }
}

// Select experiment variables based on strategy
function selectExperimentVariables(insights: ExperimentInsights, brain: Brain | null, variationIndex: number): Record<string, unknown> {
  // 40% exploitation, 40% exploration, 20% contrarian
  const strategy = Math.random();

  let font: string;
  let animation: string;
  let textColor: string;
  let glowEnabled: boolean;
  let glowColor: string;
  let hookStyle: string;

  if (strategy < 0.4) {
    // Exploitation: Enhance what works
    font = brain?.what_works?.find(w => w.category === 'font')?.value ||
      FONT_OPTIONS[Math.floor(Math.random() * FONT_OPTIONS.length)];
    animation = insights.bestStyles[0] || ANIMATION_OPTIONS[Math.floor(Math.random() * ANIMATION_OPTIONS.length)];
    hookStyle = 'mystery'; // Default to mystery if works well
    textColor = '#ffffff';
    glowEnabled = true;
    glowColor = GLOW_COLORS[Math.floor(Math.random() * GLOW_COLORS.length)];
  } else if (strategy < 0.8) {
    // Exploration: Try new combinations
    font = FONT_OPTIONS[(variationIndex + Math.floor(Math.random() * 3)) % FONT_OPTIONS.length];
    animation = ANIMATION_OPTIONS[(variationIndex + Math.floor(Math.random() * 3)) % ANIMATION_OPTIONS.length];
    hookStyle = HOOK_STYLES[Math.floor(Math.random() * HOOK_STYLES.length)];
    textColor = TEXT_COLORS[Math.floor(Math.random() * TEXT_COLORS.length)];
    glowEnabled = Math.random() > 0.3;
    glowColor = GLOW_COLORS[Math.floor(Math.random() * GLOW_COLORS.length)];
  } else {
    // Contrarian: Test opposite of failures
    const failedFont = brain?.what_failed?.find(f => f.category === 'font')?.value;
    font = failedFont
      ? FONT_OPTIONS.filter(f => f !== failedFont)[Math.floor(Math.random() * (FONT_OPTIONS.length - 1))]
      : FONT_OPTIONS[Math.floor(Math.random() * FONT_OPTIONS.length)];
    animation = 'punch'; // High energy contrarian choice
    hookStyle = 'bold_claim';
    textColor = TEXT_COLORS[Math.floor(Math.random() * TEXT_COLORS.length)];
    glowEnabled = true;
    glowColor = '#ff0000'; // Bold red glow
  }

  // Pick an injected angle if available, higher chance on exploration
  let injectedAngle = null;
  if (brain?.injections && brain.injections.length > 0) {
    if (strategy < 0.4 || strategy >= 0.8 || Math.random() > 0.3) {
      injectedAngle = brain.injections[Math.floor(Math.random() * brain.injections.length)];
    }
  }

  return {
    font,
    animation,
    hook_style: hookStyle,
    text_color: textColor,
    glow_enabled: glowEnabled,
    glow_color: glowColor,
    variation_index: variationIndex,
    injected_angle: injectedAngle,
    strategy: strategy < 0.4 ? 'exploitation' : (strategy < 0.8 ? 'exploration' : 'contrarian'),
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { projectId, experimentCount = 3 } = await req.json();

    if (!projectId) {
      return new Response(JSON.stringify({ error: 'projectId is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log(`[generate-lab-videos] Starting lab generation for project ${projectId}`);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const apiKey = Deno.env.get('LOVABLE_API_KEY');
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'LOVABLE_API_KEY not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // 1. Fetch project with gamemode brain
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('*, gamemodes(id, name, brain)')
      .eq('id', projectId)
      .single();

    if (projectError || !project) {
      console.error('[generate-lab-videos] Project not found:', projectError);
      return new Response(JSON.stringify({ error: 'Project not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (!project.lab_enabled) {
      return new Response(JSON.stringify({ error: 'AI Lab is not enabled for this project' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // 2. Fetch lab-enabled accounts
    const { data: labAccounts, error: accountsError } = await supabase
      .from('youtube_accounts')
      .select('*')
      .eq('project_id', projectId)
      .eq('enabled', true)
      .eq('lab_enabled', true);

    if (accountsError) {
      console.error('[generate-lab-videos] Error fetching accounts:', accountsError);
      return new Response(JSON.stringify({ error: 'Failed to fetch lab accounts' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (!labAccounts || labAccounts.length === 0) {
      return new Response(JSON.stringify({
        error: 'No lab-enabled YouTube accounts found. Enable the flask icon on at least one account.'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log(`[generate-lab-videos] Found ${labAccounts.length} lab-enabled accounts`);

    // 3. Fetch analytics data for this gamemode
    const { data: performances } = await supabase
      .from('video_performance')
      .select('*')
      .eq('gamemode_id', project.gamemode_id)
      .order('created_at', { ascending: false })
      .limit(50);

    // 4. Lab Brain analyzes patterns
    const insights = analyzePerformancePatterns(performances || []);
    console.log('[generate-lab-videos] Insights:', insights);

    // 5. Generate hypothesis based on brain + insights
    const brain = project.gamemodes?.brain as Brain | null;
    const hypothesis = await generateLabHypothesis(brain, insights, apiKey);
    console.log('[generate-lab-videos] Hypothesis:', hypothesis);

    // 6. Create experiment record
    const { data: experiment, error: expError } = await supabase
      .from('lab_experiments')
      .insert({
        user_id: project.user_id,
        project_id: projectId,
        gamemode_id: project.gamemode_id,
        hypothesis,
        variables: { allowed: ['font', 'animation', 'hook_style', 'text_color', 'glow_enabled', 'glow_color', 'injected_angle'] },
        status: 'generating',
        videos_generated: 0,
      })
      .select()
      .single();

    if (expError || !experiment) {
      console.error('[generate-lab-videos] Failed to create experiment:', expError);
      return new Response(JSON.stringify({ error: 'Failed to create experiment' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log(`[generate-lab-videos] Created experiment ${experiment.id}`);

    // 7. Generate video variations
    const labVideos: any[] = [];
    const actualCount = Math.min(experimentCount, labAccounts.length);

    for (let i = 0; i < actualCount; i++) {
      const account = labAccounts[i % labAccounts.length];

      // Lab Brain picks creative variables
      const variables = selectExperimentVariables(insights, brain, i);

      // Create lab video record (script will be generated during processing)
      const { data: labVideo, error: videoError } = await supabase
        .from('lab_videos')
        .insert({
          experiment_id: experiment.id,
          project_id: projectId,
          youtube_account_id: account.id,
          variables,
          status: 'pending',
        })
        .select()
        .single();

      if (videoError) {
        console.error('[generate-lab-videos] Failed to create lab video:', videoError);
        continue;
      }

      labVideos.push({
        id: labVideo.id,
        account_name: account.channel_name,
        variables,
      });

      console.log(`[generate-lab-videos] Created lab video ${i + 1}/${actualCount} for ${account.channel_name}`);
    }

    // Update experiment with video count
    await supabase
      .from('lab_experiments')
      .update({
        videos_generated: labVideos.length,
        status: labVideos.length > 0 ? 'running' : 'failed',
      })
      .eq('id', experiment.id);

    // Update project lab_settings with last experiment time
    await supabase
      .from('projects')
      .update({
        lab_settings: {
          ...(project.lab_settings || {}),
          last_experiment_at: new Date().toISOString(),
        }
      })
      .eq('id', projectId);

    console.log(`[generate-lab-videos] Done. Created ${labVideos.length} lab videos`);

    return new Response(JSON.stringify({
      success: true,
      experimentId: experiment.id,
      hypothesis,
      videosQueued: labVideos.length,
      videos: labVideos,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[generate-lab-videos] Error:', error);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
