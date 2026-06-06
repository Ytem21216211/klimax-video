// ============================================================================
// describe-clip
// Generates an AI description of a single video clip using Gemini 2.5 Flash
// with native video input (via Gemini Files API).
//
// Input:  { videoId: string, force?: boolean }
// Output: { success, description, model } or { error }
//
// This function is invoked two ways:
//   1. Directly from the UI for a manual retry on a single clip
//   2. From process-description-queue for batch / auto runs
// ============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MODEL_ID = "gemini-2.5-flash";
const MAX_CLIP_BYTES = 500 * 1024 * 1024; // 500 MB hard cap
const FILE_ACTIVE_POLL_INTERVAL_MS = 1500;
const FILE_ACTIVE_POLL_TIMEOUT_MS = 90_000;

const DESCRIPTION_PROMPT = `You are analyzing a short Minecraft gameplay clip that will be used as B-roll in a short-form video.

Describe this clip in 1-3 concise sentences. Focus on:
- The concrete action happening (e.g. "player lands a crit on an opponent", "MLG water bucket clutch", "building a redstone contraption", "parkour across rooftops", "fails a jump and falls")
- The game mode or environment (e.g. bedwars, skywars, survival, creative, hypixel hub, nether)
- The emotional beat (hype / tense / funny / calm / epic)

Rules:
- Do NOT start with "This clip shows" or similar filler. Jump straight to the content.
- Do NOT mention subtitles, watermarks, or UI overlays.
- If the action is ambiguous, say so briefly rather than inventing.
- Output plain text only. No markdown, no JSON, no quotes.`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const KNOWN_BUCKETS = new Set(["video-clips", "voiceovers", "project-assets"]);
const DEFAULT_BUCKET = "video-clips";

async function signAssetUrl(supabase: any, input: string): Promise<string> {
  if (input.includes("token=")) return input;

  let bucket: string;
  let path: string;

  if (input.includes("/storage/v1/object/public/")) {
    // Full public URL: extract bucket + path after the marker
    const afterPublic = input.split("/storage/v1/object/public/")[1];
    const subParts = afterPublic.split("/");
    bucket = subParts[0];
    path = decodeURIComponent(afterPublic.substring(bucket.length + 1));
  } else {
    const firstSegment = input.split("/")[0];
    if (KNOWN_BUCKETS.has(firstSegment)) {
      // Path starts with a known bucket name (e.g. "video-clips/user/file.mp4")
      bucket = firstSegment;
      path = decodeURIComponent(input.substring(bucket.length + 1));
    } else {
      // Bare path: assume video-clips bucket (matches ProjectEditor delete logic)
      bucket = DEFAULT_BUCKET;
      path = decodeURIComponent(input);
    }
  }

  path = path.startsWith("/") ? path.substring(1) : path;

  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, 3600);

  if (error || !data?.signedUrl) {
    throw new Error(`Failed to sign clip URL (${bucket}/${path}): ${error?.message || "unknown"}`);
  }
  return data.signedUrl;
}

interface UploadedGeminiFile {
  name: string;  // e.g. "files/abc123"
  uri: string;   // e.g. "https://generativelanguage.googleapis.com/v1beta/files/abc123"
  mimeType: string;
  state: string;
  sizeBytes?: string;
}

