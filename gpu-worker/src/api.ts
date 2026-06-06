/**
 * API client for communicating with the Lovable Cloud worker-api edge function.
 * This replaces direct Supabase database access for better security.
 */

import type { RenderJob } from './types.js';

let apiUrl: string;
let workerSecret: string;

export function initApi(): void {
  const supabaseUrl = process.env.SUPABASE_URL;
  if (!supabaseUrl) {
    throw new Error('SUPABASE_URL environment variable is required');
  }

  apiUrl = `${supabaseUrl}/functions/v1/worker-api`;
  workerSecret = process.env.GPU_WORKER_SECRET || 'mineedit-gpu-worker-secret-2024';

  console.log(`API initialized: ${apiUrl}`);
}

async function callApi<T>(action: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(`${apiUrl}/${action}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-worker-secret': workerSecret,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: response.statusText })) as any;
    throw new Error(`API error (${action}): ${errorData.error || response.statusText}`);
  }

  return response.json() as any as T;
}

/**
 * Claim a pending render job atomically
 */
export async function claimJob(workerId: string, workerVersion?: string): Promise<RenderJob | null> {
  try {
    const result = await callApi<{ job: RenderJob | null }>('claim-job', { 
      workerId,
      workerVersion
    });
    return result.job;
  } catch (error) {
    console.error('Error claiming job:', error);
    return null;
  }
}

/**
 * Mark a job as completed
 */
export async function completeJob(
  jobId: string,
  outputUrl: string,
  thumbnailUrl?: string,
  projectId?: string
): Promise<void> {
  await callApi('complete-job', {
    jobId,
    outputUrl,
    thumbnailUrl,
    projectId,
  });
}

/**
 * Mark a job as failed
 */
export async function failJob(
  jobId: string,
  errorMessage: string,
  projectId?: string
): Promise<{ willRetry: boolean }> {
  return callApi<{ success: boolean; willRetry: boolean }>('fail-job', {
    jobId,
    errorMessage,
    projectId,
  });
}

/**
 * Update render progress for a project
 */
export async function updateProgress(projectId: string, progress: number): Promise<void> {
  await callApi('update-progress', { projectId, progress });
}

/**
 * Send a heartbeat to show the worker is still processing a job
 */
export async function sendHeartbeat(jobId: string, projectId: string): Promise<void> {
  try {
    await callApi('heartbeat', { jobId, projectId });
  } catch (error) {
    console.warn(`[API] Heartbeat failed for job ${jobId}:`, error);
  }
}

/**
 * Get a signed upload URL for storage
 */
export async function getUploadUrl(
  bucket: string,
  path: string,
  contentType: string
): Promise<{ signedUrl: string; token: string; publicUrl: string }> {
  return callApi('get-upload-url', { bucket, path, contentType });
}

/**
 * Get a signed download URL for storage
 */
export async function getDownloadUrl(
  bucket: string,
  path: string,
  expiresIn = 3600
): Promise<{ signedUrl: string }> {
  return callApi('get-download-url', { bucket, path, expiresIn });
}

/**
 * Get custom font details from ID
 */
export async function getFont(fontId: string): Promise<{ storage_path: string; font_name: string; } | null> {
  try {
    const result = await callApi<{ font: any }>('get-font', { fontId });
    return result.font;
  } catch (e) {
    console.error(`[API] Error getting font ${fontId}:`, e);
    return null;
  }
}

/**
 * Get project details
 */
export async function getProject(projectId: string): Promise<{
  id: string;
  title: string;
  description: string | null;
  discord_webhook_url: string | null;
  youtube_settings: unknown;
} | null> {
  try {
    const result = await callApi<{ project: unknown }>('get-project', { projectId });
    return result.project as {
      id: string;
      title: string;
      description: string | null;
      discord_webhook_url: string | null;
      youtube_settings: unknown;
    };
  } catch (error) {
    console.error('Error getting project:', error);
    return null;
  }
}

/**
 * Upload a file to storage using signed URL
 */
export async function uploadToStorage(
  bucket: string,
  path: string,
  file: Buffer,
  contentType: string
): Promise<string> {
  const { signedUrl, publicUrl } = await getUploadUrl(bucket, path, contentType);

  const uploadResponse = await fetch(signedUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': contentType,
    },
    body: file,
  });

  if (!uploadResponse.ok) {
    throw new Error(`Upload failed: ${uploadResponse.statusText}`);
  }

  return publicUrl;
}

/**
 * Download a file from a URL
 */
export async function downloadFile(url: string): Promise<Buffer> {
  console.log(`[API] Downloading file: ${url}`);
  const response = await fetch(url);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to download file: ${response.status} ${response.statusText} - ${errorText.substring(0, 100)}...`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
