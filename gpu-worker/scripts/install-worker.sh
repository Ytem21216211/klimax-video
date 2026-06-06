#!/bin/bash
# MineEdit GPU Worker - Complete Installer
# Run this script from /opt/mineedit-gpu-worker/gpu-worker/

set -e

echo "========================================"
echo "MineEdit GPU Worker - File Installer"
echo "========================================"

# Create directories
mkdir -p src/ffmpeg
mkdir -p logs

echo "[1/9] Creating src/types.ts..."
cat > src/types.ts << 'TYPES_EOF'
// Render queue job from database
export interface RenderJob {
  id: string;
  project_id: string;
  user_id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  spec: RenderSpec;
  priority: number;
  attempts: number;
  max_attempts: number;
  error_message: string | null;
  worker_id: string | null;
  output_url: string | null;
  thumbnail_url: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

// Full render specification
export interface RenderSpec {
  version: number;
  project_id: string;
  output: OutputSettings;
  clips: ClipSpec[];
  audio: AudioSpec;
  subtitles: SubtitleSpec;
  endScreen?: EndScreenSpec;
}

export interface OutputSettings {
  width: number;
  height: number;
  fps: number;
  codec: 'h264' | 'h265';
  quality: 'draft' | 'standard' | 'high';
  bitrate?: number;
}

export interface ClipSpec {
  url: string;
  start: number;
  duration: number;
  trim_start?: number;
  transition?: TransitionSpec;
}

export interface TransitionSpec {
  type: TransitionType;
  duration: number;
}

export type TransitionType = 
  | 'fade'
  | 'slide-left' | 'slide-right' | 'slide-up' | 'slide-down'
  | 'wipe-left' | 'wipe-right'
  | 'zoom-in' | 'zoom-out'
  | 'circular-wipe'
  | 'radial'
  | 'glitch'
  | 'shake'
  | 'bounce'
  | 'film-roll';

export interface AudioSpec {
  voiceover?: {
    url: string;
    volume: number;
  };
  music?: {
    url: string;
    volume: number;
    start_time?: number;
    fade_in?: number;
    fade_out?: number;
  };
  sfx?: SfxSpec[];
}

export interface SfxSpec {
  url: string;
  time: number;
  volume: number;
}

export interface SubtitleSpec {
  style: SubtitleStyle;
  settings: SubtitleSettings;
  chunks: SubtitleChunk[];
}

export type SubtitleStyle = 
  | 'static' | 'pop' | 'elastic' | 'slide-up' | 'slide-down'
  | 'fly-in' | 'reveal' | 'bounce' | 'highlight' | 'karaoke'
  | 'typewriter' | 'wave' | 'zoom' | 'glow' | 'punch'
  | 'smash' | 'crash' | 'float' | 'drift' | 'morph'
  | 'spark' | 'pulse-grow' | 'ripple' | 'cinematic' | 'spotlight';

export interface SubtitleSettings {
  fontSize: number;
  fontFamily: string;
  fontWeight?: number;
  textColor: string;
  strokeEnabled: boolean;
  strokeColor: string;
  strokeWidth: number;
  shadowEnabled?: boolean;
  shadowColor?: string;
  shadowDistance?: number;
  shadowBlur?: number;
  shadowOpacity?: number;
  glowEnabled?: boolean;
  glowColor?: string;
  glowBlur?: number;
  visualModeEnabled?: boolean;
  creativeModeEnabled?: boolean;
}

export interface SubtitleChunk {
  text: string;
  start: number;
  end: number;
  keywords?: number[];
  words?: WordTiming[];
}

export interface WordTiming {
  text: string;
  start: number;
  end: number;
}

export interface EndScreenSpec {
  enabled: boolean;
  start: number;
  duration: number;
  blur: boolean;
  logo?: string;
  logoScale?: number;
  ipText?: string;
  ipSettings?: SubtitleSettings;
  creativeMode?: boolean;
}

// Worker configuration
export interface WorkerConfig {
  workerId: string;
  pollIntervalMs: number;
  maxConcurrentJobs: number;
  tempDir: string;
  ffmpegPath: string;
  ffprobePath: string;
  useNvenc: boolean;
}

// Result types
export interface RenderResult {
  success: boolean;
  outputPath?: string;
  thumbnailPath?: string;
  error?: string;
  duration?: number;
}
TYPES_EOF

echo "[2/9] Creating src/config.ts..."
cat > src/config.ts << 'CONFIG_EOF'
import type { WorkerConfig } from './types.js';

export function loadConfig(): WorkerConfig {
  const workerId = process.env.WORKER_ID || `worker-${Date.now()}`;
  const pollIntervalMs = parseInt(process.env.POLL_INTERVAL_MS || '5000', 10);
  const maxConcurrentJobs = parseInt(process.env.MAX_CONCURRENT_JOBS || '2', 10);
  const tempDir = process.env.TEMP_DIR || '/tmp/mineedit-renders';
  const ffmpegPath = process.env.FFMPEG_PATH || 'ffmpeg';
  const ffprobePath = process.env.FFPROBE_PATH || 'ffprobe';
  const useNvenc = process.env.USE_NVENC !== 'false';

  return {
    workerId,
    pollIntervalMs,
    maxConcurrentJobs,
    tempDir,
    ffmpegPath,
    ffprobePath,
    useNvenc,
  };
}

export function validateEnv(): void {
  const required = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];
  const missing = required.filter((key) => !process.env[key]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}
CONFIG_EOF

echo "[3/9] Creating src/supabase.ts..."
cat > src/supabase.ts << 'SUPABASE_EOF'
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { RenderJob } from './types.js';

let supabaseClient: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!supabaseClient) {
    const url = process.env.SUPABASE_URL!;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    supabaseClient = createClient(url, key);
  }
  return supabaseClient;
}

