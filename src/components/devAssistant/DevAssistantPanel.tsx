import React, { useState, useRef, useEffect } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Bot, Send, Trash2, RefreshCw, Code, Loader2, ChevronDown, X, Settings, Github, Check, AlertCircle } from 'lucide-react';
import { useDevAssistant } from '@/hooks/useDevAssistant';
import { Message } from '@/lib/devAssistant/types';
import { cn } from '@/lib/utils';
import { useDevAssistantContext } from './DevAssistantProvider';
import { getGitHubConfig, setGitHubConfig, clearGitHubConfig, GitHubConfig } from '@/lib/devAssistant/githubClient';
import { toast } from 'sonner';

interface MessageBubbleProps {
  message: Message;
}

const MessageBubble: React.FC<MessageBubbleProps> = ({ message }) => {
  const isUser = message.role === 'user';
  const [showTools, setShowTools] = useState(false);
  
  return (
    <div className={cn(
      'flex w-full mb-4',
      isUser ? 'justify-end' : 'justify-start'
    )}>
      <div className={cn(
        'max-w-[85%] rounded-lg px-4 py-3',
        isUser 
          ? 'bg-primary text-primary-foreground' 
          : 'bg-muted'
      )}>
        {/* Tool calls indicator */}
        {message.toolCalls && message.toolCalls.length > 0 && (
          <button
            onClick={() => setShowTools(!showTools)}
            className="flex items-center gap-1 text-xs opacity-70 hover:opacity-100 mb-2"
          >
            <Code className="h-3 w-3" />
            {message.toolCalls.length} tool call{message.toolCalls.length > 1 ? 's' : ''}
            <ChevronDown className={cn('h-3 w-3 transition-transform', showTools && 'rotate-180')} />
          </button>
        )}
        
        {/* Tool calls detail */}
        {showTools && message.toolCalls && (
          <div className="mb-2 p-2 rounded bg-background/50 text-xs font-mono space-y-1">
            {message.toolCalls.map((tc, i) => (
              <div key={i} className="opacity-80">
                {tc.name}({JSON.stringify(tc.arguments)})
              </div>
            ))}
          </div>
        )}
        
        {/* Message content */}
        <div className="whitespace-pre-wrap text-sm">
          {message.content.split('```').map((part, index) => {
            if (index % 2 === 1) {
              // Code block
              const lines = part.split('\n');
              const code = lines.slice(1).join('\n') || part;
              return (
                <pre key={index} className="my-2 p-3 rounded bg-background/80 overflow-x-auto">
                  <code className="text-xs font-mono">{code}</code>
                </pre>
              );
            }
            return <span key={index}>{part}</span>;
          })}
        </div>
        
        {/* Timestamp */}
        <div className={cn(
          'text-xs mt-2 opacity-50',
          isUser ? 'text-right' : 'text-left'
        )}>
          {message.timestamp.toLocaleTimeString()}
        </div>
      </div>
    </div>
  );
};

interface GitHubConfigFormProps {
  onSave: () => void;
}

const GitHubConfigForm: React.FC<GitHubConfigFormProps> = ({ onSave }) => {
  const [config, setConfig] = useState<GitHubConfig>(() => 
    getGitHubConfig() || { owner: '', repo: '', branch: 'main' }
  );
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<'success' | 'error' | null>(null);

  const handleTest = async () => {
    if (!config.owner || !config.repo) {
      toast.error('Please enter owner and repo');
      return;
    }

    setTesting(true);
    setTestResult(null);

    try {
      // Temporarily save to test
      setGitHubConfig(config);
      
      const { listFiles } = await import('@/lib/devAssistant/githubClient');
      await listFiles(config, '');
      
      setTestResult('success');
      toast.success('Connection successful!');
    } catch (error) {
      setTestResult('error');
      toast.error(error instanceof Error ? error.message : 'Connection failed');
      clearGitHubConfig();
    } finally {
      setTesting(false);
    }
  };

  const handleSave = () => {
    if (!config.owner || !config.repo) {
      toast.error('Please enter owner and repo');
      return;
    }
    setGitHubConfig(config);
    toast.success('GitHub repository configured!');
    onSave();
  };

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Github className="h-4 w-4" />
        Connect to GitHub Repository
      </div>
      
      <div className="space-y-3">
        <div className="space-y-1">
          <Label htmlFor="owner">Repository Owner</Label>
          <Input
            id="owner"
            placeholder="e.g. yourusername"
            value={config.owner}
            onChange={(e) => setConfig(prev => ({ ...prev, owner: e.target.value }))}
          />
        </div>
        
        <div className="space-y-1">
          <Label htmlFor="repo">Repository Name</Label>
          <Input
            id="repo"
            placeholder="e.g. my-project"
            value={config.repo}
            onChange={(e) => setConfig(prev => ({ ...prev, repo: e.target.value }))}
          />
        </div>
        
        <div className="space-y-1">
          <Label htmlFor="branch">Branch</Label>
          <Input
            id="branch"
            placeholder="main"
            value={config.branch}
            onChange={(e) => setConfig(prev => ({ ...prev, branch: e.target.value }))}
          />
        </div>
      </div>

      <div className="flex gap-2">
        <Button 
          variant="outline" 
          onClick={handleTest} 
          disabled={testing || !config.owner || !config.repo}
          className="flex-1"
        >
          {testing ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : testResult === 'success' ? (
            <Check className="h-4 w-4 mr-2 text-green-500" />
          ) : testResult === 'error' ? (
            <AlertCircle className="h-4 w-4 mr-2 text-red-500" />
          ) : null}
          Test Connection
        </Button>
        
        <Button 
          onClick={handleSave}
          disabled={!config.owner || !config.repo}
          className="flex-1"
        >
          Save
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        Make sure you've added your GitHub Personal Access Token in the project secrets.
      </p>
    </div>
  );
};

