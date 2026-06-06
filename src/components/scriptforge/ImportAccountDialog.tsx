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
import { Loader2, Users, Sparkles, CheckCircle, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Progress } from "@/components/ui/progress";

interface Gamemode {
  id: string;
  name: string;
}

interface ImportAccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  gamemodes: Gamemode[];
}

export const ImportAccountDialog = ({ open, onOpenChange, gamemodes }: ImportAccountDialogProps) => {
  const [accountUrl, setAccountUrl] = useState("");
  const [gamemodeId, setGamemodeId] = useState<string>("");
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState<{
    status: string;
    imported?: number;
    skipped?: number;
    errors?: string[];
  } | null>(null);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accountUrl.trim() || !gamemodeId) return;

    setProcessing(true);
    setProgress({ status: "Fetching videos from TikTok account..." });

    try {
      // Pass null for "general" to indicate no specific gamemode
      const { data, error } = await supabase.functions.invoke("import-tiktok-account", {
        body: { accountUrl: accountUrl.trim(), gamemodeId: gamemodeId === "general" ? null : gamemodeId },
      });

      if (error) throw error;

      if (data.error) throw new Error(data.error);

      setProgress({
        status: "complete",
        imported: data.imported,
        skipped: data.skipped,
        errors: data.errors,
      });

      toast({
        title: "Import Complete!",
        description: data.message,
      });

      // Auto-close after 3 seconds if successful
      if (data.imported > 0) {
        setTimeout(() => {
          setAccountUrl("");
          setGamemodeId("");
          setProgress(null);
          onOpenChange(false);
          window.location.reload();
        }, 3000);
      }
    } catch (error: any) {
      console.error("Import error:", error);
      setProgress(null);
      toast({
        variant: "destructive",
        title: "Import Failed",
        description: error.message || "Failed to import TikTok account",
      });
    } finally {
      setProcessing(false);
    }
  };

  const handleClose = () => {
    if (!processing) {
      setAccountUrl("");
      setGamemodeId("");
      setProgress(null);
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="w-5 h-5 text-primary" />
            Import TikTok Account
          </DialogTitle>
          <DialogDescription>
            Import all videos with 10,000+ views from a TikTok account. The AI will transcribe each video and use them to learn the script style.
          </DialogDescription>
        </DialogHeader>

        {progress?.status === "complete" ? (
          <div className="space-y-4 py-4">
            <div className="flex items-center gap-3 text-green-500">
              <CheckCircle className="w-6 h-6" />
              <span className="font-semibold">Import Complete!</span>
            </div>
            
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="bg-muted p-3 rounded-lg">
                <p className="text-muted-foreground">Imported</p>
                <p className="text-2xl font-bold text-primary">{progress.imported}</p>
              </div>
              <div className="bg-muted p-3 rounded-lg">
                <p className="text-muted-foreground">Skipped (duplicates)</p>
                <p className="text-2xl font-bold">{progress.skipped}</p>
              </div>
            </div>

            {progress.errors && progress.errors.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground flex items-center gap-1">
                  <AlertCircle className="w-4 h-4" />
                  {progress.errors.length} videos couldn't be processed:
                </p>
                <div className="max-h-24 overflow-y-auto text-xs text-muted-foreground bg-muted p-2 rounded">
                  {progress.errors.map((err, i) => (
                    <p key={i}>• {err}</p>
                  ))}
                </div>
              </div>
            )}

            <Button onClick={handleClose} className="w-full">
              Done
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="accountUrl">TikTok Account URL or Username</Label>
              <div className="relative">
                <Users className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="accountUrl"
                  value={accountUrl}
                  onChange={(e) => setAccountUrl(e.target.value)}
                  placeholder="https://www.tiktok.com/@username or @username"
                  className="pl-10"
                  disabled={processing}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Scans the last 30 videos and imports those with 10k+ views
              </p>
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

            {processing && progress && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {progress.status}
                </div>
                <Progress value={undefined} className="h-2" />
                <p className="text-xs text-muted-foreground">
                  This may take a few minutes depending on the number of videos...
                </p>
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={handleClose}
                disabled={processing}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={processing || !accountUrl.trim() || !gamemodeId}>
                {processing ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Importing...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 mr-2" />
                    Import Account
                  </>
                )}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
};
