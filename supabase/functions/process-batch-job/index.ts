import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface BatchJob {
  id: string;
  user_id: string;
  project_id: string;
  job_type: string;
  total_count: number;
  completed_count: number;
  failed_count: number;
  status: string;
  config: any;
  used_account_ids: string[];
}

// Process up to N videos per invocation
// FFmpeg renders take ~1 min each, so 5 videos = ~5-7 min (within edge function timeout)
const MAX_VIDEOS_PER_RUN = 5;

// Max wait time per video (FFmpeg is fast, 3 min should be plenty)
const MAX_WAIT_PER_VIDEO_MS = 3 * 60 * 1000;

// Poll interval (faster polling for faster detection)
const POLL_INTERVAL_MS = 3000;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { jobId, authHeader: providedAuthHeader } = await req.json();
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log(`[batch] Starting: job=${jobId || 'next pending'}`);

    // Get the job to process (either specific or next pending)
    let query = supabase
      .from('batch_jobs')
      .select('*')
      .in('status', ['pending', 'processing'])
      .order('created_at', { ascending: true });

    if (jobId) {
      query = query.eq('id', jobId);
    }

    const { data: jobs, error: fetchError } = await query.limit(1);

    if (fetchError || !jobs || jobs.length === 0) {
      console.log('[batch] No pending jobs found');
      return new Response(JSON.stringify({ message: 'No pending jobs' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const job: BatchJob = jobs[0];
    const remaining = job.total_count - job.completed_count - job.failed_count;
    console.log(`[batch] Job ${job.id}: ${job.completed_count}/${job.total_count} done, ${remaining} remaining`);

    // Mark as processing
    await supabase
      .from('batch_jobs')
      .update({ status: 'processing', updated_at: new Date().toISOString() })
      .eq('id', job.id);

    // Get project settings
    const { data: project } = await supabase
      .from('projects')
      .select('*, gamemodes(name, description)')
      .eq('id', job.project_id)
      .single();

    if (!project) {
      await supabase
        .from('batch_jobs')
        .update({ status: 'failed', error_message: 'Project not found' })
        .eq('id', job.id);
      return new Response(JSON.stringify({ error: 'Project not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Build auth header for calling other functions
    const authHeader = providedAuthHeader || req.headers.get('authorization');

    // Determine how many videos to process this run
    const videosToProcess = Math.min(remaining, MAX_VIDEOS_PER_RUN);

    console.log(`[batch] Processing ${videosToProcess} videos this run`);

    let completedThisRun = 0;
    let failedThisRun = 0;
    const usedAccountIds = [...(job.used_account_ids || [])];

    for (let i = 0; i < videosToProcess; i++) {
      const videoNum = job.completed_count + job.failed_count + i + 1;
      console.log(`[batch] === Video ${videoNum}/${job.total_count} ===`);

      try {
        // Step 1: Delete existing voiceovers to force fresh script
        await supabase
          .from('voiceovers')
          .delete()
          .eq('project_id', job.project_id);

        // Step 2: Reset project status
        await supabase
          .from('projects')
          .update({ 
            status: 'processing', 
            render_progress: 0,
            last_error: null,
            output_url: null,
            render_id: null
          })
          .eq('id', job.project_id);

        // Step 3: Prepare request body
        const requestBody: any = {
          projectId: job.project_id,
          regenerateScript: true,
          subtitleSettings: project.subtitle_settings,
          aspectRatio: project.aspect_ratio || '9:16',
          endScreenSettings: project.end_screen_settings,
          musicSettings: project.music_settings,
          excludeAccountIds: usedAccountIds,
        };

        // Handle A/B test job type
        if (job.job_type === 'ab_test' && job.config?.hookVariations) {
          requestBody.hookVariations = job.config.hookVariations;
          requestBody.hookStyles = job.config.hookStyles;
          requestBody.testName = job.config.testName || `Batch A/B Test ${videoNum}`;
        }

        // Step 4: Call process-video
        console.log(`[batch] Calling process-video...`);
        
        const processResponse = await fetch(`${supabaseUrl}/functions/v1/process-video`, {
          method: 'POST',
          headers: {
            'Authorization': authHeader || `Bearer ${supabaseServiceKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
        });

        if (!processResponse.ok) {
          const errorText = await processResponse.text();
          console.error(`[batch] Video ${videoNum} process-video failed:`, errorText.slice(0, 200));
          failedThisRun++;
          continue;
        }

        console.log(`[batch] Video ${videoNum} queued, polling for completion...`);

        // Step 5: Poll for completion
        let completed = false;
        const startTime = Date.now();

        while (Date.now() - startTime < MAX_WAIT_PER_VIDEO_MS) {
          await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));

          // Check project status
          const { data: projectStatus } = await supabase
            .from('projects')
            .select('status, output_url, render_id')
            .eq('id', job.project_id)
            .single();

          const elapsed = Math.round((Date.now() - startTime) / 1000);

          if (projectStatus?.status === 'completed' && projectStatus?.output_url) {
            console.log(`[batch] Video ${videoNum} COMPLETED in ${elapsed}s`);
            completed = true;

            // Track YouTube account used
            const { data: queueEntry } = await supabase
              .from('youtube_post_queue')
              .select('account_id')
              .eq('project_id', job.project_id)
              .order('created_at', { ascending: false })
              .limit(1)
              .single();

            if (queueEntry?.account_id && !usedAccountIds.includes(queueEntry.account_id)) {
              usedAccountIds.push(queueEntry.account_id);
              console.log(`[batch] YouTube account ${queueEntry.account_id} used`);
            }

            break;
          } else if (projectStatus?.status === 'failed') {
            console.log(`[batch] Video ${videoNum} FAILED during render`);
            break;
          }

          // Also check render_queue directly for more accurate status
          if (projectStatus?.render_id) {
            const { data: renderJob } = await supabase
              .from('render_queue')
              .select('status')
              .eq('id', projectStatus.render_id)
              .single();

            if (renderJob?.status === 'failed') {
              console.log(`[batch] Video ${videoNum} render job FAILED`);
              break;
            }
          }

          // Log progress every 30 seconds
          if (elapsed % 30 === 0 && elapsed > 0) {
            console.log(`[batch] Video ${videoNum}: waiting... (${elapsed}s, status=${projectStatus?.status})`);
          }
        }

        if (completed) {
          completedThisRun++;
        } else {
          failedThisRun++;
          console.log(`[batch] Video ${videoNum} timed out or failed`);
        }

        // Short delay between videos
        if (i < videosToProcess - 1) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }

      } catch (error) {
        console.error(`[batch] Video ${videoNum} error:`, error);
        failedThisRun++;
      }
    }

    // Update job progress
    const newCompletedCount = job.completed_count + completedThisRun;
    const newFailedCount = job.failed_count + failedThisRun;
    const totalProcessed = newCompletedCount + newFailedCount;
    
    const isComplete = totalProcessed >= job.total_count;
    const newStatus = isComplete ? 'completed' : 'processing';

    await supabase
      .from('batch_jobs')
      .update({
        completed_count: newCompletedCount,
        failed_count: newFailedCount,
        status: newStatus,
        used_account_ids: usedAccountIds,
        last_processed_at: new Date().toISOString(),
      })
      .eq('id', job.id);

    console.log(`[batch] Progress: ${newCompletedCount}/${job.total_count} complete, ${newFailedCount} failed`);

    // If not complete, schedule next batch
    if (!isComplete) {
      console.log('[batch] Scheduling next batch...');
      
      const triggerNextBatch = async () => {
        // Short delay before triggering next batch
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        try {
          const response = await fetch(`${supabaseUrl}/functions/v1/process-batch-job`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${supabaseServiceKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ jobId: job.id }),
          });

          if (!response.ok) {
            console.error('[batch] Failed to trigger next batch:', await response.text());
          } else {
            console.log('[batch] Next batch triggered successfully');
          }
        } catch (err) {
          console.error('[batch] Error triggering next batch:', err);
        }
      };

      // Use EdgeRuntime.waitUntil if available, otherwise fire and forget
      if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime.waitUntil) {
        EdgeRuntime.waitUntil(triggerNextBatch());
      } else {
        triggerNextBatch();
      }
    } else {
      console.log(`[batch] === BATCH COMPLETE: ${newCompletedCount} videos generated ===`);
    }

    return new Response(JSON.stringify({
      jobId: job.id,
      completed: newCompletedCount,
      failed: newFailedCount,
      total: job.total_count,
      status: newStatus,
      message: isComplete 
        ? `Batch complete: ${newCompletedCount} videos generated, ${newFailedCount} failed`
        : `Progress: ${newCompletedCount}/${job.total_count} videos complete`,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[batch] Fatal error:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

declare const EdgeRuntime: { waitUntil: (promise: Promise<unknown>) => void } | undefined;