export const DevAssistantPanel: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [input, setInput] = useState('');
  const [githubConfigured, setGithubConfigured] = useState(() => !!getGitHubConfig());
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const { disable } = useDevAssistantContext();
  
  const {
    messages,
    isLoading,
    error,
    sendMessage,
    clearHistory,
    refreshProjectContext
  } = useDevAssistant({ apiKey: '' }); // API key handled server-side
  
  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);
  
  // Focus input when opened
  useEffect(() => {
    if (isOpen && inputRef.current && !showSettings) {
      inputRef.current.focus();
    }
  }, [isOpen, showSettings]);

  // Check GitHub config on open
  useEffect(() => {
    if (isOpen) {
      setGithubConfigured(!!getGitHubConfig());
    }
  }, [isOpen]);
  
  const handleSend = () => {
    if (!input.trim() || isLoading) return;
    sendMessage(input);
    setInput('');
  };
  
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleDisconnect = () => {
    clearGitHubConfig();
    setGithubConfigured(false);
    toast.success('GitHub disconnected');
  };
  
  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        <Button
          className="fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-lg z-50"
          size="icon"
        >
          <Bot className="h-6 w-6" />
        </Button>
      </SheetTrigger>
      
      <SheetContent 
        side="right" 
        className="w-full sm:w-[500px] sm:max-w-[500px] p-0 flex flex-col"
      >
        <SheetHeader className="px-4 py-3 border-b">
          <div className="flex items-center justify-between">
            <SheetTitle className="flex items-center gap-2">
              <Bot className="h-5 w-5 text-primary" />
              Dev Assistant
              {githubConfigured && (
                <span className="text-xs bg-primary/20 text-primary px-2 py-0.5 rounded-full">
                  GitHub Connected
                </span>
              )}
            </SheetTitle>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowSettings(!showSettings)}
                title="Settings"
              >
                <Settings className={cn("h-4 w-4", showSettings && "text-primary")} />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={refreshProjectContext}
                title="Refresh project context"
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={clearHistory}
                title="Clear chat history"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={disable}
                title="Disable assistant"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </SheetHeader>
        
        {showSettings ? (
          <div className="flex-1 overflow-auto">
            <GitHubConfigForm onSave={() => {
              setShowSettings(false);
              setGithubConfigured(true);
            }} />
            
            {githubConfigured && (
              <div className="px-4 pb-4">
                <Button 
                  variant="destructive" 
                  size="sm" 
                  onClick={handleDisconnect}
                  className="w-full"
                >
                  Disconnect GitHub
                </Button>
              </div>
            )}
          </div>
        ) : (
          <>
            {/* Messages area */}
            <ScrollArea 
              ref={scrollRef}
              className="flex-1 p-4"
            >
              {!githubConfigured ? (
                <div className="h-full flex flex-col items-center justify-center text-muted-foreground text-center p-4">
                  <Github className="h-12 w-12 mb-4 opacity-50" />
                  <h3 className="font-medium mb-2">Connect to GitHub</h3>
                  <p className="text-sm mb-4">
                    Connect your GitHub repository to enable real file access.
                  </p>
                  <Button onClick={() => setShowSettings(true)}>
                    <Settings className="h-4 w-4 mr-2" />
                    Configure GitHub
                  </Button>
                </div>
              ) : messages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-muted-foreground text-center p-4">
                  <Bot className="h-12 w-12 mb-4 opacity-50" />
                  <h3 className="font-medium mb-2">Dev Assistant Ready</h3>
                  <p className="text-sm">
                    Ask me about your codebase, request code changes, or get help debugging.
                  </p>
                  <div className="mt-4 text-xs opacity-75 space-y-1">
                    <div>Model: nvidia/nemotron-3-nano</div>
                    <div className="text-primary">✓ Real GitHub file access enabled</div>
                  </div>
                </div>
              ) : (
                messages.map((msg) => (
                  <MessageBubble key={msg.id} message={msg} />
                ))
              )}
              
              {isLoading && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm">Thinking...</span>
                </div>
              )}
            </ScrollArea>
            
            {/* Input area */}
            <div className="border-t p-4">
              {error && (
                <div className="mb-2 p-2 rounded bg-destructive/10 text-destructive text-xs">
                  {error}
                </div>
              )}
              
              <div className="flex gap-2">
                <Textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={githubConfigured ? "Ask about your code..." : "Configure GitHub first..."}
                  className="min-h-[60px] max-h-[200px] resize-none"
                  disabled={isLoading || !githubConfigured}
                />
                <Button
                  onClick={handleSend}
                  disabled={!input.trim() || isLoading || !githubConfigured}
                  size="icon"
                  className="h-auto"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
              
              <div className="mt-2 text-xs text-muted-foreground">
                Press Enter to send, Shift+Enter for new line
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
};
