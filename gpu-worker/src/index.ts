import 'dotenv/config';
import { readFile } from 'fs/promises';
import { spawn } from 'child_process';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import type { RenderJob, WorkerConfig } from './types.js';
import { loadConfig, validateEnv } from './config.js';
import {
  initApi,
  claimJob,
  completeJob,
  failJob,
  getProject,
  uploadToStorage,
  updateProgress,
  sendHeartbeat,
} from './api.js';
import { FFmpegRenderer } from './ffmpeg/index.js';

export const WORKER_VERSION = '1.3.0';

class RenderWorker {
  private config: WorkerConfig;
  private isShuttingDown = false;
  private activeJobs = 0;

  constructor() {
    validateEnv();
    this.config = loadConfig();
    initApi();

    console.log(`[Worker] Starting worker: ${this.config.workerId}`);
    console.log(`[Worker] Poll interval: ${this.config.pollIntervalMs}ms`);
    console.log(`[Worker] Max concurrent jobs: ${this.config.maxConcurrentJobs}`);
    console.log(`[Worker] Using NVENC: ${this.config.useNvenc}`);
  }

  async start(): Promise<void> {
    // Set up graceful shutdown
    process.on('SIGTERM', () => this.shutdown());
    process.on('SIGINT', () => this.shutdown());

    console.log('[Worker] Starting job polling loop...');

    while (!this.isShuttingDown) {
      try {
        await this.pollForJobs();
      } catch (error) {
        console.error('[Worker] Poll error:', error);
      }

      await this.sleep(this.config.pollIntervalMs);
    }

    // Wait for active jobs to complete
    while (this.activeJobs > 0) {
      console.log(`[Worker] Waiting for ${this.activeJobs} active jobs to complete...`);
      await this.sleep(1000);
    }

    console.log('[Worker] Shutdown complete');
  }

  private async pollForJobs(): Promise<void> {
    // Check if we can take more jobs
    if (this.activeJobs >= this.config.maxConcurrentJobs) {
      return;
    }

    // Try to claim a job via API (send version to prevent ghost workers)
    const job = await claimJob(this.config.workerId, WORKER_VERSION);

    if (!job) {
      return; // No jobs available
    }

    console.log(`[Worker] Claimed job: ${job.id} for project: ${job.project_id}`);

    // Process job in background (don't await)
    this.activeJobs++;
    this.processJob(job)
      .catch((error) => {
        console.error(`[Worker] Job ${job.id} unhandled error:`, error);
      })
      .finally(() => {
        this.activeJobs--;
      });
  }

