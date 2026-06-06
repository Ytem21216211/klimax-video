import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const error = url.searchParams.get('error');

    // Get the app URL for redirects
    const appUrl = Deno.env.get('APP_URL') || 'https://mine-edit-ai.lovable.app';

    if (error) {
      console.error('[youtube-oauth-callback] OAuth error:', error);
      return Response.redirect(`${appUrl}?youtube_error=${encodeURIComponent(error)}`);
    }

    if (!code || !state) {
      console.error('[youtube-oauth-callback] Missing code or state');
      return Response.redirect(`${appUrl}?youtube_error=missing_params`);
    }

    // Decode state to get project_id and user_id
    let stateData: { project_id: string; user_id: string };
    try {
      stateData = JSON.parse(atob(state));
    } catch (e) {
      console.error('[youtube-oauth-callback] Invalid state:', e);
      return Response.redirect(`${appUrl}?youtube_error=invalid_state`);
    }

    const { project_id, user_id } = stateData;
    console.log(`[youtube-oauth-callback] Processing for project ${project_id}, user ${user_id}`);

    // Exchange code for tokens
    const clientId = Deno.env.get('YOUTUBE_CLIENT_ID');
    const clientSecret = Deno.env.get('YOUTUBE_CLIENT_SECRET');
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const redirectUri = `${supabaseUrl}/functions/v1/youtube-oauth-callback`;

    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId!,
        client_secret: clientSecret!,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('[youtube-oauth-callback] Token exchange failed:', errorText);
      return Response.redirect(`${appUrl}/project/${project_id}?youtube_error=token_exchange_failed`);
    }

    const tokens = await tokenResponse.json();
    console.log('[youtube-oauth-callback] Token exchange successful');

    // Get channel info
    const channelResponse = await fetch(
      'https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true',
      {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      }
    );

    let channelId = '';
    let channelName = '';

    if (channelResponse.ok) {
      const channelData = await channelResponse.json();
      if (channelData.items && channelData.items.length > 0) {
        channelId = channelData.items[0].id;
        channelName = channelData.items[0].snippet.title;
        console.log(`[youtube-oauth-callback] Channel found: ${channelName} (${channelId})`);
      }
    } else {
      console.warn('[youtube-oauth-callback] Could not fetch channel info');
    }

    if (!channelId) {
      return Response.redirect(`${appUrl}/project/${project_id}?youtube_error=no_channel_found`);
    }

    // Calculate token expiry
    const expiresAt = new Date(Date.now() + (tokens.expires_in * 1000)).toISOString();

    // Store tokens in youtube_accounts table using service role
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // First verify the user has access to this project (owner or admin member)
    // Also fetch youtube_settings for default post settings
    const { data: projectData, error: projectError } = await supabase
      .from('projects')
      .select('user_id, youtube_settings')
      .eq('id', project_id)
      .single();

    if (projectError || !projectData) {
      console.error('[youtube-oauth-callback] Project not found:', projectError);
      return Response.redirect(`${appUrl}/project/${project_id}?youtube_error=project_not_found`);
    }

    const isOwner = projectData.user_id === user_id;

    // Check if user is an admin member if not owner
    let isAdmin = false;
    if (!isOwner) {
      const { data: memberData } = await supabase
        .from('project_members')
        .select('role')
        .eq('project_id', project_id)
        .eq('user_id', user_id)
        .single();

      isAdmin = memberData?.role === 'admin';
    }

    if (!isOwner && !isAdmin) {
      console.error('[youtube-oauth-callback] User not authorized for project');
      return Response.redirect(`${appUrl}/project/${project_id}?youtube_error=not_authorized`);
    }

    // Parse default post settings from project's youtube_settings
    let defaultSettings = {
      privacy: 'private',
      category_id: '20',
      tags: [] as string[],
      made_for_kids: false,
      custom_title: null as string | null,
      custom_description: null as string | null,
    };

    const ytSettings = projectData.youtube_settings as Record<string, unknown> | null;
    if (ytSettings && ytSettings.apply_to_new_accounts !== false) {
      console.log('[youtube-oauth-callback] Applying default post settings to new account');
      defaultSettings = {
        privacy: (ytSettings.default_privacy as string) || 'private',
        category_id: (ytSettings.default_category_id as string) || '20',
        tags: (ytSettings.default_tags as string[]) || [],
        made_for_kids: Boolean(ytSettings.default_made_for_kids),
        custom_title: (ytSettings.default_title as string) || null,
        custom_description: (ytSettings.default_description as string) || null,
      };
    }

    // Check if this channel is already connected to this project
    const { data: existingAccount } = await supabase
      .from('youtube_accounts')
      .select('id')
      .eq('project_id', project_id)
      .eq('channel_id', channelId)
      .single();

    if (existingAccount) {
      // Update existing account with new tokens
      const { error: updateError } = await supabase
        .from('youtube_accounts')
        .update({
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token || undefined,
          token_expires_at: expiresAt,
          channel_name: channelName,
        })
        .eq('id', existingAccount.id);

      if (updateError) {
        console.error('[youtube-oauth-callback] Failed to update account:', updateError);
        return Response.redirect(`${appUrl}/project/${project_id}?youtube_error=save_failed`);
      }

      console.log(`[youtube-oauth-callback] Updated existing YouTube account for project ${project_id}`);
    } else {
      // Create new account with default settings applied
      const { error: insertError } = await supabase
        .from('youtube_accounts')
        .insert({
          project_id: project_id,
          channel_id: channelId,
          channel_name: channelName,
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          token_expires_at: expiresAt,
          enabled: true,
          privacy: defaultSettings.privacy,
          category_id: defaultSettings.category_id,
          tags: defaultSettings.tags,
          made_for_kids: defaultSettings.made_for_kids,
          custom_title: defaultSettings.custom_title,
          custom_description: defaultSettings.custom_description,
          warmup_status: 'new',
          warmup_started_at: new Date().toISOString(),
        });

      if (insertError) {
        console.error('[youtube-oauth-callback] Failed to create account:', insertError);
        return Response.redirect(`${appUrl}/project/${project_id}?youtube_error=save_failed`);
      }

      console.log(`[youtube-oauth-callback] Created new YouTube account with default settings for project ${project_id}`);
    }

    return Response.redirect(`${appUrl}/project/${project_id}?youtube_connected=true`);

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[youtube-oauth-callback] Error:', error);
    const appUrl = Deno.env.get('APP_URL') || 'https://mine-edit-ai.lovable.app';
    return Response.redirect(`${appUrl}?youtube_error=${encodeURIComponent(message)}`);
  }
});
