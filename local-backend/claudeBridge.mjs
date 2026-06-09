// OpenAI-compatible chat-completions endpoint backed by the local `claude` CLI.
// Lets the Klimax front-end's AI brain run on Claude (the CLI authenticated on
// this machine) instead of the OpenAI API — no API key, no per-call billing.
//
// Mounted at POST /v1/chat/completions by server.mjs. Accepts the subset of the
// OpenAI chat body the app sends ({ messages, tools, tool_choice, temperature })
// and returns an OpenAI-shaped { choices: [{ message }] }. Tool/function calling
// is emulated: Claude is asked to emit a JSON tool_call which we translate back
// into OpenAI's tool_calls structure.

import { spawn } from "node:child_process";

const CLAUDE_BIN = process.env.KLIMAX_CLAUDE_BIN || "claude";
const CLAUDE_MODEL = process.env.KLIMAX_CLAUDE_MODEL || "sonnet";
const CLAUDE_TIMEOUT_MS = Number(process.env.KLIMAX_CLAUDE_TIMEOUT_MS || 120000);

export function runClaude(prompt, systemPrompt) {
  return new Promise((resolve, reject) => {
    const args = ["-p", prompt, "--output-format", "json", "--model", CLAUDE_MODEL];
    if (systemPrompt) args.push("--append-system-prompt", systemPrompt);
    // Run from a neutral cwd so the CLI doesn't load the project's CLAUDE.md / tools.
    const child = spawn(CLAUDE_BIN, args, { cwd: "/tmp", env: process.env });
    let out = "";
    let err = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`claude timed out after ${CLAUDE_TIMEOUT_MS}ms`));
    }, CLAUDE_TIMEOUT_MS);
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) return reject(new Error(`claude exited ${code}: ${(err || out).slice(0, 400)}`));
      try {
        const json = JSON.parse(out);
        resolve(typeof json.result === "string" ? json.result : "");
      } catch (e) {
        reject(new Error(`could not parse claude output: ${e.message}; raw: ${out.slice(0, 200)}`));
      }
    });
  });
}

function buildPrompt(messages) {
  const lines = [];
  for (const m of messages) {
    if (m.role === "system") continue; // sent via --append-system-prompt
    if (m.role === "user") {
      lines.push(`User: ${typeof m.content === "string" ? m.content : JSON.stringify(m.content)}`);
    } else if (m.role === "assistant") {
      if (m.tool_calls && m.tool_calls.length) {
        lines.push(`Assistant (requested tool): ${JSON.stringify(m.tool_calls)}`);
      } else if (m.content) {
        lines.push(`Assistant: ${m.content}`);
      }
    } else if (m.role === "tool") {
      lines.push(`Result of tool call ${m.tool_call_id || ""}: ${m.content}`);
    }
  }
  lines.push("Assistant:");
  return lines.join("\n\n");
}

function extractToolCall(text) {
  // Find a JSON object mentioning "tool_call". Tolerate surrounding prose / fences.
  const fenced = text.replace(/```json|```/g, "");
  const idx = fenced.indexOf('"tool_call"');
  if (idx === -1) return null;
  // Walk back to the opening brace, forward to the matching close.
  let start = fenced.lastIndexOf("{", idx);
  while (start !== -1) {
    let depth = 0;
    for (let i = start; i < fenced.length; i++) {
      if (fenced[i] === "{") depth++;
      else if (fenced[i] === "}") {
        depth--;
        if (depth === 0) {
          try {
            const parsed = JSON.parse(fenced.slice(start, i + 1));
            if (parsed && parsed.tool_call && parsed.tool_call.name) return parsed.tool_call;
          } catch {
            /* keep scanning */
          }
          break;
        }
      }
    }
    start = fenced.lastIndexOf("{", start - 1);
  }
  return null;
}

export async function claudeChatHandler(req, res) {
  try {
    const { messages = [], tools } = req.body || {};
    const sysMsg = messages.find((m) => m.role === "system");
    let system = sysMsg && typeof sysMsg.content === "string" ? sysMsg.content : "";

    const hasTools = Array.isArray(tools) && tools.length > 0;
    if (hasTools) {
      const defs = tools.map((t) => (t.function ? t.function : t));
      system +=
        `\n\n# Tool use\nYou can call the following tools (JSON schemas): ${JSON.stringify(defs)}.\n` +
        `When and only when you need a tool, reply with ONLY a single JSON object, no prose, no markdown fences:\n` +
        `{"tool_call": {"name": "<tool_name>", "arguments": { ...matching the schema... }}}\n` +
        `Otherwise, answer the user directly in plain text.`;
    }

    const prompt = buildPrompt(messages);
    const result = await runClaude(prompt, system);

    const toolCall = hasTools ? extractToolCall(result) : null;
    let message;
    if (toolCall) {
      message = {
        role: "assistant",
        content: null,
        tool_calls: [
          {
            id: "call_" + Math.random().toString(36).slice(2, 14),
            type: "function",
            function: {
              name: toolCall.name,
              arguments: JSON.stringify(toolCall.arguments || {}),
            },
          },
        ],
      };
    } else {
      message = { role: "assistant", content: result };
    }

    res.json({
      id: "chatcmpl-claude-" + Date.now(),
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: "claude/" + CLAUDE_MODEL,
      choices: [{ index: 0, message, finish_reason: toolCall ? "tool_calls" : "stop" }],
      usage: {},
    });
  } catch (e) {
    console.error("[claude-bridge]", e.message);
    res.status(500).json({ error: { message: e.message, type: "claude_bridge_error" } });
  }
}
