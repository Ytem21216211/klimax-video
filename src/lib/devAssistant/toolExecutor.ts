import { ToolCall, ToolResult } from './types';
import { listFiles, readFile, searchCode } from './projectContext';

export const executeToolCall = async (toolCall: ToolCall): Promise<ToolResult> => {
  const { id, name, arguments: args } = toolCall;

  try {
    switch (name) {
      case 'list_files': {
        const path = args.path || '.';
        const files = listFiles(path);
        
        if (files.length === 0) {
          return {
            toolCallId: id,
            result: `No files found in "${path}". The directory may not exist or may be empty.`
          };
        }
        
        const fileList = files.map(f => {
          const icon = f.type === 'directory' ? '📁' : '📄';
          const summary = f.summary ? ` - ${f.summary}` : '';
          return `${icon} ${f.name}${summary}`;
        }).join('\n');
        
        return {
          toolCallId: id,
          result: `Files in "${path}":\n${fileList}`
        };
      }
      
      case 'read_file': {
        const path = args.path;
        if (!path) {
          return {
            toolCallId: id,
            result: '',
            error: 'File path is required'
          };
        }
        
        const content = await readFile(path);
        return {
          toolCallId: id,
          result: `Content of ${path}:\n\`\`\`\n${content}\n\`\`\``
        };
      }
      
      case 'search_code': {
        const query = args.query;
        if (!query) {
          return {
            toolCallId: id,
            result: '',
            error: 'Search query is required'
          };
        }
        
        const results = searchCode(query);
        
        if (results.length === 0) {
          return {
            toolCallId: id,
            result: `No results found for "${query}"`
          };
        }
        
        const formatted = results.map(r => 
          `📄 ${r.path}\n   ${r.matches.join('\n   ')}`
        ).join('\n\n');
        
        return {
          toolCallId: id,
          result: `Search results for "${query}":\n\n${formatted}`
        };
      }
      
      default:
        return {
          toolCallId: id,
          result: '',
          error: `Unknown tool: ${name}`
        };
    }
  } catch (error) {
    return {
      toolCallId: id,
      result: '',
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
};

export const executeToolCalls = async (toolCalls: ToolCall[]): Promise<ToolResult[]> => {
  return Promise.all(toolCalls.map(executeToolCall));
};

export const formatToolResultsForContext = (results: ToolResult[]): string => {
  return results.map(r => {
    if (r.error) {
      return `Tool Error: ${r.error}`;
    }
    return r.result;
  }).join('\n\n---\n\n');
};
