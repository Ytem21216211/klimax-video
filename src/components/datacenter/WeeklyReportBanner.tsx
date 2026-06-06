import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileText, Check, X, Loader2, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { ReportDetailModal } from "./ReportDetailModal";

interface WeeklyReport {
  id: string;
  gamemode_id: string | null;
  report_week: string;
  status: string;
  videos_analyzed: number;
  avg_retention_pct: number | null;
  recommendations: {
    key_insight?: string;
    hook_style?: { recommended?: string; confidence?: number };
    title_optimization?: { pattern?: string };
  };
  gamemodes?: { name: string } | null;
}

interface WeeklyReportBannerProps {
  reports: WeeklyReport[];
  onReportActioned: () => void;
}

export function WeeklyReportBanner({ reports, onReportActioned }: WeeklyReportBannerProps) {
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [selectedReport, setSelectedReport] = useState<WeeklyReport | null>(null);
  const { toast } = useToast();

  const pendingReports = reports.filter(r => r.status === 'pending');

  if (pendingReports.length === 0) return null;

  const handleAction = async (reportId: string, action: 'approve' | 'dismiss') => {
    setProcessingId(reportId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const { error } = await supabase.functions.invoke('apply-report-settings', {
        body: { reportId, action },
      });

      if (error) throw error;

      toast({
        title: action === 'approve' ? 'Report Applied!' : 'Report Dismissed',
        description: action === 'approve' 
          ? 'Optimizations will be active for 7 days' 
          : 'Report has been dismissed',
      });

      onReportActioned();
      setSelectedReport(null);
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

  return (
    <>
      <div className="space-y-3">
        {pendingReports.map((report) => (
          <Card key={report.id} className="border-primary/50 bg-gradient-to-r from-primary/10 to-transparent">
            <CardContent className="py-4">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
                    <FileText className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold">Weekly Report Ready</h3>
                      <Badge variant="outline" className="text-xs">
                        {report.gamemodes?.name || 'General'}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {report.videos_analyzed} videos analyzed • 
                      {report.recommendations?.key_insight && (
                        <span className="ml-1 text-primary">
                          <Sparkles className="w-3 h-3 inline mr-1" />
                          {report.recommendations.key_insight.slice(0, 60)}...
                        </span>
                      )}
                    </p>
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => setSelectedReport(report)}
                  >
                    View Report
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => handleAction(report.id, 'approve')}
                    disabled={processingId === report.id}
                    className="gap-1"
                  >
                    {processingId === report.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Check className="w-4 h-4" />
                    )}
                    Approve & Apply
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleAction(report.id, 'dismiss')}
                    disabled={processingId === report.id}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {selectedReport && (
        <ReportDetailModal
          report={selectedReport}
          open={!!selectedReport}
          onOpenChange={(open) => !open && setSelectedReport(null)}
          onApprove={() => handleAction(selectedReport.id, 'approve')}
          onDismiss={() => handleAction(selectedReport.id, 'dismiss')}
          isProcessing={processingId === selectedReport.id}
        />
      )}
    </>
  );
}
