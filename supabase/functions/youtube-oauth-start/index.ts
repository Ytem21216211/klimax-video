import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validate auth
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const userId = claimsData.claims.sub;

    // Get project_id from request body
    const { project_id } = await req.json();
    if (!project_id) {
      return new Response(JSON.stringify({ error: 'project_id is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Verify user has access to this project (owner or member)
    const { data: project, error: projectError } = await supabaseAdmin
      .from('projects')
      .select('id, user_id')
      .eq('id', project_id)
      .single();

    if (projectError || !project) {
      console.error('[youtube-oauth-start] Project not found:', projectError);
      return new Response(JSON.stringify({ error: 'Project not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Check if user is owner
    const isOwner = project.user_id === userId;

    // If not owner, check if user is a member
    if (!isOwner) {
      const { data: membership } = await supabaseAdmin
        .from('project_members')
        .select('role')
        .eq('project_id', project_id)
        .eq('user_id', userId)
        .single();

      if (!membership) {
        console.error('[youtube-oauth-start] User not a member of project');
        return new Response(JSON.stringify({ error: 'Access denied' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    const clientId = Deno.env.get('YOUTUBE_CLIENT_ID');
    if (!clientId) {
      return new Response(JSON.stringify({ error: 'YouTube integration not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const redirectUri = `${supabaseUrl}/functions/v1/youtube-oauth-callback`;

    // State contains project_id and user_id for callback verification
    const state = btoa(JSON.stringify({ project_id, user_id: userId }));

    // Build Google OAuth URL with YouTube scopes (upload + analytics)
    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('response_type', 'code');
    // Include analytics scopes for tracking video performance
    authUrl.searchParams.set('scope', [
      'https://www.googleapis.com/auth/youtube',
      'https://www.googleapis.com/auth/youtube.upload',
      'https://www.googleapis.com/auth/youtube.readonly',
      'https://www.googleapis.com/auth/yt-analytics.readonly',
      'https://www.googleapis.com/auth/yt-analytics-monetary.readonly',
    ].join(' '));
    authUrl.searchParams.set('access_type', 'offline');
    authUrl.searchParams.set('prompt', 'consent'); // Force consent to get refresh token
    authUrl.searchParams.set('state', state);

    console.log(`[youtube-oauth-start] Generated OAuth URL for project ${project_id}, user ${userId}`);

    return new Response(JSON.stringify({ auth_url: authUrl.toString() }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[youtube-oauth-start] Error:', error);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
