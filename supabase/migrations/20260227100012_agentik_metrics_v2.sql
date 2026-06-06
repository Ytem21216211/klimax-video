-- Create a consolidated view for real-time project metrics
DROP VIEW IF EXISTS public.agentik_project_metrics;
CREATE OR REPLACE VIEW public.agentik_project_metrics AS
WITH project_video_stats AS (
    SELECT 
        v.project_id,
        COALESCE(SUM(a.views), 0) as total_views,
        COALESCE(AVG(v.vqi_score), 0.5) as avg_vqi,
        COALESCE(SUM(CASE WHEN a.snapshot_at > now() - interval '24 hours' THEN a.views ELSE 0 END), 0) as views_24h,
        COALESCE(SUM(CASE WHEN a.snapshot_at BETWEEN now() - interval '48 hours' AND now() - interval '24 hours' THEN a.views ELSE 0 END), 0) as views_prev_24h
    FROM public.video_performance v
    LEFT JOIN public.video_analytics_snapshots a ON a.video_performance_id = v.id
    GROUP BY v.project_id
)
SELECT 
    p.id,
    p.title,
    p.status,
    p.updated_at,
    p.created_at,
    p.user_id,
    COALESCE(s.total_views, 0) as total_views,
    COALESCE(s.views_24h, 0) as daily_views,
    COALESCE(s.avg_vqi, 0) as vqi,
    CASE 
        WHEN s.views_prev_24h = 0 THEN 0
        ELSE ((s.views_24h::numeric - s.views_prev_24h::numeric) / s.views_prev_24h::numeric) * 100
    END as momentum,
    GREATEST(0, LEAST(100,
        (COALESCE(s.avg_vqi, 0) * 40) + 
        (CASE WHEN s.views_24h > 0 THEN LEAST(30, LOG(s.views_24h + 1) * 5) ELSE 0 END) +
        (CASE 
            WHEN s.views_24h > s.views_prev_24h THEN 30
            WHEN s.views_24h = s.views_prev_24h AND s.views_24h > 0 THEN 15
            ELSE 0 
        END)
    )) as health_score
FROM public.projects p
LEFT JOIN project_video_stats s ON s.project_id = p.id;

GRANT SELECT ON public.agentik_project_metrics TO authenticated;
