import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { projectId } = await req.json();
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    const CREATOMATE_API_KEY = Deno.env.get('CREATOMATE_API_KEY');
    if (!CREATOMATE_API_KEY) {
      throw new Error('CREATOMATE_API_KEY is not configured');
    }

    // Get project with render_id
    const { data: project, error } = await supabase
      .from('projects')
      .select('id, title, description, status, render_id, render_progress, output_url, discord_webhook_url, youtube_settings')
      .eq('id', projectId)
      .single();

    if (error || !project) {
      throw new Error('Project not found');
    }

    // If already completed or failed, return current status
    if (project.status === 'completed' || project.status === 'failed') {
      return new Response(
        JSON.stringify({ 
          status: project.status, 
          output_url: project.output_url,
          render_progress: project.render_progress 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // If no render_id, something went wrong early
    if (!project.render_id) {
      return new Response(
        JSON.stringify({ 
          status: project.status, 
          render_progress: project.render_progress,
          message: 'No render ID found - render may not have started'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check Creatomate status
    console.log(`Checking Creatomate render status for: ${project.render_id}`);
    
    const statusResponse = await fetch(`https://api.creatomate.com/v2/renders/${project.render_id}`, {
      headers: { Authorization: `Bearer ${CREATOMATE_API_KEY}` },
    });

    if (!statusResponse.ok) {
      throw new Error(`Creatomate API error: ${statusResponse.status}`);
    }

    const renderStatus = await statusResponse.json();
    console.log(`Creatomate status: ${renderStatus.status}, progress: ${renderStatus.progress}`);

    // Handle different statuses
    if (renderStatus.status === 'succeeded') {
      // Render completed! Update project
      console.log('Render completed successfully, updating project...');
      
      await supabase
        .from('projects')
        .update({
          status: 'completed',
          output_url: renderStatus.url,
          thumbnail_url: renderStatus.snapshot_url || null,
          render_progress: 100,
          last_error: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', projectId);



      // Auto-upload to YouTube if enabled
      if (project.youtube_settings?.enabled) {
        try {
          console.log("YouTube auto-post enabled, triggering upload...");
          const youtubeResponse = await fetch(`${supabaseUrl}/functions/v1/youtube-upload`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              project_id: projectId,
              video_url: renderStatus.url,
              title: project.title,
              description: project.description,
            }),
          });
          
          if (youtubeResponse.ok) {
            const ytResult = await youtubeResponse.json();
            console.log(`YouTube upload successful! Video ID: ${ytResult.video_id}`);
            
            // Send Discord notification about YouTube upload if webhook configured
            if (project.discord_webhook_url) {
              await fetch(project.discord_webhook_url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  content: `📺 **Uploaded to YouTube!**\n\n**${project.title || 'Untitled'}** is now live: ${ytResult.video_url}`,
                }),
              }).catch(() => {});
            }
          } else {
            const ytError = await youtubeResponse.text();
            console.error("YouTube upload failed:", ytError);
          }
        } catch (ytError) {
          console.error("YouTube auto-upload error:", ytError);
        }
      }

      return new Response(
        JSON.stringify({ 
          status: 'completed', 
          output_url: renderStatus.url,
          render_progress: 100,
          message: 'Render completed and project updated!'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else if (renderStatus.status === 'failed') {
      // Render failed
      const errorMessage = renderStatus.error_message || renderStatus.error || 'Unknown renderer error';
      
      await supabase
        .from('projects')
        .update({
          status: 'failed',
          render_progress: 0,
          last_error: errorMessage.substring(0, 500),
          updated_at: new Date().toISOString(),
        })
        .eq('id', projectId);

      return new Response(
        JSON.stringify({ 
          status: 'failed', 
          render_progress: 0,
          error: errorMessage
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else {
      // Still rendering (planned or rendering)
      const progress = renderStatus.progress 
        ? Math.round(50 + renderStatus.progress * 50)
        : project.render_progress;

      // Update progress in database
      await supabase
        .from('projects')
        .update({
          render_progress: progress,
          updated_at: new Date().toISOString(),
        })
        .eq('id', projectId);

      return new Response(
        JSON.stringify({ 
          status: 'processing', 
          render_progress: progress,
          creatomate_status: renderStatus.status,
          message: 'Render still in progress'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
