-- Create a view for real-time project metrics and health scores
CREATE OR REPLACE VIEW public.agentik_project_metrics AS
WITH project_video_stats AS (
    -- Aggregate stats from video_performance (YouTube)
    SELECT 
        v.project_id,
        COALESCE(SUM(a.views), 0) as total_views,
        COALESCE(AVG(v.vqi_score), 0.5) as avg_vqi,
        -- Calculate momentum as views in last 24 hours
        COALESCE(SUM(CASE WHEN a.snapshot_at > now() - interval '24 hours' THEN a.views ELSE 0 END), 0) as views_24h,
        COALESCE(SUM(CASE WHEN a.snapshot_at BETWEEN now() - interval '48 hours' AND now() - interval '24 hours' THEN a.views ELSE 0 END), 0) as views_prev_24h
    FROM public.video_performance v
    LEFT JOIN public.video_analytics_snapshots a ON a.video_performance_id = v.id
    GROUP BY v.project_id
),
calculated_scores AS (
    SELECT 
        p.id as project_id,
        COALESCE(s.total_views, 0) as total_views,
        COALESCE(s.views_24h, 0) as daily_views,
        COALESCE(s.avg_vqi, 0) as vqi,
        CASE 
            WHEN s.views_prev_24h = 0 THEN 0
            ELSE ((s.views_24h::numeric - s.views_prev_24h::numeric) / s.views_prev_24h::numeric) * 100
        END as momentum,
        -- Health Score (0-100)
        -- 40% VQI + 30% Volume (Log scale) + 30% Momentum
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
    LEFT JOIN project_video_stats s ON s.project_id = p.id
)
SELECT * FROM calculated_scores;

-- Grant access to authenticated users
GRANT SELECT ON public.agentik_project_metrics TO authenticated;
