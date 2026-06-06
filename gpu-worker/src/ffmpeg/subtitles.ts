import type { SubtitleSpec, SubtitleChunk, SubtitleSettings, SubtitleStyle, IpPopupSpec } from '../types.js';

// Normalize ALL-CAPS text from transcription APIs (e.g. ElevenLabs Scribe v1)
// Converts fully uppercase words to lowercase. Preserves mixed-case words.
function normalizeCase(text: string): string {
  if (!text) return '';
  
  // Lowercase everything and remove punctuation for a clean minimalist look
  return text.toLowerCase().replace(/[.,!?;:"]/g, '');
}

// Rainbow colors for Visual Mode and Creative Mode
export const RAINBOW_COLORS = [
  'FF0000', // Red
  'FF7F00', // Orange  
  'FFFF00', // Yellow
  '00FF00', // Green
  '0000FF', // Blue
  '4B0082', // Indigo
  '9400D3', // Violet
  'FF1493', // Pink
];

// Convert hex color to ASS BGR format
function hexToBGR(hex: string): string {
  if (!hex) return 'FFFFFF';
  let clean = hex.replace('#', '');
  if (clean.length === 3) {
    clean = clean.split('').map(char => char + char).join('');
  }
  if (clean.length !== 6) return 'FFFFFF';
  const r = clean.substring(0, 2);
  const g = clean.substring(2, 4);
  const b = clean.substring(4, 6);
  return `${b}${g}${r}`;
}

// Convert seconds to ASS timestamp format (H:MM:SS.CC)
function secondsToASS(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  const centisecs = Math.floor((secs % 1) * 100);
  const wholeSecs = Math.floor(secs);

  return `${hours}:${minutes.toString().padStart(2, '0')}:${wholeSecs.toString().padStart(2, '0')}.${centisecs.toString().padStart(2, '0')}`;
}

// In ASS with Alignment=2 (bottom-center), MarginV is the distance from the bottom.
// So smaller MarginV = lower subtitles; larger MarginV = higher subtitles.
function computeMarginV(height: number, position: 'higher' | 'middle' = 'higher'): number {
  // higher: ~35% from top (upper middle) for 9:16.
  // middle: ~50% from top (center)
  const ratio = position === 'middle' ? 0.50 : 0.35;
  const targetFromTop = height * ratio;
  const marginFromBottom = height - targetFromTop;
  return Math.round(marginFromBottom);
}

// Get animation tags for a subtitle style
function getAnimationTags(style: SubtitleStyle, durationMs: number, centerY: number, settings?: SubtitleSettings, baseScale: number = 100): string {
  const m = baseScale / 100;
  // Duration for entrance animations (capped at 500ms or full duration)
  const entranceDur = Math.min(durationMs, 500);
  // Full duration for continuous effects
  const fullDur = durationMs;
  console.log(`[FFmpeg] Subtitle Animation - Style: "${style}", Duration: ${durationMs}ms`);
  switch (style) {
    // --- BASIC ---
    case 'static':
      return `\\fad(50,0)`;

    // --- ENTRANCE ANIMATIONS ---
    case 'pop':
      // Professional overshoot: 0 -> 1.15 -> 1.0
      return `\\fscx0\\fscy0\\t(0,${entranceDur * 0.4},\\fscx${Math.round(115 * m)}\\fscy${Math.round(115 * m)})\\t(${entranceDur * 0.4},${entranceDur},\\fscx${Math.round(100 * m)}\\fscy${Math.round(100 * m)})\\fad(60,0)`;
    case 'bounce':
      return `\\fscx${Math.round(80 * m)}\\fscy${Math.round(80 * m)}\\t(0,${entranceDur * 0.5},\\fscx${Math.round(110 * m)}\\fscy${Math.round(110 * m)})\\t(${entranceDur * 0.5},${entranceDur},\\fscx${Math.round(100 * m)}\\fscy${Math.round(100 * m)})`;
    case 'elastic':
      return `\\fscx${Math.round(50 * m)}\\fscy${Math.round(50 * m)}\\t(0,${entranceDur * 0.6},\\fscx${Math.round(110 * m)}\\fscy${Math.round(110 * m)})\\t(${entranceDur * 0.6},${entranceDur},\\fscx${Math.round(100 * m)}\\fscy${Math.round(100 * m)})`;
    case 'zoom':
      // Soft Smooth Bounce: 90% -> 105% -> 100% over 160ms
      const bounceDur = Math.min(160, durationMs);
      const p1 = Math.round(bounceDur * 0.5);
      return `\\fscx${Math.round(90 * m)}\\fscy${Math.round(90 * m)}\\t(0,${p1},\\fscx${Math.round(105 * m)}\\fscy${Math.round(105 * m)})\\t(${p1},${bounceDur},\\fscx${Math.round(100 * m)}\\fscy${Math.round(100 * m)})`;
    case 'slide-up':
      return `\\move(540,${Math.round(centerY + 160)},540,${Math.round(centerY)},0,${entranceDur})\\fad(80,0)\\fscx${Math.round(100 * m)}\\fscy${Math.round(100 * m)}`;
    case 'slide-down':
      return `\\move(540,${Math.round(centerY - 160)},540,${Math.round(centerY)},0,${entranceDur})\\fad(80,0)\\fscx${Math.round(100 * m)}\\fscy${Math.round(100 * m)}`;
    case 'fly-in':
      return `\\move(-200,${Math.round(centerY)},540,${Math.round(centerY)},0,${entranceDur})\\fad(50,0)\\fscx${Math.round(100 * m)}\\fscy${Math.round(100 * m)}`;
    case 'reveal':
      return `\\clip(0,0,0,1920)\\t(0,${entranceDur},\\clip(0,0,1080,1920))\\fscx${Math.round(100 * m)}\\fscy${Math.round(100 * m)}`;
    case 'slam':
      return `\\fscx${Math.round(160 * m)}\\fscy${Math.round(160 * m)}\\t(0,${entranceDur * 0.4},\\fscx${Math.round(100 * m)}\\fscy${Math.round(100 * m)})`;
    case 'explode':
      return `\\fscx0\\fscy0\\t(0,${entranceDur * 0.5},\\fscx${Math.round(150 * m)}\\fscy${Math.round(150 * m)})\\t(${entranceDur * 0.5},${entranceDur},\\fscx${Math.round(100 * m)}\\fscy${Math.round(100 * m)})\\fad(0,0)`;
    case 'punch':
      return `\\fscx${Math.round(200 * m)}\\fscy${Math.round(200 * m)}\\t(0,${entranceDur * 0.3},\\fscx${Math.round(90 * m)}\\fscy${Math.round(90 * m)})\\t(${entranceDur * 0.3},${entranceDur},\\fscx${Math.round(100 * m)}\\fscy${Math.round(100 * m)})`;
    case 'smash':
      return `\\fscx${Math.round(300 * m)}\\fscy${Math.round(300 * m)}\\t(0,${entranceDur * 0.2},\\fscx${Math.round(95 * m)}\\fscy${Math.round(95 * m)})\\t(${entranceDur * 0.2},${entranceDur},\\fscx${Math.round(100 * m)}\\fscy${Math.round(100 * m)})`;
    case 'crash':
      return `\\move(540,${Math.round(centerY - 400)},540,${Math.round(centerY)},0,${entranceDur})\\fscx${Math.round(150 * m)}\\fscy${Math.round(150 * m)}\\t(0,${entranceDur},\\fscx${Math.round(100 * m)}\\fscy${Math.round(100 * m)})`;
    case 'spin-in':
      return `\\frz360\\t(0,${entranceDur},\\frz0)\\fscx0\\fscy0\\t(0,${entranceDur},\\fscx${Math.round(100 * m)}\\fscy${Math.round(100 * m)})`;
    case 'blur-in':
      return `\\blur20\\t(0,${entranceDur},\\blur0)\\fad(${entranceDur},0)\\fscx${Math.round(100 * m)}\\fscy${Math.round(100 * m)}`;
    case 'drop':
      return `\\move(540,${Math.round(centerY - 300)},540,${Math.round(centerY)},0,${entranceDur})\\fscy${Math.round(150 * m)}\\t(0,${entranceDur},\\fscy${Math.round(100 * m)})\\fscx${Math.round(100 * m)}`;
    case 'flip':
      return `\\fscx${Math.round(-100 * m)}\\t(0,${entranceDur},\\fscx${Math.round(100 * m)})\\fscy${Math.round(100 * m)}`;
    case 'rubberband':
      return `\\fscx${Math.round(150 * m)}\\fscy${Math.round(50 * m)}\\t(0,${entranceDur * 0.5},\\fscx${Math.round(75 * m)}\\fscy${Math.round(125 * m)})\\t(${entranceDur * 0.5},${entranceDur},\\fscx${Math.round(100 * m)}\\fscy${Math.round(100 * m)})`;
    case 'spark':
      return `\\fscx0\\fscy0\\frz45\\t(0,${entranceDur},\\fscx${Math.round(100 * m)}\\fscy${Math.round(100 * m)}\\frz0)\\fad(0,0)`;
    case 'cinematic':
      return `\\fad(${entranceDur},0)\\blur5\\t(0,${entranceDur},\\blur0)\\fscx${Math.round(100 * m)}\\fscy${Math.round(100 * m)}`;
    case 'spotlight':
      return `\\alpha&HFF&\\t(0,${entranceDur * 0.5},\\alpha&H00&)\\fscx${Math.round(120 * m)}\\fscy${Math.round(120 * m)}\\t(0,${entranceDur},\\fscx${Math.round(100 * m)}\\fscy${Math.round(100 * m)})`;
    case 'typewriter':
      return `\\clip(0,0,0,1920)\\t(0,${Math.min(fullDur, 1000)},\\clip(0,0,1080,1920))\\fscx${Math.round(100 * m)}\\fscy${Math.round(100 * m)}`;

    case 'wave':
      return `\\frz-5\\t(0,${fullDur * 0.5},\\frz5)\\t(${fullDur * 0.5},${fullDur},\\frz-5)\\fscx${Math.round(100 * m)}\\fscy${Math.round(100 * m)}`;
    case 'wobble':
      return `\\fscx${Math.round(90 * m)}\\t(0,${fullDur * 0.5},\\fscx${Math.round(110 * m)})\\t(${fullDur * 0.5},${fullDur},\\fscx${Math.round(90 * m)})\\fscy${Math.round(100 * m)}`;
    case 'swing':
      return `\\frz10\\t(0,${fullDur * 0.5},\\frz-10)\\t(${fullDur * 0.5},${fullDur},\\frz10)\\fscx${Math.round(100 * m)}\\fscy${Math.round(100 * m)}`;
    case 'heartbeat':
      return `\\fscx${Math.round(95 * m)}\\fscy${Math.round(95 * m)}\\t(0,${fullDur * 0.25},\\fscx${Math.round(105 * m)}\\fscy${Math.round(105 * m)})\\t(${fullDur * 0.25},${fullDur * 0.5},\\fscx${Math.round(95 * m)}\\fscy${Math.round(95 * m)})\\t(${fullDur * 0.5},${fullDur * 0.75},\\fscx${Math.round(105 * m)}\\fscy${Math.round(105 * m)})\\t(${fullDur * 0.75},${fullDur},\\fscx${Math.round(95 * m)}\\fscy${Math.round(95 * m)})`;
    case 'pulse-grow':
      return `\\fscx${Math.round(90 * m)}\\fscy${Math.round(90 * m)}\\t(0,${fullDur},\\fscx${Math.round(110 * m)}\\fscy${Math.round(110 * m)})`;
    case 'float':
      return `\\move(540,${Math.round(centerY + 20)},540,${Math.round(centerY - 20)},0,${fullDur})\\fscx${Math.round(100 * m)}\\fscy${Math.round(100 * m)}`;
    case 'drift':
      return `\\move(520,${Math.round(centerY)},560,${Math.round(centerY)},0,${fullDur})\\fscx${Math.round(100 * m)}\\fscy${Math.round(100 * m)}`;
    case 'glitch':
      return `\\move(540,${Math.round(centerY)},550,${Math.round(centerY + 10)},0,50)\\t(50,100,\\move(530,${Math.round(centerY - 10)}))\\fscx${Math.round(100 * m)}\\fscy${Math.round(100 * m)}`;
    case 'jitter':
      return `\\frz2\\t(0,50,\\frz-2)\\t(50,100,\\frz2)\\t(100,150,\\frz-2)\\t(150,200,\\frz0)\\fscx${Math.round(100 * m)}\\fscy${Math.round(100 * m)}`;
    case 'flash':
      return `\\alpha&HFF&\\t(0,100,\\alpha&H00&)\\t(100,200,\\alpha&HFF&)\\t(200,300,\\alpha&H00&)\\fscx${Math.round(100 * m)}\\fscy${Math.round(100 * m)}`;
    case 'glow':
      return `\\blur0\\t(0,${fullDur * 0.5},\\blur10)\\t(${fullDur * 0.5},${fullDur},\\blur0)\\fscx${Math.round(100 * m)}\\fscy${Math.round(100 * m)}`;
    case 'karaoke':
      return `\\k${Math.floor(fullDur / 10)}\\fscx${Math.round(100 * m)}\\fscy${Math.round(100 * m)}`;
    case 'highlight':
      return `\\bord5\\t(0,${entranceDur},\\bord2)\\fad(80,0)\\fscx${Math.round(100 * m)}\\fscy${Math.round(100 * m)}`;
    case 'morph':
      return `\\fscx${Math.round(80 * m)}\\fscy${Math.round(120 * m)}\\t(0,${entranceDur},\\fscx${Math.round(100 * m)}\\fscy${Math.round(100 * m)})\\fad(80,0)`;
    case 'ripple':
      return `\\fscx${Math.round(95 * m)}\\fscy${Math.round(95 * m)}\\t(0,${entranceDur * 0.3},\\fscx${Math.round(102 * m)}\\fscy${Math.round(102 * m)})\\t(${entranceDur * 0.3},${entranceDur},\\fscx${Math.round(100 * m)}\\fscy${Math.round(100 * m)})\\fad(60,0)`;
    case 'stomp':
      return `\\fscx${Math.round(200 * m)}\\fscy${Math.round(200 * m)}\\t(0,${entranceDur * 0.2},\\fscx${Math.round(100 * m)}\\fscy${Math.round(100 * m)})`;
    case 'scale-rotate':
      return `\\frz180\\fscx0\\fscy0\\t(0,${entranceDur},\\frz0\\fscx${Math.round(100 * m)}\\fscy${Math.round(100 * m)})`;

    case 'jump':
      return `\\move(540,${Math.round(centerY)},540,${Math.round(centerY - 20)},0,50)\\t(50,100,\\move(540,${Math.round(centerY)}))\\fscx${Math.round(100 * m)}\\fscy${Math.round(100 * m)}`;
    case 'soft-pop': {
      const popDur = Math.min(300, entranceDur);
      const p1 = Math.round(popDur * 0.45);
      const p2 = Math.round(popDur * 0.75);
      let holdTag = '';
      if (popDur < fullDur) {
        holdTag = `\\t(${popDur},${fullDur},\\fscx${Math.round(102 * m)}\\fscy${Math.round(102 * m)})`;
      }
      const safeFade = Math.min(30, Math.floor(fullDur / 4));
      return `\\fscx0\\fscy0\\t(0,${p1},\\fscx${Math.round(110 * m)}\\fscy${Math.round(110 * m)})\\t(${p1},${p2},\\fscx${Math.round(95 * m)}\\fscy${Math.round(95 * m)})\\t(${p2},${popDur},\\fscx${Math.round(100 * m)}\\fscy${Math.round(100 * m)})${holdTag}\\fad(${safeFade},0)`;
    }
    case 'custom': {
      if (!settings?.customAnimation || settings.customAnimation.length === 0) {
        return `\\fad(80,0)`;
      }

      const tracks = settings.customAnimation;
      const timePoints = new Set<number>();
      timePoints.add(0);
      
      console.log(`[FFmpeg] Custom Animation Window: 0ms to ${durationMs}ms`);
      
      tracks.forEach(track => {
        track.keyframes.forEach(kf => {
          // Log only first few and last few to avoid spam but show range
          if (kf.time <= durationMs / 1000) {
            timePoints.add(kf.time);
          } else {
            // console.log(`[FFmpeg]   - Skipping kf at ${kf.time.toFixed(3)}s (outside window)`);
          }
        });
      });
      const sortedTimes = Array.from(timePoints).sort((a, b) => a - b);
      console.log(`[FFmpeg]   - Active keyframe times (s): [${sortedTimes.map(t => t.toFixed(3)).join(', ')}]`);

      // Function to interpolate value at given time
      const getValue = (trackName: string, time: number) => {
        const track = tracks.find(t => t.property === trackName);
        if (!track || track.keyframes.length === 0) return null;
        
        const kfs = track.keyframes;
        if (time <= kfs[0].time) return kfs[0].value;
        if (time >= kfs[kfs.length - 1].time) return kfs[kfs.length - 1].value;

        for (let i = 0; i < kfs.length - 1; i++) {
          if (time >= kfs[i].time && time <= kfs[i + 1].time) {
            if (kfs[i].interpolation === 'hold') return kfs[i].value;
            // Linear interpolation
            const t = (time - kfs[i].time) / (kfs[i + 1].time - kfs[i].time);
            const vStart = kfs[i].value as number;
            const vEnd = kfs[i + 1].value as number;
            return vStart + (vEnd - vStart) * t;
          }
        }
        return kfs[0].value;
      };

      // Initial state tags
      let tags = "";
      const s0 = getValue('scale', 0);
      if (s0 !== null) tags += `\\fscx${Math.round(Number(s0) * m)}\\fscy${Math.round(Number(s0) * m)}`;
      const r0 = getValue('rotation', 0);
      if (r0 !== null) tags += `\\frz${r0}`;
      const o0 = getValue('opacity', 0);
      if (o0 !== null) {
        const alpha = Math.round(255 * (1 - Number(o0) / 100)).toString(16).padStart(2, '0').toUpperCase();
        tags += `\\alpha&H${alpha}&`;
      }

      // Generate transitions (\t tags)
      for (let i = 0; i < sortedTimes.length - 1; i++) {
        const tStart = Math.round(sortedTimes[i] * 1000);
        const tEnd = Math.round(sortedTimes[i + 1] * 1000);
        if (tStart >= durationMs) break;
        
        const actualEnd = Math.min(tEnd, durationMs);
        let segmentTags = "";
        
        const s = getValue('scale', sortedTimes[i+1]);
        if (s !== null) segmentTags += `\\fscx${Math.round(Number(s) * m)}\\fscy${Math.round(Number(s) * m)}`;
        const r = getValue('rotation', sortedTimes[i+1]);
        if (r !== null) segmentTags += `\\frz${r}`;
        const o = getValue('opacity', sortedTimes[i+1]);
        if (o !== null) {
          const alpha = Math.round(255 * (1 - Number(o) / 100)).toString(16).padStart(2, '0').toUpperCase();
          segmentTags += `\\alpha&H${alpha}&`;
        }

        if (segmentTags) {
          tags += `\\t(${tStart},${actualEnd},${segmentTags})`;
        }
      }

      console.log(`[FFmpeg] Custom Animation Logic - Tracks: ${tracks.length}, Total Tags: ${tags.length} chars`);
      if (tags.length > 0) {
        console.log(`[FFmpeg] Generated Animation: "${tags.substring(0, 50)}..."`);
      }
      return tags;
    }
    default:
      console.log(`[FFmpeg] Subtitle style not found: ${style}, falling back to fade.`);
      return `\\fad(80,0)`;
  }
}

// Apply keyword rules globally before regrouping
export function applyKeywordRules(spec: SubtitleSpec) {
  let consecutiveCount = 0;

  for (const chunk of spec.chunks) {
    if (!chunk.keywords || chunk.keywords.length === 0) {
      consecutiveCount = 0;
      continue;
    }

    const validKeywords: number[] = [];
    const keywordColors: Record<number, string> = {};
    const words = chunk.words ? chunk.words.map(w => w.text) : chunk.text.trim().split(/\s+/);
    const wordCount = words.length;

    for (let i = 0; i < wordCount; i++) {
      if (chunk.keywords.includes(i)) {
        consecutiveCount++;
        // BE AGGRESSIVE: Allow up to 8 consecutive keywords for high engagement
        if (consecutiveCount <= 8) {
          validKeywords.push(i);
          // Preserve existing color if available, otherwise pick random
          const existingColor = chunk.keywordColors?.[i];
          if (existingColor) {
            keywordColors[i] = existingColor;
          } else {
            const randColor = RAINBOW_COLORS[Math.floor(Math.random() * RAINBOW_COLORS.length)];
            keywordColors[i] = '#' + randColor;
          }
        }
      } else {
        consecutiveCount = 0;
      }
    }

    chunk.keywords = validKeywords.length > 0 ? validKeywords : undefined;
    chunk.keywordColors = Object.keys(keywordColors).length > 0 ? keywordColors : undefined;
  }
}

// Build style line for ASS file with full settings support
function buildStyleLine(
  settings: SubtitleSettings,
  styleName: string = 'Default',
  marginV: number = 600,
  fontFilePath?: string
): string {
  const fontName = settings.fontFamily;
  if (!fontName) {
    throw new Error('[ASS] NO FONT - fontFamily is empty!');
  }
  // Scale fontSize: app uses vmin scale (0-10), ASS uses pixels
  // For 1080x1920, 1 vmin = 10.8px, so multiply by ~11
  const fontSize = Math.round((settings.fontSize || 6) * 11);
  const primaryColor = `&H00${hexToBGR(settings.textColor?.replace('#', '') || 'FFFFFF')}`;

  const outlineColor = settings.strokeEnabled
    ? `&H00${hexToBGR(settings.strokeColor?.replace('#', '') || '000000')}`
    : '&H00000000';

  // Shadow color with opacity
  // ASS alpha: &H00 (opaque) to &HFF (transparent)
  const opacity = settings.shadowEnabled ? (settings.shadowOpacity ?? 0.8) : 0;
  // If opacity is 1 (fully visible), alpha should be 0. If 0 (invisible), alpha 255.
  const shadowAlpha = Math.round(255 * (1 - opacity));
  const shadowHex = shadowAlpha.toString(16).padStart(2, '0').toUpperCase();

  const shadowColor = settings.shadowEnabled
    ? `&H${shadowHex}${hexToBGR(settings.shadowColor?.replace('#', '') || '000000')}`
    : '&HFF000000'; // Fully transparent if disabled

  // REDUCED MULTIPLIERS to match frontend better (was 4, now 2)
  const outline = settings.strokeEnabled ? Math.round((settings.strokeWidth || 2) * 2) : 0;
  const shadow = settings.shadowEnabled ? Math.round((settings.shadowDistance || 2) * 2) : 0;
  const bold = (settings.fontWeight || 800) >= 700 ? 1 : 0;

  // We rely on fontdir or fontconfig for FFmpeg subtitles filter
  const fullFontName = fontName;

  // Style format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour,
  // Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow,
  // Alignment, MarginL, MarginR, MarginV, Encoding
  // Use Alignment 5 (Middle-Center) for all styles to ensure perfect co-axial scaling
  return `Style: ${styleName},${fullFontName},${fontSize},${primaryColor},${primaryColor},${outlineColor},${shadowColor},${bold},0,0,0,100,100,0,0,1,${outline},${shadow},5,0,0,${marginV},0`;
}

// Helper to re-segment chunks based on wordsPerLine setting
function preprocessChunks(spec: SubtitleSpec): SubtitleChunk[] {
  applyKeywordRules(spec);

  if (!spec.settings.wordsPerLine || spec.settings.wordsPerLine <= 0) {
    return spec.chunks;
  }

  const wordsPerChunk = spec.settings.wordsPerLine;
  const newChunks: SubtitleChunk[] = [];

  // Flatten all words with timing
  const allWords: { text: string; start: number; end: number; originalKeywords?: boolean; keywordColor?: string }[] = [];

  for (const chunk of spec.chunks) {
    if (chunk.words && chunk.words.length > 0) {
      // Use detailed word timing if available
      chunk.words.forEach((w, idx) => {
        allWords.push({
          text: w.text,
          start: w.start,
          end: w.end,
          originalKeywords: chunk.keywords?.includes(idx),
          keywordColor: chunk.keywordColors?.[idx]
        });
      });
    } else {
      // Estimate timing if word-level data missing
      const words = chunk.text.trim().split(/\s+/);
      if (words.length === 0 || (words.length === 1 && words[0] === '')) continue;

      const duration = chunk.end - chunk.start;
      const wordDuration = duration / words.length;
      words.forEach((w, idx) => {
        allWords.push({
          text: w,
          start: chunk.start + (idx * wordDuration),
          end: chunk.start + ((idx + 1) * wordDuration),
          originalKeywords: chunk.keywords?.includes(idx),
          keywordColor: chunk.keywordColors?.[idx]
        });
      });
    }
  }

  // Regroup
  for (let i = 0; i < allWords.length; i += wordsPerChunk) {
    const group = allWords.slice(i, i + wordsPerChunk);
    if (group.length === 0) continue;

    const first = group[0];
    const last = group[group.length - 1];

    // Check if any word in this group was a keyword
    const newKeywords: number[] = [];
    const newKeywordColors: Record<number, string> = {};
    group.forEach((w, idx) => {
      if (w.originalKeywords) {
        newKeywords.push(idx);
        if (w.keywordColor) {
          newKeywordColors[idx] = w.keywordColor;
        }
      }
    });

    newChunks.push({
      text: group.map(w => w.text).join(' '),
      start: first.start,
      end: last.end,
      keywords: newKeywords.length > 0 ? newKeywords : undefined,
      keywordColors: Object.keys(newKeywordColors).length > 0 ? newKeywordColors : undefined,
      words: group.map(w => ({ text: w.text, start: w.start, end: w.end }))
    });
  }

  return newChunks;
}

// Generate ASS subtitle file content with full feature support
export function generateASSSubtitles(spec: SubtitleSpec, width: number, height: number, fontFilePath?: string): string {
  const lines: string[] = [];

  // Apply re-segmentation if needed
  const chunksToRender = preprocessChunks(spec);

  // Bottom margin; target based on user preference (alignment=2).
  const marginV = computeMarginV(height, spec.settings.verticalPosition);
  const centerY = height - marginV;

  // Script info
  lines.push('[Script Info]');
  lines.push('Title: MineEdit Subtitles');
  lines.push('ScriptType: v4.00+');
  lines.push(`PlayResX: ${width}`);
  lines.push(`PlayResY: ${height}`);
  lines.push('WrapStyle: 0');
  lines.push('ScaledBorderAndShadow: yes');
  lines.push('');

  // Styles section
  lines.push('[V4+ Styles]');
  lines.push('Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding');

  // Main style
  lines.push(buildStyleLine(spec.settings, 'Default', marginV, fontFilePath));

  // Creative Mode: Add style for visual hook (first 5 words - larger)
  if (spec.settings.creativeModeEnabled) {
    const hookSettings = {
      ...spec.settings,
      fontSize: (spec.settings.fontSize || 6) * 1.3, // 30% larger for hook
      glowEnabled: true,
      glowBlur: 15, // Reduced from 35 to 15
    };
    lines.push(buildStyleLine(hookSettings, 'Hook', marginV, fontFilePath));

    // Add CTA style (last sentence - even larger with gold glow)
    const ctaSettings = {
      ...spec.settings,
      fontSize: (spec.settings.fontSize || 6) * 1.5, // 50% larger for CTA
      glowEnabled: true,
      glowColor: '#FFD700', // Gold
      glowBlur: 20, // Reduced from 40 to 20
    };
    lines.push(buildStyleLine(ctaSettings, 'CTA', marginV, fontFilePath));
  }

  // Visual Mode: Add keyword style
  if (spec.settings.visualModeEnabled) {
    const keywordSettings = {
      ...spec.settings,
      glowEnabled: true,
      glowBlur: 15, // Reduced from 25 to 15
    };
    lines.push(buildStyleLine(keywordSettings, 'Keyword', marginV, fontFilePath));
  }

  // Inner Glow: Using a dynamic style-inheritance approach instead of a fixed style
  // We no longer need a separate 'InnerGlow' style definition here as we inherit from the base style.

  lines.push('');

  // Events section
  lines.push('[Events]');
  lines.push('Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text');

  // Track total words for Creative Mode hook detection
  let totalWordsSoFar = 0;
  const isFirstSentenceComplete = false;

  // Generate dialogue lines for each chunk
  for (let chunkIdx = 0; chunkIdx < chunksToRender.length; chunkIdx++) {
    const chunk = chunksToRender[chunkIdx];
    const nextChunk = chunksToRender[chunkIdx + 1];

    // DYNAMIC GAP FILLING: Extend end time to the next chunk's start only for small gaps (<= 0.4s).
    // This prevents subtitles from lingering over intentional large visual breaks like Logo Popups.
    let chunkEnd = chunk.end;
    if (nextChunk && (nextChunk.start - chunk.end <= 0.15)) {
      chunkEnd = nextChunk.start;
    }

    // DEAD ZONE ENFORCEMENT: Synchronize stretch logic with logo dead zones
    if (spec.settings.deadZones) {
      for (const zone of spec.settings.deadZones) {
        // ABSOLUTE WALL: No subtitle can ever enter or exist within the logo window
        if (chunk.start < zone.start && chunkEnd > zone.start) {
          chunkEnd = zone.start;
        }
        if (chunk.start >= zone.start && chunk.start < zone.end) {
          chunkEnd = chunk.start;
        }
      }
    }
    
    // Smooth transition: overlap by 100ms if next chunk starts exactly at current end
    const isFadeTransition = spec.settings.transition === 'fade';
    const isSoftPop = spec.style === 'soft-pop';
    if (isFadeTransition && nextChunk && Math.abs(nextChunk.start - chunk.end) < 0.05 && !isSoftPop) {
      chunkEnd += 0.1; // 100ms overlap for smoothness
    }

    const start = secondsToASS(chunk.start);
    const end = secondsToASS(chunkEnd);
    const durationMs = (chunkEnd - chunk.start) * 1000;

    let text = normalizeCase(chunk.text);
    console.log(`[Worker] Subtitle chunk ${chunkIdx}: "${text}" (original: "${chunk.text}")`);
    const animation = getAnimationTags(spec.style, durationMs, centerY, spec.settings);

    // Determine style to use
    let styleName = 'Default';
    if (spec.settings.visualModeEnabled && chunk.keywords && chunk.keywords.length > 0) {
      styleName = 'Keyword';
    }

    const words = text.split(/\s+/);
    const coloredWords: string[] = [];
    const glowWords: string[] = [];

    const defaultTextColor = spec.settings.textColor.replace('#', '');
    const defaultGlowColor = (spec.settings.innerGlowColor || '#ffffff').replace('#', '');

    for (let i = 0; i < words.length; i++) {
      const globalWordIndex = totalWordsSoFar + i;
      let wordText = words[i];
      let wordGlow = words[i];

      // Determine the base color for this word
      let wordBaseColor = defaultTextColor;
      if (spec.settings.creativeModeEnabled && globalWordIndex < 5) {
        wordBaseColor = RAINBOW_COLORS[globalWordIndex % RAINBOW_COLORS.length].replace('#', '');
      } else if (chunk.keywords?.includes(i)) {
        // VISUAL MODE: For rainbow gradient effect, we keep keywords PURE WHITE in main ASS
        // so they can be masked by the rainbow spectrum in the final filter chain.
        wordBaseColor = spec.settings.visualModeEnabled ? 'FFFFFF' : (chunk.keywordColors?.[i] || RAINBOW_COLORS[i % RAINBOW_COLORS.length]).replace('#', '');
      }

      // 1. Build Base Text (Layer 0 and Layer 2)
      if (wordBaseColor !== defaultTextColor) {
        wordText = `{\\c&H${hexToBGR(wordBaseColor)}&}${wordText}{\\c&H${hexToBGR(defaultTextColor)}&}`;
      }
      coloredWords.push(wordText);

      // 2. Build Glow Text (Layer 1)
      // If the word has a specific color, match it. Otherwise use the default inner glow color.
      // CRITICAL: We sync BOTH \1c (primary) and \3c (outline) to the glow color for volumetric bleed.
      const wordGlowHex = (wordBaseColor !== defaultTextColor) ? wordBaseColor : defaultGlowColor;
      const bgrGlow = hexToBGR(wordGlowHex);
      const bgrDefaultGlow = hexToBGR(defaultGlowColor);
      
      wordGlow = `{\\1c&H${bgrGlow}&\\3c&H${bgrGlow}&}${wordGlow}{\\1c&H${bgrDefaultGlow}&\\3c&H${bgrDefaultGlow}&}`;
      glowWords.push(wordGlow);
    }

    let glowText = '';
    text = coloredWords.join(' ');
    glowText = glowWords.join(' ');

    totalWordsSoFar += words.length;

    // Layer 0: Sharp Foundation (Bottom) - Renders the dark stroke and shadow
    // We ALWAYS render this layer unless we are in a CTA chunk with specific CTA style
    const mainTextLayer = `Dialogue: 0,${start},${end},${styleName},,0,0,0,,{${animation}}${text}`;
    lines.push(mainTextLayer);

    // Inner Glow overlay (MINECRAFT VOLUMETRIC SANDWICH - ADAPTIVE COLORS)
    if (spec.settings.innerGlowEnabled) {
      const intensity = (spec.settings.innerGlowIntensity ?? 60) / 100;
      const baseBlur = spec.settings.innerGlowSize ?? 10;
      
      // We use a high-visibility alpha cap for the middle layer
      const alphaHex = Math.round(255 * (1 - intensity * 0.9)).toString(16).padStart(2, '0');

      // Layer 1: Volumetric Glow (Middle) - Uses glowText with per-word adaptive colors
      // VISUAL MODE BYPASS: If spectral rainbow is active, we skip the solid glow for keywords
      // because we will overlay a rainbow-colored glow layer in the final composite.
      const isKeywordChunk = chunk.keywords && chunk.keywords.length > 0;
      if (!(spec.settings.visualModeEnabled && isKeywordChunk)) {
        lines.push(`Dialogue: 1,${start},${end},${styleName},,0,0,0,,{${animation}\\blur${baseBlur}\\bord2\\alpha&H${alphaHex}&\\4a&HFF&}${glowText}`);
      }

      // Layer 2: Punchy Body (Top) - Opaque sharp text with NO stroke/shadow
      lines.push(`Dialogue: 2,${start},${end},${styleName},,0,0,0,,{${animation}\\3a&HFF&\\4a&HFF&}${text}`);
    }
  }

  return lines.join('\n');
}

// Generate a SELECTIVE glow layer for Visual/Creative mode
// Only applies glow to: first 5 hook words (Creative), keywords (Visual), and CTA (last chunk in Creative)
// This creates a blurred background layer that renders UNDER the main text for specific chunks only
// IMPORTANT: Glow color matches the TEXT color (rainbow for keywords/hook, gold for CTA)
export function generateGlowLayer(
  spec: SubtitleSpec,
  width: number,
  height: number,
  fontFilePath?: string
): string {
  // Glow settings:
  // glowSize: The blur radius (softness) of the glow.
  // glowIntensity: The opacity of the glow (0-100).

  // Use glowSize from settings if available, otherwise default to 15.
  // We want the glow to be soft, so this controls the blur radius.
  // UPDATED: Mapped to 0.8x (was 0.5x) since we removed the hard outline vs frontend text-shadow.
  const blurAmount = Math.max(3, Math.round((spec.settings.glowSize || 15) * 0.8));

  // Default glow color
  const defaultGlowColor = spec.settings.glowColor || spec.settings.textColor || '#ffffff';

  const lines: string[] = [];

  // Apply re-segmentation to match main subtitles
  const chunksToRender = preprocessChunks(spec);

  lines.push('[Script Info]');
  lines.push('Title: MineEdit Glow Layer');
  lines.push('ScriptType: v4.00+');
  lines.push(`PlayResX: ${width}`);
  lines.push(`PlayResY: ${height}`);
  lines.push('WrapStyle: 0');
  lines.push('ScaledBorderAndShadow: yes');
  lines.push('');

  lines.push('[V4+ Styles]');
  lines.push('Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding');

  const fontName = spec.settings.fontFamily?.trim();
  if (!fontName) {
    throw new Error('[ASS Glow] NO FONT - fontFamily is empty!');
  }
  // We rely on fontdir or fontconfig for FFmpeg subtitles filter
  const fullFontName = fontName;
  const fontSize = Math.round((spec.settings.fontSize || 6) * 11);
  const baseGlowColorBGR = hexToBGR(defaultGlowColor.replace('#', ''));
  const bold = (spec.settings.fontWeight || 800) >= 700 ? 1 : 0;

  const marginV = computeMarginV(height);
  const centerY = height - marginV;

  // Calculate opacity from glowIntensity (0-100 -> &HFF-&H00)
  // 100% intensity = 0 opacity (fully visible), 0% intensity = 255 opacity (invisible)
  const intensity = Math.min(100, Math.max(0, spec.settings.glowIntensity ?? 50));
  const alphaValue = Math.round(255 * (1 - (intensity / 100)));
  const alphaHex = alphaValue.toString(16).padStart(2, '0').toUpperCase();
  const alphaTag = `&H${alphaHex}`; // e.g. &H80

  // Combine alpha with color for ASS: &HAABBGGRR
  // Glow layer uses the same color for everything to create a solid colored silhouette that gets blurred.
  const fullGlowColor = `${alphaTag}${baseGlowColorBGR}`;

  // The "outline" of the glow layer creates the body of the glow.
  // We keep this relatively thin so it doesn't look like a blocky border, 
  // relying on the blur to expand it.
  // UPDATED: Set to 0 to rely purely on blur for a soft, true glow effect.
  const glowOutline = 0;

  console.log(`[DEBUG] generateGlowLayer: glowOutline=${glowOutline}, blurAmount=${blurAmount}, glowIntensity=${spec.settings.glowIntensity}`);

  // Standard glow style
  // We set Primary, Secondary, and Outline colors to the glow color.
  // BackColour is transparent.
  lines.push(`Style: Glow,${fullFontName},${fontSize},${fullGlowColor},${fullGlowColor},${fullGlowColor},&H00000000,${bold},0,0,0,100,100,0,0,1,${glowOutline},0,2,0,0,${marginV},0`);

  // Hook style (30% larger for first 5 words in Creative Mode)
  const hookFontSize = Math.round(fontSize * 1.3);
  lines.push(`Style: GlowHook,${fullFontName},${hookFontSize},${fullGlowColor},${fullGlowColor},${fullGlowColor},&H00000000,${bold},0,0,0,100,100,0,0,1,${glowOutline},0,2,0,0,${marginV},0`);

  // CTA style (50% larger for last sentence in Creative Mode)
  const ctaFontSize = Math.round(fontSize * 1.5);
  lines.push(`Style: GlowCTA,${fullFontName},${ctaFontSize},${fullGlowColor},${fullGlowColor},${fullGlowColor},&H00000000,${bold},0,0,0,100,100,0,0,1,${glowOutline},0,2,0,0,${marginV},0`);

  lines.push('');

  lines.push('[Events]');
  lines.push('Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text');

  const isCreativeMode = !!spec.settings.creativeModeEnabled;
  const isVisualMode = !!spec.settings.visualModeEnabled;
  const glowEnabledGlobally = !!spec.settings.glowEnabled;

  let totalWordsSoFar = 0;
  const lastChunkIndex = chunksToRender.length - 1;

  for (let chunkIdx = 0; chunkIdx < chunksToRender.length; chunkIdx++) {
    const chunk = chunksToRender[chunkIdx];
    const nextChunk = chunksToRender[chunkIdx + 1];

    // DYNAMIC GAP FILLING: Match main subtitle duration persistence.
    // Prevent lingering over large visual breaks (<= 0.4s gaps only)
    let chunkEnd = chunk.end;
    if (nextChunk && (nextChunk.start - chunk.end <= 0.15)) {
      chunkEnd = nextChunk.start;
    }

    // DEAD ZONE ENFORCEMENT: Synchronize stretch logic with logo dead zones
    if (spec.settings.deadZones) {
      for (const zone of spec.settings.deadZones) {
        if (chunk.end <= zone.start + 0.01 && chunkEnd > zone.start) {
          chunkEnd = zone.start;
        }
      }
    }
    
    // Smooth transition: overlap by 100ms if next chunk starts exactly at current end
    const isFadeTransition = spec.settings.transition === 'fade';
    const isSoftPop = spec.style === 'soft-pop';
    if (isFadeTransition && nextChunk && Math.abs(nextChunk.start - chunk.end) < 0.05 && !isSoftPop) {
      chunkEnd += 0.1; // 100ms overlap
    }

    const words = normalizeCase(chunk.text).trim().split(/\s+/);
    const wordsInChunk = words.length;
    const start = secondsToASS(chunk.start);
    const end = secondsToASS(chunkEnd);
    const durationMs = (chunkEnd - chunk.start) * 1000;
    const animation = getAnimationTags(spec.style, durationMs, centerY, spec.settings);

    let isCTAChunk = false;
    if (isCreativeMode && chunkIdx === lastChunkIndex) {
      isCTAChunk = true;
    }

    // Determine the style to apply to the line (Moved up to fix scope errors)
    let styleName = 'Glow';
    if (isCreativeMode) {
      if (totalWordsSoFar < 5) styleName = 'GlowHook';
      if (isCTAChunk) styleName = 'GlowCTA';
    }

    // We build the dialogue word by word to properly mix Hook, CTA, and Keywords
    const glowWords: string[] = [];

    for (let i = 0; i < words.length; i++) {
      const globalWordIndex = totalWordsSoFar + i;
      let wordText = words[i];

      let wordHasSpecialGlow = false;

      // Apply Hook Glow First
      if (isCreativeMode && globalWordIndex < 5) {
        wordHasSpecialGlow = true;
        const color = RAINBOW_COLORS[globalWordIndex % RAINBOW_COLORS.length];
        const bgr = hexToBGR(color);
        const colorTag = `\\c${alphaTag}${bgr}&\\3c${alphaTag}${bgr}&`;
        wordText = `{${colorTag}}${words[i]}{\\c\\3c}`;
      } else if (chunk.keywords?.includes(i)) {
        // Apply Keyword Glow if not Hook
        wordHasSpecialGlow = true;
        const colorHex = chunk.keywordColors?.[i]?.replace('#', '') || RAINBOW_COLORS[i % RAINBOW_COLORS.length];
        const bgr = hexToBGR(colorHex);
        const fontTag = spec.settings.keywordFontFamily ? `\\fn${spec.settings.keywordFontFamily}\\fscx120\\fscy120` : '';
        const colorTag = `\\c${alphaTag}${bgr}&\\3c${alphaTag}${bgr}&`;
        wordText = `{${colorTag}${fontTag}}${wordText}{\\r${styleName}}`;
      }

      // Hide word if no special glow and global glow is disabled
      if (!wordHasSpecialGlow && !glowEnabledGlobally && !(isCreativeMode && chunkIdx === lastChunkIndex)) {
        wordText = `{\\alpha&HFF&\\3a&HFF&}${wordText}{\\alpha${alphaTag}&\\3a${alphaTag}&}`;
      }

      if (isCreativeMode && chunkIdx === lastChunkIndex) {
        isCTAChunk = true;
      }

      glowWords.push(wordText);
    }

    let glowText = glowWords.join(' ');

    // Apply CTA wrapper if needed
    if (isCTAChunk) {
      const goldColor = hexToBGR('FFD700');
      const colorTag = `\\c${alphaTag}${goldColor}&\\3c${alphaTag}${goldColor}&`;
      // We wrap the original text rather than individual words for CTA to be strictly clean
      glowText = `{${colorTag}}${chunk.text}`;
    }

    // Style calculation has been moved to the top of the loop to support keyword overrides

    // Only render the dialogue line if there's ACTUALLY something to glow (either global glow is on, or we have special words)
    const hasAnyGlow = glowEnabledGlobally || isCTAChunk || (totalWordsSoFar < 5 && isCreativeMode) || (chunk.keywords && chunk.keywords.length > 0);

    if (hasAnyGlow) {
      lines.push(`Dialogue: 0,${start},${end},${styleName},,0,0,0,,{${animation}\\blur${blurAmount}}${glowText}`);
    }


    totalWordsSoFar += wordsInChunk;
  }

  return lines.join('\n');
}

export function generateIpPopupSubtitles(spec: IpPopupSpec, width: number, height: number): string {
  if (!spec.text) return '';

  const lines: string[] = [];
  const textSpec = spec.text;

  // Script info
  lines.push('[Script Info]');
  lines.push('Title: MineEdit IP Popup');
  lines.push('ScriptType: v4.00+');
  lines.push(`PlayResX: ${width}`);
  lines.push(`PlayResY: ${height}`);
  lines.push('WrapStyle: 0');
  lines.push('ScaledBorderAndShadow: yes');
  lines.push('');

  // Styles
  lines.push('[V4+ Styles]');
  lines.push('Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding');

  const fontName = textSpec.font_family;
  if (!fontName) {
    throw new Error('[ASS IP Popup] NO FONT - font_family is empty!');
  }
  // Font size is vmin (percent of smaller dimension).
  const vmin = Math.min(width, height);
  const fontSize = Math.round((textSpec.font_size || 6) / 100 * vmin);

  const primaryColor = `&H00${hexToBGR(textSpec.color || '#ffffff')}`;

  const outlineColor = textSpec.stroke_enabled
    ? `&H00${hexToBGR(textSpec.stroke_color || '#000000')}`
    : '&H00000000';

  const shadowOpacity = textSpec.shadow_enabled ? (textSpec.shadow_opacity ?? 0.8) : 0;
  const shadowAlpha = Math.round(255 * (1 - shadowOpacity)).toString(16).padStart(2, '0').toUpperCase();
  const shadowColor = textSpec.shadow_enabled
    ? `&H${shadowAlpha}000000` // Assuming black shadow for now, or use glow color? Frontend has no shadow color input, usually black.
    : '&HFF000000';

  const outline = textSpec.stroke_enabled ? Math.round(textSpec.stroke_width * 2) : 0; // Scale factor approximation
  const shadow = textSpec.shadow_enabled ? Math.round(textSpec.shadow_blur * 0.5) : 0; // ASS shadow is offset usually, blur is handled by tags?
  // Frontend sends 'shadow_blur'. ASS 'Shadow' is distance.
  // We'll use Shadow for distance default (2) and \blur tag for blur?
  // Actually simpler to just use generic shadow distance if enabled.
  const shadowDist = textSpec.shadow_enabled ? 2 : 0;

  // Alignment 2 (Centered). We will use \pos(X,Y) to position it exactly.
  // So MarginV doesn't matter much if we use \pos.
  const styleLine = `Style: IpPopup,${fontName},${fontSize},${primaryColor},${primaryColor},${outlineColor},${shadowColor},1,0,0,0,100,100,0,0,1,${outline},${shadowDist},5,0,0,0,0`;
  lines.push(styleLine);

  lines.push('');
  lines.push('[Events]');
  lines.push('Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text');

  const start = secondsToASS(spec.start);
  const end = secondsToASS(spec.start + spec.duration);

  // Position
  const posX = Math.round((textSpec.x / 100) * width);
  const posY = Math.round((textSpec.y / 100) * height);

  // Animation: Simple fade + pop
  const fadeDur = 500;
  // Animation tags: \fad(500,500) \pos(x,y)
  // Maybe a slight scale up pop?
  const popAnim = `\\fscx0\\fscy0\\t(0,${fadeDur},\\fscx100\\fscy100)`;
  const tags = `\\pos(${posX},${posY})\\fad(${fadeDur},${fadeDur})${popAnim}`;

  // Glow
  let glowTags = '';
  if (textSpec.glow_enabled) {
    const glowColor = hexToBGR(textSpec.glow_color || '#ff0000');
    // ASS uses \bord and \3c for glow if we want an outline glow.
    // Or \blur.
    // If we use \blur without \bord, it blurs the text itself? No, EdgeBlur?
    // Best way in ASS to separate glow is a layer, but single layer:
    // \blurN blurs the outline (border).
    // So if stroke is enabled, \blur affects stroke.
    // If stroke disabled, \blur affects text?
    // Let's use \blur.
    const blur = Math.round(textSpec.glow_size || 10);
    glowTags = `\\blur${blur}`;
    // If glow color is different from stroke color, we can't easily do it in one pass if stroke is present.
    // But standard "glow" usually implies colored shadow/outline.
    // If stroke is enabled, glow usually matches or is outside.
    // For simplicity, we just add blur.
    if (!textSpec.stroke_enabled) {
      // If no stroke, we can add a border for the glow
      glowTags += `\\bord${Math.round(textSpec.glow_intensity / 20)}\\3c&H00${glowColor}&`;
    }
  }

  lines.push(`Dialogue: 0,${start},${end},IpPopup,,0,0,0,,{${tags}${glowTags}}${textSpec.content}`);

  return lines.join('\n');
}

/**
 * Generate a selective KEYWORD MASK for Rainbow Spectral effect.
 * This renders keywords as solid white silhouettes on a black background,
 * which acts as an alpha stencil for the smooth rainbow gradient.
 */
export function generateKeywordMask(
  spec: SubtitleSpec,
  width: number,
  height: number,
  fontFilePath?: string,
  maskType: 'body' | 'glow' = 'body'
): string {
  const lines: string[] = [];
  const chunksToRender = preprocessChunks(spec);
  const marginV = computeMarginV(height, spec.settings.verticalPosition);
  const centerY = height - marginV;

  lines.push('[Script Info]');
  lines.push('Title: MineEdit Keyword Mask');
  lines.push('ScriptType: v4.00+');
  lines.push(`PlayResX: ${width}`);
  lines.push(`PlayResY: ${height}`);
  lines.push('WrapStyle: 0');
  lines.push('ScaledBorderAndShadow: yes');
  lines.push('');

  lines.push('[V4+ Styles]');
  lines.push('Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding');

  const fontName = spec.settings.fontFamily?.trim() || 'Arial';
  const fontSize = Math.round((spec.settings.fontSize || 6) * 11);
  const bold = (spec.settings.fontWeight || 800) >= 700 ? 1 : 0;

  // Mask Style Configuration
  // Body: Sharp silhouette
  // Glow: Volumetric expansion for a rainbow halo effect
  const outline = maskType === 'glow' ? Math.max(4, Math.round((spec.settings.innerGlowSize || 10) * 0.4)) : 0;
  const blur = maskType === 'glow' ? Math.max(5, Math.round((spec.settings.innerGlowSize || 10) * 1.5)) : 0;

  lines.push(`Style: Mask,${fontName},${fontSize},&H00FFFFFF,&H00FFFFFF,&H00FFFFFF,&H00000000,${bold},0,0,0,100,100,0,0,1,${outline},0,5,0,0,${marginV},0`);
  lines.push('');

  lines.push('[Events]');
  lines.push('Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text');

  let totalWordsSoFar = 0;

  for (let chunkIdx = 0; chunkIdx < chunksToRender.length; chunkIdx++) {
    const chunk = chunksToRender[chunkIdx];
    const nextChunk = chunksToRender[chunkIdx + 1];

    let chunkEnd = chunk.end;
    if (nextChunk && (nextChunk.start - chunk.end <= 0.15)) {
      chunkEnd = nextChunk.start;
    }

    if (spec.settings.deadZones) {
      for (const zone of spec.settings.deadZones) {
        if (chunk.start < zone.start && chunkEnd > zone.start) chunkEnd = zone.start;
        if (chunk.start >= zone.start && chunk.start < zone.end) chunkEnd = chunk.start;
      }
    }

    const start = secondsToASS(chunk.start);
    const end = secondsToASS(chunkEnd);
    const durationMs = (chunkEnd - chunk.start) * 1000;
    const animation = getAnimationTags(spec.style, durationMs, centerY, spec.settings);

    const words = normalizeCase(chunk.text).split(/\s+/);
    const maskWords: string[] = [];

    for (let i = 0; i < words.length; i++) {
        const isKeyword = chunk.keywords?.includes(i);
        if (isKeyword) {
          maskWords.push(words[i]);
        } else {
          // Hide non-keywords completely in the mask
          maskWords.push(`{\\alpha&HFF&}${words[i]}{\\alpha&H00&}`);
        }
    }

    if (maskWords.length > 0 && chunk.keywords && chunk.keywords.length > 0) {
      const text = maskWords.join(' ');
      const blurTag = blur > 0 ? `\\blur${blur}` : '';
      lines.push(`Dialogue: 0,${start},${end},Mask,,0,0,0,,{${animation}${blurTag}}${text}`);
    }
  }

  return lines.join('\n');
}
