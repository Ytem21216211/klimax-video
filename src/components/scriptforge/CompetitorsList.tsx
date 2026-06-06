import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Youtube, 
  Music2, 
  Trash2, 
  RefreshCw, 
  Loader2, 
  Plus,
  Globe
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { AddCompetitorDialog } from "./AddCompetitorDialog";
import { formatDistanceToNow } from "date-fns";

interface Gamemode {
  id: string;
  name: string;
}

interface Competitor {
  id: string;
  gamemode_id: string | null;
  platform: string;
  channel_url: string;
  channel_id: string;
  channel_name: string;
  last_scraped_at: string | null;
  created_at: string;
}

interface CompetitorsListProps {
  gamemodes: Gamemode[];
}

export function CompetitorsList({ gamemodes }: CompetitorsListProps) {
  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);
  const [isAddingCompetitor, setIsAddingCompetitor] = useState(false);
  const [videoCounts, setVideoCounts] = useState<Record<string, number>>({});
  const { toast } = useToast();

  useEffect(() => {
    fetchCompetitors();
  }, []);

  const fetchCompetitors = async () => {
    try {
      const { data, error } = await supabase
        .from('competitor_channels')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setCompetitors(data || []);

      // Fetch video counts for each competitor
      if (data && data.length > 0) {
        const counts: Record<string, number> = {};
        for (const competitor of data) {
          const { count } = await supabase
            .from('competitor_videos')
            .select('*', { count: 'exact', head: true })
            .eq('competitor_id', competitor.id);
          counts[competitor.id] = count || 0;
        }
        setVideoCounts(counts);
      }
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to load competitors',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async (competitorId: string) => {
    setRefreshingId(competitorId);
    try {
      const { error } = await supabase.functions.invoke('scrape-competitor-channel', {
        body: { competitorId },
      });

      if (error) throw error;

      toast({
        title: 'Refreshed!',
        description: 'Competitor data has been updated',
      });

      fetchCompetitors();
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message,
      });
    } finally {
      setRefreshingId(null);
    }
  };

  const handleDelete = async (competitorId: string) => {
    try {
      const { error } = await supabase
        .from('competitor_channels')
        .delete()
        .eq('id', competitorId);

      if (error) throw error;

      setCompetitors(competitors.filter(c => c.id !== competitorId));
      toast({
        title: 'Deleted',
        description: 'Competitor removed',
      });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message,
      });
    }
  };

  const getGamemodeName = (gamemodeId: string | null) => {
    if (!gamemodeId) return 'General';
    const gamemode = gamemodes.find(g => g.id === gamemodeId);
    return gamemode?.name || 'Unknown';
  };

  const groupedByGamemode = competitors.reduce((acc, competitor) => {
    const key = competitor.gamemode_id || 'general';
    if (!acc[key]) acc[key] = [];
    acc[key].push(competitor);
    return acc;
  }, {} as Record<string, Competitor[]>);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Competitors</h2>
          <p className="text-muted-foreground">Track competitor channels to analyze their content</p>
        </div>
        <Button onClick={() => setIsAddingCompetitor(true)} className="gap-2">
          <Plus className="w-4 h-4" />
          Add Competitor
        </Button>
      </div>

      {competitors.length === 0 ? (
        <Card className="glass-effect">
          <CardContent className="py-12 text-center">
            <Globe className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground mb-4">No competitors tracked yet</p>
            <Button onClick={() => setIsAddingCompetitor(true)} variant="outline">
              <Plus className="w-4 h-4 mr-2" />
              Add Your First Competitor
            </Button>
          </CardContent>
        </Card>
      ) : (
        Object.entries(groupedByGamemode).map(([gamemodeId, gameCompetitors]) => (
          <Card key={gamemodeId} className="glass-effect">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                {getGamemodeName(gamemodeId === 'general' ? null : gamemodeId)} Competitors
                <Badge variant="outline">{gameCompetitors.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {gameCompetitors.map((competitor) => (
                <div
                  key={competitor.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-muted/30"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                      {competitor.platform === 'youtube' ? (
                        <Youtube className="w-5 h-5 text-red-500" />
                      ) : (
                        <Music2 className="w-5 h-5" />
                      )}
                    </div>
                    <div>
                      <p className="font-medium">{competitor.channel_name}</p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{videoCounts[competitor.id] || 0} videos tracked</span>
                        {competitor.last_scraped_at && (
                          <>
                            <span>•</span>
                            <span>
                              Last scraped {formatDistanceToNow(new Date(competitor.last_scraped_at), { addSuffix: true })}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRefresh(competitor.id)}
                      disabled={refreshingId === competitor.id}
                    >
                      {refreshingId === competitor.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <RefreshCw className="w-4 h-4" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(competitor.id)}
                    >
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        ))
      )}

      <AddCompetitorDialog
        open={isAddingCompetitor}
        onOpenChange={setIsAddingCompetitor}
        gamemodes={gamemodes}
        onAdded={fetchCompetitors}
      />
    </div>
  );
}
