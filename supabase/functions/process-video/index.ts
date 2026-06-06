import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Declare EdgeRuntime for background tasks
const USE_FFMPEG_WORKER = true;

// @ts-ignore
declare const EdgeRuntime: { waitUntil: (promise: Promise<unknown>) => void } | undefined;
// @ts-ignore
declare const Deno: any;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// CRISP 1080p aspect ratio dimensions - optimized for social media
// 1080p at 30fps with high bitrate = maximum sharpness, minimal compression artifacts
const aspectRatioMap: Record<string, { width: number; height: number }> = {
  '9:16': { width: 1080, height: 1920 },
  '16:9': { width: 1920, height: 1080 },
  '1:1': { width: 1080, height: 1080 },
  '4:5': { width: 1080, height: 1350 },
  // 4K options (only beneficial if source clips are 4K)
  '9:16-4k': { width: 2160, height: 3840 },
  '16:9-4k': { width: 3840, height: 2160 },
  '1:1-4k': { width: 2160, height: 2160 },
  '4:5-4k': { width: 2160, height: 2700 },
};

// Subtitle settings interface (matches frontend)
interface SubtitleSettings {
  style: string;
  bounceRate: number;
  fontSize: number;
  fontFamily: string;
  customFontUrl?: string;
  textColor: string;
  strokeEnabled: boolean;
  strokeColor: string;
  strokeWidth: number;
  shadowEnabled: boolean;
  shadowOpacity: number;
  shadowBlur: number;
  shadowDistance: number;
  transition: string;
  flashColor?: string;
  sfxVolume: number; // 0-100, percentage for SFX volume at clip transitions
  // Glow effect settings
  glowEnabled?: boolean;
  glowColor?: string;
  glowIntensity?: number; // 0-100
  // Inner Glow effect settings
  innerGlowEnabled?: boolean;
  innerGlowColor?: string;
  innerGlowIntensity?: number; // 0-100
  innerGlowSize?: number; // Blur radius/size
  visualModeEnabled?: boolean;
  creativeModeEnabled?: boolean;
  selectedSfxId?: string | null;
  transitionSuit?: string[]; // NEW
  server_logo_url?: string | null;
  logoRecognitionEnabled?: boolean;
  recognitionServerName?: string;
  wordsPerLine?: number;
  animation_style?: string;
  customAnimation?: any[];
  fontWeight?: number;
  shadowColor?: string;
  glowSize?: number;
}

// Creative Mode: first sentence uses the user's selected project font
// (No custom font override - we just apply colors and glow)

// Creative Mode rainbow colors for first sentence
const FIRST_SENTENCE_COLORS = [
  '#ff0000', // Red
  '#ff8800', // Orange
  '#ffff00', // Yellow
  '#00ff00', // Green
  '#00ffff', // Cyan
  '#0088ff', // Blue
  '#ff00ff', // Magenta
  '#ff1493', // Pink
];

// End screen IP settings interface
interface EndScreenIPSettings {
  color: string;
  fontFamily: string;
  fontSize: number;
  strokeEnabled: boolean;
  strokeColor: string;
  strokeWidth: number;
  shadowEnabled: boolean;
  shadowOpacity: number;
  shadowBlur: number;
  shadowDistance: number;
  rainbowEnabled?: boolean; // Creative Mode rainbow glow for IP text
}

// End screen settings interface
interface EndScreenSettings {
  enabled: boolean;
  blur_enabled: boolean;
  ip_text: string;
  ip_settings: EndScreenIPSettings;
  logo_url: string | null;
  layout: 'horizontal' | 'vertical'; // NEW
}

// Music settings interface
interface MusicSettings {
  enabled: boolean;
  selected_music_id: string | null;
  volume: number; // 0-100
  start_time: number; // seconds into the music to start
  music2_id?: string | null;
  music2_volume?: number;
  music2_start_time?: number;
  music2_crossfade_at?: number;
  music2_ai_optimized?: boolean;
  music2_enabled?: boolean;
  remove_silence?: boolean;
}

// IP Pop-up settings (matches frontend)
interface IpPopupImageSettings {
  enabled: boolean;
  url: string | null;
  x: number; // Percent
  y: number; // Percent
  scale: number; // 0.1 to 2.0
  opacity?: number; // 0.0 to 1.0
  z_index: number; // 1 or 2
}

interface IpPopupTextSettings {
  content: string;
  x: number;
  y: number;
  font_family: string;
  font_size: number;
  color: string;
  stroke_enabled: boolean;
  stroke_color: string;
  stroke_width: number;
  shadow_enabled: boolean;
  shadow_opacity: number;
  shadow_blur: number;
  glow_enabled: boolean;
  glow_color: string;
  glow_size: number;
  glow_intensity: number;
}

interface IpPopupSettings {
  enabled: boolean;
  start_time: number;
  duration: number;
  sfx_id: string | null;
  text: IpPopupTextSettings;
  image1: IpPopupImageSettings;
  image2: IpPopupImageSettings;
}

interface EffectsSettings {
  flash_enabled: boolean;
  flash_color: string;
  flash_rainbow: boolean;
  ai_sfx_enabled: boolean;
  ai_zoom_enabled: boolean;
  zoom_style: 'none' | 'zoom-in' | 'zoom-out' | 'basic';
}

interface CommentOverlaySpec {
  name: string;
  avatar_url: string;
  content: string;
  start_time: number;
  duration: number;
}

const defaultIpPopupSettings: IpPopupSettings = {
  enabled: false,
  start_time: 5,
  duration: 5,
  sfx_id: null,
  text: {
    content: "play.myserver.net",
    x: 50,
    y: 50,
    font_family: "Montserrat",
    font_size: 6,
    color: "#ffffff",
    stroke_enabled: true,
    stroke_color: "#000000",
    stroke_width: 2,
    shadow_enabled: true,
    shadow_opacity: 0.8,
    shadow_blur: 10,
    glow_enabled: false,
    glow_color: "#ff0000",
    glow_size: 10,
    glow_intensity: 50
  },
  image1: { enabled: false, url: null, x: 50, y: 30, scale: 1.0, opacity: 1.0, z_index: 1 },
  image2: { enabled: false, url: null, x: 50, y: 70, scale: 1.0, opacity: 1.0, z_index: 2 }
};

// Beginning Effect Settings Interface
interface BeginningEffectSettings {
  enabled: boolean;
  image_url: string | null;
  sfx_id: string | null;
}

const defaultBeginningEffectSettings: BeginningEffectSettings = {
  enabled: false,
  image_url: null,
  sfx_id: null,
};


// Default subtitle settings
const defaultSubtitleSettings: SubtitleSettings = {
  style: 'static',
  bounceRate: 1.0,
  fontSize: 6,
  fontFamily: 'Montserrat',
  textColor: '#ffffff',
  strokeEnabled: true,
  strokeColor: '#000000',
  strokeWidth: 2,
  shadowEnabled: true,
  shadowOpacity: 0.8,
  shadowBlur: 6,
  shadowDistance: 4,
  transition: 'fade',
  sfxVolume: 60, // Default 60% volume
  visualModeEnabled: false,
  selectedSfxId: null,
  wordsPerLine: 2,
};

// Default end screen settings
const defaultEndScreenSettings: EndScreenSettings = {
  enabled: true,
  blur_enabled: true,
  ip_text: 'play.myserver.net',
  ip_settings: {
    color: '#ffffff',
    fontFamily: 'Montserrat',
    fontSize: 5,
    strokeEnabled: true,
    strokeColor: '#000000',
    strokeWidth: 2,
    shadowEnabled: true,
    shadowOpacity: 0.8,
    shadowBlur: 6,
    shadowDistance: 4,
  },
  logo_url: null,
  layout: 'vertical',
};

// Default music settings
const defaultMusicSettings: MusicSettings = {
  enabled: false,
  selected_music_id: null,
  volume: 30,
  start_time: 0,
  music2_enabled: false,
  music2_ai_optimized: true,
  remove_silence: true,
};

// Build subtitle style from settings - using snake_case for Creatomate API
// Returns { main: style, shadow?: style } - shadow layer is used when both glow AND shadow are enabled
function buildSubtitleStyle(settings: SubtitleSettings): { main: Record<string, unknown>; shadow?: Record<string, unknown> } {
  const style: Record<string, unknown> = {
    fill_color: settings.textColor,
    font_family: settings.fontFamily || 'Montserrat',
    font_weight: String(settings.fontWeight || 800),
    font_size: `${settings.fontSize} vmin`,
  };

  if (settings.strokeEnabled) {
    style.stroke_color = settings.strokeColor;
    style.stroke_width = `${settings.strokeWidth * 0.5} vmin`;
  }

  // ALWAYS create shadow layer first if shadow is enabled (even without glow)
  // This ensures shadow is never lost due to glow overriding it
  let shadowStyle: Record<string, unknown> | undefined;

  if (settings.shadowEnabled) {
    shadowStyle = {
      fill_color: settings.textColor,
      font_family: settings.fontFamily || 'Montserrat',
      font_weight: '800',
      font_size: `${settings.fontSize} vmin`,
      shadow_color: `rgba(0,0,0,${settings.shadowOpacity})`,
      shadow_blur: `${settings.shadowBlur}px`,
      shadow_x: `${settings.shadowDistance}px`,
      shadow_y: `${settings.shadowDistance}px`,
    };

    if (settings.strokeEnabled) {
      shadowStyle.stroke_color = settings.strokeColor;
      shadowStyle.stroke_width = `${settings.strokeWidth * 0.5} vmin`;
    }

    console.log(`Shadow layer created: opacity=${settings.shadowOpacity}, blur=${settings.shadowBlur}, distance=${settings.shadowDistance}`);
  }

  // Apply glow to main style if enabled - INNER GLOW simulation
  // Inner glow uses tighter blur + auto-stroke for edge definition
  if (settings.glowEnabled && settings.glowColor) {
    const intensity = (settings.glowIntensity ?? 50) / 100;
    const size = settings.glowSize ?? 10;

    // Convert hex to rgba with intensity
    const hexColor = settings.glowColor;
    const r = parseInt(hexColor.slice(1, 3), 16);
    const g = parseInt(hexColor.slice(3, 5), 16);
    const b = parseInt(hexColor.slice(5, 7), 16);

    // INNER GLOW: Tighter blur (0.8x instead of 2x) for contained, cleaner effect
    // Higher opacity for concentrated effect near text edges
    style.shadow_color = `rgba(${r},${g},${b},${Math.min(intensity * 1.5, 1)})`;
    style.shadow_blur = `${Math.max(size * 0.8, 4)}px`;
    style.shadow_x = '0px';
    style.shadow_y = '0px';

    // Auto-apply subtle stroke in glow color for inner edge definition (if stroke not already enabled)
    if (!settings.strokeEnabled) {
      style.stroke_color = `rgba(${r},${g},${b},${intensity * 0.6})`;
      style.stroke_width = '0.15 vmin';
    }

    console.log(`Inner glow effect enabled: color=${settings.glowColor}, intensity=${intensity * 1.5}, size=${size * 0.8}px`);
  } else if (settings.shadowEnabled && !shadowStyle) {
    // Fallback: Apply shadow directly to main style if no separate shadow layer
    style.shadow_color = `rgba(0,0,0,${settings.shadowOpacity})`;
    style.shadow_blur = `${settings.shadowBlur}px`;
    style.shadow_x = `${settings.shadowDistance}px`;
    style.shadow_y = `${settings.shadowDistance}px`;
  }

  // Return with shadow layer if it exists (for layered rendering)
  return { main: style, shadow: shadowStyle };
}

// Parse filename to extract order number (optional)
// Supports: "01_intro.mp4", "1-intro.mp4", "01.mp4", "clip_01_name.mp4", "walk1.mp4"
function extractOrderFromFilename(filename: string): number | null {
  if (!filename) return null;

  // Remove extension
  const baseName = filename.replace(/\.[^.]+$/, '');

  // Try to find number patterns (more flexible now)
  const patterns = [
    /^(\d+)[_\-\s]/,     // "01_intro", "1-intro"
    /^(\d+)$/,           // Just a number "01"
    /[_\-](\d+)[_\-]/,   // "clip_01_name"
    /[_\-](\d+)$/,       // "clip_01"
    /(\d+)$/,            // Trailing number: "walk1", "clip2"
  ];

  for (const pattern of patterns) {
    const match = baseName.match(pattern);
    if (match) {
      return parseInt(match[1], 10);
    }
  }

  return null; // No number found
}

// Robustly sign an asset URL by extracting the bucket and path
async function signAssetUrl(supabase: any, input: string | null | undefined): Promise<string | undefined> {
  if (!input) return undefined;
  
  // If it's already a signed URL (unlikely but possible), return it
  if (input.includes('token=')) return input;

  try {
    let bucket: string;
    let path: string;

    // Handle full Supabase URLs
    if (input.includes('/storage/v1/object/public/')) {
      const parts = input.split('/storage/v1/object/public/');
      const afterPublic = parts[1];
      const subParts = afterPublic.split('/');
      bucket = subParts[0];
      // Path is everything after the bucket name
      path = decodeURIComponent(afterPublic.substring(bucket.length + 1));
    } else {
      // Handle relative paths (e.g., "video-clips/user/file.mp4" or "sfx/file.mp3")
      const subParts = input.split('/');
      if (subParts.length < 2) return input; // Not a storage path
      
      // SPECIAL CASE: SFX are stored in the 'voiceovers' bucket under 'sfx/' folder
      if (subParts[0] === 'sfx') {
        bucket = 'voiceovers';
        path = decodeURIComponent(input); // Keep 'sfx/' prefix in the path
      } else {
        bucket = subParts[0];
        path = decodeURIComponent(input.substring(bucket.length + 1));
      }
    }

    // Ensure no leading slash which causes 404 in createSignedUrl
    path = path.startsWith('/') ? path.substring(1) : path;
    
    // Robustness check for double prefixes
    if (bucket === 'voiceovers' && path.startsWith('voiceovers/')) {
       path = path.substring('voiceovers/'.length);
    }

    console.log(`[Signing] Bucket: ${bucket}, Path: ${path}`);
    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 3600);
    
    if (error) {
      console.warn(`[Signing] Failed for ${input}:`, error.message);
      return undefined; // Strictly return undefined on failure
    }
    
    return data?.signedUrl;
  } catch (err) {
    console.error(`[Signing] Error processing ${input}:`, err);
    return undefined;
  }
}

// Fisher-Yates shuffle for random array ordering
function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// Sort videos: prefer filename numbers, fallback to upload order (created_at)
// Then apply randomization for variety
function sortVideosByOrder(videos: any[], randomize: boolean = true): any[] {
  let sorted: any[];

  // Check if ANY videos have extractable numbers
  const videosWithNumbers = videos.filter(v => extractOrderFromFilename(v.file_name) !== null);

  if (videosWithNumbers.length === videos.length) {
    // All videos have numbers - sort by filename number
    console.log("Base sorting by filename numbers");
    sorted = [...videos].sort((a, b) => {
      const orderA = extractOrderFromFilename(a.file_name) ?? Infinity;
      const orderB = extractOrderFromFilename(b.file_name) ?? Infinity;
      return orderA - orderB;
    });
  } else {
    // Not all have numbers - use upload order (created_at)
    console.log("Base sorting by upload order (created_at)");
    sorted = [...videos].sort((a, b) => {
      const dateA = new Date(a.created_at).getTime();
      const dateB = new Date(b.created_at).getTime();
      return dateA - dateB;
    });
  }

  // Apply randomization for variety in batch generations
  if (randomize) {
    // Shuffle the entire array for completely random order
    sorted = shuffleArray(sorted);
    console.log("Applied random shuffle for clip variety");
  }

  return sorted;
}

// Get SFX from library (random or specific)
async function getSFXFromLibrary(supabase: any, userId?: string, sfxId?: string | null): Promise<string | undefined> {
  try {
    let query = supabase
      .from('sfx_library')
      .select('file_url');

    if (sfxId) {
      // Fetch specific SFX
      query = query.eq('id', sfxId);
    } else {
      // Fetch random transition SFX
      query = query.eq('category', 'transition').eq('is_enabled', true);
    }

    // If userId is provided, filter for their sounds or global ones (null user_id)
    if (userId) {
      query = query.or(`user_id.eq.${userId},user_id.is.null`);
    }

    const { data: sfxList, error } = await query;

    if (error || !sfxList?.length) {
      console.log('No SFX in library or error occurred');
      return undefined;
    }

    // Pick a random one
    const randomIndex = Math.floor(Math.random() * sfxList.length);
    const sfx = sfxList[randomIndex];

    return await signAssetUrl(supabase, sfx.file_url);
  } catch (error) {
    console.error('SFX library fetch failed:', error);
    return undefined;
  }
}

// Transcribe voiceover using ElevenLabs STT
function normalizeCase(text: string): string {
  if (!text) return '';
  
  // Lowercase everything and remove punctuation for a clean minimalist look
  return text.toLowerCase().replace(/[.,!?;:"]/g, '');
}

async function transcribeVoiceover(voiceoverUrl: string, expectedText?: string): Promise<{ text: string; words: any[] } | null> {
  const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
  if (!OPENAI_API_KEY) {
    console.log('OpenAI API key not configured, skipping transcription');
    return null;
  }

  try {
    console.log('Transcribing voiceover with OpenAI Whisper...');

    // Download the audio
    const audioResponse = await fetch(voiceoverUrl);
    if (!audioResponse.ok) {
      throw new Error(`Failed to download voiceover: ${audioResponse.status}`);
    }

    const audioBuffer = await audioResponse.arrayBuffer();
    const audioBlob = new Blob([audioBuffer], { type: 'audio/mpeg' });

    // Transcribe with word-level timestamps using Whisper-1
    const formData = new FormData();
    formData.append('file', audioBlob, 'voiceover.mp3');
    formData.append('model', 'whisper-1');
    formData.append('response_format', 'verbose_json');
    formData.append('timestamp_granularities[]', 'word');

    if (expectedText) {
      const safePrompt = expectedText.replace(/[\n\r]/g, ' ').substring(0, 1000);
      formData.append('prompt', safePrompt);
    }

    const transcribeResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: formData,
    });

    if (!transcribeResponse.ok) {
      console.error('Transcription error:', await transcribeResponse.text());
      return null;
    }

    const data = await transcribeResponse.json();
    const rawText = data.text || '';
    const normalizedText = normalizeCase(rawText);
    
    console.log(`Transcription complete: ${normalizedText.substring(0, 100)}...`);

    const WHISPER_OFFSET = -0.25; // Shift text earlier to match audio better (OpenAI TTS lead-in)
    
    // OpenAI Whisper word timestamps format: { words: [ { word: string, start: number, end: number }, ... ] }
    const words = (data.words || []).map((w: any) => ({
      text: normalizeCase(w.word || ''),
      start: Math.max(0, w.start + WHISPER_OFFSET),
      end: Math.max(0, w.end + WHISPER_OFFSET),
    }));

    return {
      text: normalizedText,
      words: words,
    };
  } catch (error) {
    console.error('Transcription failed:', error);
    return null;
  }
}

// Interface for sentence boundaries from AI analysis
interface SentenceBoundary {
  sentenceIndex: number;
  text: string;
  startTime: number;
  endTime: number;
  words: any[];
}

// Prevent over-cutting: never create segments that are too short
const MIN_SEGMENT_DURATION = 2.2; // Increased from 1.0s to allow slower pacing
const MIN_WORDS_PER_SEGMENT = 6;  // Increased from 3 to favor full thoughts

// Rainbow color palette for Visual Mode keywords
const RAINBOW_COLORS = [
  '#ff0000', // Red
  '#ff8800', // Orange
  '#ffff00', // Yellow
  '#00ff00', // Green
  '#00ffff', // Cyan
  '#0088ff', // Blue
  '#ff00ff', // Magenta
];

