ALTER TABLE "public"."projects" ADD COLUMN IF NOT EXISTS "beginning_effect_settings" jsonb DEFAULT '{}'::jsonb;
