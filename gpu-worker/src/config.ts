import type { WorkerConfig } from './types.js';

export function loadConfig(): WorkerConfig {
  const workerId = process.env.WORKER_ID || `worker-${Date.now()}`;
  const pollIntervalMs = parseInt(process.env.POLL_INTERVAL_MS || '5000', 10);
  const maxConcurrentJobs = parseInt(process.env.MAX_CONCURRENT_JOBS || '6', 10);
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
  // Only SUPABASE_URL is required now - no service role key needed!
  const required = ['SUPABASE_URL'];
  const missing = required.filter((key) => !process.env[key]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}