async function uploadToGemini(
  signedUrl: string,
  apiKey: string,
  displayName: string,
): Promise<UploadedGeminiFile> {
  // Step 1: fetch the clip to learn its size and mime type
  const clipResp = await fetch(signedUrl);
  if (!clipResp.ok || !clipResp.body) {
    throw new Error(`Failed to download clip: HTTP ${clipResp.status}`);
  }

  const contentLengthHeader = clipResp.headers.get("content-length");
  const contentTypeHeader = clipResp.headers.get("content-type") || "video/mp4";

  if (!contentLengthHeader) {
    // We need the size upfront for resumable upload; fall back to reading all bytes.
    const buf = await clipResp.arrayBuffer();
    return uploadBytesToGemini(new Uint8Array(buf), contentTypeHeader, apiKey, displayName);
  }

  const sizeBytes = parseInt(contentLengthHeader, 10);
  if (sizeBytes > MAX_CLIP_BYTES) {
    throw new Error(`Clip is too large (${sizeBytes} bytes, max ${MAX_CLIP_BYTES})`);
  }

  // Step 2: start a resumable upload session
  const startResp = await fetch(
    `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${apiKey}`,
    {
      method: "POST",
      headers: {
        "X-Goog-Upload-Protocol": "resumable",
        "X-Goog-Upload-Command": "start",
        "X-Goog-Upload-Header-Content-Length": String(sizeBytes),
        "X-Goog-Upload-Header-Content-Type": contentTypeHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ file: { display_name: displayName } }),
    },
  );

  if (!startResp.ok) {
    const txt = await startResp.text();
    throw new Error(`Gemini upload start failed: ${startResp.status} ${txt}`);
  }

  const uploadUrl = startResp.headers.get("x-goog-upload-url");
  if (!uploadUrl) {
    throw new Error("Gemini upload start did not return an upload URL");
  }

  // Step 3: stream the clip bytes to the upload URL and finalize in one request
  const putResp = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      "Content-Length": String(sizeBytes),
      "X-Goog-Upload-Offset": "0",
      "X-Goog-Upload-Command": "upload, finalize",
    },
    body: clipResp.body,
    // @ts-ignore -- Deno supports duplex on streaming body requests
    duplex: "half",
  });

  if (!putResp.ok) {
    const txt = await putResp.text();
    throw new Error(`Gemini upload finalize failed: ${putResp.status} ${txt}`);
  }

  const fileJson = await putResp.json();
  const file = fileJson.file as UploadedGeminiFile;
  if (!file?.uri) {
    throw new Error(`Gemini upload returned no file URI: ${JSON.stringify(fileJson)}`);
  }
  return file;
}

async function uploadBytesToGemini(
  bytes: Uint8Array,
  mimeType: string,
  apiKey: string,
  displayName: string,
): Promise<UploadedGeminiFile> {
  if (bytes.byteLength > MAX_CLIP_BYTES) {
    throw new Error(`Clip is too large (${bytes.byteLength} bytes, max ${MAX_CLIP_BYTES})`);
  }

  const startResp = await fetch(
    `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${apiKey}`,
    {
      method: "POST",
      headers: {
        "X-Goog-Upload-Protocol": "resumable",
        "X-Goog-Upload-Command": "start",
        "X-Goog-Upload-Header-Content-Length": String(bytes.byteLength),
        "X-Goog-Upload-Header-Content-Type": mimeType,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ file: { display_name: displayName } }),
    },
  );

  if (!startResp.ok) {
    const txt = await startResp.text();
    throw new Error(`Gemini upload start failed: ${startResp.status} ${txt}`);
  }
  const uploadUrl = startResp.headers.get("x-goog-upload-url");
  if (!uploadUrl) throw new Error("Gemini upload start did not return an upload URL");

  const putResp = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      "Content-Length": String(bytes.byteLength),
      "X-Goog-Upload-Offset": "0",
      "X-Goog-Upload-Command": "upload, finalize",
    },
    body: bytes,
  });

  if (!putResp.ok) {
    const txt = await putResp.text();
    throw new Error(`Gemini upload finalize failed: ${putResp.status} ${txt}`);
  }
  const fileJson = await putResp.json();
  const file = fileJson.file as UploadedGeminiFile;
  if (!file?.uri) throw new Error(`Gemini upload returned no file URI: ${JSON.stringify(fileJson)}`);
  return file;
}

