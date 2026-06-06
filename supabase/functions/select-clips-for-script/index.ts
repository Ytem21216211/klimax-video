// ============================================================================
// select-clips-for-script
// Given timed script segments and a pool of clips (with descriptions),
// returns a mapping: which clip plays during which segment.
//
// This is the function that actually fixes the "random clip placement"
// problem. It is called from process-video right after
// analyze-sentence-boundaries produces the segment timeline.
//
// Input:
//   {
//     segments: [{ index, startSec, endSec, text }],
//     clips:    [{ videoId, fileName, duration, description }],
//     creativeMode?: boolean
//   }
// Output on success:
//   {
//     success: true,
//     model: 'gemini-2.5-pro',
//     mapping: [{ segmentIndex, videoId, reason }]
//   }
// Output on failure:
//   { success: false, error: '...', fallback: true }
// (The caller is expected to fall back to the current random ordering.)
// ============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MODEL_ID = "gpt-4o";
const GENERATION_TIMEOUT_MS = 60_000;

interface Segment {
  index: number;
  startSec: number;
  endSec: number;
  text: string;
}

interface Clip {
  videoId: string;
  fileName?: string | null;
  duration?: number | null;
  description?: string | null;
  status?: string | null;
}

interface SelectionItem {
  segmentIndex: number;
  videoId: string;
  reason?: string;
}

function buildPrompt(segments: Segment[], clips: Clip[], creativeMode: boolean): string {
  const segmentLines = segments
    .map(
      (s) =>
        `  [Seg ${s.index}] "${s.text.trim()}"`,
    )
    .join("\n");

  const clipLines = clips
    .map((c) => {
      const type = c.status === 'edited' ? '[MANUAL/RE-WRITTEN]' : '[AI-GENERATED]';
      const desc = (c.description || "(no description)").replace(/\s+/g, " ").trim();
      return `  ID: ${c.videoId} ${type}: ${desc}`;
    })
    .join("\n");

  const reuseNote =
    segments.length > clips.length
      ? "Note: Segments > Clips. You MUST reuse clips. Avoid reusing the same clip for two consecutive segments."
      : "Note: Clips >= Segments. Prefer using each clip only once.";

  const creativeNote = creativeMode
    ? "MODE: CREATIVE. Look for metaphorical or high-energy matches that capture the 'vibe' even if keywords don't match exactly."
    : "MODE: LITERAL. Prioritize direct keyword and action matching.";

  return `You are a high-end video editor for a viral Minecraft channel. Your task is to map video clips to specific voiceover segments with extreme precision.

VOICEOVER SEGMENTS:
${segmentLines}

AVAILABLE CLIP POOL:
${clipLines}

CRITICAL INSTRUCTIONS:
1. MATCHING PRIORITY: Clips marked [MANUAL/RE-WRITTEN] are provided by the user and are 100% accurate. You MUST prioritize matching these to the most relevant segments.
2. ANALYZE INTENT: Don't just match keywords. Analyze the action described in the clip (e.g., "Parkour over lava") and match it to the intensity of the spoken words.
3. VISUAL COHERENCE: If a segment is part of a list (e.g., "First... Second... Third..."), try to pick clips that feel part of the same "set" or location if descriptions allow.
4. ${reuseNote}
5. ${creativeNote}
6. If a clip description is vague, use it for generic bridge segments (e.g., "And that's not all" or "Check this out").
7. Map EVERY segment index to exactly one videoId.

Return perfectly formatted JSON: { "assignments": [{ "segmentIndex": 0, "videoId": "...", "reason": "..." }] }`;
}

