-- Klimax local Supabase-compatible init schema
-- Idempotent: uses IF NOT EXISTS throughout. Run on an empty database.
-- No RLS, no auth triggers, no realtime publications — the local shim is permissive.

CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE IF NOT EXISTS auth.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  encrypted_password TEXT,
  raw_user_meta_data JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Local sessions table (server-side session store keyed by access_token)
CREATE TABLE IF NOT EXISTS auth.sessions (
  access_token TEXT PRIMARY KEY,
  refresh_token TEXT UNIQUE,
  user_id UUID NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE SCHEMA IF NOT EXISTS storage;
CREATE TABLE IF NOT EXISTS storage.buckets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  public BOOLEAN NOT NULL DEFAULT false,
  file_size_limit BIGINT
);
CREATE TABLE IF NOT EXISTS storage.objects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id TEXT NOT NULL,
  name TEXT NOT NULL,
  owner UUID,
  metadata JSONB DEFAULT '{}'::jsonb,
  size_bytes BIGINT,
  mime_type TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Default buckets used by the app
INSERT INTO storage.buckets (id, name, public, file_size_limit) VALUES
  ('video-clips', 'video-clips', false, 5368709120),
  ('voiceovers',  'voiceovers',  false, 104857600),
  ('exports',     'exports',     true,  5368709120),
  ('custom_fonts','custom_fonts',false, 52428800)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- PUBLIC TABLES
-- ============================================================

CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY,
  username TEXT UNIQUE,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  title TEXT NOT NULL,
  prompt TEXT,
  description TEXT,
  subtitle_style TEXT DEFAULT 'static',
  subtitle_settings JSONB,
  aspect_ratio TEXT DEFAULT '9:16',
  status TEXT DEFAULT 'draft',
  output_url TEXT,
  thumbnail_url TEXT,
  render_progress INTEGER DEFAULT 0,
  last_error TEXT,
  end_screen_settings JSONB,
  colorimetry_settings JSONB DEFAULT '{"brightness": 0, "contrast": 1, "saturation": 1, "preset": "none"}'::jsonb,
  music_settings JSONB,
  youtube_settings JSONB,
  youtube_post_delay_minutes INTEGER DEFAULT 30,
  discord_webhook_url TEXT,
  gamemode_id UUID,
  source_group_id TEXT,
  settings JSONB,
  clips JSONB,
  transcription JSONB,
  exports JSONB,
  export JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.videos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID,
  source_url TEXT NOT NULL,
  file_name TEXT,
  duration NUMERIC,
  transcript TEXT,
  tags TEXT[],
  scenes JSONB,
  processed_video_url TEXT,
  zoom_segments JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.voiceovers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID,
  file_url TEXT NOT NULL,
  file_name TEXT,
  transcript TEXT,
  duration NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.imports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  source_platform TEXT NOT NULL,
  source_url TEXT NOT NULL,
  title TEXT,
  analysis_data JSONB,
  transcript TEXT,
  tags TEXT[],
  average_clip_length NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.subtitle_presets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  name TEXT NOT NULL,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.sfx_library (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  file_url TEXT NOT NULL,
  duration NUMERIC,
  category TEXT DEFAULT 'transition',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.gamemodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.training_scripts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  gamemode_id UUID,
  source_url TEXT NOT NULL,
  transcript TEXT NOT NULL,
  title TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.training_examples (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  gamemode_id UUID,
  source_url TEXT,
  transcript TEXT,
  title TEXT,
  example_type TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.music_library (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  duration NUMERIC,
  bpm INTEGER,
  genre TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.project_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID,
  user_id UUID,
  role TEXT DEFAULT 'member',
  invited_by UUID,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.project_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID,
  email TEXT NOT NULL,
  role TEXT DEFAULT 'member',
  invited_by UUID,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days')
);

CREATE TABLE IF NOT EXISTS public.video_performance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  project_id UUID,
  gamemode_id UUID,
  hook_text TEXT NOT NULL,
  cta_text TEXT NOT NULL,
  editing_style_name TEXT NOT NULL,
  hook_score INTEGER,
  cta_score INTEGER,
  editing_style_score INTEGER,
  youtube_video_id TEXT,
  youtube_views INTEGER DEFAULT 0,
  youtube_likes INTEGER DEFAULT 0,
  youtube_comments INTEGER DEFAULT 0,
  youtube_watch_time_seconds INTEGER DEFAULT 0,
  youtube_avg_view_duration_seconds INTEGER DEFAULT 0,
  youtube_click_through_rate NUMERIC(5,2),
  youtube_avg_view_percentage NUMERIC(5,2),
  video_title TEXT,
  video_description TEXT,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.gamemode_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  gamemode_id UUID,
  best_hook_text TEXT,
  best_hook_score INTEGER,
  best_cta_text TEXT,
  best_cta_score INTEGER,
  best_editing_style TEXT,
  best_editing_style_score INTEGER,
  patterns JSONB DEFAULT '[]'::jsonb,
  recommendations JSONB DEFAULT '[]'::jsonb,
  total_videos_analyzed INTEGER DEFAULT 0,
  avg_hook_score NUMERIC(5,2),
  avg_cta_score NUMERIC(5,2),
  avg_editing_style_score NUMERIC(5,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.youtube_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID,
  channel_id TEXT NOT NULL,
  channel_name TEXT NOT NULL,
  access_token TEXT,
  refresh_token TEXT,
  token_expires_at TIMESTAMPTZ,
  privacy TEXT DEFAULT 'private',
  category_id TEXT DEFAULT '20',
  tags TEXT[] DEFAULT '{}',
  made_for_kids BOOLEAN DEFAULT false,
  custom_title TEXT,
  custom_description TEXT,
  enabled BOOLEAN DEFAULT true,
  title_pool TEXT[] DEFAULT '{}',
  title_rotation_mode TEXT DEFAULT 'sequential',
  title_rotation_index INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.youtube_post_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID,
  account_id UUID,
  video_url TEXT NOT NULL,
  title TEXT,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  scheduled_for TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  posted_at TIMESTAMPTZ,
  youtube_video_id TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.youtube_warmup_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  account_id UUID,
  action TEXT NOT NULL,
  status TEXT NOT NULL,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.hook_ab_tests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  project_id UUID,
  gamemode_id UUID,
  test_name TEXT NOT NULL,
  base_script TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running',
  winner_variation_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.hook_variations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id UUID,
  hook_style TEXT NOT NULL,
  hook_text TEXT NOT NULL,
  full_script TEXT NOT NULL,
  video_performance_id UUID,
  project_id UUID,
  youtube_views INTEGER DEFAULT 0,
  youtube_avg_view_percentage NUMERIC,
  is_winner BOOLEAN DEFAULT false,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.batch_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  project_id UUID,
  job_type TEXT NOT NULL,
  total_count INTEGER NOT NULL,
  completed_count INTEGER DEFAULT 0,
  failed_count INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  config JSONB DEFAULT '{}'::jsonb,
  used_account_ids TEXT[] DEFAULT '{}',
  last_processed_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.weekly_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  gamemode_id UUID,
  report_week DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  analysis_data JSONB DEFAULT '{}'::jsonb,
  recommendations JSONB DEFAULT '{}'::jsonb,
  videos_analyzed INTEGER DEFAULT 0,
  avg_retention_pct NUMERIC,
  best_performing_video_id UUID,
  applied_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.active_report_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  gamemode_id UUID,
  report_id UUID,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.competitor_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  gamemode_id UUID,
  platform TEXT NOT NULL,
  channel_url TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  channel_name TEXT NOT NULL,
  last_scraped_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.competitor_videos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  competitor_id UUID,
  user_id UUID,
  platform_video_id TEXT NOT NULL,
  title TEXT,
  description TEXT,
  transcript TEXT,
  view_count INTEGER DEFAULT 0,
  like_count INTEGER DEFAULT 0,
  published_at TIMESTAMPTZ,
  tags TEXT[] DEFAULT '{}',
  duration_seconds INTEGER,
  thumbnail_url TEXT,
  analyzed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.competitor_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  gamemode_id UUID,
  report_week DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  competitors_analyzed INTEGER DEFAULT 0,
  videos_analyzed INTEGER DEFAULT 0,
  trending_topics JSONB DEFAULT '{"topics": []}'::jsonb,
  content_gaps JSONB DEFAULT '{"gaps": []}'::jsonb,
  recommended_scripts JSONB DEFAULT '{"scripts": []}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.clip_pool (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  gamemode_id UUID,
  file_url TEXT NOT NULL,
  file_name TEXT,
  duration NUMERIC,
  category TEXT DEFAULT 'gameplay',
  intensity TEXT DEFAULT 'medium',
  tags TEXT[],
  used_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.automation_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  gamemode_id UUID,
  name TEXT NOT NULL,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.automation_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  gamemode_id UUID,
  project_id UUID,
  decision_type TEXT NOT NULL,
  decision_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  executed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.format_performance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  gamemode_id UUID,
  format_name TEXT NOT NULL,
  performance_score NUMERIC,
  sample_size INTEGER DEFAULT 0,
  last_calculated TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.lab_experiments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  gamemode_id UUID,
  name TEXT NOT NULL,
  hypothesis TEXT,
  status TEXT DEFAULT 'draft',
  results JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.lab_videos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  experiment_id UUID,
  user_id UUID,
  video_url TEXT NOT NULL,
  performance_data JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.render_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  project_id UUID,
  status TEXT NOT NULL DEFAULT 'pending',
  priority INTEGER DEFAULT 0,
  config JSONB DEFAULT '{}'::jsonb,
  error TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.comment_library (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  gamemode_id UUID,
  text TEXT NOT NULL,
  category TEXT,
  tags TEXT[],
  usage_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.tiktok_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID,
  user_id UUID,
  account_name TEXT NOT NULL,
  access_token TEXT,
  refresh_token TEXT,
  token_expires_at TIMESTAMPTZ,
  privacy TEXT DEFAULT 'private',
  tags TEXT[] DEFAULT '{}',
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.voices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  name TEXT NOT NULL,
  description TEXT,
  voice_id TEXT,
  provider TEXT,
  settings JSONB DEFAULT '{}'::jsonb,
  sample_url TEXT,
  is_premade BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.project_presets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  name TEXT NOT NULL,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.user_fonts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  family TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.custom_fonts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  family TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.avatars (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  file_url TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.motion_designs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  name TEXT NOT NULL,
  config JSONB DEFAULT '{}'::jsonb,
  file_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.tracked_videos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  project_id UUID,
  platform TEXT NOT NULL,
  video_id TEXT NOT NULL,
  views INTEGER DEFAULT 0,
  likes INTEGER DEFAULT 0,
  comments INTEGER DEFAULT 0,
  last_synced TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.video_analytics_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id UUID,
  snapshot_date DATE NOT NULL,
  views INTEGER DEFAULT 0,
  likes INTEGER DEFAULT 0,
  comments INTEGER DEFAULT 0,
  watch_time INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.channel_analytics_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID,
  snapshot_date DATE NOT NULL,
  subscribers INTEGER DEFAULT 0,
  views INTEGER DEFAULT 0,
  watch_time INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.video_cognitive_features (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id UUID,
  features JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.ai_zoom_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  video_id UUID,
  feedback_data JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Agentik flow tables
CREATE TABLE IF NOT EXISTS public.agentik_agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  project_id UUID,
  name TEXT NOT NULL,
  description TEXT,
  config JSONB DEFAULT '{}'::jsonb,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.agentik_knowledge (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  agent_id UUID,
  key TEXT NOT NULL,
  value JSONB,
  source TEXT,
  confidence NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.agentik_action_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  agent_id UUID,
  action_type TEXT NOT NULL,
  action_data JSONB,
  result JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.agentik_chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  agent_id UUID,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.agentik_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  source_agent_id UUID,
  target_agent_id UUID,
  connection_type TEXT,
  config JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.agentik_skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  name TEXT NOT NULL,
  description TEXT,
  code TEXT,
  config JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.agentik_project_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID,
  user_id UUID,
  metric_name TEXT NOT NULL,
  metric_value NUMERIC,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
