import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Gamepad2, Save, X } from "lucide-react";
import { LabInjectionConfigurator } from "@/components/project/LabInjectionConfigurator";

interface Gamemode {
  id: string;
  name: string;
  description: string;
}

interface GamemodeEditorProps {
  gamemode?: Gamemode;
  onSave: (name: string, description: string) => void;
  onCancel: () => void;
}

export const GamemodeEditor = ({ gamemode, onSave, onCancel }: GamemodeEditorProps) => {
  const [name, setName] = useState(gamemode?.name || "");
  const [description, setDescription] = useState(gamemode?.description || "");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !description.trim()) return;

    setSaving(true);
    try {
      await onSave(name.trim(), description.trim());
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="glass-effect border-primary/50">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Gamepad2 className="w-5 h-5 text-primary" />
          {gamemode ? "Edit Gamemode" : "Create Gamemode"}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Bedwars, Skywars, UHC..."
              className="bg-background/50"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe what this gamemode is, how it works, common terminology, gameplay flow, and any details that would help the AI understand and write scripts for this type of content..."
              className="bg-background/50 min-h-[150px]"
            />
            <p className="text-xs text-muted-foreground">
              The more detail you provide, the better the AI will understand your content style.
            </p>
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onCancel} disabled={saving}>
              <X className="w-4 h-4 mr-2" />
              Cancel
            </Button>
            <Button type="submit" disabled={saving || !name.trim() || !description.trim()}>
              <Save className="w-4 h-4 mr-2" />
              {saving ? "Saving..." : "Save"}
            </Button>
          </div>
        </form>
      </CardContent>
      {gamemode && (
        <div className="border-t border-primary/20 p-6 pt-0 mt-4">
          <LabInjectionConfigurator gamemodeId={gamemode.id} />
        </div>
      )}
    </Card>
  );
};
