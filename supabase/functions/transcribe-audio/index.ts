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
    const { voiceoverUrl, projectId } = await req.json();
    
    const ELEVENLABS_API_KEY = Deno.env.get('ELEVENLABS_API_KEY');
    if (!ELEVENLABS_API_KEY) {
      throw new Error('ELEVENLABS_API_KEY is not configured');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log(`Transcribing voiceover for project ${projectId}`);

    // Download the voiceover file
    const audioResponse = await fetch(voiceoverUrl);
    if (!audioResponse.ok) {
      throw new Error(`Failed to download voiceover: ${audioResponse.status}`);
    }
    
    const audioBuffer = await audioResponse.arrayBuffer();
    const audioBlob = new Blob([audioBuffer], { type: 'audio/mpeg' });

    // Use ElevenLabs Speech-to-Text API
    const formData = new FormData();
    formData.append('file', audioBlob, 'voiceover.mp3');
    formData.append('model_id', 'scribe_v1');
    formData.append('timestamps_granularity', 'word');
    formData.append('diarize', 'false');

    const transcribeResponse = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
      method: 'POST',
      headers: {
        'xi-api-key': ELEVENLABS_API_KEY,
      },
      body: formData,
    });

    if (!transcribeResponse.ok) {
      const errorText = await transcribeResponse.text();
      console.error('ElevenLabs transcription error:', errorText);
      throw new Error(`Transcription failed: ${transcribeResponse.status}`);
    }

    const transcriptionData = await transcribeResponse.json();
    console.log('Transcription received:', JSON.stringify(transcriptionData).substring(0, 200));

    // Extract word-level timestamps for karaoke subtitles
    // ElevenLabs returns: { text: string, words: [{ text: string, start: number, end: number }] }
    const words = transcriptionData.words || [];
    const fullText = transcriptionData.text || '';

    // Update voiceover with transcript
    const { error: updateError } = await supabase
      .from('voiceovers')
      .update({ transcript: fullText })
      .eq('project_id', projectId);

    if (updateError) {
      console.error('Failed to update voiceover transcript:', updateError);
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        text: fullText,
        words: words, // Word-level timestamps for karaoke
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Transcription error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