export async function claimJob(workerId: string): Promise<RenderJob | null> {
  const supabase = getSupabase();
  
  const { data, error } = await supabase
    .rpc('claim_render_job', { p_worker_id: workerId });
  
  if (error) {
    console.error('[Supabase] Error claiming job:', error.message);
    return null;
  }
  
  if (!data || data.length === 0) {
    return null;
  }
  
  return data[0] as RenderJob;
}

export async function updateJobStatus(
  jobId: string,
  status: 'processing' | 'completed' | 'failed',
  updates: {
    output_url?: string;
    thumbnail_url?: string;
    error_message?: string;
  } = {}
): Promise<void> {
  const supabase = getSupabase();
  
  const updateData: Record<string, unknown> = {
    status,
    updated_at: new Date().toISOString(),
    ...updates,
  };
  
  if (status === 'completed' || status === 'failed') {
    updateData.completed_at = new Date().toISOString();
  }
  
  const { error } = await supabase
    .from('render_queue')
    .update(updateData)
    .eq('id', jobId);
  
  if (error) {
    console.error('[Supabase] Error updating job:', error.message);
    throw error;
  }
}

export async function downloadFile(url: string, destPath: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download ${url}: ${response.statusText}`);
  }
  
  const fs = await import('fs');
  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(destPath, buffer);
}

export async function uploadFile(
  bucket: string,
  path: string,
  filePath: string
): Promise<string> {
  const supabase = getSupabase();
  const fs = await import('fs');
  
  const fileBuffer = fs.readFileSync(filePath);
  
  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, fileBuffer, {
      contentType: path.endsWith('.mp4') ? 'video/mp4' : 'image/jpeg',
      upsert: true,
    });
  
  if (error) {
    throw new Error(`Upload failed: ${error.message}`);
  }
  
  const { data: urlData } = supabase.storage
    .from(bucket)
    .getPublicUrl(path);
  
  return urlData.publicUrl;
}

export async function updateProjectStatus(
  projectId: string,
  status: string,
  outputUrl?: string,
  error?: string
): Promise<void> {
  const supabase = getSupabase();
  
  const updateData: Record<string, unknown> = {
    status,
    updated_at: new Date().toISOString(),
  };
  
  if (outputUrl) {
    updateData.output_url = outputUrl;
  }
  
  if (error) {
    updateData.last_error = error;
  }
  
  await supabase
    .from('projects')
    .update(updateData)
    .eq('id', projectId);
}
SUPABASE_EOF

echo "[4/9] Creating src/ffmpeg/transitions.ts..."
cat > src/ffmpeg/transitions.ts << 'TRANSITIONS_EOF'
import type { ClipSpec, TransitionType } from '../types.js';

export interface TransitionOffset {
  clipIndex: number;
  offset: number;
  duration: number;
  type: TransitionType;
}

export function calculateTransitionOffsets(clips: ClipSpec[]): TransitionOffset[] {
  const offsets: TransitionOffset[] = [];
  
  for (let i = 1; i < clips.length; i++) {
    const clip = clips[i];
    if (clip.transition && clip.transition.duration > 0) {
      offsets.push({
        clipIndex: i,
        offset: clip.transition.duration,
        duration: clip.transition.duration,
        type: clip.transition.type,
      });
    }
  }
  
  return offsets;
}

export function getXfadeTransition(type: TransitionType): string {
  const transitionMap: Record<TransitionType, string> = {
    'fade': 'fade',
    'slide-left': 'slideleft',
    'slide-right': 'slideright',
    'slide-up': 'slideup',
    'slide-down': 'slidedown',
    'wipe-left': 'wipeleft',
    'wipe-right': 'wiperight',
    'zoom-in': 'zoomin',
    'zoom-out': 'fadefast',
    'circular-wipe': 'circleopen',
    'radial': 'radial',
    'glitch': 'pixelize',
    'shake': 'dissolve',
    'bounce': 'squeezev',
    'film-roll': 'vertopen',
  };
  
  return transitionMap[type] || 'fade';
}

export function buildClipFilterChain(
  clips: ClipSpec[],
  outputWidth: number,
  outputHeight: number
): { filterComplex: string; lastLabel: string } {
  if (clips.length === 0) {
    return { filterComplex: '', lastLabel: '' };
  }
  
  const filters: string[] = [];
  const fps = 30;
  
  // Scale and pad each clip
  for (let i = 0; i < clips.length; i++) {
    filters.push(
      `[${i}:v]fps=${fps},scale=${outputWidth}:${outputHeight}:force_original_aspect_ratio=decrease,` +
      `pad=${outputWidth}:${outputHeight}:(ow-iw)/2:(oh-ih)/2:black,setsar=1[v${i}]`
    );
  }
  
  if (clips.length === 1) {
    return { filterComplex: filters.join(';'), lastLabel: 'v0' };
  }
  
  // Build xfade chain
  let currentLabel = 'v0';
  let currentOffset = clips[0].duration;
  
  for (let i = 1; i < clips.length; i++) {
    const clip = clips[i];
    const transition = clip.transition;
    const transitionDuration = transition?.duration || 0.5;
    const transitionType = transition?.type || 'fade';
    
    const xfadeOffset = Math.max(0, currentOffset - transitionDuration);
    const nextLabel = i === clips.length - 1 ? 'vout' : `vt${i}`;
    
    filters.push(
      `[${currentLabel}][v${i}]xfade=transition=${getXfadeTransition(transitionType)}:` +
      `duration=${transitionDuration}:offset=${xfadeOffset.toFixed(3)}[${nextLabel}]`
    );
    
    currentLabel = nextLabel;
    currentOffset = xfadeOffset + clip.duration;
  }
  
  return { filterComplex: filters.join(';'), lastLabel: currentLabel };
}
TRANSITIONS_EOF

echo "[5/9] Creating src/ffmpeg/audio.ts..."
cat > src/ffmpeg/audio.ts << 'AUDIO_EOF'
import type { AudioSpec, ClipSpec } from '../types.js';

export interface AudioInputIndices {
  voiceoverIndex?: number;
  musicIndex?: number;
  sfxStartIndex?: number;
}

export function calculateAudioInputIndices(
  clipCount: number,
  audio: AudioSpec
): AudioInputIndices {
  let nextIndex = clipCount;
  const indices: AudioInputIndices = {};
  
  if (audio.voiceover?.url) {
    indices.voiceoverIndex = nextIndex++;
  }
  
  if (audio.music?.url) {
    indices.musicIndex = nextIndex++;
  }
  
  if (audio.sfx && audio.sfx.length > 0) {
    indices.sfxStartIndex = nextIndex;
  }
  
  return indices;
}

export function buildAudioFilterChain(
  clips: ClipSpec[],
  audio: AudioSpec,
  indices: AudioInputIndices,
  totalDuration: number
): { filterComplex: string; audioLabel: string } {
  const filters: string[] = [];
  const audioInputs: string[] = [];
  
  // Mix clip audio tracks
  for (let i = 0; i < clips.length; i++) {
    filters.push(`[${i}:a]aresample=44100,aformat=sample_fmts=fltp[a${i}]`);
    audioInputs.push(`[a${i}]`);
  }
  
  // Concat clip audio
  if (clips.length > 1) {
    filters.push(`${audioInputs.join('')}concat=n=${clips.length}:v=0:a=1[aclips]`);
  } else {
    filters.push(`[a0]anull[aclips]`);
  }
  
  let currentAudioLabel = 'aclips';
  const mixInputs: string[] = [`[${currentAudioLabel}]`];
  
  // Voiceover
  if (indices.voiceoverIndex !== undefined && audio.voiceover) {
    const vol = audio.voiceover.volume || 1;
    filters.push(`[${indices.voiceoverIndex}:a]volume=${vol}[avoice]`);
    mixInputs.push('[avoice]');
  }
  
  // Music with fade
  if (indices.musicIndex !== undefined && audio.music) {
    const vol = audio.music.volume || 0.3;
    const fadeIn = audio.music.fade_in || 0;
    const fadeOut = audio.music.fade_out || 0;
    
    let musicFilter = `[${indices.musicIndex}:a]volume=${vol}`;
    
    if (fadeIn > 0) {
      musicFilter += `,afade=t=in:st=0:d=${fadeIn}`;
    }
    
    if (fadeOut > 0 && totalDuration > fadeOut) {
      musicFilter += `,afade=t=out:st=${totalDuration - fadeOut}:d=${fadeOut}`;
    }
    
    filters.push(`${musicFilter}[amusic]`);
    mixInputs.push('[amusic]');
  }
  
  // SFX
  if (indices.sfxStartIndex !== undefined && audio.sfx) {
    audio.sfx.forEach((sfx, i) => {
      const idx = indices.sfxStartIndex! + i;
      const vol = sfx.volume || 1;
      filters.push(`[${idx}:a]volume=${vol},adelay=${Math.round(sfx.time * 1000)}|${Math.round(sfx.time * 1000)}[asfx${i}]`);
      mixInputs.push(`[asfx${i}]`);
    });
  }
  
  // Final mix
  if (mixInputs.length > 1) {
    filters.push(`${mixInputs.join('')}amix=inputs=${mixInputs.length}:duration=first:dropout_transition=0[afinal]`);
    return { filterComplex: filters.join(';'), audioLabel: 'afinal' };
  }
  
  return { filterComplex: filters.join(';'), audioLabel: 'aclips' };
}
AUDIO_EOF

echo "[6/9] Creating src/ffmpeg/subtitles.ts..."
cat > src/ffmpeg/subtitles.ts << 'SUBTITLES_EOF'
import type { SubtitleSpec, SubtitleChunk, SubtitleSettings, SubtitleStyle } from '../types.js';

function hexToASSColor(hex: string): string {
  // Convert #RRGGBB to &HBBGGRR& (ASS format)
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return '&HFFFFFF&';
  
  const r = clean.substring(0, 2);
  const g = clean.substring(2, 4);
  const b = clean.substring(4, 6);
  
  return `&H${b}${g}${r}&`;
}

function formatASSTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const cs = Math.floor((seconds * 100) % 100);
  
  return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${cs.toString().padStart(2, '0')}`;
}

