import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileText, Trash2, ExternalLink, Gamepad2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface TrainingScript {
  id: string;
  source_url: string;
  transcript: string;
  title: string | null;
  gamemode_id: string | null;
  created_at: string;
}

interface Gamemode {
  id: string;
  name: string;
}

interface TrainingScriptListProps {
  gamemodes: Gamemode[];
}

export const TrainingScriptList = ({ gamemodes }: TrainingScriptListProps) => {
  const [scripts, setScripts] = useState<TrainingScript[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    fetchScripts();
  }, []);

  const fetchScripts = async () => {
    try {
      const { data, error } = await supabase
        .from("training_scripts")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setScripts(data || []);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to load training scripts",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase.from("training_scripts").delete().eq("id", id);
      if (error) throw error;

      setScripts(scripts.filter((s) => s.id !== id));
      toast({ title: "Deleted", description: "Training script removed" });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message,
      });
    }
  };

  const getGamemodeName = (gamemodeId: string | null) => {
    if (!gamemodeId) return "General";
    return gamemodes.find((g) => g.id === gamemodeId)?.name || "Unknown";
  };

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[1, 2, 3].map((i) => (
          <Card key={i} className="glass-effect animate-pulse">
            <CardContent className="h-32" />
          </Card>
        ))}
      </div>
    );
  }

  if (scripts.length === 0) {
    return (
      <Card className="glass-effect text-center py-12">
        <CardContent>
          <FileText className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-xl font-semibold mb-2">No training scripts yet</h3>
          <p className="text-muted-foreground">Add TikTok videos to train the AI on your script style</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {scripts.map((script) => (
        <Card key={script.id} className="glass-effect">
          <CardHeader className="pb-2">
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <CardTitle className="text-base truncate">
                  {script.title || "Untitled Script"}
                </CardTitle>
                <Badge variant={script.gamemode_id ? "secondary" : "outline"} className="mt-1">
                  {script.gamemode_id ? (
                    <Gamepad2 className="w-3 h-3 mr-1" />
                  ) : (
                    <span className="mr-1">🌐</span>
                  )}
                  {getGamemodeName(script.gamemode_id)}
                </Badge>
              </div>
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => window.open(script.source_url, "_blank")}
                >
                  <ExternalLink className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 hover:bg-destructive/20"
                  onClick={() => handleDelete(script.id)}
                >
                  <Trash2 className="w-4 h-4 text-destructive" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground line-clamp-3">{script.transcript}</p>
            <p className="text-xs text-muted-foreground/60 mt-2">
              Added {new Date(script.created_at).toLocaleDateString()}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};
