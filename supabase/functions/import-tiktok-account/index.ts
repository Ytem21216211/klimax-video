import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// TikTok Account Import v8 - Apify TikTok Scraper (reliable, pay-per-use)

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MIN_VIEWS = 10000;
const MAX_VIDEOS_TO_FETCH = 30;

interface TikTokVideo {
  id: string;
  title: string;
  playCount: number;
  videoUrl?: string;
  audioUrl?: string;
  originalUrl: string;
}

function extractUsername(urlOrUsername: string): string | null {
  const input = urlOrUsername.trim();
  const patterns = [/tiktok\.com\/@([^/?]+)/i, /tiktok\.com\/([^/@][^/?]+)/i];

  for (const pattern of patterns) {
    const match = input.match(pattern);
    if (match) return match[1].replace("@", "");
  }

  if (!input.includes("/") && !input.includes(".")) {
    return input.replace("@", "");
  }

  return null;
}

async function fetchAccountVideosWithApify(username: string): Promise<TikTokVideo[]> {
  console.log(`Fetching videos for TikTok account: @${username} using Apify`);

  const APIFY_API_TOKEN = Deno.env.get("APIFY_API_TOKEN");
  if (!APIFY_API_TOKEN) {
    throw new Error("APIFY_API_TOKEN is not configured");
  }

  // Use the Apify TikTok Scraper actor
  // Actor ID: OtzYfK1ndEGdwWFKQ (clockworks/free-tiktok-scraper) - free tier friendly
  // Alternative: GdWCkxBtKWOsKjdch (apify/tiktok-scraper) - more robust
  const actorId = "clockworks~free-tiktok-scraper";
  
  const runUrl = `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?token=${APIFY_API_TOKEN}`;

  console.log(`Starting Apify actor run for @${username}...`);

  const response = await fetch(runUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      profiles: [`https://www.tiktok.com/@${username}`],
      resultsPerPage: MAX_VIDEOS_TO_FETCH,
      shouldDownloadVideos: false,
      shouldDownloadCovers: false,
      shouldDownloadSubtitles: false,
      shouldDownloadSlideshowImages: false,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`Apify API error (${response.status}):`, errorText);
    
    if (response.status === 401) {
      throw new Error("Invalid Apify API token. Please check your APIFY_API_TOKEN.");
    }
    if (response.status === 402) {
      throw new Error("Apify account has insufficient credits. Please add credits to your Apify account.");
    }
    
    throw new Error(`Apify scraper failed: ${response.status} - ${errorText.substring(0, 200)}`);
  }

  const results = await response.json();
  console.log(`Apify returned ${results.length} items`);

  if (!Array.isArray(results) || results.length === 0) {
    console.log("No videos returned from Apify");
    return [];
  }

  // Log first item structure for debugging
  if (results.length > 0) {
    console.log("Sample item structure:", JSON.stringify(results[0], null, 2).substring(0, 2000));
  }

  // Map Apify results to our TikTokVideo format
  const videos: TikTokVideo[] = [];

  for (const item of results) {
    // Skip non-video items (profile info, etc.)
    if (!item.id && !item.videoId && !item.aweme_id) continue;

    const id = item.id || item.videoId || item.aweme_id || item.awemeId || "";
    if (!id) continue;

    // Try multiple paths for play count (Apify free scraper uses different keys)
    const playCount = 
      item.playCount || 
      item.plays || 
      item.play_count ||
      item.stats?.playCount ||
      item.stats?.play_count ||
      item.statistics?.play_count ||
      item.videoMeta?.playCount || 
      item.diggCount || // fallback to likes if no plays
      0;

    console.log(`Video ${id}: playCount=${playCount} (raw: plays=${item.plays}, playCount=${item.playCount}, play_count=${item.play_count})`);

    // Only include videos with MIN_VIEWS+ plays
    if (playCount < MIN_VIEWS) continue;

    const title = 
      item.text || 
      item.desc || 
      item.description || 
      "TikTok Video";

    const audioUrl = 
      item.musicMeta?.playUrl || 
      item.music?.playUrl ||
      "";

    // In many Apify scrapers, direct MP4 urls may be omitted unless downloads are enabled.
    // We can still transcribe reliably using the musicMeta.playUrl.
    const videoUrl =
      item.videoUrl ||
      item.downloadUrl ||
      item.video?.downloadAddr ||
      item.videoMeta?.downloadAddr ||
      item.videoMeta?.playAddr ||
      item.video?.playAddr ||
      "";

    if (!audioUrl && !videoUrl) {
      console.log(`Skipping ${id}: missing both audioUrl and videoUrl`);
      continue;
    }

    videos.push({
      id: String(id),
      title: String(title).substring(0, 200),
      playCount: Number(playCount),
      videoUrl: videoUrl ? String(videoUrl) : undefined,
      audioUrl: audioUrl ? String(audioUrl) : undefined,
      originalUrl: item.webVideoUrl || `https://www.tiktok.com/@${username}/video/${id}`,
    });
  }

  console.log(`Found ${videos.length} videos with ${MIN_VIEWS.toLocaleString()}+ views`);
  return videos;
}

