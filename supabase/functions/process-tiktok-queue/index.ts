import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function refreshTikTokToken(refreshToken: string): Promise<{ access_token: string; refresh_token: string; expires_in: number; refresh_expires_in: number } | null> {
    const clientKey = Deno.env.get("TIKTOK_CLIENT_KEY");
    const clientSecret = Deno.env.get("TIKTOK_CLIENT_SECRET");

    const response = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "Cache-Control": "no-cache",
        },
        body: new URLSearchParams({
            client_key: clientKey!,
            client_secret: clientSecret!,
            grant_type: "refresh_token",
            refresh_token: refreshToken,
        }),
    });

    if (!response.ok) {
        console.error("[process-tiktok-queue] Token refresh failed:", await response.text());
        return null;
    }

    return await response.json();
}

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        console.log('[process-tiktok-queue] Starting queue processing...');

        // @ts-ignore
        const supabase = createClient(
            Deno.env.get('SUPABASE_URL')!,
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
        );

        // Get pending posts that are due
        const now = new Date().toISOString();
        const { data: pendingPosts, error: fetchError } = await supabase
            .from('tiktok_post_queue')
            .select(`
        *,
        account:tiktok_accounts(*)
      `)
            .eq('status', 'pending')
            .lte('scheduled_for', now)
            .order('scheduled_for', { ascending: true })
            .limit(5); // Process 5 at a time to avoid timeouts

        if (fetchError) {
            console.error('[process-tiktok-queue] Error fetching queue:', fetchError);
            return new Response(JSON.stringify({ error: 'Failed to fetch queue' }), {
                status: 500,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        if (!pendingPosts || pendingPosts.length === 0) {
            console.log('[process-tiktok-queue] No pending posts to process');
            return new Response(JSON.stringify({ processed: 0 }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        console.log(`[process-tiktok-queue] Found ${pendingPosts.length} posts to process`);

        let processed = 0;
        let failed = 0;

        for (const post of pendingPosts) {
            const account = post.account;
            if (!account || !account.enabled) {
                console.log(`[process-tiktok-queue] Skipping post ${post.id} - account disabled or missing`);
                await supabase
                    .from('tiktok_post_queue')
                    .update({ status: 'failed', error_message: 'Account disabled or not found' })
                    .eq('id', post.id);
                failed++;
                continue;
            }

            // Mark as processing
            await supabase
                .from('tiktok_post_queue')
                .update({ status: 'processing' })
                .eq('id', post.id);

            try {
                // Check if token needs refresh
                let accessToken = account.access_token;
                const expiresAt = new Date(account.expires_at);

                if (expiresAt.getTime() - Date.now() < 5 * 60 * 1000) {
                    console.log(`[process-tiktok-queue] Token expired for ${account.display_name}, refreshing...`);
                    const newTokens = await refreshTikTokToken(account.refresh_token);

                    if (!newTokens) {
                        throw new Error("Failed to refresh TikTok token");
                    }

                    accessToken = newTokens.access_token;
                    const newExpiresAt = new Date(Date.now() + newTokens.expires_in * 1000).toISOString();
                    const newRefreshExpiresAt = new Date(Date.now() + newTokens.refresh_expires_in * 1000).toISOString();

                    await supabase
                        .from("tiktok_accounts")
                        .update({
                            access_token: accessToken,
                            refresh_token: newTokens.refresh_token,
                            expires_at: newExpiresAt,
                            refresh_expires_at: newRefreshExpiresAt,
                        })
                        .eq("id", account.id);
                }

                // Download video
                console.log(`[process-tiktok-queue] Downloading video for post ${post.id}`);
                const videoResponse = await fetch(post.video_url);
                if (!videoResponse.ok) {
                    throw new Error(`Failed to download video: ${videoResponse.statusText}`);
                }
                const videoBlob = await videoResponse.blob();

                // Map privacy settings
                let privacyLevel = "SELF_ONLY";
                if (post.privacy === "public") privacyLevel = "PUBLIC_TO_EVERYONE";
                if (post.privacy === "friends") privacyLevel = "MUTUAL_FOLLOW_FRIENDS";
                // Override with account default if not specified? No, post settings take precedence if present, else account.
                // Actually tiktok_post_queue has privacy column.
                if (!post.privacy) {
                    if (account.privacy === "public") privacyLevel = "PUBLIC_TO_EVERYONE";
                    if (account.privacy === "friends") privacyLevel = "MUTUAL_FOLLOW_FRIENDS";
                }

                console.log(`[process-tiktok-queue] Uploading to ${account.display_name} (Privacy: ${privacyLevel})`);

                // 1. Init Upload
                const initResponse = await fetch("https://open.tiktokapis.com/v2/post/publish/video/init/", {
                    method: "POST",
                    headers: {
                        "Authorization": `Bearer ${accessToken}`,
                        "Content-Type": "application/json; charset=UTF-8",
                    },
                    body: JSON.stringify({
                        post_info: {
                            title: (post.caption || 'New Video').substring(0, 2200),
                            privacy_level: privacyLevel,
                            disable_duet: false,
                            disable_comment: false,
                            disable_stitch: false,
                            video_cover_timestamp_ms: 0,
                        },
                        source_info: {
                            source: "FILE_UPLOAD",
                            video_size: videoBlob.size,
                            chunk_size: videoBlob.size,
                            total_chunk_count: 1,
                        },
                    }),
                });

                if (!initResponse.ok) {
                    throw new Error(`Upload init failed: ${await initResponse.text()}`);
                }

                const initData = await initResponse.json();
                const uploadUrl = initData.data.upload_url;

                if (!uploadUrl) {
                    throw new Error("No upload URL returned from TikTok");
                }

                // 2. Upload Video
                const uploadResponse = await fetch(uploadUrl, {
                    method: "PUT",
                    headers: {
                        "Content-Type": "video/mp4",
                        "Content-Length": videoBlob.size.toString(),
                    },
                    body: videoBlob,
                });

                if (!uploadResponse.ok) {
                    throw new Error(`Upload failed: ${await uploadResponse.text()}`);
                }

                console.log(`[process-tiktok-queue] Success! Upload accepted.`);

                // Mark as published (TikTok doesn't return ID immediately in this flow, usually)
                await supabase
                    .from('tiktok_post_queue')
                    .update({
                        status: 'published',
                        posted_at: new Date().toISOString(),
                    })
                    .eq('id', post.id);

                processed++;

            } catch (error: unknown) {
                const message = error instanceof Error ? error.message : 'Unknown error';
                console.error(`[process-tiktok-queue] Failed to process post ${post.id}:`, error);

                await supabase
                    .from('tiktok_post_queue')
                    .update({
                        status: 'failed',
                        error_message: message,
                    })
                    .eq('id', post.id);

                failed++;
            }
        }

        console.log(`[process-tiktok-queue] Done. Processed: ${processed}, Failed: ${failed}`);

        return new Response(JSON.stringify({ processed, failed }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error('[process-tiktok-queue] Error:', error);
        return new Response(JSON.stringify({ error: message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
});
