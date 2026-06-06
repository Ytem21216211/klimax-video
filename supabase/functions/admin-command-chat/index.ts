import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ADMIN_EMAILS = [
  "roliumgens@gmail.com",
  "dipsan@mineviral.xyz",
  "stn1xer@gmail.com"
];

interface CommandRequest {
  message: string;
  projectId?: string;
  projectContext?: {
    title: string;
    description?: string;
    status: string;
    hasDiscord: boolean;
    gamemodeId?: string;
  };
  conversationHistory?: Array<{ role: string; content: string }>;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify admin access
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      throw new Error('Missing authorization header');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      throw new Error('Authentication required');
    }

    // Check if user is admin
    if (!ADMIN_EMAILS.includes(user.email?.toLowerCase() || "")) {
      throw new Error('Access denied: Admin only');
    }

    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);

    const { message, projectId, projectContext, conversationHistory }: CommandRequest = await req.json();

    console.log(`Admin command from ${user.email}: ${message}`);
    console.log(`Project context:`, projectContext);

    // Fetch extended project settings if project is selected
    let projectSettings: any = null;
    let youtubeAccountCount = 0;
    let youtubePostDelay = 30;
    let pendingBatchJobs: any[] = [];

    if (projectId) {
      const { data: settings } = await serviceClient
        .from('projects')
        .select('subtitle_settings, aspect_ratio, end_screen_settings, music_settings, youtube_post_delay_minutes')
        .eq('id', projectId)
        .single();

      projectSettings = settings;
      youtubePostDelay = settings?.youtube_post_delay_minutes || 30;

      // Get YouTube account count
      const { count } = await serviceClient
        .from('youtube_accounts')
        .select('id', { count: 'exact', head: true })
        .eq('project_id', projectId)
        .eq('enabled', true);

      youtubeAccountCount = count || 0;

      // Get pending batch jobs for this project
      const { data: jobs } = await serviceClient
        .from('batch_jobs')
        .select('*')
        .eq('project_id', projectId)
        .in('status', ['pending', 'processing'])
        .order('created_at', { ascending: false })
        .limit(5);

      pendingBatchJobs = jobs || [];
    }

    const creativeModeEnabled = projectSettings?.subtitle_settings?.creativeModeEnabled === true;
    const visualModeEnabled = projectSettings?.subtitle_settings?.visualModeEnabled === true;

    // Build system prompt with available commands
    const systemPrompt = `You are MineEdit AI Command Center, a high-precision autonomous operating system for Minecraft creators.
Your goal is to provide extremely detailed, professional, and developer-grade analysis and execution.

CRITICAL OPERATING PRINCIPLES:
1. PRECISION: Even for brief prompts, provide deeply developed, multi-step reasoning. Elaborate on the "Why" and "How".
2. WHITEBOARD LOGIC: When making decisions or reports, simulate a "Whiteboard" level of detail—connecting data points to outcomes.
3. EXECUTIVE FEEDBACK: Respond like a top-tier media consultant. Use professional terminology (Retention uplift, CPM optimization, algorithmic positioning).

CURRENT CONTEXT:
- User: ${user.email} (Admin)
${projectContext ? `- Selected Project: "${projectContext.title}"
- Project Status: ${projectContext.status}
- Discord Connected: ${projectContext.hasDiscord ? 'Yes' : 'No'}
- Description: ${projectContext.description || 'Not set'}
- Gamemode ID: ${projectContext.gamemodeId || 'Not set'}
- Creative Mode: ${creativeModeEnabled ? '✅ ENABLED' : '❌ Disabled'}
- Visual Mode: ${visualModeEnabled ? '✅ ENABLED' : '❌ Disabled'}
- YouTube Accounts: ${youtubeAccountCount} connected
- Auto-Post Delay: ${youtubePostDelay} minutes between posts
- Active Batch Jobs: ${pendingBatchJobs.length > 0 ? pendingBatchJobs.map(j => `${j.completed_count}/${j.total_count} (${j.status})`).join(', ') : 'None'}` : '- No project selected'}

AVAILABLE OPERATIONS:
1. GENERATE_VIDEOS: Batch rendering for 10-100+ videos.
2. GENERATE_AB_TEST: Multi-hook validation.
3. STRATEGY REVIEWS: VIEW_PENDING_REPORTS / APPROVE_REPORT.
4. MARKET INTELLIGENCE: ADD_COMPETITOR / SCRAPE_COMPETITORS / VIEW_COMPETITOR_REPORT / GENERATE_SPY_VIDEOS.

RESPONSE FORMAT:
Explain your multi-step execution plan first.
At the END, include JSON format:
\`\`\`action
{"command": "COMMAND_NAME", "params": {...}}
\`\`\`

IMPORTANT: Proactively suggest optimizations. Suggest RECOVER_BATCH if jobs are stuck.`;

    // Prepare messages for AI
    const messages = [
      { role: 'system', content: systemPrompt },
      ...(conversationHistory || []),
      { role: 'user', content: message }
    ];

    // Call OpenAI
    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
    if (!OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is not configured');
    }

    const aiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages,
        stream: true,
      }),
    });

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) {
        throw new Error('Rate limit exceeded. Please try again in a moment.');
      }
      const errorText = await aiResponse.text();
      console.error('AI API error:', aiResponse.status, errorText);
      throw new Error('AI service error');
    }

    // Create a transform stream to process the AI response and execute commands
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const encoder = new TextEncoder();

    let fullResponse = "";

    // Process the stream
    const processStream = async () => {
      const reader = aiResponse.body!.getReader();
      const decoder = new TextDecoder();

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          await writer.write(encoder.encode(chunk));

          // Accumulate response to check for commands
          const lines = chunk.split('\n');
          for (const line of lines) {
            if (line.startsWith('data: ') && line !== 'data: [DONE]') {
              try {
                const parsed = JSON.parse(line.slice(6));
                const content = parsed.choices?.[0]?.delta?.content;
                if (content) {
                  fullResponse += content;
                }
              } catch { }
            }
          }
        }

        // After streaming completes, check for and execute commands
        const actionMatch = fullResponse.match(/```action\s*\n?([\s\S]*?)\n?```/);
        if (actionMatch) {
          try {
            const actionData = JSON.parse(actionMatch[1]);
            console.log('Executing command:', actionData);

            const result = await executeCommand(
              actionData.command,
              actionData.params,
              projectId,
              serviceClient,
              user.id,
              authHeader
            );

            // Send action result
            const actionResult = JSON.stringify({ action: result });
            await writer.write(encoder.encode(`\ndata: ${actionResult}\n\n`));
          } catch (e) {
            console.error('Command execution error:', e);
          }
        }

        await writer.write(encoder.encode('data: [DONE]\n\n'));
      } catch (error) {
        console.error('Stream processing error:', error);
      } finally {
        await writer.close();
      }
    };

    // Start processing in background
    processStream();

    return new Response(readable, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
      },
    });

  } catch (error) {
    console.error('Admin command error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: error instanceof Error && error.message.includes('denied') ? 403 : 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

async function executeCommand(
  command: string,
  params: any,
  projectId: string | undefined,
  supabase: any,
  userId: string,
  authHeader: string
): Promise<any> {
  console.log(`Executing command: ${command}`, params);
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  switch (command) {
    case 'GENERATE_VIDEOS': {
      if (!projectId) {
        return { type: 'error', message: 'No project selected' };
      }

      const count = Math.max(params.count || 1, 1);

      // Get project details
      const { data: project, error: projectError } = await supabase
        .from('projects')
        .select('*')
        .eq('id', projectId)
        .single();

      if (projectError || !project) {
        return { type: 'error', message: 'Project not found' };
      }

      // Get YouTube account count
      const { count: accountCount } = await supabase
        .from('youtube_accounts')
        .select('id', { count: 'exact', head: true })
        .eq('project_id', projectId)
        .eq('enabled', true);

      // Create batch job in database
      const { data: batchJob, error: jobError } = await supabase
        .from('batch_jobs')
        .insert({
          user_id: userId,
          project_id: projectId,
          job_type: 'video_generation',
          total_count: count,
          config: {
            subtitleSettings: project.subtitle_settings,
            aspectRatio: project.aspect_ratio,
            endScreenSettings: project.end_screen_settings,
            musicSettings: project.music_settings,
          },
        })
        .select()
        .single();

      if (jobError) {
        console.error('Failed to create batch job:', jobError);
        return { type: 'error', message: 'Failed to create batch job' };
      }

      console.log(`Created batch job ${batchJob.id} for ${count} videos`);

      // Trigger the batch processor
      const triggerBatch = async () => {
        await fetch(`${supabaseUrl}/functions/v1/process-batch-job`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${supabaseServiceKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            jobId: batchJob.id,
            authHeader: authHeader,
          }),
        });
      };

      if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime.waitUntil) {
        EdgeRuntime.waitUntil(triggerBatch());
      } else {
        triggerBatch();
      }

      const creativeModeStatus = project.subtitle_settings?.creativeModeEnabled === true;
      const estimatedMinutes = count * 8; // ~8 min per video
      const estimatedTime = estimatedMinutes > 60
        ? `${Math.round(estimatedMinutes / 60)} hours`
        : `${estimatedMinutes} minutes`;

      return {
        type: 'batch_job_started',
        jobId: batchJob.id,
        count,
        projectTitle: project.title,
        youtubeAccountsAvailable: accountCount || 0,
        creativeModeEnabled: creativeModeStatus,
        estimatedTime,
        message: `Batch job started: ${count} videos queued for "${project.title}". Estimated completion: ${estimatedTime}. Each video gets a unique script and YouTube account. Track progress with CHECK_BATCH_STATUS.`,
      };
    }

    case 'GENERATE_AB_TEST': {
      if (!projectId) {
        return { type: 'error', message: 'No project selected' };
      }

      const hookVariations = Math.min(Math.max(params.hookVariations || 2, 2), 3);
      const hookStyles = params.hookStyles || ['question', 'bold_claim', 'mystery'].slice(0, hookVariations);

      // Get project details
      const { data: project } = await supabase
        .from('projects')
        .select('*')
        .eq('id', projectId)
        .single();

      if (!project) {
        return { type: 'error', message: 'Project not found' };
      }

      // Create batch job for A/B test
      const { data: batchJob, error: jobError } = await supabase
        .from('batch_jobs')
        .insert({
          user_id: userId,
          project_id: projectId,
          job_type: 'ab_test',
          total_count: hookVariations,
          config: {
            hookVariations,
            hookStyles,
            testName: params.testName || `A/B Test ${new Date().toLocaleDateString()}`,
            subtitleSettings: project.subtitle_settings,
            aspectRatio: project.aspect_ratio,
            endScreenSettings: project.end_screen_settings,
            musicSettings: project.music_settings,
          },
        })
        .select()
        .single();

      if (jobError) {
        return { type: 'error', message: 'Failed to create A/B test job' };
      }

      // Trigger the batch processor
      const triggerBatch = async () => {
        await fetch(`${supabaseUrl}/functions/v1/process-batch-job`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${supabaseServiceKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            jobId: batchJob.id,
            authHeader: authHeader,
          }),
        });
      };

      if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime.waitUntil) {
        EdgeRuntime.waitUntil(triggerBatch());
      } else {
        triggerBatch();
      }

      return {
        type: 'ab_test_started',
        jobId: batchJob.id,
        hookVariations,
        hookStyles,
        projectTitle: project.title,
        message: `A/B Test started: Creating ${hookVariations} hook variations (${hookStyles.join(', ')}) for "${project.title}". Each variation will be posted to a different YouTube account. Winner determined after 48-72 hours based on viewer retention.`,
      };
    }

    case 'CHECK_BATCH_STATUS': {
      if (!projectId) {
        return { type: 'error', message: 'No project selected' };
      }

      const { data: jobs } = await supabase
        .from('batch_jobs')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })
        .limit(5);

      if (!jobs || jobs.length === 0) {
        return { type: 'batch_status', message: 'No batch jobs found for this project', jobs: [] };
      }

      const formatted = jobs.map((job: any) => ({
        id: job.id,
        type: job.job_type,
        progress: `${job.completed_count}/${job.total_count}`,
        failed: job.failed_count,
        status: job.status,
        createdAt: job.created_at,
        lastActivity: job.last_processed_at,
      }));

      return {
        type: 'batch_status',
        jobs: formatted,
        message: `Found ${jobs.length} batch job(s). Latest: ${formatted[0].progress} (${formatted[0].status})`,
      };
    }

    case 'CANCEL_BATCH': {
      if (!projectId) {
        return { type: 'error', message: 'No project selected' };
      }

      const { error } = await supabase
        .from('batch_jobs')
        .update({ status: 'cancelled' })
        .eq('project_id', projectId)
        .in('status', ['pending', 'processing']);

      if (error) {
        return { type: 'error', message: 'Failed to cancel batch job' };
      }

      return {
        type: 'batch_cancelled',
        message: 'Batch job(s) cancelled. Videos already completed will remain.',
      };
    }

    case 'SEND_TO_DISCORD': {
      if (!projectId) {
        return { type: 'error', message: 'No project selected' };
      }

      const { data: project } = await supabase
        .from('projects')
        .select('discord_webhook_url, title, output_url, thumbnail_url')
        .eq('id', projectId)
        .single();

      if (!project?.discord_webhook_url) {
        return { type: 'error', message: 'No Discord webhook configured for this project' };
      }

      const discordMessage = params.message || `New video ready from "${project.title}"!`;

      const payload: any = {
        content: discordMessage,
        embeds: [{
          title: project.title,
          color: 0x7c3aed,
        }],
      };

      if (project.output_url) {
        payload.embeds[0].url = project.output_url;
        payload.embeds[0].description = `[Download Video](${project.output_url})`;
      }

      if (project.thumbnail_url) {
        payload.embeds[0].thumbnail = { url: project.thumbnail_url };
      }

      const webhookResponse = await fetch(project.discord_webhook_url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!webhookResponse.ok) {
        return { type: 'error', message: 'Failed to send Discord notification' };
      }

      return {
        type: 'discord_notification_sent',
        message: `Sent notification to Discord for "${project.title}"`,
      };
    }

    case 'UPDATE_PROJECT': {
      if (!projectId) {
        return { type: 'error', message: 'No project selected' };
      }

      const updates: any = {};
      if (params.title) updates.title = params.title;
      if (params.description !== undefined) updates.description = params.description;
      if (params.discord_webhook_url !== undefined) updates.discord_webhook_url = params.discord_webhook_url;

      if (Object.keys(updates).length === 0) {
        return { type: 'error', message: 'No valid updates provided' };
      }

      const { error } = await supabase
        .from('projects')
        .update(updates)
        .eq('id', projectId);

      if (error) {
        return { type: 'error', message: 'Failed to update project' };
      }

      return {
        type: 'project_updated',
        message: `Updated project: ${Object.keys(updates).join(', ')}`,
        updates,
      };
    }

    case 'CHECK_STATUS': {
      if (!projectId) {
        return { type: 'error', message: 'No project selected' };
      }

      const { data: project } = await supabase
        .from('projects')
        .select('status, render_progress, output_url, last_error, render_id')
        .eq('id', projectId)
        .single();

      // If status is processing but we have an output_url, it's actually completed
      if (project?.status === 'processing' && project?.output_url) {
        await supabase
          .from('projects')
          .update({ status: 'completed', render_progress: 100 })
          .eq('id', projectId);

        return {
          type: 'status_check',
          status: 'completed',
          progress: 100,
          outputUrl: project.output_url,
          message: 'Video is ready! (Status was stuck, now fixed)',
        };
      }

      return {
        type: 'status_check',
        status: project?.status || 'unknown',
        progress: project?.render_progress || 0,
        outputUrl: project?.output_url,
        renderId: project?.render_id,
        error: project?.last_error,
      };
    }

    case 'RESET_PROJECT': {
      if (!projectId) {
        return { type: 'error', message: 'No project selected' };
      }

      // Reset the project to draft state
      const { error } = await supabase
        .from('projects')
        .update({
          status: 'draft',
          render_progress: 0,
          last_error: null,
          render_id: null,
        })
        .eq('id', projectId);

      if (error) {
        return { type: 'error', message: 'Failed to reset project' };
      }

      return {
        type: 'project_reset',
        message: 'Project has been reset to draft state. You can now generate new videos.',
      };
    }

    case 'GENERATE_SCRIPT': {
      if (!projectId) {
        return { type: 'error', message: 'No project selected' };
      }

      // Delete existing voiceovers first
      await supabase
        .from('voiceovers')
        .delete()
        .eq('project_id', projectId);

      // Call generate-script-voiceover function
      const { data: project } = await supabase
        .from('projects')
        .select('description, gamemode_id')
        .eq('id', projectId)
        .single();

      const response = await fetch(`${supabaseUrl}/functions/v1/generate-script-voiceover`, {
        method: 'POST',
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          projectId,
          description: project?.description,
          gamemodeId: project?.gamemode_id,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        return { type: 'error', message: `Script generation failed: ${errorText}` };
      }

      const result = await response.json();

      return {
        type: 'script_generated',
        message: 'New script and voiceover generated',
        script: result.script,
      };
    }

    case 'VIEW_PENDING_REPORTS': {
      // Get pending weekly reports
      const { data: weeklyReports } = await supabase
        .from('weekly_reports')
        .select('*, gamemodes(name)')
        .eq('user_id', userId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      // Get pending competitor reports
      const { data: competitorReports } = await supabase
        .from('competitor_reports')
        .select('*, gamemodes(name)')
        .eq('user_id', userId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      const weekly = (weeklyReports || []).map((r: any) => ({
        id: r.id,
        type: 'weekly',
        gamemode: r.gamemodes?.name || 'General',
        videosAnalyzed: r.videos_analyzed,
        keyInsight: r.recommendations?.key_insight,
      }));

      const competitor = (competitorReports || []).map((r: any) => ({
        id: r.id,
        type: 'competitor',
        gamemode: r.gamemodes?.name || 'General',
        competitorsAnalyzed: r.competitors_analyzed,
        videosAnalyzed: r.videos_analyzed,
      }));

      return {
        type: 'pending_reports',
        weeklyReports: weekly,
        competitorReports: competitor,
        message: `Found ${weekly.length} weekly report(s) and ${competitor.length} competitor report(s) pending.`,
      };
    }

    case 'APPROVE_REPORT': {
      const { reportId } = params;
      if (!reportId) {
        return { type: 'error', message: 'Missing reportId' };
      }

      const response = await fetch(`${supabaseUrl}/functions/v1/apply-report-settings`, {
        method: 'POST',
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ reportId, action: 'approve' }),
      });

      if (!response.ok) {
        const error = await response.json();
        return { type: 'error', message: error.error || 'Failed to approve report' };
      }

      const result = await response.json();
      return {
        type: 'report_approved',
        expiresAt: result.expiresAt,
        message: `Report approved! Optimizations will be active until ${new Date(result.expiresAt).toLocaleDateString()}.`,
      };
    }

    case 'ADD_COMPETITOR': {
      const { channelUrl, platform, gamemodeId, channelName } = params;
      if (!channelUrl || !platform) {
        return { type: 'error', message: 'Missing channelUrl or platform' };
      }

      const response = await fetch(`${supabaseUrl}/functions/v1/scrape-competitor-channel`, {
        method: 'POST',
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ channelUrl, platform, gamemodeId, channelName }),
      });

      if (!response.ok) {
        const error = await response.json();
        return { type: 'error', message: error.error || 'Failed to add competitor' };
      }

      const result = await response.json();
      return {
        type: 'competitor_added',
        competitorId: result.competitorId,
        videosFound: result.videosFound,
        message: `Competitor added! Found ${result.videosFound} videos and saved ${result.videosSaved}.`,
      };
    }

    case 'SCRAPE_COMPETITORS': {
      const { gamemodeId } = params;

      // Get all competitor channels (optionally filtered by gamemode)
      let query = supabase
        .from('competitor_channels')
        .select('id, channel_name')
        .eq('user_id', userId);

      if (gamemodeId) {
        query = query.eq('gamemode_id', gamemodeId);
      }

      const { data: competitors } = await query;

      if (!competitors || competitors.length === 0) {
        return { type: 'error', message: 'No competitors found to scrape' };
      }

      // Trigger scrape for each competitor
      let successCount = 0;
      for (const competitor of competitors) {
        const response = await fetch(`${supabaseUrl}/functions/v1/scrape-competitor-channel`, {
          method: 'POST',
          headers: {
            'Authorization': authHeader,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ competitorId: competitor.id }),
        });

        if (response.ok) successCount++;
      }

      return {
        type: 'competitors_scraped',
        total: competitors.length,
        successful: successCount,
        message: `Scraped ${successCount}/${competitors.length} competitor channels.`,
      };
    }

    case 'VIEW_COMPETITOR_REPORT': {
      const { gamemodeId } = params;

      let query = supabase
        .from('competitor_reports')
        .select('*, gamemodes(name)')
        .eq('user_id', userId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(1);

      if (gamemodeId) {
        query = query.eq('gamemode_id', gamemodeId);
      }

      const { data: reports } = await query;

      if (!reports || reports.length === 0) {
        return { type: 'error', message: 'No pending competitor reports found' };
      }

      const report = reports[0];
      return {
        type: 'competitor_report',
        reportId: report.id,
        gamemode: report.gamemodes?.name || 'General',
        competitorsAnalyzed: report.competitors_analyzed,
        videosAnalyzed: report.videos_analyzed,
        trendingTopics: report.trending_topics?.topics || [],
        contentGaps: report.content_gaps?.gaps || [],
        recommendedScripts: report.recommended_scripts?.scripts || [],
        message: `Competitor report for ${report.gamemodes?.name || 'General'}: ${report.competitors_analyzed} competitors, ${report.videos_analyzed} videos analyzed.`,
      };
    }

    case 'GENERATE_SPY_VIDEOS': {
      const { reportId, count, copyLevel } = params;
      if (!reportId) {
        return { type: 'error', message: 'Missing reportId' };
      }

      const response = await fetch(`${supabaseUrl}/functions/v1/generate-spy-videos`, {
        method: 'POST',
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ reportId, count, copyLevel, projectId }),
      });

      if (!response.ok) {
        const error = await response.json();
        return { type: 'error', message: error.error || 'Failed to generate spy videos' };
      }

      const result = await response.json();
      return {
        type: 'spy_videos_queued',
        batchJobId: result.batchJobId,
        videosQueued: result.videosQueued,
        message: `Queued ${result.videosQueued} spy videos! Track progress with CHECK_BATCH_STATUS.`,
      };
    }

    case 'RECOVER_BATCH': {
      // Trigger the recovery function to check for stuck batch jobs
      console.log('Triggering batch job recovery...');

      try {
        const response = await fetch(`${supabaseUrl}/functions/v1/recover-batch-jobs`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${supabaseServiceKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({}),
        });

        if (!response.ok) {
          const errorText = await response.text();
          return { type: 'error', message: `Recovery failed: ${errorText.slice(0, 100)}` };
        }

        const result = await response.json();
        return {
          type: 'batch_recovery',
          stuckJobs: result.stuckJobs || 0,
          recovered: result.recovered || 0,
          message: result.stuckJobs > 0
            ? `Found ${result.stuckJobs} stuck batch job(s), recovered ${result.recovered}. They will resume processing shortly.`
            : 'No stuck batch jobs found. All batches are running normally.',
        };
      } catch (error) {
        console.error('Recovery trigger failed:', error);
        return { type: 'error', message: 'Failed to trigger batch recovery' };
      }
    }

    default:
      return { type: 'error', message: `Unknown command: ${command}` };
  }
}

// Declare EdgeRuntime for TypeScript
declare const EdgeRuntime: { waitUntil: (promise: Promise<unknown>) => void } | undefined;
