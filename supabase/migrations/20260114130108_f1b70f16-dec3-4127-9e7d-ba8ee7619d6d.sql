-- Add subtitle_settings column to projects table for storing custom subtitle configuration
ALTER TABLE public.projects
ADD COLUMN IF NOT EXISTS subtitle_settings JSONB DEFAULT '{
  "style": "static",
  "bounceRate": 1.0,
  "fontSize": 6,
  "textColor": "#ffffff",
  "strokeEnabled": true,
  "strokeColor": "#000000",
  "strokeWidth": 2,
  "shadowEnabled": true,
  "shadowOpacity": 0.8,
  "shadowBlur": 6,
  "shadowDistance": 4
}'::jsonb;