  private async processJob(job: RenderJob): Promise<void> {
    const renderer = new FFmpegRenderer(this.config);

    // Start heartbeat timer to prevent job from being marked as stale
    const heartbeatTimer = setInterval(async () => {
      try {
        await sendHeartbeat(job.id, job.project_id);
      } catch (err) {
        // Non-critical
      }
    }, 30000); // Every 30 seconds

    try {
      // Render the video with real-time progress updates
      const result = await renderer.render(job.spec, async (progress) => {
        try {
          await updateProgress(job.project_id, progress);
        } catch (err) {
          // Non-critical, just log it
          console.warn(`[Worker] Failed to update progress for ${job.project_id}:`, err);
        }
      });

      if (!result.success || !result.outputPath) {
        throw new Error(result.error || 'Render failed with no output');
      }

      // Upload output to Storage via API
      console.log(`[Worker] Uploading output for job: ${job.id}`);
      const outputBuffer = await readFile(result.outputPath);
      const outputPath = `renders/${job.project_id}/${job.id}.mp4`;
      const outputUrl = await uploadToStorage('exports', outputPath, outputBuffer, 'video/mp4');

      // Upload thumbnail if available
      let thumbnailUrl: string | undefined;
      if (result.thumbnailPath) {
        const thumbBuffer = await readFile(result.thumbnailPath);
        const thumbPath = `renders/${job.project_id}/${job.id}_thumb.jpg`;
        thumbnailUrl = await uploadToStorage('exports', thumbPath, thumbBuffer, 'image/jpeg');
      }

      // Mark job as completed (also updates project status)
      await completeJob(job.id, outputUrl, thumbnailUrl, job.project_id);



      console.log(`[Worker] Job ${job.id} completed successfully`);

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[Worker] Job ${job.id} failed:`, message);

      // Mark job as failed via API (handles retries and project status internally)
      await failJob(job.id, message, job.project_id);
    } finally {
      clearInterval(heartbeatTimer);
      // Cleanup temp files
      await renderer.cleanup();
    }
  }

  private async triggerWebhooks(
    projectId: string,
    outputUrl: string,
    thumbnailUrl?: string
  ): Promise<void> {
    try {
      const project = await getProject(projectId);
      if (!project) return;

      // Discord webhook
      if (project.discord_webhook_url) {
        await this.sendDiscordNotification(
          project.discord_webhook_url,
          project.title || 'Untitled',
          outputUrl,
          thumbnailUrl
        );
      }

      // YouTube auto-upload
      if ((project.youtube_settings as any)?.enabled) {
        await this.triggerYouTubeUpload(projectId, outputUrl, project);
      }
    } catch (error) {
      console.error('[Worker] Webhook error:', error);
      // Don't throw - webhooks failing shouldn't fail the job
    }
  }

  private async sendDiscordNotification(
    webhookUrl: string,
    title: string,
    outputUrl: string,
    thumbnailUrl?: string
  ): Promise<void> {
    const payload: Record<string, unknown> = {
      content: `🎬 **Video Complete!**\n\n**${title}** has finished rendering.\n\n📥 **Download:** ${outputUrl}`,
    };

    if (thumbnailUrl) {
      payload.embeds = [{
        title: title,
        description: 'Click the link above to download your video.',
        color: 0x5865F2,
        thumbnail: { url: thumbnailUrl },
        timestamp: new Date().toISOString(),
      }];
    }

    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    console.log('[Worker] Discord notification sent');
  }

  private async triggerYouTubeUpload(
    projectId: string,
    videoUrl: string,
    project: { title?: string; description?: string | null }
  ): Promise<void> {
    const supabaseUrl = process.env.SUPABASE_URL!;

    const response = await fetch(`${supabaseUrl}/functions/v1/youtube-upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project_id: projectId,
        video_url: videoUrl,
        title: project.title,
        description: project.description,
      }),
    });

    if (response.ok) {
      console.log('[Worker] YouTube upload triggered');
    } else {
      console.error('[Worker] YouTube upload failed:', await response.text());
    }
  }

  private shutdown(): void {
    console.log('[Worker] Shutdown requested...');
    this.isShuttingDown = true;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// --- VIZION API INTEGRATION ---
const app = express();
app.use(cors());
app.use(express.json());

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const dir = path.join(process.cwd(), '../vizion/vizion_input');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    cb(null, dir);
  },
  filename: function (req, file, cb) {
    cb(null, file.originalname);
  }
});
const upload = multer({ storage: storage });

app.post('/api/vizion/upload', upload.array('videos'), (req, res) => {
  res.json({ success: true, message: 'Files uploaded successfully', count: req.files?.length || 0 });
});

