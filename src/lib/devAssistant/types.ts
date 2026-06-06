// Dev Assistant Types

export interface Message {
  id: string;
  role: 'system' | 'user' | 'assistant';
  content: string;
  timestamp: Date;
  toolCalls?: ToolCall[];
  toolResults?: ToolResult[];
}

export interface ToolCall {
  id: string;
  name: 'list_files' | 'read_file' | 'search_code';
  arguments: Record<string, string>;
}

export interface ToolResult {
  toolCallId: string;
  result: string;
  error?: string;
}

export interface FileInfo {
  path: string;
  name: string;
  type: 'file' | 'directory';
  size?: number;
  summary?: string;
}

export interface ProjectIndex {
  structure: FileInfo[];
  summaries: Record<string, string>;
  lastUpdated: Date;
}

export interface ChatSession {
  id: string;
  messages: Message[];
  projectContext: ProjectIndex | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ModelConfig {
  provider: 'openrouter';
  model: string;
  apiKey: string;
  maxTokens?: number;
  temperature?: number;
}

export interface DevAssistantConfig {
  model: ModelConfig;
  systemPrompt: string;
  maxContextFiles: number;
  includeFileTree: boolean;
}

// Tool definitions for the model
export const TOOL_DEFINITIONS = [
  {
    type: 'function',
    function: {
      name: 'list_files',
      description: 'List all files and directories in a given path. Returns file names, types, and sizes.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'The directory path to list. Use "." for root or specify a subdirectory like "src/components"'
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
      description: 'Read the full contents of a specific file. Use this to examine code, configs, or any text file.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'The file path to read, e.g. "src/App.tsx" or "package.json"'
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
      description: 'Search for code patterns, function names, or text across the entire codebase. Returns matching file paths and line snippets.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'The search query - can be a function name, variable, import, or any code pattern'
          }
        },
        required: ['query']
      }
    }
  }
];
