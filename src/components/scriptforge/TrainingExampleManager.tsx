import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileText, Trash2, Plus, Brain, Quote, Sparkles } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface TrainingExample {
  id: string;
  type: 'script' | 'hook';
  content: string;
  title: string | null;
  gamemode_id: string;
  created_at: string;
}

interface Gamemode {
  id: string;
  name: string;
}

interface TrainingExampleManagerProps {
  gamemodes: Gamemode[];
}

export const TrainingExampleManager = ({ gamemodes }: TrainingExampleManagerProps) => {
  const [examples, setExamples] = useState<TrainingExample[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [newType, setNewType] = useState<'script' | 'hook'>('script');
  const [newContent, setNewContent] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [selectedGamemodeId, setSelectedGamemodeId] = useState<string>("");
  const { toast } = useToast();

  useEffect(() => {
    if (gamemodes.length > 0) {
      setSelectedGamemodeId(gamemodes[0].id);
      fetchExamples(gamemodes[0].id);
    }
  }, [gamemodes]);

  const fetchExamples = async (gamemodeId: string) => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("training_examples")
        .select("*")
        .eq("gamemode_id", gamemodeId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setExamples(data || []);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to load examples",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = async () => {
    if (!newContent) return;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("No user");

      const { data, error } = await supabase
        .from("training_examples")
        .insert([{
          user_id: user.id,
          gamemode_id: selectedGamemodeId,
          type: newType,
          content: newContent,
          title: newTitle || (newType === 'hook' ? "Example Hook" : "Example Script")
        }])
        .select()
        .single();

      if (error) throw error;

      setExamples([data, ...examples]);
      setIsAdding(false);
      setNewContent("");
      setNewTitle("");
      toast({ title: "Success", description: "Example added to Neural Brain" });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message,
      });
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase.from("training_examples").delete().eq("id", id);
      if (error) throw error;

      setExamples(examples.filter((e) => e.id !== id));
      toast({ title: "Deleted", description: "Example removed" });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message,
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Select value={selectedGamemodeId} onValueChange={(val) => {
            setSelectedGamemodeId(val);
            fetchExamples(val);
          }}>
            <SelectTrigger className="w-[200px] bg-[#161224]/50 border-white/10 rounded-xl">
              <SelectValue placeholder="Select Gamemode" />
            </SelectTrigger>
            <SelectContent className="bg-[#0c0916] border-white/10 text-white">
              {gamemodes.map((g) => (
                <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary/10 border border-primary/20 text-primary animate-pulse">
            <Brain className="w-4 h-4" />
            <span className="text-[10px] font-black uppercase tracking-widest">Neural Learning Active</span>
          </div>
        </div>

        <Dialog open={isAdding} onOpenChange={setIsAdding}>
          <DialogTrigger asChild>
            <Button className="rounded-full px-6 bg-gradient-to-r from-primary to-purple-600 hover:scale-105 transition-all">
              <Plus className="w-4 h-4 mr-2" />
              Add Example
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-[#0c0916] border-white/10 text-white max-w-2xl">
            <DialogHeader>
              <DialogTitle className="text-2xl font-black tracking-tighter">Inject Neural Data</DialogTitle>
              <DialogDescription className="text-white/40">Add proven scripts or hooks to guide the AI's generation logic.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Type</Label>
                  <Select value={newType} onValueChange={(val: any) => setNewType(val)}>
                    <SelectTrigger className="bg-white/5 border-white/10">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-[#0c0916] border-white/10 text-white">
                      <SelectItem value="script">Full Script</SelectItem>
                      <SelectItem value="hook">Opening Hook</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Label (Optional)</Label>
                  <Input 
                    placeholder="e.g. High Retention Hook" 
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    className="bg-white/5 border-white/10"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Content</Label>
                <Textarea 
                  placeholder="Paste the example content here..." 
                  className="min-h-[200px] bg-white/5 border-white/10 resize-none"
                  value={newContent}
                  onChange={(e) => setNewContent(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setIsAdding(false)}>Cancel</Button>
              <Button 
                onClick={handleAdd}
                className="bg-primary hover:bg-primary/80 px-8"
                disabled={!newContent}
              >
                Inject to Brain
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="bg-[#161224]/40 border-white/10 animate-pulse">
              <CardContent className="h-32" />
            </Card>
          ))}
        </div>
      ) : examples.length === 0 ? (
        <Card className="bg-[#161224]/20 border-dashed border-white/10 py-20 text-center rounded-[30px]">
          <CardContent>
            <Quote className="w-12 h-12 text-white/10 mx-auto mb-4" />
            <p className="text-white/40 font-bold uppercase tracking-widest text-[10px]">No Neural Examples Yet</p>
            <p className="text-white/20 text-xs mt-2">Inject proven scripts to force the AI into better patterns.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {examples.map((example) => (
            <Card key={example.id} className="group bg-[#161224]/60 border-white/10 hover:border-primary/50 transition-all rounded-[24px] overflow-hidden">
              <CardHeader className="pb-3 border-b border-white/5">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <CardTitle className="text-sm font-bold truncate">
                      {example.title}
                    </CardTitle>
                    <Badge variant="outline" className={cn(
                      "text-[8px] font-black uppercase tracking-widest",
                      example.type === 'hook' ? "text-pink-400 border-pink-400/20 bg-pink-400/5" : "text-blue-400 border-blue-400/20 bg-blue-400/5"
                    )}>
                      {example.type}
                    </Badge>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-white/20 hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-all"
                    onClick={() => handleDelete(example.id)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="pt-4">
                <p className="text-xs text-white/60 line-clamp-4 leading-relaxed font-mono">
                  "{example.content}"
                </p>
                <div className="flex items-center justify-between mt-4 pt-4 border-t border-white/5">
                  <div className="flex items-center gap-2 text-[8px] font-bold text-white/20 uppercase tracking-tighter">
                    <Sparkles className="w-3 h-3" />
                    Neural Weight: High
                  </div>
                  <span className="text-[9px] text-white/20">
                    {new Date(example.created_at).toLocaleDateString()}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

const cn = (...classes: any[]) => classes.filter(Boolean).join(' ');
