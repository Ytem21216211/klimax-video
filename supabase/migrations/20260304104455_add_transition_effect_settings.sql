ALTER TABLE "public"."projects" ADD COLUMN IF NOT EXISTS "transition_effect_settings" jsonb DEFAULT '{"enabled": false}'::jsonb;