function getStyleAnimations(style: SubtitleStyle): { 
  effect: string; 
  transform?: string;
  fadeIn?: number;
  fadeOut?: number;
} {
  const animations: Record<SubtitleStyle, { effect: string; transform?: string; fadeIn?: number; fadeOut?: number }> = {
    'static': { effect: '' },
    'pop': { effect: '', transform: '\\fscx0\\fscy0', fadeIn: 100 },
    'elastic': { effect: '', transform: '\\fscx120\\fscy80', fadeIn: 150 },
    'slide-up': { effect: '', transform: '\\move(640,800,640,540)', fadeIn: 200 },
    'slide-down': { effect: '', transform: '\\move(640,280,640,540)', fadeIn: 200 },
    'fly-in': { effect: '', transform: '\\move(-200,540,640,540)', fadeIn: 300 },
    'reveal': { effect: '', fadeIn: 400 },
    'bounce': { effect: '', transform: '\\move(640,400,640,540)', fadeIn: 200 },
    'highlight': { effect: '' },
    'karaoke': { effect: '' },
    'typewriter': { effect: '', fadeIn: 50 },
    'wave': { effect: '' },
    'zoom': { effect: '', transform: '\\fscx200\\fscy200', fadeIn: 200 },
    'glow': { effect: '' },
    'punch': { effect: '', transform: '\\fscx150\\fscy150', fadeIn: 80 },
    'smash': { effect: '', transform: '\\fscx300\\fscy300', fadeIn: 100 },
    'crash': { effect: '', transform: '\\frz-15', fadeIn: 150 },
    'float': { effect: '', transform: '\\move(640,560,640,520)', fadeIn: 500 },
    'drift': { effect: '', transform: '\\move(600,540,680,540)', fadeIn: 400 },
    'morph': { effect: '', fadeIn: 300 },
    'spark': { effect: '' },
    'pulse-grow': { effect: '', transform: '\\fscx90\\fscy90', fadeIn: 200 },
    'ripple': { effect: '', fadeIn: 150 },
    'cinematic': { effect: '', fadeIn: 500, fadeOut: 500 },
    'spotlight': { effect: '' },
  };
  
  return animations[style] || { effect: '' };
}

