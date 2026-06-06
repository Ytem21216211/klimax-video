-- Create automation_settings table
CREATE TABLE public.automation_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  gamemode_id uuid REFERENCES public.gamemodes(id) ON DELETE CASCADE,
  
  -- Autonomy level (1=advisor, 2=copilot, 3=autopilot)
  autonomy_level integer DEFAULT 1 CHECK (autonomy_level BETWEEN 1 AND 3),
  
  -- Auto-execute thresholds
  scale_threshold_ctr numeric DEFAULT 5.0,
  scale_threshold_retention numeric DEFAULT 50.0,
  kill_threshold_retention numeric DEFAULT 25.0,
  kill_threshold_views_pct numeric DEFAULT 30.0,
  min_confidence_pct integer DEFAULT 75,
  
  -- Boundaries
  protected_settings text[] DEFAULT '{}',
  max_changes_per_day integer DEFAULT 5,
  
  -- Co-pilot delay
  copilot_delay_hours integer DEFAULT 6,
  
  -- Master switch
  enabled boolean DEFAULT true,
  paused_until timestamp with time zone,
  pause_reason text,
  
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.automation_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their automation settings"
  ON public.automation_settings FOR ALL USING (auth.uid() = user_id);

CREATE UNIQUE INDEX automation_settings_unique ON public.automation_settings(user_id, gamemode_id);

-- Create automation_decisions table
CREATE TABLE public.automation_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  gamemode_id uuid REFERENCES public.gamemodes(id) ON DELETE SET NULL,
  
  -- Decision details
  decision_type text NOT NULL,
  action_summary text NOT NULL,
  action_details jsonb NOT NULL DEFAULT '{}',
  
  -- Confidence and reasoning
  confidence_pct integer NOT NULL,
  reasoning text NOT NULL,
  data_points jsonb NOT NULL DEFAULT '{}',
  
  -- Status tracking
  status text NOT NULL DEFAULT 'pending',
  scheduled_at timestamp with time zone,
  executed_at timestamp with time zone,
  rolled_back_at timestamp with time zone,
  
  -- What was changed
  affected_entities jsonb DEFAULT '[]',
  previous_values jsonb DEFAULT '{}',
  new_values jsonb DEFAULT '{}',
  
  -- User interaction
  user_response text,
  user_response_at timestamp with time zone,
  user_notes text,
  
  created_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.automation_decisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their decisions"
  ON public.automation_decisions FOR SELECT USING (auth.uid() = user_id);
  
CREATE POLICY "Users can insert their decisions"
  ON public.automation_decisions FOR INSERT WITH CHECK (auth.uid() = user_id);
  
CREATE POLICY "Users can update their decisions"
  ON public.automation_decisions FOR UPDATE USING (auth.uid() = user_id);

CREATE INDEX automation_decisions_pending ON public.automation_decisions(user_id, status, scheduled_at)
  WHERE status = 'pending';
CREATE INDEX automation_decisions_gamemode ON public.automation_decisions(gamemode_id, created_at DESC);

-- Enable realtime for decisions
ALTER PUBLICATION supabase_realtime ADD TABLE public.automation_decisions;

-- Create format_performance table
CREATE TABLE public.format_performance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  gamemode_id uuid REFERENCES public.gamemodes(id) ON DELETE SET NULL,
  
  -- Format identification
  format_type text NOT NULL,
  format_value text NOT NULL,
  
  -- Aggregated metrics
  total_videos integer DEFAULT 0,
  total_views bigint DEFAULT 0,
  avg_retention_pct numeric,
  avg_ctr numeric,
  performance_trend text,
  
  -- Status
  status text DEFAULT 'active',
  killed_at timestamp with time zone,
  kill_reason text,
  
  last_analyzed_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  
  UNIQUE(user_id, gamemode_id, format_type, format_value)
);

ALTER TABLE public.format_performance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their format performance"
  ON public.format_performance FOR ALL USING (auth.uid() = user_id);