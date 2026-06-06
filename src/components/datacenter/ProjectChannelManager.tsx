import { useState, useEffect } from "react";
import { 
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger 
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { 
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue 
} from "@/components/ui/select";
import { 
  Card, CardContent, CardHeader, CardTitle 
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { 
  Link2, Youtube, Music2, Search, Settings2, Plus, 
  CheckCircle2, AlertCircle, RefreshCw
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface Project {
  id: string;
  title: string;
}

interface LinkedAccount {
  id: string;
  platform: 'youtube' | 'tiktok';
  name: string;
  enabled: boolean;
  avatar_url?: string;
}

export const ProjectChannelManager = () => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [accounts, setAccounts] = useState<LinkedAccount[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetchProjects();
  }, []);

  useEffect(() => {
    if (selectedProjectId) {
      fetchAccounts(selectedProjectId);
    }
  }, [selectedProjectId]);

  const fetchProjects = async () => {
    const { data } = await supabase.from('projects').select('id, title').order('title');
    setProjects(data || []);
  };

  const fetchAccounts = async (projectId: string) => {
    setIsLoading(true);
    try {
      const [ytRes, ttRes] = await Promise.all([
        supabase.from('youtube_accounts').select('id, channel_name, enabled').eq('project_id', projectId),
        supabase.from('tiktok_accounts').select('id, display_name, avatar_url, enabled').eq('project_id', projectId)
      ]);

      const ytAccounts: LinkedAccount[] = (ytRes.data || []).map(a => ({
        id: a.id,
        platform: 'youtube',
        name: a.channel_name,
        enabled: a.enabled
      }));

      const ttAccounts: LinkedAccount[] = (ttRes.data || []).map(a => ({
        id: a.id,
        platform: 'tiktok',
        name: a.display_name,
        avatar_url: a.avatar_url,
        enabled: a.enabled
      }));

      setAccounts([...ytAccounts, ...ttAccounts]);
    } catch (error) {
      console.error("Error fetching accounts:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleAccount = async (account: LinkedAccount) => {
    const table = account.platform === 'youtube' ? 'youtube_accounts' : 'tiktok_accounts';
    const { error } = await supabase.from(table).update({ enabled: !account.enabled }).eq('id', account.id);
    
    if (error) {
      toast({ title: "Error updating account", description: error.message, variant: "destructive" });
    } else {
      setAccounts(prev => prev.map(a => a.id === account.id ? { ...a, enabled: !a.enabled } : a));
    }
  };

  const syncAll = async () => {
    setIsSyncing(true);
    try {
      const { error } = await supabase.functions.invoke('sync-channel-analytics');
      if (error) throw error;
      toast({ title: "Sync Triggered", description: "All matrix nodes are updating their analytics streams." });
    } catch (error: any) {
      toast({ title: "Sync Failed", description: error.message, variant: "destructive" });
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2 glass-effect border-primary/20 hover:border-primary/50">
          <Settings2 className="w-4 h-4" />
          Manage Analytics Matrix
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[600px] bg-slate-950 border-slate-800 text-white p-0 overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500" />
        
        <DialogHeader className="p-6 pb-2">
          <DialogTitle className="text-xl font-bold flex items-center gap-2">
            <RefreshCw className={cn("w-5 h-5 text-blue-500", isSyncing && "animate-spin")} />
            Matrix Control Center
          </DialogTitle>
          <DialogDescription className="text-slate-400">
            Link and configure tracking nodes for your project ecosystem.
          </DialogDescription>
        </DialogHeader>

        <div className="p-6 space-y-6">
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Target Project</label>
            <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
              <SelectTrigger className="bg-slate-900 border-slate-800 focus:ring-primary h-12">
                <SelectValue placeholder="Select a project to explore its neurons..." />
              </SelectTrigger>
              <SelectContent className="bg-slate-900 border-slate-800 text-white">
                {projects.map(p => (
                  <SelectItem key={p.id} value={p.id}>{p.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-slate-300">Active Tracking Nodes</h3>
              <Button onClick={syncAll} disabled={isSyncing} variant="ghost" size="sm" className="text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 h-8 gap-2">
                <RefreshCw className={cn("w-3.5 h-3.5", isSyncing && "animate-spin")} />
                Sync Matrix
              </Button>
            </div>

            <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
              {!selectedProjectId ? (
                <div className="text-center py-12 bg-slate-900/50 rounded-xl border border-dashed border-slate-800">
                  <Search className="w-8 h-8 text-slate-700 mx-auto mb-2" />
                  <p className="text-sm text-slate-500">Select a project to see its neural links</p>
                </div>
              ) : isLoading ? (
                Array(3).fill(0).map((_, i) => <div key={i} className="h-16 bg-slate-900 animate-pulse rounded-lg" />)
              ) : accounts.length === 0 ? (
                <div className="text-center py-12 bg-slate-900/50 rounded-xl border border-dashed border-slate-800">
                  <AlertCircle className="w-8 h-8 text-slate-700 mx-auto mb-2" />
                  <p className="text-sm text-slate-500">No channels linked to this project yet.</p>
                  <Button variant="link" className="text-primary text-xs mt-2" onClick={() => window.location.href = '/projects'}>
                    Go to Project Editor to connect
                  </Button>
                </div>
              ) : (
                accounts.map(account => (
                  <div key={account.id} className="flex items-center justify-between p-4 bg-slate-900/50 rounded-xl border border-slate-800 hover:border-slate-700 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "w-10 h-10 rounded-full flex items-center justify-center border",
                        account.platform === 'youtube' ? "bg-red-500/10 border-red-500/20" : "bg-pink-500/10 border-pink-500/20"
                      )}>
                        {account.avatar_url ? (
                          <img src={account.avatar_url} className="w-full h-full rounded-full object-cover" />
                        ) : account.platform === 'youtube' ? (
                          <Youtube className="w-5 h-5 text-red-500" />
                        ) : (
                          <Music2 className="w-5 h-5 text-pink-500" />
                        )}
                      </div>
                      <div>
                        <p className="text-sm font-medium">{account.name}</p>
                        <Badge variant="outline" className="text-[10px] h-4 uppercase tracking-tighter opacity-70">
                          {account.platform} Node
                        </Badge>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-slate-500">{account.enabled ? 'Streaming' : 'Paused'}</span>
                      <Switch checked={account.enabled} onCheckedChange={() => toggleAccount(account)} />
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="p-6 bg-slate-900/50 border-t border-slate-800 flex justify-between items-center">
          <p className="text-xs text-slate-500 max-w-[300px]">
            Changes to the matrix nodes are synchronized in real-time across all associated gamemode views.
          </p>
          <Button variant="outline" className="border-slate-700 hover:bg-slate-800 close-dialog">
            Done
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
