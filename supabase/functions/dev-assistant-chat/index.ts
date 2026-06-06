import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TOOL_DEFINITIONS = [
  {
    type: 'function',
    function: {
      name: 'list_files',
      description: 'List all files and directories in a given path.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'The directory path to list'
          }
        },
        required: ['path']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Read the full contents of a specific file.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'The file path to read'
          }
        },
        required: ['path']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'search_code',
      description: 'Search for code patterns across the codebase.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'The search query'
          }
        },
        required: ['query']
      }
    }
  }
];

// Helper function to make API call with retries
async function callOpenRouterWithRetry(
  requestBody: Record<string, unknown>,
  apiKey: string,
  maxRetries = 3
): Promise<Response> {
  const lastError: Error | null = null;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://mine-edit-ai.lovable.app",
        "X-Title": "Dev Assistant",
      },
      body: JSON.stringify(requestBody),
    });
    
    if (response.ok) {
      return response;
    }
    
    // If rate limited, wait and retry
    if (response.status === 429 && attempt < maxRetries - 1) {
      const waitTime = Math.pow(2, attempt + 1) * 1000; // 2s, 4s, 8s
      console.log(`Rate limited, waiting ${waitTime}ms before retry ${attempt + 1}/${maxRetries}`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      continue;
    }
    
    // For other errors or final retry, return the response
    return response;
  }
  
  throw lastError || new Error("Max retries exceeded");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY");
    if (!OPENROUTER_API_KEY) {
      throw new Error("OPENROUTER_API_KEY is not configured");
    }

    const { messages, useTools = true, model = "nvidia/nemotron-3-nano-30b-a3b:free" } = await req.json();

    const requestBody: Record<string, unknown> = {
      model,
      messages,
      max_tokens: 8192,
      temperature: 0.7,
    };

    if (useTools) {
      requestBody.tools = TOOL_DEFINITIONS;
      requestBody.tool_choice = "auto";
    }

    const response = await callOpenRouterWithRetry(requestBody, OPENROUTER_API_KEY);

    if (!response.ok) {
      const errorText = await response.text();
      console.error("OpenRouter error after retries:", response.status, errorText);
      
      // Parse error for better user feedback
      let userMessage = `OpenRouter API error: ${response.status}`;
      try {
        const errorData = JSON.parse(errorText);
        if (response.status === 429) {
          userMessage = "The free model is rate-limited. Please wait 30 seconds and try again.";
        } else if (errorData.error?.message) {
          userMessage = errorData.error.message;
        }
      } catch {
        // Keep default message
      }
      
      return new Response(
        JSON.stringify({ error: userMessage }),
        { 
          status: response.status, 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        }
      );
    }

    const data = await response.json();
    const choice = data.choices?.[0];

    if (!choice) {
      throw new Error("No response from model");
    }

    const toolCalls = choice.message.tool_calls?.map((tc: any) => ({
      id: tc.id,
      name: tc.function.name,
      arguments: JSON.parse(tc.function.arguments || "{}")
    })) || [];

    return new Response(
      JSON.stringify({
        content: choice.message.content,
        toolCalls,
        usage: data.usage
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Dev assistant chat error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
