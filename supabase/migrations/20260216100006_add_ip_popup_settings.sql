-- Add IP Pop-up settings to projects table
ALTER TABLE "public"."projects"
ADD COLUMN IF NOT EXISTS "ip_popup_settings" jsonb DEFAULT '{
  "enabled": false,
  "start_time": 5,
  "duration": 5,
  "sfx_id": null,
  "text": {
    "content": "play.myserver.net",
    "x": 50,
    "y": 50,
    "font_family": "Montserrat",
    "font_size": 6,
    "color": "#ffffff",
    "stroke_enabled": true,
    "stroke_color": "#000000",
    "stroke_width": 2,
    "shadow_enabled": true,
    "shadow_opacity": 0.8,
    "shadow_blur": 10,
    "glow_enabled": false,
    "glow_color": "#ff0000",
    "glow_size": 10,
    "glow_intensity": 50
  },
  "image1": {
    "enabled": false,
    "url": null,
    "x": 50,
    "y": 30,
    "scale": 1.0,
    "z_index": 1
  },
  "image2": {
    "enabled": false,
    "url": null,
    "x": 50,
    "y": 70,
    "scale": 1.0,
    "z_index": 2
  }
}'::jsonb NOT NULL;

-- Add index for performance query optimization if needed (though minimal impact on small table)
-- CREATE INDEX idx_projects_ip_popup ON public.projects USING gin (ip_popup_settings);
