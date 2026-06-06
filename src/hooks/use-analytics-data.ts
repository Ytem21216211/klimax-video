import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface AnalyticsSummary {
  totalViews: number;
  totalLikes: number;
  totalFollowers: number;
  totalVideos: number;
  deltaViews: number;
  deltaFollowers: number;
  growthRateViews: number | null;
  growthRateFollowers: number | null;
}

export interface PlatformStats {
  platform: 'youtube' | 'tiktok';
  views: number;
  subscribers: number;
  likes: number;
}

export const useAnalyticsData = (viewMode: 'global' | 'gamemode' | 'project', id?: string) => {
  const [data, setData] = useState<AnalyticsSummary | null>(null);
  const [platformData, setPlatformData] = useState<PlatformStats[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    try {
      // 1. Fetch Video Performance (Accumulated stats from all posted videos)
      let videoQuery = supabase.from('video_performance').select('*');
      if (viewMode === 'gamemode' && id) videoQuery = videoQuery.eq('gamemode_id', id);
      if (viewMode === 'project' && id) videoQuery = videoQuery.eq('project_id', id);

      const { data: videos } = await videoQuery;

      // 2. Fetch Channel Snapshots (Latest channel-wide stats)
      // We need to get the latest snapshot for each account associated with the view
      
      // Get account IDs first
      let ytAccountQuery = supabase.from('youtube_accounts').select('id');
      let ttAccountQuery = supabase.from('tiktok_accounts').select('id');

      if (viewMode === 'project' && id) {
        ytAccountQuery = ytAccountQuery.eq('project_id', id);
        ttAccountQuery = ttAccountQuery.eq('project_id', id);
      } else if (viewMode === 'gamemode' && id) {
        // Find projects in this gamemode
        const { data: projects } = await supabase.from('projects').select('id').eq('gamemode_id', id);
        const projectIds = projects?.map(p => p.id) || [];
        ytAccountQuery = ytAccountQuery.in('project_id', projectIds);
        ttAccountQuery = ttAccountQuery.in('project_id', projectIds);
      }

      const { data: ytAccounts } = await ytAccountQuery;
      const { data: ttAccounts } = await ttAccountQuery;

      const ytIds = ytAccounts?.map(a => a.id) || [];
      const ttIds = ttAccounts?.map(a => a.id) || [];

      // Fetch latest snapshots for these accounts
      const { data: snapshots } = await supabase
        .from('channel_analytics_snapshots')
        .select('*')
        .or(`youtube_account_id.in.(${ytIds.join(',')}),tiktok_account_id.in.(${ttIds.join(',')})`)
        .order('snapshot_at', { ascending: false });

      // Group by account and pick only newest
      const uniqueSnapshotsMap = new Map();
      snapshots?.forEach(s => {
        const key = s.youtube_account_id || s.tiktok_account_id;
        if (!uniqueSnapshotsMap.has(key)) uniqueSnapshotsMap.set(key, s);
      });
      const uniqueSnapshots = Array.from(uniqueSnapshotsMap.values());

      // 3. Aggregate results
      const totalViews = uniqueSnapshots.reduce((acc, s) => acc + (Number(s.total_views) || 0), 0);
      const totalFollowers = uniqueSnapshots.reduce((acc, s) => acc + (s.total_subscribers || 0), 0);
      const totalLikes = uniqueSnapshots.reduce((acc, s) => acc + (s.total_likes || 0), 0);
      const totalVideos = uniqueSnapshots.reduce((acc, s) => acc + (s.total_videos || 0), 0);

      const deltaViews = uniqueSnapshots.reduce((acc, s) => acc + (Number(s.delta_views) || 0), 0);
      const deltaFollowers = uniqueSnapshots.reduce((acc, s) => acc + (s.delta_subscribers || 0), 0);

      // Growth Rate (Avg of rates across accounts)
      const validGrowthRatesViews = uniqueSnapshots.map(s => s.growth_rate_views).filter(r => r !== null) as number[];
      const avgGrowthViews = validGrowthRatesViews.length > 0 
        ? validGrowthRatesViews.reduce((a, b) => a + Number(b), 0) / validGrowthRatesViews.length 
        : null;

      const validGrowthRatesFollowers = uniqueSnapshots.map(s => s.growth_rate_subscribers).filter(r => r !== null) as number[];
      const avgGrowthFollowers = validGrowthRatesFollowers.length > 0 
        ? validGrowthRatesFollowers.reduce((a, b) => a + Number(b), 0) / validGrowthRatesFollowers.length 
        : null;

      setData({
        totalViews,
        totalLikes,
        totalFollowers,
        totalVideos,
        deltaViews,
        deltaFollowers,
        growthRateViews: avgGrowthViews,
        growthRateFollowers: avgGrowthFollowers
      });

      // Platform specific aggregation
      const ytStats: PlatformStats = {
        platform: 'youtube',
        views: uniqueSnapshots.filter(s => s.channel_type === 'youtube').reduce((acc, s) => acc + Number(s.total_views), 0),
        subscribers: uniqueSnapshots.filter(s => s.channel_type === 'youtube').reduce((acc, s) => acc + s.total_subscribers, 0),
        likes: uniqueSnapshots.filter(s => s.channel_type === 'youtube').reduce((acc, s) => acc + s.total_likes, 0),
      };

      const ttStats: PlatformStats = {
        platform: 'tiktok',
        views: uniqueSnapshots.filter(s => s.channel_type === 'tiktok').reduce((acc, s) => acc + Number(s.total_views), 0),
        subscribers: uniqueSnapshots.filter(s => s.channel_type === 'tiktok').reduce((acc, s) => acc + s.total_subscribers, 0),
        likes: uniqueSnapshots.filter(s => s.channel_type === 'tiktok').reduce((acc, s) => acc + s.total_likes, 0),
      };

      setPlatformData([ytStats, ttStats]);

    } catch (error) {
      console.error("Error fetching analytics data:", error);
    } finally {
      setLoading(true);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [viewMode, id]);

  return { data, platformData, loading, refetch: fetchData };
};
