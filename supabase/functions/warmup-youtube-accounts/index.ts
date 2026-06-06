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

    if (!response.ok) return null;
    return await response.json();
}

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

    try {
        const supabase = createClient(
            Deno.env.get('SUPABASE_URL')!,
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
        );

        // Parse request body for manual trigger
        let manualAccountId = null;
        try {
            const body = await req.json();
            manualAccountId = body.account_id;
        } catch (e) {
            // Body might be empty for scheduled runs, ignore error
        }

        let query = supabase
            .from('youtube_accounts')
            .select('*')
            .eq('enabled', true);

        if (manualAccountId) {
            console.log(`[warmup] Manual trigger for account: ${manualAccountId}`);
            query = query.eq('id', manualAccountId);
        } else {
            console.log(`[warmup] Scheduled run for active warmup accounts`);
            query = query.in('warmup_status', ['new', 'warming']);
        }

        const { data: accounts, error: fetchError } = await query;

        if (fetchError) throw fetchError;
        if (!accounts || accounts.length === 0) {
            return new Response(JSON.stringify({ message: "No accounts in warmup" }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        const results = [];
        const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

        for (const account of accounts) {
            console.log(`[warmup] Processing account: ${account.channel_name}`);

            // Refresh token if needed
            let token = account.access_token;
            if (new Date(account.token_expires_at) <= new Date()) {
                const newTokens = await refreshAccessToken(account.refresh_token);
                if (newTokens) {
                    token = newTokens.access_token;
                    await supabase.from('youtube_accounts').update({
                        access_token: token,
                        token_expires_at: new Date(Date.now() + newTokens.expires_in * 1000).toISOString()
                    }).eq('id', account.id);
                }
            }

            // 2. Fetch target videos based on niche/search terms
            const settings = account.warmup_settings || { niche: "Minecraft", search_terms: [] };
            const query = settings.search_terms.length > 0
                ? settings.search_terms[Math.floor(Math.random() * settings.search_terms.length)]
                : settings.niche;

            // Fetch more results to provide variety for multiple interactions
            const searchResponse = await fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(query)}&type=video&maxResults=25&relevanceLanguage=en`, {
                headers: { Authorization: `Bearer ${token}` }
            });

            if (!searchResponse.ok) {
                console.error(`[warmup] Search failed for ${account.channel_name}`);
                continue;
            }

            const searchData = await searchResponse.json();
            const videos = searchData.items || [];
            if (videos.length === 0) continue;

            // Determine number of interactions to perform (User requested 5-10)
            const interactionTarget = Math.floor(Math.random() * 6) + 5;
            let interactionsPerformed = 0;

            // Use a subset of videos for interactions to avoid hitting same video twice
            const shuffledVideos = videos.sort(() => 0.5 - Math.random());
            const targetVideos = shuffledVideos.slice(0, interactionTarget);

            for (const video of targetVideos) {
                // 3. Perform random interaction (Like, Subscribe, or just Comment/Watch simulation)
                const rand = Math.random();
                let action = 'watch';
                let success = false;

                if (rand > 0.7) {
                    action = 'subscribe';
                    const subResp = await fetch(`https://www.googleapis.com/youtube/v3/subscriptions?part=snippet`, {
                        method: 'POST',
                        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                        body: JSON.stringify({ snippet: { resourceId: { kind: 'youtube#channel', channelId: video.snippet.channelId } } })
                    });
                    success = subResp.ok;
                } else if (rand > 0.3) {
                    action = 'like';
                    const likeResp = await fetch(`https://www.googleapis.com/youtube/v3/videos/rate?id=${video.id.videoId}&rating=like`, {
                        method: 'POST',
                        headers: { Authorization: `Bearer ${token}` }
                    });
                    success = likeResp.ok;
                } else {
                    // Simulation of a watch/view (doesn't require a specific write API call for many accounts, just being logged)
                    action = 'watch';
                    success = true;
                }

                // 4. Log interaction
                if (success) {
                    await supabase.from('youtube_warmup_logs').insert({
                        account_id: account.id,
                        interaction_type: action,
                        video_id: video.id.videoId,
                        video_title: video.snippet.title,
                        video_url: `https://youtube.com/watch?v=${video.id.videoId}`
                    });
                    interactionsPerformed++;
                }

                // Wait 2-5 seconds between interactions to seem organic
                await sleep(Math.floor(Math.random() * 3000) + 2000);
            }

            // Update status to 'warming' if it was 'new'
            if (interactionsPerformed > 0 && account.warmup_status === 'new') {
                await supabase.from('youtube_accounts').update({ warmup_status: 'warming' }).eq('id', account.id);
            }

            results.push({
                account: account.channel_name,
                interactions: interactionsPerformed,
                target: interactionTarget
            });
        }

        return new Response(JSON.stringify({ results }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    } catch (error: any) {
        return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
});
