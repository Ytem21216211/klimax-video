import { Message, ModelConfig, TOOL_DEFINITIONS, ToolCall } from './types';

interface OpenRouterResponse {
  id: string;
  choices: {
    message: {
      role: string;
      content: string | null;
      tool_calls?: {
        id: string;
        type: 'function';
        function: {
          name: string;
          arguments: string;
        };
      }[];
    };
    finish_reason: string;
  }[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface ModelClient {
  chat: (messages: Message[], useTools?: boolean) => Promise<{
    content: string | null;
    toolCalls: ToolCall[];
  }>;
}

export const createModelClient = (config: ModelConfig): ModelClient => {
  const { model, apiKey, maxTokens = 8192, temperature = 0.7 } = config;

  const chat = async (messages: Message[], useTools = true) => {
    const formattedMessages = messages.map(msg => ({
      role: msg.role,
      content: msg.content
    }));

    const requestBody: Record<string, unknown> = {
      model,
      messages: formattedMessages,
      max_tokens: maxTokens,
      temperature,
    };

    if (useTools) {
      requestBody.tools = TOOL_DEFINITIONS;
      requestBody.tool_choice = 'auto';
    }

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': window.location.origin,
        'X-Title': 'Dev Assistant'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenRouter API error: ${response.status} - ${errorText}`);
    }

    const data: OpenRouterResponse = await response.json();
    const choice = data.choices[0];

    if (!choice) {
      throw new Error('No response from model');
    }

    const toolCalls: ToolCall[] = [];
    
    if (choice.message.tool_calls) {
      for (const tc of choice.message.tool_calls) {
        try {
          toolCalls.push({
            id: tc.id,
            name: tc.function.name as ToolCall['name'],
            arguments: JSON.parse(tc.function.arguments)
          });
        } catch (e) {
          console.error('Failed to parse tool call arguments:', e);
        }
      }
    }

    return {
      content: choice.message.content,
      toolCalls
    };
  };

  return { chat };
};

// Abstract model layer - can be extended for other providers
export const createEdgeFunctionClient = (supabaseUrl: string): ModelClient => {
  const chat = async (messages: Message[], useTools = true) => {
    const response = await fetch(`${supabaseUrl}/functions/v1/dev-assistant-chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages: messages.map(m => ({ role: m.role, content: m.content })),
        useTools
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Edge function error: ${response.status} - ${errorText}`);
    }

    return response.json();
  };

  return { chat };
};