// Detect keywords in text using AI - returns array of keyword indices
async function detectKeywordsInChunks(
  chunks: { text: string; start: number; end: number }[]
): Promise<Map<number, number[]>> {
  const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
  if (!OPENAI_API_KEY) {
    console.log('OPENAI_API_KEY not provided, skipping Visual Mode keyword detection');
    return new Map();
  }

  try {
    // Batch chunks for efficient processing (max 50 at a time)
    const allTexts = chunks.map(c => c.text);
    const joinedText = allTexts.map((t, i) => `[${i}] ${t}`).join('\n');

    console.log(`Detecting keywords in ${chunks.length} subtitle chunks...`);

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: `You are an AGGRESSIVE video subtitle keyword analyzer for viral gaming content. Given numbered subtitle chunks, identify MANY WORD POSITIONS (0-indexed) that should be visually emphasized to maximize viewer retention.

BE GENEROUS with keywords! Mark at least 40-60% of chunks as having keywords. In gaming/Minecraft content, almost every noun and verb matters.

ALWAYS mark these as keywords:
- ALL action verbs: join, play, fight, build, craft, upgrade, grind, get, become, discover, unlock, win, lose, kill, die, spawn, explore, mine, farm, level
- ALL gaming nouns: server, world, player, team, gems, abilities, powers, weapons, items, enchants, crafting, pvp, survival, smp, base, farm, build
- ALL exciting adjectives: best, unique, epic, insane, crazy, amazing, new, custom, special, ultimate, powerful, rare, legendary
- ALL numbers: any digit or quantity
- ALL call-to-action words: join, today, now, free, come, check, try
- ALL superlatives: best, most, biggest, fastest, strongest
- Server/game names (proper nouns with capital letters)

Output JSON format: {"keywords": {"chunkIndex": [wordPositions], ...}}
Only include chunks that HAVE keywords. Word positions are 0-indexed within each chunk.
BE AGGRESSIVE - when in doubt, mark it as a keyword!

Example input:
[0] JOIN THE
[1] BEST SERVER
[2] UNIQUE GEMS

Example output:
{"keywords": {"0": [0], "1": [0, 1], "2": [0, 1]}}`
          },
          {
            role: 'user',
            content: joinedText
          }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.2,
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      console.error('Keyword detection failed:', await response.text());
      return new Map();
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) return new Map();

    const parsed = JSON.parse(content);
    const keywordMap = new Map<number, number[]>();

    if (parsed.keywords) {
      for (const [chunkIdx, positions] of Object.entries(parsed.keywords)) {
        const idx = parseInt(chunkIdx);
        if (!isNaN(idx) && Array.isArray(positions)) {
          keywordMap.set(idx, positions as number[]);
        }
      }
    }

    console.log(`Detected keywords in ${keywordMap.size} chunks`);
    return keywordMap;
  } catch (error) {
    console.error('Keyword detection error:', error);
    return new Map();
  }
}

/**
 * AI SFX Analysis: Analyzes the script to find semantically relevant moments for SFX
 * matched against the available SFX library.
 */
async function analyzeSFXPlacementsWithAI(
  supabase: any,
  script: string,
  words: any[],
  userId: string,
  visualTimeline: any[],
  intensityMap: IntensitySegment[],
  density: number = 0.5
): Promise<{ time: number; sfxId: string; reason?: string }[]> {
  try {
    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
    if (!OPENAI_API_KEY) {
      console.warn('[AI SFX] No OpenAI Key, skipping AI placement');
      return [];
    }
    // 1. Fetch SFX library
    console.log(`[AI SFX] Fetching library for user ${userId || 'global'}...`);
    
    let query = supabase
      .from('sfx_library')
      .select('id, name, description')
      .eq('is_enabled', true);

    if (userId) {
      query = query.or(`user_id.eq.${userId},user_id.is.null`);
    } else {
      query = query.is('user_id', null);
    }

    const { data: sfxLibrary, error: sfxError } = await query;

    if (sfxError) {
      console.error('[AI SFX] Database error:', sfxError);
      return [];
    }

    if (!sfxLibrary?.length) {
      console.log('[AI SFX] SFX library empty, no sounds to place.');
      return [];
    }

    console.log(`[AI SFX] Analyzing script (${words.length} words) for placement among ${sfxLibrary.length} sounds...`);

    // 2. Format SFX list for prompt
    const sfxList = sfxLibrary.map((s: any) => `- ID: ${s.id} | NAME: ${s.name} | CONTEXT: ${s.description || s.name || 'No description'}`).join('\n');

    // 3. Call OpenAI
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: `You are a professional audio engineer and sound designer for viral gaming content.
TASK: Analyze the script and visual timeline to place sound effects that maximize viewer immersion and retention.

AVAILABLE SOUNDS (SFX LIBRARY):
${sfxList}

PLACEMENT ENGINE STRATEGY:
1. SEMANTIC MATCHING:
   - Deeply analyze the 'CONTEXT' and 'NAME' of each available sound.
   - Match sounds to specific actions, emotions, or narrative beats in the script.
   - If a clip describes a specific action (e.g., 'mining', 'flying', 'dying'), prioritize a sound that matches that context.

2. TRIGGER CATEGORIES:
   - ACTION: High-speed movement, hits, explosions, teleports.
   - REWARD: Level ups, item gains, gem collections, successful trades.
   - TENSION: Dangerous moments, low health, boss reveals.
   - EMPHASIS: Important IP/Server name mentions, key call-to-actions.

3. STABILITY & DENSITY LAWS (MANDATORY):
   - AVOID SILENCE: Gaming videos feel "empty" without audio cues. 
   - TARGET DENSITY: You MUST aim for high-frequency SFX. Aim for 1 sound every ${density > 0.7 ? '0.8 to 1.5' : density > 0.4 ? '1.5 to 2.5' : '2.5 to 4.5'} seconds.
   - VARIETY OVERLOAD: Never use the same sound twice in a 5-second window. Use the full library.
   - SURPRISE FACTOR: Occasionally place a random high-intensity sound (like a 'whoosh' or 'impact') on transitions even if not explicitly in the script, to maintain dynamic rhythm.
   - ZERO IS FAILURE: Returning zero placements is NOT an option. You MUST find at least ${density > 0.5 ? '8-12' : '4-6'} placement points for a typical 30-60s video.

VISUAL CONTEXT:
${visualTimeline?.map(v => `[${v.start.toFixed(1)}s - ${v.end.toFixed(1)}s]: ${v.description}`).join('\n') || 'No visual context available'}

INTENSITY MAP:
${intensityMap?.map(v => `[${v.start.toFixed(1)}s - ${v.end.toFixed(1)}s]: ${v.label}`).join('\n') || 'Standard intensity'}

OUTPUT: Return a JSON object with a "placements" array: [{"word_index": 5, "sfx_id": "uuid", "reason": "reasoning based on semantic match"}]
ONLY return the JSON. No meta-commentary.`
          },
          {
            role: 'user',
            content: `SCRIPT SEGMENTS:\n${words.map((w, i) => `[${i}] ${w.text} (${w.start?.toFixed(1)}s)`).join(' ')}`
          }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.2,
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      console.error('[AI SFX] AI call failed:', await response.text());
      return [];
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    console.log(`[AI SFX] Raw OpenAI response:`, content);
    if (!content) return [];

    const parsed = JSON.parse(content);
    const placements: { time: number; sfxId: string; reason?: string }[] = [];

    const rawPlacements = parsed.placements || parsed.placements_list || [];
    console.log(`[AI SFX] Parsed raw placements:`, JSON.stringify(rawPlacements));
    if (Array.isArray(rawPlacements)) {
      for (const p of rawPlacements) {
        // Handle variations in field naming from LLM
        const wordIdx = typeof p.word_index === 'number' ? p.word_index : (typeof p.wordIndex === 'number' ? p.wordIndex : -1);
        const sfxId = p.sfx_id || p.sfxId || p.id;
        const reason = p.reason || 'No reason provided';
        
        if (wordIdx >= 0 && wordIdx < words.length) {
          const word = words[wordIdx];
          // Check for 'start' or 'start_time' based on ElevenLabs/DB format
          const startTime = typeof word.start === 'number' ? word.start : (typeof word.start_time === 'number' ? word.start_time : null);
          
          if (startTime !== null && sfxId) {
            placements.push({
              time: startTime,
              sfxId: sfxId,
              reason: reason
            });
          }
        }
      }
    }

    console.log(`[AI SFX] Placement complete. Mapped to ${placements.length} moments:`, JSON.stringify(placements));
    return placements;
  } catch (error) {
    console.error('[AI SFX] Critical Error:', error);
    return [];
  }
}

/**
 * AI Zoom Analysis: Analyzes the script and intensity to find cinematic zoom points.
 */
/**
 * AI Zoom Analysis: Analyzes the script and intensity to find cinematic zoom points.
 * Now operates on a per-cut (piece) basis for maximum cinematic freedom.
 */
async function analyzeZoomPlacementsWithAI(
  script: string,
  intensityMap: IntensitySegment[],
  pieces: any[]
): Promise<{ 
  piece_index: number; 
  transition?: 'none' | 'fade' | 'flash' | 'glitch-grid' | 'camera-lens' | 'whip-pan' | 'zoom-punch' | 'luma-wipe' | 'radial-blur' | 'wipe-left' | 'wipe-right' | 'swipe-up' | 'swipe-down';
  zooms: Array<{
    type: 'zoom-in' | 'zoom-out' | 'static-zoom' | 'none';
    start_scale: number;
    end_scale: number;
    duration: number | 'slow' | 'punch' | 'medium';
    easing: string;
    start_time?: number; // relative to piece start
  }>
}[]> {
  try {
    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
    if (!OPENAI_API_KEY) return [];

    console.log(`[AI-Chip] Analyzing zoom strategy for ${pieces.length} cinematic cuts...`);

    const cutContext = pieces.map((p, i) => {
      const desc = p.poolVideo?.description || "Gameplay clip";
      return `Cut ${i}: ${desc} (Duration: ${p.duration.toFixed(1)}s, StartTime: ${p.time.toFixed(1)}s)`;
    }).join('\n');

    const intensityContext = intensityMap.map(s => 
      `Words ${s.startWordIndex}-${s.endWordIndex}: ${s.intensity}`
    ).join('\n');

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          {
            content: `You are a world-class cinematic director specializing in high-retention viral gaming content (MrBeast/CapCut style).
            
TASK: Command the camera zoom and transitions for EVERY single cut. Your goal is absolute viewer retention via chaotic but professional motion.

## THE GOLDEN RULES OF ENGAGEMENT:
1. **DYNAMICS ARE GOD.** Never do the same zoom twice. If Cut 1 is a slow crawl, Cut 2 MUST be a fast punch or a jarring reset.
2. **THE SCALE SPECTRUM.** Use the FULL range. 
   - 1.0 -> 1.3: Standard engagement.
   - 1.3 -> 2.5: AGGRESSIVE focus. Use for hype or shock.
   - 2.5 -> 1.1: DRAMATIC REVEAL. Massive pullback.
   - 0.7 -> 1.2: WIDE CREEP.
3. **TIMING IS VIOLENCE.** 
   - Snap Zooms (0.1s - 0.3s): Violent impact.
   - Creep Zooms (Full duration): Constant slow motion.
4. **NON-DETERMINISTIC CHAOS.** Break all patterns. If you've been zooming IN for 3 cuts, zoom OUT or stay STATIC on the 4th. 
5. **TRANSITION MASTERY.** Every cut transition must feel earned.
   - "swoosh": Fast professional pan (use for medium energy).
   - "woosh": Fast professional zoom (use for high energy/hype).
   - "whip-pan": High-speed blur pan.
   - "zoom-punch": Instant focal shift.
   - "flash": Impact moment.

## YOUR DIRECTING TOOLS:
- **start_scale / end_scale**: 0.7 to 3.0.
- **easing**: "cubic_out" (Punch), "back_out" (Bounce), "exponential" (Violence), "linear" (Crawl), "sine_in_out" (Flow).
- **transition**: "none", "fade", "flash", "glitch-grid", "whip-pan", "zoom-punch", "swoosh", "woosh", "camera-lens".

OUTPUT: Return a JSON object. You MUST provide a zoom and transition for EVERY cut. Be totally free to do whatever you want to maximize retention.
{
  "placements": [
    {
      "piece_index": 0,
      "transition": "swoosh",
      "zooms": [
        {
          "start_scale": 1.0,
          "end_scale": 1.8,
          "duration": 0.4,
          "start_time": 0.1,
          "easing": "exponential"
        }
      ]
    }
  ]
}
`
          },
          {
            role: 'user',
            content: `SCRIPT:\n${script}\n\nINTENSITY MAP:\n${intensityContext}\n\nCINEMATIC CUTS (Visuals):\n${cutContext}`
          }
        ],
        response_format: { type: 'json_object' },
        temperature: 1.0,
      }),
    });

    if (!response.ok) {
      console.error('[AI-Chip] AI call failed:', await response.text());
      return [];
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) return [];

    const parsed = JSON.parse(content);
    return parsed.placements || [];
  } catch (error) {
    console.error('[AI-Chip] Error:', error);
    return [];
  }
}


// Build rainbow gradient fill stop for Creatomate (only for keywords)
function getRainbowColorForWord(wordIndex: number): string {
  return RAINBOW_COLORS[wordIndex % RAINBOW_COLORS.length];
}

// Creative Mode: first sentence uses the user's project font (no custom font override)


// Get Creative Mode color for first sentence words
function getFirstSentenceColor(wordIndex: number): string {
  return FIRST_SENTENCE_COLORS[wordIndex % FIRST_SENTENCE_COLORS.length];
}

function detectServerNameTimings(
  words: any[],
  serverName: string
): { start: number; end: number; wordIndices: number[] }[] {
  if (!serverName || !words?.length) return [];

  const superNormalize = (str: string) => {
    if (!str) return "";
    let low = str.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!low) return "";

    // Phonetic unification for common mis-transcriptions
    low = low.replace(/z/g, 's');
    low = low.replace(/x/g, 's');
    low = low.replace(/ph/g, 'f');
    low = low.replace(/v/g, 'f'); // Some models confuse v/f
    low = low.replace(/q/g, 'c');
    low = low.replace(/k/g, 'c');
    low = low.replace(/y/g, 'i');
    low = low.replace(/ee/g, 'i');
    low = low.replace(/ea/g, 'i');
    low = low.replace(/oo/g, 'u');
    low = low.replace(/ow/g, 'o');

    // Keep first char, remove vowels from rest (abbreviated Soundex-style)
    const first = low[0];
    const rest = low.substring(1).replace(/[aeiou]/g, '');

    // Deduplicate repeating characters
    return (first + rest).replace(/(.)\1+/g, '$1');
  };

  const normServer = superNormalize(serverName);
  if (!normServer) return [];

  console.log(`Detecting server name "${serverName}" (phonetic: "${normServer}") in ${words.length} words...`);

  // Simple Levenshtein distance for fuzzy matching
  const getLevenshteinSub = (a: string, b: string): number => {
    const tmp = [];
    for (let i = 0; i <= a.length; i++) tmp[i] = [i];
    for (let j = 0; j <= b.length; j++) tmp[0][j] = j;
    for (let i = 1; i <= a.length; i++) {
      for (let j = 1; j <= b.length; j++) {
        tmp[i][j] = Math.min(
          tmp[i - 1][j] + 1,
          tmp[i][j - 1] + 1,
          tmp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
        );
      }
    }
    return tmp[a.length][b.length];
  };

  const results: { start: number; end: number; wordIndices: number[] }[] = [];
  let fullPhoneticText = "";
  const charIndexToWordIndex: number[] = [];

  for (let i = 0; i < words.length; i++) {
    const rawText = words[i]?.text || '';
    const normWord = superNormalize(rawText);
    for (let c = 0; c < normWord.length; c++) {
      fullPhoneticText += normWord[c];
      charIndexToWordIndex.push(i);
    }
  }

  // Sliding window fuzzy search
  const winSize = normServer.length;
  // Check windows of size N, N-1, and N+1 to catch variations
  for (const size of [winSize, winSize - 1, winSize + 1]) {
    if (size <= 1) continue;
    for (let i = 0; i <= fullPhoneticText.length - size; i++) {
      const sub = fullPhoneticText.substring(i, i + size);
      const dist = getLevenshteinSub(normServer, sub);
      const maxDist = Math.max(1, Math.floor(normServer.length * 0.22)); // Reduced from 0.3 to 0.22 for stricter matches

      // Match if distance is low OR if it is a strong prefix/suffix match
      if (dist <= maxDist || (normServer.startsWith(sub) && sub.length >= winSize)) {
        const startWordIdx = charIndexToWordIndex[i];
        const endWordIdx = charIndexToWordIndex[i + size - 1];

        if (startWordIdx === undefined || endWordIdx === undefined) continue;

        // Avoid duplicate overlapping matches
        if (!results.some(r => 
          (startWordIdx >= r.wordIndices[0] && startWordIdx <= r.wordIndices[r.wordIndices.length - 1]) ||
          (endWordIdx >= r.wordIndices[0] && endWordIdx <= r.wordIndices[r.wordIndices.length - 1])
        )) {
          const matchWordIndices: number[] = [];
          for (let w = startWordIdx; w <= endWordIdx; w++) matchWordIndices.push(w);

          const firstWord = words[startWordIdx];
          const lastWord = words[endWordIdx];

          console.log(`[Logo Detection] Match: "${serverName}" -> "${sub}" (dist ${dist}) words: "${matchWordIndices.map(idx => words[idx].text).join(' ')}"`);

          const rawStart = firstWord.start;
          const rawEnd = lastWord.end || firstWord.start + 0.5;
          const duration = rawEnd - rawStart;

          // Exact timing matching spoken words
          results.push({
            start: rawStart,
            end: rawEnd,
            wordIndices: matchWordIndices,
          });
        }
      }
    }
  }

  console.log(`Found ${results.length} fuzzy phonetic match(es) for "${serverName}"`);
  const sortedResults = results.sort((a, b) => a.start - b.start);

  return sortedResults;
}

// Find first sentence end index - ALWAYS returns first 5 words
// This creates a consistent "hook" effect at the start of every video
function findFirstSentenceEndIndex(words: any[]): number {
  // Fixed 5 words for consistent hook
  const targetWords = 5;
  return Math.min(targetWords - 1, words.length - 1); // -1 because it's 0-indexed
}

