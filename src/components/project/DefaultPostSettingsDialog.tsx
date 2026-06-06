import { useState, useEffect } from 'react';
import { Settings2, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

export interface DefaultPostSettings {
  default_privacy: 'private' | 'unlisted' | 'public';
  default_title: string;
  default_description: string;
  default_category_id: string;
  default_made_for_kids: boolean;
  default_tags: string[];
  apply_to_new_accounts: boolean;
}

export const defaultPostSettingsDefaults: DefaultPostSettings = {
  default_privacy: 'private',
  default_title: '',
  default_description: '',
  default_category_id: '20', // Gaming
  default_made_for_kids: false,
  default_tags: [],
  apply_to_new_accounts: true,
};

interface DefaultPostSettingsDialogProps {
  projectId: string;
  settings: DefaultPostSettings;
  onSettingsChange: (settings: DefaultPostSettings) => void;
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

export function DefaultPostSettingsDialog({ projectId, settings, onSettingsChange }: DefaultPostSettingsDialogProps) {
  const [open, setOpen] = useState(false);
  const [localSettings, setLocalSettings] = useState<DefaultPostSettings>(settings);
  const [tagInput, setTagInput] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setLocalSettings(settings);
  }, [settings]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      // Save to project's youtube_settings
      const { error } = await supabase
        .from('projects')
        .update({
          youtube_settings: JSON.parse(JSON.stringify(localSettings)),
        })
        .eq('id', projectId);

      if (error) throw error;

      onSettingsChange(localSettings);
      
      toast({
        title: '✓ Default settings saved!',
        description: 'New accounts will use these defaults automatically.',
      });
      
      setOpen(false);
    } catch (error: any) {
      console.error('Failed to save default post settings:', error);
      toast({
        variant: 'destructive',
        title: 'Save Failed',
        description: error.message || 'Failed to save default settings',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleApplyToExisting = async () => {
    setIsSaving(true);
    try {
      // Apply defaults to all existing YouTube accounts for this project
      const updateData: Record<string, unknown> = {
        privacy: localSettings.default_privacy,
        category_id: localSettings.default_category_id,
        made_for_kids: localSettings.default_made_for_kids,
        tags: localSettings.default_tags,
      };

      // Only apply title/description if they're not empty
      if (localSettings.default_title) {
        updateData.custom_title = localSettings.default_title;
      }
      if (localSettings.default_description) {
        updateData.custom_description = localSettings.default_description;
      }

      const { error } = await supabase
        .from('youtube_accounts')
        .update(updateData)
        .eq('project_id', projectId);

      if (error) throw error;

      toast({
        title: '✓ Applied to all accounts!',
        description: 'All connected YouTube accounts now use these settings.',
      });
    } catch (error: any) {
      console.error('Failed to apply settings to accounts:', error);
      toast({
        variant: 'destructive',
        title: 'Apply Failed',
        description: error.message || 'Failed to apply settings to accounts',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddTag = () => {
    if (!tagInput.trim()) return;
    const newTags = [...localSettings.default_tags, tagInput.trim()];
    setLocalSettings(prev => ({ ...prev, default_tags: newTags }));
    setTagInput('');
  };

  const handleRemoveTag = (tagToRemove: string) => {
    const newTags = localSettings.default_tags.filter(t => t !== tagToRemove);
    setLocalSettings(prev => ({ ...prev, default_tags: newTags }));
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="w-full">
          <Settings2 className="h-4 w-4 mr-2" />
          Default Post Settings
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Default Post Settings</DialogTitle>
          <DialogDescription>
            Set default values for newly connected YouTube accounts. These will be automatically applied when you connect a new channel.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Default Privacy */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Default Privacy</Label>
            <Select
              value={localSettings.default_privacy}
              onValueChange={(value: 'private' | 'unlisted' | 'public') => 
                setLocalSettings(prev => ({ ...prev, default_privacy: value }))
              }
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
            <p className="text-xs text-muted-foreground">
              All new accounts will default to this privacy setting.
            </p>
          </div>

          {/* Default Title */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Default Title</Label>
            <Input
              value={localSettings.default_title}
              onChange={(e) => setLocalSettings(prev => ({ ...prev, default_title: e.target.value }))}
              placeholder="Leave empty to use project title"
              maxLength={100}
            />
          </div>

          {/* Default Description */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Default Description</Label>
            <Textarea
              value={localSettings.default_description}
              onChange={(e) => setLocalSettings(prev => ({ ...prev, default_description: e.target.value }))}
              placeholder="Leave empty to use project description"
              maxLength={5000}
              className="min-h-[100px]"
            />
          </div>

          {/* Default Category */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Default Category</Label>
            <Select
              value={localSettings.default_category_id}
              onValueChange={(value) => 
                setLocalSettings(prev => ({ ...prev, default_category_id: value }))
              }
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

          {/* Default Tags */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Default Tags</Label>
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
            {localSettings.default_tags.length > 0 && (
              <div className="flex flex-wrap gap-1 pt-2">
                {localSettings.default_tags.map((tag) => (
                  <span
                    key={tag}
                    className="px-2 py-1 text-xs bg-secondary rounded-md cursor-pointer hover:bg-destructive hover:text-destructive-foreground"
                    onClick={() => handleRemoveTag(tag)}
                  >
                    {tag} ×
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Made for Kids */}
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium">Default: Made for kids</Label>
            <Switch
              checked={localSettings.default_made_for_kids}
              onCheckedChange={(checked) => 
                setLocalSettings(prev => ({ ...prev, default_made_for_kids: checked }))
              }
            />
          </div>

          {/* Apply to new accounts toggle */}
          <div className="flex items-center justify-between pt-2 border-t">
            <div>
              <Label className="text-sm font-medium">Auto-apply to new accounts</Label>
              <p className="text-xs text-muted-foreground">
                When enabled, these settings are applied to newly connected accounts.
              </p>
            </div>
            <Switch
              checked={localSettings.apply_to_new_accounts}
              onCheckedChange={(checked) => 
                setLocalSettings(prev => ({ ...prev, apply_to_new_accounts: checked }))
              }
            />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Button onClick={handleSave} disabled={isSaving}>
            <Save className="h-4 w-4 mr-2" />
            {isSaving ? 'Saving...' : 'Save Defaults'}
          </Button>
          <Button 
            variant="secondary" 
            onClick={handleApplyToExisting} 
            disabled={isSaving}
          >
            Apply to All Existing Accounts
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