async function transcribeVideo(video: TikTokVideo, elevenLabsKey: string): Promise<string> {
  // IMPORTANT: Prefer video URL over audio URL!
  // The audioUrl is typically the background MUSIC track (TikTok sound),
  // NOT the spoken voiceover. We want to transcribe the actual video
  // which contains the creator's speech mixed with any music.
  const mediaUrl = video.videoUrl || video.audioUrl;
  if (!mediaUrl) {
    throw new Error("No media URL available for transcription");
  }
  const isAudio = !video.videoUrl && !!video.audioUrl;

  console.log(`Downloading ${isAudio ? "audio (fallback)" : "video"} for: ${video.title.substring(0, 50)}`);

  const mediaResponse = await fetch(mediaUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      Referer: "https://www.tiktok.com/",
    },
  });

  if (!mediaResponse.ok) {
    throw new Error(`Failed to download media (${mediaResponse.status})`);
  }

  const mediaBuffer = await mediaResponse.arrayBuffer();
  if (mediaBuffer.byteLength < 1000) {
    throw new Error("Downloaded file is too small");
  }

  const mediaBlob = new Blob([mediaBuffer], {
    type: isAudio ? "audio/mpeg" : "video/mp4",
  });

  console.log("Transcribing with ElevenLabs...");

  const formData = new FormData();
  formData.append("file", mediaBlob, isAudio ? "audio.mp3" : "video.mp4");
  formData.append("model_id", "scribe_v1");

  const transcribeResponse = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
    method: "POST",
    headers: {
      "xi-api-key": elevenLabsKey,
    },
    body: formData,
  });

  if (!transcribeResponse.ok) {
    const errorText = await transcribeResponse.text();
    console.error("ElevenLabs error:", errorText);
    throw new Error("Failed to transcribe audio");
  }

  const transcriptionData = await transcribeResponse.json();
  return transcriptionData.text || "";
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { accountUrl, gamemodeId } = await req.json();
    console.log(`Importing TikTok account: ${accountUrl} for gamemode: ${gamemodeId}`);

    const username = extractUsername(accountUrl);
    if (!username) {
      throw new Error(
        "Invalid TikTok account URL. Please use format: https://www.tiktok.com/@username (or just @username)"
      );
    }

    const authHeader = req.headers.get("authorization");
    if (!authHeader) throw new Error("Missing authorization header");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) throw new Error("Authentication required");

    const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY");
    if (!ELEVENLABS_API_KEY) throw new Error("ELEVENLABS_API_KEY is not configured");

    const videos = await fetchAccountVideosWithApify(username);

    if (videos.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: `No videos with ${MIN_VIEWS.toLocaleString()}+ views found for @${username}`,
          imported: 0,
          skipped: 0,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Found ${videos.length} videos with ${MIN_VIEWS.toLocaleString()}+ views`);

    const supabaseService = createClient(
      supabaseUrl,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: existingScripts } = await supabaseService
      .from("training_scripts")
      .select("source_url")
      .eq("user_id", user.id);

    const existingUrls = new Set(existingScripts?.map((s: any) => s.source_url) || []);

    const results = {
      imported: 0,
      skipped: 0,
      errors: [] as string[],
    };

    for (const video of videos) {
      if (existingUrls.has(video.originalUrl)) {
        console.log(`Skipping already imported: ${video.id}`);
        results.skipped++;
        continue;
      }

      try {
        const transcript = await transcribeVideo(video, ELEVENLABS_API_KEY);
        if (!transcript || transcript.trim().length === 0) {
          console.log(`No speech detected in: ${video.id}`);
          results.errors.push(`${video.title.substring(0, 30)}: No speech detected`);
          continue;
        }

        const { error: insertError } = await supabaseService
          .from("training_scripts")
          .insert({
            user_id: user.id,
            gamemode_id: gamemodeId,
            source_url: video.originalUrl,
            title: `${video.title.substring(0, 80)} (${(video.playCount / 1000).toFixed(0)}k views)`,
            transcript,
          });

        if (insertError) {
          console.error(`Failed to save script for ${video.id}:`, insertError);
          results.errors.push(`${video.title.substring(0, 30)}: Database error`);
          continue;
        }

        console.log(`Imported: ${video.id} with ${video.playCount} views`);
        results.imported++;
      } catch (videoError: any) {
        console.error(`Error processing video ${video.id}:`, videoError);
        results.errors.push(`${video.title.substring(0, 30)}: ${videoError.message}`);
      }
    }

    console.log(
      `Import complete: ${results.imported} imported, ${results.skipped} skipped, ${results.errors.length} errors`
    );

    return new Response(
      JSON.stringify({
        success: true,
        message: `Imported ${results.imported} scripts from @${username}`,
        imported: results.imported,
        skipped: results.skipped,
        errors: results.errors,
        totalFound: videos.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error importing TikTok account:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