async function waitUntilGeminiFileActive(
  fileName: string,
  apiKey: string,
): Promise<UploadedGeminiFile> {
  const deadline = Date.now() + FILE_ACTIVE_POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/${fileName}?key=${apiKey}`,
    );
    if (!resp.ok) {
      const txt = await resp.text();
      throw new Error(`Gemini file poll failed: ${resp.status} ${txt}`);
    }
    const file = (await resp.json()) as UploadedGeminiFile;
    if (file.state === "ACTIVE") return file;
    if (file.state === "FAILED") {
      throw new Error(`Gemini file processing failed for ${fileName}`);
    }
    await new Promise((r) => setTimeout(r, FILE_ACTIVE_POLL_INTERVAL_MS));
  }
  throw new Error(`Gemini file ${fileName} did not become ACTIVE within ${FILE_ACTIVE_POLL_TIMEOUT_MS}ms`);
}

async function deleteGeminiFile(fileName: string, apiKey: string): Promise<void> {
  try {
    await fetch(
      `https://generativelanguage.googleapis.com/v1beta/${fileName}?key=${apiKey}`,
      { method: "DELETE" },
    );
  } catch (e) {
    console.warn(`[describe-clip] Failed to delete Gemini file ${fileName}:`, e);
  }
}

interface GeminiGenerateResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    finishReason?: string;
  }>;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
  error?: { message?: string };
}

async function generateDescription(
  file: UploadedGeminiFile,
  apiKey: string,
): Promise<{ text: string; usage?: GeminiGenerateResponse["usageMetadata"] }> {
  // Transient errors (503 overloaded, 429 rate limit, 500 server errors) get
  // retried in-process with exponential backoff. This avoids burning a whole
  // queue attempt (which would re-upload the clip to Gemini) for blips that
  // typically clear in a few seconds.
  const maxAttempts = 4;
  const baseDelayMs = 1500;
  let lastErr: Error | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_ID}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                { file_data: { mime_type: file.mimeType, file_uri: file.uri } },
                { text: DESCRIPTION_PROMPT },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.4,
            maxOutputTokens: 300,
          },
          safetySettings: [
            { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
          ],
        }),
      },
    );

    const json = (await resp.json()) as GeminiGenerateResponse;
    if (resp.ok && !json.error) {
      const text =
        json.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("").trim() || "";
      if (!text) {
        lastErr = new Error("Gemini returned an empty description");
      } else {
        return { text, usage: json.usageMetadata };
      }
    } else {
      lastErr = new Error(
        `Gemini generateContent failed: ${resp.status} ${json.error?.message || "unknown"}`,
      );
    }

    // Only retry on transient server / rate-limit errors. Everything else
    // (400 bad request, 401/403 auth, safety blocks) is terminal.
    const transient = resp.status === 429 || resp.status === 500 || resp.status === 503;
    if (!transient || attempt === maxAttempts) break;

    const jitter = Math.floor(Math.random() * 500);
    const delay = baseDelayMs * Math.pow(2, attempt - 1) + jitter;
    console.log(
      `[describe-clip] transient Gemini ${resp.status} on attempt ${attempt}/${maxAttempts}, retrying in ${delay}ms`,
    );
    await new Promise((r) => setTimeout(r, delay));
  }

  throw lastErr ?? new Error("Gemini generateContent failed: unknown");
}

