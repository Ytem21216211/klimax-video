// ============================================================================
// describe-clips-batch
// Enqueues description jobs for all clips in a project that need one.
// Called from the "Analyze all clips" button in the Project Editor, or to
// force a re-description across a whole project.
//
// Input:  { projectId: string, force?: boolean, includeEdited?: boolean }
// Output: { queued, alreadyReady, skippedEdited, alreadyQueued }
//
// Behaviour rules:
//   - A clip with status 'ready'  is skipped unless force=true.
//   - A clip with status 'edited' is skipped unless force=true AND
//     includeEdited=true (two signals needed; protects explicit user edits).
//   - A clip that already has an active job ('pending' or 'processing') is not
//     re-enqueued — handled by the partial unique index on clip_description_jobs.
//   - On force=true, existing failed jobs are replaced with a fresh pending job.
// ============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing Authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const projectId = body?.projectId as string | undefined;
    const videoId = body?.videoId as string | undefined;
    const force = Boolean(body?.force);
    const includeEdited = Boolean(body?.includeEdited);

    if (!projectId) {
      return new Response(JSON.stringify({ error: "Missing projectId" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Auth: verify caller owns the project
    const authed = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const {
      data: { user },
      error: userError,
    } = await authed.auth.getUser();

    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: project, error: projectError } = await admin
      .from("projects")
      .select("id, user_id")
      .eq("id", projectId)
      .maybeSingle();

    if (projectError || !project) {
      return new Response(JSON.stringify({ error: "Project not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (project.user_id !== user.id) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Pull clips for this project. If videoId is provided, only that one clip
    // is considered (used by the fullscreen per-clip regenerate button).
    let videosQuery = admin
      .from("videos")
      .select("id, description_status")
      .eq("project_id", projectId);
    if (videoId) {
      videosQuery = videosQuery.eq("id", videoId);
    }
    const { data: videos, error: videosError } = await videosQuery;

    if (videosError) {
      return new Response(JSON.stringify({ error: videosError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const clips = videos || [];
    if (clips.length === 0) {
      return new Response(
        JSON.stringify({ queued: 0, alreadyReady: 0, skippedEdited: 0, alreadyQueued: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Partition clips
    let alreadyReady = 0;
    let skippedEdited = 0;
    const candidateIds: string[] = [];

    for (const c of clips) {
      if (c.description_status === "ready" && !force) {
        alreadyReady++;
        continue;
      }
      if (c.description_status === "edited" && !(force && includeEdited)) {
        skippedEdited++;
        continue;
      }
      candidateIds.push(c.id);
    }

    if (candidateIds.length === 0) {
      return new Response(
        JSON.stringify({ queued: 0, alreadyReady, skippedEdited, alreadyQueued: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Find which candidates already have an active job ('pending' or 'processing')
    const { data: activeJobs, error: activeJobsError } = await admin
      .from("clip_description_jobs")
      .select("video_id")
      .in("status", ["pending", "processing"])
      .in("video_id", candidateIds);

    if (activeJobsError) {
      return new Response(JSON.stringify({ error: activeJobsError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const alreadyQueuedSet = new Set((activeJobs || []).map((j) => j.video_id));
    const toEnqueueIds = candidateIds.filter((id) => !alreadyQueuedSet.has(id));

    if (toEnqueueIds.length === 0) {
      return new Response(
        JSON.stringify({
          queued: 0,
          alreadyReady,
          skippedEdited,
          alreadyQueued: alreadyQueuedSet.size,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const rows = toEnqueueIds.map((videoId) => ({
      user_id: user.id,
      project_id: projectId,
      video_id: videoId,
      status: "pending",
      force,
    }));

    const { error: insertError } = await admin
      .from("clip_description_jobs")
      .insert(rows);

    if (insertError) {
      return new Response(JSON.stringify({ error: insertError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Reset the corresponding video rows to 'pending' so UI reflects "in queue"
    // (only for those that are not currently 'edited' unless force+includeEdited)
    await admin
      .from("videos")
      .update({
        description_status: "pending",
        description_error: null,
      })
      .in("id", toEnqueueIds);

    return new Response(
      JSON.stringify({
        queued: toEnqueueIds.length,
        alreadyReady,
        skippedEdited,
        alreadyQueued: alreadyQueuedSet.size,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("[describe-clips-batch] Error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