async function callGrok(prompt: string, apiKey: string) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), GENERATION_TIMEOUT_MS);

  try {
    const resp = await fetch(
      `https://api.openai.com/v1/chat/completions`,
      {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: MODEL_ID,
          messages: [{ role: "user", content: prompt }],
          temperature: 0.3,
          response_format: { type: "json_object" }
        }),
        signal: controller.signal,
      },
    );

    const json = await resp.json();
    if (!resp.ok || json.error) {
      throw new Error(`Grok API failed: ${resp.status} ${json.error?.message || "unknown"}`);
    }

    const text = json.choices?.[0]?.message?.content || "";
    if (!text) throw new Error("Grok returned empty content");

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (_e) {
      throw new Error(`Grok returned non-JSON output: ${text.slice(0, 200)}`);
    }

    return {
      parsed,
      usage: {
        promptTokenCount: json.usage?.prompt_tokens,
        candidatesTokenCount: json.usage?.completion_tokens
      },
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

function validateMapping(
  parsed: unknown,
  segments: Segment[],
  clips: Clip[],
): { ok: true; mapping: SelectionItem[] } | { ok: false; error: string } {
  if (!parsed || typeof parsed !== "object" || !("assignments" in parsed)) {
    return { ok: false, error: "Missing 'assignments' field in model output" };
  }
  const assignments = (parsed as { assignments: unknown }).assignments;
  if (!Array.isArray(assignments)) {
    return { ok: false, error: "'assignments' is not an array" };
  }

  const clipIds = new Set(clips.map((c) => c.videoId));
  const seenSegments = new Set<number>();
  const result: SelectionItem[] = [];

  for (const a of assignments as SelectionItem[]) {
    if (typeof a?.segmentIndex !== "number") {
      return { ok: false, error: "An assignment is missing segmentIndex" };
    }
    if (typeof a?.videoId !== "string") {
      return { ok: false, error: `Assignment for segment ${a?.segmentIndex} is missing videoId` };
    }
    if (!clipIds.has(a.videoId)) {
      return { ok: false, error: `Assignment references unknown videoId ${a.videoId}` };
    }
    if (seenSegments.has(a.segmentIndex)) {
      return { ok: false, error: `Segment ${a.segmentIndex} assigned more than once` };
    }
    seenSegments.add(a.segmentIndex);
    result.push({
      segmentIndex: a.segmentIndex,
      videoId: a.videoId,
      reason: typeof a.reason === "string" ? a.reason.slice(0, 200) : undefined,
    });
  }

  // Every segment must be covered
  const requiredIndices = new Set(segments.map((s) => s.index));
  for (const idx of requiredIndices) {
    if (!seenSegments.has(idx)) {
      return { ok: false, error: `Segment ${idx} was not assigned` };
    }
  }

  // Sort by segment index for stability
  result.sort((a, b) => a.segmentIndex - b.segmentIndex);
  return { ok: true, mapping: result };
}

function estimateGeminiProCostUsd(usage?: {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
}): number {
  if (!usage) return 0;
  // gemini-2.5-pro pricing snapshot (input $1.25, output $5.00 per 1M tokens).
  const inTok = usage.promptTokenCount || 0;
  const outTok = usage.candidatesTokenCount || 0;
  return (inTok / 1_000_000) * 1.25 + (outTok / 1_000_000) * 5.0;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startedAt = Date.now();

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const openaiKey = Deno.env.get("OPENAI_API_KEY");

    if (!openaiKey) {
      return new Response(
        JSON.stringify({ success: false, error: "OPENAI_API_KEY not configured", fallback: true }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const body = await req.json().catch(() => ({}));
    const segments = (body?.segments || []) as Segment[];
    const clips = (body?.clips || []) as Clip[];
    const creativeMode = Boolean(body?.creativeMode);
    const projectId = body?.projectId as string | undefined;

    // Basic validation
    if (!Array.isArray(segments) || segments.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: "No segments provided", fallback: true }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (!Array.isArray(clips) || clips.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: "No clips provided", fallback: true }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Guard: if too few clips have descriptions, abort so caller falls back.
    const described = clips.filter((c) => c.description && c.description.trim().length > 0);
    if (described.length < clips.length * 0.5) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `Only ${described.length} of ${clips.length} clips have descriptions; skipping intelligent selection`,
          fallback: true,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const prompt = buildPrompt(segments, clips, creativeMode);
    const { parsed, usage } = await callGrok(prompt, openaiKey || '');

    const validated = validateMapping(parsed, segments, clips);
    if (!validated.ok) {
      // Log the failure and ask caller to fall back.
      const admin = createClient(supabaseUrl, serviceKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      await admin.from("ai_usage_log").insert({
        project_id: projectId || null,
        function_name: "select-clips-for-script",
        provider: "openai",
        model: MODEL_ID,
        input_tokens: usage?.promptTokenCount ?? null,
        output_tokens: usage?.candidatesTokenCount ?? null,
        latency_ms: Date.now() - startedAt,
        cost_usd: estimateGeminiProCostUsd(usage),
        success: false,
        error: validated.error.slice(0, 1000),
        metadata: { segments: segments.length, clips: clips.length },
      });
      return new Response(
        JSON.stringify({ success: false, error: validated.error, fallback: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Success: log usage + return mapping.
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    await admin.from("ai_usage_log").insert({
      project_id: projectId || null,
      function_name: "select-clips-for-script",
      provider: "gemini",
      model: MODEL_ID,
      input_tokens: usage?.promptTokenCount ?? null,
      output_tokens: usage?.candidatesTokenCount ?? null,
      latency_ms: Date.now() - startedAt,
      cost_usd: estimateGeminiProCostUsd(usage),
      success: true,
      metadata: {
        segments: segments.length,
        clips: clips.length,
        creativeMode,
        // Full audit trail for debugging clip-selection quality
        segments_payload: segments.map((s) => ({
          index: s.index,
          text: s.text.slice(0, 200),
        })),
        clips_payload: clips.map((c) => ({
          videoId: c.videoId,
          fileName: c.fileName,
          description: (c.description || "").slice(0, 200),
        })),
        mapping: validated.mapping,
      },
    });

    return new Response(
      JSON.stringify({
        success: true,
        model: MODEL_ID,
        mapping: validated.mapping,
        latency_ms: Date.now() - startedAt,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("[select-clips-for-script] Error:", msg);
    return new Response(
      JSON.stringify({ success: false, error: msg, fallback: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