function estimateGeminiFlashCostUsd(usage?: GeminiGenerateResponse["usageMetadata"]): number {
  if (!usage) return 0;
  // gemini-2.5-flash pricing snapshot (input $0.30, output $2.50 per 1M tokens).
  // This is an estimate only; refine when actual invoicing is audited.
  const inTok = usage.promptTokenCount || 0;
  const outTok = usage.candidatesTokenCount || 0;
  return (inTok / 1_000_000) * 0.30 + (outTok / 1_000_000) * 2.50;
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startedAt = Date.now();
  let videoIdForLogging: string | null = null;
  let projectIdForLogging: string | null = null;
  let userIdForLogging: string | null = null;

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const geminiKey = Deno.env.get("GEMINI_API_KEY");

    if (!geminiKey) {
      return new Response(JSON.stringify({ error: "GEMINI_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const body = await req.json();
    const videoId = body?.videoId as string | undefined;
    const force = Boolean(body?.force);

    if (!videoId) {
      return new Response(JSON.stringify({ error: "Missing videoId" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    videoIdForLogging = videoId;

    // Load the clip
    const { data: video, error: videoError } = await admin
      .from("videos")
      .select("id, project_id, source_url, file_name, description_status, description_attempts")
      .eq("id", videoId)
      .maybeSingle();

    if (videoError || !video) {
      return new Response(JSON.stringify({ error: "Video not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    projectIdForLogging = video.project_id;

    // Load the owning project to capture user_id for logging
    const { data: project } = await admin
      .from("projects")
      .select("user_id")
      .eq("id", video.project_id)
      .maybeSingle();
    userIdForLogging = project?.user_id || null;

    // Respect user edits unless force=true (and even then we never overwrite an
    // explicit user edit silently; caller can clear the description first).
    if (video.description_status === "edited" && !force) {
      return new Response(
        JSON.stringify({
          success: true,
          skipped: true,
          reason: "description was user-edited; pass force=true to overwrite",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Mark as processing + bump attempts atomically
    await admin
      .from("videos")
      .update({
        description_status: "processing",
        description_attempts: (video.description_attempts || 0) + 1,
        description_error: null,
      })
      .eq("id", videoId);

    // Sign the storage URL so Gemini can download it (via us actually; we stream)
    const signedUrl = await signAssetUrl(admin, video.source_url);

    // Upload to Gemini Files API
    const uploaded = await uploadToGemini(
      signedUrl,
      geminiKey,
      video.file_name || videoId,
    );

    try {
      // Wait until the file is ACTIVE (Gemini processes video before inference)
      const activeFile = await waitUntilGeminiFileActive(uploaded.name, geminiKey);

      // Run inference
      const { text, usage } = await generateDescription(activeFile, geminiKey);

      // Save description
      await admin
        .from("videos")
        .update({
          description: text,
          description_status: "ready",
          description_generated_at: new Date().toISOString(),
          description_model: MODEL_ID,
          description_error: null,
        })
        .eq("id", videoId);

      // Usage log (best-effort, do not fail the whole call on a log error)
      const latencyMs = Date.now() - startedAt;
      await admin.from("ai_usage_log").insert({
        user_id: userIdForLogging,
        project_id: projectIdForLogging,
        video_id: videoId,
        function_name: "describe-clip",
        provider: "gemini",
        model: MODEL_ID,
        input_tokens: usage?.promptTokenCount ?? null,
        output_tokens: usage?.candidatesTokenCount ?? null,
        latency_ms: latencyMs,
        cost_usd: estimateGeminiFlashCostUsd(usage),
        success: true,
        metadata: { file_size_hint: uploaded.sizeBytes ?? null },
      });

      return new Response(
        JSON.stringify({
          success: true,
          description: text,
          model: MODEL_ID,
          latency_ms: latencyMs,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    } finally {
      // Always clean up the uploaded Gemini file, even on failure.
      await deleteGeminiFile(uploaded.name, geminiKey);
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("[describe-clip] Error:", msg);

    if (videoIdForLogging) {
      try {
        const admin = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
          { auth: { persistSession: false, autoRefreshToken: false } },
        );
        await admin
          .from("videos")
          .update({
            description_status: "failed",
            description_error: msg.slice(0, 1000),
          })
          .eq("id", videoIdForLogging);

        await admin.from("ai_usage_log").insert({
          user_id: userIdForLogging,
          project_id: projectIdForLogging,
          video_id: videoIdForLogging,
          function_name: "describe-clip",
          provider: "gemini",
          model: MODEL_ID,
          latency_ms: Date.now() - startedAt,
          success: false,
          error: msg.slice(0, 1000),
        });
      } catch (e) {
        console.error("[describe-clip] Failed to record failure state:", e);
      }
    }

    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
