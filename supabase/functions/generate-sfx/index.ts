import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { projectId, transitionCount } = await req.json();

    const ELEVENLABS_API_KEY = Deno.env.get('ELEVENLABS_API_KEY');
    if (!ELEVENLABS_API_KEY) {
      throw new Error('ELEVENLABS_API_KEY is not configured');
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('Missing authorization header');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const authSupabase = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: { user }, error: userError } = await authSupabase.auth.getUser();
    if (userError || !user) throw new Error('Authentication required');

    const { data: project, error: authProjectError } = await authSupabase
      .from('projects')
      .select('id')
      .eq('id', projectId)
      .eq('user_id', user.id)
      .single();

    if (authProjectError || !project) {
      throw new Error('Unauthorized to access or modify this project');
    }

    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log(`Generating ${transitionCount} transition SFX for project ${projectId}`);

    // Generate a whoosh/impact transition sound
    const sfxPrompt = "quick dramatic cinematic whoosh transition sound effect, punchy impact, professional video editing";

    const response = await fetch('https://api.elevenlabs.io/v1/sound-generation', {
      method: 'POST',
      headers: {
        'xi-api-key': ELEVENLABS_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: sfxPrompt,
        duration_seconds: 0.8, // Short transition sound
        prompt_influence: 0.5,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('ElevenLabs SFX error:', errorText);
      throw new Error(`ElevenLabs API error: ${response.status}`);
    }

    const audioBuffer = await response.arrayBuffer();
    const audioBytes = new Uint8Array(audioBuffer);

    // Upload to Supabase storage
    const fileName = `sfx/transition_${projectId}_${Date.now()}.mp3`;

    const { data: uploadData, error: uploadError } = await supabase
      .storage
      .from('voiceovers') // Reuse voiceovers bucket for audio
      .upload(fileName, audioBytes, {
        contentType: 'audio/mpeg',
        upsert: true,
      });

    if (uploadError) {
      console.error('Storage upload error:', uploadError);
      throw new Error(`Failed to upload SFX: ${uploadError.message}`);
    }

    // Get signed URL for the SFX
    const { data: signedData, error: signedError } = await supabase
      .storage
      .from('voiceovers')
      .createSignedUrl(fileName, 3600);

    if (signedError || !signedData?.signedUrl) {
      throw new Error('Failed to create signed URL for SFX');
    }

    console.log('SFX generated and uploaded successfully');

    return new Response(
      JSON.stringify({
        success: true,
        sfxUrl: signedData.signedUrl,
        duration: 0.8,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('SFX generation error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