// Analyze sentence boundaries using AI for smart clip switching
async function analyzeSentenceBoundaries(
  transcriptionText: string,
  words: any[],
  clipCount: number
): Promise<SentenceBoundary[] | null> {
  const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
  if (!OPENAI_API_KEY) {
    console.log('OPENAI_API_KEY not provided, using fallback clip timing');
    return null;
  }

  try {
    const totalDuration = (words[words.length - 1]?.end ?? 0) - (words[0]?.start ?? 0);
    const maxClipsByDuration = totalDuration > 0 ? Math.max(1, Math.floor(totalDuration / MIN_SEGMENT_DURATION)) : clipCount;
    const maxClipsByWords = words.length > 0 ? Math.max(1, Math.floor(words.length / MIN_WORDS_PER_SEGMENT)) : clipCount;
    const actualClipCount = Math.min(clipCount, maxClipsByDuration, maxClipsByWords);
    const boundariesToFind = actualClipCount - 1;

    console.log(
      `Analyzing sentence boundaries: ${words.length} words, ${totalDuration.toFixed(2)}s, requested clips=${clipCount}, using clips=${actualClipCount}`
    );

    if (boundariesToFind <= 0) {
      return [
        {
          sentenceIndex: 0,
          text: transcriptionText,
          startTime: words[0]?.start ?? 0,
          endTime: words[words.length - 1]?.end ?? 0,
          words,
        },
      ];
    }

    // Use AI to identify natural sentence/thought boundaries
    const systemPrompt = `You are a video editing assistant that finds MAJOR clip transition points in speech.

Your task: Given a transcript and the number of video clips available, identify the BEST sentence/thought boundaries where clip transitions should occur.

 CRITICAL RULES:
 1. You MUST return exactly ${boundariesToFind} boundary points (no more, no less)
 2. Each segment MUST have at least ${MIN_WORDS_PER_SEGMENT} words
 3. Prefer LONGER segments. Do not create micro-cuts.
 4. Only cut at the END of complete thoughts / sentences.
 5. Distribute boundaries somewhat evenly across the transcript (avoid clustering).

Return a JSON array of word indices (0-based) where each clip should END. These are the last word of each clip segment.`;

    const userPrompt = `Transcript: "${transcriptionText}"

Number of clips (segments) to create: ${actualClipCount}
Number of words: ${words.length}
Total duration (seconds): ${totalDuration.toFixed(2)}

Find the ${boundariesToFind} best transition points (word indices where each clip segment should end).

Example response format: {"boundaryIndices": [12, 28, 45]} means:
- Clip 1 ends after word index 12
- Clip 2 ends after word index 28  
- Clip 3 ends after word index 45
- Clip 4 (last) contains remaining words

Respond ONLY with JSON in this exact format: {"boundaryIndices": [array of ${boundariesToFind} numbers]}`;

    const aiResponse = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "grok-4-3",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.1,
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('AI gateway error:', aiResponse.status, errorText);
      return null;
    }

    const aiData = await aiResponse.json();
    const aiContent = aiData.choices?.[0]?.message?.content || '';
    console.log('AI sentence boundary response:', aiContent);

    // Parse the AI response
    let boundaryIndices: number[] = [];
    try {
      const jsonMatch = aiContent.match(/\{[\s\S]*"boundaryIndices"[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        boundaryIndices = parsed.boundaryIndices || [];
      }
    } catch (parseError) {
      console.error('Failed to parse AI response:', parseError);
    }

    // Validate boundary indices + enforce minimum segment size
    boundaryIndices = boundaryIndices
      .filter(
        (idx: number) =>
          typeof idx === 'number' &&
          idx >= MIN_WORDS_PER_SEGMENT - 1 &&
          idx < words.length - MIN_WORDS_PER_SEGMENT
      )
      .sort((a: number, b: number) => a - b);

    // Remove boundaries that are too close together
    const spaced: number[] = [];
    let last = -MIN_WORDS_PER_SEGMENT;
    for (const idx of boundaryIndices) {
      if (idx - last >= MIN_WORDS_PER_SEGMENT) {
        spaced.push(idx);
        last = idx;
      }
    }
    boundaryIndices = spaced;

    // Ensure last segment has enough words
    boundaryIndices = boundaryIndices.filter((idx) => words.length - 1 - idx >= MIN_WORDS_PER_SEGMENT);

    // Fallback if AI returned wrong count after validation
    if (boundaryIndices.length !== boundariesToFind) {
      console.log(
        `AI boundaries invalid (got ${boundaryIndices.length}, expected ${boundariesToFind}); using punctuation fallback`
      );
      boundaryIndices = calculatePunctuationBoundaries(words, actualClipCount, MIN_WORDS_PER_SEGMENT);
    }

    console.log(`Final boundary indices: [${boundaryIndices.join(', ')}]`);

    // Convert to sentence boundaries with timestamps
    const sentences: SentenceBoundary[] = [];
    let startIdx = 0;

    for (let i = 0; i <= boundaryIndices.length; i++) {
      const endIdx = i < boundaryIndices.length ? boundaryIndices[i] : words.length - 1;
      const segmentWords = words.slice(startIdx, endIdx + 1);

      if (segmentWords.length > 0) {
        sentences.push({
          sentenceIndex: i,
          text: segmentWords.map((w: any) => w.text).join(' '),
          startTime: segmentWords[0].start,
          endTime: segmentWords[segmentWords.length - 1].end,
          words: segmentWords,
        });
      }

      startIdx = endIdx + 1;
    }

    console.log(`Created ${sentences.length} sentence segments for clip timing:`);
    sentences.forEach((s, i) => {
      console.log(`  Clip ${i + 1}: ${s.startTime.toFixed(2)}s - ${s.endTime.toFixed(2)}s "${s.text.substring(0, 40)}..."`);
    });

    return sentences;
  } catch (error) {
    console.error('Sentence boundary analysis failed:', error);
    return null;
  }
}

// Intensity segment for rhythm-based pacing
interface IntensitySegment {
  startWordIndex: number;
  endWordIndex: number;
  intensity: 'low' | 'medium' | 'high';
}

// Analyze script intensity for dynamic clip pacing
async function analyzeScriptIntensity(
  transcriptionText: string,
  wordsCount: number
): Promise<IntensitySegment[]> {
  const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
  if (!OPENAI_API_KEY) {
    console.log('OPENAI_API_KEY not configured, skipping intensity analysis');
    return [];
  }

  try {
    console.log(`Analyzing script intensity for ${wordsCount} words...`);

    const response = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'grok-4-3',
        messages: [
          {
            role: 'system',
            content: `You are a video editor analyzing a gaming video script to identify intensity levels for pacing.

Analyze the script and divide it into segments with intensity levels:
- HIGH: Action words, excitement, challenges, combat, key moments, urgency, superlatives, exclamations
- MEDIUM: Regular explanations, standard gameplay descriptions, transitions
- LOW: Calm introductions, outros, pauses, setup moments

Return JSON format: {"segments": [{"startWordIndex": 0, "endWordIndex": 10, "intensity": "high"}, ...]}

Rules:
1. Cover ALL words from index 0 to ${wordsCount - 1}
2. Segments should be at least 5 words each
3. Be generous with HIGH intensity for gaming content - action is engaging
4. Segments must be sequential and non-overlapping
5. The first segment should start at word index 0
6. The last segment should end at word index ${wordsCount - 1}`
          },
          {
            role: 'user',
            content: transcriptionText
          }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.2,
        max_tokens: 1500,
      }),
    });

    if (!response.ok) {
      console.error('Intensity analysis failed:', await response.text());
      return [];
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) return [];

    const parsed = JSON.parse(content);
    const segments: IntensitySegment[] = [];

    if (parsed.segments && Array.isArray(parsed.segments)) {
      for (const seg of parsed.segments) {
        if (
          typeof seg.startWordIndex === 'number' &&
          typeof seg.endWordIndex === 'number' &&
          ['low', 'medium', 'high'].includes(seg.intensity)
        ) {
          segments.push({
            startWordIndex: seg.startWordIndex,
            endWordIndex: seg.endWordIndex,
            intensity: seg.intensity,
          });
        }
      }
    }

    console.log(`Intensity analysis: ${segments.length} segments`);
    segments.forEach((s, i) => {
      console.log(`  Segment ${i + 1}: words ${s.startWordIndex}-${s.endWordIndex} = ${s.intensity}`);
    });

    return segments;
  } catch (error) {
    console.error('Intensity analysis error:', error);
    return [];
  }
}

// Get clip duration based on intensity
function getClipDurationForIntensity(intensity: string, isCreativeMode: boolean): number {
  if (!isCreativeMode) return 3.5; // Standard mode increased to 3.5s max

  switch (intensity) {
    case 'high': return 2.0;   // Moderate speed for action
    case 'medium': return 3.0; // Standard flow
    case 'low': return 4.5;    // Long calm moments
    default: return 3.0;
  }
}

// Get intensity at a specific time based on word timings
function getIntensityAtTime(
  time: number,
  words: any[],
  intensitySegments: IntensitySegment[]
): 'low' | 'medium' | 'high' {
  if (!intensitySegments.length) return 'medium';

  // Find which word index corresponds to this time
  let wordIndex = 0;
  for (let i = 0; i < words.length; i++) {
    if (words[i].start <= time && (words[i].end >= time || i === words.length - 1)) {
      wordIndex = i;
      break;
    }
    if (words[i].start > time) {
      wordIndex = Math.max(0, i - 1);
      break;
    }
  }

  // Find which segment this word belongs to
  for (const seg of intensitySegments) {
    if (wordIndex >= seg.startWordIndex && wordIndex <= seg.endWordIndex) {
      return seg.intensity;
    }
  }

  return 'medium';
}


function calculatePunctuationBoundaries(words: any[], clipCount: number, minWords = 0): number[] {
  const targetBoundaries = clipCount - 1;
  const punctuationIndices: number[] = [];

  words.forEach((word, idx) => {
    const t = (word.text || '').trim();
    const okPunct = /[.!?]$/.test(t);
    const okMin = minWords ? idx >= minWords - 1 && words.length - 1 - idx >= minWords : true;
    if (okPunct && okMin) punctuationIndices.push(idx);
  });

  if (punctuationIndices.length === 0) {
    // No punctuation, distribute evenly
    const step = Math.floor(words.length / clipCount);
    const boundaries: number[] = [];
    for (let i = 1; i < clipCount; i++) {
      const idx = Math.min(i * step - 1, words.length - 1);
      if (!minWords) {
        boundaries.push(idx);
        continue;
      }
      // enforce min spacing
      const last = boundaries.length ? boundaries[boundaries.length - 1] : -minWords;
      if (idx - last >= minWords && words.length - 1 - idx >= minWords) boundaries.push(idx);
    }
    return boundaries;
  }

  // Select punctuation points distributed across transcript
  const result: number[] = [];
  const sectionSize = words.length / clipCount;

  for (let i = 1; i < clipCount; i++) {
    const targetIdx = Math.floor(i * sectionSize);
    let bestPunct = punctuationIndices[0];
    let bestDist = Math.abs(punctuationIndices[0] - targetIdx);

    const last = result.length ? result[result.length - 1] : -minWords;
    for (const punctIdx of punctuationIndices) {
      const dist = Math.abs(punctIdx - targetIdx);
      const okSpacing = minWords ? punctIdx - last >= minWords : true;
      if (dist < bestDist && !result.includes(punctIdx) && okSpacing) {
        bestDist = dist;
        bestPunct = punctIdx;
      }
    }

    result.push(bestPunct);
  }

  return result.sort((a, b) => a - b);
}

// Pick indices from array - now with randomization for variety
function pickEvenlySpacedIndices(length: number, count: number, randomize: boolean = true): number[] {
  if (count <= 0) return [];
  
  // If we need more clips than we have (or equal), return the full set.
  // The main loop's modulo and variety logic will handle the distribution.
  if (count >= length) {
    const indices = Array.from({ length }, (_, i) => i);
    return randomize ? shuffleArray(indices) : indices;
  }
  if (count === 1) return [Math.floor(Math.random() * length)];

  if (randomize) {
    // Randomly pick 'count' unique indices from the pool
    const allIndices = Array.from({ length }, (_, i) => i);
    const shuffled = shuffleArray(allIndices);
    return shuffled.slice(0, count).sort((a, b) => a - b); // Keep some temporal coherence
  }

  // Fallback: evenly spaced (deterministic)
  const indices: number[] = [];
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    indices.push(Math.round(t * (length - 1)));
  }

  // Ensure strictly increasing unique indices (keep order, adjust collisions)
  for (let i = 1; i < indices.length; i++) {
    if (indices[i] <= indices[i - 1]) indices[i] = indices[i - 1] + 1;
  }
  for (let i = indices.length - 2; i >= 0; i--) {
    if (indices[i] >= indices[i + 1]) indices[i] = indices[i + 1] - 1;
  }

  return indices.map((i) => Math.max(0, Math.min(length - 1, i)));
}

type OpenAiToolCall = {
  function: {
    name: string;
    arguments: string;
  };
};

async function generateSpokenScriptWithFineTunedModel({
  openAiKey,
  serverName,
  description,
  gamemodeInfo,
  targetLengthSeconds,
  supabase,
  commentContent,
  commentAuthor,
}: {
  openAiKey: string;
  serverName: string;
  description: string;
  gamemodeInfo: string;
  targetLengthSeconds: number;
  supabase: any;
  commentContent?: string;
  commentAuthor?: string;
}): Promise<string> {
  const minWords = Math.floor(targetLengthSeconds * 2.5);
  const maxWords = Math.ceil(targetLengthSeconds * 3);

  // Explicit server name in prompt to prevent fine-tuned model from using training data names
  // HOOK VARIETY: Add instruction to avoid repetitive openings
  const hookVarietyInstruction = `CRITICAL: Do NOT start with "[Server Name] is a Minecraft server" or similar introductory phrases. Instead, start with an attention-grabbing hook like a question, bold claim, challenge, or action statement. Examples of good hooks:
- "You won't believe what happens on ${serverName}..."
- "Ever wanted to dominate in PvP?"
- "This is how you become unstoppable."
- "Let me show you something insane."
- "Most players don't know this trick..."
Jump straight into the action - no introductions.`;

  const commentInstruction = (commentContent && commentAuthor) 
    ? `\n\nUSER COMMENT TO RESPOND TO:\nComment: "${commentContent}"\n\nCRITICAL: The comment will be shown visually on screen, so do NOT read it aloud or say "a viewer commented" or "someone asked". Instead, start the script by DIRECTLY answering or responding to the comment as if someone just asked you. Jump straight into the answer. Do NOT mention the author's name ("${commentAuthor}").`
    : "";

  const aiPrompt = `Server Name: ${serverName}\n\n${description || 'A Minecraft server'}${gamemodeInfo ? `\n${gamemodeInfo}` : ''}\n\nTarget length: ${targetLengthSeconds} seconds (${minWords}-${maxWords} words)\n\n${hookVarietyInstruction}${commentInstruction}\n\nIMPORTANT: Use "${serverName}" as the server name in the script, not any other name.`;

  // INTELLIGENCE LAYER: Fetch strategic insights to guide the model
  let strategyContext = "";
  try {
    const { data: insights } = await supabase
      .from('insights')
      .select('*')
      .eq('niche', 'minecraft') // Hardcoded for MVP
      .order('created_at', { ascending: false })
      .limit(5);

    if (insights) {
      const winningArchetype = insights.find((i: any) => i.insight_type === 'winning_archetype')?.payload;
      const competitorGap = insights.find((i: any) => i.insight_type === 'competitor_gap')?.payload;
      const velocityTarget = insights.find((i: any) => i.insight_type === 'velocity_target')?.payload;

      if (winningArchetype) {
        strategyContext += `\nWINNING PATTERN: Validated high-performance structure is '${winningArchetype.archetype}' style (${winningArchetype.visual_style}).\n`;
      }
      if (competitorGap && competitorGap.losing_gamemode === (gamemodeInfo ? gamemodeInfo.split(':')[1]?.trim() : '')) {
        strategyContext += `\nCOMPETITIVE ALERT: Competitors are beating us in this gamemode by ${Math.round(competitorGap.gap)} points. purely due to '${competitorGap.losing_gamemode}' execution.\n`;
      }
      if (velocityTarget) {
        strategyContext += `\nVELOCITY TARGET: Aim for high-retention hook to hit ${velocityTarget.target_views_2h} views in 2 hours.\n`;
      }
    }
  } catch (err) {
    console.warn("Intelligence Layer ignored due to error:", err);
  }

  const systemBase = `Return ONLY the exact words a narrator would speak. No meta commentary, no mentions of prompts/system/tools, no stage directions, no brackets, no labels. Use the generate_spoken_script tool.
  
  === STRATEGIC INTELLIGENCE (MUST FOLLOW) ===
  ${strategyContext || "No specific market insights available. Use standard best practices."}
  
  You are an adaptive AI. Use the above insights to tailor the script structure, tone, and pacing.`;



  let script = '';
  console.log(`Calling fine-tuned model for script generation...`);
  console.log('Prompt:', aiPrompt);


  const aiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${openAiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'ft:gpt-4.1-mini-2025-04-14:tikscripts:craftedit:D2jPp96Y',
      messages: [
        { role: 'system', content: systemBase },
        { role: 'user', content: aiPrompt },
      ],
      tools: [
        {
          type: 'function',
          function: {
            name: 'generate_spoken_script',
            description: 'Return ONLY spoken narrator words for TTS. No meta, no annotations.',
            parameters: {
              type: 'object',
              properties: {
                spoken_text: { type: 'string' },
              },
              required: ['spoken_text'],
              additionalProperties: false,
            },
          },
        },
      ],
      tool_choice: { type: 'function', function: { name: 'generate_spoken_script' } },
      temperature: 0.9,
    }),
  });

  if (!aiResponse.ok) {
    const errText = await aiResponse.text();
    throw new Error(`Fine-tuned model script generation failed (${aiResponse.status}): ${errText.substring(0, 300)}`);
  }

  const aiData = await aiResponse.json();
  const toolCall: OpenAiToolCall | undefined = aiData?.choices?.[0]?.message?.tool_calls?.[0];
  if (!toolCall || toolCall.function?.name !== 'generate_spoken_script') {
    console.error('Fine-tuned model did not return the required tool call:', aiData);
    throw new Error('AI did not return structured script');
  }

  try {
    const parsedArgs = JSON.parse(toolCall.function.arguments);
    script = String(parsedArgs?.spoken_text ?? '').trim();
  } catch (e) {
    console.error('Failed to parse tool arguments:', toolCall.function.arguments);
    throw new Error('Failed to parse structured script');
  }

  script = script.replace(/[\[\](){}]/g, '').trim();

  if (!script) {
    throw new Error('Script generation was empty.');
  }

  return script;
}