export function generateASSSubtitles(
  subtitles: SubtitleSpec,
  outputWidth: number,
  outputHeight: number
): string {
  const { style, settings, chunks } = subtitles;
  
  const primaryColor = hexToASSColor(settings.textColor);
  const outlineColor = settings.strokeEnabled ? hexToASSColor(settings.strokeColor) : '&H000000&';
  const shadowColor = settings.shadowEnabled ? hexToASSColor(settings.shadowColor || '#000000') : '&H000000&';
  
  const fontSize = Math.round(settings.fontSize * (outputHeight / 1080));
  const outlineWidth = settings.strokeEnabled ? settings.strokeWidth : 0;
  const shadowDepth = settings.shadowEnabled ? (settings.shadowDistance || 2) : 0;
  
  const fontName = settings.fontFamily || 'Montserrat';
  const fontWeight = settings.fontWeight || 800;
  const bold = fontWeight >= 700 ? -1 : 0;
  
  let ass = `[Script Info]
Title: MineEdit Subtitles
ScriptType: v4.00+
PlayResX: ${outputWidth}
PlayResY: ${outputHeight}
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${fontName},${fontSize},${primaryColor},${primaryColor},${outlineColor},${shadowColor},${bold},0,0,0,100,100,0,0,1,${outlineWidth},${shadowDepth},2,10,10,50,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  const styleAnim = getStyleAnimations(style);
  
  for (const chunk of chunks) {
    const startTime = formatASSTime(chunk.start);
    const endTime = formatASSTime(chunk.end);
    
    let text = chunk.text;
    
    // Apply animation tags
    if (styleAnim.transform || styleAnim.fadeIn) {
      let tags = '';
      if (styleAnim.fadeIn) {
        tags += `\\fad(${styleAnim.fadeIn},${styleAnim.fadeOut || 0})`;
      }
      if (styleAnim.transform) {
        tags += styleAnim.transform;
      }
      text = `{${tags}}${text}`;
    }
    
    ass += `Dialogue: 0,${startTime},${endTime},Default,,0,0,0,,${text}\n`;
  }
  
  return ass;
}

export function generateGlowLayer(
  subtitles: SubtitleSpec,
  outputWidth: number,
  outputHeight: number
): string | null {
  if (!subtitles.settings.glowEnabled) {
    return null;
  }
  
  const glowColor = hexToASSColor(subtitles.settings.glowColor || '#FFFFFF');
  const glowBlur = subtitles.settings.glowBlur || 10;
  const fontSize = Math.round(subtitles.settings.fontSize * (outputHeight / 1080));
  const fontName = subtitles.settings.fontFamily || 'Montserrat';
  
  let ass = `[Script Info]
Title: MineEdit Glow Layer
ScriptType: v4.00+
PlayResX: ${outputWidth}
PlayResY: ${outputHeight}

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Glow,${fontName},${fontSize},${glowColor},${glowColor},${glowColor},${glowColor},-1,0,0,0,100,100,0,0,1,${glowBlur},0,2,10,10,50,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  for (const chunk of subtitles.chunks) {
    const startTime = formatASSTime(chunk.start);
    const endTime = formatASSTime(chunk.end);
    const text = chunk.text;
    
    ass += `Dialogue: 0,${startTime},${endTime},Glow,,0,0,0,,${text}\n`;
  }
  
  return ass;
}
SUBTITLES_EOF

