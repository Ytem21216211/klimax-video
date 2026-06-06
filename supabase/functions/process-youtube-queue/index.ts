import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function refreshAccessToken(refreshToken: string): Promise<{ access_token: string; expires_in: number } | null> {
  const clientId = Deno.env.get('YOUTUBE_CLIENT_ID');
  const clientSecret = Deno.env.get('YOUTUBE_CLIENT_SECRET');

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId!,
      client_secret: clientSecret!,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  if (!response.ok) {
    console.error('[process-youtube-queue] Token refresh failed:', await response.text());
    return null;
  }

  return await response.json();
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('[process-youtube-queue] Starting queue processing...');

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Get pending posts that are due
    const now = new Date().toISOString();
    const { data: pendingPosts, error: fetchError } = await supabase
      .from('youtube_post_queue')
      .select(`
        *,
        account:youtube_accounts(*)
      `)
      .eq('status', 'pending')
      .lte('scheduled_for', now)
      .order('scheduled_for', { ascending: true })
      .limit(10);

    if (fetchError) {
      console.error('[process-youtube-queue] Error fetching queue:', fetchError);
      return new Response(JSON.stringify({ error: 'Failed to fetch queue' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (!pendingPosts || pendingPosts.length === 0) {
      console.log('[process-youtube-queue] No pending posts to process');
      return new Response(JSON.stringify({ processed: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log(`[process-youtube-queue] Found ${pendingPosts.length} posts to process`);

    let processed = 0;
    let failed = 0;

    for (const post of pendingPosts) {
      const account = post.account;
      if (!account || !account.enabled) {
        console.log(`[process-youtube-queue] Skipping post ${post.id} - account disabled or missing`);
        await supabase
          .from('youtube_post_queue')
          .update({ status: 'failed', error_message: 'Account disabled or not found' })
          .eq('id', post.id);
        failed++;
        continue;
      }

      // Mark as processing
      await supabase
        .from('youtube_post_queue')
        .update({ status: 'processing' })
        .eq('id', post.id);

      try {
        // Check if token needs refresh
        let accessToken = account.access_token;
        const tokenExpiresAt = new Date(account.token_expires_at);

        if (tokenExpiresAt <= new Date()) {
          console.log(`[process-youtube-queue] Refreshing token for ${account.channel_name}`);
          const newTokens = await refreshAccessToken(account.refresh_token);

          if (!newTokens) {
            throw new Error('Failed to refresh token');
          }

          accessToken = newTokens.access_token;
          const newExpiresAt = new Date(Date.now() + (newTokens.expires_in * 1000)).toISOString();

          await supabase
            .from('youtube_accounts')
            .update({
              access_token: accessToken,
              token_expires_at: newExpiresAt,
            })
            .eq('id', account.id);
        }

        // Download video
        console.log(`[process-youtube-queue] Downloading video for post ${post.id}`);
        const videoResponse = await fetch(post.video_url);
        if (!videoResponse.ok) {
          throw new Error(`Failed to download video: ${videoResponse.statusText}`);
        }
        const videoBlob = await videoResponse.blob();

        // Prepare metadata
        const metadata = {
          snippet: {
            title: (account.custom_title || post.title || 'Untitled Video').substring(0, 100),
            description: (account.custom_description || post.description || '').substring(0, 5000),
            tags: account.tags || [],
            categoryId: account.category_id || '20',
          },
          status: {
            privacyStatus: account.privacy || 'private',
            selfDeclaredMadeForKids: account.made_for_kids || false,
          },
        };

        // Upload to YouTube
        console.log(`[process-youtube-queue] Uploading to ${account.channel_name}`);

        const initResponse = await fetch(
          'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
              'X-Upload-Content-Length': videoBlob.size.toString(),
              'X-Upload-Content-Type': 'video/mp4',
            },
            body: JSON.stringify(metadata),
          }
        );

        if (!initResponse.ok) {
          throw new Error(`Upload init failed: ${await initResponse.text()}`);
        }

        const uploadUrl = initResponse.headers.get('Location');
        if (!uploadUrl) {
          throw new Error('No upload URL returned');
        }

        const uploadResponse = await fetch(uploadUrl, {
          method: 'PUT',
          headers: {
            'Content-Type': 'video/mp4',
            'Content-Length': videoBlob.size.toString(),
          },
          body: videoBlob,
        });

        if (!uploadResponse.ok) {
          throw new Error(`Upload failed: ${await uploadResponse.text()}`);
        }

        const uploadResult = await uploadResponse.json();
        console.log(`[process-youtube-queue] Success! Video ID: ${uploadResult.id}`);

        // Mark as completed
        await supabase
          .from('youtube_post_queue')
          .update({
            status: 'completed',
            posted_at: new Date().toISOString(),
            youtube_video_id: uploadResult.id,
          })
          .eq('id', post.id);

        processed++;

      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error(`[process-youtube-queue] Failed to process post ${post.id}:`, error);

        await supabase
          .from('youtube_post_queue')
          .update({
            status: 'failed',
            error_message: message,
          })
          .eq('id', post.id);

        failed++;
      }
    }

    console.log(`[process-youtube-queue] Done. Processed: ${processed}, Failed: ${failed}`);

    return new Response(JSON.stringify({ processed, failed }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[process-youtube-queue] Error:', error);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
