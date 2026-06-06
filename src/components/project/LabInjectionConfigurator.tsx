import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, Upload, Database, Save, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface LabInjectionConfiguratorProps {
    gamemodeId: string | null;
}

export const LabInjectionConfigurator: React.FC<LabInjectionConfiguratorProps> = ({
    gamemodeId
}) => {
    const { toast } = useToast();
    const [injections, setInjections] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [brainData, setBrainData] = useState<any>(null);

    useEffect(() => {
        if (!gamemodeId) return;
        const fetchGamemode = async () => {
            setLoading(true);
            try {
                const { data, error } = await supabase
                    .from("gamemodes")
                    .select("brain")
                    .eq("id", gamemodeId)
                    .single();

                if (error) throw error;

                if (data?.brain) {
                    setBrainData(data.brain);
                    const parsedBrain = data.brain as any;
                    if (parsedBrain.injections && Array.isArray(parsedBrain.injections)) {
                        setInjections(parsedBrain.injections);
                    }
                }
            } catch (err) {
                console.error("Failed to fetch gamemode brain:", err);
            } finally {
                setLoading(false);
            }
        };
        fetchGamemode();
    }, [gamemodeId]);

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const text = event.target?.result as string;
                const lines = text.split('\n').filter(line => line.trim() !== '');
                const parsed = lines.map(line => {
                    try {
                        return JSON.parse(line);
                    } catch (e) {
                        return null;
                    }
                }).filter(Boolean);

                setInjections((prev) => {
                    // Optional: remove duplicates or just append
                    return [...prev, ...parsed];
                });

                toast({
                    title: "Dataset Loaded",
                    description: `Successfully loaded ${parsed.length} JSONL records. Don't forget to save.`,
                });
            } catch (err: any) {
                toast({
                    variant: "destructive",
                    title: "Parse Error",
                    description: "Failed to parse JSONL file. Ensure each line is valid JSON.",
                });
            }
        };
        reader.readAsText(file);
    };

    const clearInjections = () => {
        setInjections([]);
    };

    const handleSave = async () => {
        if (!gamemodeId) return;
        setSaving(true);
        try {
            const updatedBrain = {
                ...(brainData || {}),
                injections
            };

            const { error } = await supabase
                .from("gamemodes")
                .update({ brain: updatedBrain } as any)
                .eq("id", gamemodeId);

            if (error) throw error;

            toast({
                title: "✓ Injections Saved",
                description: "Lab injections have been committed to the AI Brain.",
            });
            setBrainData(updatedBrain);
        } catch (err: any) {
            console.error("Failed to save injections:", err);
            toast({
                variant: "destructive",
                title: "Save Error",
                description: err.message || "Failed to save injections.",
            });
        } finally {
            setSaving(false);
        }
    };

    if (!gamemodeId) {
        return null;
    }

    return (
        <div className="p-[1px] rounded-[32px] bg-gradient-to-br from-white/10 to-transparent group hover:from-[#b638fc]/40 transition-all duration-500">
            <div className="bg-[#161224]/80 backdrop-blur-3xl rounded-[31px] p-6 space-y-6">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-[#b638fc]/10 flex items-center justify-center border border-[#b638fc]/20">
                        <Database className="w-6 h-6 text-[#b638fc]" />
                    </div>
                    <div>
                        <h3 className="text-sm font-bold text-white">Lab Injections</h3>
                        <p className="text-[10px] text-white/40 font-bold uppercase tracking-tighter">AI Fine-Tuning Angles</p>
                    </div>
                </div>

                {loading ? (
                    <div className="flex items-center justify-center py-8">
                        <Loader2 className="w-5 h-5 animate-spin text-[#b638fc]" />
                    </div>
                ) : (
                    <div className="space-y-4">
                        <div className="flex items-center justify-between p-4 bg-white/[0.02] border border-white/5 rounded-2xl">
                            <div>
                                <h4 className="font-semibold text-sm text-white">Active Injections</h4>
                                <p className="text-xs text-slate-400">{injections.length} records in gamemode brain</p>
                            </div>
                            <div className="flex gap-2">
                                <Label htmlFor="jsonl-upload" className="cursor-pointer">
                                    <div className="flex items-center gap-2 px-4 py-2 bg-primary/20 text-primary hover:bg-primary/30 border border-primary/30 rounded-xl text-sm font-medium transition-colors">
                                        <Upload className="w-4 h-4" />
                                        Upload JSONL
                                    </div>
                                    <Input
                                        id="jsonl-upload"
                                        type="file"
                                        accept=".jsonl"
                                        className="hidden"
                                        onChange={handleFileUpload}
                                    />
                                </Label>
                                {injections.length > 0 && (
                                    <Button variant="ghost" size="icon" onClick={clearInjections} className="text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-xl h-9 w-9">
                                        <Trash2 className="w-4 h-4" />
                                    </Button>
                                )}
                            </div>
                        </div>

                        {injections.length > 0 && (
                            <div className="space-y-2">
                                <Label className="text-xs font-semibold text-slate-400 pl-1">Dataset Preview (First Record)</Label>
                                <pre className="p-4 rounded-xl bg-white/[0.02] border border-white/5 text-xs overflow-auto max-h-[200px] leading-relaxed font-mono text-slate-300">
                                    {JSON.stringify(injections[0], null, 2)}
                                </pre>
                            </div>
                        )}

                        <div className="pt-2">
                            <Button
                                onClick={handleSave}
                                disabled={saving}
                                className="w-full h-11 bg-white/5 text-white font-semibold rounded-xl hover:bg-white/10 transition-all gap-2 text-sm border border-white/10"
                            >
                                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                Save Injections to Brain
                            </Button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