echo "[7/9] Creating src/ffmpeg/renderer.ts..."
cat > src/ffmpeg/renderer.ts << 'RENDERER_EOF'
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import type { RenderSpec, RenderResult, WorkerConfig, ClipSpec, AudioSpec } from '../types.js';
import { downloadFile, uploadFile } from '../supabase.js';
import { buildClipFilterChain } from './transitions.js';
import { buildAudioFilterChain, calculateAudioInputIndices } from './audio.js';
import { generateASSSubtitles, generateGlowLayer } from './subtitles.js';

export class FFmpegRenderer {
  private config: WorkerConfig;
  
  constructor(config: WorkerConfig) {
    this.config = config;
  }
  
  async render(jobId: string, spec: RenderSpec): Promise<RenderResult> {
    const workDir = path.join(this.config.tempDir, jobId);
    
    try {
      // Create work directory
      fs.mkdirSync(workDir, { recursive: true });
      
      console.log(`[Renderer] Starting render for job ${jobId}`);
      console.log(`[Renderer] Clips: ${spec.clips.length}, Subtitles: ${spec.subtitles.chunks.length}`);
      
      // Download all assets
      const clipPaths = await this.downloadClips(spec.clips, workDir);
      const audioPaths = await this.downloadAudio(spec.audio, workDir);
      
      // Generate subtitle files
      const subtitlePath = path.join(workDir, 'subtitles.ass');
      const assContent = generateASSSubtitles(spec.subtitles, spec.output.width, spec.output.height);
      fs.writeFileSync(subtitlePath, assContent);
      
      // Generate glow layer if enabled
      let glowPath: string | undefined;
      const glowContent = generateGlowLayer(spec.subtitles, spec.output.width, spec.output.height);
      if (glowContent) {
        glowPath = path.join(workDir, 'glow.ass');
        fs.writeFileSync(glowPath, glowContent);
      }
      
      // Build FFmpeg command
      const outputPath = path.join(workDir, 'output.mp4');
      const thumbnailPath = path.join(workDir, 'thumbnail.jpg');
      
      await this.runFFmpeg(
        clipPaths,
        audioPaths,
        subtitlePath,
        glowPath,
        outputPath,
        spec
      );
      
      // Generate thumbnail
      await this.generateThumbnail(outputPath, thumbnailPath);
      
      // Upload results
      const outputUrl = await uploadFile(
        'exports',
        `${spec.project_id}/${jobId}.mp4`,
        outputPath
      );
      
      const thumbnailUrl = await uploadFile(
        'exports',
        `${spec.project_id}/${jobId}_thumb.jpg`,
        thumbnailPath
      );
      
      // Get duration
      const duration = await this.getVideoDuration(outputPath);
      
      console.log(`[Renderer] Render complete: ${outputUrl}`);
      
      return {
        success: true,
        outputPath: outputUrl,
        thumbnailPath: thumbnailUrl,
        duration,
      };
      
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[Renderer] Render failed:`, message);
      return {
        success: false,
        error: message,
      };
    } finally {
      // Cleanup
      try {
        fs.rmSync(workDir, { recursive: true, force: true });
      } catch {
        console.warn(`[Renderer] Failed to cleanup ${workDir}`);
      }
    }
  }
  
  private async downloadClips(clips: ClipSpec[], workDir: string): Promise<string[]> {
    const paths: string[] = [];
    
    for (let i = 0; i < clips.length; i++) {
      const clipPath = path.join(workDir, `clip_${i}.mp4`);
      console.log(`[Renderer] Downloading clip ${i + 1}/${clips.length}`);
      await downloadFile(clips[i].url, clipPath);
      paths.push(clipPath);
    }
    
    return paths;
  }
  
  private async downloadAudio(
    audio: AudioSpec,
    workDir: string
  ): Promise<{ voiceover?: string; music?: string; sfx: string[] }> {
    const result: { voiceover?: string; music?: string; sfx: string[] } = { sfx: [] };
    
    if (audio.voiceover?.url) {
      result.voiceover = path.join(workDir, 'voiceover.mp3');
      await downloadFile(audio.voiceover.url, result.voiceover);
    }
    
    if (audio.music?.url) {
      result.music = path.join(workDir, 'music.mp3');
      await downloadFile(audio.music.url, result.music);
    }
    
    if (audio.sfx) {
      for (let i = 0; i < audio.sfx.length; i++) {
        const sfxPath = path.join(workDir, `sfx_${i}.mp3`);
        await downloadFile(audio.sfx[i].url, sfxPath);
        result.sfx.push(sfxPath);
      }
    }
    
    return result;
  }
  
  private async runFFmpeg(
    clipPaths: string[],
    audioPaths: { voiceover?: string; music?: string; sfx: string[] },
    subtitlePath: string,
    glowPath: string | undefined,
    outputPath: string,
    spec: RenderSpec
  ): Promise<void> {
    const args: string[] = ['-y'];
    
    // Input files
    for (const clipPath of clipPaths) {
      args.push('-i', clipPath);
    }
    
    if (audioPaths.voiceover) {
      args.push('-i', audioPaths.voiceover);
    }
    
    if (audioPaths.music) {
      args.push('-i', audioPaths.music);
    }
    
    for (const sfxPath of audioPaths.sfx) {
      args.push('-i', sfxPath);
    }
    
    // Build filter complex
    const { filterComplex: videoFilter, lastLabel: videoLabel } = buildClipFilterChain(
      spec.clips,
      spec.output.width,
      spec.output.height
    );
    
    const audioIndices = calculateAudioInputIndices(clipPaths.length, spec.audio);
    const totalDuration = spec.clips.reduce((sum, c) => sum + c.duration, 0);
    
    const { filterComplex: audioFilter, audioLabel } = buildAudioFilterChain(
      spec.clips,
      spec.audio,
      audioIndices,
      totalDuration
    );
    
    // Combine filters with subtitle overlay
    let fullFilter = videoFilter;
    
    // Add subtitle filter
    const escapedSubPath = subtitlePath.replace(/\\/g, '/').replace(/:/g, '\\:');
    
    if (glowPath) {
      const escapedGlowPath = glowPath.replace(/\\/g, '/').replace(/:/g, '\\:');
      fullFilter += `;[${videoLabel}]ass='${escapedGlowPath}',boxblur=3:1[vglow];[vglow]ass='${escapedSubPath}'[vfinal]`;
    } else {
      fullFilter += `;[${videoLabel}]ass='${escapedSubPath}'[vfinal]`;
    }
    
    fullFilter += `;${audioFilter}`;
    
    args.push('-filter_complex', fullFilter);
    args.push('-map', '[vfinal]');
    args.push('-map', `[${audioLabel}]`);
    
    // Encoding settings
    const encoder = this.config.useNvenc ? 'h264_nvenc' : 'libx264';
    args.push('-c:v', encoder);
    
    if (this.config.useNvenc) {
      args.push('-preset', 'p4');
      args.push('-rc', 'vbr');
      args.push('-cq', '23');
    } else {
      args.push('-preset', 'faster');
      args.push('-crf', '23');
    }
    
    args.push('-c:a', 'aac');
    args.push('-b:a', '192k');
    args.push('-ar', '44100');
    args.push('-movflags', '+faststart');
    args.push(outputPath);
    
    console.log(`[FFmpeg] Running: ${this.config.ffmpegPath} ${args.slice(0, 20).join(' ')}...`);
    
    return new Promise((resolve, reject) => {
      const ffmpeg = spawn(this.config.ffmpegPath, args);
      
      let stderr = '';
      
      ffmpeg.stderr.on('data', (data) => {
        stderr += data.toString();
        // Log progress
        const match = data.toString().match(/time=(\d+:\d+:\d+\.\d+)/);
        if (match) {
          console.log(`[FFmpeg] Progress: ${match[1]}`);
        }
      });
      
      ffmpeg.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          const lastLines = stderr.split('\n').slice(-10).join('\n');
          reject(new Error(`FFmpeg exited with code ${code}: ${lastLines}`));
        }
      });
      
      ffmpeg.on('error', (err) => {
        reject(new Error(`FFmpeg failed to start: ${err.message}`));
      });
    });
  }
  
  private async generateThumbnail(videoPath: string, thumbnailPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const args = [
        '-i', videoPath,
        '-ss', '00:00:01',
        '-vframes', '1',
        '-q:v', '2',
        '-y',
        thumbnailPath,
      ];
      
      const ffmpeg = spawn(this.config.ffmpegPath, args);
      
      ffmpeg.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Thumbnail generation failed with code ${code}`));
        }
      });
      
      ffmpeg.on('error', reject);
    });
  }
  
  private async getVideoDuration(videoPath: string): Promise<number> {
    return new Promise((resolve, reject) => {
      const args = [
        '-v', 'error',
        '-show_entries', 'format=duration',
        '-of', 'default=noprint_wrappers=1:nokey=1',
        videoPath,
      ];
      
      const ffprobe = spawn(this.config.ffprobePath, args);
      let stdout = '';
      
      ffprobe.stdout.on('data', (data) => {
        stdout += data.toString();
      });
      
      ffprobe.on('close', (code) => {
        if (code === 0) {
          resolve(parseFloat(stdout.trim()) || 0);
        } else {
          resolve(0);
        }
      });
      
      ffprobe.on('error', () => resolve(0));
    });
  }
}
RENDERER_EOF

