import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface VideoPerformance {
  id: string;
  gamemode_id: string | null;
  hook_text: string;
  cta_text: string;
  editing_style_name: string;
  hook_score: number | null;
  cta_score: number | null;
  editing_style_score: number | null;
  youtube_views: number;
  youtube_likes: number;
  youtube_avg_view_percentage: number | null;
  youtube_watch_time_seconds: number | null;
  video_title: string | null;
  video_description: string | null;
  published_at: string | null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const openaiKey = Deno.env.get('OPENAI_API_KEY')!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get all gamemodes with their user_id
    const { data: gamemodes, error: gamemodesError } = await supabase
      .from('gamemodes')
      .select('id, user_id, name');

    if (gamemodesError) throw gamemodesError;

    console.log(`Processing ${gamemodes?.length || 0} gamemodes for weekly reports`);

    const reportWeek = getWeekStart(new Date());
    const fourWeeksAgo = new Date(reportWeek);
    fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);

    const results: { gamemode: string; status: string; videosAnalyzed?: number }[] = [];

    for (const gamemode of gamemodes || []) {
      // Check if report already exists for this week
      const { data: existingReport } = await supabase
        .from('weekly_reports')
        .select('id')
        .eq('user_id', gamemode.user_id)
        .eq('gamemode_id', gamemode.id)
        .eq('report_week', reportWeek.toISOString().split('T')[0])
        .single();

      if (existingReport) {
        console.log(`Report already exists for ${gamemode.name}`);
        results.push({ gamemode: gamemode.name, status: 'already_exists' });
        continue;
      }

      // Get video performance data for past 4 weeks
      const { data: videos, error: videosError } = await supabase
        .from('video_performance')
        .select('*')
        .eq('user_id', gamemode.user_id)
        .eq('gamemode_id', gamemode.id)
        .gte('created_at', fourWeeksAgo.toISOString())
        .order('youtube_views', { ascending: false });

      if (videosError) {
        console.error(`Error fetching videos for ${gamemode.name}:`, videosError);
        continue;
      }

      if (!videos || videos.length < 5) {
        console.log(`Not enough videos for ${gamemode.name} (${videos?.length || 0} videos)`);
        results.push({ gamemode: gamemode.name, status: 'insufficient_data', videosAnalyzed: videos?.length || 0 });
        continue;
      }

      // Analyze with AI
      const recommendations = await analyzeWithAI(videos as VideoPerformance[], openaiKey, gamemode.name);

      if (!recommendations) {
        console.error(`Failed to generate recommendations for ${gamemode.name}`);
        continue;
      }

      // Calculate average retention
      const avgRetention = videos.filter(v => v.youtube_avg_view_percentage).length > 0
        ? videos.reduce((acc, v) => acc + (v.youtube_avg_view_percentage || 0), 0) / 
          videos.filter(v => v.youtube_avg_view_percentage).length
        : null;

      // Find best performing video
      const bestVideo = videos[0]; // Already sorted by views

      // Create report
      const { error: insertError } = await supabase
        .from('weekly_reports')
        .insert({
          user_id: gamemode.user_id,
          gamemode_id: gamemode.id,
          report_week: reportWeek.toISOString().split('T')[0],
          status: 'pending',
          analysis_data: {
            total_views: videos.reduce((acc, v) => acc + (v.youtube_views || 0), 0),
            total_likes: videos.reduce((acc, v) => acc + (v.youtube_likes || 0), 0),
            avg_hook_score: videos.filter(v => v.hook_score).reduce((acc, v) => acc + (v.hook_score || 0), 0) / 
              Math.max(1, videos.filter(v => v.hook_score).length),
            avg_cta_score: videos.filter(v => v.cta_score).reduce((acc, v) => acc + (v.cta_score || 0), 0) /
              Math.max(1, videos.filter(v => v.cta_score).length),
            top_hooks: getTopItems(videos, 'hook_text', 'hook_score'),
            top_ctas: getTopItems(videos, 'cta_text', 'cta_score'),
            editing_styles: getStyleBreakdown(videos),
          },
          recommendations,
          videos_analyzed: videos.length,
          avg_retention_pct: avgRetention,
          best_performing_video_id: bestVideo?.id,
        });

      if (insertError) {
        console.error(`Error creating report for ${gamemode.name}:`, insertError);
        continue;
      }

      // Update the project brain with new insights
      try {
        const brainResponse = await fetch(`${supabaseUrl}/functions/v1/update-project-brain`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseServiceKey}`,
          },
          body: JSON.stringify({
            gamemodeId: gamemode.id,
            updateType: 'weekly_report',
            data: { recommendations },
          }),
        });
        
        if (brainResponse.ok) {
          console.log(`Brain updated for ${gamemode.name}`);
        } else {
          console.warn(`Failed to update brain for ${gamemode.name}:`, await brainResponse.text());
        }
      } catch (brainError) {
        console.warn(`Error updating brain for ${gamemode.name}:`, brainError);
      }

      console.log(`Created weekly report for ${gamemode.name} with ${videos.length} videos`);
      results.push({ gamemode: gamemode.name, status: 'created', videosAnalyzed: videos.length });
    }

    return new Response(JSON.stringify({ 
      success: true, 
      results,
      reportWeek: reportWeek.toISOString().split('T')[0]
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('Error generating weekly reports:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust for Monday start
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getTopItems(videos: VideoPerformance[], textField: 'hook_text' | 'cta_text', scoreField: 'hook_score' | 'cta_score') {
  const items: Record<string, { count: number; totalScore: number; totalViews: number }> = {};
  
  for (const video of videos) {
    const text = video[textField];
    if (!text) continue;
    
    if (!items[text]) {
      items[text] = { count: 0, totalScore: 0, totalViews: 0 };
    }
    items[text].count++;
    items[text].totalScore += video[scoreField] || 0;
    items[text].totalViews += video.youtube_views || 0;
  }

  return Object.entries(items)
    .map(([text, data]) => ({
      text,
      avgScore: data.totalScore / data.count,
      avgViews: data.totalViews / data.count,
      uses: data.count,
    }))
    .sort((a, b) => b.avgViews - a.avgViews)
    .slice(0, 5);
}

function getStyleBreakdown(videos: VideoPerformance[]) {
  const styles: Record<string, { count: number; totalScore: number; totalViews: number }> = {};
  
  for (const video of videos) {
    const style = video.editing_style_name || 'unknown';
    if (!styles[style]) {
      styles[style] = { count: 0, totalScore: 0, totalViews: 0 };
    }
    styles[style].count++;
    styles[style].totalScore += video.editing_style_score || 0;
    styles[style].totalViews += video.youtube_views || 0;
  }

  return Object.entries(styles)
    .map(([style, data]) => ({
      style,
      avgScore: data.totalScore / data.count,
      avgViews: data.totalViews / data.count,
      uses: data.count,
    }))
    .sort((a, b) => b.avgViews - a.avgViews);
}

async function analyzeWithAI(videos: VideoPerformance[], apiKey: string, gamemodeName: string) {
  const prompt = `Analyze this YouTube Shorts video performance data for the "${gamemodeName}" gamemode and generate optimization recommendations.

VIDEO DATA (${videos.length} videos):
${videos.slice(0, 20).map(v => `
- Title: "${v.video_title || 'Unknown'}"
  Hook: "${v.hook_text}" (Score: ${v.hook_score || 'N/A'})
  CTA: "${v.cta_text}" (Score: ${v.cta_score || 'N/A'})
  Style: "${v.editing_style_name}" (Score: ${v.editing_style_score || 'N/A'})
  Views: ${v.youtube_views}, Likes: ${v.youtube_likes}
  Retention: ${v.youtube_avg_view_percentage ? v.youtube_avg_view_percentage + '%' : 'N/A'}
`).join('')}

Respond with a JSON object containing these recommendations:
{
  "title_optimization": {
    "pattern": "describe the best title pattern observed",
    "examples": ["example title 1", "example title 2"],
    "confidence": 0-100
  },
  "description_optimization": {
    "template": "recommended description template with placeholders",
    "keywords_to_include": ["keyword1", "keyword2"],
    "confidence": 0-100
  },
  "tags_optimization": {
    "add_tags": ["recommended tags based on top performers"],
    "remove_tags": ["tags that correlate with low performance"],
    "confidence": 0-100
  },
  "hook_style": {
    "recommended": "question|bold_claim|mystery|controversy|relatable",
    "reasoning": "why this style works best",
    "example_hooks": ["best hook 1", "best hook 2"],
    "confidence": 0-100
  },
  "cta_style": {
    "recommended": "best performing CTA approach",
    "timing": "when to place CTA",
    "example_ctas": ["best cta 1", "best cta 2"],
    "confidence": 0-100
  },
  "editing_style": {
    "recommended": "best performing editing style",
    "clip_length": "optimal clip length",
    "confidence": 0-100
  },
  "key_insight": "One sentence summary of the most important finding"
}`;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'You are a YouTube analytics expert. Analyze video performance data and provide actionable optimization recommendations. Always respond with valid JSON only.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.3,
        response_format: { type: 'json_object' }
      }),
    });

    if (!response.ok) {
      console.error('OpenAI API error:', await response.text());
      return null;
    }

    const data = await response.json();
    return JSON.parse(data.choices[0].message.content);
  } catch (error) {
    console.error('Error calling OpenAI:', error);
    return null;
  }
}
