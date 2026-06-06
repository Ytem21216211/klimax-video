-- Seed Mock Insights for Testing
-- This allows you to test the 'Closed Loop' immediately without waiting for 30 days of data.

INSERT INTO public.insights (insight_type, niche, payload)
VALUES 
(
  'winning_archetype', 
  'minecraft', 
  '{
    "archetype": "Mystery/Conspiracy", 
    "visual_style": "Dark & Gritty", 
    "avg_score": 92.5, 
    "count": 12
  }'::jsonb
),
(
  'competitor_gap', 
  'minecraft', 
  '{
    "losing_gamemode": "Parkour", 
    "competitor_avg": 88.0, 
    "owned_avg": 45.0, 
    "gap": 43.0
  }'::jsonb
),
(
  'velocity_target', 
  'minecraft', 
  '{
    "target_views_2h": 1500, 
    "target_velocity_multiplier": 4.5
  }'::jsonb
);
