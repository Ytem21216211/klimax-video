import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const openaiKey = Deno.env.get('OPENAI_API_KEY')!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get all gamemodes that have competitors
    const { data: gamemodes, error: gamemodesError } = await supabase
      .from('gamemodes')
      .select(`
        id,
        user_id,
        name,
        competitor_channels (id)
      `);

    if (gamemodesError) throw gamemodesError;

    const gameModesWithCompetitors = gamemodes?.filter(g => 
      g.competitor_channels && (g.competitor_channels as any[]).length > 0
    ) || [];

    console.log(`Processing ${gameModesWithCompetitors.length} gamemodes with competitors`);

    const reportWeek = getWeekStart(new Date());
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    const results: { gamemode: string; status: string; videosAnalyzed?: number }[] = [];

    for (const gamemode of gameModesWithCompetitors) {
      // Check if report already exists
      const { data: existingReport } = await supabase
        .from('competitor_reports')
        .select('id')
        .eq('user_id', gamemode.user_id)
        .eq('gamemode_id', gamemode.id)
        .eq('report_week', reportWeek.toISOString().split('T')[0])
        .single();

      if (existingReport) {
        results.push({ gamemode: gamemode.name, status: 'already_exists' });
        continue;
      }

      // Get all competitor channels for this gamemode
      const { data: competitors } = await supabase
        .from('competitor_channels')
        .select('id, channel_name, platform')
        .eq('user_id', gamemode.user_id)
        .eq('gamemode_id', gamemode.id);

      if (!competitors || competitors.length === 0) continue;

      // Get videos from all competitors (recent ones)
      const competitorIds = competitors.map(c => c.id);
      const { data: videos } = await supabase
        .from('competitor_videos')
        .select('*')
        .in('competitor_id', competitorIds)
        .gte('published_at', oneWeekAgo.toISOString())
        .order('view_count', { ascending: false });

      if (!videos || videos.length < 3) {
        results.push({ gamemode: gamemode.name, status: 'insufficient_data', videosAnalyzed: videos?.length || 0 });
        continue;
      }

      // Get user's own videos for comparison
      const { data: userVideos } = await supabase
        .from('video_performance')
        .select('hook_text, cta_text, editing_style_name, video_title')
        .eq('user_id', gamemode.user_id)
        .eq('gamemode_id', gamemode.id)
        .gte('created_at', oneWeekAgo.toISOString());

      // Analyze with AI
      const analysis = await analyzeCompetitors(videos, userVideos || [], openaiKey, gamemode.name);

      if (!analysis) {
        console.error(`Failed to analyze competitors for ${gamemode.name}`);
        continue;
      }

      // Create report
      const { error: insertError } = await supabase
        .from('competitor_reports')
        .insert({
          user_id: gamemode.user_id,
          gamemode_id: gamemode.id,
          report_week: reportWeek.toISOString().split('T')[0],
          status: 'pending',
          competitors_analyzed: competitors.length,
          videos_analyzed: videos.length,
          trending_topics: analysis.trending_topics,
          content_gaps: analysis.content_gaps,
          recommended_scripts: analysis.recommended_scripts,
        });

      if (insertError) {
        console.error(`Error creating competitor report for ${gamemode.name}:`, insertError);
        continue;
      }

      console.log(`Created competitor report for ${gamemode.name}`);
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
    console.error('Error generating competitor reports:', error);
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
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

async function analyzeCompetitors(
  competitorVideos: any[], 
  userVideos: any[], 
  apiKey: string, 
  gamemodeName: string
) {
  const prompt = `Analyze competitor videos for the "${gamemodeName}" gamemode and identify opportunities.

COMPETITOR VIDEOS (${competitorVideos.length} videos this week):
${competitorVideos.slice(0, 15).map(v => `
- "${v.title}"
  Views: ${v.view_count}, Likes: ${v.like_count}
  Transcript: ${v.transcript ? v.transcript.slice(0, 200) + '...' : 'N/A'}
  Tags: ${v.tags?.join(', ') || 'N/A'}
`).join('')}

USER'S OWN VIDEOS (${userVideos.length} videos):
${userVideos.slice(0, 10).map(v => `
- "${v.video_title}"
  Hook: "${v.hook_text}"
  CTA: "${v.cta_text}"
`).join('')}

Respond with JSON:
{
  "trending_topics": {
    "topics": [
      {
        "topic": "topic name",
        "mentions": number,
        "avg_views": number,
        "sample_titles": ["title1", "title2"]
      }
    ],
    "hooks_used": {
      "question": count,
      "bold_claim": count,
      "mystery": count
    },
    "avg_video_length": seconds,
    "posting_frequency": "X per week",
    "best_posting_time": "time UTC"
  },
  "content_gaps": {
    "gaps": [
      {
        "topic": "topic competitors cover that user doesn't",
        "opportunity_score": 0-100,
        "example_titles": ["title1"]
      }
    ],
    "frequency_gap": "description of posting frequency difference",
    "style_gaps": ["styles competitors use that work well"]
  },
  "recommended_scripts": {
    "scripts": [
      {
        "title_idea": "suggested video title",
        "hook": "suggested hook text",
        "script_outline": "brief outline of what the video should cover",
        "inspired_by": ["competitor video titles that inspired this"],
        "confidence": 0-100,
        "copy_level": "inspired|adaptation|full_copy"
      }
    ]
  }
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
          { role: 'system', content: 'You are a competitive intelligence analyst for YouTube content creators. Identify trends, gaps, and opportunities. Always respond with valid JSON only.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.4,
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
