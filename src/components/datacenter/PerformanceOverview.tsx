import { Card, CardContent } from "@/components/ui/card";
import { Video, BarChart3, Gamepad2, Eye, ThumbsUp, Clock } from "lucide-react";

interface PerformanceOverviewProps {
  totalVideos: number;
  avgScore: number;
  totalGamemodes: number;
  totalViews?: number;
  totalLikes?: number;
  totalWatchTimeHours?: number;
}

const formatNumber = (num: number): string => {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toString();
};

export const PerformanceOverview = ({
  totalVideos,
  avgScore,
  totalGamemodes,
  totalViews = 0,
  totalLikes = 0,
  totalWatchTimeHours = 0,
}: PerformanceOverviewProps) => {
  return (
    <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
      <Card className="glass-effect">
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
              <Video className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold">{totalVideos}</p>
              <p className="text-sm text-muted-foreground">Videos</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="glass-effect">
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-red-500/20 flex items-center justify-center">
              <Eye className="w-5 h-5 text-red-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{formatNumber(totalViews)}</p>
              <p className="text-sm text-muted-foreground">Total Views</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="glass-effect">
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
              <ThumbsUp className="w-5 h-5 text-blue-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{formatNumber(totalLikes)}</p>
              <p className="text-sm text-muted-foreground">Total Likes</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="glass-effect">
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-green-500/20 flex items-center justify-center">
              <Clock className="w-5 h-5 text-green-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{totalWatchTimeHours.toFixed(1)}h</p>
              <p className="text-sm text-muted-foreground">Watch Time</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="glass-effect">
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-yellow-500/20 flex items-center justify-center">
              <BarChart3 className="w-5 h-5 text-yellow-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{avgScore || "—"}</p>
              <p className="text-sm text-muted-foreground">Avg Score</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="glass-effect">
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center">
              <Gamepad2 className="w-5 h-5 text-purple-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{totalGamemodes}</p>
              <p className="text-sm text-muted-foreground">Gamemodes</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
