import { ArrowUpRight, ArrowDownRight, Minus, Activity, Trophy } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

interface VideoScoreCardProps {
    video: {
        id: string;
        title: string;
        thumbnail: string;
        score: number;
        velocity: number; // 0-10 scale
        views: number;
        uploadTime: string;
        gamemode: string;
        status: "rising" | "falling" | "stable";
    };
    onClick: () => void;
}

export function VideoScoreCard({ video, onClick }: VideoScoreCardProps) {
    // Determine color based on score
    const getScoreColor = (score: number) => {
        if (score >= 90) return "text-purple-500";
        if (score >= 70) return "text-green-500";
        if (score >= 50) return "text-yellow-500";
        if (score >= 20) return "text-orange-500";
        return "text-red-500";
    };

    const getScoreBg = (score: number) => {
        if (score >= 90) return "bg-purple-500/10 border-purple-500/20";
        if (score >= 70) return "bg-green-500/10 border-green-500/20";
        if (score >= 50) return "bg-yellow-500/10 border-yellow-500/20";
        if (score >= 20) return "bg-orange-500/10 border-orange-500/20";
        return "bg-red-500/10 border-red-500/20";
    };

    return (
        <Card
            className={`hover:shadow-md transition-all cursor-pointer border-l-4 ${getScoreBg(video.score).replace("bg-", "border-l-")}`}
            onClick={onClick}
        >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <div className="flex flex-col space-y-1">
                    <Badge variant="outline" className="w-fit mb-1">{video.gamemode}</Badge>
                    <CardTitle className="text-sm font-medium line-clamp-1">
                        {video.title}
                    </CardTitle>
                </div>
                <div className={`text-2xl font-bold ${getScoreColor(video.score)}`}>
                    {video.score.toFixed(1)}
                </div>
            </CardHeader>

            <CardContent>
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center space-x-2 text-sm text-muted-foreground">
                        <Activity className="h-4 w-4" />
                        <span>Velocity</span>
                    </div>
                    <div className="flex items-center space-x-1">
                        <span className="font-semibold">{video.velocity.toFixed(1)}x</span>
                        {video.status === "rising" && <ArrowUpRight className="h-4 w-4 text-green-500" />}
                        {video.status === "falling" && <ArrowDownRight className="h-4 w-4 text-red-500" />}
                        {video.status === "stable" && <Minus className="h-4 w-4 text-yellow-500" />}
                    </div>
                </div>

                <div className="space-y-2">
                    <div className="flex justify-between text-xs">
                        <span>Algorithm Fit</span>
                        <span>{Math.min(100, video.score)}%</span>
                    </div>
                    <Progress value={Math.min(100, video.score)} className="h-2" />
                </div>

                <div className="mt-4 pt-4 border-t flex justify-between items-center">
                    <div className="text-xs text-muted-foreground">
                        {new Date(video.uploadTime).toLocaleDateString()}
                    </div>
                    <div className="flex items-center text-xs font-medium text-purple-400">
                        <Trophy className="h-3 w-3 mr-1" />
                        Top 5%
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
