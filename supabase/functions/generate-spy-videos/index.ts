import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Validate user from auth header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const userId = claimsData.claims.sub;

    const { reportId, count, copyLevel, projectId } = await req.json();

    if (!reportId) {
      return new Response(JSON.stringify({ error: 'Missing reportId' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get the competitor report
    const { data: report, error: reportError } = await supabase
      .from('competitor_reports')
      .select('*, gamemodes(name)')
      .eq('id', reportId)
      .eq('user_id', userId)
      .single();

    if (reportError || !report) {
      return new Response(JSON.stringify({ error: 'Report not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const recommendedScripts = report.recommended_scripts as { scripts?: any[] };
    const scripts = recommendedScripts?.scripts || [];

    if (scripts.length === 0) {
      return new Response(JSON.stringify({ error: 'No recommended scripts in report' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Filter by copy level if specified
    let filteredScripts = scripts;
    if (copyLevel) {
      filteredScripts = scripts.filter(s => s.copy_level === copyLevel);
    }

    // Limit count
    const videosToGenerate = filteredScripts.slice(0, count || 3);

    // Get a project for this gamemode (or use provided projectId)
    let targetProjectId = projectId;
    if (!targetProjectId) {
      const { data: project } = await supabase
        .from('projects')
        .select('id')
        .eq('user_id', userId)
        .eq('gamemode_id', report.gamemode_id)
        .limit(1)
        .single();

      if (!project) {
        return new Response(JSON.stringify({ error: 'No project found for this gamemode. Create a project first.' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      targetProjectId = project.id;
    }

    // Get project settings for the batch job
    const { data: project } = await supabase
      .from('projects')
      .select('*')
      .eq('id', targetProjectId)
      .single();

    if (!project) {
      return new Response(JSON.stringify({ error: 'Project not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Verify user has access to this project
    if (project.user_id !== userId) {
      const { data: membership } = await supabase
        .from('project_members')
        .select('role')
        .eq('project_id', targetProjectId)
        .eq('user_id', userId)
        .single();

      if (!membership) {
        return new Response(JSON.stringify({ error: 'Unauthorized to access this project' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // Create batch job for spy video generation
    const { data: batchJob, error: batchError } = await supabase
      .from('batch_jobs')
      .insert({
        user_id: userId,
        project_id: targetProjectId,
        job_type: 'spy_video_generation',
        total_count: videosToGenerate.length,
        status: 'pending',
        config: {
          competitor_report_id: reportId,
          gamemode_id: report.gamemode_id,
          gamemode_name: (report.gamemodes as any)?.name || 'Unknown',
          scripts: videosToGenerate.map(s => ({
            title: s.title_idea,
            hook: s.hook,
            outline: s.script_outline,
            copy_level: s.copy_level,
            inspired_by: s.inspired_by,
          })),
          project_settings: {
            subtitle_settings: project.subtitle_settings,
            music_settings: project.music_settings,
            end_screen_settings: project.end_screen_settings,
            aspect_ratio: project.aspect_ratio,
          },
        },
      })
      .select()
      .single();

    if (batchError) throw batchError;

    // Update report status
    await supabase
      .from('competitor_reports')
      .update({ status: 'started' })
      .eq('id', reportId);

    // Trigger background processing (fire and forget)
    fetch(`${supabaseUrl}/functions/v1/process-batch-job`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ jobId: batchJob.id }),
    }).catch(err => console.error('Failed to trigger batch processor:', err));

    console.log(`Started spy video generation: ${videosToGenerate.length} videos from report ${reportId}`);

    return new Response(JSON.stringify({
      success: true,
      batchJobId: batchJob.id,
      videosQueued: videosToGenerate.length,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('Error generating spy videos:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
