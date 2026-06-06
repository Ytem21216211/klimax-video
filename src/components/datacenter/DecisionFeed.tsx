import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Check, X, RotateCcw, Bot, TrendingUp,
  Clock, AlertTriangle, Sparkles, ChevronRight, Loader2,
  Info, BarChart3, Target
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";

interface Decision {
  id: string;
  decision_type: string;
  action_summary: string;
  confidence_pct: number;
  reasoning: string;
  status: string;
  scheduled_at: string | null;
  executed_at: string | null;
  created_at: string;
  data_points: any;
  previous_values: any;
  new_values: any;
  gamemodes?: { name: string } | null;
}

export function DecisionFeed() {
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [selectedDecision, setSelectedDecision] = useState<Decision | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    fetchDecisions();

    const channel = supabase
      .channel('decisions')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'automation_decisions'
      }, () => fetchDecisions())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const fetchDecisions = async () => {
    const { data } = await supabase
      .from('automation_decisions')
      .select('*, gamemodes(name)')
      .order('created_at', { ascending: false })
      .limit(50);

    setDecisions(data || []);
    setLoading(false);
  };

  const handleAction = async (id: string, action: 'approve' | 'reject' | 'rollback') => {
    setActionLoading(id);
    try {
      if (action === 'approve') {
        await supabase
          .from('automation_decisions')
          .update({
            status: 'executed',
            executed_at: new Date().toISOString(),
            user_response: 'approved',
            user_response_at: new Date().toISOString()
          })
          .eq('id', id);
      } else if (action === 'reject') {
        await supabase
          .from('automation_decisions')
          .update({
            status: 'rejected',
            user_response: 'rejected',
            user_response_at: new Date().toISOString()
          })
          .eq('id', id);
      } else if (action === 'rollback') {
        await supabase
          .from('automation_decisions')
          .update({
            status: 'rolled_back',
            rolled_back_at: new Date().toISOString()
          })
          .eq('id', id);
      }

      toast({
        title: action === 'approve' ? 'Decision Approved' : action === 'reject' ? 'Decision Rejected' : 'Rolled Back',
        description: action === 'rollback' ? 'Changes have been reverted' : 'AI action has been confirmed',
      });

      if (selectedDecision?.id === id) {
        setSelectedDecision(null);
      }
      fetchDecisions();
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    } finally {
      setActionLoading(null);
    }
  };

  const getStatusBadge = (decision: Decision) => {
    switch (decision.status) {
      case 'pending':
        return <Badge variant="outline" className="text-yellow-500 border-yellow-500/30 bg-yellow-500/5 transition-all"><Clock className="w-3 h-3 mr-1" /> Pending</Badge>;
      case 'executed':
        return <Badge variant="outline" className="text-green-500 border-green-500/30 bg-green-500/5 transition-all"><Check className="w-3 h-3 mr-1" /> Auto-pilot</Badge>;
      case 'rejected':
        return <Badge variant="outline" className="text-red-500 border-red-500/30 bg-red-500/5 transition-all"><X className="w-3 h-3 mr-1" /> Rejected</Badge>;
      case 'rolled_back':
        return <Badge variant="outline" className="text-orange-500 border-orange-500/30 bg-orange-500/5 transition-all"><RotateCcw className="w-3 h-3 mr-1" /> Reverted</Badge>;
      case 'failed':
        return <Badge variant="outline" className="text-red-500 border-red-500/30 bg-red-500/5 transition-all"><AlertTriangle className="w-3 h-3 mr-1" /> Failed</Badge>;
      default:
        return <Badge variant="outline">{decision.status}</Badge>;
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'scale': return <TrendingUp className="w-5 h-5 text-green-500" />;
      case 'kill': return <AlertTriangle className="w-5 h-5 text-red-500" />;
      case 'optimize': return <Sparkles className="w-5 h-5 text-blue-500" />;
      default: return <Bot className="w-5 h-5 text-muted-foreground" />;
    }
  };

  const pendingCount = decisions.filter(d => d.status === 'pending').length;

  if (loading) {
    return (
      <Card className="glass-effect">
        <CardContent className="p-6 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="glass-effect overflow-hidden border-primary/20">
        <CardHeader className="pb-2 hero-gradient border-b border-primary/10">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-lg text-white">
              <Sparkles className="w-5 h-5 text-cyan-300" />
              Autonomous Feed
            </CardTitle>
            <div className="flex items-center gap-2">
              {pendingCount > 0 && (
                <Badge className="bg-yellow-500/20 text-yellow-300 border-yellow-500/30 animate-pulse">
                  {pendingCount} Awaiting Review
                </Badge>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent className="pt-4 px-0">
          <ScrollArea className="h-[500px] px-4">
            {decisions.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Bot className="w-16 h-16 mx-auto mb-4 opacity-20" />
                <p className="font-medium">No intelligence reports yet</p>
                <p className="text-xs mt-1">Enable AI Autonomy to see live decisions</p>
              </div>
            ) : (
              <div className="space-y-3 pb-4">
                {decisions.map((decision) => (
                  <div
                    key={decision.id}
                    onClick={() => setSelectedDecision(decision)}
                    className={`group p-4 rounded-xl border cursor-pointer transition-all hover:scale-[1.01] active:scale-[0.99] animate-in fade-in slide-in-from-bottom-2 duration-300 ${decision.status === 'pending'
                        ? 'border-yellow-500/40 bg-yellow-500/5 shadow-[0_0_15px_-5px_rgba(234,179,8,0.3)]'
                        : 'border-border/50 bg-muted/10 hover:bg-muted/20'
                      }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        <div className={`p-2 rounded-lg ${decision.decision_type === 'scale' ? 'bg-green-500/10' :
                            decision.decision_type === 'kill' ? 'bg-red-500/10' : 'bg-blue-500/10'
                          }`}>
                          {getTypeIcon(decision.decision_type)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            {decision.gamemodes && (
                              <Badge variant="outline" className="bg-primary/5 text-[10px] h-4 py-0">
                                {decision.gamemodes.name}
                              </Badge>
                            )}
                            <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest">
                              {decision.decision_type} Logic
                            </span>
                          </div>
                          <p className="text-sm font-semibold truncate group-hover:text-primary transition-colors">
                            {decision.action_summary}
                          </p>
                          <div className="flex items-center gap-2 mt-2">
                            {getStatusBadge(decision)}
                            <span className="text-[10px] text-muted-foreground">
                              {formatDistanceToNow(new Date(decision.created_at), { addSuffix: true })}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <div className="text-right">
                          <p className="text-xs font-bold text-primary">{decision.confidence_pct}%</p>
                          <p className="text-[9px] text-muted-foreground font-medium">Confidence</p>
                        </div>
                        <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:translate-x-1 transition-transform" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Decision Whiteboard Dialog */}
      <Dialog open={!!selectedDecision} onOpenChange={(open) => !open && setSelectedDecision(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col p-0 glass-effect border-primary/30">
          <DialogHeader className="p-6 hero-gradient flex-shrink-0">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-white/20 backdrop-blur-md rounded-xl border border-white/20">
                {selectedDecision && getTypeIcon(selectedDecision.decision_type)}
              </div>
              <div>
                <DialogTitle className="text-2xl font-bold text-white flex items-center gap-3">
                  Decision Whiteboard: {selectedDecision?.action_summary}
                  <Badge className="bg-white/20 text-white border-white/30">
                    {selectedDecision?.confidence_pct}% AI Precision
                  </Badge>
                </DialogTitle>
                <DialogDescription className="text-white/80 mt-1">
                  Full step-by-step logic and data analysis for this autonomous action.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto p-8 space-y-8 bg-background/50">
            {/* Logic Path Steps */}
            <div className="relative">
              <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gradient-to-b from-primary/50 via-primary/20 to-transparent" />

              <div className="space-y-8 relative">
                {/* Step 1: Observation */}
                <div className="flex gap-6 animate-in slide-in-from-left duration-500">
                  <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-white font-bold text-sm shrink-0 relative z-10 shadow-[0_0_10px_rgba(var(--primary),0.5)]">1</div>
                  <div className="space-y-2 flex-1">
                    <h4 className="font-bold text-lg flex items-center gap-2">
                      <BarChart3 className="w-4 h-4 text-primary" />
                      Data Observation
                    </h4>
                    <div className="p-4 rounded-xl bg-muted/40 border border-border/50 grid grid-cols-2 md:grid-cols-4 gap-4">
                      {selectedDecision?.data_points ? (
                        Object.entries(selectedDecision.data_points).map(([key, val]: [string, any]) => (
                          <div key={key}>
                            <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">{key.replace(/([A-Z])/g, ' $1')}</p>
                            <p className="text-sm font-semibold">{typeof val === 'number' ? val.toFixed(1) : String(val)}</p>
                          </div>
                        ))
                      ) : (
                        <p className="text-sm text-muted-foreground col-span-4">No data points captured for this decision.</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Step 2: Reasoning Logic */}
                <div className="flex gap-6 animate-in slide-in-from-left duration-700">
                  <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-white font-bold text-sm shrink-0 relative z-10 shadow-[0_0_10px_rgba(var(--primary),0.5)]">2</div>
                  <div className="space-y-2 flex-1">
                    <h4 className="font-bold text-lg flex items-center gap-2">
                      <Bot className="w-4 h-4 text-primary" />
                      AI Analysis & Deep Reasoning
                    </h4>
                    <div className="p-6 rounded-xl bg-primary/5 border border-primary/20 relative overflow-hidden group">
                      <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:scale-110 transition-transform">
                        <Info className="w-12 h-12" />
                      </div>
                      <p className="text-base text-card-foreground leading-relaxed italic">
                        "{selectedDecision?.reasoning}"
                      </p>
                    </div>
                  </div>
                </div>

                {/* Step 3: Action & Impact */}
                <div className="flex gap-6 animate-in slide-in-from-left duration-1000">
                  <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-white font-bold text-sm shrink-0 relative z-10 shadow-[0_0_10px_rgba(var(--primary),0.5)]">3</div>
                  <div className="space-y-2 flex-1">
                    <h4 className="font-bold text-lg flex items-center gap-2">
                      <Target className="w-4 h-4 text-primary" />
                      Action Execution & Expected Impact
                    </h4>
                    <div className="grid md:grid-cols-2 gap-4">
                      <div className="p-4 rounded-xl bg-red-500/5 border border-red-500/20">
                        <p className="text-[10px] text-red-500 uppercase font-bold mb-2">Current State</p>
                        <pre className="text-xs overflow-x-auto p-2 bg-background/50 rounded">
                          {JSON.stringify(selectedDecision?.previous_values || { status: "active" }, null, 2)}
                        </pre>
                      </div>
                      <div className="p-4 rounded-xl bg-green-500/5 border border-green-500/20">
                        <p className="text-[10px] text-green-500 uppercase font-bold mb-2">Automated Transformation</p>
                        <pre className="text-xs overflow-x-auto p-2 bg-background/50 rounded">
                          {JSON.stringify(selectedDecision?.new_values || { status: "optimized" }, null, 2)}
                        </pre>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="p-6 border-t border-border bg-muted/20 flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              {selectedDecision && getStatusBadge(selectedDecision)}
              <span className="text-xs text-muted-foreground">
                {selectedDecision && `Decision recorded ${formatDistanceToNow(new Date(selectedDecision.created_at), { addSuffix: true })}`}
              </span>
            </div>

            <div className="flex gap-3">
              {selectedDecision?.status === 'pending' && (
                <>
                  <Button
                    variant="outline"
                    className="gap-2 text-red-500 hover:text-red-400 border-red-500/30"
                    onClick={() => handleAction(selectedDecision.id, 'reject')}
                    disabled={!!actionLoading}
                  >
                    <X className="w-4 h-4" /> Discard Logic
                  </Button>
                  <Button
                    className="gap-2 bg-green-600 hover:bg-green-500 shadow-lg shadow-green-500/20"
                    onClick={() => handleAction(selectedDecision.id, 'approve')}
                    disabled={!!actionLoading}
                  >
                    {actionLoading === selectedDecision.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Check className="w-4 h-4" />
                    )}
                    Confirm & Execute
                  </Button>
                </>
              )}
              {selectedDecision?.status === 'executed' && (
                <Button
                  variant="outline"
                  className="gap-2"
                  onClick={() => handleAction(selectedDecision.id, 'rollback')}
                  disabled={!!actionLoading}
                >
                  <RotateCcw className="w-4 h-4" /> Rollback Operation
                </Button>
              )}
              <Button variant="ghost" onClick={() => setSelectedDecision(null)}>
                Close
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
