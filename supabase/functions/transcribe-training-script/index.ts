import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Use TikWM API to extract video download URL
async function extractTikTokVideo(tiktokUrl: string): Promise<{ videoUrl: string; title: string; audioUrl?: string }> {
  console.log("Extracting TikTok video from:", tiktokUrl);
  
  try {
    // Use TikWM API - a free TikTok video download service
    const apiUrl = `https://www.tikwm.com/api/?url=${encodeURIComponent(tiktokUrl)}`;
    
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    if (!response.ok) {
      console.error("TikWM API failed:", response.status);
      throw new Error("Failed to fetch video info");
    }

    const data = await response.json();
    console.log("TikWM response:", JSON.stringify(data).substring(0, 300));

    if (data.code !== 0 || !data.data) {
      throw new Error(data.msg || "Failed to extract video");
    }

    const videoData = data.data;
    
    // TikWM provides both video and audio URLs
    return {
      videoUrl: videoData.play || videoData.hdplay || videoData.wmplay,
      audioUrl: videoData.music,
      title: videoData.title || "TikTok Video",
    };
  } catch (e) {
    console.error("TikWM extraction error:", e);
    
    // Fallback: Try alternative API
    try {
      console.log("Trying alternative API...");
      const altApiUrl = `https://api.tikmate.app/api/lookup?url=${encodeURIComponent(tiktokUrl)}`;
      
      const altResponse = await fetch(altApiUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
      });

      if (altResponse.ok) {
        const altData = await altResponse.json();
        if (altData.video_url) {
          return {
            videoUrl: altData.video_url,
            title: altData.author_name || "TikTok Video",
          };
        }
      }
    } catch (altError) {
      console.error("Alternative API also failed:", altError);
    }
    
    throw new Error("Could not extract video from TikTok");
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { url, gamemodeId } = await req.json();

    console.log(`Transcribing video from: ${url} for gamemode: ${gamemodeId}`);

    // Get authorization header
    const authHeader = req.headers.get('authorization');
    if (!authHeader) throw new Error('Missing authorization header');

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } }
    });

    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) throw new Error('Authentication required');

    // Get ElevenLabs API key for transcription
    const ELEVENLABS_API_KEY = Deno.env.get('ELEVENLABS_API_KEY');
    if (!ELEVENLABS_API_KEY) {
      throw new Error('ELEVENLABS_API_KEY is not configured');
    }

    // Extract TikTok video URL
    const { videoUrl, audioUrl, title } = await extractTikTokVideo(url);
    
    if (!videoUrl && !audioUrl) {
      throw new Error('Could not get video or audio URL from TikTok');
    }

    // Prefer audio URL if available (smaller file, faster processing)
    const mediaUrl = audioUrl || videoUrl;
    const isAudio = !!audioUrl;
    
    console.log(`Downloading ${isAudio ? 'audio' : 'video'} from:`, mediaUrl.substring(0, 100));

    // Download the media file
    const mediaResponse = await fetch(mediaUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://www.tiktok.com/',
      },
    });

    if (!mediaResponse.ok) {
      console.error("Failed to download media:", mediaResponse.status);
      throw new Error('Failed to download video/audio from TikTok');
    }

    const mediaBuffer = await mediaResponse.arrayBuffer();
    console.log("Downloaded media, size:", mediaBuffer.byteLength);

    if (mediaBuffer.byteLength < 1000) {
      throw new Error('Downloaded file is too small, possibly blocked');
    }

    // Create blob for transcription
    const mediaBlob = new Blob([mediaBuffer], { 
      type: isAudio ? 'audio/mpeg' : 'video/mp4' 
    });

    console.log("Transcribing with ElevenLabs...");

    // Use ElevenLabs Speech-to-Text API
    const formData = new FormData();
    formData.append('file', mediaBlob, isAudio ? 'tiktok_audio.mp3' : 'tiktok_video.mp4');
    formData.append('model_id', 'scribe_v1');

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
      throw new Error('Failed to transcribe audio');
    }

    const transcriptionData = await transcribeResponse.json();
    const transcript = transcriptionData.text || "";
    
    console.log("Transcription successful:", transcript.substring(0, 100));

    if (!transcript || transcript.trim().length === 0) {
      throw new Error('No speech detected in the video');
    }

    // Save to training_scripts table using service role for insert
    const supabaseService = createClient(
      supabaseUrl,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: savedScript, error: insertError } = await supabaseService
      .from('training_scripts')
      .insert({
        user_id: user.id,
        gamemode_id: gamemodeId,
        source_url: url,
        title: title.substring(0, 100),
        transcript: transcript,
      })
      .select()
      .single();

    if (insertError) throw insertError;

    console.log("Training script saved successfully:", savedScript.id);

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Video transcribed successfully',
        script: savedScript,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error transcribing video:', error);
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
