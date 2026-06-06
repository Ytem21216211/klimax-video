import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-worker-secret',
}

// Worker secret for authentication (set this in your worker .env)
const WORKER_SECRET = Deno.env.get('GPU_WORKER_SECRET') || 'mineedit-gpu-worker-secret-2024'

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Authenticate worker using secret header
    const workerSecret = req.headers.get('x-worker-secret')
    if (workerSecret !== WORKER_SECRET) {
      console.error('Invalid worker secret provided')
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Create Supabase client with service role for full access
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const url = new URL(req.url)
    const action = url.pathname.split('/').pop()

    console.log(`Worker API called: action=${action}`)

    switch (action) {
      case 'claim-job': {
        const { workerId, workerVersion } = await req.json()
        console.log(`Claiming job for worker: ${workerId} (version: ${workerVersion || 'unknown'})`)

        // MINIMUM WORKER VERSION ENFORCEMENT
        // Any worker below 1.3.0 is considered a 'ghost' or outdated and will be rejected.
        const MIN_VERSION = '1.3.0';
        if (!workerVersion || workerVersion < MIN_VERSION) {
          console.warn(`Rejecting job claim from outdated/ghost worker: ${workerId} (version: ${workerVersion || 'none'})`);
          return new Response(
            JSON.stringify({ error: 'Worker version outdated. Please update and restart.', updateRequired: true }),
            { status: 426, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // RESET STALE JOBS: If a job is stuck in 'processing' for more than 5 minutes without updates,
        // it means the worker likely crashed. Reset it to 'pending' so it can be reclaimed.
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
        const { error: resetError } = await supabase
          .from('render_queue')
          .update({
            status: 'pending',
            worker_id: null,
            started_at: null,
            error_message: 'Job reset due to inactivity (possible worker crash)'
          })
          .eq('status', 'processing')
          .lt('updated_at', fiveMinutesAgo)

        if (resetError) {
          console.warn('Failed to reset stale jobs:', resetError)
        }

        const { data, error } = await supabase.rpc('claim_render_job', {
          p_worker_id: workerId,
        })

        if (error) {
          console.error('Error claiming job:', error)
          return new Response(
            JSON.stringify({ error: error.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        // RPC returns an array, get first item or null
        const job = data && data.length > 0 ? data[0] : null
        console.log(`Job claimed: ${job?.id || 'none available'}`)

        return new Response(
          JSON.stringify({ job }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      case 'complete-job': {
        const { jobId, outputUrl, thumbnailUrl, projectId } = await req.json()
        console.log(`Completing job: ${jobId}`)

        // Update render queue status and ATTEMPT to claim the notification lock
        const { data: updatedQueue, error: queueError } = await supabase
          .from('render_queue')
          .update({
            status: 'completed',
            output_url: outputUrl,
            thumbnail_url: thumbnailUrl || null,
            completed_at: new Date().toISOString(),
            discord_notified: true, // Attempt to set to true
          })
          .eq('id', jobId)
          .eq('discord_notified', false) // ONLY if it was previously false
          .select('id') // If we update a row, this will return data

        const isFirstNotification = updatedQueue && updatedQueue.length > 0;

        if (queueError) {
          console.error('Error completing job:', queueError)
          return new Response(
            JSON.stringify({ error: queueError.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        // If we didn't update anything in the previous step (isFirstNotification=false), 
        // it means either the job is already marked notified OR we just need to update the status 
        // without sending another Discord ping.
        if (!isFirstNotification) {
          console.log(`[WorkerAPI] Job ${jobId} already notified or status updated. Skipping duplicate notification.`);
          
          // Still ensure status is updated to completed for the UI, 
          // but we don't return early here because we might still want to trigger the project update 
          // if it hasn't happened.
          await supabase
            .from('render_queue')
            .update({ status: 'completed' })
            .eq('id', jobId);
        }

        // Update project status if projectId provided
        if (projectId) {
          const { error: projectError } = await supabase
            .from('projects')
            .update({
              status: 'completed',
              render_progress: 100,
              output_url: outputUrl,
              thumbnail_url: thumbnailUrl || null,
              updated_at: new Date().toISOString(),
            })
            .eq('id', projectId)

          if (projectError) {
            console.error('Error updating project:', projectError)
          }

          // ============================================
          // DISCORD WEBHOOK + YOUTUBE AUTO-POST
          // ============================================
          // ONLY trigger if this is the FIRST notification call for this job
          if (isFirstNotification) {
            try {
              // Fetch project data for notifications
              const { data: projectData } = await supabase
                .from('projects')
                .select('discord_webhook_url, title, description, youtube_settings, subtitle_settings')
                .eq('id', projectId)
                .single()

            // Send Discord notification if webhook is configured
            if (projectData?.discord_webhook_url) {
              try {
                console.log("Sending Discord notification...")
                const webhookResponse = await fetch(projectData.discord_webhook_url, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    content: `🎬 **Video Complete!**\n\n**${projectData.title || 'Untitled Project'}** has finished rendering.\n\n📥 **Download:** ${outputUrl}`,
                    embeds: thumbnailUrl ? [{
                      title: projectData.title || 'Your Video is Ready',
                      description: 'Click the link above to download your video.',
                      color: 0x5865F2,
                      thumbnail: { url: thumbnailUrl },
                      timestamp: new Date().toISOString(),
                    }] : undefined,
                  }),
                })

                if (webhookResponse.ok) {
                  console.log("Discord notification sent successfully")
                } else {
                  console.error("Discord webhook failed:", await webhookResponse.text())
                }
              } catch (discordError) {
                console.error("Failed to send Discord notification:", discordError)
              }
            }

            // Auto-upload to YouTube if any enabled accounts exist
            const { data: ytAccounts } = await supabase
              .from('youtube_accounts')
              .select('id')
              .eq('project_id', projectId)
              .eq('enabled', true)
              .limit(1)

            if (ytAccounts && ytAccounts.length > 0) {
              console.log("YouTube auto-post enabled, triggering upload...")
              const supabaseUrl = Deno.env.get('SUPABASE_URL')!

              // Get editing style from subtitle settings
              const subtitleStyle = (projectData?.subtitle_settings as any)?.style || 'static'

              const youtubeResponse = await fetch(`${supabaseUrl}/functions/v1/youtube-upload`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  project_id: projectId,
                  video_url: outputUrl,
                  title: projectData?.title,
                  description: projectData?.description,
                  editing_style: subtitleStyle,
                }),
              })

              if (youtubeResponse.ok) {
                const ytResult = await youtubeResponse.json()
                if (ytResult.queued) {
                  console.log(`YouTube upload scheduled for ${ytResult.scheduled_for} to ${ytResult.channel_name}`)
                } else {
                  console.log(`YouTube upload successful! Video ID: ${ytResult.video_id}`)
                }

                // Send Discord notification about YouTube upload if webhook configured
                if (projectData?.discord_webhook_url && ytResult.video_url) {
                  await fetch(projectData.discord_webhook_url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      content: `📺 **Uploaded to YouTube!**\n\n**${projectData.title || 'Untitled'}** is now live: ${ytResult.video_url}`,
                    }),
                  }).catch(() => { })
                }
              } else {
                const ytError = await youtubeResponse.text()
                console.error("YouTube upload failed:", ytError)
              }
            }

            // ============================================
            // TIKTOK AUTO-POST
            // ============================================
            // Auto-upload to TikTok if any enabled accounts exist
            const { data: tiktokAccounts } = await supabase
              .from('tiktok_accounts')
              .select('id')
              .eq('project_id', projectId)
              .eq('enabled', true)
              .limit(1)

            if (tiktokAccounts && tiktokAccounts.length > 0) {
              console.log("TikTok auto-post enabled, triggering upload...")
              const supabaseUrl = Deno.env.get('SUPABASE_URL')!

              const tiktokResponse = await fetch(`${supabaseUrl}/functions/v1/tiktok-upload`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  project_id: projectId,
                  video_url: outputUrl,
                  title: projectData?.title || 'New Video',
                }),
              })

              if (tiktokResponse.ok) {
                const ttResult = await tiktokResponse.json()
                if (ttResult.queued) {
                  console.log(`TikTok upload scheduled for ${ttResult.scheduled_for}`)
                } else {
                  console.log(`TikTok upload initiated!`)
                }

                // Send Discord notification about TikTok upload
                if (projectData?.discord_webhook_url) {
                  await fetch(projectData.discord_webhook_url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      content: `🎵 **Uploading to TikTok!**\n\n**${projectData.title || 'Untitled'}** is being uploaded to TikTok.`,
                    }),
                  }).catch(() => { })
                }
              } else {
                const ttError = await tiktokResponse.text()
                console.error("TikTok upload failed:", ttError)
              }
            }
          } catch (notifyError) {
            console.error("Notification/upload error:", notifyError)
            // Don't fail the job for notification errors
          }
        }
      }

      console.log(`Job ${jobId} completed successfully`)
        return new Response(
          JSON.stringify({ success: true }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      case 'heartbeat': {
        const { jobId, projectId } = await req.json()
        if (jobId) {
          // Update updated_at in render_queue to show the worker is still alive
          await supabase
            .from('render_queue')
            .update({ updated_at: new Date().toISOString() })
            .eq('id', jobId)
        }
        
        return new Response(
          JSON.stringify({ success: true }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      case 'fail-job': {
        const { jobId, errorMessage, projectId } = await req.json()
        console.log(`Failing job: ${jobId}, error: ${errorMessage}`)

        // Get job to check retry count
        const { data: job } = await supabase
          .from('render_queue')
          .select('attempts, max_attempts')
          .eq('id', jobId)
          .single()

        const shouldRetry = job && job.attempts < job.max_attempts

        // Update render queue
        const { error: queueError } = await supabase
          .from('render_queue')
          .update({
            status: shouldRetry ? 'pending' : 'failed',
            error_message: errorMessage,
            worker_id: null,
            started_at: null,
          })
          .eq('id', jobId)

        if (queueError) {
          console.error('Error failing job:', queueError)
          return new Response(
            JSON.stringify({ error: queueError.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        // Update project status if not retrying and projectId provided
        if (!shouldRetry && projectId) {
          const { error: projectError } = await supabase
            .from('projects')
            .update({
              status: 'failed',
              render_progress: 0,
              last_error: errorMessage?.substring(0, 500),
              updated_at: new Date().toISOString(),
            })
            .eq('id', projectId)

          if (projectError) {
            console.error('Error updating project:', projectError)
          }
        }

        console.log(`Job ${jobId} marked as ${shouldRetry ? 'pending (retry)' : 'failed'}`)
        return new Response(
          JSON.stringify({ success: true, willRetry: shouldRetry }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      case 'update-progress': {
        const { projectId, progress } = await req.json()

        const { error } = await supabase
          .from('projects')
          .update({
            status: 'rendering',
            render_progress: progress,
            updated_at: new Date().toISOString(),
          })
          .eq('id', projectId)

        if (error) {
          return new Response(
            JSON.stringify({ error: error.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        return new Response(
          JSON.stringify({ success: true }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      case 'get-upload-url': {
        const { bucket, path, contentType } = await req.json()
        console.log(`Getting upload URL: bucket=${bucket}, path=${path}`)

        // Create signed upload URL
        const { data, error } = await supabase.storage
          .from(bucket)
          .createSignedUploadUrl(path)

        if (error) {
          console.error('Error creating upload URL:', error)
          return new Response(
            JSON.stringify({ error: error.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        // Get public URL
        const { data: publicUrlData } = supabase.storage
          .from(bucket)
          .getPublicUrl(path)

        return new Response(
          JSON.stringify({
            signedUrl: data.signedUrl,
            token: data.token,
            path: data.path,
            publicUrl: publicUrlData.publicUrl
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      case 'get-download-url': {
        const { bucket, path, expiresIn } = await req.json()
        console.log(`Getting download URL: bucket=${bucket}, path=${path}`)

        const { data, error } = await supabase.storage
          .from(bucket)
          .createSignedUrl(path, expiresIn || 3600)

        if (error) {
          console.error('Error creating download URL:', error)
          return new Response(
            JSON.stringify({ error: error.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        return new Response(
          JSON.stringify({
            signedUrl: data.signedUrl
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      case 'get-font': {
        const { fontId } = await req.json()
        
        const { data, error } = await supabase
          .from('user_fonts')
          .select('storage_path, font_name')
          .eq('id', fontId)
          .single()

        if (error) {
          return new Response(
            JSON.stringify({ error: error.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        return new Response(
          JSON.stringify({ font: data }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      case 'get-project': {
        const { projectId } = await req.json()

        const { data, error } = await supabase
          .from('projects')
          .select('id, title, description, discord_webhook_url, youtube_settings')
          .eq('id', projectId)
          .single()

        if (error) {
          return new Response(
            JSON.stringify({ error: error.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        return new Response(
          JSON.stringify({ project: data }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      default:
        return new Response(
          JSON.stringify({ error: `Unknown action: ${action}` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }
  } catch (error: unknown) {
    console.error('Worker API error:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
