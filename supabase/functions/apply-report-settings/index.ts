import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Validate user from auth header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const userId = claimsData.claims.sub;

    const { reportId, action } = await req.json();

    if (!reportId || !action) {
      return new Response(JSON.stringify({ error: 'Missing reportId or action' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get the report
    const { data: report, error: reportError } = await supabase
      .from('weekly_reports')
      .select('*')
      .eq('id', reportId)
      .eq('user_id', userId)
      .single();

    if (reportError || !report) {
      return new Response(JSON.stringify({ error: 'Report not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'dismiss') {
      // Just update the report status
      const { error: updateError } = await supabase
        .from('weekly_reports')
        .update({ status: 'dismissed' })
        .eq('id', reportId);

      if (updateError) throw updateError;

      return new Response(JSON.stringify({ success: true, action: 'dismissed' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'approve') {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);

      // Deactivate any existing active settings for this gamemode
      await supabase
        .from('active_report_settings')
        .delete()
        .eq('user_id', userId)
        .eq('gamemode_id', report.gamemode_id);

      // Create new active settings
      const { error: settingsError } = await supabase
        .from('active_report_settings')
        .insert({
          user_id: userId,
          gamemode_id: report.gamemode_id,
          report_id: reportId,
          settings: report.recommendations,
          expires_at: expiresAt.toISOString(),
        });

      if (settingsError) throw settingsError;

      // Update report status
      const { error: updateError } = await supabase
        .from('weekly_reports')
        .update({ 
          status: 'approved',
          applied_at: new Date().toISOString(),
          expires_at: expiresAt.toISOString(),
        })
        .eq('id', reportId);

      if (updateError) throw updateError;

      // Apply settings to YouTube accounts for this gamemode
      // Get projects with this gamemode
      const { data: projects } = await supabase
        .from('projects')
        .select('id')
        .eq('user_id', userId)
        .eq('gamemode_id', report.gamemode_id);

      if (projects && projects.length > 0) {
        const projectIds = projects.map(p => p.id);
        
        // Update YouTube accounts with optimized settings from recommendations
        const recommendations = report.recommendations as {
          title_optimization?: { pattern?: string; examples?: string[] };
          description_optimization?: { template?: string; keywords_to_include?: string[] };
          tags_optimization?: { add_tags?: string[] };
        };

        const titleTemplate = recommendations.title_optimization?.examples?.[0] || null;
        const descriptionTemplate = recommendations.description_optimization?.template || null;
        const newTags = recommendations.tags_optimization?.add_tags || [];

        if (titleTemplate || descriptionTemplate || newTags.length > 0) {
          for (const projectId of projectIds) {
            const { data: accounts } = await supabase
              .from('youtube_accounts')
              .select('id, tags, custom_title, custom_description')
              .eq('project_id', projectId);

            for (const account of accounts || []) {
              const updates: { tags?: string[]; custom_title?: string; custom_description?: string } = {};
              
              if (newTags.length > 0) {
                const existingTags = account.tags || [];
                updates.tags = [...new Set([...existingTags, ...newTags])];
              }
              
              // Only update if not already customized
              if (titleTemplate && !account.custom_title) {
                updates.custom_title = titleTemplate;
              }
              if (descriptionTemplate && !account.custom_description) {
                updates.custom_description = descriptionTemplate;
              }

              if (Object.keys(updates).length > 0) {
                await supabase
                  .from('youtube_accounts')
                  .update(updates)
                  .eq('id', account.id);
              }
            }
          }
        }
      }

      console.log(`Applied report ${reportId} for gamemode ${report.gamemode_id}, expires ${expiresAt.toISOString()}`);

      return new Response(JSON.stringify({ 
        success: true, 
        action: 'approved',
        expiresAt: expiresAt.toISOString(),
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Invalid action' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('Error applying report settings:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
