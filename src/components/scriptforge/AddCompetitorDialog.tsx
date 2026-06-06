import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
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
import { Loader2, Youtube, Music2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface Gamemode {
  id: string;
  name: string;
}

interface AddCompetitorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  gamemodes: Gamemode[];
  onAdded: () => void;
}

export function AddCompetitorDialog({
  open,
  onOpenChange,
  gamemodes,
  onAdded,
}: AddCompetitorDialogProps) {
  const [channelUrl, setChannelUrl] = useState("");
  const [platform, setPlatform] = useState<"youtube" | "tiktok">("youtube");
  const [gamemodeId, setGamemodeId] = useState<string>("");
  const [channelName, setChannelName] = useState("");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!channelUrl) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Please enter a channel URL",
      });
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("scrape-competitor-channel", {
        body: {
          channelUrl,
          platform,
          gamemodeId: gamemodeId || null,
          channelName: channelName || undefined,
        },
      });

      if (error) throw error;

      toast({
        title: "Competitor Added!",
        description: `${data.videosFound} videos found and ${data.videosSaved} saved`,
      });

      onAdded();
      onOpenChange(false);
      resetForm();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message,
      });
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setChannelUrl("");
    setPlatform("youtube");
    setGamemodeId("");
    setChannelName("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Competitor Channel</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Platform</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={platform === "youtube" ? "default" : "outline"}
                onClick={() => setPlatform("youtube")}
                className="flex-1 gap-2"
              >
                <Youtube className="w-4 h-4" />
                YouTube
              </Button>
              <Button
                type="button"
                variant={platform === "tiktok" ? "default" : "outline"}
                onClick={() => setPlatform("tiktok")}
                className="flex-1 gap-2"
              >
                <Music2 className="w-4 h-4" />
                TikTok
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="channelUrl">Channel URL</Label>
            <Input
              id="channelUrl"
              placeholder={
                platform === "youtube"
                  ? "https://youtube.com/@channelname"
                  : "https://tiktok.com/@username"
              }
              value={channelUrl}
              onChange={(e) => setChannelUrl(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              {platform === "youtube"
                ? "Supports: @handle, /channel/ID, /c/name, /user/name"
                : "Format: @username"}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="channelName">Channel Name (optional)</Label>
            <Input
              id="channelName"
              placeholder="Display name for this competitor"
              value={channelName}
              onChange={(e) => setChannelName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="gamemode">Gamemode</Label>
            <Select value={gamemodeId} onValueChange={setGamemodeId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a gamemode (optional)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="general">General (All gamemodes)</SelectItem>
                {gamemodes.map((gamemode) => (
                  <SelectItem key={gamemode.id} value={gamemode.id}>
                    {gamemode.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Adding...
                </>
              ) : (
                "Add & Scrape"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
