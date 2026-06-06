import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2, RotateCcw, Shuffle, ListOrdered, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

interface MetadataItem {
    title: string;
    description: string;
}

interface MetadataPoolSettings {
    mode: 'random' | 'sequential';
    items: MetadataItem[];
}

interface MetadataPoolDialogProps {
    projectId: string;
}

export function MetadataPoolDialog({ projectId }: MetadataPoolDialogProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [pool, setPool] = useState<MetadataPoolSettings>({ mode: 'random', items: [] });

    // New item inputs
    const [newTitle, setNewTitle] = useState("");
    const [newDescription, setNewDescription] = useState("");

    const fetchPool = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('projects')
                .select('youtube_settings')
                .eq('id', projectId)
                .single();

            if (error) throw error;

            const settings = data.youtube_settings as any;
            if (settings?.metadata_pool) {
                setPool(settings.metadata_pool);
            } else {
                setPool({ mode: 'random', items: [] });
            }
        } catch (error) {
            console.error("Error fetching metadata pool:", error);
        } finally {
            setLoading(false);
        }
    };

    const savePool = async (newPool: MetadataPoolSettings) => {
        try {
            // First get current settings to merge
            const { data: currentData } = await supabase
                .from('projects')
                .select('youtube_settings')
                .eq('id', projectId)
                .single();

            const currentSettings = (currentData?.youtube_settings as Record<string, any>) || {};

            const { error } = await supabase
                .from('projects')
                .update({
                    youtube_settings: {
                        ...currentSettings,
                        metadata_pool: newPool as any
                    }
                })
                .eq('id', projectId);

            if (error) throw error;

            setPool(newPool);
            toast({ title: "Metadata pool saved" });
        } catch (error: any) {
            toast({
                title: "Error saving pool",
                description: error.message,
                variant: "destructive"
            });
        }
    };

    const handleAddItem = () => {
        if (!newTitle.trim()) {
            toast({ title: "Title is required", variant: "destructive" });
            return;
        }

        const newItem: MetadataItem = {
            title: newTitle.trim(),
            description: newDescription.trim()
        };

        const updatedPool = {
            ...pool,
            items: [...pool.items, newItem]
        };

        savePool(updatedPool);
        setNewTitle("");
        setNewDescription("");
    };

    const handleRemoveItem = (index: number) => {
        const updatedPool = {
            ...pool,
            items: pool.items.filter((_, i) => i !== index)
        };
        savePool(updatedPool);
    };

    const handleModeChange = (mode: 'random' | 'sequential') => {
        const updatedPool = { ...pool, mode };
        savePool(updatedPool);
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => {
            setIsOpen(open);
            if (open) fetchPool();
        }}>
            <DialogTrigger asChild>
                <Button variant="outline" className="w-full sm:w-auto">
                    <RotateCcw className="w-4 h-4 mr-2" />
                    Metadata Rotator
                </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Metadata Rotation Pool</DialogTitle>
                    <DialogDescription>
                        Add multiple titles and descriptions. The AI will randomly select one for each upload to avoid spam detection.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-6 py-4">
                    {/* Settings */}
                    <div className="flex items-center justify-between p-4 bg-muted/30 rounded-lg">
                        <Label>Rotation Mode</Label>
                        <div className="flex gap-2">
                            <Button
                                variant={pool.mode === 'random' ? 'default' : 'outline'}
                                size="sm"
                                onClick={() => handleModeChange('random')}
                            >
                                <Shuffle className="w-4 h-4 mr-2" />
                                Random
                            </Button>
                            <Button
                                variant={pool.mode === 'sequential' ? 'default' : 'outline'}
                                size="sm"
                                onClick={() => handleModeChange('sequential')}
                            >
                                <ListOrdered className="w-4 h-4 mr-2" />
                                Sequential
                            </Button>
                        </div>
                    </div>

                    {/* Add New Item */}
                    <div className="space-y-4 border rounded-lg p-4 bg-card">
                        <h4 className="font-medium text-sm">Add New Variation</h4>
                        <div className="space-y-3">
                            <div>
                                <Label className="text-xs text-muted-foreground">Title</Label>
                                <Input
                                    value={newTitle}
                                    onChange={(e) => setNewTitle(e.target.value)}
                                    placeholder="Video Title..."
                                />
                            </div>
                            <div>
                                <Label className="text-xs text-muted-foreground">Description</Label>
                                <Textarea
                                    value={newDescription}
                                    onChange={(e) => setNewDescription(e.target.value)}
                                    placeholder="Video Description..."
                                    className="min-h-[80px]"
                                />
                            </div>
                            <Button onClick={handleAddItem} disabled={!newTitle.trim()} className="w-full">
                                <Plus className="w-4 h-4 mr-2" />
                                Add to Pool
                            </Button>
                        </div>
                    </div>

                    {/* Existing Items */}
                    <div className="space-y-3">
                        <h4 className="font-medium text-sm flex items-center justify-between">
                            Title/Description Pairs
                            <span className="text-xs text-muted-foreground bg-secondary px-2 py-1 rounded-full">
                                {pool.items.length} items
                            </span>
                        </h4>

                        {loading ? (
                            <div className="text-center py-4 text-muted-foreground">Loading...</div>
                        ) : pool.items.length === 0 ? (
                            <div className="text-center py-8 border border-dashed rounded-lg text-muted-foreground text-sm">
                                No items in pool. Add your first variation above.
                            </div>
                        ) : (
                            <div className="grid gap-3 max-h-[300px] overflow-y-auto pr-2">
                                {pool.items.map((item, idx) => (
                                    <div key={idx} className="relative group border rounded-lg p-3 hover:bg-muted/20 transition-colors">
                                        <div className="pr-8">
                                            <p className="font-medium text-sm mb-1">{item.title}</p>
                                            <p className="text-xs text-muted-foreground line-clamp-2">
                                                {item.description || "(No description)"}
                                            </p>
                                        </div>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                                            onClick={() => handleRemoveItem(idx)}
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="secondary" onClick={() => setIsOpen(false)}>Close</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
