import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  TrendingUp, TrendingDown, Eye, ThumbsUp, Users, 
  Video, BarChart3, Globe, Gamepad2, Layers,
  Youtube, Share2
} from "lucide-react";
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, 
  Tooltip, ResponsiveContainer, AreaChart, Area,
  BarChart, Bar, Legend
} from 'recharts';
import { useAnalyticsData } from "@/hooks/use-analytics-data";
import { cn } from "@/lib/utils";

interface AnalyticsDashboardProps {
  selectedGamemodeId?: string;
  selectedProjectId?: string;
  onViewChange?: (view: 'global' | 'gamemode' | 'project') => void;
}

const formatNumber = (num: number): string => {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toLocaleString();
};

export const AnalyticsDashboard = ({
  selectedGamemodeId,
  selectedProjectId,
  onViewChange
}: AnalyticsDashboardProps) => {
  const currentView = selectedProjectId ? 'project' : selectedGamemodeId ? 'gamemode' : 'global';
  const currentId = selectedProjectId || selectedGamemodeId;

  const { data, platformData, loading } = useAnalyticsData(currentView, currentId);

  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-32 w-full glass-effect" />)}
      </div>
    );
  }

  const stats = [
    { 
      label: "Total Reach", 
      value: data?.totalViews || 0, 
      delta: data?.deltaViews || 0, 
      icon: Eye, 
      color: "text-blue-500", 
      bg: "bg-blue-500/10",
      trend: data && data.deltaViews >= 0 ? 'up' : 'down'
    },
    { 
      label: "Audience", 
      value: data?.totalFollowers || 0, 
      delta: data?.deltaFollowers || 0, 
      icon: Users, 
      color: "text-purple-500", 
      bg: "bg-purple-500/10",
      trend: data && data.deltaFollowers >= 0 ? 'up' : 'down'
    },
    { 
      label: "Engagement", 
      value: data?.totalLikes || 0, 
      delta: 0, 
      icon: ThumbsUp, 
      color: "text-pink-500", 
      bg: "bg-pink-500/10"
    },
    { 
      label: "Production", 
      value: data?.totalVideos || 0, 
      delta: 0, 
      icon: Video, 
      color: "text-orange-500", 
      bg: "bg-orange-500/10"
    },
  ];

  return (
    <div className="space-y-6">
      {/* Metric Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat, i) => (
          <Card key={i} className="glass-effect overflow-hidden relative">
            <div className={cn("absolute top-0 right-0 w-24 h-24 -mr-8 -mt-8 rounded-full blur-3xl opacity-20", stat.bg)} />
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div className={cn("p-2 rounded-lg", stat.bg)}>
                  <stat.icon className={cn("w-5 h-5", stat.color)} />
                </div>
                {stat.delta !== 0 && (
                  <Badge variant={stat.trend === 'up' ? 'default' : 'destructive'} className="text-[10px] h-5">
                    {stat.trend === 'up' ? '+' : ''}{formatNumber(stat.delta)}
                  </Badge>
                )}
              </div>
              <div className="mt-4">
                <p className="text-3xl font-bold">{formatNumber(stat.value)}</p>
                <p className="text-sm text-muted-foreground">{stat.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 md:grid-cols-7">
        {/* Growth Curve */}
        <Card className="md:col-span-4 glass-effect">
          <CardHeader>
            <CardTitle className="text-lg font-medium flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-primary" />
              Growth Narrative
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={platformData}>
                  <defs>
                    <linearGradient id="colorViews" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
                  <XAxis dataKey="platform" stroke="#ffffff50" fontSize={12} />
                  <YAxis stroke="#ffffff50" fontSize={12} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px' }}
                    itemStyle={{ color: '#fff' }}
                  />
                  <Area type="monotone" dataKey="views" stroke="#3b82f6" fillOpacity={1} fill="url(#colorViews)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Platform Comparison */}
        <Card className="md:col-span-3 glass-effect">
          <CardHeader>
            <CardTitle className="text-lg font-medium flex items-center gap-2">
              <Share2 className="w-4 h-4 text-primary" />
              Matrix Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={platformData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" horizontal={false} />
                  <XAxis type="number" stroke="#ffffff50" fontSize={10} hide />
                  <YAxis type="category" dataKey="platform" stroke="#ffffff" fontSize={12} width={70} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px' }}
                  />
                  <Bar dataKey="subscribers" name="Subscribers" fill="#8b5cf6" radius={[0, 4, 4, 0]} barSize={20} />
                  <Bar dataKey="likes" name="Likes" fill="#ec4899" radius={[0, 4, 4, 0]} barSize={20} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-4 flex gap-4 justify-center text-xs text-muted-foreground uppercase tracking-widest">
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-[#8b5cf6]" /> Followers
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-[#ec4899]" /> Likes
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
