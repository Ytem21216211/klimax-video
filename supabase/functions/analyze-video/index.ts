import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { url, platform } = await req.json();
    
    console.log(`Analyzing ${platform} video:`, url);
    
    // Get authorization header
    const authHeader = req.headers.get('authorization');
    if (!authHeader) throw new Error('Missing authorization header');

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_PUBLISHABLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } }
    });

    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) throw new Error('Authentication required');

    // Use AI to analyze video URL and extract metadata
    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
    if (!OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is not configured');
    }

    const aiPrompt = `Analyze this ${platform} video URL: ${url}

Extract and provide:
1. Video title (estimated from URL)
2. Likely content tags (e.g., "minecraft", "pvp", "tutorial")
3. Estimated average clip length for this type of content
4. Common editing patterns for similar videos
5. Subtitle style recommendations
6. Pacing recommendations (fast/medium/slow)
7. Common transition types used

Provide response as JSON with these fields: title, tags, averageClipLength, editingPatterns, subtitleStyle, pacing, transitions.`;

    console.log("Calling AI for video analysis...");

    const aiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { 
            role: 'system', 
            content: 'You are a video content analyst. Always respond with valid JSON.' 
          },
          { role: 'user', content: aiPrompt }
        ],
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('AI API error:', aiResponse.status, errorText);
      throw new Error('AI analysis failed');
    }

    const aiData = await aiResponse.json();
    const analysisResult = aiData.choices[0].message.content;

    console.log("AI analysis complete:", analysisResult);

    // Parse AI response
    let analysis;
    try {
      // Try to extract JSON from the response
      const jsonMatch = analysisResult.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        analysis = JSON.parse(jsonMatch[0]);
      } else {
        analysis = JSON.parse(analysisResult);
      }
    } catch (e) {
      // If parsing fails, create a structured response
      analysis = {
        title: "Analyzed Video",
        tags: ["minecraft", "gaming"],
        averageClipLength: 5,
        editingPatterns: analysisResult,
        subtitleStyle: "kinetic",
        pacing: "fast",
        transitions: ["cut", "fade"]
      };
    }

    // Save analysis to database
    const { data: savedImport, error: insertError } = await supabase
      .from('imports')
      .insert({
        user_id: user.id,
        source_platform: platform,
        source_url: url,
        title: analysis.title || 'Analyzed Video',
        analysis_data: analysis,
        tags: analysis.tags || [],
        average_clip_length: analysis.averageClipLength || 5,
      })
      .select()
      .single();

    if (insertError) throw insertError;

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Video analyzed successfully',
        analysis: savedImport,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error analyzing video:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
