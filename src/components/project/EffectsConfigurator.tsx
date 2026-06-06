import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Sparkles, Rainbow, Palette, Zap, ZoomIn, Maximize, Move, Camera } from "lucide-react";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";

export interface EffectsSettings {
  flash_enabled: boolean;
  flash_color: string;
  flash_rainbow: boolean;
  ai_sfx_enabled: boolean;
  ai_zoom_enabled: boolean;
  zoom_style: 'none' | 'zoom-in' | 'zoom-out' | 'basic';
  sfx_density?: number;
}

const COLOR_PALETTE = [
  "#ffffff", "#000000", "#ff0000", "#00ff00", "#0000ff", "#ffff00",
  "#ff00ff", "#00ffff", "#ff6b00", "#00ff88", "#ffd700", "#ff1493",
  "#8b5cf6", "#06b6d4", "#f43f5e", "#84cc16",
];

interface EffectsConfiguratorProps {
  settings: EffectsSettings;
  onSettingsChange: (settings: EffectsSettings) => void;
  onSave?: () => Promise<void>;
  isSaving?: boolean;
}

export const EffectsConfigurator = ({ settings, onSettingsChange, onSave, isSaving }: EffectsConfiguratorProps) => {
  const updateSetting = <K extends keyof EffectsSettings>(key: K, value: EffectsSettings[K]) => {
    onSettingsChange({ ...settings, [key]: value });
  };

  return (
    <div className="space-y-6">
      <Card className="bg-white/5 border-white/10 overflow-hidden relative">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent pointer-events-none" />
        <CardHeader className="relative z-10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center border border-primary/30 shadow-[0_0_15px_rgba(182,56,252,0.2)]">
                <Zap className="w-5 h-5 text-primary animate-pulse" />
              </div>
              <div>
                <CardTitle className="text-lg font-bold">Global Effects</CardTitle>
                <p className="text-xs text-slate-500">Configure visual triggers for high-impact moments</p>
              </div>
            </div>
            {onSave && (
              <Button 
                size="sm" 
                onClick={onSave} 
                disabled={isSaving}
                className="bg-primary hover:bg-primary/90 text-white font-bold h-9 px-6 rounded-xl"
              >
                {isSaving ? "Saving..." : "Apply Logic"}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-8 relative z-10">
          
          {/* Flash Effect Section */}
          <div className="p-6 rounded-2xl bg-white/[0.03] border border-white/5 space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Sparkles className="w-4 h-4 text-primary" />
                <div>
                  <Label className="text-sm font-bold">Flash Intensity (Shine)</Label>
                  <p className="text-[10px] text-slate-500">Applies to End Screen Images and Logo Recognition</p>
                </div>
              </div>
              <Switch 
                checked={settings.flash_enabled} 
                onCheckedChange={(v) => updateSetting("flash_enabled", v)}
                className="data-[state=checked]:bg-primary"
              />
            </div>

            {settings.flash_enabled && (
              <div className="space-y-6 pt-4 border-t border-white/5 animate-in fade-in slide-in-from-top-4 duration-500">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Rainbow className="w-4 h-4 text-primary" />
                    <Label className="text-xs font-bold uppercase tracking-widest text-slate-400">Rainbow Spectrum</Label>
                  </div>
                  <Switch 
                    checked={settings.flash_rainbow} 
                    onCheckedChange={(v) => updateSetting("flash_rainbow", v)}
                    className="data-[state=checked]:bg-primary"
                  />
                </div>

                {!settings.flash_rainbow && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Palette className="w-4 h-4 text-primary" />
                      <Label className="text-xs font-bold uppercase tracking-widest text-slate-400">Custom Color</Label>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {COLOR_PALETTE.map((color) => (
                        <button
                          key={color}
                          type="button"
                          className={cn(
                            "w-7 h-7 rounded-lg border-2 transition-all",
                            settings.flash_color === color ? "border-primary scale-110 shadow-[0_0_10px_rgba(182,56,252,0.5)]" : "border-transparent hover:scale-105"
                          )}
                          style={{ backgroundColor: color }}
                          onClick={() => updateSetting("flash_color", color)}
                        />
                      ))}
                      <div className="relative">
                        <input
                          type="color"
                          value={settings.flash_color}
                          onChange={(e) => updateSetting("flash_color", e.target.value)}
                          className="w-7 h-7 rounded-lg bg-transparent cursor-pointer border-2 border-white/10"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {settings.flash_rainbow && (
                  <div className="p-4 rounded-xl bg-gradient-to-r from-red-500 via-green-500 to-blue-500 opacity-20 flex items-center justify-center">
                    <span className="text-[10px] font-black uppercase tracking-[0.3em] text-white">Spectral Mode Active</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* AI SFX Section */}
          <div className="p-6 rounded-2xl bg-white/[0.03] border border-white/5 space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center border border-primary/30 shadow-[0_0_15px_rgba(182,56,252,0.1)]">
                  <Sparkles className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <div className="flex items-center gap-3">
                    <Label className="text-sm font-bold">AI Sound Effects</Label>
                    <Button 
                      variant="link" 
                      size="sm" 
                      onClick={() => window.open('/sfx-library', '_blank')}
                      className="h-auto p-0 text-[10px] text-primary hover:text-primary/80 font-black uppercase tracking-widest"
                    >
                      Manage Library
                    </Button>
                  </div>
                  <p className="text-[10px] text-slate-500">Neural analysis matches SFX to script context</p>
                </div>
              </div>
              <Switch 
                checked={settings.ai_sfx_enabled} 
                onCheckedChange={(v) => updateSetting("ai_sfx_enabled", v)}
                className="data-[state=checked]:bg-primary"
              />
            </div>
            
            <div className="p-4 rounded-xl bg-primary/5 border border-primary/20 animate-in fade-in slide-in-from-top-2 duration-300">
              <p className="text-[10px] text-primary/80 font-medium leading-relaxed">
                <span className="font-bold uppercase mr-1">{settings.ai_sfx_enabled ? "Active:" : "Layered Mode:"}</span> 
                {settings.ai_sfx_enabled 
                  ? "AI will intelligently place SFX at high-impact moments. Transition sounds are always guaranteed." 
                  : "Only transition sounds will be placed. Enable AI for context-aware sound layering."}
              </p>
            </div>

            {settings.ai_sfx_enabled && (
              <div className="space-y-4 pt-4 border-t border-white/5 animate-in fade-in slide-in-from-top-4 duration-500">
                <div className="flex justify-between items-center">
                  <Label className="text-xs font-bold uppercase tracking-widest text-slate-400">SFX Density</Label>
                  <span className="text-[10px] font-black text-primary">{Math.round((settings.sfx_density || 0.5) * 100)}%</span>
                </div>
                <Slider 
                  value={[(settings.sfx_density || 0.5) * 100]} 
                  max={100} 
                  step={1} 
                  onValueChange={([v]) => updateSetting("sfx_density", v / 100)}
                />
                <p className="text-[9px] text-white/20 italic">Higher density results in more frequent neural sound placements.</p>
              </div>
            )}
          </div>

          {/* Zoom Presets Section */}
          <div className="p-6 rounded-2xl bg-white/[0.03] border border-white/5 space-y-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center border border-primary/30 shadow-[0_0_15px_rgba(182,56,252,0.1)]">
                <Camera className="w-5 h-5 text-primary" />
              </div>
              <div>
                <Label className="text-sm font-bold">Dynamic Zoom Style</Label>
                <p className="text-[10px] text-slate-500">Select how the camera behaves during gameplay clips</p>
              </div>
            </div>

            <ToggleGroup 
              type="single" 
              value={settings.zoom_style || 'basic'} 
              onValueChange={(v) => v && updateSetting("zoom_style", v as any)}
              className="justify-start gap-2"
            >
              <ToggleGroupItem 
                value="none" 
                className="flex-1 h-20 rounded-xl border border-white/5 bg-white/5 data-[state=on]:bg-primary data-[state=on]:text-white flex flex-col gap-2 p-2 hover:bg-white/10 transition-all"
              >
                <Maximize className="w-4 h-4" />
                <div className="text-center">
                  <div className="text-[10px] font-bold uppercase tracking-tighter">Static</div>
                  <div className="text-[8px] opacity-60">No movement</div>
                </div>
              </ToggleGroupItem>

              <ToggleGroupItem 
                value="zoom-in" 
                className="flex-1 h-20 rounded-xl border border-white/5 bg-white/5 data-[state=on]:bg-primary data-[state=on]:text-white flex flex-col gap-2 p-2 hover:bg-white/10 transition-all"
              >
                <ZoomIn className="w-4 h-4" />
                <div className="text-center">
                  <div className="text-[10px] font-bold uppercase tracking-tighter">Slow In</div>
                  <div className="text-[8px] opacity-60">Continuous</div>
                </div>
              </ToggleGroupItem>

              <ToggleGroupItem 
                value="zoom-out" 
                className="flex-1 h-20 rounded-xl border border-white/5 bg-white/5 data-[state=on]:bg-primary data-[state=on]:text-white flex flex-col gap-2 p-2 hover:bg-white/10 transition-all"
              >
                <Move className="w-4 h-4 rotate-180" />
                <div className="text-center">
                  <div className="text-[10px] font-bold uppercase tracking-tighter">Slow Out</div>
                  <div className="text-[8px] opacity-60">Pull back</div>
                </div>
              </ToggleGroupItem>

              <ToggleGroupItem 
                value="basic" 
                className="flex-1 h-20 rounded-xl border border-white/5 bg-white/5 data-[state=on]:bg-primary data-[state=on]:text-white flex flex-col gap-2 p-2 hover:bg-white/10 transition-all"
              >
                <Sparkles className="w-4 h-4" />
                <div className="text-center">
                  <div className="text-[10px] font-bold uppercase tracking-tighter">Basic</div>
                  <div className="text-[8px] opacity-60">Fast End</div>
                </div>
              </ToggleGroupItem>
            </ToggleGroup>

            {settings.zoom_style === 'basic' && (
              <div className="p-3 rounded-lg bg-primary/10 border border-primary/20 animate-in fade-in slide-in-from-left-2 duration-300">
                <p className="text-[9px] text-primary/80 leading-relaxed italic">
                  "Basic" style adds a subtle, 0.8s smooth accelerating zoom that happens 1.5 seconds before the transition for a professional mid-clip emphasis.
                </p>
              </div>
            )}
          </div>

          <div className="text-center p-4">
             <p className="text-[10px] text-slate-600 font-bold uppercase tracking-widest">More effects coming in neural update v5.0</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
