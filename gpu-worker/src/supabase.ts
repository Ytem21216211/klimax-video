import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { RenderJob } from './types.js';

let supabase: SupabaseClient;

export function initSupabase(): SupabaseClient {
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  
  supabase = createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
  
  return supabase;
}

export function getSupabase(): SupabaseClient {
  if (!supabase) {
    throw new Error('Supabase client not initialized. Call initSupabase() first.');
  }
  return supabase;
}

// Claim a pending job atomically
export async function claimJob(workerId: string): Promise<RenderJob | null> {
  const client = getSupabase();
  
  // Find and claim a pending job in one atomic operation
  const { data, error } = await client
    .from('render_queue')
    .update({
      status: 'processing',
      worker_id: workerId,
      started_at: new Date().toISOString(),
      attempts: client.rpc('increment_attempts'),
    })
    .eq('status', 'pending')
    .order('priority', { ascending: false })
    .order('created_at', { ascending: true })
    .limit(1)
    .select()
    .single();
  
  if (error) {
    // No pending jobs or other error
    if (error.code === 'PGRST116') {
      return null; // No rows found
    }
    console.error('Error claiming job:', error);
    return null;
  }
  
  return data as RenderJob;
}

// Alternative: use raw SQL for atomic claim
export async function claimJobAtomic(workerId: string): Promise<RenderJob | null> {
  const client = getSupabase();
  
  // Use RPC for atomic claim
  const { data, error } = await client.rpc('claim_render_job', {
    p_worker_id: workerId,
  });
  
  if (error) {
    console.error('Error claiming job:', error);
    return null;
  }
  
  return data as RenderJob | null;
}

// Mark job as completed
export async function completeJob(
  jobId: string, 
  outputUrl: string, 
  thumbnailUrl?: string
): Promise<void> {
  const client = getSupabase();
  
  const { error } = await client
    .from('render_queue')
    .update({
      status: 'completed',
      output_url: outputUrl,
      thumbnail_url: thumbnailUrl || null,
      completed_at: new Date().toISOString(),
    })
    .eq('id', jobId);
  
  if (error) {
    throw new Error(`Failed to complete job: ${error.message}`);
  }
}

// Mark job as failed
export async function failJob(jobId: string, errorMessage: string): Promise<void> {
  const client = getSupabase();
  
  // Check if we should retry
  const { data: job } = await client
    .from('render_queue')
    .select('attempts, max_attempts')
    .eq('id', jobId)
    .single();
  
  const shouldRetry = job && job.attempts < job.max_attempts;
  
  const { error } = await client
    .from('render_queue')
    .update({
      status: shouldRetry ? 'pending' : 'failed',
      error_message: errorMessage,
      worker_id: null,
      started_at: null,
    })
    .eq('id', jobId);
  
  if (error) {
    throw new Error(`Failed to mark job as failed: ${error.message}`);
  }
}

// Update project status after render completes
export async function updateProjectStatus(
  projectId: string,
  status: 'completed' | 'failed',
  outputUrl?: string,
  thumbnailUrl?: string,
  errorMessage?: string
): Promise<void> {
  const client = getSupabase();
  
  const updateData: Record<string, unknown> = {
    status,
    render_progress: status === 'completed' ? 100 : 0,
    updated_at: new Date().toISOString(),
  };
  
  if (outputUrl) updateData.output_url = outputUrl;
  if (thumbnailUrl) updateData.thumbnail_url = thumbnailUrl;
  if (errorMessage) updateData.last_error = errorMessage.substring(0, 500);
  
  const { error } = await client
    .from('projects')
    .update(updateData)
    .eq('id', projectId);
  
  if (error) {
    console.error('Failed to update project status:', error);
  }
}

// Get project details for webhooks
export async function getProject(projectId: string) {
  const client = getSupabase();
  
  const { data, error } = await client
    .from('projects')
    .select('id, title, description, discord_webhook_url, youtube_settings')
    .eq('id', projectId)
    .single();
  
  if (error) {
    console.error('Failed to get project:', error);
    return null;
  }
  
  return data;
}

// Upload file to Supabase storage
export async function uploadToStorage(
  bucket: string,
  path: string,
  file: Buffer | Blob,
  contentType: string
): Promise<string> {
  const client = getSupabase();
  
  const { error } = await client.storage
    .from(bucket)
    .upload(path, file, {
      contentType,
      upsert: true,
    });
  
  if (error) {
    throw new Error(`Failed to upload to storage: ${error.message}`);
  }
  
  // Get public URL
  const { data: urlData } = client.storage
    .from(bucket)
    .getPublicUrl(path);
  
  return urlData.publicUrl;
}

// Download file from URL (could be Supabase storage or external)
export async function downloadFile(url: string): Promise<Buffer> {
  const response = await fetch(url);
  
  if (!response.ok) {
    throw new Error(`Failed to download file: ${response.status} ${response.statusText}`);
  }
  
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
