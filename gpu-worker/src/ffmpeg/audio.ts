import { spawn } from 'child_process';
import { writeFile, mkdir, rm } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import type { AudioSpec, RenderSpec, SilencePeriod } from '../types.js';

// Detect silences in a media file
export async function detectSilences(
  filePath: string,
  ffmpegPath: string,
  noiseThreshold: string = '-50dB',
  minDuration: number = 0.5
): Promise<SilencePeriod[]> {
  return new Promise((resolve) => {
    // ffmpeg -i vo.mp3 -af silencedetect=n=-50dB:d=0.5 -f null -
    const proc = spawn(ffmpegPath, [
      '-i', filePath,
      '-af', `silencedetect=noise=${noiseThreshold}:d=${minDuration}`,
      '-f', 'null', '-'
    ]);

    let stderr = '';
    proc.stderr.on('data', (d) => stderr += d.toString());

    proc.on('close', () => {
      const silences: SilencePeriod[] = [];
      const lines = stderr.split('\n');
      let currentSilence: Partial<SilencePeriod> | null = null;

      for (const line of lines) {
        // [silencedetect @ 0x...] silence_start: 12.34
        const startMatch = line.match(/silence_start: (\d+\.?\d*)/);
        if (startMatch) {
          currentSilence = { start: parseFloat(startMatch[1]) };
        }

        // [silencedetect @ 0x...] silence_end: 14.56 | silence_duration: 2.22
        const endMatch = line.match(/silence_end: (\d+\.?\d*) \| silence_duration: (\d+\.?\d*)/);
        if (endMatch && currentSilence) {
          currentSilence.end = parseFloat(endMatch[1]);
          currentSilence.duration = parseFloat(endMatch[2]);
          silences.push(currentSilence as SilencePeriod);
          currentSilence = null;
        }
      }
      resolve(silences);
    });
  });
}

// Remap all timestamps in the spec based on removed silences
export function remapSpecTimestamps(spec: RenderSpec, silences: SilencePeriod[]): RenderSpec {
  if (silences.length === 0) return spec;

  const remap = (t: number) => {
    let reduction = 0;
    for (const s of silences) {
      if (t >= s.end) {
        reduction += s.duration;
      } else if (t > s.start) {
        reduction += (t - s.start);
      }
    }
    return Math.max(0, t - reduction);
  };

  // 1. Video Clips
  if (spec.clips) {
    spec.clips = spec.clips.map(clip => ({
      ...clip,
      start: remap(clip.start)
      // duration remains same unless we want to cut INTO a clip which is complex.
      // Usually clips are placed at boundaries.
    }));
  }

  // 2. Subtitles
  if (spec.subtitles?.chunks) {
    spec.subtitles.chunks = spec.subtitles.chunks.map(chunk => ({
      ...chunk,
      start: remap(chunk.start),
      end: remap(chunk.end),
      words: chunk.words?.map(w => ({
        ...w,
        start: remap(w.start),
        end: remap(w.end)
      }))
    }));
  }

  // 3. SFX
  if (spec.audio?.sfx) {
    spec.audio.sfx = spec.audio.sfx.map(sfx => ({
      ...sfx,
      time: remap(sfx.time)
    }));
  }

  // 4. IP Popup
  if (spec.ipPopup) {
    spec.ipPopup.start = remap(spec.ipPopup.start);
  }

  // 5. Server Logo Popups
  if (spec.serverLogoPopups) {
    spec.serverLogoPopups = spec.serverLogoPopups.map(p => ({
      ...p,
      start: remap(p.start)
    }));
  }

  // 6. End Screen
  if (spec.endScreen) {
    spec.endScreen.start = remap(spec.endScreen.start);
  }

  return spec;
}

// AI logic to pick an optimal transition point between music tracks
export function calculateOptimizedCrossfadePoint(
  spec: RenderSpec,
  targetTime: number,
  actualDuration: number
): number {
  // 1. Get all clip boundaries
  const boundaries: number[] = [];
  let current = 0;
  for (const clip of spec.clips) {
    boundaries.push(current);
    current += clip.duration;
  }
  
  // 2. Find the boundary closest to targetTime
  let bestPoint = targetTime;
  let minDiff = Infinity;
  
  for (const b of boundaries) {
    const diff = Math.abs(b - targetTime);
    if (diff < minDiff) {
      minDiff = diff;
      bestPoint = b;
    }
  }
  
  // 3. Fallback: If no boundary is within 3 seconds, just use the target
  if (minDiff > 3) {
    return targetTime;
  }
  
  console.log(`[AI Music] Optimized crossfade from ${targetTime.toFixed(2)}s to boundary at ${bestPoint.toFixed(2)}s`);
  return bestPoint;
}

