import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Youtube, Link2, Unlink, ExternalLink, Plus, Clock, ChevronDown, ChevronUp, X, RotateCcw, FlaskConical } from 'lucide-react';
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
import { DefaultPostSettingsDialog, DefaultPostSettings, defaultPostSettingsDefaults } from './DefaultPostSettingsDialog';
import { MetadataPoolDialog } from './MetadataPoolDialog';
import { WarmupControl } from './WarmupControl';
import { Flame } from 'lucide-react';
import { cn } from '@/lib/utils';

interface YouTubeAccount {
  id: string;
  project_id: string;
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
  enabled: boolean;
  created_at: string;
  updated_at: string;
  // Title rotation fields
  title_pool?: string[];
  title_rotation_mode?: string;
  title_rotation_index?: number;
  // Warmup fields
  warmup_status?: string;
  warmup_started_at?: string;
  warmup_settings?: any;
  // Lab experiment field
  lab_enabled?: boolean;
}

interface YouTubeMultiAccountManagerProps {
  projectId: string;
  postDelayMinutes: number | null;
  onDelayChange: (minutes: number) => void;
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

export function YouTubeMultiAccountManager({ projectId, postDelayMinutes, onDelayChange }: YouTubeMultiAccountManagerProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [accounts, setAccounts] = useState<YouTubeAccount[]>([]);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedAccountId, setExpandedAccountId] = useState<string | null>(null);
  const [localDelay, setLocalDelay] = useState(postDelayMinutes?.toString() || '30');
  const [defaultPostSettings, setDefaultPostSettings] = useState<DefaultPostSettings>(defaultPostSettingsDefaults);

  // Fetch accounts and default settings
  useEffect(() => {
    fetchAccounts();
    fetchDefaultSettings();
  }, [projectId]);

  const fetchDefaultSettings = async () => {
    try {
      const { data, error } = await supabase
        .from('projects')
        .select('youtube_settings')
        .eq('id', projectId)
        .single();

      if (error) throw error;

      if (data?.youtube_settings && typeof data.youtube_settings === 'object') {
        const settings = data.youtube_settings as Record<string, unknown>;
        setDefaultPostSettings({
          default_privacy: (settings.default_privacy as 'private' | 'unlisted' | 'public') || 'private',
          default_title: (settings.default_title as string) || '',
          default_description: (settings.default_description as string) || '',
          default_category_id: (settings.default_category_id as string) || '20',
          default_made_for_kids: Boolean(settings.default_made_for_kids),
          default_tags: (settings.default_tags as string[]) || [],
          apply_to_new_accounts: settings.apply_to_new_accounts !== false,
        });
      }
    } catch (error) {
      console.error('Error fetching default post settings:', error);
    }
  };

