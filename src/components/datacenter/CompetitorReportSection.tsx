import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Eye, TrendingUp, AlertTriangle, Lightbulb, Play, Loader2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface RecommendedScript {
  title_idea: string;
  hook?: string;
  script_outline?: string;
  inspired_by?: string[];
  confidence: number;
  copy_level: 'inspired' | 'adaptation' | 'full_copy';
}

interface TrendingTopic {
  topic: string;
  mentions: number;
  avg_views: number;
  sample_titles?: string[];
}

interface ContentGap {
  topic: string;
  opportunity_score: number;
  example_titles?: string[];
}

interface CompetitorReport {
  id: string;
  gamemode_id: string | null;
  report_week: string;
  status: string;
  competitors_analyzed: number;
  videos_analyzed: number;
  trending_topics: {
    topics?: TrendingTopic[];
    hooks_used?: Record<string, number>;
    avg_video_length?: number;
    posting_frequency?: string;
  };
  content_gaps: {
    gaps?: ContentGap[];
    frequency_gap?: string;
    style_gaps?: string[];
  };
  recommended_scripts: {
    scripts?: RecommendedScript[];
  };
  gamemodes?: { name: string } | null;
}

interface CompetitorReportSectionProps {
  reports: CompetitorReport[];
  onReportActioned: () => void;
}

export function CompetitorReportSection({ reports, onReportActioned }: CompetitorReportSectionProps) {
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const { toast } = useToast();

  const pendingReports = reports.filter(r => r.status === 'pending');

  if (pendingReports.length === 0) return null;

  const handleGenerateVideos = async (reportId: string, count?: number, copyLevel?: string) => {
    setProcessingId(reportId);
    try {
      const { error } = await supabase.functions.invoke('generate-spy-videos', {
        body: { reportId, count, copyLevel },
      });

      if (error) throw error;

      toast({
        title: 'Videos Queued!',
        description: `${count || 3} spy videos are being generated`,
      });

      onReportActioned();
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message,
      });
    } finally {
      setProcessingId(null);
    }
  };

  const handleDismiss = async (reportId: string) => {
    try {
      const { error } = await supabase
        .from('competitor_reports')
        .update({ status: 'dismissed' })
        .eq('id', reportId);

      if (error) throw error;
      onReportActioned();
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message,
      });
    }
  };

  const getCopyLevelColor = (level: string) => {
    switch (level) {
      case 'inspired': return 'bg-green-500/20 text-green-500';
      case 'adaptation': return 'bg-yellow-500/20 text-yellow-500';
      case 'full_copy': return 'bg-red-500/20 text-red-500';
      default: return 'bg-muted';
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Eye className="w-5 h-5 text-primary" />
        <h2 className="text-xl font-semibold">Competitor Intelligence</h2>
      </div>

      {pendingReports.map((report) => (
        <Card key={report.id} className="border-orange-500/30 bg-gradient-to-r from-orange-500/10 to-transparent">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Eye className="w-5 h-5 text-orange-500" />
                {report.gamemodes?.name || 'General'} Intelligence
                <Badge variant="outline" className="ml-2">
                  {report.competitors_analyzed} competitors • {report.videos_analyzed} videos
                </Badge>
              </CardTitle>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setExpandedId(expandedId === report.id ? null : report.id)}
                >
                  {expandedId === report.id ? 'Collapse' : 'Expand'}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDismiss(report.id)}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            {/* Trending Topics Summary */}
            {report.trending_topics?.topics && report.trending_topics.topics.length > 0 && (
              <div>
                <h4 className="text-sm font-medium flex items-center gap-2 mb-2">
                  <TrendingUp className="w-4 h-4 text-green-500" />
                  Trending Topics
                </h4>
                <div className="flex flex-wrap gap-2">
                  {report.trending_topics.topics.slice(0, 3).map((topic, i) => (
                    <Badge key={i} variant="secondary" className="text-xs">
                      {topic.topic} ({topic.mentions} mentions, {(topic.avg_views / 1000).toFixed(0)}k avg)
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Content Gaps Summary */}
            {report.content_gaps?.gaps && report.content_gaps.gaps.length > 0 && (
              <div>
                <h4 className="text-sm font-medium flex items-center gap-2 mb-2">
                  <AlertTriangle className="w-4 h-4 text-yellow-500" />
                  Content Gaps
                </h4>
                <div className="flex flex-wrap gap-2">
                  {report.content_gaps.gaps.slice(0, 3).map((gap, i) => (
                    <Badge key={i} variant="outline" className="text-xs border-yellow-500/50">
                      {gap.topic} (Score: {gap.opportunity_score})
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Expanded Details */}
            {expandedId === report.id && (
              <div className="space-y-4 pt-4 border-t border-border/50">
                {/* Recommended Scripts */}
                {report.recommended_scripts?.scripts && report.recommended_scripts.scripts.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium flex items-center gap-2 mb-3">
                      <Lightbulb className="w-4 h-4 text-primary" />
                      Recommended Scripts
                    </h4>
                    <div className="space-y-3">
                      {report.recommended_scripts.scripts.map((script, i) => (
                        <Card key={i} className="glass-effect">
                          <CardContent className="py-3">
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  <p className="font-medium text-sm">{script.title_idea}</p>
                                  <Badge className={`text-xs ${getCopyLevelColor(script.copy_level)}`}>
                                    {script.copy_level}
                                  </Badge>
                                  <span className="text-xs text-muted-foreground">
                                    {script.confidence}% confidence
                                  </span>
                                </div>
                                {script.hook && (
                                  <p className="text-xs text-muted-foreground">Hook: "{script.hook}"</p>
                                )}
                                {script.script_outline && (
                                  <p className="text-xs text-muted-foreground mt-1">{script.script_outline}</p>
                                )}
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex items-center gap-2 pt-2">
              <Button
                onClick={() => handleGenerateVideos(report.id)}
                disabled={processingId === report.id}
                className="gap-2"
              >
                {processingId === report.id ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Play className="w-4 h-4" />
                )}
                Generate All Videos
              </Button>
              <Button
                variant="outline"
                onClick={() => handleGenerateVideos(report.id, 1, 'inspired')}
                disabled={processingId === report.id}
                size="sm"
              >
                1 Inspired
              </Button>
              <Button
                variant="outline"
                onClick={() => handleGenerateVideos(report.id, 1, 'adaptation')}
                disabled={processingId === report.id}
                size="sm"
              >
                1 Adaptation
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
