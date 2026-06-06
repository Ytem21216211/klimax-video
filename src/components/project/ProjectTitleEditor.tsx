import React, { useState, useRef, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Film, Pencil, Check, X, Settings2, Gamepad2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

interface Gamemode {
  id: string;
  name: string;
}

interface ProjectTitleEditorProps {
  title: string;
  description?: string;
  gamemodeId?: string | null;
  onSave: (data: { title?: string; description?: string; gamemodeId?: string | null }) => Promise<void>;
  disabled?: boolean;
}

export const ProjectTitleEditor: React.FC<ProjectTitleEditorProps> = ({
  title,
  description = "",
  gamemodeId = null,
  onSave,
  disabled = false,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editValue, setEditValue] = useState(title);
  const [editDescription, setEditDescription] = useState(description);
  const [editGamemodeId, setEditGamemodeId] = useState<string | null>(gamemodeId);
  const [gamemodes, setGamemodes] = useState<Gamemode[]>([]);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setEditValue(title);
    setEditDescription(description);
    setEditGamemodeId(gamemodeId);
  }, [title, description, gamemodeId]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  useEffect(() => {
    if (isDialogOpen) {
      fetchGamemodes();
    }
  }, [isDialogOpen]);

  const fetchGamemodes = async () => {
    const { data } = await supabase
      .from("gamemodes")
      .select("id, name")
      .order("name");
    setGamemodes(data || []);
  };

  const handleSaveTitle = async () => {
    if (!editValue.trim() || editValue.trim() === title) {
      setIsEditing(false);
      setEditValue(title);
      return;
    }

    setSaving(true);
    try {
      await onSave({ title: editValue.trim() });
      setIsEditing(false);
    } catch (error) {
      console.error("Failed to save title:", error);
      setEditValue(title);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveSettings = async () => {
    setSaving(true);
    try {
      await onSave({
        description: editDescription.trim(),
        gamemodeId: editGamemodeId,
      });
      setIsDialogOpen(false);
    } catch (error) {
      console.error("Failed to save settings:", error);
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setEditValue(title);
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSaveTitle();
    } else if (e.key === "Escape") {
      handleCancel();
    }
  };

  const getGamemodeName = () => {
    if (!gamemodeId) return null;
    return gamemodes.find((g) => g.id === gamemodeId)?.name;
  };

  if (isEditing) {
    return (
      <div className="flex items-center gap-2">
        <div className="relative">
          <Film className="w-6 h-6 text-primary" />
          <div className="absolute inset-0 bg-primary/50 blur-md opacity-50" />
        </div>
        <Input
          ref={inputRef}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => {
            setTimeout(() => {
              if (!saving) handleCancel();
            }, 150);
          }}
          className="h-8 w-48 bg-background/50 border-primary/50 text-lg font-bold"
          disabled={saving}
        />
        <Button
          size="icon"
          variant="ghost"
          onClick={handleSaveTitle}
          disabled={saving}
          className="h-7 w-7 hover:bg-primary/20"
        >
          <Check className="w-4 h-4 text-primary" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          onClick={handleCancel}
          disabled={saving}
          className="h-7 w-7 hover:bg-destructive/20"
        >
          <X className="w-4 h-4 text-destructive" />
        </Button>
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center gap-3 group">
        <div className="relative">
          <Film className="w-6 h-6 text-primary" />
          <div className="absolute inset-0 bg-primary/50 blur-md opacity-50" />
        </div>
        <h1 className="text-xl font-bold gradient-text">{title}</h1>
        {!disabled && (
          <>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => setIsEditing(true)}
              className={cn(
                "h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-primary/20",
                "focus:opacity-100"
              )}
              title="Edit title"
            >
              <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => setIsDialogOpen(true)}
              className={cn(
                "h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-secondary/20",
                "focus:opacity-100"
              )}
              title="Project settings"
            >
              <Settings2 className="w-3.5 h-3.5 text-muted-foreground" />
            </Button>
          </>
        )}
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings2 className="w-5 h-5 text-primary" />
              Project Settings
            </DialogTitle>
            <DialogDescription>
              Add a description and select a gamemode to help the AI generate better scripts.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="description">Server Description</Label>
              <Textarea
                id="description"
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                placeholder="Describe your Minecraft server, its features, community, unique aspects..."
                className="min-h-[100px]"
              />
              <p className="text-xs text-muted-foreground">
                This helps the AI understand your server when generating scripts.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="gamemode">Gamemode</Label>
              <Select
                value={editGamemodeId || "none"}
                onValueChange={(v) => setEditGamemodeId(v === "none" ? null : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a gamemode" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No gamemode</SelectItem>
                  {gamemodes.map((gm) => (
                    <SelectItem key={gm.id} value={gm.id}>
                      <div className="flex items-center gap-2">
                        <Gamepad2 className="w-4 h-4" />
                        {gm.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Link this project to a gamemode for better script generation.
              </p>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setIsDialogOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSaveSettings} disabled={saving}>
              {saving ? "Saving..." : "Save Settings"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
