import { ToolCall, ToolResult } from './types';
import { 
  getGitHubConfig, 
  listFiles, 
  readFile, 
  searchCode,
  GitHubConfig 
} from './githubClient';

export const executeRealToolCall = async (toolCall: ToolCall): Promise<ToolResult> => {
  const { id, name, arguments: args } = toolCall;

  const config = getGitHubConfig();
  
  if (!config) {
    return {
      toolCallId: id,
      result: '',
      error: 'GitHub repository not configured. Please set up your repository in the Dev Assistant settings.'
    };
  }

  try {
    switch (name) {
      case 'list_files': {
        const path = args.path || '';
        const files = await listFiles(config, path);
        
        if (files.length === 0) {
          return {
            toolCallId: id,
            result: `No files found in "${path || 'root'}". The directory may not exist or may be empty.`
          };
        }
        
        const fileList = files.map(f => {
          const icon = f.type === 'dir' ? '📁' : '📄';
          const size = f.size ? ` (${formatBytes(f.size)})` : '';
          return `${icon} ${f.name}${size}`;
        }).join('\n');
        
        return {
          toolCallId: id,
          result: `Files in "${path || 'root'}":\n${fileList}`
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
        
        const content = await readFile(config, path);
        
        // Truncate very large files
        const maxLength = 15000;
        const truncated = content.length > maxLength;
        const displayContent = truncated 
          ? content.substring(0, maxLength) + '\n\n... [truncated - file too large]'
          : content;
        
        return {
          toolCallId: id,
          result: `Content of ${path}:\n\`\`\`\n${displayContent}\n\`\`\``
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
        
        const results = await searchCode(config, query);
        
        if (results.length === 0) {
          return {
            toolCallId: id,
            result: `No results found for "${query}"`
          };
        }
        
        const formatted = results.slice(0, 10).map(r => 
          `📄 ${r.path}\n${r.matches.map(m => `   ...${m}...`).join('\n')}`
        ).join('\n\n');
        
        return {
          toolCallId: id,
          result: `Search results for "${query}" (showing ${Math.min(results.length, 10)} of ${results.length}):\n\n${formatted}`
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
    console.error(`Tool execution error for ${name}:`, error);
    return {
      toolCallId: id,
      result: '',
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
};

export const executeRealToolCalls = async (toolCalls: ToolCall[]): Promise<ToolResult[]> => {
  return Promise.all(toolCalls.map(executeRealToolCall));
};

export const formatToolResultsForContext = (results: ToolResult[]): string => {
  return results.map(r => {
    if (r.error) {
      return `Tool Error: ${r.error}`;
    }
    return r.result;
  }).join('\n\n---\n\n');
};

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export const isGitHubConfigured = (): boolean => {
  return getGitHubConfig() !== null;
};
