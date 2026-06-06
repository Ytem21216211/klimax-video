import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Unified Channel-level analytics sync
// Fetches stats for YouTube and TikTok accounts and stores snapshots

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface YouTubeAccount {
    id: string;
    channel_id: string;
    channel_name: string;
    access_token: string;
    refresh_token: string;
    token_expires_at: string;
}

interface TikTokAccount {
    id: string;
    open_id: string;
    display_name: string;
    access_token: string;
    refresh_token: string;
    expires_at: string;
}

// --- YouTube Helpers ---

async function refreshYouTubeToken(refreshToken: string): Promise<{ access_token: string; expires_in: number } | null> {
    const clientId = Deno.env.get('YOUTUBE_CLIENT_ID');
    const clientSecret = Deno.env.get('YOUTUBE_CLIENT_SECRET');
    if (!clientId || !clientSecret) return null;

    const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            refresh_token: refreshToken,
            grant_type: 'refresh_token',
        }),
    });

    if (!response.ok) return null;
    return await response.json();
}

async function fetchYouTubeStats(accessToken: string, channelId: string) {
    const response = await fetch(
        `https://www.googleapis.com/youtube/v3/channels?part=statistics&id=${channelId}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!response.ok) return null;
    const data = await response.json();
    const stats = data.items?.[0]?.statistics;
    if (!stats) return null;

    return {
        total_views: parseInt(stats.viewCount) || 0,
        total_subscribers: parseInt(stats.subscriberCount) || 0,
        total_videos: parseInt(stats.videoCount) || 0,
        total_likes: 0, // YouTube Channels don't expose aggregate likes via v3/channels
    };
}

// --- TikTok Helpers ---

async function refreshTikTokToken(refreshToken: string): Promise<{ access_token: string; refresh_token: string; expires_in: number } | null> {
    const clientKey = Deno.env.get("TIKTOK_CLIENT_KEY");
    const clientSecret = Deno.env.get("TIKTOK_CLIENT_SECRET");
    if (!clientKey || !clientSecret) return null;

    const response = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            client_key: clientKey,
            client_secret: clientSecret,
            grant_type: "refresh_token",
            refresh_token: refreshToken,
        }),
    });

    if (!response.ok) return null;
    return await response.json();
}

async function fetchTikTokStats(accessToken: string) {
    const response = await fetch(
        "https://open.tiktokapis.com/v2/user/info/?fields=follower_count,video_count,likes_count",
        { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!response.ok) return null;
    const data = await response.json();
    const user = data.data?.user;
    if (!user) return null;

    return {
        total_views: 0, // TikTok User Info doesn't expose total views easily
        total_subscribers: user.follower_count || 0,
        total_videos: user.video_count || 0,
        total_likes: user.likes_count || 0,
    };
}

// --- Main Handler ---

Deno.serve(async (req: any) => {
    if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

    try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseKey);

        let synced = 0;
        let failed = 0;

        // 1. Sync YouTube
        const { data: ytAccounts } = await supabase.from('youtube_accounts').select('*').eq('enabled', true);
        for (const account of ytAccounts || []) {
            try {
                let token = account.access_token;
                if (new Date(account.token_expires_at) <= new Date()) {
                    const refreshed = await refreshYouTubeToken(account.refresh_token);
                    if (refreshed) {
                        token = refreshed.access_token;
                        await supabase.from('youtube_accounts').update({
                            access_token: token,
                            token_expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
                        }).eq('id', account.id);
                    }
                }

                const stats = await fetchYouTubeStats(token, account.channel_id);
                if (!stats) { failed++; continue; }

                const { data: prev } = await supabase.from('channel_analytics_snapshots')
                    .select('*').eq('youtube_account_id', account.id).order('snapshot_at', { ascending: false }).limit(1).single();

                await supabase.from('channel_analytics_snapshots').insert({
                    youtube_account_id: account.id,
                    channel_type: 'youtube',
                    total_views: stats.total_views,
                    total_subscribers: stats.total_subscribers,
                    total_videos: stats.total_videos,
                    total_likes: stats.total_likes,
                    delta_views: Math.max(stats.total_views - (prev?.total_views || 0), 0),
                    delta_subscribers: stats.total_subscribers - (prev?.total_subscribers || 0),
                    delta_videos: Math.max(stats.total_videos - (prev?.total_videos || 0), 0),
                    delta_likes: Math.max(stats.total_likes - (prev?.total_likes || 0), 0),
                });
                synced++;
            } catch (e) { console.error(`YT Sync Error [${account.channel_name}]:`, e); failed++; }
        }

        // 2. Sync TikTok
        const { data: ttAccounts } = await supabase.from('tiktok_accounts').select('*').eq('enabled', true);
        for (const account of ttAccounts || []) {
            try {
                let token = account.access_token;
                if (new Date(account.expires_at) <= new Date()) {
                    const refreshed = await refreshTikTokToken(account.refresh_token);
                    if (refreshed) {
                        token = refreshed.access_token;
                        await supabase.from('tiktok_accounts').update({
                            access_token: token,
                            refresh_token: refreshed.refresh_token,
                            expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
                        }).eq('id', account.id);
                    }
                }

                const stats = await fetchTikTokStats(token);
                if (!stats) { failed++; continue; }

                const { data: prev } = await supabase.from('channel_analytics_snapshots')
                    .select('*').eq('tiktok_account_id', account.id).order('snapshot_at', { ascending: false }).limit(1).single();

                await supabase.from('channel_analytics_snapshots').insert({
                    tiktok_account_id: account.id,
                    channel_type: 'tiktok',
                    total_views: stats.total_views,
                    total_subscribers: stats.total_subscribers,
                    total_videos: stats.total_videos,
                    total_likes: stats.total_likes,
                    delta_views: Math.max(stats.total_views - (prev?.total_views || 0), 0),
                    delta_subscribers: stats.total_subscribers - (prev?.total_subscribers || 0),
                    delta_videos: Math.max(stats.total_videos - (prev?.total_videos || 0), 0),
                    delta_likes: Math.max(stats.total_likes - (prev?.total_likes || 0), 0),
                });
                synced++;
            } catch (e) { console.error(`TT Sync Error [${account.display_name}]:`, e); failed++; }
        }

        return new Response(JSON.stringify({ synced, failed }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
});
