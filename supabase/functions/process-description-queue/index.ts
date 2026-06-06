// ============================================================================
// process-description-queue
// Scheduled worker (invoked by pg_cron every minute). Picks up pending
// clip_description_jobs and invokes describe-clip for each, in parallel with
// a small concurrency cap.
//
// Per invocation: up to MAX_JOBS_PER_RUN claimed.
// Per-user cap:   MAX_CONCURRENT_PER_USER to prevent runaway cost.
// Backoff:        on failure, the job is re-queued (status='pending') if
//                 attempts < max_attempts, else it's marked 'failed'.
//
// Security: verify_jwt=false. pg_cron calls this via pg_net with a shared
// secret header (CRON_SECRET). Unknown callers are rejected.
// ============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const MAX_JOBS_PER_RUN = 10;
const MAX_CONCURRENT_PER_USER = 3;
const INVOKE_TIMEOUT_MS = 120_000;

const WORKER_ID = `desc-queue-${crypto.randomUUID().slice(0, 8)}`;

interface JobRow {
  id: string;
  user_id: string;
  project_id: string;
  video_id: string;
  attempts: number;
  max_attempts: number;
  force: boolean;
}

async function invokeDescribeClip(
  supabaseUrl: string,
  serviceKey: string,
  videoId: string,
  force: boolean,
): Promise<{ ok: boolean; error?: string }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), INVOKE_TIMEOUT_MS);
  try {
    const resp = await fetch(`${supabaseUrl}/functions/v1/describe-clip`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({ videoId, force }),
      signal: controller.signal,
    });
    const json = await resp.json().catch(() => ({}));
    if (!resp.ok || json.error) {
      return { ok: false, error: json.error || `HTTP ${resp.status}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unknown error" };
  } finally {
    clearTimeout(timeoutId);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const cronSecret = Deno.env.get("CRON_SECRET");

    // Reject unknown callers. Either the shared CRON_SECRET header, or a
    // service-role bearer token (for manual debugging) is required.
    const providedSecret = req.headers.get("x-cron-secret");
    const authHeader = req.headers.get("authorization") || "";
    const bearerOk = authHeader === `Bearer ${serviceKey}`;
    const secretOk = cronSecret && providedSecret === cronSecret;
    if (!bearerOk && !secretOk) {
      const allHeaders: Record<string, string> = {};
      for (const [k, v] of req.headers.entries()) {
        // Mask the actual secret values in logs, just show length + first 4 chars
        allHeaders[k] =
          k.toLowerCase() === "authorization" || k.toLowerCase() === "x-cron-secret"
            ? `<len=${v.length} starts=${v.slice(0, 4)}>`
            : v;
      }
      console.log("[AUTH FAIL]", JSON.stringify({
        envCronSecretPresent: !!cronSecret,
        envCronSecretLen: cronSecret?.length ?? 0,
        envCronSecretStart: cronSecret?.slice(0, 4) ?? null,
        providedSecretPresent: !!providedSecret,
        providedSecretLen: providedSecret?.length ?? 0,
        providedSecretStart: providedSecret?.slice(0, 4) ?? null,
        headers: allHeaders,
      }));
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Count currently processing jobs per user for rate-limiting.
    const { data: processingJobs } = await admin
      .from("clip_description_jobs")
      .select("user_id")
      .eq("status", "processing");

    const inFlightByUser = new Map<string, number>();
    for (const row of processingJobs || []) {
      inFlightByUser.set(row.user_id, (inFlightByUser.get(row.user_id) || 0) + 1);
    }

    // Fetch pending jobs in FIFO order, over-fetch a bit for user filtering.
    const { data: pending, error: pendingError } = await admin
      .from("clip_description_jobs")
      .select("id, user_id, project_id, video_id, attempts, max_attempts, force")
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(MAX_JOBS_PER_RUN * 3);

    if (pendingError) {
      throw new Error(`Failed to fetch pending jobs: ${pendingError.message}`);
    }

    const claimed: JobRow[] = [];
    for (const j of (pending || []) as JobRow[]) {
      if (claimed.length >= MAX_JOBS_PER_RUN) break;
      const inFlight = inFlightByUser.get(j.user_id) || 0;
      if (inFlight >= MAX_CONCURRENT_PER_USER) continue;
      // Atomically transition pending -> processing for this job
      const { data: updated, error: updateError } = await admin
        .from("clip_description_jobs")
        .update({
          status: "processing",
          started_at: new Date().toISOString(),
          worker_id: WORKER_ID,
          attempts: j.attempts + 1,
        })
        .eq("id", j.id)
        .eq("status", "pending")
        .select("id")
        .maybeSingle();
      if (updateError || !updated) continue; // lost the race, someone else claimed it
      claimed.push(j);
      inFlightByUser.set(j.user_id, inFlight + 1);
    }

    if (claimed.length === 0) {
      return new Response(
        JSON.stringify({ claimed: 0, message: "No pending jobs (or all users at cap)" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Process claimed jobs in parallel. Each job calls describe-clip which runs
    // its own Gemini round-trip. We do not block the HTTP response on long
    // runs — but pg_cron / HTTP invocation will time out at ~60-150s. For a
    // batch of 10 short clips this is comfortably within budget.
    const results = await Promise.allSettled(
      claimed.map(async (job) => {
        const { ok, error } = await invokeDescribeClip(
          supabaseUrl,
          serviceKey,
          job.video_id,
          job.force,
        );
        if (ok) {
          await admin
            .from("clip_description_jobs")
            .update({
              status: "completed",
              completed_at: new Date().toISOString(),
            })
            .eq("id", job.id);
          return { job: job.id, ok: true };
        }
        // Failure: retry if attempts left, else mark failed.
        const now = new Date().toISOString();
        if (job.attempts + 1 < job.max_attempts) {
          // Keep attempts count (we already incremented when claiming).
          // Re-queue by setting status back to 'pending' so cron picks it up again.
          await admin
            .from("clip_description_jobs")
            .update({
              status: "pending",
              started_at: null,
              worker_id: null,
              error: (error || "").slice(0, 1000),
            })
            .eq("id", job.id);
        } else {
          await admin
            .from("clip_description_jobs")
            .update({
              status: "failed",
              completed_at: now,
              error: (error || "").slice(0, 1000),
            })
            .eq("id", job.id);
          // Also mark the video as failed if describe-clip didn't already.
          await admin
            .from("videos")
            .update({
              description_status: "failed",
              description_error: (error || "").slice(0, 1000),
            })
            .eq("id", job.video_id);
        }
        return { job: job.id, ok: false, error };
      }),
    );

    const successes = results.filter((r) => r.status === "fulfilled" && (r.value as any).ok).length;
    const failures = results.length - successes;

    return new Response(
      JSON.stringify({
        claimed: claimed.length,
        successes,
        failures,
        worker_id: WORKER_ID,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("[process-description-queue] Error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
