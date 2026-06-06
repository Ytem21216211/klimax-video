import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  FlaskConical, 
  Trophy, 
  Clock, 
  TrendingUp, 
  Eye,
  Percent,
  ChevronDown,
  ChevronUp,
  HelpCircle
} from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface HookVariation {
  id: string;
  hook_style: string;
  hook_text: string;
  youtube_views: number;
  youtube_avg_view_percentage: number | null;
  is_winner: boolean;
  status: string;
}

interface ABTest {
  id: string;
  test_name: string;
  base_script: string;
  status: string;
  created_at: string;
  completed_at: string | null;
  winner_variation_id: string | null;
  gamemode_id: string | null;
  gamemodes?: { name: string } | null;
  hook_variations?: HookVariation[];
}

const HOOK_STYLE_LABELS: Record<string, { label: string; color: string; icon: string }> = {
  question: { label: "Question", color: "bg-blue-500/20 text-blue-400 border-blue-500/30", icon: "❓" },
  bold_claim: { label: "Bold Claim", color: "bg-orange-500/20 text-orange-400 border-orange-500/30", icon: "💪" },
  mystery: { label: "Mystery", color: "bg-purple-500/20 text-purple-400 border-purple-500/30", icon: "🔮" },
  challenge: { label: "Challenge", color: "bg-red-500/20 text-red-400 border-red-500/30", icon: "🎯" },
  action: { label: "Action", color: "bg-green-500/20 text-green-400 border-green-500/30", icon: "⚡" },
};

