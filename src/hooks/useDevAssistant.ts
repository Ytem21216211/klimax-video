import { useState, useCallback, useEffect } from 'react';
import { Message, ChatSession, ToolResult } from '@/lib/devAssistant/types';
import { DEV_ASSISTANT_SYSTEM_PROMPT, buildContextPrompt } from '@/lib/devAssistant/systemPrompt';
import { executeRealToolCalls, formatToolResultsForContext, isGitHubConfigured } from '@/lib/devAssistant/realToolExecutor';
import { getGitHubConfig, getRepoTree, buildFileTreeString } from '@/lib/devAssistant/githubClient';
import { supabase } from '@/integrations/supabase/client';

const STORAGE_KEY = 'dev-assistant-session';

const generateId = () => Math.random().toString(36).substring(2, 15);

interface UseDevAssistantOptions {
  apiKey: string;
  model?: string;
}

// API call through edge function (secure)
const callEdgeFunction = async (messages: { role: string; content: string }[], useTools = true) => {
  const { data, error } = await supabase.functions.invoke('dev-assistant-chat', {
    body: { messages, useTools, model: 'nvidia/nemotron-3-nano-30b-a3b:free' }
  });
  
  if (error) throw new Error(error.message);
  if (data.error) throw new Error(data.error);
  
  return {
    content: data.content,
    toolCalls: data.toolCalls || []
  };
};

export const useDevAssistant = (options: UseDevAssistantOptions) => {
  const { apiKey: _apiKey, model: _model = 'nvidia/nemotron-3-nano-30b-a3b:free' } = options;
  
  const [session, setSession] = useState<ChatSession>(() => {
    // Try to load from localStorage
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return {
          ...parsed,
          createdAt: new Date(parsed.createdAt),
          updatedAt: new Date(parsed.updatedAt),
          messages: parsed.messages.map((m: Message) => ({
            ...m,
            timestamp: new Date(m.timestamp)
          }))
        };
      } catch (e) {
        console.error('Failed to parse saved session:', e);
      }
    }
    
    return {
      id: generateId(),
      messages: [],
      projectContext: null,
      createdAt: new Date(),
      updatedAt: new Date()
    };
  });
  
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileTree, setFileTree] = useState<string>('');
  
  // Save session to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  }, [session]);
  
  // Load file tree from GitHub when configured
  const loadFileTree = useCallback(async () => {
    const config = getGitHubConfig();
    if (!config) {
      setFileTree('');
      return;
    }
    
    try {
      const tree = await getRepoTree(config);
      const treeString = buildFileTreeString(tree);
      setFileTree(treeString);
    } catch (err) {
      console.error('Failed to load file tree:', err);
      setFileTree('Failed to load file tree');
    }
  }, []);
  
  // Load file tree on mount if GitHub is configured
  useEffect(() => {
    if (isGitHubConfigured()) {
      loadFileTree();
    }
  }, [loadFileTree]);
  
  const addMessage = useCallback((message: Omit<Message, 'id' | 'timestamp'>) => {
    const newMessage: Message = {
      ...message,
      id: generateId(),
      timestamp: new Date()
    };
    
    setSession(prev => ({
      ...prev,
      messages: [...prev.messages, newMessage],
      updatedAt: new Date()
    }));
    
    return newMessage;
  }, []);
  
  const sendMessage = useCallback(async (content: string) => {
    if (!content.trim() || isLoading) return;
    
    if (!isGitHubConfigured()) {
      setError('GitHub repository not configured. Please set up your repository first.');
      return;
    }
    
    setError(null);
    setIsLoading(true);
    
    // Add user message
    const userMessage = addMessage({ role: 'user', content });
    
    try {
      // Build context with real file tree
      const contextPrompt = buildContextPrompt(fileTree || 'Loading...', []);
      const systemMessage: Message = {
        id: 'system',
        role: 'system',
        content: DEV_ASSISTANT_SYSTEM_PROMPT + '\n\n' + contextPrompt,
        timestamp: new Date()
      };
      
      const conversationMessages = [
        systemMessage,
        ...session.messages.filter(m => m.role !== 'system'),
        userMessage
      ].map(m => ({ role: m.role, content: m.content }));
      
      // First API call using edge function
      let response = await callEdgeFunction(conversationMessages, true);
      
      // Handle tool calls with REAL GitHub data
      let toolResults: ToolResult[] = [];
      let allToolCalls = [...response.toolCalls];
      let iterations = 0;
      const maxIterations = 5;
      
      while (response.toolCalls.length > 0 && iterations < maxIterations) {
        iterations++;
        
        // Execute tools with real GitHub API
        const results = await executeRealToolCalls(response.toolCalls);
        toolResults = [...toolResults, ...results];
        
        // Build a cleaner tool results message for the model
        const toolResultsContent = formatToolResultsForContext(results);
        
        // Build the continuation messages with clearer structure
        // The model needs the assistant's tool call as part of the conversation
        const continueMessages = [
          ...conversationMessages,
          {
            role: 'assistant' as const,
            content: response.content || `I'll use tools to help answer this. Here's what I found:`
          },
          {
            role: 'user' as const,
            content: `Here are the tool results:\n\n${toolResultsContent}\n\nBased on these results, please provide your answer. If you found what was needed, explain the solution. If you need more information, use another tool.`
          }
        ];
        
        // Call without tools on final iteration to force a response
        const useToolsOnThisCall = iterations < maxIterations - 1;
        response = await callEdgeFunction(continueMessages, useToolsOnThisCall);
        
        if (response.toolCalls.length > 0) {
          allToolCalls = [...allToolCalls, ...response.toolCalls];
        }
      }
      
      // Add assistant response
      const finalContent = response.content || 
        (toolResults.length > 0 
          ? `Based on my search, here's what I found:\n\n${formatToolResultsForContext(toolResults)}\n\nPlease let me know if you need me to look at specific files.`
          : 'I apologize, but I was unable to generate a response. Please try rephrasing your question.');
      
      addMessage({
        role: 'assistant',
        content: finalContent,
        toolCalls: allToolCalls.length > 0 ? allToolCalls : undefined,
        toolResults: toolResults.length > 0 ? toolResults : undefined
      });
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred';
      setError(errorMessage);
      
      addMessage({
        role: 'assistant',
        content: `⚠️ Error: ${errorMessage}\n\nPlease check your configuration and try again.`
      });
    } finally {
      setIsLoading(false);
    }
  }, [session.messages, fileTree, isLoading, addMessage]);
  
  const clearHistory = useCallback(() => {
    setSession({
      id: generateId(),
      messages: [],
      projectContext: null,
      createdAt: new Date(),
      updatedAt: new Date()
    });
    setError(null);
  }, []);
  
  const refreshProjectContext = useCallback(() => {
    loadFileTree();
  }, [loadFileTree]);
  
  return {
    messages: session.messages,
    isLoading,
    error,
    sendMessage,
    clearHistory,
    refreshProjectContext,
    projectContext: session.projectContext
  };
};
