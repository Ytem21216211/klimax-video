import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type UploadItem = {
  path: string;
  fileName?: string;
  /** Duration in seconds (extracted client-side from media metadata) */
  duration?: number;
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

    const body = await req.json();
    const projectId = body?.projectId as string | undefined;
    const videos = (body?.videos || []) as UploadItem[];
    const voiceovers = (body?.voiceovers || []) as UploadItem[];

    console.log("commit-project-uploads called with:", {
      projectId,
      videosCount: videos.length,
      voiceoversCount: voiceovers.length,
      videos: videos.map((v) => ({ path: v.path, fileName: v.fileName })),
    });

    if (!projectId) {
      return new Response(JSON.stringify({ error: "Missing projectId" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Auth (use anon client + caller JWT)
    const authed = createClient(supabaseUrl, anonKey, {
      global: {
        headers: { Authorization: authHeader },
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
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

    // DB ops (service client)
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    // Verify ownership
    const { data: project, error: projectError } = await admin
      .from("projects")
      .select("id,user_id")
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

    // Deduplicate against existing rows
    const videoPaths = [...new Set(videos.map((v) => v?.path).filter(Boolean))] as string[];
    const voicePaths = [...new Set(voiceovers.map((v) => v?.path).filter(Boolean))] as string[];

    const [existingVideosRes, existingVoiceRes] = await Promise.all([
      videoPaths.length
        ? admin.from("videos").select("source_url").eq("project_id", projectId).in("source_url", videoPaths)
        : Promise.resolve({ data: [] as any[] }),
      voicePaths.length
        ? admin.from("voiceovers").select("file_url").eq("project_id", projectId).in("file_url", voicePaths)
        : Promise.resolve({ data: [] as any[] }),
    ]);

    const existingVideoSet = new Set((existingVideosRes.data || []).map((r: any) => r.source_url));
    const existingVoiceSet = new Set((existingVoiceRes.data || []).map((r: any) => r.file_url));

    const newVideoRows = videos
      .filter((v) => v?.path && !existingVideoSet.has(v.path))
      .map((v) => ({
        project_id: projectId,
        source_url: v.path,
        file_name: v.fileName || null,
        duration: v.duration ?? null,
      }));

    const newVoiceRows = voiceovers
      .filter((v) => v?.path && !existingVoiceSet.has(v.path))
      .map((v) => ({
        project_id: projectId,
        file_url: v.path,
        file_name: v.fileName || null,
        duration: v.duration ?? null,
      }));

    console.log("Inserting new rows:", {
      newVideosCount: newVideoRows.length,
      newVoiceoversCount: newVoiceRows.length,
      newVideoRows,
    });

    let insertedVideos: Array<{ id: string; project_id: string }> = [];
    if (newVideoRows.length) {
      const { error, data } = await admin
        .from("videos")
        .insert(newVideoRows)
        .select("id, project_id");
      console.log("Videos insert result:", { error, insertedCount: data?.length });
      if (error) throw error;
      insertedVideos = data || [];
    }

    // Auto-enqueue description jobs for newly inserted clips.
    // Best-effort: if this fails, the upload itself still succeeds and the user
    // can click "Analyze all clips" to retry. Never block the upload flow.
    if (insertedVideos.length) {
      try {
        const jobRows = insertedVideos.map((v) => ({
          user_id: user.id,
          project_id: v.project_id,
          video_id: v.id,
          status: "pending" as const,
          force: false,
        }));
        const { error: jobErr } = await admin
          .from("clip_description_jobs")
          .insert(jobRows);
        if (jobErr) {
          console.warn("[commit-project-uploads] Failed to enqueue description jobs:", jobErr.message);
        } else {
          console.log(`[commit-project-uploads] Enqueued ${jobRows.length} description jobs`);
        }
      } catch (e) {
        console.warn("[commit-project-uploads] Description job enqueue threw:", e);
      }
    }

    if (newVoiceRows.length) {
      const { error, data } = await admin.from("voiceovers").insert(newVoiceRows).select();
      console.log("Voiceovers insert result:", { error, insertedCount: data?.length });
      if (error) throw error;
    }

    // Mark project as uploaded (ready to generate)
    await admin
      .from("projects")
      .update({ status: "uploaded", last_error: null, updated_at: new Date().toISOString() })
      .eq("id", projectId);

    return new Response(
      JSON.stringify({
        success: true,
        inserted: {
          videos: newVideoRows.length,
          voiceovers: newVoiceRows.length,
        },
        projectId,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("commit-project-uploads error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
