import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Bot, ShieldCheck, Zap, AlertTriangle, Gauge, History, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface AutomationSettings {
  id?: string;
  autonomy_level: number;
  scale_threshold_ctr: number;
  scale_threshold_retention: number;
  kill_threshold_retention: number;
  min_confidence_pct: number;
  max_changes_per_day: number;
  copilot_delay_hours: number;
  enabled: boolean;
}

interface Props {
  gamemodeId: string;
  gamemodeName: string;
  onClose?: () => void;
}

const AUTONOMY_LEVELS = [
  { value: 1, name: "Advisor", icon: ShieldCheck, color: "text-blue-500", description: "AI suggests, you approve" },
  { value: 2, name: "Co-pilot", icon: Bot, color: "text-yellow-500", description: "AI decides, waits for review" },
  { value: 3, name: "Autopilot", icon: Zap, color: "text-green-500", description: "AI decides and executes" },
];

export function AutomationSettingsPanel({ gamemodeId, gamemodeName, onClose }: Props) {
  const [settings, setSettings] = useState<AutomationSettings>({
    autonomy_level: 1,
    scale_threshold_ctr: 5,
    scale_threshold_retention: 50,
    kill_threshold_retention: 25,
    min_confidence_pct: 75,
    max_changes_per_day: 5,
    copilot_delay_hours: 6,
    enabled: false,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetchSettings();
  }, [gamemodeId]);

  const fetchSettings = async () => {
    const { data } = await supabase
      .from('automation_settings')
      .select('*')
      .eq('gamemode_id', gamemodeId)
      .maybeSingle();

    if (data) {
      setSettings({
        id: data.id,
        autonomy_level: data.autonomy_level,
        scale_threshold_ctr: data.scale_threshold_ctr,
        scale_threshold_retention: data.scale_threshold_retention,
        kill_threshold_retention: data.kill_threshold_retention,
        min_confidence_pct: data.min_confidence_pct,
        max_changes_per_day: data.max_changes_per_day,
        copilot_delay_hours: data.copilot_delay_hours,
        enabled: data.enabled,
      });
    }
    setLoading(false);
  };

  const saveSettings = async () => {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase.from('automation_settings').upsert({
        ...settings,
        user_id: user.id,
        gamemode_id: gamemodeId,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id,gamemode_id'
      });

      if (error) throw error;

      toast({
        title: "Settings Saved",
        description: `Automation ${settings.enabled ? 'enabled' : 'disabled'} for ${gamemodeName}`,
      });

      onClose?.();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message,
      });
    } finally {
      setSaving(false);
    }
  };

  const currentLevel = AUTONOMY_LEVELS.find(l => l.value === settings.autonomy_level)!;
  const LevelIcon = currentLevel.icon;

  if (loading) {
    return (
      <Card className="border-primary/30">
        <CardContent className="p-6 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-primary/30">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Bot className="w-5 h-5 text-primary" />
            AI Autonomy Settings
          </CardTitle>
          <Switch
            checked={settings.enabled}
            onCheckedChange={(checked) => setSettings({ ...settings, enabled: checked })}
          />
        </div>
        <p className="text-sm text-muted-foreground">
          Configure how much decision-making power the AI has for {gamemodeName}
        </p>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Autonomy Level Selector */}
        <div className="space-y-3">
          <Label className="flex items-center gap-2">
            <LevelIcon className={`w-4 h-4 ${currentLevel.color}`} />
            Autonomy Level
          </Label>
          <div className="grid grid-cols-3 gap-2">
            {AUTONOMY_LEVELS.map((level) => {
              const Icon = level.icon;
              const isSelected = settings.autonomy_level === level.value;
              return (
                <button
                  key={level.value}
                  onClick={() => setSettings({ ...settings, autonomy_level: level.value })}
                  className={`p-3 rounded-lg border text-left transition-all ${
                    isSelected 
                      ? 'border-primary bg-primary/10' 
                      : 'border-border/50 hover:border-border'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Icon className={`w-4 h-4 ${level.color}`} />
                    <span className="font-medium text-sm">{level.name}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{level.description}</p>
                </button>
              );
            })}
          </div>
        </div>

        {settings.autonomy_level >= 2 && (
          <>
            {/* Confidence Threshold */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-2">
                  <Gauge className="w-4 h-4 text-muted-foreground" />
                  Minimum Confidence
                </Label>
                <Badge variant="outline">{settings.min_confidence_pct}%</Badge>
              </div>
              <Slider
                value={[settings.min_confidence_pct]}
                onValueChange={([val]) => setSettings({ ...settings, min_confidence_pct: val })}
                min={50}
                max={95}
                step={5}
              />
              <p className="text-xs text-muted-foreground">
                AI must be at least this confident to auto-execute decisions
              </p>
            </div>

            {/* Scale Threshold */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Scale Threshold (Retention)</Label>
                <Badge variant="outline" className="text-green-500">{settings.scale_threshold_retention}%</Badge>
              </div>
              <Slider
                value={[settings.scale_threshold_retention]}
                onValueChange={([val]) => setSettings({ ...settings, scale_threshold_retention: val })}
                min={30}
                max={80}
                step={5}
              />
              <p className="text-xs text-muted-foreground">
                Formats with retention above this will be scaled up
              </p>
            </div>

            {/* Kill Threshold */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-500" />
                  Kill Threshold (Retention)
                </Label>
                <Badge variant="outline" className="text-red-500">{settings.kill_threshold_retention}%</Badge>
              </div>
              <Slider
                value={[settings.kill_threshold_retention]}
                onValueChange={([val]) => setSettings({ ...settings, kill_threshold_retention: val })}
                min={10}
                max={40}
                step={5}
              />
              <p className="text-xs text-muted-foreground">
                Formats with retention below this will be paused automatically
              </p>
            </div>

            {/* Daily Limit */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Max Changes Per Day</Label>
                <Badge variant="outline">{settings.max_changes_per_day}</Badge>
              </div>
              <Slider
                value={[settings.max_changes_per_day]}
                onValueChange={([val]) => setSettings({ ...settings, max_changes_per_day: val })}
                min={1}
                max={20}
                step={1}
              />
            </div>

            {/* Co-pilot Delay (only for level 2) */}
            {settings.autonomy_level === 2 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="flex items-center gap-2">
                    <History className="w-4 h-4 text-muted-foreground" />
                    Review Window
                  </Label>
                  <Badge variant="outline">{settings.copilot_delay_hours}h</Badge>
                </div>
                <Slider
                  value={[settings.copilot_delay_hours]}
                  onValueChange={([val]) => setSettings({ ...settings, copilot_delay_hours: val })}
                  min={1}
                  max={24}
                  step={1}
                />
                <p className="text-xs text-muted-foreground">
                  Time to review before auto-execution
                </p>
              </div>
            )}
          </>
        )}

        <div className="flex gap-2">
          {onClose && (
            <Button variant="outline" onClick={onClose} className="flex-1">
              Cancel
            </Button>
          )}
          <Button onClick={saveSettings} disabled={saving} className="flex-1">
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            {saving ? 'Saving...' : 'Save Settings'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