// Build audio filter chain
export function buildAudioFilterChain(
  spec: AudioSpec,
  totalDuration: number,
  inputIndexMap: any,
  ipPopupSpec?: any,
  hasAudioMap: Record<string, boolean> = {},
  fullSpec?: RenderSpec
): string[] {
  const filters: string[] = [];
  const audioOutputs: string[] = [];

  // Resilient mapping with silence fallback to prevent "matches no streams"
  const addSafeAudio = (inputIdx: number, label: string, filterStr: string, hasAudio: boolean) => {
    if (hasAudio) {
      if (label === 'vo' && spec.removeSilence) {
        // Automatic silence removal for VO
        filters.push(`[${inputIdx}:a]silenceremove=stop_periods=-1:stop_duration=0.5:stop_threshold=-50dB,${filterStr}[${label}_raw]`);
      } else {
        filters.push(`[${inputIdx}:a]${filterStr}[${label}_raw]`);
      }
      audioOutputs.push(`[${label}_raw]`);
    } else {
      console.warn(`[FFmpeg] Audio Check: Input ${inputIdx} (${label}) missing audio stream. Using anullsrc fallback.`);
      filters.push(`anullsrc=r=44100:cl=stereo:d=${totalDuration}[${label}_silence]`);
      audioOutputs.push(`[${label}_silence]`);
    }
  };

  // 1. Beginning SFX
  if (inputIndexMap.beginningSfx !== undefined) {
    addSafeAudio(inputIndexMap.beginningSfx, 'begsfx', 'aresample=async=1,aformat=channel_layouts=stereo:sample_rates=44100,volume=1.0', !!hasAudioMap.beginningSfx);
  }

  // 2. IP Popup SFX
  if (inputIndexMap.ipPopupSfx !== undefined && ipPopupSpec?.sfx) {
    const delay = Math.round(ipPopupSpec.start * 1000);
    addSafeAudio(inputIndexMap.ipPopupSfx, 'ippopupsfx', `aresample=async=1,aformat=channel_layouts=stereo:sample_rates=44100,volume=1.0,adelay=${delay}:all=1`, !!hasAudioMap.ipPopupSfx);
  }

  // 3. Voiceover
  if (spec.voiceover && inputIndexMap.voiceover !== undefined) {
    addSafeAudio(inputIndexMap.voiceover, 'vo', `aresample=async=1,aformat=channel_layouts=stereo:sample_rates=44100,volume=${spec.voiceover.volume/100},afade=t=in:d=0.1,afade=t=out:st=${totalDuration-0.5}:d=0.5`, !!hasAudioMap.voiceover);
  }

  // 4. Music
  if (spec.music && inputIndexMap.music !== undefined) {
    const st = spec.music.start_time || 0;
    
    if (spec.music2 && inputIndexMap.music2 !== undefined) {
      // MULTI-TRACK CROSSFADE
      let crossfadeAt = spec.music2.crossfade_at || (totalDuration / 2);
      
      // AI optimization: find the best clip boundary
      if (spec.music2.ai_optimized && fullSpec) {
        crossfadeAt = calculateOptimizedCrossfadePoint(fullSpec, crossfadeAt, totalDuration);
      }
      
      const fadeDur = 2.0;
      
      // Track 1: Fade out
      let f1 = st > 0 ? `atrim=start=${st},asetpts=PTS-STARTPTS,` : '';
      f1 += `aresample=async=1,aformat=channel_layouts=stereo:sample_rates=44100,volume=${spec.music.volume/100},afade=t=out:st=${crossfadeAt}:d=${fadeDur}`;
      addSafeAudio(inputIndexMap.music, 'music1', f1, !!hasAudioMap.music);
      
      // Track 2: Delay and Fade in
      const m2st = spec.music2.start_time || 0;
      let f2 = m2st > 0 ? `atrim=start=${m2st},asetpts=PTS-STARTPTS,` : '';
      f2 += `aresample=async=1,aformat=channel_layouts=stereo:sample_rates=44100,volume=${spec.music2.volume/100},adelay=${Math.round(crossfadeAt*1000)}:all=1,afade=t=in:st=${crossfadeAt}:d=${fadeDur}`;
      addSafeAudio(inputIndexMap.music2, 'music2', f2, !!hasAudioMap.music2);
    } else {
      // SINGLE TRACK (Standard)
      let f = st > 0 ? `atrim=start=${st},asetpts=PTS-STARTPTS,` : '';
      f += `aresample=async=1,aformat=channel_layouts=stereo:sample_rates=44100,volume=${spec.music.volume/100},afade=t=in:d=${spec.music.fade_in || 1},afade=t=out:st=${totalDuration-(spec.music.fade_out||2)}:d=${spec.music.fade_out||2}`;
      addSafeAudio(inputIndexMap.music, 'music', f, !!hasAudioMap.music);
    }
  }

  // 5. General SFX
  if (spec.sfx) {
    spec.sfx.forEach((sfx, i) => {
      const idx = inputIndexMap.sfx[i];
      if (idx !== undefined) {
        addSafeAudio(idx, `sfx${i}`, `aresample=async=1,aformat=channel_layouts=stereo:sample_rates=44100,volume=${sfx.volume/100},adelay=${sfx.time*1000}:all=1`, !!hasAudioMap[`sfx${i}`]);
      }
    });
  }

  // Mix
  if (audioOutputs.length > 1) {
    filters.push(`${audioOutputs.join('')}amix=inputs=${audioOutputs.length}:duration=longest:dropout_transition=0,aresample=async=1[aout]`);
  } else if (audioOutputs.length === 1) {
    filters.push(`${audioOutputs[0]}acopy[aout]`);
  } else {
    filters.push(`anullsrc=r=44100:cl=stereo:d=${totalDuration}[aout]`);
  }

  return filters;
}

export function buildLoudnormFilter(input: string, output: string): string {
  return `[${input}]loudnorm=I=-16:TP=-1.5:LRA=11[${output}]`;
}
