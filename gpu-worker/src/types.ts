
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

export interface SilencePeriod {
  start: number;
  end: number;
  duration: number;
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
  beginningEffect?: BeginningEffectSpec;
  transitionEffect?: TransitionEffectSpec;
  ipPopup?: IpPopupSpec;
  serverLogoPopups?: ServerLogoPopupSpec[];
  colorimetry?: ColorimetrySpec;
  intelligent_selection?: boolean;
  effects?: GlobalEffectsSpec;
  commentOverlay?: CommentOverlaySpec;
}


export interface ColorimetrySpec {
  brightness: number;
  contrast: number;
  saturation: number;
  preset?: 'none' | 'bright' | 'saturated' | 'ultra_saturated' | 'dark';
}

export interface ServerLogoPopupSpec {
  start: number;
  duration: number;
  url: string;
}

export interface GlobalEffectsSpec {
  flash_enabled: boolean;
  flash_color: string;
  flash_rainbow: boolean;
}

export interface CommentOverlaySpec {
  enabled: boolean;
  name: string;
  avatar_url?: string;
  content: string;
  start_time: number;
  duration: number;
}

export interface IpPopupSpec {
  enabled: boolean;
  start: number;
  duration: number;
  sfx?: string;
  text?: IpPopupTextSpec;
  image1?: IpPopupImageSpec;
  image2?: IpPopupImageSpec;
}

export interface IpPopupTextSpec {
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

export interface IpPopupImageSpec {
  enabled: boolean;
  url?: string;
  x: number;
  y: number;
  scale: number;
  opacity?: number;
  z_index: number;
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
  zoom?: ZoomSpec; // NEW
}

export interface ZoomSpec {
  start: number; // e.g. 1.0
  end: number;   // e.g. 1.15
  ease: 'linear' | 'cubic_out' | 'cubic_in' | 'sine_in_out' | 'back_out' | 'exponential' | 'expo_out' | 'intense_start' | 'basic'; // basic = last second accelerating
  duration?: number; // duration of the zoom in seconds
}

export interface TransitionSpec {
  type: TransitionType | 'suit';
  duration: number;
  color?: string;
  suit?: TransitionType[];
}

export type TransitionType =
  | 'none'
  | 'whip-pan'
  | 'zoom-punch'
  | 'glitch-grid'
  | 'luma-wipe'
  | 'radial-blur'
  | 'wipe-left'
  | 'wipe-right'
  | 'camera-lens'
  | 'swipe-up'
  | 'swipe-down'
  | 'flash'
  | 'lens-flare'
  | 'pixel-glitch'
  | 'circle-crop'
  | 'radial-zoom'
  | 'swoosh'
  | 'woosh'
  | 'suit';

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
  music2?: {
    url: string;
    volume: number;
    start_time?: number;
    crossfade_at?: number; // point in the video where we transition to music2
    ai_optimized?: boolean;
  };
  sfx?: SfxSpec[];
  beginningSfx?: string;
  removeSilence?: boolean; // NEW: Automatically remove silence gaps in VO
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

export interface Keyframe {
  time: number; // relative seconds
  value: number | string;
  interpolation: 'linear' | 'hold' | 'bezier';
}

export interface CustomAnimationTrack {
  property: 'scale' | 'rotation' | 'opacity' | 'position' | 'x' | 'y';
  keyframes: Keyframe[];
}

export type SubtitleStyle =
  | 'static' | 'pop' | 'elastic' | 'slide-up' | 'slide-down'
  | 'fly-in' | 'reveal' | 'bounce' | 'highlight' | 'karaoke'
  | 'typewriter' | 'wave' | 'zoom' | 'glow' | 'punch'
  | 'smash' | 'crash' | 'float' | 'drift' | 'morph'
  | 'spark' | 'pulse-grow' | 'ripple' | 'cinematic' | 'spotlight' | 'soft-pop'
  | 'slam' | 'glitch' | 'wobble' | 'flip' | 'blur-in' | 'drop'
  | 'spin-in' | 'scale-rotate' | 'stomp' | 'jitter' | 'swing'
  | 'flash' | 'rubberband' | 'heartbeat' | 'explode' | 'jump'
  | 'custom';

export interface SubtitleSettings {
  fontSize: number;
  fontFamily: string;
  customFontUrl?: string;
  customFontPath?: string;
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
  glowIntensity?: number;
  glowSize?: number;
  innerGlowEnabled?: boolean;
  innerGlowColor?: string;
  innerGlowIntensity?: number;
  innerGlowSize?: number;
  visualModeEnabled?: boolean;
  creativeModeEnabled?: boolean;
  selectedSfxId?: string | null;
  sfxVolume?: number;
  wordsPerLine?: number; // 0 = auto (original chunks), > 0 = force N words per chunk
  verticalPosition?: 'higher' | 'middle';
  transition?: string;
  transitionSuit?: string[]; // NEW
  keywordFontFamily?: string; // NEW: Specific font for keywords
  keywordFontUrl?: string; // NEW: URL for the specific keyword font
  flashColor?: string;
  logoRecognitionEnabled?: boolean;
  recognitionServerName?: string;
  customAnimation?: CustomAnimationTrack[];
  deadZones?: Array<{ start: number; end: number }>;
  serverLogoPopups?: ServerLogoPopupSpec[];
}

export interface SubtitleChunk {
  text: string;
  start: number;
  end: number;
  keywords?: number[];
  keywordColors?: Record<number, string>;
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
  layout?: 'horizontal' | 'vertical'; // NEW
  rainbowEnabled?: boolean; // NEW: Visual Mode for end screen
  logo?: string;
  logoScale?: number;
  ipText?: string;
  ipSettings?: SubtitleSettings;
  creativeMode?: boolean;
}

export interface BeginningEffectSpec {
  enabled: boolean;
  image?: string;
  sfx?: string;
}

export interface TransitionEffectSpec {
  enabled: boolean;
  image?: string;
  sfx?: string;
  index?: number;
  time?: number;
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
