import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Youtube, Link2, Unlink, ExternalLink, Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

interface YouTubeSettings {
  enabled: boolean;
  channel_id: string;
  channel_name: string;
  access_token: string;
  refresh_token: string;
  token_expires_at: string;
  privacy: string;
  category_id: string;
  tags: string[];
  made_for_kids: boolean;
  custom_title?: string;
  custom_description?: string;
}

interface YouTubeConfiguratorProps {
  projectId: string;
  youtubeSettings: YouTubeSettings | null;
  onSettingsChange: (settings: YouTubeSettings | null) => void;
}

const YOUTUBE_CATEGORIES = [
  { id: '1', name: 'Film & Animation' },
  { id: '2', name: 'Autos & Vehicles' },
  { id: '10', name: 'Music' },
  { id: '15', name: 'Pets & Animals' },
  { id: '17', name: 'Sports' },
  { id: '20', name: 'Gaming' },
  { id: '22', name: 'People & Blogs' },
  { id: '23', name: 'Comedy' },
  { id: '24', name: 'Entertainment' },
  { id: '25', name: 'News & Politics' },
  { id: '26', name: 'Howto & Style' },
  { id: '27', name: 'Education' },
  { id: '28', name: 'Science & Technology' },
];

export function YouTubeConfigurator({ projectId, youtubeSettings, onSettingsChange }: YouTubeConfiguratorProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [isConnecting, setIsConnecting] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [localSettings, setLocalSettings] = useState<Partial<YouTubeSettings>>({
    privacy: 'private',
    category_id: '20',
    tags: [],
    made_for_kids: false,
  });
  const [tagInput, setTagInput] = useState('');
  const [localTitle, setLocalTitle] = useState('');
  const [localDescription, setLocalDescription] = useState('');

  // Check for OAuth callback results
  useEffect(() => {
    const connected = searchParams.get('youtube_connected');
    const error = searchParams.get('youtube_error');

    if (connected === 'true') {
      toast({
        title: 'YouTube Connected!',
        description: 'Your YouTube channel has been linked to this project.',
      });
      // Clear the URL params
      searchParams.delete('youtube_connected');
      setSearchParams(searchParams);
    }

    if (error) {
      toast({
        title: 'YouTube Connection Failed',
        description: `Error: ${error}`,
        variant: 'destructive',
      });
      searchParams.delete('youtube_error');
      setSearchParams(searchParams);
    }
  }, [searchParams, setSearchParams]);

  // Sync local settings with props
  useEffect(() => {
    if (youtubeSettings) {
      setLocalSettings({
        privacy: youtubeSettings.privacy || 'private',
        category_id: youtubeSettings.category_id || '20',
        tags: youtubeSettings.tags || [],
        made_for_kids: youtubeSettings.made_for_kids || false,
      });
      setLocalTitle(youtubeSettings.custom_title || '');
      setLocalDescription(youtubeSettings.custom_description || '');
    }
  }, [youtubeSettings]);

  const handleConnect = async () => {
    setIsConnecting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast({ title: 'Please log in first', variant: 'destructive' });
        return;
      }

      const { data, error } = await supabase.functions.invoke('youtube-oauth-start', {
        body: { project_id: projectId },
      });

      if (error) throw error;

      // Redirect to Google OAuth
      window.location.href = data.auth_url;
    } catch (error: any) {
      console.error('YouTube connect error:', error);
      toast({
        title: 'Connection Failed',
        description: error.message || 'Failed to start YouTube connection',
        variant: 'destructive',
      });
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      const { error } = await supabase
        .from('projects')
        .update({ youtube_settings: null })
        .eq('id', projectId);

      if (error) throw error;

      onSettingsChange(null);
      toast({ title: 'YouTube Disconnected' });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const handleSettingChange = async (key: keyof YouTubeSettings, value: any) => {
    if (!youtubeSettings) return;

    const updatedSettings = { ...youtubeSettings, [key]: value };
    
    try {
      const { error } = await supabase
        .from('projects')
        .update({ youtube_settings: updatedSettings })
        .eq('id', projectId);

      if (error) throw error;

      onSettingsChange(updatedSettings);
      setLocalSettings(prev => ({ ...prev, [key]: value }));
    } catch (error: any) {
      toast({
        title: 'Error saving settings',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const handleAddTag = () => {
    if (!tagInput.trim() || !youtubeSettings) return;
    const newTags = [...(youtubeSettings.tags || []), tagInput.trim()];
    handleSettingChange('tags', newTags);
    setTagInput('');
  };

  const handleRemoveTag = (tagToRemove: string) => {
    if (!youtubeSettings) return;
    const newTags = (youtubeSettings.tags || []).filter(t => t !== tagToRemove);
    handleSettingChange('tags', newTags);
  };

  const isConnected = youtubeSettings?.enabled && youtubeSettings?.channel_id;

  return (
    <Card className="bg-card/50 border-border/50">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Youtube className="h-4 w-4 text-red-500" />
          YouTube Auto-Post
          {isConnected && (
            <Badge variant="secondary" className="ml-auto text-xs">
              Connected
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!isConnected ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Connect your YouTube channel to automatically upload videos after rendering.
            </p>
            <Button 
              onClick={handleConnect} 
              disabled={isConnecting}
              className="w-full"
              variant="outline"
            >
              <Link2 className="h-4 w-4 mr-2" />
              {isConnecting ? 'Connecting...' : 'Connect YouTube Channel'}
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Channel Info */}
            <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-full bg-red-500/10 flex items-center justify-center">
                  <Youtube className="h-4 w-4 text-red-500" />
                </div>
                <div>
                  <p className="text-sm font-medium">{youtubeSettings.channel_name || 'Unknown Channel'}</p>
                  <a 
                    href={`https://www.youtube.com/channel/${youtubeSettings.channel_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1"
                  >
                    View Channel <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={handleDisconnect}>
                <Unlink className="h-4 w-4" />
              </Button>
            </div>

            {/* Auto-post toggle */}
            <div className="flex items-center justify-between">
              <Label htmlFor="auto-post" className="text-sm">Auto-post after render</Label>
              <Switch
                id="auto-post"
                checked={youtubeSettings.enabled}
                onCheckedChange={(checked) => handleSettingChange('enabled', checked)}
              />
            </div>

            {/* Advanced Settings */}
            <Collapsible open={isOpen} onOpenChange={setIsOpen}>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="w-full justify-between">
                  <span className="flex items-center gap-2">
                    <Settings2 className="h-4 w-4" />
                    Upload Settings
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {isOpen ? 'Hide' : 'Show'}
                  </span>
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-4 pt-4">
                {/* Custom Title */}
                <div className="space-y-2">
                  <Label className="text-sm">Video Title (optional)</Label>
                  <Input
                    value={localTitle}
                    onChange={(e) => setLocalTitle(e.target.value)}
                    onBlur={() => handleSettingChange('custom_title', localTitle)}
                    placeholder="Leave empty to use project title"
                    maxLength={100}
                  />
                  <p className="text-xs text-muted-foreground">Max 100 characters. Uses project title if empty.</p>
                </div>

                {/* Custom Description */}
                <div className="space-y-2">
                  <Label className="text-sm">Video Description (optional)</Label>
                  <textarea
                    value={localDescription}
                    onChange={(e) => setLocalDescription(e.target.value)}
                    onBlur={() => handleSettingChange('custom_description', localDescription)}
                    placeholder="Leave empty to use project description"
                    maxLength={5000}
                    className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  />
                  <p className="text-xs text-muted-foreground">Max 5000 characters. Uses project description if empty.</p>
                </div>

                {/* Privacy */}
                <div className="space-y-2">
                  <Label className="text-sm">Privacy</Label>
                  <Select 
                    value={youtubeSettings.privacy || 'private'}
                    onValueChange={(value) => handleSettingChange('privacy', value)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="private">Private</SelectItem>
                      <SelectItem value="unlisted">Unlisted</SelectItem>
                      <SelectItem value="public">Public</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Category */}
                <div className="space-y-2">
                  <Label className="text-sm">Category</Label>
                  <Select 
                    value={youtubeSettings.category_id || '20'}
                    onValueChange={(value) => handleSettingChange('category_id', value)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {YOUTUBE_CATEGORIES.map(cat => (
                        <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Tags */}
                <div className="space-y-2">
                  <Label className="text-sm">Tags</Label>
                  <div className="flex gap-2">
                    <Input
                      value={tagInput}
                      onChange={(e) => setTagInput(e.target.value)}
                      placeholder="Add a tag"
                      onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddTag())}
                      className="flex-1"
                    />
                    <Button type="button" variant="secondary" size="sm" onClick={handleAddTag}>
                      Add
                    </Button>
                  </div>
                  {youtubeSettings.tags && youtubeSettings.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 pt-2">
                      {youtubeSettings.tags.map((tag) => (
                        <Badge 
                          key={tag} 
                          variant="secondary" 
                          className="cursor-pointer hover:bg-destructive hover:text-destructive-foreground"
                          onClick={() => handleRemoveTag(tag)}
                        >
                          {tag} ×
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>

                {/* Made for Kids */}
                <div className="flex items-center justify-between">
                  <Label htmlFor="made-for-kids" className="text-sm">Made for kids</Label>
                  <Switch
                    id="made-for-kids"
                    checked={youtubeSettings.made_for_kids || false}
                    onCheckedChange={(checked) => handleSettingChange('made_for_kids', checked)}
                  />
                </div>
              </CollapsibleContent>
            </Collapsible>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