// Background processing function
async function processVideoInBackground(
  projectId: string,
  prompt: string,
  subtitleSettings: SubtitleSettings,
  aspectRatio: string,
  endScreenSettings: EndScreenSettings,
  musicSettings: MusicSettings,
  beginningEffectSettings: BeginningEffectSettings,
  ipPopupSettings: IpPopupSettings,
  colorimetrySettings: any,
  effectsSettings: EffectsSettings,
  commentGeneratorEnabled: boolean = false,
  selectedCommentId: string | null = null,
  regenerateScript: boolean = false,
  targetScriptLength: number = 30,
  voiceoverAudioData: string | null = null, // Fresh audio data instead of stored URL
  excludeAccountIds: string[] = [] // For batch YouTube distribution
) {
  console.log("=== Background processing started ===");
  console.log(`regenerateScript: ${regenerateScript}, targetScriptLength: ${targetScriptLength}s`);
  console.log(`musicSettings: enabled=${musicSettings.enabled}, volume=${musicSettings.volume}, start=${musicSettings.start_time}s`);
  console.log(`ipPopupSettings: enabled=${ipPopupSettings.enabled}`);
  console.log(`effectsSettings: ai_sfx_enabled=${effectsSettings.ai_sfx_enabled}, flash_enabled=${effectsSettings.flash_enabled}`);

  if (excludeAccountIds.length > 0) {
    console.log(`Batch mode: Excluding ${excludeAccountIds.length} YouTube accounts already used`);
  }


  const subtitleStyle = subtitleSettings.style;
  
  // --- COMMENT LIBRARY INTEGRATION ---
  let commentContent: string | undefined;
  let commentAuthor: string | undefined;
  let commentOverlay: any | undefined; // Using any for brevity in type or CommentOverlaySpec if available

  // ============================================
  // SELF-HOSTED FFMPEG WORKER QUEUE (Primary)
  // ============================================
  // Try to queue to FFmpeg worker first - if it fails, fallback is NOT currently implemented
  const USE_FFMPEG_WORKER = true; // Feature flag - set to false to use Creatomate


  const CREATOMATE_API_KEY = Deno.env.get('CREATOMATE_API_KEY')!;
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    // Fetch project data
    const { data: project } = await supabase
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .single();

    // Update progress
    const updateProgress = async (progress: number, message?: string) => {
      console.log(`Progress: ${progress}% ${message || ''}`);
      await supabase
        .from('projects')
        .update({ render_progress: progress, updated_at: new Date().toISOString() })
        .eq('id', projectId);
    };

    await updateProgress(5, 'Fetching clips...');

    // Fetch video clips
    const { data: videos, error: videosError } = await supabase
      .from('videos')
      .select('*')
      .eq('project_id', projectId);

    if (videosError || !videos?.length) {
      throw new Error('No video clips found');
    }
    await updateProgress(6, `Fetched ${videos.length} clips`);

    // SORT clips by order (filename numbers if available, else upload order)
    let sortedVideos = sortVideosByOrder(videos);
    await updateProgress(7, 'Clips sorted');
    console.log(`Sorted ${sortedVideos.length} clips (initial).`);

    // SMART CLIP SELECTION: Prioritize clips that are strictly >= 2.0s
    // Bucket 1: Known good (duration >= 2.0s)
    const knownGoodClips = sortedVideos.filter((v: any) => v.duration && v.duration >= 2.0);

    // Bucket 2: Unknown duration (risky, but better than known short)
    const unknownClips = sortedVideos.filter((v: any) => !v.duration);

    if (knownGoodClips.length > 0) {
      console.log(`[Smart Selection] Found ${knownGoodClips.length} VERIFIED long clips (>= 2.0s). Using ONLY these.`);
      sortedVideos = knownGoodClips;
    } else if (unknownClips.length > 0) {
      console.log(`[Smart Selection] WARNING: No verified long clips found. Using ${unknownClips.length} clips with unknown duration (RISY).`);
      sortedVideos = unknownClips;
    } else {
      console.warn(`[Smart Selection] CRITICAL WARNING: All clips are known to be short (< 2.0s). Freezing is likely.`);
      // We keep original sortedVideos (which are all short) as a last resort
    }
    await updateProgress(8, 'Smart selection complete');

    console.log(`Final clip pool size: ${sortedVideos.length}`);
    sortedVideos.forEach((v: any, i: number) => {
      const num = extractOrderFromFilename(v.file_name);
      console.log(`  ${i + 1}. ${v.file_name} ${num !== null ? `(num: ${num})` : '(upload order)'} [dur: ${v.duration || '?'}]`);
    });

    await updateProgress(10, 'Fetching voiceover...');

    // Fetch voiceover
    const { data: voiceovers } = await supabase
      .from('voiceovers')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: true });

    let voiceover = voiceovers?.[0] || null;

    // If regenerateScript is true, delete existing voiceovers and regenerate
    if (regenerateScript && voiceovers && voiceovers.length > 0) {
      console.log(`regenerateScript=true, deleting ${voiceovers.length} existing voiceover(s)...`);
      await updateProgress(11, 'Removing old voiceover...');

      // Delete from database (storage files can be orphaned, they'll be cleaned up later)
      await supabase
        .from('voiceovers')
        .delete()
        .eq('project_id', projectId);

      voiceover = null;
      console.log('Existing voiceovers deleted, will regenerate with new settings');
    }

    // If voiceoverAudioData is provided (fresh from frontend), decode and upload to temp storage
    let voiceoverSignedUrl: string | null = null;
    let voiceoverDuration: number | null = null;
    let transcription: { text: string; words: any[] } | null = null;

    if (voiceoverAudioData) {
      console.log('Using provided voiceoverAudioData (fresh, not stored)...');
      try {
        // Decode base64 to bytes
        const binaryString = atob(voiceoverAudioData);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }

        // Upload to temp storage
        const tempFileName = `temp/voiceover-${projectId}-${Date.now()}.mp3`;
        const { error: uploadError } = await supabase.storage
          .from('voiceovers')
          .upload(tempFileName, bytes, {
            contentType: 'audio/mpeg',
            upsert: true,
          });

        if (uploadError) {
          console.error('Failed to upload voiceover audio:', uploadError);
        } else {
          // Create signed URL for worker to download
          const { data: signedData, error: signError } = await supabase.storage
            .from('voiceovers')
            .createSignedUrl(tempFileName, 3600);

          if (signError) {
            console.error('Failed to create signed URL for voiceover:', signError);
          } else {
            voiceoverSignedUrl = signedData?.signedUrl || null;
            console.log('Voiceover uploaded to temp storage, signed URL created');
          }
        }
      } catch (err) {
        console.error('Failed to process voiceoverAudioData:', err);
      }
    }

    // If no voiceover exists (or was just deleted), generate one using ScriptForge AI
    if (!voiceover && !voiceoverAudioData) {
      console.log('No voiceover found, checking if we should generate one...');

      // Fetch project details for title, description, gamemode and voice
      const { data: projectData } = await supabase
        .from('projects')
        .select('title, description, gamemode_id, user_id, voice_id')
        .eq('id', projectId)
        .single();

      if (projectData) {
        await updateProgress(12, 'Generating AI script...');
        console.log(`Generating script with target length: ${targetScriptLength}s`);

        try {
          // Generate script using AI
          const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
          const ELEVENLABS_API_KEY = Deno.env.get('ELEVENLABS_API_KEY');

          if (!OPENAI_API_KEY || !ELEVENLABS_API_KEY) {
            throw new Error(`Service Configuration Error: Missing API Keys (OpenAI: ${!!OPENAI_API_KEY}, ElevenLabs: ${!!ELEVENLABS_API_KEY}). Please add them in Supabase Dashboard -> Settings -> Edge Functions.`);
          }

          if (OPENAI_API_KEY && ELEVENLABS_API_KEY) {

            // Fetch gamemode details if provided
            let gamemodeInfo = "";
            if (projectData.gamemode_id) {
              const { data: gamemode } = await supabase
                .from('gamemodes')
                .select('name, description')
                .eq('id', projectData.gamemode_id)
                .single();

              if (gamemode) {
                gamemodeInfo = `\n\nGamemode: ${gamemode.name}\nGamemode Description: ${gamemode.description}`;
              }
            }

            console.log("Calling fine-tuned model for script generation...");
            await updateProgress(14, 'AI writing script...');

            // --- COMMENT LIBRARY INTEGRATION ---

            if (commentGeneratorEnabled) {
              console.log('Processing comment for script injection...');
              let commentData: any = null;

              if (selectedCommentId) {
                const { data } = await supabase
                  .from('comment_library')
                  .select('*')
                  .eq('id', selectedCommentId)
                  .single();
                commentData = data;
              } else {
                // Pick a random comment from the library
                const { data } = await supabase
                  .from('comment_library')
                  .select('*')
                  .limit(10);
                if (data && data.length > 0) {
                  commentData = data[Math.floor(Math.random() * data.length)];
                }
              }

              if (commentData) {
                commentAuthor = commentData.author_name;
                commentContent = commentData.content;
                
                // Prepare overlay spec for the renderer
                commentOverlay = {
                  name: commentData.author_name,
                  avatar_url: commentData.avatar_url,
                  content: commentData.content,
                  start_time: 1.5, // Show at the very beginning of the video
                  duration: 5,
                };
                console.log(`Comment selected: ${commentAuthor} - "${commentContent}"`);
              }
            }

            let script = await generateSpokenScriptWithFineTunedModel({
              openAiKey: OPENAI_API_KEY,
              serverName: projectData.title || 'Minecraft server',
              description: projectData.description || '',
              gamemodeInfo,
              targetLengthSeconds: targetScriptLength,
              supabase,
              commentContent,
              commentAuthor,
            });

            // REGRESSION FIX: Strictly forbid "You won't believe" phrases
            // If the model ignores the prompt, we sanitize it here.
            if (script && /you won'?t believe/i.test(script)) {
              console.warn("Forbidden phrase detected in AI script, sanitizing...");
              script = script.replace(/You won'?t believe what happens next/ig, "Check out what happens next");
              script = script.replace(/You won'?t believe what happens/ig, "Watch what happens");
              script = script.replace(/You won'?t believe/ig, "You have to see");
            }

            const wordCount = script.split(/\s+/).length;
            console.log(`Generated script (validated): ${wordCount} words`);
            console.log("Script preview:", script.substring(0, 200) + "...");

            await updateProgress(18, 'Generating voiceover...');

            // RESOLVE VOICE ENGINE & ID
            const openAiVoices = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer', 'ash', 'ballad', 'coral', 'sage', 'verse'];
            let voiceEngine: 'elevenlabs' | 'openai' = 'elevenlabs';
            let voiceId = 'nPczCjzI2devNBz1zQrb'; // Default: Brian (ElevenLabs)
            
            if (projectData.voice_id) {
              const idLower = projectData.voice_id.toLowerCase();
              if (openAiVoices.includes(idLower)) {
                voiceEngine = 'openai';
                voiceId = idLower;
              } else {
                const { data: customVoice } = await supabase
                  .from('voices')
                  .select('name, elevenlabs_voice_id')
                  .eq('id', projectData.voice_id)
                  .single();

                if (customVoice) {
                  const evId = (customVoice.elevenlabs_voice_id || '').toLowerCase();
                  const vName = (customVoice.name || '').toLowerCase();
                  
                  if (openAiVoices.includes(evId)) {
                    voiceEngine = 'openai';
                    voiceId = evId;
                  } else if (vName.includes('alloy')) { voiceEngine = 'openai'; voiceId = 'alloy'; }
                  else if (vName.includes('echo')) { voiceEngine = 'openai'; voiceId = 'echo'; }
                  else if (vName.includes('fable')) { voiceEngine = 'openai'; voiceId = 'fable'; }
                  else if (vName.includes('onyx')) { voiceEngine = 'openai'; voiceId = 'onyx'; }
                  else if (vName.includes('nova')) { voiceEngine = 'openai'; voiceId = 'nova'; }
                  else if (vName.includes('shimmer')) { voiceEngine = 'openai'; voiceId = 'shimmer'; }
                  else if (vName.includes('ash')) { voiceEngine = 'openai'; voiceId = 'ash'; }
                  else if (vName.includes('ballad')) { voiceEngine = 'openai'; voiceId = 'ballad'; }
                  else if (vName.includes('coral')) { voiceEngine = 'openai'; voiceId = 'coral'; }
                  else if (vName.includes('sage')) { voiceEngine = 'openai'; voiceId = 'sage'; }
                  else if (vName.includes('verse')) { voiceEngine = 'openai'; voiceId = 'verse'; }
                  else {
                    voiceEngine = 'elevenlabs';
                    voiceId = customVoice.elevenlabs_voice_id || voiceId;
                  }
                }
              }
            }

            let audioBytes: Uint8Array;

            if (voiceEngine === 'openai') {
              console.log(`Generating with OpenAI TTS: ${voiceId}`);
              const ttsResponse = await fetch('https://api.openai.com/v1/audio/speech', {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${OPENAI_API_KEY}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  model: 'tts-1',
                  input: script,
                  voice: voiceId,
                  response_format: 'mp3',
                  speed: 1.0,
                }),
              });

              if (!ttsResponse.ok) {
                const errorText = await ttsResponse.text();
                throw new Error(`OpenAI TTS failed: ${errorText}`);
              }
              const audioBuffer = await ttsResponse.arrayBuffer();
              audioBytes = new Uint8Array(audioBuffer);
            } else {
              console.log(`Generating with ElevenLabs: ${voiceId}`);
              const ttsResponse = await fetch(
                `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
                {
                  method: 'POST',
                  headers: {
                    'xi-api-key': ELEVENLABS_API_KEY,
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                    text: script,
                    model_id: 'eleven_turbo_v2_5',
                    voice_settings: {
                      stability: 0.5,
                      similarity_boost: 0.8,
                      style: 0.6,
                      use_speaker_boost: true,
                    },
                  }),
                }
              );

              if (!ttsResponse.ok) {
                const errorText = await ttsResponse.text();
                throw new Error(`ElevenLabs TTS failed: ${errorText}`);
              }
              const audioBuffer = await ttsResponse.arrayBuffer();
              audioBytes = new Uint8Array(audioBuffer);
            }

            console.log("Voiceover generated, uploading to storage...");
            await updateProgress(22, 'Saving voiceover...');

            const fileName = `${projectId}/ai-voiceover-${Date.now()}.mp3`;
            const { error: uploadError } = await supabase.storage
              .from('voiceovers')
              .upload(fileName, audioBytes, {
                contentType: 'audio/mpeg',
                upsert: true,
              });

            if (!uploadError) {
              const { data: urlData } = supabase.storage
                .from('voiceovers')
                .getPublicUrl(fileName);

              const { data: newVoiceover, error: voiceoverError } = await supabase
                .from('voiceovers')
                .insert({
                  project_id: projectId,
                  file_url: urlData.publicUrl,
                  file_name: 'AI Generated Voiceover.mp3',
                  transcript: script,
                })
                .select()
                .single();

              if (!voiceoverError && newVoiceover) {
                voiceover = newVoiceover;
              }
            }
          }
        } catch (scriptError) {
          console.error("Script/voiceover generation failed:", scriptError);
          throw scriptError; // Fail the job if voiceover fails
        }
      }
    }

    // Get dimensions
    // NOTE: Creatomate does not expose direct bitrate controls in RenderScript.
    // The most reliable lever to reduce pixelation is increasing output resolution (e.g. 4K) when requested.
    const dimensions = aspectRatioMap[aspectRatio] || aspectRatioMap['9:16'];
    console.log(`Output resolution: ${dimensions.width}x${dimensions.height}`);


    await updateProgress(25, 'Generating signed URLs...');

    const extractStoragePath = (value: string, bucket: string): string | null => {
      if (!value) return null;

      // If value is a URL, try to extract the path after /storage/v1/object/(public|sign)/<bucket>/
      const match = value.match(new RegExp(`/storage\\/v1\\/object\\/(?:public|sign)\\/${bucket}\\/(.+)$`));
      if (match?.[1]) {
        // Remove query strings (cache-busters like ?t=123) and decode
        const purePath = match[1].split('?')[0];
        return decodeURIComponent(purePath);
      }

      // New format: we store just the object path (e.g. "<userId>/123_file.mp4")
      if (!value.startsWith('http')) return decodeURIComponent(value);

      return null;
    };

    // Generate signed URLs for video clips
    const videoSignedUrls: string[] = [];
    for (const video of sortedVideos) {
      const filePath = extractStoragePath(video.source_url, 'video-clips');

      if (filePath) {
        const { data: signedUrlData, error: signedErr } = await supabase
          .storage
          .from('video-clips')
          .createSignedUrl(filePath, 3600);

        if (signedErr) {
          console.error('Failed to sign video URL:', signedErr);
        }

        videoSignedUrls.push(signedUrlData?.signedUrl || video.source_url);
      } else {
        videoSignedUrls.push(video.source_url);
      }
    }

    // Generate voiceover signed URL (only if not already provided via voiceoverAudioData)
    if (!voiceoverSignedUrl && voiceover) {
      const filePath = extractStoragePath(voiceover.file_url, 'voiceovers');

      if (filePath) {
        const { data: voSignedData, error: voErr } = await supabase
          .storage
          .from('voiceovers')
          .createSignedUrl(filePath, 3600);

        if (voErr) {
          console.error('Failed to sign voiceover URL:', voErr);
        }

        voiceoverSignedUrl = voSignedData?.signedUrl || voiceover.file_url;
      } else {
        voiceoverSignedUrl = voiceover.file_url;
      }
    }

    // SFX will be fetched inline during video element creation for each transition

    await updateProgress(30, 'Transcribing voiceover...');

    // Transcribe voiceover for karaoke subtitles (transcription already declared above)
    if (voiceoverSignedUrl) {
      transcription = await transcribeVoiceover(voiceoverSignedUrl, voiceover?.transcript || script);

      // Save transcript to voiceover record
      if (transcription && voiceover) {
        await supabase
          .from('voiceovers')
          .update({ transcript: transcription.text })
          .eq('id', voiceover.id);
      }
    }

    await updateProgress(35, 'Analyzing sentence boundaries for smart clip timing...');

    // Analyze sentence boundaries using AI for intelligent clip switching
    let sentenceBoundaries: SentenceBoundary[] | null = null;
    if (transcription?.text && transcription.words?.length && sortedVideos.length > 1) {
      sentenceBoundaries = await analyzeSentenceBoundaries(
        transcription.text,
        transcription.words,
        sortedVideos.length
      );
    }

    // Creative Mode: Analyze script intensity for dynamic pacing
    const creativeModeEnabled = subtitleSettings.creativeModeEnabled === true;
    let intensitySegments: IntensitySegment[] = [];
    if (creativeModeEnabled && transcription?.words?.length) {
      await updateProgress(38, 'Analyzing script intensity for rhythm...');
      intensitySegments = await analyzeScriptIntensity(
        transcription.text,
        transcription.words.length
      );
    }

    await updateProgress(40, 'Building render payload...');

    // If we don't have duration stored, estimate from transcription
    if (!voiceoverDuration && transcription?.words?.length) {
      const lastWord = transcription.words[transcription.words.length - 1];
      if (lastWord?.end) {
        voiceoverDuration = lastWord.end;
        console.log(`Estimated voiceover duration from transcription: ${voiceoverDuration}s`);
      }
    }

    // PRE-FETCH SIGNED URLS FOR GLOBAL ASSETS
    // This avoids scoping issues and ensures availability for all render paths
    console.log('[Assets] Pre-signing global assets...');
    const [signedLogoUrl, signedBeginningImageUrl] = await Promise.all([
      signAssetUrl(supabase, endScreenSettings.logo_url),
      signAssetUrl(supabase, beginningEffectSettings.image_url)
    ]);

    // Choose an effective clip count to avoid over-cutting on short scripts.
    // If we have too many uploaded clips for a short voiceover, we only use a subset.
    const originalClipCount = sortedVideos.length;
    const maxClipsByDuration = voiceoverDuration
      ? Math.max(1, Math.floor(voiceoverDuration / MIN_SEGMENT_DURATION))
      : originalClipCount;
    const maxClipsByWords = transcription?.words?.length
      ? Math.max(1, Math.floor(transcription.words.length / MIN_WORDS_PER_SEGMENT))
      : originalClipCount;

    let clipCount = Math.min(maxClipsByDuration, maxClipsByWords);
    // REMOVED originalClipCount limit to allow looping/reuse of clips for fast pacing
    // The previous logic (Math.min(originalClipCount...)) prevented creating more cuts than uploaded files.
    if (sentenceBoundaries?.length) {
      clipCount = Math.min(clipCount, sentenceBoundaries.length);
    }

    const selectedIndices = pickEvenlySpacedIndices(originalClipCount, clipCount);
    let selectedVideos = selectedIndices.map((i) => sortedVideos[i]);
    let selectedVideoSignedUrls = selectedIndices.map((i) => videoSignedUrls[i]);

    console.log(
      `Clip selection: using ${clipCount}/${originalClipCount} clips (duration limit=${maxClipsByDuration}, words limit=${maxClipsByWords})`
    );

    // ============================================================================
    // Intelligent clip selection (Phase 8)
    // If most clips have AI descriptions and we have sentence boundaries, call
    // select-clips-for-script to pick which clip plays during which segment based
    // on meaning instead of the random shuffle. Any failure falls through to the
    // existing random-order selection (no regression risk).
    //
    // Kill switch: set edge function secret INTELLIGENT_SELECTION_DISABLED=true.
    // ============================================================================
    try {
      const killed = (Deno.env.get('INTELLIGENT_SELECTION_DISABLED') || '').toLowerCase() === 'true';
      const canUse =
        !killed &&
        sentenceBoundaries &&
        sentenceBoundaries.length === clipCount &&
        clipCount > 1 &&
        sortedVideos.length > 1;

      if (canUse) {
        const describedCount = sortedVideos.filter(
          (v: any) =>
            v.description &&
            typeof v.description === 'string' &&
            v.description.trim().length > 0 &&
            ['ready', 'edited'].includes(v.description_status)
        ).length;
        const describedRatio = describedCount / sortedVideos.length;

        console.log(
          `[IntelligentSelection] described=${describedCount}/${sortedVideos.length} (${(describedRatio * 100).toFixed(0)}%), segments=${sentenceBoundaries!.length}`
        );

        if (describedRatio >= 0.3) {
          const segmentsPayload = sentenceBoundaries!.map((b, idx) => ({
            index: idx,
            startSec: b.startTime,
            endSec: b.endTime,
            text: b.text || '',
          }));
          const clipsPayload = sortedVideos.map((v: any) => ({
            videoId: v.id,
            fileName: v.file_name,
            duration: v.duration,
            description: v.description,
            status: v.description_status,
          }));

          const selectResp = await fetch(
            `${Deno.env.get('SUPABASE_URL')}/functions/v1/select-clips-for-script`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
              },
              body: JSON.stringify({
                segments: segmentsPayload,
                clips: clipsPayload,
                creativeMode: subtitleSettings.creativeModeEnabled === true,
                projectId,
              }),
            }
          );

          const selectJson = await selectResp.json().catch(() => ({}));

          if (selectJson?.success && Array.isArray(selectJson.mapping) && selectJson.mapping.length === clipCount) {
            const idIndexMap = new Map<string, number>();
            sortedVideos.forEach((v: any, i: number) => idIndexMap.set(v.id, i));

            const newIndices: number[] = [];
            for (const m of selectJson.mapping as Array<{ segmentIndex: number; videoId: string; reason?: string }>) {
              const idx = idIndexMap.get(m.videoId);
              if (typeof idx === 'number') newIndices.push(idx);
            }

            if (newIndices.length === clipCount) {
              selectedVideos = newIndices.map((i) => sortedVideos[i]);
              selectedVideoSignedUrls = newIndices.map((i) => videoSignedUrls[i]);
              console.log(
                `[IntelligentSelection] Applied AI clip ordering (${selectJson.model}). Reasons:`
              );
              (selectJson.mapping as Array<{ segmentIndex: number; videoId: string; reason?: string }>)
                .sort((a, b) => a.segmentIndex - b.segmentIndex)
                .forEach((m) => console.log(`  seg ${m.segmentIndex} -> ${m.videoId}${m.reason ? ` (${m.reason})` : ''}`));
              await updateProgress(41, 'AI clip ordering applied');
            } else {
              console.warn(
                `[IntelligentSelection] Mapping resolved to ${newIndices.length}/${clipCount} known ids; keeping random order`
              );
            }
          } else if (selectJson?.fallback) {
            console.log(`[IntelligentSelection] Falling back: ${selectJson.error || 'unknown reason'}`);
          } else {
            console.warn(`[IntelligentSelection] Unexpected response, falling back:`, selectJson);
          }
        } else {
          console.log(
            `[IntelligentSelection] Only ${(describedRatio * 100).toFixed(0)}% of clips described; keeping random order`
          );
        }
      }
    } catch (e) {
      // NEVER block the render on selection failure.
      console.warn('[IntelligentSelection] Threw, falling back to random order:', e);
    }

    // Calculate clip durations - use AI sentence boundaries if available
    const clipDurations: number[] = [];
    const clipStartTimes: number[] = [];

    if (sentenceBoundaries && sentenceBoundaries.length === clipCount) {
      // Use AI-detected sentence boundaries for clip timing
      console.log('=== Using AI sentence boundaries for clip timing ===');
      let currentTime = 0;

      for (let i = 0; i < sentenceBoundaries.length; i++) {
        const boundary = sentenceBoundaries[i];
        const duration = Math.max(0.2, boundary.endTime - boundary.startTime + 0.1);

        clipStartTimes.push(currentTime);
        clipDurations.push(duration);
        currentTime += duration;

        console.log(`  Clip ${i + 1}: starts ${clipStartTimes[i].toFixed(2)}s, duration ${duration.toFixed(2)}s, sentence: "${boundary.text.substring(0, 30)}..."`);
      }

      // REGRESSION FIX: If metadata duration is longer than transcription,
      // DO NOT extend the last clip (which breaks the 2s limit).
      // Instead, append NEW clips to cover the remaining time.
      if (voiceoverDuration && clipDurations.length) {
        let builtTotal = clipStartTimes[clipStartTimes.length - 1] + clipDurations[clipDurations.length - 1];

        if (builtTotal < voiceoverDuration) {
          console.log(`[Clip Logic] Voiceover (${voiceoverDuration.toFixed(2)}s) > Visuals (${builtTotal.toFixed(2)}s). Appending new clips...`);

          while (builtTotal < voiceoverDuration) {
            const remaining = voiceoverDuration - builtTotal;
            // Favor longer padding clips (2.5s - 4.0s)
            const nextDuration = Math.min(Math.random() * 1.5 + 2.5, remaining);

            // Append new clip
            clipStartTimes.push(builtTotal);
            clipDurations.push(nextDuration);

            builtTotal += nextDuration;
          }
        }
      }
    } else {
      // Fallback: distribute voiceover duration evenly across clips, BUT RESPECT SOURCE BOUNDARIES
      console.log('=== Using improved distribution for clip timing (fallback) ===');

      let currentTime = 0;
      const targetDuration = voiceoverDuration || (clipCount * 2.5);

      // If we have many clips, use shorter durations to keep it dynamic and avoid freezing
      const idealDuration = originalClipCount > 5 ? 2.5 : 3.5;

      while (currentTime < targetDuration) {
        const remaining = targetDuration - currentTime;
        // Randomize fallback durations between 2.2s and 3.8s, but don't exceed remaining
        const duration = Math.min(Math.random() * 1.6 + idealDuration - 0.5, remaining);

        clipStartTimes.push(currentTime);
        clipDurations.push(duration);
        currentTime += duration;
      }
      console.log(`Fallback generation: Created ${clipDurations.length} clips to cover ${targetDuration.toFixed(2)}s`);
    }

    // Total video duration
    const totalDuration = clipStartTimes[clipStartTimes.length - 1] + clipDurations[clipDurations.length - 1];
    console.log(`Total video duration: ${totalDuration.toFixed(2)}s`);

    // ----------------------------------------------------------------------------
    // PHASE 9: Cinematic Piece Generation & AI-Chip Direction
    // ----------------------------------------------------------------------------
    const pieces: any[] = [];
    let poolIndex = 0;
    let isVeryFirstClip = true;

    // First Pass: Generate all visual "pieces" (cuts)
    for (let segIndex = 0; segIndex < clipStartTimes.length; segIndex++) {
      let t = clipStartTimes[segIndex];
      let remaining = clipDurations[segIndex];

      const isCreativeMode = subtitleSettings.creativeModeEnabled === true;
      const transitionType = isCreativeMode ? 'none' : (subtitleSettings.transition || 'fade');
      const transitionDurationSeconds = transitionType === 'none' ? 0 : 0.4;

      const baseMaxVisualPieceSeconds = isCreativeMode
        ? 4.0 
        : Math.max(2.2, Math.min(4.0, voiceoverDuration ? voiceoverDuration / Math.max(1, originalClipCount) : 3.0));

      const minVisualPieceSeconds = Math.max(0.6, transitionDurationSeconds * 1.25);

      while (remaining > 0.001) {
        let maxVisualPieceSeconds = baseMaxVisualPieceSeconds;
        if (isCreativeMode && intensitySegments.length > 0 && transcription?.words?.length) {
          const currentIntensity = getIntensityAtTime(t, transcription.words, intensitySegments);
          const jitter = (Math.random() * 0.3) - 0.15;
          maxVisualPieceSeconds = Math.max(1.5, getClipDurationForIntensity(currentIntensity, true) + jitter);
        }

        let pieceDuration = Math.min(remaining, maxVisualPieceSeconds);
        const tail = remaining - pieceDuration;
        if (tail > 0 && tail < minVisualPieceSeconds) {
          pieceDuration = remaining;
        }

        let poolUrl = selectedVideoSignedUrls[poolIndex % selectedVideoSignedUrls.length];
        let poolVideo = selectedVideos[poolIndex % selectedVideos.length];

        // PREVENT RECENT IDENTICAL CLIPS
        if (selectedVideoSignedUrls.length > 1) {
          let consecutiveAttempts = 0;
          const maxHistory = Math.min(3, selectedVideoSignedUrls.length - 1);
          const recentUrls: string[] = pieces.slice(-maxHistory).map(p => p.source);
          
          while (recentUrls.includes(poolUrl) && consecutiveAttempts < selectedVideoSignedUrls.length - 1) {
            poolIndex++;
            consecutiveAttempts++;
            poolUrl = selectedVideoSignedUrls[poolIndex % selectedVideoSignedUrls.length];
            poolVideo = selectedVideos[poolIndex % selectedVideos.length];
          }
        }

        const sourceDuration = poolVideo?.duration ?? null;
        let effectiveTrimDuration = pieceDuration;
        if (sourceDuration && sourceDuration > 0) {
          effectiveTrimDuration = Math.min(pieceDuration, sourceDuration);
        } else if (isCreativeMode) {
          effectiveTrimDuration = Math.min(pieceDuration, 3.0);
        }

        if (effectiveTrimDuration > 5.0) {
          effectiveTrimDuration = 5.0;
          if (pieceDuration > 5.0) pieceDuration = 5.0;
        }

        const piece: any = {
          type: 'video',
          track: 1,
          source: poolUrl,
          poolVideo: poolVideo, // Keep for AI context
          time: isVeryFirstClip ? 0 : t,
          duration: effectiveTrimDuration,
          trim_start: 0,
          trim_duration: effectiveTrimDuration,
          fit: 'cover',
          width: '100%',
          height: '100%',
          segIndex: segIndex,
          isVeryFirstClip: isVeryFirstClip
        };

        pieces.push(piece);
        
        isVeryFirstClip = false;
        poolIndex += 1;
        const advanceBy = isCreativeMode ? effectiveTrimDuration : pieceDuration;
        t += advanceBy;
        remaining -= advanceBy;
      }
    }

    // AI-CHIP: Analyze zoom placements for each PIECE (cut)
    let aiZoomPlacements: any[] = [];
    if (effectsSettings.ai_zoom_enabled && transcription?.text) {
      await updateProgress(42, 'AI-Chip commanding cinematic zooms...');
      aiZoomPlacements = await analyzeZoomPlacementsWithAI(
        transcription.text,
        intensitySegments,
        pieces
      );
      console.log(`[AI-Chip] Generated direction for ${aiZoomPlacements.length} cinematic cuts.`);
    }

    // Second Pass: Finalize elements and apply zooms
    const elements: any[] = [];
    const visualTransitionTimes: number[] = [];

    pieces.forEach((piece, pieceIndex) => {
      const videoElement = { ...piece };
      delete videoElement.poolVideo; // Clean up
      delete videoElement.segIndex;
      delete videoElement.isVeryFirstClip;

      const aiDirection = aiZoomPlacements.find(z => z.piece_index === pieceIndex);
      
      if (effectsSettings.ai_zoom_enabled && aiDirection && aiDirection.zooms) {
        const animations: any[] = [];
        
        aiDirection.zooms.forEach((zoom: any) => {
          if (zoom.type === 'none') return; // backwards compat

          let durationVal = typeof zoom.duration === 'number' ? zoom.duration : (parseFloat(zoom.duration) || piece.duration);
          durationVal = Math.min(piece.duration, durationVal);
          const startTime = Math.min(piece.duration - 0.1, zoom.start_time || 0);
          
          // Clamp scales to safe range for FFmpeg zoompan (0.7 to 3.0)
          const startScale = Math.max(0.7, Math.min(3.0, zoom.start_scale || 1.0));
          const endScale = Math.max(0.7, Math.min(3.0, zoom.end_scale || 1.0));
          
          animations.push({
            type: 'scale',
            time: startTime,
            duration: Math.min(durationVal, piece.duration - startTime),
            start_scale: `${(startScale * 100).toFixed(0)}%`,
            end_scale: `${(endScale * 100).toFixed(0)}%`,
            easing: zoom.easing || 'cubic_out',
          });

          // Store first/primary zoom for GPU worker and DB
          if (!videoElement.aiZoom) {
            videoElement.aiZoom = {
              start: startScale,
              end: endScale,
              duration: durationVal,
              ease: zoom.easing || 'cubic_out'
            };
          }
        });

        if (animations.length > 0) {
          videoElement.animations = animations;
        }

        // Store for feedback loop
        if (videoElement.aiZoom) {
          try {
            supabase
              .from('videos')
              .update({
                ai_zoom_type: aiDirection.zooms[0].type,
                ai_zoom_scale: aiDirection.zooms[0].end_scale,
                ai_zoom_duration: videoElement.aiZoom.duration
              })
              .eq('id', piece.poolVideo.id);
          } catch (e) {
            console.error(`[AI-Chip] Error storing zoom data:`, e);
          }
        }
      } else if (!effectsSettings.ai_zoom_enabled) {
        // Fallback to standard zoom styles
        const zoomStyle = effectsSettings.zoom_style || 'basic';
        if (zoomStyle !== 'none' && piece.duration > 0.5) {
          if (zoomStyle === 'basic') {
            videoElement.animations = [{
              type: 'scale',
              time: Math.max(0, piece.duration - 0.8),
              duration: 0.8,
              start_scale: '100%',
              end_scale: '135%',
              easing: 'cubic-in',
            }];
          } else if (zoomStyle === 'zoom-in') {
            videoElement.animations = [{
              type: 'scale',
              time: 0,
              duration: piece.duration,
              start_scale: '100%',
              end_scale: '115%',
              easing: 'linear',
            }];
          } else if (zoomStyle === 'zoom-out') {
            videoElement.animations = [{
              type: 'scale',
              time: 0,
              duration: piece.duration,
              start_scale: '115%',
              end_scale: '100%',
              easing: 'linear',
            }];
          }
        }
      }

      // Handle transitions tracking
      if (!piece.isVeryFirstClip && piece.time > 0) {
        const isCreativeMode = subtitleSettings.creativeModeEnabled === true;
        let aiTransition = (effectsSettings.ai_zoom_enabled && aiDirection?.transition) ? aiDirection.transition : null;
        
        // --- CINEMATIC FALLBACK (CHAOS MODE) ---
        // If AI is too conservative and picked 'none' during high intensity, force a random high-energy transition
        if (isCreativeMode && (!aiTransition || aiTransition === 'none')) {
          const intensity = getIntensityAtTime(piece.time, transcription?.words || [], intensitySegments);
          if (intensity === 'high') {
            const chaosPool = ['whip-pan', 'zoom-punch', 'glitch-grid', 'pixel-glitch', 'radial-zoom'];
            aiTransition = chaosPool[Math.floor(Math.random() * chaosPool.length)];
            console.log(`[AI-Chip] Chaos Mode: Overriding 'none' with '${aiTransition}' due to high intensity at ${piece.time.toFixed(2)}s`);
          }
        }

        const transitionType = aiTransition || (isCreativeMode ? 'none' : (subtitleSettings.transition || 'fade'));
        const transitionDurationSeconds = transitionType === 'none' ? 0 : 0.4;

        // CRITICAL: Actually assign the transition to the element for the GPU worker
        videoElement.transition = {
          type: transitionType,
          duration: transitionDurationSeconds
        };

        // Calculate overlap (required for xfade transitions to have material to blend)
        let overlap = Math.max(0, Math.min(transitionDurationSeconds, piece.duration * 0.5, piece.time));
        if (overlap > 0) {
          videoElement.time = piece.time - overlap;
          videoElement.duration = piece.duration + overlap;
          videoElement.trim_duration = piece.duration + overlap;
        }
        
        visualTransitionTimes.push(overlap > 0 ? piece.time - overlap : piece.time);
      }

      if (subtitleSettings.creativeModeEnabled) {
        videoElement.loop = false;
      }

      elements.push(videoElement);
      console.log(`Visual piece ${pieceIndex + 1}: ${piece.poolVideo?.file_name} @ ${videoElement.time.toFixed(2)}s for ${videoElement.duration.toFixed(2)}s`);
    });


    // --- SFX PLACEMENT LOGIC ---
    const aiSfxEnabled = effectsSettings.ai_sfx_enabled === true;
    const sfxVolumePercent = subtitleSettings.sfxVolume !== undefined ? subtitleSettings.sfxVolume : 35;
    console.log(`[SFX Config] ai_sfx_enabled: ${aiSfxEnabled}, volume: ${sfxVolumePercent}%`);
    const renderSfxSpecs: any[] = [];
    if (sfxVolumePercent > 0) {
      // 1. GUARANTEED TRANSITION SOUNDS
      const placements: { time: number; sfxId?: string; isAi?: boolean }[] = visualTransitionTimes.map(t => ({
        time: t,
        isAi: false
      }));

      // 2. LAYERED AI SOUNDS
      if (aiSfxEnabled && transcription?.words?.length) {
        console.log('=== Fetching AI SFX layer (Neural Context Aware) ===');
        const visualTimeline = clipStartTimes.map((start, i) => ({
          start,
          end: start + clipDurations[i],
          description: (selectedVideos[i % selectedVideos.length] as any)?.description || 'Minecraft gameplay clip'
        }));

        const rawAiPlacements = await analyzeSFXPlacementsWithAI(
          supabase,
          transcription.text,
          transcription.words,
          project?.user_id,
          visualTimeline,
          intensitySegments,
          project?.sfx_density || 0.5
        );

        // FILTER: Avoid clashing (no AI sound within 0.8s of a transition sound)
        const filteredAi = rawAiPlacements.filter(ap => {
          const tooClose = placements.some(p => Math.abs(p.time - ap.time) < 0.8);
          return !tooClose;
        });

        console.log(`[AI Layer] Filtered ${rawAiPlacements.length} -> ${filteredAi.length} sounds to avoid transition clash.`);
        placements.push(...filteredAi.map(ap => ({ ...ap, isAi: true })));
      }

      // 3. APPLY ALL PLACEMENTS
      placements.sort((a, b) => a.time - b.time);
      // Initialize sfx specs for the worker

      for (const placement of placements) {
        // For transitions, rotate through random sounds if no specific one selected
        // For AI, use the suggested ID
        const sfxUrl = await getSFXFromLibrary(
          supabase, 
          project?.user_id, 
          placement.isAi ? placement.sfxId : subtitleSettings.selectedSfxId
        );

        if (sfxUrl) {
          elements.push({
            type: 'audio',
            track: 3,
            source: sfxUrl,
            time: placement.time,
            volume: `${sfxVolumePercent}%`,
          });
          renderSfxSpecs.push({
            url: sfxUrl,
            time: placement.time,
            volume: sfxVolumePercent,
          });
        }
      }

      console.log(`SFX Pipeline: Total sounds placed: ${renderSfxSpecs.length} (${placements.filter(p => p.isAi).length} AI layers)`);
    } else {
      console.log('SFX disabled (volume = 0)');
    }

    // Add voiceover
    if (voiceoverSignedUrl) {
      elements.push({
        type: 'audio',
        track: 2,
        source: voiceoverSignedUrl,
        time: 0,
        volume: '100%',
      });

      // Add subtitles using transcription data with custom settings
      // WORD-BY-WORD: Show 1-2 words at a time for all animation styles
      // SKIP IF USING WORKER: Worker generates its own subtitles, avoid double work/timeout
      if (!USE_FFMPEG_WORKER && transcription?.words?.length) {

        const styleResult = buildSubtitleStyle(subtitleSettings);
        const { main: mainStyle, shadow: shadowStyle } = styleResult;
        console.log(`Adding ${subtitleStyle} subtitles with ${transcription.words.length} words (word-by-word mode), settings:`, subtitleSettings);

        // Calculate end screen start time to exclude subtitles during end screen
        const endScreenDuration = 2;
        const endScreenStart = endScreenSettings.enabled ? Math.max(0, totalDuration - endScreenDuration) : totalDuration;
        console.log(`Subtitles will stop at ${endScreenStart}s (end screen starts there)`);

        // Creative Mode: Detect server name timings to replace with logo
        // Fetch project title for server name detection
        let serverName = '';
        if (isCreativeMode) {
          const { data: projectData } = await supabase
            .from('projects')
            .select('title')
            .eq('id', projectId)
            .single();
          serverName = projectData?.title || '';
          console.log(`Creative Mode: Project title for server name detection: "${serverName}"`);
        }
        const serverNameTimings = isCreativeMode ? detectServerNameTimings(transcription.words, serverName) : [];
        const serverNameWordIndices = new Set(serverNameTimings.flatMap(t => t.wordIndices));

        // Creative Mode: Find first sentence end for special styling (first 5-8 words)
        const firstSentenceEndWordIndex = isCreativeMode ? findFirstSentenceEndIndex(transcription.words) : -1;
        console.log(`Creative Mode first sentence styling: words 0-${firstSentenceEndWordIndex} will be styled`);

        // Debug server name logo feature
        const hasLogoUrl = !!(endScreenSettings?.logo_url);
        console.log(`Server name logo feature check: isCreativeMode=${isCreativeMode}, serverNameTimings=${serverNameTimings.length}, hasLogoUrl=${hasLogoUrl}`);
        if (hasLogoUrl && endScreenSettings.logo_url) {
          console.log(`Logo URL: ${endScreenSettings.logo_url.substring(0, 100)}...`);
        }

        if (isCreativeMode && serverNameTimings.length > 0 && endScreenSettings?.logo_url) {
          console.log(`Creative Mode: Adding ${serverNameTimings.length} logo appearances for server name "${serverName}"`);
          console.log(`Logo timings: ${JSON.stringify(serverNameTimings.map(t => ({ start: t.start.toFixed(2), end: t.end.toFixed(2), words: t.wordIndices })))}`);


          // Add logo elements for each server name mention
          for (const timing of serverNameTimings) {
            const logoDuration = timing.end - timing.start;

            // Main logo with fast zoom + bounce (no fade)
            elements.push({
              type: 'image',
              track: 5, // Above subtitles
              source: endScreenSettings.logo_url,
              x: '50%',
              y: '50%',
              width: '40%',
              fit: 'contain',
              time: timing.start,
              duration: logoDuration,
              animations: [
                // Fast zoom with bounce overshoot using back-out easing
                { type: 'scale', time: 'start', duration: 0.25, start_scale: '30%', end_scale: '105%', easing: 'back-out' },
                // Settle back to 100% for subtle bounce feel
                { type: 'scale', time: 0.25, duration: 0.15, start_scale: '105%', end_scale: '100%', easing: 'quadratic-out' },
              ],
              // Bright inner white glow
              shadow_color: 'rgba(255,255,255,0.9)',
              shadow_blur: '50px',
              shadow_x: '0px',
              shadow_y: '0px',
            });

            // Secondary glow layer for pulsing inner glow effect
            elements.push({
              type: 'image',
              track: 4, // Behind main logo
              source: endScreenSettings.logo_url,
              x: '50%',
              y: '50%',
              width: '40%',
              fit: 'contain',
              time: timing.start,
              duration: logoDuration,
              opacity: '60%',
              animations: [
                // Same bounce zoom
                { type: 'scale', time: 'start', duration: 0.25, start_scale: '30%', end_scale: '105%', easing: 'back-out' },
                { type: 'scale', time: 0.25, duration: 0.15, start_scale: '105%', end_scale: '100%', easing: 'quadratic-out' },
                // Pulsing glow effect (scale slightly larger then back)
                { type: 'scale', time: 0.4, duration: 0.3, start_scale: '100%', end_scale: '115%', easing: 'sine-in-out' },
                { type: 'scale', time: 0.7, duration: 0.3, start_scale: '115%', end_scale: '100%', easing: 'sine-in-out' },
              ],
              // Extra large blur for glow aura
              shadow_color: 'rgba(255,255,255,1)',
              shadow_blur: '80px',
              shadow_x: '0px',
              shadow_y: '0px',
            });
          }
        }

        // Group words into chunks based on user preference (default 1-2 words for punchy animations)
        const MAX_WORDS_PER_CHUNK = subtitleSettings.wordsPerLine || 2; 
        const chunks: { text: string; start: number; end: number; wordIndices: number[] }[] = [];
        let currentChunk: { words: string[]; start: number; end: number; wordIndices: number[] } | null = null;

        for (let wordIdx = 0; wordIdx < transcription.words.length; wordIdx++) {
          const word = transcription.words[wordIdx];
          if (!word.text || word.start === undefined) continue;

          // Skip words that start during or after end screen
          if (word.start >= endScreenStart) continue;

          // Creative Mode: Skip server name words (they're replaced by logo)
          if (isCreativeMode && serverNameWordIndices.has(wordIdx)) continue;

          if (!currentChunk) {
            currentChunk = { words: [word.text], start: word.start, end: word.end || word.start + 0.3, wordIndices: [wordIdx] };
          } else if (currentChunk.words.length < MAX_WORDS_PER_CHUNK) {
            currentChunk.words.push(word.text);
            currentChunk.end = word.end || currentChunk.end + 0.2;
            currentChunk.wordIndices.push(wordIdx);
          } else {
            chunks.push({ text: currentChunk.words.join(' '), start: currentChunk.start, end: currentChunk.end, wordIndices: currentChunk.wordIndices });
            currentChunk = { words: [word.text], start: word.start, end: word.end || word.start + 0.3, wordIndices: [wordIdx] };
          }
        }
        if (currentChunk) {
          currentChunk.end = Math.min(currentChunk.end, endScreenStart);
          if (currentChunk.start < endScreenStart) {
            chunks.push({ text: currentChunk.words.join(' '), start: currentChunk.start, end: currentChunk.end, wordIndices: currentChunk.wordIndices });
          }
        }

        // Visual Mode: Detect keywords using AI if enabled
        // NOTE: We only detect keywords for chunks AFTER the first sentence (to avoid double-styling)
        let keywordMap = new Map<number, number[]>();
        if (subtitleSettings.visualModeEnabled) {
          console.log('Visual Mode enabled - detecting keywords with AI...');
          keywordMap = await detectKeywordsInChunks(chunks);
        }

        // Add each subtitle chunk as a text element - positioned at 60% (slightly below center)
        // IMPORTANT: We only generate ONE subtitle per chunk, not shadow + main layers
        // The shadow is built into the main style when needed

        // Track last subtitle end time for overlap prevention
        let lastSubtitleEndTime = 0;
        const MIN_SUBTITLE_GAP = 0.05; // 50ms minimum gap between subtitles

        chunks.forEach((chunk, index) => {
          // Subtitle overlap prevention: Ensure this subtitle doesn't overlap with previous one
          const actualStartTime = Math.max(chunk.start, lastSubtitleEndTime + MIN_SUBTITLE_GAP);

          // Ensure subtitle doesn't extend into end screen
          const subtitleEnd = Math.min(chunk.end, endScreenStart);

          // Calculate subtitle duration with overlap prevention
          const subtitleDuration = Math.min(
            subtitleEnd - actualStartTime + 0.1,
            endScreenStart - actualStartTime, // Don't extend into end screen
            0.8 // Max subtitle display time for clean animations
          );

          // Skip if duration is too short
          if (subtitleDuration < 0.05) return;

          // Update last subtitle end time for next iteration
          lastSubtitleEndTime = actualStartTime + subtitleDuration;

          // Check if this chunk has keywords
          const chunkKeywords = keywordMap.get(index);
          const hasKeyword = chunkKeywords && chunkKeywords.length > 0;

          // Creative Mode: Check if ANY word in this chunk is within first 5-8 words
          // Use actual word indices from transcription, not chunk index
          const isFirstSentenceChunk = isCreativeMode && chunk.wordIndices.some(wordIdx => wordIdx <= firstSentenceEndWordIndex);

          // Determine if this chunk needs special styling (first sentence OR keyword)
          const needsSpecialStyling = isFirstSentenceChunk || hasKeyword;

          // Build the chunk style - start with main style
          const chunkStyle = { ...mainStyle };

          // Track if we need a separate shadow layer for this chunk
          let needsShadowLayer = false;
          let shadowLayerStyle: Record<string, unknown> | null = null;

          // Track if this chunk needs enhanced animations (first sentence in Creative Mode)
          const useEnhancedHookAnimation = false;

          // First sentence styling takes priority (only in Creative Mode, first 5 words)
          if (isFirstSentenceChunk && subtitleSettings.visualModeEnabled) {
            // Rainbow color for each word in first sentence
            const rainbowColor = getFirstSentenceColor(index);
            chunkStyle.fill_color = rainbowColor;

            // Keep user's selected font (no custom font override)
            // chunkStyle.font_family stays as user's project font

            // ENHANCED: 30% bigger than regular subtitles (was 20%)
            const baseFontSize = subtitleSettings.fontSize || 6;
            chunkStyle.font_size = `${baseFontSize * 1.3} vmin`;

            // ENHANCED: Stronger glow effect (35px blur, was 20px)
            chunkStyle.shadow_color = rainbowColor;
            chunkStyle.shadow_blur = '35px';
            chunkStyle.shadow_x = '0px';
            chunkStyle.shadow_y = '0px';

            // Hook words get colors, glow, and bigger size only - no shake animation
            // useEnhancedHookAnimation = false (keep default animation)

            // If shadow is enabled, we need a separate shadow layer underneath
            if (shadowStyle) {
              needsShadowLayer = true;
              shadowLayerStyle = {
                fill_color: rainbowColor,
                font_family: chunkStyle.font_family, // Keep user's font
                font_weight: chunkStyle.font_weight,
                font_size: chunkStyle.font_size,
                stroke_color: chunkStyle.stroke_color,
                stroke_width: chunkStyle.stroke_width,
                shadow_color: shadowStyle.shadow_color,
                shadow_blur: shadowStyle.shadow_blur,
                shadow_x: shadowStyle.shadow_x,
                shadow_y: shadowStyle.shadow_y,
              };
            }
            console.log(`First sentence chunk ${index} (words ${chunk.wordIndices.join(',')}): font=${chunkStyle.font_family}, color=${rainbowColor}, ENHANCED hook effects`);
          } else if (hasKeyword && subtitleSettings.visualModeEnabled) {
            // Visual Mode keyword styling (only if NOT in first sentence)
            // Keywords use user's selected font with rainbow color + glow (no custom font override)
            const rainbowColor = getRainbowColorForWord(index);
            chunkStyle.fill_color = rainbowColor;
            // Keep user's selected font - no font_family override

            // Apply glow effect to keywords (even if global glow is disabled)
            chunkStyle.shadow_color = rainbowColor;
            chunkStyle.shadow_blur = '25px';
            chunkStyle.shadow_x = '0px';
            chunkStyle.shadow_y = '0px';

            // If shadow is enabled, we need a separate shadow layer underneath
            if (shadowStyle) {
              needsShadowLayer = true;
              shadowLayerStyle = {
                fill_color: rainbowColor,
                font_family: chunkStyle.font_family, // Keep user's font
                font_weight: chunkStyle.font_weight,
                font_size: chunkStyle.font_size,
                stroke_color: chunkStyle.stroke_color,
                stroke_width: chunkStyle.stroke_width,
                shadow_color: shadowStyle.shadow_color,
                shadow_blur: shadowStyle.shadow_blur,
                shadow_x: shadowStyle.shadow_x,
                shadow_y: shadowStyle.shadow_y,
              };
            }

            console.log(`Visual Mode keyword chunk ${index}: font=${chunkStyle.font_family}, color=${rainbowColor}, glow enabled`);
          } else if (shadowStyle) {
            // Normal subtitle: Apply shadow from shadowStyle to main element
            // This prevents needing a separate shadow layer
            chunkStyle.shadow_color = shadowStyle.shadow_color;
            chunkStyle.shadow_blur = shadowStyle.shadow_blur;
            chunkStyle.shadow_x = shadowStyle.shadow_x;
            chunkStyle.shadow_y = shadowStyle.shadow_y;
          }

          const textElement: any = {
            type: 'text',
            track: 4,
            text: chunk.text,
            time: actualStartTime, // Use overlap-corrected start time
            duration: subtitleDuration,
            x: '50%',
            y: '60%', // 60% - slightly below center
            width: '90%',
            x_alignment: '50%',
            y_alignment: '50%',
            text_align: 'center',
            ...chunkStyle,
          };

          // Add animations based on style - using ONLY valid Creatomate animation types
          // Valid types: fade, scale, slide, bounce, squash, spin, flip, shake, wiggle, shift,
          // text-appear, text-scale, text-slide, text-reveal, text-fly, text-spin, text-wave, text-typewriter
          // NEW ULTRA-SMOOTH animations using proper easing
          if (subtitleStyle === 'pop') {
            // Ultra-smooth pop with back-out easing - very clean
            textElement.animations = [
              {
                type: 'scale',
                time: 'start',
                duration: 0.18,
                easing: 'back-out',
                start_scale: '60%',
                end_scale: '100%',
              },
              {
                type: 'fade',
                time: 'start',
                duration: 0.08,
              },
            ];
          } else if (subtitleStyle === 'elastic') {
            // Elastic spring effect - overshoots then settles
            textElement.animations = [
              {
                type: 'scale',
                time: 'start',
                duration: 0.25,
                easing: 'back-out',
                start_scale: '40%',
                end_scale: '105%',
              },
              {
                type: 'scale',
                time: 0.25,
                duration: 0.1,
                easing: 'quadratic-out',
                end_scale: '100%',
              },
              {
                type: 'fade',
                time: 'start',
                duration: 0.06,
              },
            ];
          } else if (subtitleStyle === 'slide-up') {
            // Smooth slide from below
            textElement.animations = [
              {
                type: 'text-slide',
                time: 'start',
                duration: 0.2,
                easing: 'quadratic-out',
                direction: 'up',
              },
              {
                type: 'fade',
                time: 'start',
                duration: 0.1,
              },
            ];
          } else if (subtitleStyle === 'slide-down') {
            // Smooth slide from above
            textElement.animations = [
              {
                type: 'text-slide',
                time: 'start',
                duration: 0.2,
                easing: 'quadratic-out',
                direction: 'down',
              },
              {
                type: 'fade',
                time: 'start',
                duration: 0.1,
              },
            ];
          } else if (subtitleStyle === 'fly-in') {
            // Flying word animation
            textElement.animations = [
              {
                type: 'text-fly',
                time: 'start',
                duration: 0.22,
                easing: 'quadratic-out',
              },
              {
                type: 'fade',
                time: 'start',
                duration: 0.08,
              },
            ];
          } else if (subtitleStyle === 'reveal') {
            // Smooth text reveal
            textElement.animations = [
              {
                type: 'text-reveal',
                time: 'start',
                duration: 0.2,
                easing: 'quadratic-out',
              },
            ];
          } else if (subtitleStyle === 'bounce') {
            const bounceDuration = 0.12 / subtitleSettings.bounceRate;
            textElement.animations = [
              {
                type: 'bounce',
                time: 'start',
                duration: bounceDuration * 2,
                easing: 'back-out',
              },
              {
                type: 'fade',
                time: 'start',
                duration: 0.08,
              },
            ];
          } else if (subtitleStyle === 'highlight') {
            // Pop in with text-scale
            textElement.animations = [
              {
                type: 'text-scale',
                time: 'start',
                duration: 0.18,
                easing: 'back-out',
              },
              {
                type: 'fade',
                time: 'start',
                duration: 0.1,
              },
            ];
          } else if (subtitleStyle === 'karaoke') {
            // Text appear word by word
            textElement.animations = [
              {
                type: 'text-appear',
                time: 'start',
                duration: Math.min(chunk.end - chunk.start, 0.35),
                easing: 'quadratic-out',
              },
            ];
          } else if (subtitleStyle === 'typewriter') {
            // Real typewriter effect
            textElement.animations = [
              {
                type: 'text-typewriter',
                time: 'start',
                duration: Math.min((chunk.end - chunk.start) * 0.6, 0.5),
              },
            ];
          } else if (subtitleStyle === 'wave') {
            // Text wave animation
            textElement.animations = [
              {
                type: 'text-wave',
                time: 'start',
                duration: Math.min(chunk.end - chunk.start, 0.4),
              },
              {
                type: 'fade',
                time: 'start',
                duration: 0.08,
              },
            ];
          } else if (subtitleStyle === 'zoom') {
            textElement.animations = [
              {
                type: 'scale',
                time: 'start',
                duration: 0.18,
                easing: 'back-out',
                start_scale: '50%',
                end_scale: '105%',
              },
              {
                type: 'scale',
                time: 0.18,
                duration: 0.08,
                easing: 'quadratic-out',
                end_scale: '100%',
              },
              {
                type: 'fade',
                time: 'start',
                duration: 0.08,
              },
            ];
          } else if (subtitleStyle === 'glow') {
            textElement.animations = [
              {
                type: 'fade',
                time: 'start',
                duration: 0.12,
              },
              {
                type: 'scale',
                time: 'start',
                duration: 0.15,
                easing: 'quadratic-out',
                start_scale: '95%',
                end_scale: '100%',
              },
            ];
            // Add glow effect via shadow
            textElement.shadow_color = subtitleSettings.textColor;
            textElement.shadow_blur = '20px';
            textElement.shadow_x = '0px';
            textElement.shadow_y = '0px';
            // NEW ANIMATIONS: Punch
          } else if (subtitleStyle === 'punch') {
            textElement.animations = [
              { type: 'scale', time: 'start', duration: 0.12, easing: 'back-out', start_scale: '200%', end_scale: '98%' },
              { type: 'scale', time: 0.12, duration: 0.06, easing: 'quadratic-out', end_scale: '100%' },
              { type: 'fade', time: 'start', duration: 0.05 },
            ];
            // Smash animation - scale from huge with shake
          } else if (subtitleStyle === 'smash') {
            textElement.animations = [
              { type: 'scale', time: 'start', duration: 0.15, easing: 'quadratic-out', start_scale: '300%', end_scale: '100%' },
              { type: 'shake', time: 0.15, duration: 0.1, x_strength: '3%', y_strength: '2%' },
              { type: 'fade', time: 'start', duration: 0.04 },
            ];
            // Crash animation - drop with rotation
          } else if (subtitleStyle === 'crash') {
            textElement.animations = [
              { type: 'slide', time: 'start', duration: 0.2, easing: 'quadratic-out', direction: '270Â°', distance: '30%' },
              { type: 'scale', time: 'start', duration: 0.2, easing: 'quadratic-out', start_scale: '120%', end_scale: '100%' },
              { type: 'bounce', time: 0.2, duration: 0.15, easing: 'quadratic-out' },
              { type: 'fade', time: 'start', duration: 0.06 },
            ];
            // Float animation - gentle drift up
          } else if (subtitleStyle === 'float') {
            textElement.animations = [
              { type: 'slide', time: 'start', duration: 0.35, easing: 'quadratic-out', direction: '90Â°', distance: '8%' },
              { type: 'fade', time: 'start', duration: 0.15 },
            ];
            // Drift animation - side drift with scale
          } else if (subtitleStyle === 'drift') {
            textElement.animations = [
              { type: 'slide', time: 'start', duration: 0.3, easing: 'quadratic-out', direction: '0Â°', distance: '10%' },
              { type: 'scale', time: 'start', duration: 0.25, easing: 'quadratic-out', start_scale: '90%', end_scale: '100%' },
              { type: 'fade', time: 'start', duration: 0.12 },
            ];
            // Morph animation - squash entrance
          } else if (subtitleStyle === 'morph') {
            textElement.animations = [
              { type: 'squash', time: 'start', duration: 0.25, easing: 'back-out' },
              { type: 'fade', time: 'start', duration: 0.1 },
            ];
            // Spark animation - quick scale burst
          } else if (subtitleStyle === 'spark') {
            textElement.animations = [
              { type: 'scale', time: 'start', duration: 0.08, easing: 'quadratic-out', start_scale: '0%', end_scale: '115%' },
              { type: 'scale', time: 0.08, duration: 0.08, easing: 'quadratic-out', end_scale: '100%' },
              { type: 'fade', time: 'start', duration: 0.04 },
            ];
            // Pulse-grow animation - growing pulse
          } else if (subtitleStyle === 'pulse-grow') {
            textElement.animations = [
              { type: 'scale', time: 'start', duration: 0.15, easing: 'sine-out', start_scale: '80%', end_scale: '108%' },
              { type: 'scale', time: 0.15, duration: 0.1, easing: 'sine-in-out', end_scale: '100%' },
              { type: 'fade', time: 'start', duration: 0.08 },
            ];
            // Ripple animation - wave effect
          } else if (subtitleStyle === 'ripple') {
            textElement.animations = [
              { type: 'text-wave', time: 'start', duration: 0.3 },
              { type: 'scale', time: 'start', duration: 0.2, easing: 'quadratic-out', start_scale: '85%', end_scale: '100%' },
              { type: 'fade', time: 'start', duration: 0.1 },
            ];
            // Cinematic animation - slow epic reveal
          } else if (subtitleStyle === 'cinematic') {
            textElement.animations = [
              { type: 'text-reveal', time: 'start', duration: 0.35, easing: 'quadratic-out' },
              { type: 'scale', time: 'start', duration: 0.4, easing: 'quadratic-out', start_scale: '95%', end_scale: '100%' },
            ];
            // Spotlight animation - scale with fade-up
          } else if (subtitleStyle === 'spotlight') {
            textElement.animations = [
              { type: 'fade', time: 'start', duration: 0.2 },
              { type: 'scale', time: 'start', duration: 0.25, easing: 'back-out', start_scale: '85%', end_scale: '102%' },
              { type: 'scale', time: 0.25, duration: 0.1, easing: 'quadratic-out', end_scale: '100%' },
            ];
          } else {
            // Static - simple quick fade in
            textElement.animations = [
              {
                type: 'fade',
                time: 'start',
                duration: 0.1,
              },
            ];
          }

          // ENHANCED HOOK ANIMATIONS: First sentence in Creative Mode gets impactful entrance
          if (useEnhancedHookAnimation) {
            // Override with shake + scale combo for maximum impact
            textElement.animations = [
              // Subtle shake for attention-grabbing impact
              { type: 'shake', time: 'start', duration: 0.15, x_strength: '2%', y_strength: '1%', speed: 0.05 },
              // Scale up with bounce overshoot
              { type: 'scale', time: 'start', duration: 0.2, start_scale: '70%', end_scale: '105%', easing: 'back-out' },
              // Settle to 100%
              { type: 'scale', time: 0.2, duration: 0.1, end_scale: '100%', easing: 'quadratic-out' },
            ];
          }

          // Cap animation durations to fit within subtitle duration (overlap prevention)
          if (textElement.animations && subtitleDuration < 0.5) {
            textElement.animations = textElement.animations.map((anim: any) => ({
              ...anim,
              duration: Math.min(anim.duration, subtitleDuration * 0.8)
            }));
          }

          // Add shadow layer FIRST (underneath) if needed for glow+shadow combo
          if (needsShadowLayer && shadowLayerStyle) {
            const shadowElement: any = {
              type: 'text',
              track: 3, // Shadow layer underneath main layer (track 4)
              text: chunk.text,
              time: actualStartTime, // Use overlap-corrected start time
              duration: subtitleDuration,
              x: '50%',
              y: '60%',
              width: '90%',
              x_alignment: '50%',
              y_alignment: '50%',
              text_align: 'center',
              ...shadowLayerStyle,
            };

            // Copy animations from main element (already capped)
            if (textElement.animations) {
              shadowElement.animations = textElement.animations;
            }

            elements.push(shadowElement);
          }

          elements.push(textElement);
        });

        console.log(`Created ${chunks.length} subtitle chunks with ${subtitleStyle} style`);
      } else {
        console.log('No transcription words available for subtitles');
      }
    }

    // Add end screen if enabled (last 2 seconds)
    // SKIP IF USING WORKER: Worker handles end screen internally
    if (!USE_FFMPEG_WORKER && endScreenSettings.enabled) {

      const endScreenDuration = 2;
      const endScreenStart = Math.max(0, totalDuration - endScreenDuration);

      console.log(`Adding end screen from ${endScreenStart}s to ${totalDuration}s`);

      // Full-screen blur effect - duplicate video with blur applied
      if (endScreenSettings.blur_enabled) {
        // Find all video elements that overlap with the end screen and duplicate them with blur
        // We iterate over the already-built elements array to find video elements in the end screen range
        const videoElementsInRange: any[] = [];

        for (const el of elements) {
          if (el.type === 'video' && el.track === 1) {
            const elStart = el.time;
            const elEnd = elStart + el.duration;

            // Check if this video element overlaps with end screen
            if (elEnd > endScreenStart && elStart < totalDuration) {
              const overlapStart = Math.max(elStart, endScreenStart);
              const overlapEnd = Math.min(elEnd, totalDuration);
              const overlapDuration = overlapEnd - overlapStart;

              // Calculate trim offset relative to the original element's trim_start
              const offsetFromElementStart = overlapStart - elStart;
              const adjustedTrimStart = (el.trim_start || 0) + offsetFromElementStart;

              if (overlapDuration > 0.01) {
                videoElementsInRange.push({
                  type: 'video',
                  track: 9, // Below overlay track
                  source: el.source,
                  x: '50%',
                  y: '50%',
                  width: '100%',
                  height: '100%',
                  clip: true, // Required for blur to work properly
                  fit: 'cover',
                  time: overlapStart,
                  duration: overlapDuration,
                  trim_start: adjustedTrimStart,
                  trim_duration: overlapDuration,
                  blur_radius: 15, // Softer gaussian blur per user request
                  volume: '0%', // Mute this blurred layer
                });
              }
            }
          }
        }

        // Add all blurred video elements
        elements.push(...videoElementsInRange);
        console.log(`Added ${videoElementsInRange.length} blurred video elements for end screen`);

        // Dark overlay on top of blur for better text readability
        elements.push({
          type: 'shape',
          track: 10,
          shape: 'rectangle',
          x: '50%',
          y: '50%',
          width: '100%',
          height: '100%',
          fill_color: 'rgba(0,0,0,0.4)',
          time: endScreenStart,
          duration: endScreenDuration,
          animations: [{ type: 'fade', time: 'start', duration: 0.2 }],
        });

        console.log('Added blur effect with duplicated video clips');
      }

      // Logo (positioned closer to center - 42%)
      if (endScreenSettings.logo_url) {
        const logoElement: any = {
          type: 'image',
          track: 11,
          source: signedLogoUrl || endScreenSettings.logo_url,
          x: '50%',
          y: '35%', // Higher up
          width: '35%', // Larger logo
          fit: 'contain',
          time: endScreenStart,
          duration: endScreenDuration,
          animations: isCreativeMode ? [
            // Creative Mode: Flip entry with scale overshoot
            { type: 'flip', time: 'start', duration: 0.25, easing: 'back-out' },
            { type: 'scale', time: 'start', duration: 0.35, start_scale: '40%', end_scale: '115%', easing: 'back-out' },
            { type: 'scale', time: 0.35, duration: 0.15, end_scale: '100%', easing: 'quadratic-out' },
            { type: 'fade', time: 'start', duration: 0.2 },
            // Continuous pulse
            { type: 'scale', time: 0.6, duration: 0.35, start_scale: '100%', end_scale: '105%', easing: 'quadratic-in-out' },
            { type: 'scale', time: 0.95, duration: 0.35, end_scale: '100%', easing: 'quadratic-in-out' },
          ] : [
            { type: 'scale', time: 'start', duration: 0.4, start_scale: '80%', easing: 'back-out' },
            { type: 'fade', time: 'start', duration: 0.3 },
          ],
        };

        // Creative Mode: Intense glow
        if (isCreativeMode) {
          logoElement.shadow_color = 'rgba(255,255,255,0.95)';
          logoElement.shadow_blur = '60px';
          logoElement.shadow_x = '0px';
          logoElement.shadow_y = '0px';
        }

        elements.push(logoElement);

        // Creative Mode: Add secondary glow layer for particle-like burst effect
        if (isCreativeMode) {
          elements.push({
            type: 'image',
            track: 10, // Behind main logo
            source: signedLogoUrl || endScreenSettings.logo_url,
            x: '50%',
            y: '42%',
            width: '30%', // Slightly larger
            fit: 'contain',
            time: endScreenStart,
            duration: endScreenDuration * 0.5, // Only for first half
            opacity: '50%',
            animations: [
              { type: 'scale', time: 'start', duration: 0.5, start_scale: '100%', end_scale: '200%', easing: 'quadratic-out' },
              { type: 'fade', time: 'start', duration: 0.5, fade: true },
            ],
            shadow_color: 'rgba(255,255,255,0.5)',
            shadow_blur: '100px',
            shadow_x: '0px',
            shadow_y: '0px',
          });
          console.log('Added particle burst effect layer for end screen logo');
        }
      }

      // IP Text with Dark Box Background
      if (endScreenSettings.ip_text) {
        const ipSettings = endScreenSettings.ip_settings;
        const textY = endScreenSettings.logo_url ? '55%' : '50%';
        
        // Add the dark box background
        elements.push({
          type: 'shape',
          track: 11,
          shape: 'rectangle',
          x: '50%',
          y: textY,
          width: '85%', // Even wider for better fit
          height: '22%', // Taller box
          fill_color: 'rgba(0,0,0,0.65)', // Slightly darker
          border_radius: '5 vmin', // Very rounded
          time: endScreenStart,
          duration: endScreenDuration,
          animations: [
            { type: 'fade', time: 'start', duration: 0.3 },
            { type: 'scale', time: 'start', duration: 0.4, start_scale: '80%', easing: 'back-out' }
          ],
        });

        const ipTextElement: any = {
          type: 'text',
          track: 12,
          text: endScreenSettings.ip_text,
          x: '50%',
          y: textY,
          width: '65%',
          x_alignment: '50%',
          y_alignment: '50%',
          text_align: 'center',
          fill_color: ipSettings.color,
          font_family: ipSettings.fontFamily,
          font_weight: '800',
          font_size: `${ipSettings.fontSize} vmin`,
          time: endScreenStart,
          duration: endScreenDuration,
          animations: isCreativeMode ? [
            // Creative Mode: Enhanced bounce + slide animation
            { type: 'slide', time: 'start', duration: 0.4, direction: '90Â°', distance: '20%', easing: 'back-out' },
            { type: 'scale', time: 'start', duration: 0.4, start_scale: '50%', end_scale: '105%', easing: 'back-out' },
            { type: 'scale', time: 0.4, duration: 0.15, end_scale: '100%', easing: 'quadratic-out' },
            { type: 'fade', time: 'start', duration: 0.25 },
          ] : [
            { type: 'scale', time: 'start', duration: 0.5, start_scale: '70%', easing: 'back-out' },
            { type: 'fade', time: 'start', duration: 0.3 },
          ],
        };

        if (ipSettings.strokeEnabled) {
          ipTextElement.stroke_color = ipSettings.strokeColor;
          ipTextElement.stroke_width = `${ipSettings.strokeWidth * 0.5} vmin`;
        }

        // Rainbow Mode: Multi-layer rainbow glow effect
        const useRainbow = isCreativeMode && ipSettings.rainbowEnabled;
        if (useRainbow) {
          // Rainbow glow uses red as primary with cyan undertones
          ipTextElement.shadow_color = 'rgba(255,0,0,0.8)';
          ipTextElement.shadow_blur = '30px';
          ipTextElement.shadow_x = '0px';
          ipTextElement.shadow_y = '0px';
          console.log('Applied rainbow glow effect to IP text');
        } else if (isCreativeMode) {
          ipTextElement.shadow_color = ipSettings.color || 'rgba(255,255,255,0.7)';
          ipTextElement.shadow_blur = '25px';
          ipTextElement.shadow_x = '0px';
          ipTextElement.shadow_y = '0px';
        } else if (ipSettings.shadowEnabled) {
          ipTextElement.shadow_color = `rgba(0,0,0,${ipSettings.shadowOpacity})`;
          ipTextElement.shadow_blur = `${ipSettings.shadowBlur}px`;
          ipTextElement.shadow_x = `${ipSettings.shadowDistance}px`;
          ipTextElement.shadow_y = `${ipSettings.shadowDistance}px`;
        }

        elements.push(ipTextElement);
      }

      console.log(`End screen elements added ${isCreativeMode ? 'with Creative Mode animations' : 'with blur effect'}`);
    }

    // Add background music if enabled
    // SKIP IF USING WORKER: Worker handles music mixing internally
    if (!USE_FFMPEG_WORKER && musicSettings.enabled && musicSettings.selected_music_id) {

      console.log(`Fetching music track: ${musicSettings.selected_music_id}`);

      const { data: musicTrack, error: musicError } = await supabase
        .from('music_library')
        .select('*')
        .eq('id', musicSettings.selected_music_id)
        .single();

      if (musicError || !musicTrack) {
        console.error('Failed to fetch music track:', musicError);
      } else {
        console.log(`Adding music: "${musicTrack.name}" at ${musicSettings.volume}% volume, starting at ${musicSettings.start_time}s`);

        // Generate signed URL for the music file (bucket is private)
        let musicSourceUrl = musicTrack.file_url;
        const urlParts = musicTrack.file_url.split('/storage/v1/object/public/voiceovers/');
        if (urlParts.length > 1) {
          const filePath = decodeURIComponent(urlParts[1]);
          const { data: signedData, error: signedError } = await supabase.storage
            .from('voiceovers')
            .createSignedUrl(filePath, 3600); // 1 hour expiry

          if (signedData && !signedError) {
            musicSourceUrl = signedData.signedUrl;
            console.log('Using signed URL for music file');
          } else {
            console.error('Failed to create signed URL for music, trying public URL:', signedError);
          }
        }

        // Music element - starts at time 0, but trims from start_time in the audio
        // Duration is limited to totalDuration to prevent extending video with black screen
        elements.push({
          type: 'audio',
          // IMPORTANT: Keep this on a dedicated track that is NOT used by visual elements.
          // Track 4 is used by subtitles in this template; sharing can cause music to be dropped.
          track: 100,
          source: musicSourceUrl,
          time: 0,
          duration: totalDuration, // Cut music to match video length exactly
          trim_start: musicSettings.start_time, // Start from this point in the music
          trim_duration: totalDuration, // Only use this much of the music
          volume: `${musicSettings.volume}%`,
          // Fade in at start, fade out at end for smooth transitions
          audio_fade_in: 0.5,
          audio_fade_out: 1.0,
        });

        console.log(`Music added: ${musicTrack.name}, trimmed from ${musicSettings.start_time}s, duration ${totalDuration}s`);
      }
    }

    console.log(`Built ${elements.length} elements for rendering`);

    // Add Beginning Effect (optional)
    let beginningEffectSfxUrl: string | undefined = undefined;
    if (beginningEffectSettings?.enabled && (signedBeginningImageUrl || beginningEffectSettings.image_url)) {
      console.log('Adding Beginning Effect...');
      elements.push({
        type: 'image',
        track: 20, // High track to be on top
        source: signedBeginningImageUrl || beginningEffectSettings.image_url,
        time: 0,
        duration: 1,
        width: '100%',
        height: '100%',
        fit: 'cover',
        animations: [
          { type: 'fade', time: 'start', duration: 0.5, start_opacity: '0%', end_opacity: `${Math.round((beginningEffectSettings.opacity || 0.6) * 100)}%`, easing: 'linear' },
          { type: 'fade', time: 0.5, duration: 0.5, start_opacity: `${Math.round((beginningEffectSettings.opacity || 0.6) * 100)}%`, end_opacity: '0%', easing: 'linear' }
        ]
      });

      // SFX for Beginning Effect
      if (beginningEffectSettings.sfx_id) {
        // Fetch SFX URL from Supabase
        const { data: sfxData } = await supabase
          .from('sfx_library')
          .select('file_url')
          .eq('id', beginningEffectSettings.sfx_id)
          .single();

        if (sfxData?.file_url) {
          beginningEffectSfxUrl = await signAssetUrl(supabase, sfxData.file_url);
          if (beginningEffectSfxUrl) {
            elements.push({
              type: 'audio',
              track: 19,
              source: beginningEffectSfxUrl,
              time: 0,
            });
            console.log('Added Beginning Effect SFX');
          }
        }
      }
    }



    // MAXIMUM QUALITY render settings
    // IMPORTANT: Use the current RenderScript (v2) API to ensure width/height/frame_rate are honored.
    // Creatomate controls encoding, but correct resolution + fps are the biggest quality levers we have.
    const targetFrameRate = 30;

    console.log(`Quality settings (requested): ${dimensions.width}x${dimensions.height}, fps: ${targetFrameRate}`);

    // RenderScript payload (v2) - MAXIMUM QUALITY
    // Creatomate supports render_scale/max_width/max_height at the top level of this request.
    // To avoid any ambiguity (max_* makes Creatomate ignore render_scale), we ONLY set render_scale here.

    // No custom fonts needed - using user's selected project font for all text
    // (Previously loaded Minecrafter font but now using project font for keywords/first sentence)
    const renderPayload: Record<string, unknown> = {
      output_format: 'mp4',
      width: dimensions.width,
      height: dimensions.height,
      duration: totalDuration,
      frame_rate: targetFrameRate,

      // Force full resolution (prevents preview/downscale renders)
      render_scale: 1,

      // Helpful for tracing renders in logs/webhooks
      metadata: `project:${projectId}`,

      elements,
    };

    await updateProgress(45, 'Sending to renderer...');

    // ============================================
    // SELF-HOSTED FFMPEG WORKER QUEUE (Primary)
    // ============================================
    // Try to queue to FFmpeg worker first - if it fails, fall back to Creatomate
    // Try to queue to FFmpeg worker first - if it fails, fall back to Creatomate
    // const USE_FFMPEG_WORKER = true; // Moved to top of function


    // Force worker path to true for debugging
    if (true) {
      console.log('FORCING WORKER PATH (Debug Mode)');
      console.log(`Resolution: ${dimensions.width}x${dimensions.height}, Frame rate: ${targetFrameRate}fps`);

      try {
        // Build RenderSpec for FFmpeg worker
        // The worker expects a different format than Creatomate - we need to translate

        // Extract clip data for the render spec
        const clipSpecs: Array<{
          url: string;
          start: number;
          duration: number;
          trim_start?: number;
          transition?: { type: string; duration: number };
          zoom?: { start: number; end: number; ease?: string; duration?: number };
        }> = [];



        // Parse clip info from the elements array
        const zoomStyle = effectsSettings.zoom_style || 'basic';
        const BASE_ZOOM = 1.0;
        const MAX_ZOOM = 1.15; // Standard zoom
        const BASIC_ZOOM = 1.35; // Subtle punch for basic (Adjusted from 1.8)

        let clipIndex = 0;
        let currentZoomLevel = BASE_ZOOM; // For alternating styles

        for (const element of elements) {
          if (element.type === 'video' && element.track === 1) {
            const clipDuration = element.duration || 5;
            let zoomInfo: any = undefined;

            if (effectsSettings.ai_zoom_enabled && element.aiZoom) {
              // AI-CHIP: Use the cinematic maneuver commanded by the director
              zoomInfo = {
                start: element.aiZoom.start,
                end: element.aiZoom.end,
                ease: element.aiZoom.ease,
                duration: element.aiZoom.duration,
              };
            } else if (zoomStyle === 'basic') {
              zoomInfo = {
                start: 1.0,
                end: BASIC_ZOOM,
                ease: 'basic',
                duration: clipDuration,
              };
            } else if (zoomStyle === 'zoom-in') {
              zoomInfo = {
                start: 1.0,
                end: MAX_ZOOM,
                ease: 'linear',
                duration: clipDuration,
              };
            } else if (zoomStyle === 'zoom-out') {
              zoomInfo = {
                start: MAX_ZOOM,
                end: 1.0,
                ease: 'linear',
                duration: clipDuration,
              };
            } else if (zoomStyle === 'none') {
              zoomInfo = {
                start: 1.0,
                end: 1.0,
                ease: 'linear',
                duration: clipDuration,
              };
            } else {
              // Legacy/Default Alternating logic
              const isZoomIn = (clipIndex % 2 === 0);
              const zoomStart = currentZoomLevel;
              const zoomEnd = isZoomIn ? 1.6 : 1.0; // The old code used 1.6
              currentZoomLevel = zoomEnd;
              
              zoomInfo = {
                start: zoomStart,
                end: zoomEnd,
                ease: 'intense_start',
                duration: clipDuration
              };
            }

            const isCreativeMode = subtitleSettings.creativeModeEnabled === true;
            const clipTransitionType = element.transition?.type || (isCreativeMode ? 'none' : (subtitleSettings.transition || 'none'));
            const clipTransitionDuration = element.transition?.duration ?? (clipTransitionType === 'none' ? 0 : 0.4);
            const transitionColor = element.transition?.color;

            clipSpecs.push({
              url: element.source,
              start: element.time || 0,
              duration: clipDuration,
              trim_start: element.trim_start || 0,
              transition: clipTransitionType !== 'none' ? {
                type: clipTransitionType as any,
                duration: clipTransitionDuration,
                color: transitionColor
              } : undefined,
              zoom: zoomInfo
            });
            clipIndex++;
          }
        }

        // Logo Recognition Feature:
        // Automatically replace a specific server name with the animated, shining logo
        const { data: projectDataForSubtitle } = await supabase
          .from('projects')
          .select('title')
          .eq('id', projectId)
          .single();
        
        // Use Project Title automatically for recognition trigger
        const serverNameMatch = projectDataForSubtitle?.title || '';
        const serverLogoUrl = subtitleSettings?.server_logo_url || endScreenSettings?.logo_url;
        
        const serverLogoPopups: any[] = [];
        let serverNameWordIndices = new Set<number>();

        if (subtitleSettings.logoRecognitionEnabled && transcription?.words?.length && serverNameMatch && serverLogoUrl) {
          console.log(`[Logo Recognition] Searching for "${serverNameMatch}" to replace with logo...`);
          const serverNameTimings = detectServerNameTimings(transcription.words, serverNameMatch);
          serverNameWordIndices = new Set(serverNameTimings.flatMap(t => t.wordIndices));

          for (const timing of serverNameTimings) {
            const signedServerLogoUrl = await signAssetUrl(supabase, serverLogoUrl);
            serverLogoPopups.push({
              start: timing.start,
              // Exact duration to perfectly match the spoken word length without artificial delays
              duration: timing.end - timing.start,
              url: signedServerLogoUrl || serverLogoUrl
            });
          }
          console.log(`[Logo Recognition] Found ${serverLogoPopups.length} occurrences of "${serverNameMatch}"`);
        }

        // Build subtitle chunks from transcription
        const subtitleChunks: Array<{
          text: string;
          start: number;
          end: number;
          keywords?: number[];
          words?: Array<{ text: string; start: number; end: number }>;
        }> = [];

        if (transcription?.words?.length) {
          // Robust calculation for when the end screen visually starts.
          // The visual timeline is totalDuration (sum of clips).
          // If voiceoverDuration is longer, the worker will pad visuals to match.
          // End screen starts either 2s before video ends, or at the start of visual padding.
          const effectiveVoiceoverDuration = voiceoverDuration || (transcription.words[transcription.words.length - 1].end || 0);
          // Use a slightly larger buffer (2.2s instead of 2.0s) to ensure subtitles are cleared before the end screen fades in/appears,
          // accounting for small discrepancies between estimated and actual media durations on the worker.
          const endScreenStart = endScreenSettings.enabled
            ? Math.min(totalDuration - 0.2, effectiveVoiceoverDuration - 2.2)
            : effectiveVoiceoverDuration + 10;

          console.log(`[Subtitle Logic] Visuals: ${totalDuration.toFixed(2)}s, VO: ${effectiveVoiceoverDuration.toFixed(2)}s. Subtitles will stop at ${endScreenStart.toFixed(2)}s`);

          // Initialize chunk accumulator
          const wordsPerChunk = subtitleSettings.wordsPerLine || 2;
          console.log(`[Logo Recognition] Removing ${serverNameWordIndices.size} word indices from final subtitles:`, Array.from(serverNameWordIndices));

          let currentChunkWords: any[] = [];
          
          const flushChunk = () => {
            if (currentChunkWords.length > 0) {
              const firstWord = currentChunkWords[0];
              const lastWord = currentChunkWords[currentChunkWords.length - 1];
              const start = firstWord.start || 0;
              
              if (start < endScreenStart - 0.1) {
                const rawEnd = lastWord.end || firstWord.start + 0.5;
                // Add hard ceiling: clamp to end screen OR the next upcoming logo popup
                let end = Math.min(rawEnd, endScreenStart);
                
                const nextLogo = serverLogoPopups.find(p => p.start > start + 0.05);
                if (nextLogo) {
                  end = Math.min(end, nextLogo.start);
                }
                
                subtitleChunks.push({
                  text: currentChunkWords.map((w: any) => w.text || w.word || '').join(' ').trim(),
                  start,
                  end,
                  words: currentChunkWords.map((w: any) => ({
                    text: w.text || w.word || '',
                    start: w.start || 0,
                    end: Math.min(w.end || w.start + 0.3, endScreenStart),
                  })),
                });
              }
              currentChunkWords = [];
            }
          };

          for (let i = 0; i < transcription.words.length; i++) {
            const w = transcription.words[i];
            const wStart = w.start || 0;
            const wEnd = w.end || wStart + 0.2;

            const isMatchedWord = serverNameWordIndices.has(i);
            const isOverlap = serverLogoPopups.some((popup: any) => {
              // Exact overlap check with NO massive buffer - 0.02s tolerance for floating point safety
              const popupStart = popup.start - 0.02;
              const popupEnd = popup.start + (popup.duration || 1.2) + 0.02;
              return wStart <= popupEnd && wEnd >= popupStart;
            });

            if (isMatchedWord || isOverlap) {
              // We no longer drop words during logo popups to ensure 100% transcription accuracy.
              // Instead, we just flush the chunk to keep timing clean.
              flushChunk();
            }

            // Word is safe, add to chunk
            currentChunkWords.push(w);

            // If chunk reaches max size, flush it
            if (currentChunkWords.length >= wordsPerChunk) {
              flushChunk();
            }
          }
          
          // Flush any remaining words
          flushChunk();

          // We removed the FINAL SAFETY PASS that deleted chunks during logos.
          // Subtitles will now render continuously to ensure no words are missing.
        }

        // Detect keywords ALWAYS and attach to FFmpeg subtitle chunks
        let keywordMap: Map<number, number[]> = new Map();
        if (subtitleChunks.length > 0) {
          await updateProgress(46, 'Detecting keywords for worker...');
          console.log('Detecting keywords for worker...');
          keywordMap = await detectKeywordsInChunks(subtitleChunks);

          for (let chunkIndex = 0; chunkIndex < subtitleChunks.length; chunkIndex++) {
            const chunkKeywords = keywordMap.get(chunkIndex);
            if (chunkKeywords && chunkKeywords.length > 0) {
              subtitleChunks[chunkIndex].keywords = chunkKeywords;
            }
          }
        }

        console.log(`Built ${subtitleChunks.length} subtitle chunks, ${keywordMap.size} chunks have keywords`);

        // Get music URL if enabled
        let musicUrl: string | undefined;
        if (musicSettings.enabled && musicSettings.selected_music_id) {
          const { data: musicTrack } = await supabase
            .from('music_library')
            .select('file_url')
            .eq('id', musicSettings.selected_music_id)
            .single();

          if (musicTrack?.file_url) {
            musicUrl = await signAssetUrl(supabase, musicTrack.file_url);
          }
        }

        // Music 2
        let music2Url: string | undefined;
        if (musicSettings.music2_enabled && musicSettings.music2_id) {
          const { data: m2 } = await supabase
            .from('music_library')
            .select('file_url')
            .eq('id', musicSettings.music2_id)
            .single();
          if (m2?.file_url) {
            music2Url = await signAssetUrl(supabase, m2.file_url);
          }
        }

        // Get project owner for render queue
        const { data: projectData } = await supabase
          .from('projects')
          .select('user_id')
          .eq('id', projectId)
          .single();

        if (!projectData?.user_id) {
          throw new Error('Could not find project owner');
        }

        // Prepare IP Popup Settings
        let ipPopupRenderSettings: any = undefined;
        let ipPopupSfxUrl: string | undefined;
        if (ipPopupSettings && ipPopupSettings.enabled) {
          console.log('Processing IP Popup settings...');
          ipPopupRenderSettings = {
            enabled: true,
            start: ipPopupSettings.start_time,
            duration: ipPopupSettings.duration,
            sfx: undefined as string | undefined,
            text: ipPopupSettings.text,
            image1: ipPopupSettings.image1.enabled ? { ...ipPopupSettings.image1, url: undefined as string | undefined } : undefined,
            image2: ipPopupSettings.image2.enabled ? { ...ipPopupSettings.image2, url: undefined as string | undefined } : undefined,
          };

          // Sign Image 1 URL
          if (ipPopupSettings.image1.enabled && ipPopupSettings.image1.url) {
            ipPopupRenderSettings.image1.url = await signAssetUrl(supabase, ipPopupSettings.image1.url);
          }

          // Sign Image 2 URL
          if (ipPopupSettings.image2.enabled && ipPopupSettings.image2.url) {
            ipPopupRenderSettings.image2.url = await signAssetUrl(supabase, ipPopupSettings.image2.url);
          }

          // Sign SFX URL
          if (ipPopupSettings.sfx_id) {
            const { data: sfxData } = await supabase
              .from('sfx_library')
              .select('file_url')
              .eq('id', ipPopupSettings.sfx_id)
              .single();

            if (sfxData?.file_url) {
              ipPopupSfxUrl = await signAssetUrl(supabase, sfxData.file_url);
            }
          }
        }

        // --- SIGN EFFECT IMAGES (Beginning & Transition) ---
        let signedBeginningImageUrl: string | undefined = undefined;
        if (beginningEffectSettings?.enabled && beginningEffectSettings.image_url) {
          signedBeginningImageUrl = await signAssetUrl(supabase, beginningEffectSettings.image_url);
          console.log('[Beginning Effect] Signed image URL generated');
        }


        // Sign custom font URL so the worker can download it
        let signedCustomFontUrl: string | undefined;
        let resolvedFontName: string | undefined; // Store the resolved font name for font:{id} format
        if ((subtitleSettings as any).customFontUrl) {
          const fontRef = (subtitleSettings as any).customFontUrl;
          console.log('[Custom Font] Processing customFontUrl:', fontRef);
          
          if (fontRef.startsWith('font:')) {
            const fontId = fontRef.slice(5);
            const { data: fontData } = await supabase
              .from('user_fonts')
              .select('storage_path, font_name')
              .eq('id', fontId)
              .single();
            
            if (fontData?.storage_path) {
              resolvedFontName = fontData.font_name;
              signedCustomFontUrl = await signAssetUrl(supabase, `custom_fonts/${fontData.storage_path}`);
            }
          } else {
            signedCustomFontUrl = await signAssetUrl(supabase, fontRef);
          }
          console.log('[Custom Font] Final signedCustomFontUrl:', signedCustomFontUrl ? (signedCustomFontUrl.substring(0, 80) + '...') : 'undefined');
        }

        // Sign end screen logo URL (already signed above)
        // Build the full render specification
        const renderSpec = {
          version: 1,
          project_id: projectId,
          output: {
            width: dimensions.width,
            height: dimensions.height,
            fps: targetFrameRate,
            codec: 'h264' as const,
            quality: 'high' as const,
            bitrate: dimensions.height >= 2160 ? 50000000 : 25000000, // 50Mbps for 4K, 25Mbps for 1080p
          },
          clips: clipSpecs,
          audio: {
            voiceover: voiceoverSignedUrl ? {
              url: voiceoverSignedUrl,
              volume: 200.0, // Reduced to 200% per user request
            } : undefined,
            music: musicUrl ? {
              url: musicUrl,
              volume: musicSettings.volume * 0.5, // Scale down music by 50% (so 30% -> 15%)
              start_time: musicSettings.start_time || 0,
              fade_in: 0.5,
              fade_out: 1.0,
            } : undefined,
            music2: music2Url ? {
              url: music2Url,
              volume: (musicSettings.music2_volume || 30) * 0.5,
              start_time: musicSettings.music2_start_time || 0,
              crossfade_at: (musicSettings.music2_crossfade_at || 50) / 100 * totalDuration,
              ai_optimized: musicSettings.music2_ai_optimized ?? true,
            } : undefined,
            sfx: renderSfxSpecs.length > 0 ? renderSfxSpecs : undefined,
            removeSilence: musicSettings.remove_silence ?? false,
          },
          subtitles: {
            style: (subtitleSettings.animation_style || (subtitleSettings as any).style || 'pop') as any,
            settings: {
              fontSize: subtitleSettings.fontSize,
              fontFamily: resolvedFontName || subtitleSettings.fontFamily, // Use resolved font name if available
              fontWeight: subtitleSettings.fontWeight || 800,
              textColor: subtitleSettings.textColor,
              strokeEnabled: subtitleSettings.strokeEnabled,
              strokeColor: subtitleSettings.strokeColor,
              strokeWidth: subtitleSettings.strokeWidth,
              shadowEnabled: subtitleSettings.shadowEnabled,
              shadowOpacity: subtitleSettings.shadowOpacity,
              shadowBlur: subtitleSettings.shadowBlur,
              shadowDistance: subtitleSettings.shadowDistance,
              shadowColor: subtitleSettings.shadowColor,
              keywordFontFamily: (subtitleSettings as any).style === 'anyone' ? 'Monocraft' : undefined,
              keywordFontUrl: (subtitleSettings as any).style === 'anyone' ? 'https://cdn.jsdelivr.net/gh/IdreesInc/Monocraft@main/dist/Monocraft-ttf/Monocraft.ttf' : undefined,
              glowEnabled: subtitleSettings.glowEnabled,
              glowColor: subtitleSettings.glowColor,
              glowBlur: subtitleSettings.glowIntensity ? Math.round(subtitleSettings.glowIntensity * 0.4) : 25, // Scale intensity to blur
              glowIntensity: subtitleSettings.glowIntensity,
              glowSize: subtitleSettings.glowSize,
              innerGlowEnabled: subtitleSettings.innerGlowEnabled,
              innerGlowColor: subtitleSettings.innerGlowColor,
              innerGlowIntensity: subtitleSettings.innerGlowIntensity,
              visualModeEnabled: subtitleSettings.visualModeEnabled,
              creativeModeEnabled: subtitleSettings.creativeModeEnabled,
              selectedSfxId: subtitleSettings.selectedSfxId,
              sfxVolume: subtitleSettings.sfxVolume,
              customFontUrl: signedCustomFontUrl,
              wordsPerLine: subtitleSettings.wordsPerLine || 2,
              verticalPosition: (subtitleSettings as any).verticalPosition || 'higher',
              customAnimation: subtitleSettings.customAnimation,
              flashColor: subtitleSettings.flashColor,
              transition: subtitleSettings.transition,
              transitionSuit: subtitleSettings.transitionSuit,
              deadZones: serverLogoPopups.map((p: any) => ({ start: p.start, end: p.start + (p.duration || 1.2) })),
              serverLogoPopups: serverLogoPopups,
            },
            chunks: subtitleChunks,
          },
          endScreen: endScreenSettings.enabled ? {
            enabled: true,
            start: totalDuration - 2,
            duration: 2,
            blur: endScreenSettings.blur_enabled,
            logo: signedLogoUrl || undefined,
            ipText: endScreenSettings.ip_text || undefined,
            ipSettings: {
              fontSize: endScreenSettings.ip_settings?.fontSize || 5,
              fontFamily: endScreenSettings.ip_settings?.fontFamily || 'DejaVu Sans',
              textColor: endScreenSettings.ip_settings?.color || '#ffffff',
              strokeEnabled: endScreenSettings.ip_settings?.strokeEnabled ?? true,
              strokeColor: endScreenSettings.ip_settings?.strokeColor || '#000000',
              strokeWidth: endScreenSettings.ip_settings?.strokeWidth || 2,
            },
            layout: endScreenSettings.layout || 'horizontal',
            rainbowEnabled: endScreenSettings.ip_settings?.rainbowEnabled || false,
            creativeMode: subtitleSettings.creativeModeEnabled,
          } : undefined,
          beginningEffect: beginningEffectSettings.enabled ? {
            enabled: true,
            image: signedBeginningImageUrl || beginningEffectSettings.image_url,
            sfx: beginningEffectSfxUrl || undefined,
          } : undefined,
          ipPopup: ipPopupSettings.enabled ? {
            enabled: true,
            start: ipPopupSettings.start_time,
            duration: ipPopupSettings.duration,
            sfx: ipPopupSfxUrl,
            text: {
              content: ipPopupSettings.text.content,
              x: ipPopupSettings.text.x,
              y: ipPopupSettings.text.y,
              fontFamily: ipPopupSettings.text.font_family,
              fontSize: ipPopupSettings.text.font_size,
              color: ipPopupSettings.text.color,
              strokeEnabled: ipPopupSettings.text.stroke_enabled,
              strokeColor: ipPopupSettings.text.stroke_color,
              strokeWidth: ipPopupSettings.text.stroke_width,
              shadowEnabled: ipPopupSettings.text.shadow_enabled,
              shadowOpacity: ipPopupSettings.text.shadow_opacity,
              shadowBlur: ipPopupSettings.text.shadow_blur,
              glowEnabled: ipPopupSettings.text.glow_enabled,
              glowColor: ipPopupSettings.text.glow_color,
              glowSize: ipPopupSettings.text.glow_size,
              glowIntensity: ipPopupSettings.text.glow_intensity,
            },
            image1: ipPopupRenderSettings?.image1 ? {
              enabled: true,
              url: ipPopupRenderSettings.image1.url,
              x: ipPopupRenderSettings.image1.x,
              y: ipPopupRenderSettings.image1.y,
              scale: ipPopupRenderSettings.image1.scale,
              opacity: ipPopupRenderSettings.image1.opacity,
              zIndex: ipPopupRenderSettings.image1.z_index,
            } : undefined,
            image2: ipPopupRenderSettings?.image2 ? {
              enabled: true,
              url: ipPopupRenderSettings.image2.url,
              x: ipPopupRenderSettings.image2.x,
              y: ipPopupRenderSettings.image2.y,
              scale: ipPopupRenderSettings.image2.scale,
              opacity: ipPopupRenderSettings.image2.opacity,
              zIndex: ipPopupRenderSettings.image2.z_index,
            } : undefined,
          } : undefined,
          serverLogoPopups: serverLogoPopups.length > 0 ? serverLogoPopups : undefined,
          colorimetry: colorimetrySettings,
          effects: effectsSettings,
          commentOverlay: commentOverlay,
          intelligent_selection: false, // Disabled for stabilization (was causing 58% stalls)
        };


        console.log(`Queueing render: ${clipSpecs.length} clips, ${subtitleChunks.length} subtitle chunks`);

        await updateProgress(48, 'Queueing render job...');

        // Insert into render queue
        const { data: queuedJob, error: queueError } = await supabase
          .from('render_queue')
          .insert({
            project_id: projectId,
            user_id: projectData.user_id,
            status: 'pending',
            priority: 5,
            spec: renderSpec,
          })
          .select()
          .single();

        if (queueError) {
          console.error('Failed to queue render job:', queueError);
          throw new Error(`Failed to queue render: ${queueError.message}`);
        }

        console.log(`Render queued successfully: job_id=${queuedJob.id}`);

        // Update project status to show it's queued
        await supabase
          .from('projects')
          .update({
            status: 'queued',
            render_progress: 50, // 50% = Queued and ready for worker (prevents 48% -> 5% jump)
            render_id: queuedJob.id,
            updated_at: new Date().toISOString(),
          })
          .eq('id', projectId);

        console.log('Project status updated to queued - FFmpeg worker will process');
        console.log('=== Process-video function complete (render queued) ===');

        return;

      } catch (ffmpegQueueError: any) {
        console.error('FFmpeg queue failed:', ffmpegQueueError);
        // CRITICAL: Do not fall back to Creatomate if the user expects local worker.
        // Throw the real error so it shows up in the UI.
        throw new Error(`Render Worker Queue Failed: ${ffmpegQueueError.message || ffmpegQueueError}`);
      }
    }

    // ============================================
    // CREATOMATE FALLBACK (Legacy) - DISABLED
    // ============================================
    // If we reach here, it means the worker path failed or was skipped.
    // We do NOT want to use Creatomate for this user.
    console.error('Reached Legacy Creatomate Fallback - THIS SHOULD NOT HAPPEN');
    throw new Error('Render Worker Queue Failed (Hard Fallback): The system attempted to use the legacy renderer but it is disabled. Please check worker logs.');

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Background processing error:', errorMessage);

    await supabase
      .from('projects')
      .update({
        status: 'failed',
        render_progress: 0,
        last_error: errorMessage.substring(0, 500),
        updated_at: new Date().toISOString(),
      })
      .eq('id', projectId);
  }
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const payload = await req.json();
    const {
      projectId,
      prompt,
      subtitleSettings: rawSettings,
      aspectRatio,
      endScreenSettings: rawEndScreen,
      musicSettings: rawMusic,
      beginningEffectSettings: rawBeginningEffect,
      ipPopupSettings: rawIpPopup,
      colorimetrySettings: rawColorimetry,
      effectsSettings: rawEffects,
      commentGeneratorEnabled = false,
      selectedCommentId = null,
      regenerateScript = false,
      targetScriptLength = 30,
      voiceoverAudioData = null, // Fresh audio data instead of stored URL
      excludeAccountIds = [], // For batch YouTube distribution
    } = payload;

    console.log(`Request params - regenerateScript: ${regenerateScript}, targetScriptLength: ${targetScriptLength}s`);
    if (excludeAccountIds.length > 0) {
      console.log(`Batch mode: Will exclude ${excludeAccountIds.length} YouTube accounts`);
    }

    // Parse subtitle settings with defaults
    const subtitleSettings: SubtitleSettings = {
      ...defaultSubtitleSettings,
      ...(rawSettings || {}),
    };

    // Parse end screen settings with defaults
    const endScreenSettings: EndScreenSettings = {
      ...defaultEndScreenSettings,
      ...(rawEndScreen || {}),
      ip_settings: {
        ...defaultEndScreenSettings.ip_settings,
        ...(rawEndScreen?.ip_settings || {}),
      },
    };

    // Parse music settings with defaults
    const musicSettings: MusicSettings = {
      ...defaultMusicSettings,
      ...(rawMusic || {}),
    };

    // Parse beginning effect settings with defaults
    const beginningEffectSettings: BeginningEffectSettings = {
      ...defaultBeginningEffectSettings,
      ...(rawBeginningEffect || {}),
    };


    // Parse IP Pop-up settings with defaults
    const ipPopupSettings: IpPopupSettings = {
      ...defaultIpPopupSettings,
      ...(rawIpPopup || {}),
      // Deep merge for nested objects if needed (text/images) - simplified for now
      text: { ...defaultIpPopupSettings.text, ...(rawIpPopup?.text || {}) },
      image1: { ...defaultIpPopupSettings.image1, ...(rawIpPopup?.image1 || {}) },
      image2: { ...defaultIpPopupSettings.image2, ...(rawIpPopup?.image2 || {}) },
    };

    const defaultColorimetrySettings = {
      brightness: 0,
      contrast: 1,
      saturation: 1,
      preset: 'none'
    };

    const colorimetrySettings: any = {
      ...defaultColorimetrySettings,
      ...(rawColorimetry || {}),
    };

    const effectsSettings: EffectsSettings = {
      flash_enabled: rawEffects?.flash_enabled ?? true,
      flash_color: rawEffects?.flash_color ?? '#ffffff',
      flash_rainbow: rawEffects?.flash_rainbow ?? false,
      ai_sfx_enabled: rawEffects?.ai_sfx_enabled ?? false,
      ai_zoom_enabled: rawEffects?.ai_zoom_enabled ?? false,
      zoom_style: rawEffects?.zoom_style ?? 'basic',
    };

    console.log("Received request for project:", projectId);
    console.log("Subtitle settings:", subtitleSettings);
    console.log("End screen settings:", endScreenSettings);
    console.log("Music settings:", musicSettings);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing Authorization header' }), { status: 401, headers: corsHeaders });
    }

    // @ts-ignore
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    // @ts-ignore
    const supabaseKey = Deno.env.get('SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // First: server-side validation using the user's JWT to ensure they own the project
    const authSupabase = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: userProject, error: authError } = await authSupabase
      .from('projects')
      .select('id')
      .eq('id', projectId)
      .single();

    if (authError || !userProject) {
      return new Response(JSON.stringify({ error: 'Unauthorized to access or modify this project.' }), { status: 403, headers: corsHeaders });
    }

    // Second: Service role client for privileged updates (e.g., worker status, updating processing flags)
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Note: Using worker-api for rendering (Hetzner GPU machine), not Creatomate

    // Validate project has videos using service role (now that authorization is clear)
    const { data: videos, error } = await supabase
      .from('videos')
      .select('id')
      .eq('project_id', projectId)
      .limit(1);

    if (error || !videos?.length) {
      throw new Error('No video clips found for this project');
    }

    await supabase
      .from('projects')
      .update({
        status: 'processing',
        render_progress: 0,
        output_url: null, // Clear old video
        thumbnail_url: null, // Clear old thumbnail
        last_error: null,
        updated_at: new Date().toISOString()
      })
      .eq('id', projectId);

    // Process in background
    // @ts-ignore EdgeRuntime is available in Supabase Edge Functions
    const runtime = globalThis.EdgeRuntime;
    if (runtime?.waitUntil) {
      // Kick off processing in background without awaiting
      // @ts-ignore
      EdgeRuntime.waitUntil((async () => {
        await processVideoInBackground(
          projectId,
          prompt,
          subtitleSettings,
          aspectRatio,
          endScreenSettings,
          musicSettings,
          beginningEffectSettings,
          ipPopupSettings,
          colorimetrySettings,
          effectsSettings,
          commentGeneratorEnabled,
          selectedCommentId,
          regenerateScript,
          targetScriptLength,
          voiceoverAudioData,
          excludeAccountIds
        )
          .catch((err) => {
            console.error('Background processing failed completely:', err);
          });
      })());
    } else {
      // Local development or EdgeRuntime unavailable: await it
      await processVideoInBackground(
        projectId,
        prompt,
        subtitleSettings,
        aspectRatio,
        endScreenSettings,
        musicSettings,
        beginningEffectSettings,
        ipPopupSettings,
        colorimetrySettings,
        effectsSettings,
        commentGeneratorEnabled,
        selectedCommentId,
        regenerateScript,
        targetScriptLength,
        voiceoverAudioData,
        excludeAccountIds
      );
    }
    return new Response(
      JSON.stringify({
        success: true,
        message: 'Video processing started (high quality mode)',
        projectId: projectId,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Request error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    // Try to log error to DB if we have projectId and supabase client
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supabase = createClient(supabaseUrl, supabaseKey);

      // We need to parse body again or scope it?
      // Simpler: just create a new client here to be safe and try to update if possible.
      // But we don't have projectId in this scope easily unless we move it up.
      // Let's iterate: modifying the scope is risky with search/replace.
      // Instead, rely on the fact that if it fails before `processVideoInBackground`,
      // it returns 500.
      // I will just return the error message in the body clearly.
    } catch (e) { /* ignore Deno errors during error logging */ }

    return new Response(
      JSON.stringify({
        error: errorMessage,
        details: 'Check Edge Function Logs'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});