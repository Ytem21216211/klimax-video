import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface DateRange {
    from: Date;
    to: Date;
}

export interface ViewMode {
    type: "global" | "project" | "gamemode";
    id?: string;
}

export interface MetricDataPoint {
    timestamp: string;
    value: number;
    label?: string;
    category?: string;
    videoId?: string;
}

export interface VideoMetrics {
    id: string;
    video_performance_id: string;
    video_title: string | null;
    published_at: string | null;
    gamemode_id: string | null;
    project_id: string | null;
    // Raw
    youtube_views: number;
    youtube_likes: number;
    youtube_comments: number;
    youtube_dislikes: number;
    youtube_favorites: number;
    youtube_shares: number;
    youtube_subscribers_gained: number;
    youtube_subscribers_lost: number;
    youtube_impressions: number;
    youtube_impressions_ctr: number | null;
    youtube_watch_time_seconds: number | null;
    youtube_avg_view_duration_seconds: number | null;
    youtube_avg_view_percentage: number | null;
    youtube_engaged_views: number;
    youtube_completed_views: number;
    youtube_peak_hour: number | null;
    youtube_traffic_sources: Record<string, number> | null;
    youtube_click_through_rate: number | null;
    // Ratios
    ratio_like_to_view: number | null;
    ratio_comment_to_view: number | null;
    ratio_favorite_to_view: number | null;
    ratio_comment_to_like: number | null;
    ratio_engaged_to_view: number | null;
    // Computed
    performance_stage: string | null;
    retention_score: number | null;
    cognitive_score: number | null;
    predicted_retention_score: number | null;
}

export interface SnapshotPoint {
    id: string;
    video_performance_id: string;
    snapshot_at: string;
    hours_since_publish: number | null;
    performance_stage: string | null;
    views: number;
    likes: number;
    comments: number;
    shares: number;
    dislikes: number;
    subscribers_gained: number;
    impressions: number;
    watch_time_seconds: number;
    avg_view_percentage: number | null;
    engaged_views: number;
    completed_views: number;
    delta_views: number;
    delta_likes: number;
    delta_comments: number;
}

export interface ChannelSnapshot {
    id: string;
    snapshot_at: string;
    total_views: number;
    total_subscribers: number;
    total_videos: number;
    unique_viewers: number;
    delta_views: number;
    delta_subscribers: number;
    growth_rate_views: number | null;
    growth_rate_subscribers: number | null;
}

export interface CognitiveFeatures {
    id: string;
    video_performance_id: string;
    clip_count: number;
    avg_clip_duration: number;
    total_duration: number;
    cut_frequency: number;
    subtitle_words_per_second: number;
    retention_score: number | null;
    cognitive_score: number | null;
    predicted_high_tier_prob: number | null;
}

export interface Gamemode {
    id: string;
    name: string;
    description: string;
}

export interface Project {
    id: string;
    title: string;
    status: string;
}

// Available metrics for the sidebar
export const METRIC_CATEGORIES = {
    "Raw Metrics": [
        { key: "youtube_views", label: "Views", format: "number" },
        { key: "youtube_likes", label: "Likes", format: "number" },
        { key: "youtube_comments", label: "Comments", format: "number" },
        { key: "youtube_dislikes", label: "Dislikes", format: "number" },
        { key: "youtube_shares", label: "Shares", format: "number" },
        { key: "youtube_favorites", label: "Favorites", format: "number" },
        { key: "youtube_impressions", label: "Impressions", format: "number" },
        { key: "youtube_watch_time_seconds", label: "Watch Time (s)", format: "duration" },
    ],
    "Engagement": [
        { key: "youtube_subscribers_gained", label: "Subs Gained", format: "number" },
        { key: "youtube_subscribers_lost", label: "Subs Lost", format: "number" },
        { key: "youtube_engaged_views", label: "Engaged Views", format: "number" },
        { key: "youtube_completed_views", label: "Completed Views", format: "number" },
        { key: "youtube_avg_view_percentage", label: "Avg View %", format: "percent" },
        { key: "youtube_avg_view_duration_seconds", label: "Avg View Duration", format: "duration" },
        { key: "youtube_impressions_ctr", label: "Impressions CTR", format: "percent" },
        { key: "youtube_click_through_rate", label: "Click Through Rate", format: "percent" },
    ],
    "Ratios": [
        { key: "ratio_like_to_view", label: "Like / View", format: "ratio" },
        { key: "ratio_comment_to_view", label: "Comment / View", format: "ratio" },
        { key: "ratio_favorite_to_view", label: "Favorite / View", format: "ratio" },
        { key: "ratio_comment_to_like", label: "Comment / Like", format: "ratio" },
        { key: "ratio_engaged_to_view", label: "Engaged / View", format: "ratio" },
    ],
    "Growth (Snapshots)": [
        { key: "delta_views", label: "Δ Views", format: "number" },
        { key: "delta_likes", label: "Δ Likes", format: "number" },
        { key: "delta_comments", label: "Δ Comments", format: "number" },
        { key: "delta_subscribers_gained", label: "Δ Subs", format: "number" },
    ],
    "RCCLO / Cognitive": [
        { key: "retention_score", label: "Retention Score", format: "score" },
        { key: "cognitive_score", label: "Cognitive Score", format: "score" },
        { key: "predicted_retention_score", label: "Predicted Retention", format: "score" },
        { key: "cut_frequency", label: "Cut Frequency", format: "decimal" },
        { key: "subtitle_words_per_second", label: "Words/Second", format: "decimal" },
    ],
    "Channel": [
        { key: "total_views", label: "Total Channel Views", format: "number" },
        { key: "total_subscribers", label: "Total Subscribers", format: "number" },
        { key: "unique_viewers", label: "Unique Viewers", format: "number" },
        { key: "growth_rate_views", label: "View Growth %", format: "percent" },
        { key: "growth_rate_subscribers", label: "Sub Growth %", format: "percent" },
    ],
    "Context": [
        { key: "youtube_peak_hour", label: "Peak Hour", format: "hour" },
        { key: "youtube_traffic_sources", label: "Traffic Sources", format: "json" },
        { key: "performance_stage", label: "Performance Stage", format: "text" },
    ],
} as const;

