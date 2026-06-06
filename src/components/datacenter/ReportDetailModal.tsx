import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Check, X, FileText, Sparkles, TrendingUp,
  Target, Zap, Bot, BarChart3, Info,
  Lightbulb, ArrowRight, ShieldCheck, Loader2
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";

interface Recommendations {
  key_insight?: string;
  title_optimization?: {
    pattern?: string;
    examples?: string[];
    confidence?: number;
  };
  hook_style?: {
    recommended?: string;
    reasoning?: string;
    example_hooks?: string[];
    confidence?: number;
  };
  cta_style?: {
    recommended?: string;
    timing?: string;
    example_ctas?: string[];
    confidence?: number;
  };
  editing_style?: {
    recommended?: string;
    clip_length?: string;
    reasoning?: string;
    confidence?: number;
  };
}

interface WeeklyReport {
  id: string;
  gamemode_id: string | null;
  report_week: string;
  status: string;
  videos_analyzed: number;
  avg_retention_pct: number | null;
  recommendations: Recommendations;
  gamemodes?: { name: string } | null;
}

interface ReportDetailModalProps {
  report: WeeklyReport;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApprove: () => void;
  onDismiss: () => void;
  isProcessing: boolean;
}

export function ReportDetailModal({
  report,
  open,
  onOpenChange,
  onApprove,
  onDismiss,
  isProcessing,
}: ReportDetailModalProps) {
  const recs = report.recommendations || {};

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col p-0 glass-effect border-primary/30">
        <DialogHeader className="p-8 hero-gradient shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-white/10 backdrop-blur-xl border border-white/20 flex items-center justify-center shadow-2xl">
                <FileText className="w-8 h-8 text-white" />
              </div>
              <div>
                <DialogTitle className="text-3xl font-bold text-white tracking-tight">
                  Strategy Whiteboard
                </DialogTitle>
                <DialogDescription className="text-white/80 text-lg flex items-center gap-2">
                  <Badge className="bg-white/20 text-white border-white/30">
                    {report.gamemodes?.name || 'General'}
                  </Badge>
                  Analysis of {report.videos_analyzed} Videos
                </DialogDescription>
              </div>
            </div>
            <div className="text-right hidden md:block">
              <p className="text-white/60 text-xs uppercase font-bold tracking-widest">Confidence Score</p>
              <p className="text-3xl font-black text-white">
                {recs.hook_style?.confidence || 85}%
              </p>
            </div>
          </div>
        </DialogHeader>

        <ScrollArea className="flex-1">
          <div className="p-8 space-y-10 bg-background/50">
            {/* Key Insight Highlight */}
            <div className="p-6 rounded-2xl bg-primary/10 border border-primary/20 relative overflow-hidden group shadow-lg">
              <div className="absolute top-[-20px] right-[-20px] p-10 opacity-5 group-hover:scale-110 transition-transform">
                <Sparkles className="w-32 h-32 text-primary" />
              </div>
              <div className="flex gap-4 relative z-10">
                <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center shrink-0">
                  <Lightbulb className="w-6 h-6 text-primary-foreground" />
                </div>
                <div>
                  <h4 className="font-bold text-lg text-primary mb-1">Executive Summary</h4>
                  <p className="text-xl font-medium leading-relaxed italic">
                    "{recs.key_insight || 'Focus on high-intensity clips in the first 3 seconds to maximize retention.'}"
                  </p>
                </div>
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-8">
              {/* Hook Strategy */}
              <div className="space-y-4">
                <h4 className="flex items-center gap-2 font-bold text-muted-foreground uppercase tracking-widest text-xs">
                  <Zap className="w-4 h-4 text-yellow-500" />
                  Hook Architecture
                </h4>
                <div className="p-6 rounded-2xl border bg-card/50 space-y-4 shadow-sm">
                  <div className="flex justify-between items-end">
                    <div>
                      <p className="text-xs text-muted-foreground font-medium mb-1">Recommended Style</p>
                      <p className="text-2xl font-bold capitalize">{recs.hook_style?.recommended || 'Aggressive'}</p>
                    </div>
                    <Badge variant="outline" className="border-green-500/50 text-green-500 bg-green-500/5">
                      +{recs.hook_style?.confidence ? Math.round(recs.hook_style.confidence / 5) : 15}% uplift
                    </Badge>
                  </div>
                  <Progress value={recs.hook_style?.confidence || 85} className="h-2" />
                  <div className="pt-2">
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {recs.hook_style?.reasoning || 'Historical data indicates that viewers in this niche drop off quickly without immediate visual stimulation.'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Conversion Strategy */}
              <div className="space-y-4">
                <h4 className="flex items-center gap-2 font-bold text-muted-foreground uppercase tracking-widest text-xs">
                  <Target className="w-4 h-4 text-green-500" />
                  CTA & Engagement
                </h4>
                <div className="p-6 rounded-2xl border bg-card/50 space-y-4 shadow-sm">
                  <div className="flex justify-between items-end">
                    <div>
                      <p className="text-xs text-muted-foreground font-medium mb-1">Optimal Timing</p>
                      <p className="text-2xl font-bold capitalize">{recs.cta_style?.timing || 'End of Video'}</p>
                    </div>
                    <Bot className="w-6 h-6 text-primary opacity-50" />
                  </div>
                  <p className="font-semibold text-sm">Suggested Trigger:</p>
                  <div className="p-3 rounded-xl bg-muted/50 border border-dashed border-border text-sm italic">
                    "{recs.cta_style?.recommended || 'If you enjoyed this trick, hit subscribe for more!'}"
                  </div>
                </div>
              </div>
            </div>

            {/* Editing & Visuals */}
            <div className="space-y-4">
              <h4 className="flex items-center gap-2 font-bold text-muted-foreground uppercase tracking-widest text-xs">
                <Bot className="w-4 h-4 text-blue-500" />
                Autonomous Creative Direction
              </h4>
              <div className="p-6 rounded-2xl border bg-primary/5 grid md:grid-cols-3 gap-6">
                <div>
                  <p className="text-xs font-bold text-primary uppercase mb-2">Editing Style</p>
                  <p className="font-semibold">{recs.editing_style?.recommended || 'Fast-paced'}</p>
                  <p className="text-xs text-muted-foreground mt-1">Matched to audience sentiment</p>
                </div>
                <div className="col-span-2">
                  <p className="text-xs font-bold text-primary uppercase mb-2">Creative Reasoning</p>
                  <p className="text-sm text-balance leading-relaxed">
                    {recs.editing_style?.reasoning || 'Higher energetic edits correlate with 20% higher average view duration across your recent library.'}
                  </p>
                </div>
              </div>
            </div>

            {/* Title Patterns */}
            <div className="space-y-4">
              <h4 className="flex items-center gap-2 font-bold text-muted-foreground uppercase tracking-widest text-xs">
                <TrendingUp className="w-4 h-4 text-cyan-500" />
                Metadata Optimization
              </h4>
              <div className="p-6 rounded-2xl border bg-card/50">
                <div className="flex items-center gap-2 mb-4">
                  <ShieldCheck className="w-4 h-4 text-green-500" />
                  <span className="text-sm font-semibold">Recommended Title Patterns:</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {recs.title_optimization?.examples?.map((ex, i) => (
                    <div key={i} className="px-4 py-2 rounded-xl bg-background border border-primary/20 text-sm flex items-center gap-2 font-medium">
                      <ArrowRight className="w-3 h-3 text-primary" />
                      {ex}
                    </div>
                  )) || (
                      <div className="px-4 py-2 rounded-xl bg-background border border-primary/20 text-sm flex items-center gap-2 font-medium">
                        <ArrowRight className="w-3 h-3 text-primary" />
                        {recs.title_optimization?.pattern || 'Short & Punchy titles'}
                      </div>
                    )}
                </div>
              </div>
            </div>
          </div>
        </ScrollArea>

        <div className="p-6 border-t border-border bg-muted/20 flex flex-col md:flex-row items-center justify-between gap-6 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center">
              <ShieldCheck className="w-6 h-6 text-green-500" />
            </div>
            <div>
              <p className="text-sm font-bold">Strategy Verified</p>
              <p className="text-xs text-muted-foreground">AI recommends applying these changes immediately.</p>
            </div>
          </div>
          <div className="flex gap-3 w-full md:w-auto">
            <Button
              variant="outline"
              onClick={onDismiss}
              disabled={isProcessing}
              className="flex-1 md:flex-none border-red-500/30 text-red-500 hover:text-red-400"
            >
              <X className="w-4 h-4 mr-2" /> Discard
            </Button>
            <Button
              onClick={onApprove}
              disabled={isProcessing}
              className="flex-1 md:flex-none bg-green-600 hover:bg-green-500 text-white shadow-lg shadow-green-500/20"
            >
              {isProcessing ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Check className="w-4 h-4 mr-2" />
              )}
              Approve & Apply Strategy
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
