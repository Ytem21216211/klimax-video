import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Gamepad2, Pencil, Trash2 } from "lucide-react";

interface Gamemode {
  id: string;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
}

interface GamemodeListProps {
  gamemodes: Gamemode[];
  onEdit: (gamemode: Gamemode) => void;
  onDelete: (id: string) => void;
}

export const GamemodeList = ({ gamemodes, onEdit, onDelete }: GamemodeListProps) => {
  if (gamemodes.length === 0) {
    return (
      <Card className="glass-effect text-center py-12">
        <CardContent>
          <Gamepad2 className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-xl font-semibold mb-2">No gamemodes yet</h3>
          <p className="text-muted-foreground">Create your first gamemode to start training</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {gamemodes.map((gamemode) => (
        <Card key={gamemode.id} className="glass-effect hover:scale-[1.02] transition-transform">
          <CardHeader className="pb-2">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center">
                  <Gamepad2 className="w-4 h-4 text-purple-500" />
                </div>
                <CardTitle className="text-lg">{gamemode.name}</CardTitle>
              </div>
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 hover:bg-primary/20"
                  onClick={() => onEdit(gamemode)}
                >
                  <Pencil className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 hover:bg-destructive/20"
                  onClick={() => onDelete(gamemode.id)}
                >
                  <Trash2 className="w-4 h-4 text-destructive" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground line-clamp-3">{gamemode.description}</p>
            <p className="text-xs text-muted-foreground/60 mt-2">
              Created {new Date(gamemode.created_at).toLocaleDateString()}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};
