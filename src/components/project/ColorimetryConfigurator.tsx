import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Palette, Sun, Contrast, Droplets, ChevronDown, Save, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

export interface ColorimetrySettings {
  brightness: number;
  contrast: number;
  saturation: number;
  preset: "none" | "bright" | "saturated" | "ultra_saturated" | "dark";
}

export const defaultColorimetrySettings: ColorimetrySettings = {
  brightness: 0,
  contrast: 1,
  saturation: 1,
  preset: "none",
};

interface ColorimetryConfiguratorProps {
  settings: ColorimetrySettings;
  onSettingsChange: (settings: ColorimetrySettings) => void;
  onSave?: () => Promise<void>;
  isSaving?: boolean;
}

const PRESETS = [
  { id: "none", name: "Original", colors: "from-slate-400 to-slate-600", values: { brightness: 0, contrast: 1, saturation: 1 } },
  { id: "bright", name: "Bright", colors: "from-amber-200 to-yellow-400", values: { brightness: 0.05, contrast: 1.1, saturation: 1.1 } },
  { id: "saturated", name: "Saturated", colors: "from-blue-400 to-indigo-600", values: { brightness: 0, contrast: 1.0, saturation: 1.5 } },
  { id: "ultra_saturated", name: "Ultra", colors: "from-pink-500 to-rose-700", values: { brightness: 0, contrast: 1.0, saturation: 2.2 } },
  { id: "dark", name: "Dark", colors: "from-zinc-700 to-black", values: { brightness: -0.05, contrast: 0.9, saturation: 0.8 } },
];

export const ColorimetryConfigurator = ({
  settings,
  onSettingsChange,
  onSave,
  isSaving = false,
}: ColorimetryConfiguratorProps) => {
  const [isOpen, setIsOpen] = React.useState(false);

  const handlePresetSelect = (presetId: string) => {
    const preset = PRESETS.find((p) => p.id === presetId);
    if (preset) {
      onSettingsChange({
        ...preset.values,
        preset: presetId as any,
      });
    }
  };

  const updateValue = (key: keyof ColorimetrySettings, value: number) => {
    onSettingsChange({
      ...settings,
      [key]: value,
      preset: "none", // Reset preset if manual adjustment
    });
  };

  return (
    <Card className="glass-effect overflow-hidden border-white/5">
      <CardHeader className="pb-3 flex flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center border border-primary/30">
            <Palette className="w-4 h-4 text-primary" />
          </div>
          <div>
            <CardTitle className="text-sm font-bold">Colometrie</CardTitle>
            <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-medium">Visual Presets</p>
          </div>
        </div>
        {onSave && (
          <Button
            onClick={onSave}
            disabled={isSaving}
            variant="outline"
            size="sm"
            className="h-8 gap-2 bg-white/5 hover:bg-white/10"
          >
            {isSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
            Save
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Presets Grid */}
        <div className="grid grid-cols-5 gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              onClick={() => handlePresetSelect(p.id)}
              className={cn(
                "group relative flex flex-col items-center gap-1.5 p-1 rounded-xl transition-all duration-300",
                settings.preset === p.id 
                  ? "bg-white/10 shadow-[0_0_20px_rgba(255,255,255,0.05)] border border-white/10" 
                  : "hover:bg-white/5 border border-transparent"
              )}
            >
              <div className={cn(
                "w-full aspect-square rounded-lg bg-gradient-to-br transition-all duration-500",
                p.colors,
                settings.preset === p.id ? "scale-100 shadow-lg" : "scale-90 opacity-60 group-hover:scale-95 group-hover:opacity-100"
              )} />
              <span className={cn(
                "text-[9px] font-bold uppercase tracking-tighter transition-colors",
                settings.preset === p.id ? "text-primary" : "text-slate-500 group-hover:text-slate-300"
              )}>
                {p.name}
              </span>
              {settings.preset === p.id && (
                <div className="absolute -bottom-0.5 w-1 h-1 rounded-full bg-primary" />
              )}
            </button>
          ))}
        </div>

        {/* Advanced Controls */}
        <Collapsible open={isOpen} onOpenChange={setIsOpen}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="w-full h-7 text-[10px] font-bold text-slate-500 hover:text-white transition-colors group">
              ADVANCED ADJUSTMENTS
              <ChevronDown className={cn("w-3 h-3 ml-1 transition-transform duration-300", isOpen && "rotate-180")} />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-4 space-y-6">
            <div className="space-y-3">
              <div className="flex justify-between items-center px-1">
                <Label className="text-[11px] font-bold text-slate-300 flex items-center gap-2">
                  <Sun className="w-3 h-3 text-amber-400/70" /> Brightness
                </Label>
                <span className="text-[10px] font-mono text-slate-500">
                  {settings.brightness > 0 ? "+" : ""}{settings.brightness.toFixed(2)}
                </span>
              </div>
              <Slider
                value={[settings.brightness]}
                onValueChange={([v]) => updateValue("brightness", v)}
                min={-0.2}
                max={0.2}
                step={0.01}
                className="py-1"
              />
            </div>

            <div className="space-y-3">
              <div className="flex justify-between items-center px-1">
                <Label className="text-[11px] font-bold text-slate-300 flex items-center gap-2">
                  <Contrast className="w-3 h-3 text-indigo-400/70" /> Contrast
                </Label>
                <span className="text-[10px] font-mono text-slate-500">
                  {settings.contrast.toFixed(2)}x
                </span>
              </div>
              <Slider
                value={[settings.contrast]}
                onValueChange={([v]) => updateValue("contrast", v)}
                min={0.5}
                max={2.0}
                step={0.05}
                className="py-1"
              />
            </div>

            <div className="space-y-3">
              <div className="flex justify-between items-center px-1">
                <Label className="text-[11px] font-bold text-slate-300 flex items-center gap-2">
                  <Droplets className="w-3 h-3 text-cyan-400/70" /> Saturation
                </Label>
                <span className="text-[10px] font-mono text-slate-500">
                  {settings.saturation.toFixed(2)}x
                </span>
              </div>
              <Slider
                value={[settings.saturation]}
                onValueChange={([v]) => updateValue("saturation", v)}
                min={0}
                max={3.0}
                step={0.1}
                className="py-1"
              />
            </div>
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
};
