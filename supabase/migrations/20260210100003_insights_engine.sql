-- Create insights table
CREATE TABLE IF NOT EXISTS public.insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  insight_type TEXT NOT NULL CHECK (insight_type IN ('winning_archetype', 'velocity_target', 'competitor_gap', 'risk_profile')),
  niche TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.insights ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Insights viewable by everyone" ON public.insights FOR SELECT USING (true);
CREATE POLICY "System can insert insights" ON public.insights FOR INSERT WITH CHECK (true); -- simplified for Edge Function access

-- Function to generate daily insights
CREATE OR REPLACE FUNCTION public.generate_daily_insights()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_niche TEXT := 'minecraft'; -- Default niche for now
  v_winning_archetype JSONB;
  v_velocity_target JSONB;
  v_competitor_gap JSONB;
BEGIN
  -- 1. WINNING ARCHETYPE: Best scoring script structure in last 30 days
  SELECT jsonb_build_object(
    'archetype', script_archetype,
    'visual_style', visual_style,
    'avg_score', ROUND(AVG(current_score)::numeric, 1),
    'count', COUNT(*)
  )
  INTO v_winning_archetype
  FROM tracked_videos
  WHERE upload_time > NOW() - INTERVAL '30 days'
  AND current_score > 50 -- Only look at "good" videos
  GROUP BY script_archetype, visual_style
  ORDER BY AVG(current_score) DESC
  LIMIT 1;

  IF v_winning_archetype IS NOT NULL THEN
    INSERT INTO public.insights (insight_type, niche, payload)
    VALUES ('winning_archetype', v_niche, v_winning_archetype);
  END IF;

  -- 2. VELOCITY TARGET: Avg views at 2 hours for Viral videos (Score > 90)
  -- (Approximated by taking snapshots roughly 2 hours after upload, simply taking latest snapshot for high performing videos for MVP)
  SELECT jsonb_build_object(
    'target_views_2h', ROUND(AVG(s.views)::numeric, 0),
    'target_velocity_multiplier', ROUND(AVG(v.current_score / GREATEST(v.duration, 1))::numeric, 2)
  )
  INTO v_velocity_target
  FROM tracked_videos v
  JOIN analytics_snapshots s ON v.id = s.video_id
  WHERE v.current_score > 90;

  IF v_velocity_target IS NOT NULL THEN
    INSERT INTO public.insights (insight_type, niche, payload)
    VALUES ('velocity_target', v_niche, v_velocity_target);
  END IF;

  -- 3. COMPETITOR GAP: Where are we losing?
  -- Compare avg score of Competitor vs Owned for each gamemode
  SELECT jsonb_build_object(
    'losing_gamemode', t.gamemode,
    'competitor_avg', t.comp_score,
    'owned_avg', t.own_score,
    'gap', (t.comp_score - t.own_score)
  )
  INTO v_competitor_gap
  FROM (
    SELECT 
      gamemode,
      AVG(CASE WHEN is_competitor THEN current_score ELSE NULL END) as comp_score,
      AVG(CASE WHEN NOT is_competitor THEN current_score ELSE NULL END) as own_score
    FROM tracked_videos
    GROUP BY gamemode
  ) t
  WHERE t.comp_score > t.own_score
  ORDER BY (t.comp_score - t.own_score) DESC
  LIMIT 1;

  IF v_competitor_gap IS NOT NULL THEN
    INSERT INTO public.insights (insight_type, niche, payload)
    VALUES ('competitor_gap', v_niche, v_competitor_gap);
  END IF;

END;
$$;