export type MetricKey = string;

export function useVideoPerformance(viewMode: ViewMode) {
    return useQuery({
        queryKey: ["video-performance", viewMode],
        queryFn: async () => {
            let query = supabase
                .from("video_performance")
                .select("*")
                .order("created_at", { ascending: false });

            if (viewMode.type === "gamemode" && viewMode.id) {
                query = query.eq("gamemode_id", viewMode.id);
            }

            const { data, error } = await query;
            if (error) throw error;
            return (data || []) as VideoMetrics[];
        },
    });
}

export function useVideoSnapshots(viewMode: ViewMode, dateRange?: DateRange) {
    return useQuery({
        queryKey: ["video-snapshots", viewMode, dateRange],
        queryFn: async () => {
            let query = supabase
                .from("video_analytics_snapshots")
                .select("*")
                .order("snapshot_at", { ascending: true });

            if (dateRange) {
                query = query
                    .gte("snapshot_at", dateRange.from.toISOString())
                    .lte("snapshot_at", dateRange.to.toISOString());
            }

            const { data, error } = await query;
            if (error) throw error;
            return (data || []) as SnapshotPoint[];
        },
    });
}

export function useChannelSnapshots(dateRange?: DateRange) {
    return useQuery({
        queryKey: ["channel-snapshots", dateRange],
        queryFn: async () => {
            let query = supabase
                .from("channel_analytics_snapshots")
                .select("*")
                .order("snapshot_at", { ascending: true });

            if (dateRange) {
                query = query
                    .gte("snapshot_at", dateRange.from.toISOString())
                    .lte("snapshot_at", dateRange.to.toISOString());
            }

            const { data, error } = await query;
            if (error) throw error;
            return (data || []) as ChannelSnapshot[];
        },
    });
}

export function useCognitiveFeatures() {
    return useQuery({
        queryKey: ["cognitive-features"],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("video_cognitive_features")
                .select("*");
            if (error) throw error;
            return (data || []) as CognitiveFeatures[];
        },
    });
}

export function useGamemodes() {
    return useQuery({
        queryKey: ["gamemodes"],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("gamemodes")
                .select("*")
                .order("name");
            if (error) throw error;
            return (data || []) as Gamemode[];
        },
    });
}

export function useProjects() {
    return useQuery({
        queryKey: ["projects-list"],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("projects")
                .select("id, title, status")
                .order("title");
            if (error) throw error;
            return (data || []) as Project[];
        },
    });
}

// Format helpers
export function formatMetricValue(value: number | null | undefined, format: string): string {
    if (value == null) return "—";
    switch (format) {
        case "number":
            return value >= 1_000_000
                ? `${(value / 1_000_000).toFixed(1)}M`
                : value >= 1_000
                    ? `${(value / 1_000).toFixed(1)}K`
                    : value.toLocaleString();
        case "percent":
            return `${(value * 100).toFixed(1)}%`;
        case "ratio":
            return value.toFixed(4);
        case "duration":
            if (value >= 3600) return `${(value / 3600).toFixed(1)}h`;
            if (value >= 60) return `${(value / 60).toFixed(0)}m`;
            return `${value}s`;
        case "score":
            return value.toFixed(2);
        case "decimal":
            return value.toFixed(3);
        case "hour":
            return `${value}:00`;
        default:
            return String(value);
    }
}

// Compute delta percentage between two values
export function computeDelta(current: number, previous: number): number | null {
    if (previous === 0) return current > 0 ? 100 : null;
    return ((current - previous) / previous) * 100;
}
