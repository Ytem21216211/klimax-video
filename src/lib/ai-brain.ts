/**
 * BRIDGE FOR OPENAI
 * Replaced Grok/ElevenLabs with GPT-4o and OpenAI TTS.
 */

const OPENAI_API_KEY = "sk-...."; // Should be in env.VITE_OPENAI_API_KEY

export async function callOpenAI(messages: any[], systemPrompt: string, apiKey?: string, tools?: any[], tool_choice?: any) {
    try {
        const aiKey = apiKey || import.meta.env.VITE_OPENAI_API_KEY || OPENAI_API_KEY;

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
            model: "gpt-4o",
            messages: apiMessages,
            temperature: 0.7
        };

        if (tools && tools.length > 0) {
            body.tools = tools;
            if (tool_choice) body.tool_choice = tool_choice;
        }

        const response = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${aiKey}`
            },
            body: JSON.stringify(body)
        });

        const data = await response.json();

        if (data.error) {
            throw new Error(`OpenAI API Error: ${data.error.message || JSON.stringify(data.error)}`);
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
