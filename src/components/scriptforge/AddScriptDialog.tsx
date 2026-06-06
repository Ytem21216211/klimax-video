import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Link, Sparkles } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Gamemode {
  id: string;
  name: string;
}

interface AddScriptDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  gamemodes: Gamemode[];
}

export const AddScriptDialog = ({ open, onOpenChange, gamemodes }: AddScriptDialogProps) => {
  const [url, setUrl] = useState("");
  const [gamemodeId, setGamemodeId] = useState<string>("");
  const [processing, setProcessing] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim() || !gamemodeId) return;

    setProcessing(true);
    try {
      // Call edge function to transcribe the video
      // Pass null for "general" to indicate no specific gamemode
      const { data, error } = await supabase.functions.invoke("transcribe-training-script", {
        body: { url: url.trim(), gamemodeId: gamemodeId === "general" ? null : gamemodeId },
      });

      if (error) throw error;

      toast({
        title: "Success!",
        description: "Video transcribed and added to training data",
      });

      setUrl("");
      setGamemodeId("");
      onOpenChange(false);
      
      // Trigger a refresh by reloading
      window.location.reload();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to process video",
      });
    } finally {
      setProcessing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            Add Training Script
          </DialogTitle>
          <DialogDescription>
            Paste a TikTok video URL. The AI will transcribe it and use it to learn your script style.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="url">TikTok Video URL</Label>
            <div className="relative">
              <Link className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                id="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://www.tiktok.com/@user/video/..."
                className="pl-10"
                disabled={processing}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="gamemode">Gamemode</Label>
            <Select value={gamemodeId} onValueChange={setGamemodeId} disabled={processing}>
              <SelectTrigger>
                <SelectValue placeholder="Select a gamemode" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="general">
                  <span className="flex items-center gap-2">
                    🌐 General (works for any gamemode)
                  </span>
                </SelectItem>
                {gamemodes.map((gamemode) => (
                  <SelectItem key={gamemode.id} value={gamemode.id}>
                    {gamemode.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={processing}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={processing || !url.trim() || !gamemodeId}>
              {processing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Transcribing...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-2" />
                  Add Script
                </>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