app.post('/api/vizion/extract', (req, res) => {
  const vizionDir = path.join(process.cwd(), '../vizion');
  const pythonProcess = spawn('python', ['vizion_pipeline.py'], { cwd: vizionDir });

  let output = '';
  let errorOutput = '';

  pythonProcess.stdout.on('data', (data) => {
    const str = data.toString();
    output += str;
    console.log(`[Vizion] ${str.trim()}`);
  });

  pythonProcess.stderr.on('data', (data) => {
    const str = data.toString();
    errorOutput += str;
    console.error(`[Vizion err] ${str.trim()}`);
  });

  pythonProcess.on('close', (code) => {
    if (code !== 0) {
      return res.status(500).json({ success: false, error: `Process exited with code ${code}`, details: errorOutput });
    }

    try {
      const presetPath = path.join(vizionDir, 'MineCaption_Preset.json');
      if (fs.existsSync(presetPath)) {
        const presetData = JSON.parse(fs.readFileSync(presetPath, 'utf8'));
        res.json({ success: true, preset: presetData });
      } else {
        res.status(404).json({ success: false, error: 'Preset JSON not found after extraction.' });
      }
    } catch (e: any) {
      res.status(500).json({ success: false, error: 'Failed to read preset JSON', details: e.message });
    }
  });
});

app.listen(3001, () => {
  console.log('[Worker API] Vizion integration server running on port 3001');
});

// --- VIDEO INDEXING & SEARCH API ---
// This allows the Supabase Edge Function to request intelligent clip selection

app.post('/api/video-indexing/index', async (req, res) => {
  const { videoUrl, videoId, projectId } = req.body;
  const workerSecret = req.headers['x-worker-secret'];

  if (workerSecret !== process.env.GPU_WORKER_SECRET) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  const indexingDir = path.join(process.cwd(), '../video-indexing');
  const tempVideoPath = path.join(process.cwd(), `../video-indexing/temp_${videoId}.mp4`);

  try {
    // Download the video first
    const { downloadFile } = await import('./api.js');
    const buffer = await downloadFile(videoUrl);
    fs.writeFileSync(tempVideoPath, buffer);

    const pythonProcess = spawn('python', [
      'processor.py',
      '--video', tempVideoPath,
      '--video_id', videoId
    ], { cwd: indexingDir });

    let output = '';
    let errorOutput = '';

    pythonProcess.stdout.on('data', (data) => output += data.toString());
    pythonProcess.stderr.on('data', (data) => errorOutput += data.toString());

    pythonProcess.on('close', (code) => {
      // Clean up temp video
      if (fs.existsSync(tempVideoPath)) fs.unlinkSync(tempVideoPath);

      if (code !== 0) {
        return res.status(500).json({ success: false, error: `Indexing failed with code ${code}`, details: errorOutput });
      }
      res.json({ success: true, message: 'Video indexed successfully' });
    });
  } catch (err: any) {
    if (fs.existsSync(tempVideoPath)) fs.unlinkSync(tempVideoPath);
    res.status(500).json({ success: false, error: 'Internal server error', details: err.message });
  }
});

app.post('/api/video-indexing/search', async (req, res) => {
  const { query, projectId, limit = 1 } = req.body;
  const workerSecret = req.headers['x-worker-secret'];

  if (workerSecret !== process.env.GPU_WORKER_SECRET) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  const indexingDir = path.join(process.cwd(), '../video-indexing');
  
  // We don't filter by project_id in the current simple ChromaDB setup, 
  // but we could extend search.py to support it. 
  // For now, it searches the global index.

  const pythonProcess = spawn('python', [
    'search.py',
    '--query', query,
    '--limit', limit.toString(),
    '--json'
  ], { cwd: indexingDir });


  let output = '';
  let errorOutput = '';

  pythonProcess.stdout.on('data', (data) => output += data.toString());
  pythonProcess.stderr.on('data', (data) => errorOutput += data.toString());

  pythonProcess.on('close', (code) => {
    if (code !== 0) {
      return res.status(500).json({ success: false, error: `Search failed with code ${code}`, details: errorOutput });
    }

    // search.py outputs results in a predictable way. 
    // We should ideally make search.py output JSON for easier parsing.
    res.json({ success: true, results: output });
  });
});
// ------------------------------


// Start the worker
const worker = new RenderWorker();
worker.start().catch((error) => {
  console.error('[Worker] Fatal error:', error);
  process.exit(1);
});
