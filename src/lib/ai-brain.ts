/**
 * BRIDGE FOR THE AI BRAIN
 * Routes the app's chat/agent calls through the local `claude` CLI via the
 * Klimax backend (OpenAI-compatible /v1/chat/completions). No OpenAI key or
 * billing — it uses the Claude installed on this machine.
 */

import { LOCAL_KLIMAX_API } from "@/lib/localKlimaxApi";

export async function callOpenAI(messages: any[], systemPrompt: string, apiKey?: string, tools?: any[], tool_choice?: any) {
    try {
        const apiMessages = [
            { role: "system", content: systemPrompt },
            ...messages.map(m => ({
                role: m.role,
                content: m.content,
                tool_calls: m.tool_calls,
                tool_call_id: m.tool_call_id
            }))
        ];

        const body: any = {
            model: "claude",
            messages: apiMessages,
            temperature: 0.7
        };

        if (tools && tools.length > 0) {
            body.tools = tools;
            if (tool_choice) body.tool_choice = tool_choice;
        }

        const response = await fetch(`${LOCAL_KLIMAX_API}/v1/chat/completions`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(body)
        });

        const data = await response.json();

        if (data.error) {
            throw new Error(`Claude bridge error: ${data.error.message || JSON.stringify(data.error)}`);
        }

        const choice = data.choices[0];
        if (tools && tools.length > 0) {
            return choice.message;
        }

        return choice.message.content;
    } catch (error: any) {
        console.error("OpenAI Bridge Error:", error);
        throw error;
    }
}

// Alias for backward compatibility during migration
export const callGrok = callOpenAI;
