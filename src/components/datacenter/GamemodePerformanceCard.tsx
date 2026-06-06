import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Gamepad2, TrendingUp, Zap, Target, MessageSquare, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

interface Gamemode {
  id: string;
  name: string;
  description: string;
}

interface GamemodeInsight {
  id: string;
  gamemode_id: string | null;
  best_hook_text: string | null;
  best_hook_score: number | null;
  best_cta_text: string | null;
  best_cta_score: number | null;
  best_editing_style: string | null;
  best_editing_style_score: number | null;
  patterns: unknown;
  recommendations: unknown;
  total_videos_analyzed: number;
  avg_hook_score: number | null;
  avg_cta_score: number | null;
  avg_editing_style_score: number | null;
}

interface VideoPerformance {
  id: string;
  gamemode_id: string | null;
  hook_text: string;
  cta_text: string;
  editing_style_name: string;
  hook_score: number | null;
  cta_score: number | null;
  editing_style_score: number | null;
  youtube_views: number;
  youtube_likes: number;
  video_title: string | null;
  published_at: string | null;
}

interface GamemodePerformanceCardProps {
  gamemode: Gamemode;
  insight: GamemodeInsight | undefined;
  performances: VideoPerformance[];
  onSelect: () => void;
  isSelected: boolean;
}

const getScoreColor = (score: number | null) => {
  if (score === null) return "text-muted-foreground";
  if (score >= 80) return "text-green-500";
  if (score >= 60) return "text-yellow-500";
  if (score >= 40) return "text-orange-500";
  return "text-red-500";
};

const getScoreLabel = (score: number | null) => {
  if (score === null) return "No data";
  if (score >= 80) return "Excellent";
  if (score >= 60) return "Good";
  if (score >= 40) return "Average";
  return "Needs Work";
};

export const GamemodePerformanceCard = ({
  gamemode,
  insight,
  performances,
  onSelect,
  isSelected,
}: GamemodePerformanceCardProps) => {
  const videoCount = performances.length;
  const hasData = videoCount > 0;

  // Calculate averages from performances if no insight exists
  const avgHookScore = insight?.avg_hook_score ?? 
    (hasData ? Math.round(
      performances.filter(p => p.hook_score !== null)
        .reduce((acc, p) => acc + (p.hook_score || 0), 0) / 
        Math.max(performances.filter(p => p.hook_score !== null).length, 1)
    ) : null);

  const avgCtaScore = insight?.avg_cta_score ?? 
    (hasData ? Math.round(
      performances.filter(p => p.cta_score !== null)
        .reduce((acc, p) => acc + (p.cta_score || 0), 0) / 
        Math.max(performances.filter(p => p.cta_score !== null).length, 1)
    ) : null);

  const avgEditingScore = insight?.avg_editing_style_score ?? 
    (hasData ? Math.round(
      performances.filter(p => p.editing_style_score !== null)
        .reduce((acc, p) => acc + (p.editing_style_score || 0), 0) / 
        Math.max(performances.filter(p => p.editing_style_score !== null).length, 1)
    ) : null);

  // Find unique editing styles
  const editingStyles = [...new Set(performances.map(p => p.editing_style_name))];

  return (
    <Card 
      className={cn(
        "glass-effect cursor-pointer transition-all hover:border-primary/50",
        isSelected && "ring-2 ring-primary border-primary"
      )}
      onClick={onSelect}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <Gamepad2 className="w-5 h-5 text-primary" />
            <CardTitle className="text-lg">{gamemode.name}</CardTitle>
          </div>
          <Badge variant="secondary" className="text-xs">
            {videoCount} video{videoCount !== 1 ? 's' : ''}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground line-clamp-2">
          {gamemode.description}
        </p>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {!hasData ? (
          <div className="text-center py-4 text-muted-foreground text-sm">
            <TrendingUp className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>No performance data yet</p>
            <p className="text-xs mt-1">Videos will appear here after YouTube sync</p>
          </div>
        ) : (
          <>
            {/* Score Bars */}
            <div className="space-y-3">
              <div className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-1.5">
                    <Zap className="w-3.5 h-3.5 text-yellow-500" />
                    <span>Hooks</span>
                  </div>
                  <span className={cn("font-medium", getScoreColor(avgHookScore))}>
                    {avgHookScore !== null ? `${avgHookScore}/100` : "—"}
                  </span>
                </div>
                <Progress value={avgHookScore || 0} className="h-2" />
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-1.5">
                    <Target className="w-3.5 h-3.5 text-green-500" />
                    <span>CTAs</span>
                  </div>
                  <span className={cn("font-medium", getScoreColor(avgCtaScore))}>
                    {avgCtaScore !== null ? `${avgCtaScore}/100` : "—"}
                  </span>
                </div>
                <Progress value={avgCtaScore || 0} className="h-2" />
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-1.5">
                    <MessageSquare className="w-3.5 h-3.5 text-blue-500" />
                    <span>Editing Styles</span>
                  </div>
                  <span className={cn("font-medium", getScoreColor(avgEditingScore))}>
                    {avgEditingScore !== null ? `${avgEditingScore}/100` : "—"}
                  </span>
                </div>
                <Progress value={avgEditingScore || 0} className="h-2" />
              </div>
            </div>

            {/* Editing Styles Used */}
            {editingStyles.length > 0 && (
              <div className="pt-2 border-t border-border/50">
                <p className="text-xs text-muted-foreground mb-2">Editing Styles Used:</p>
                <div className="flex flex-wrap gap-1">
                  {editingStyles.slice(0, 3).map((style) => (
                    <Badge key={style} variant="outline" className="text-xs">
                      {style}
                    </Badge>
                  ))}
                  {editingStyles.length > 3 && (
                    <Badge variant="outline" className="text-xs">
                      +{editingStyles.length - 3} more
                    </Badge>
                  )}
                </div>
              </div>
            )}

            {/* Best Performers */}
            {insight?.best_hook_text && (
              <div className="pt-2 border-t border-border/50">
                <p className="text-xs text-muted-foreground mb-1">Best Hook:</p>
                <p className="text-sm font-medium line-clamp-2">"{insight.best_hook_text}"</p>
                <Badge className="mt-1 bg-green-500/20 text-green-500 text-xs">
                  Score: {insight.best_hook_score}
                </Badge>
              </div>
            )}
          </>
        )}

        {/* Expand Indicator */}
        <div className="flex justify-center pt-2">
          {isSelected ? (
            <ChevronUp className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          )}
        </div>
      </CardContent>
    </Card>
  );
};