echo "[8/9] Creating src/ffmpeg/index.ts..."
cat > src/ffmpeg/index.ts << 'FFMPEGINDEX_EOF'
export { FFmpegRenderer } from './renderer.js';
export { buildClipFilterChain, calculateTransitionOffsets, getXfadeTransition } from './transitions.js';
export { buildAudioFilterChain, calculateAudioInputIndices } from './audio.js';
export { generateASSSubtitles, generateGlowLayer } from './subtitles.js';
FFMPEGINDEX_EOF

echo "[9/9] Creating src/index.ts..."
cat > src/index.ts << 'INDEX_EOF'
import { loadConfig, validateEnv } from './config.js';
import { claimJob, updateJobStatus, updateProjectStatus } from './supabase.js';
import { FFmpegRenderer } from './ffmpeg/index.js';
import type { RenderJob, RenderSpec } from './types.js';

async function processJob(renderer: FFmpegRenderer, job: RenderJob): Promise<void> {
  console.log(`[Worker] Processing job ${job.id} for project ${job.project_id}`);
  
  try {
    // Update project status
    await updateProjectStatus(job.project_id, 'rendering');
    
    // Render the video
    const result = await renderer.render(job.id, job.spec as RenderSpec);
    
    if (result.success) {
      await updateJobStatus(job.id, 'completed', {
        output_url: result.outputPath,
        thumbnail_url: result.thumbnailPath,
      });
      
      await updateProjectStatus(job.project_id, 'rendered', result.outputPath);
      
      console.log(`[Worker] Job ${job.id} completed successfully`);
    } else {
      throw new Error(result.error || 'Render failed');
    }
    
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[Worker] Job ${job.id} failed:`, message);
    
    await updateJobStatus(job.id, 'failed', {
      error_message: message,
    });
    
    await updateProjectStatus(job.project_id, 'failed', undefined, message);
  }
}

async function main(): Promise<void> {
  console.log('======================================');
  console.log('MineEdit GPU Worker');
  console.log('======================================');
  
  // Validate environment
  validateEnv();
  
  // Load configuration
  const config = loadConfig();
  console.log(`Worker ID: ${config.workerId}`);
  console.log(`Poll Interval: ${config.pollIntervalMs}ms`);
  console.log(`Max Concurrent: ${config.maxConcurrentJobs}`);
  console.log(`NVENC: ${config.useNvenc ? 'enabled' : 'disabled'}`);
  console.log('--------------------------------------');
  
  // Create renderer
  const renderer = new FFmpegRenderer(config);
  
  // Track active jobs
  let activeJobs = 0;
  
  // Main polling loop
  console.log('[Worker] Starting job polling...');
  
  const poll = async () => {
    try {
      if (activeJobs >= config.maxConcurrentJobs) {
        return;
      }
      
      const job = await claimJob(config.workerId);
      
      if (job) {
        activeJobs++;
        console.log(`[Worker] Claimed job ${job.id} (active: ${activeJobs}/${config.maxConcurrentJobs})`);
        
        // Process job in background
        processJob(renderer, job)
          .finally(() => {
            activeJobs--;
          });
      }
    } catch (error) {
      console.error('[Worker] Poll error:', error);
    }
  };
  
  // Start polling
  setInterval(poll, config.pollIntervalMs);
  poll(); // Initial poll
  
  // Handle shutdown
  process.on('SIGINT', () => {
    console.log('\n[Worker] Shutting down...');
    process.exit(0);
  });
  
  process.on('SIGTERM', () => {
    console.log('\n[Worker] Shutting down...');
    process.exit(0);
  });
}

main().catch((error) => {
  console.error('[Worker] Fatal error:', error);
  process.exit(1);
});
INDEX_EOF

echo ""
echo "========================================"
echo "All files created successfully!"
echo "========================================"
echo ""
echo "Next steps:"
echo "1. npm install"
echo "2. cp .env.example .env"
echo "3. nano .env  (add your SUPABASE_SERVICE_ROLE_KEY)"
echo "4. npm run build"
echo "5. npm start (or use pm2)"