export const ABTestsSection = () => {
  const [tests, setTests] = useState<ABTest[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedTests, setExpandedTests] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchTests();
  }, []);

  const fetchTests = async () => {
    try {
      const { data: testsData, error } = await supabase
        .from('hook_ab_tests')
        .select(`
          *,
          gamemodes (name),
          hook_variations:hook_variations!hook_variations_test_id_fkey (*)
        `)
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      // Transform the data to match our interface
      const transformedTests = (testsData || []).map(test => ({
        ...test,
        hook_variations: Array.isArray(test.hook_variations) 
          ? test.hook_variations 
          : test.hook_variations ? [test.hook_variations] : []
      })) as ABTest[];
      setTests(transformedTests);
    } catch (error) {
      console.error('Error fetching A/B tests:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleExpanded = (testId: string) => {
    setExpandedTests(prev => {
      const next = new Set(prev);
      if (next.has(testId)) {
        next.delete(testId);
      } else {
        next.add(testId);
      }
      return next;
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'running':
        return <Badge variant="outline" className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">Running</Badge>;
      case 'completed':
        return <Badge variant="outline" className="bg-green-500/20 text-green-400 border-green-500/30">Completed</Badge>;
      case 'cancelled':
        return <Badge variant="outline" className="bg-gray-500/20 text-gray-400 border-gray-500/30">Cancelled</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getWinnerStats = () => {
    const completedTests = tests.filter(t => t.status === 'completed' && t.winner_variation_id);
    const styleWins: Record<string, number> = {};
    
    for (const test of completedTests) {
      const winner = test.hook_variations?.find(v => v.is_winner);
      if (winner) {
        styleWins[winner.hook_style] = (styleWins[winner.hook_style] || 0) + 1;
      }
    }
    
    return styleWins;
  };

  const runningTests = tests.filter(t => t.status === 'running');
  const completedTests = tests.filter(t => t.status === 'completed');
  const styleWins = getWinnerStats();

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-32 bg-muted rounded-lg" />
        <div className="h-48 bg-muted rounded-lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-2">
        <FlaskConical className="w-5 h-5 text-primary" />
        <h2 className="text-xl font-semibold">Hook A/B Tests</h2>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger>
              <HelpCircle className="w-4 h-4 text-muted-foreground" />
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">
              <p>A/B tests compare different hook styles to find which openings keep viewers watching longer. Winners are determined after 48+ hours with 100+ views.</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      {/* Aggregate Insights */}
      {Object.keys(styleWins).length > 0 && (
        <Card className="bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              Hook Performance Insights
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              {Object.entries(styleWins)
                .sort(([, a], [, b]) => b - a)
                .map(([style, wins]) => {
                  const styleInfo = HOOK_STYLE_LABELS[style] || { label: style, color: 'bg-muted', icon: '📝' };
                  const totalWins = Object.values(styleWins).reduce((a, b) => a + b, 0);
                  const percentage = Math.round((wins / totalWins) * 100);
                  
                  return (
                    <div key={style} className={`px-3 py-2 rounded-lg border ${styleInfo.color}`}>
                      <div className="flex items-center gap-2">
                        <span>{styleInfo.icon}</span>
                        <span className="font-medium">{styleInfo.label}</span>
                        <Trophy className="w-3 h-3" />
                        <span className="text-sm">{wins} wins ({percentage}%)</span>
                      </div>
                    </div>
                  );
                })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Running Tests */}
      {runningTests.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <Clock className="w-4 h-4" />
            Active Tests ({runningTests.length})
          </h3>
          {runningTests.map(test => (
            <TestCard 
              key={test.id} 
              test={test} 
              isExpanded={expandedTests.has(test.id)}
              onToggle={() => toggleExpanded(test.id)}
            />
          ))}
        </div>
      )}

      {/* Completed Tests */}
      {completedTests.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <Trophy className="w-4 h-4" />
            Completed Tests ({completedTests.length})
          </h3>
          {completedTests.slice(0, 5).map(test => (
            <TestCard 
              key={test.id} 
              test={test} 
              isExpanded={expandedTests.has(test.id)}
              onToggle={() => toggleExpanded(test.id)}
            />
          ))}
        </div>
      )}

      {/* Empty State */}
      {tests.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="py-8 text-center">
            <FlaskConical className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
            <h3 className="font-medium mb-1">No A/B Tests Yet</h3>
            <p className="text-sm text-muted-foreground">
              Enable "Hook Variations" when generating a video to start testing which hooks perform best.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

const TestCard = ({ 
  test, 
  isExpanded, 
  onToggle 
}: { 
  test: ABTest; 
  isExpanded: boolean; 
  onToggle: () => void;
}) => {
  const variations = test.hook_variations || [];
  const winner = variations.find(v => v.is_winner);
  const isRunning = test.status === 'running';

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'running':
        return <Badge variant="outline" className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">Running</Badge>;
      case 'completed':
        return <Badge variant="outline" className="bg-green-500/20 text-green-400 border-green-500/30">Completed</Badge>;
      case 'cancelled':
        return <Badge variant="outline" className="bg-gray-500/20 text-gray-400 border-gray-500/30">Cancelled</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <Collapsible open={isExpanded} onOpenChange={onToggle}>
      <Card className={isRunning ? 'border-yellow-500/30' : winner ? 'border-green-500/30' : ''}>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    {test.test_name}
                    {getStatusBadge(test.status)}
                  </CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">
                    {test.gamemodes?.name || 'General'} • {variations.length} variations
                    {winner && (
                      <span className="text-green-400 ml-2">
                        • Winner: {HOOK_STYLE_LABELS[winner.hook_style]?.label || winner.hook_style}
                      </span>
                    )}
                  </p>
                </div>
              </div>
              <Button variant="ghost" size="icon">
                {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </Button>
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        
        <CollapsibleContent>
          <CardContent className="pt-0 space-y-4">
            {/* Variations Grid */}
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {variations
                .sort((a, b) => (b.youtube_avg_view_percentage || 0) - (a.youtube_avg_view_percentage || 0))
                .map(variation => {
                  const styleInfo = HOOK_STYLE_LABELS[variation.hook_style] || { 
                    label: variation.hook_style, 
                    color: 'bg-muted', 
                    icon: '📝' 
                  };
                  
                  return (
                    <div 
                      key={variation.id}
                      className={`p-4 rounded-lg border ${
                        variation.is_winner 
                          ? 'bg-green-500/10 border-green-500/30' 
                          : 'bg-muted/50 border-border'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <Badge variant="outline" className={styleInfo.color}>
                          {styleInfo.icon} {styleInfo.label}
                        </Badge>
                        {variation.is_winner && (
                          <Trophy className="w-4 h-4 text-yellow-400" />
                        )}
                      </div>
                      
                      <p className="text-sm mb-3 line-clamp-2">
                        "{variation.hook_text}"
                      </p>
                      
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Eye className="w-3 h-3" />
                          {variation.youtube_views?.toLocaleString() || 0}
                        </span>
                        <span className="flex items-center gap-1">
                          <Percent className="w-3 h-3" />
                          {variation.youtube_avg_view_percentage?.toFixed(1) || '--'}%
                        </span>
                      </div>
                    </div>
                  );
                })}
            </div>
            
            {/* Base Script Preview */}
            <div className="pt-3 border-t">
              <p className="text-xs text-muted-foreground mb-1">Base Script:</p>
              <p className="text-sm line-clamp-2">{test.base_script}</p>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
};

export default ABTestsSection;
