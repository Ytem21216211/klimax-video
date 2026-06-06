import { createOpenAI } from '@ai-sdk/openai';
import { streamText, tool } from 'ai';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';

// Vercel Edge Runtime Configuration
export const runtime = 'edge';
export const maxDuration = 60;

// Grok (xAI) Configuration
const xai = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Resolute Env Discovery
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 
                    process.env.VITE_SUPABASE_PUBLISHABLE_KEY || 
                    process.env.VITE_SUPABASE_ANON_KEY || 
                    process.env.SUPABASE_ANON_KEY || '';

const supabase = createClient(supabaseUrl, supabaseKey);

const SYSTEM_PROMPT = `YOU ARE THE GROK BRAIN FOR AUTONOMOUS VIDEO MARKETING AGENTS. 
Your mission: Analyze campaign diagnostics and autonomously adjust settings to optimize performance.

## Operational Protocol: ReAct (Reason -> Act -> Observe)
1. **Thought**: Explicitly reason about the metrics (Retention, Views, etc.).
2. **Action**: Execute one or more tools to manipulate the project database.
3. **Observation**: Read the database confirmation from the tool.
4. **Final Result**: You MUST conclude with a session titled "NEURAL EXECUTION REPORT".

## The Neural Execution Report
This report must be a Markdown section containing:
- A brief summary of the campaign status.
- A **Markdown Table** listing all technical changes made (Field, Old Value, New Value).
- A **Strategic Hypothesis** for why these changes will improve retention.

## Constraints
- Do not use placeholders. Use the data provided.
- If retention is below 40%, ALWAYS engage "Lab Mode" experiments.
- Be precise with Subtitle Font and Voice IDs.`;

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { projectId, metrics, messages, agentId, userId } = body;

        if (!projectId) throw new Error("Missing projectId in request body");

        const corePrompt = `
      CURRENT CAMPAIGN DIAGNOSTICS:
      - Project ID: ${projectId}
      - User ID: ${userId || 'N/A'}
      - Retention: ${metrics?.retention || 0}%
      - Daily Views: ${metrics?.daily_views || 0}
      - Current Settings: ${JSON.stringify(metrics?.settings || {})}
      
      Begin optimization loop.
    `;

        const result = await streamText({
            model: xai('grok-4-3'), 
            system: SYSTEM_PROMPT,
            messages: [
                { role: 'user', content: corePrompt },
                ...(messages || [])
            ],
            maxSteps: 10,
            onFinish: async ({ text }) => {
                // PERSISTENCE: Save this optimization run to the Chat History with the specific UserId
                if (projectId && (agentId || projectId) && userId) {
                    try {
                        let targetAgentId = agentId;
                        if (!targetAgentId) {
                            const { data: node } = await supabase
                                .from('agentik_whiteboard_nodes')
                                .select('id')
                                .eq('type', 'agent')
                                .limit(1)
                                .single();
                            targetAgentId = node?.id;
                        }

                        if (targetAgentId) {
                            // Insert with Service Role to bypass RLS, but associate with real User ID
                            const { error } = await supabase.from('agentik_chat_messages').insert({
                                agent_id: targetAgentId,
                                user_id: userId,
                                role: 'assistant',
                                content: text
                            });
                            
                            if (error) console.error("Database Save Failure:", error.message);
                            else console.log("Strategic Insight Persisted for User:", userId);
                        }
                    } catch (e) {
                        console.error("Failed to persist optimization insight:", e);
                    }
                }
            },
            tools: {
                generate_video: tool({
                    description: 'Trigger the standard production render for a project.',
                    parameters: z.object({
                        projectId: z.string(),
                    }),
                    execute: async ({ projectId }) => {
                        try {
                            const { error: updateError } = await supabase
                                .from('projects')
                                .update({ status: 'processing', render_progress: 5, last_error: null })
                                .eq('id', projectId);

                            if (updateError) return `ERROR: Update failed. ${updateError.message}`;

                            const { data: project } = await supabase.from('projects').select('*').eq('id', projectId).single();
                            if (!project) return "ERROR: Project not found.";

                            const { error: invokeError } = await supabase.functions.invoke('process-video', {
                                body: {
                                    projectId,
                                    subtitleSettings: project.subtitle_settings,
                                    aspectRatio: project.aspect_ratio || '9:16',
                                    musicSettings: project.music_settings,
                                    voiceId: project.voice_id,
                                    regenerateScript: true
                                }
                            });

                            if (invokeError) return `ERROR: Function call failed. ${invokeError.message}`;
                            return "SUCCESS: Production render sequence initiated.";
                        } catch (e: any) { return `ERROR: Exception. ${e.message}`; }
                    },
                }),

                generate_lab_videos: tool({
                    description: 'Trigger experimental video generation in Lab Mode.',
                    parameters: z.object({
                        projectId: z.string(),
                        experimentCount: z.number().default(3),
                    }),
                    execute: async ({ projectId, experimentCount }) => {
                        const { data, error } = await supabase.functions.invoke('generate-lab-videos', {
                            body: { projectId, experimentCount }
                        });
                        if (error) return `ERROR: Lab invocation failed. ${error.message}`;
                        return `SUCCESS: ${experimentCount} experimental renders queued. Hypothesis: ${data?.hypothesis || 'Algorithm variance'}`;
                    },
                }),

                toggle_lab_mode: tool({
                    description: 'Enable or disable AI Lab mode for a project.',
                    parameters: z.object({
                        projectId: z.string(),
                        enabled: z.boolean(),
                    }),
                    execute: async ({ projectId, enabled }) => {
                        const { error } = await supabase
                            .from('projects')
                            .update({ lab_enabled: enabled })
                            .eq('id', projectId);
                        if (error) return `ERROR: ${error.message}`;
                        return `SUCCESS: Lab Mode set to ${enabled ? 'ENABLED' : 'DISABLED'}.`;
                    },
                }),

                update_subtitle_settings: tool({
                    description: 'Update aesthetic settings for subtitles.',
                    parameters: z.object({
                        projectId: z.string(),
                        settings: z.object({
                            fontFamily: z.string().optional(),
                            fontSize: z.number().optional(),
                            transition: z.string().optional(),
                        }),
                    }),
                    execute: async ({ projectId, settings }) => {
                        const { data: project } = await supabase.from('projects').select('subtitle_settings').eq('id', projectId).single();
                        const current = (project?.subtitle_settings as any) || {};
                        const updated = { ...current, ...settings };
                        const { error } = await supabase.from('projects').update({ subtitle_settings: updated }).eq('id', projectId);
                        if (error) return `ERROR: ${error.message}`;
                        return `SUCCESS: Subtitle attributes updated for project ${projectId}.`;
                    },
                }),

                update_voice: tool({
                    description: 'Change the project AI Voice.',
                    parameters: z.object({
                        projectId: z.string(),
                        voiceId: z.string(),
                    }),
                    execute: async ({ projectId, voiceId }) => {
                        const { error } = await supabase
                            .from('projects')
                            .update({ voice_id: voiceId } as any)
                            .eq('id', projectId);
                        if (error) return `ERROR: Database rejection. ${error.message}`;
                        return `SUCCESS: Project ID ${projectId} migrated to Voice ID: ${voiceId}.`;
                    },
                }),
            },
        });

        // Adaptive Response Negotiator (Neural Bridge V2)
        const res = result as any;
        if (res && typeof res.toDataStreamResponse === 'function') {
            return res.toDataStreamResponse();
        } 
        if (res && typeof res.toAIStreamResponse === 'function') {
            return res.toAIStreamResponse();
        }
        if (res && res.fullStream) {
            return new Response(res.fullStream, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
        }
        
        // Final Fallback: Attempt to reconstruct object keys for visual debugging if all fail
        const keys = res ? Object.keys(res).join(', ') : 'null';
        throw new Error(`Incompatible AI SDK Version. Available methods: [${keys}]. Expected toDataStreamResponse.`);

    } catch (error: any) {
        console.error("Neural Agent Crash:", error);
        return new Response(JSON.stringify({ 
            error: "Neural Agent Crash", 
            details: error.message,
            diagnostic_keys: (result as any) ? Object.keys(result as any) : []
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
}