  // Check for OAuth callback results
  useEffect(() => {
    const connected = searchParams.get('youtube_connected');
    const error = searchParams.get('youtube_error');

    if (connected === 'true') {
      toast({
        title: 'YouTube Connected!',
        description: 'Your YouTube channel has been linked to this project.',
      });
      fetchAccounts();
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

  // Sync local delay with props
  useEffect(() => {
    setLocalDelay(postDelayMinutes?.toString() || '30');
  }, [postDelayMinutes]);

  const fetchAccounts = async () => {
    try {
      const { data, error } = await supabase
        .from('youtube_accounts')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      setAccounts(data || []);
    } catch (error: any) {
      console.error('Error fetching YouTube accounts:', error);
    } finally {
      setIsLoading(false);
    }
  };

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

  const handleDisconnect = async (accountId: string) => {
    try {
      const { error } = await supabase
        .from('youtube_accounts')
        .delete()
        .eq('id', accountId);

      if (error) throw error;

      setAccounts(prev => prev.filter(a => a.id !== accountId));
      toast({ title: 'YouTube Account Disconnected' });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const handleAccountSettingChange = async (accountId: string, key: keyof YouTubeAccount, value: any) => {
    try {
      const { error } = await supabase
        .from('youtube_accounts')
        .update({ [key]: value })
        .eq('id', accountId);

      if (error) throw error;

      setAccounts(prev => prev.map(a =>
        a.id === accountId ? { ...a, [key]: value } : a
      ));
    } catch (error: any) {
      toast({
        title: 'Error saving settings',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const handleDelayBlur = () => {
    const minutes = parseInt(localDelay) || 30;
    onDelayChange(Math.max(0, minutes));
  };

  const enabledCount = accounts.filter(a => a.enabled).length;

  return (
    <Card className="bg-card/50 border-border/50">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Youtube className="h-4 w-4 text-red-500" />
          YouTube Auto-Post
          {accounts.length > 0 && (
            <Badge variant="secondary" className="ml-auto text-xs">
              {enabledCount}/{accounts.length} Active
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Global Settings */}
        {accounts.length > 0 && (
          <div className="p-3 bg-muted/30 rounded-lg space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Clock className="h-4 w-4" />
              Post Delay Settings
            </div>
            <div className="flex items-center gap-3">
              <Label className="text-sm text-muted-foreground whitespace-nowrap">Delay between posts:</Label>
              <Input
                type="number"
                min="0"
                value={localDelay}
                onChange={(e) => setLocalDelay(e.target.value)}
                onBlur={handleDelayBlur}
                className="w-20 h-8"
              />
              <span className="text-sm text-muted-foreground">minutes</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Videos are distributed to random enabled accounts. This delay prevents rate limiting.
            </p>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-2">
          <DefaultPostSettingsDialog
            projectId={projectId}
            settings={defaultPostSettings}
            onSettingsChange={(newSettings) => {
              setDefaultPostSettings(newSettings);
            }}
          />
          <MetadataPoolDialog projectId={projectId} />
        </div>

        {/* Connected Accounts */}
        {isLoading ? (
          <div className="text-sm text-muted-foreground text-center py-4">Loading accounts...</div>
        ) : (
          <div className="space-y-2">
            {accounts.map((account) => (
              <AccountCard
                key={account.id}
                account={account}
                isExpanded={expandedAccountId === account.id}
                onToggleExpand={() => setExpandedAccountId(
                  expandedAccountId === account.id ? null : account.id
                )}
                onSettingChange={(key, value) => handleAccountSettingChange(account.id, key, value)}
                onDisconnect={() => handleDisconnect(account.id)}
              />
            ))}
          </div>
        )}

        {/* Add Account Button */}
        <Button
          onClick={handleConnect}
          disabled={isConnecting}
          className="w-full"
          variant="outline"
        >
          {accounts.length === 0 ? (
            <>
              <Link2 className="h-4 w-4 mr-2" />
              {isConnecting ? 'Connecting...' : 'Connect YouTube Channel'}
            </>
          ) : (
            <>
              <Plus className="h-4 w-4 mr-2" />
              {isConnecting ? 'Connecting...' : 'Add Another Channel'}
            </>
          )}
        </Button>

        {accounts.length === 0 && (
          <p className="text-sm text-muted-foreground text-center">
            Connect your YouTube channels to automatically upload videos after rendering.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// Separate component for each account card
interface AccountCardProps {
  account: YouTubeAccount;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onSettingChange: (key: keyof YouTubeAccount, value: any) => void;
  onDisconnect: () => void;
}

function AccountCard({ account, isExpanded, onToggleExpand, onSettingChange, onDisconnect }: AccountCardProps) {
  const [localTitle, setLocalTitle] = useState(account.custom_title || '');
  const [localDescription, setLocalDescription] = useState(account.custom_description || '');
  const [tagInput, setTagInput] = useState('');

  // Title rotation state
  const [titlePool, setTitlePool] = useState<string[]>(account.title_pool || []);
  const [newTitleInput, setNewTitleInput] = useState('');

  useEffect(() => {
    setLocalTitle(account.custom_title || '');
    setLocalDescription(account.custom_description || '');
    setTitlePool(account.title_pool || []);
  }, [account.custom_title, account.custom_description, account.title_pool]);

  const handleAddTag = () => {
    if (!tagInput.trim()) return;
    const newTags = [...(account.tags || []), tagInput.trim()];
    onSettingChange('tags', newTags);
    setTagInput('');
  };

  const handleRemoveTag = (tagToRemove: string) => {
    const newTags = (account.tags || []).filter(t => t !== tagToRemove);
    onSettingChange('tags', newTags);
  };

  // Title pool handlers
  const handleAddTitleToPool = () => {
    if (!newTitleInput.trim()) return;
    const updated = [...titlePool, newTitleInput.trim()];
    setTitlePool(updated);
    onSettingChange('title_pool', updated);
    setNewTitleInput('');
  };

  const handleRemoveTitleFromPool = (index: number) => {
    const updated = titlePool.filter((_, i) => i !== index);
    setTitlePool(updated);
    onSettingChange('title_pool', updated);
  };

  return (
    <div className="border border-border/50 rounded-lg overflow-hidden">
      {/* Account Header */}
      <div className="flex items-center justify-between p-3 bg-muted/20">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-full bg-red-500/10 flex items-center justify-center">
            <Youtube className="h-4 w-4 text-red-500" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium">{account.channel_name}</p>
              {(account.warmup_status === 'new' || account.warmup_status === 'warming') && (
                <Badge variant="secondary" className="bg-blue-500/10 text-blue-400 text-[10px] h-4 py-0 flex items-center gap-1 border-blue-500/20">
                  <Flame className="h-2 w-2 animate-pulse" />
                  Warming
                </Badge>
              )}
            </div>
            <a
              href={`https://www.youtube.com/channel/${account.channel_id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1"
            >
              View Channel <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              "h-8 w-8 transition-all",
              account.lab_enabled
                ? "text-purple-500 bg-purple-500/20 animate-pulse hover:bg-purple-500/30"
                : "text-muted-foreground hover:text-purple-400"
            )}
            onClick={() => onSettingChange('lab_enabled', !account.lab_enabled)}
            title={account.lab_enabled ? "Disable Lab Experiments" : "Enable for Lab Experiments"}
          >
            <FlaskConical className="h-4 w-4" />
          </Button>
          <Switch
            checked={account.enabled}
            onCheckedChange={(checked) => onSettingChange('enabled', checked)}
          />
          <Button variant="ghost" size="sm" onClick={onToggleExpand}>
            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {/* Expanded Settings */}
      <Collapsible open={isExpanded}>
        <CollapsibleContent className="p-3 pt-0 space-y-4 border-t border-border/30">
          <div className="pt-3" />

          {/* Warmup Control Panel */}
          <WarmupControl
            accountId={account.id}
            status={account.warmup_status || 'new'}
            startedAt={account.warmup_started_at || account.created_at}
            settings={account.warmup_settings}
            onSettingsUpdate={(newSettings) => onSettingChange('warmup_settings', newSettings)}
          />

          <div className="pt-3" />

          {/* Custom Title */}
          <div className="space-y-2">
            <Label className="text-sm">Video Title (optional)</Label>
            <Input
              value={localTitle}
              onChange={(e) => setLocalTitle(e.target.value)}
              onBlur={() => onSettingChange('custom_title', localTitle || null)}
              placeholder="Leave empty to use project title"
              maxLength={100}
            />
          </div>

          {/* Custom Description */}
          <div className="space-y-2">
            <Label className="text-sm">Video Description (optional)</Label>
            <textarea
              value={localDescription}
              onChange={(e) => setLocalDescription(e.target.value)}
              onBlur={() => onSettingChange('custom_description', localDescription || null)}
              placeholder="Leave empty to use project description"
              maxLength={5000}
              className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            />
          </div>

          {/* Title Rotation Section */}
          <div className="space-y-3 border-t pt-3">
            <Label className="text-sm flex items-center gap-2">
              <RotateCcw className="h-4 w-4 text-primary" />
              Title Rotation
              {titlePool.length > 0 && (
                <Badge variant="secondary" className="text-xs">
                  {titlePool.length} titles
                </Badge>
              )}
            </Label>

            {/* Add new title input */}
            <div className="flex gap-2">
              <Input
                value={newTitleInput}
                onChange={(e) => setNewTitleInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddTitleToPool())}
                placeholder="Add a title variation..."
                maxLength={100}
                className="flex-1"
              />
              <Button type="button" variant="secondary" size="sm" onClick={handleAddTitleToPool}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>

            {/* Title list */}
            {titlePool.length > 0 && (
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {titlePool.map((title, idx) => (
                  <div key={idx} className="flex items-center gap-2 p-2 bg-muted/30 rounded text-sm">
                    <span className="text-muted-foreground text-xs">{idx + 1}.</span>
                    <span className="flex-1 truncate">{title}</span>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6"
                      onClick={() => handleRemoveTitleFromPool(idx)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {/* Rotation mode */}
            {titlePool.length > 0 && (
              <Select
                value={account.title_rotation_mode || 'sequential'}
                onValueChange={(v) => onSettingChange('title_rotation_mode', v)}
              >
                <SelectTrigger className="h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sequential">Sequential (1, 2, 3...)</SelectItem>
                  <SelectItem value="random">Random</SelectItem>
                </SelectContent>
              </Select>
            )}

            <p className="text-xs text-muted-foreground">
              {titlePool.length === 0
                ? "Add titles to rotate between uploads. Uses custom title above if empty."
                : `Rotates through ${titlePool.length} titles on each upload.`}
            </p>
          </div>

          {/* Privacy */}
          <div className="space-y-2">
            <Label className="text-sm">Privacy</Label>
            <Select
              value={account.privacy}
              onValueChange={(value) => onSettingChange('privacy', value)}
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
              value={account.category_id}
              onValueChange={(value) => onSettingChange('category_id', value)}
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
            {account.tags && account.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 pt-2">
                {account.tags.map((tag) => (
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
            <Label htmlFor={`made-for-kids-${account.id}`} className="text-sm">Made for kids</Label>
            <Switch
              id={`made-for-kids-${account.id}`}
              checked={account.made_for_kids}
              onCheckedChange={(checked) => onSettingChange('made_for_kids', checked)}
            />
          </div>

          {/* Disconnect Button */}
          <Button
            variant="ghost"
            size="sm"
            className="w-full text-destructive hover:text-destructive hover:bg-destructive/10"
            onClick={onDisconnect}
          >
            <Unlink className="h-4 w-4 mr-2" />
            Disconnect Channel
          </Button>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
