import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Recovery function for stuck batch jobs
 * This should be called periodically (e.g., every 5 minutes via cron)
 * to ensure batch jobs don't get stuck due to failed recursive calls
 */
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('[recover-batch] Checking for stuck batch jobs...');

    // Find batch jobs that are "processing" but haven't been updated in 10 minutes
    // This indicates the recursive call failed and the job is stuck
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();

    const { data: stuckJobs, error: fetchError } = await supabase
      .from('batch_jobs')
      .select('*')
      .eq('status', 'processing')
      .lt('last_processed_at', tenMinutesAgo)
      .order('created_at', { ascending: true });

    if (fetchError) {
      console.error('[recover-batch] Error fetching stuck jobs:', fetchError);
      return new Response(JSON.stringify({ error: fetchError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (!stuckJobs || stuckJobs.length === 0) {
      console.log('[recover-batch] No stuck jobs found');
      return new Response(JSON.stringify({ message: 'No stuck jobs', recovered: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log(`[recover-batch] Found ${stuckJobs.length} stuck job(s)`);

    let recoveredCount = 0;

    for (const job of stuckJobs) {
      const remaining = job.total_count - job.completed_count - job.failed_count;
      
      if (remaining <= 0) {
        // Job is actually complete, just update status
        console.log(`[recover-batch] Job ${job.id} is complete, updating status`);
        await supabase
          .from('batch_jobs')
          .update({ status: 'completed' })
          .eq('id', job.id);
        continue;
      }

      console.log(`[recover-batch] Recovering job ${job.id}: ${job.completed_count}/${job.total_count} done, ${remaining} remaining`);

      // Re-trigger the batch processor
      try {
        const response = await fetch(`${supabaseUrl}/functions/v1/process-batch-job`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${supabaseServiceKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ jobId: job.id }),
        });

        if (response.ok) {
          console.log(`[recover-batch] Job ${job.id} recovery triggered successfully`);
          recoveredCount++;
        } else {
          const errorText = await response.text();
          console.error(`[recover-batch] Failed to recover job ${job.id}:`, errorText.slice(0, 200));
        }
      } catch (triggerError) {
        console.error(`[recover-batch] Error triggering job ${job.id}:`, triggerError);
      }

      // Small delay between recovery attempts
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.log(`[recover-batch] Recovered ${recoveredCount}/${stuckJobs.length} jobs`);

    return new Response(JSON.stringify({
      message: 'Recovery complete',
      stuckJobs: stuckJobs.length,
      recovered: recoveredCount,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[recover-batch] Fatal error:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
