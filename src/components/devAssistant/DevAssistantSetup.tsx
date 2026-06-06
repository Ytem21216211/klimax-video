import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Bot } from 'lucide-react';
import { useDevAssistantContext } from './DevAssistantProvider';

export const DevAssistantSetup: React.FC = () => {
  const { enable, isEnabled, disable } = useDevAssistantContext();

  if (isEnabled) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground flex items-center gap-1">
          <Bot className="h-4 w-4" />
          Dev Assistant Active
        </span>
        <Button variant="ghost" size="sm" onClick={disable}>
          Disable
        </Button>
      </div>
    );
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bot className="h-5 w-5" />
          Dev Assistant
        </CardTitle>
        <CardDescription>
          AI-powered coding assistant for your project. Uses qwen/qwen3-coder-480b-a35b via OpenRouter.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button onClick={enable} className="w-full">
          Enable Dev Assistant
        </Button>
      </CardContent>
    </Card>
  );
};
