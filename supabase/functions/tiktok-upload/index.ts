import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface TikTokAccount {
    id: string;
    project_id: string;
    open_id: string;
    access_token: string;
    refresh_token: string;
    expires_at: string;
    refresh_expires_at: string;
    display_name: string;
    privacy: string;
    enabled: boolean;
}

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
        console.error("[tiktok-upload] Token refresh failed:", await response.text());
        return null;
    }

    return await response.json();
}

async function uploadToAccount(
    supabase: any,
    account: TikTokAccount,
    videoBlob: Blob,
    title: string
): Promise<{ success: boolean; error?: string }> {
    try {
        // Check if token needs refresh
        let accessToken = account.access_token;
        const expiresAt = new Date(account.expires_at);

        // Refresh if expired or expiring in < 5 mins
        if (expiresAt.getTime() - Date.now() < 5 * 60 * 1000) {
            console.log(`[tiktok-upload] Token expired for ${account.display_name}, refreshing...`);
            const newTokens = await refreshTikTokToken(account.refresh_token);

            if (!newTokens) {
                return { success: false, error: "Failed to refresh TikTok token" };
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

            // Update local account object
            account.refresh_token = newTokens.refresh_token;
        }

        // Map privacy settings
        // DB: public, friends, private
        // API: PUBLIC_TO_EVERYONE, MUTUAL_FOLLOW_FRIENDS, SELF_ONLY
        let privacyLevel = "SELF_ONLY"; // Default safest
        if (account.privacy === "public") privacyLevel = "PUBLIC_TO_EVERYONE";
        if (account.privacy === "friends") privacyLevel = "MUTUAL_FOLLOW_FRIENDS";
        if (account.privacy === "private") privacyLevel = "SELF_ONLY";

        console.log(`[tiktok-upload] Uploading to ${account.display_name} (Privacy: ${privacyLevel})...`);

        // 1. Init Upload
        const initResponse = await fetch("https://open.tiktokapis.com/v2/post/publish/video/init/", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${accessToken}`,
                "Content-Type": "application/json; charset=UTF-8",
            },
            body: JSON.stringify({
                post_info: {
                    title: title.substring(0, 2200), // TikTok limit is 2200
                    privacy_level: privacyLevel,
                    disable_duet: false,
                    disable_comment: false,
                    disable_stitch: false,
                    video_cover_timestamp_ms: 0,
                },
                source_info: {
                    source: "FILE_UPLOAD",
                    video_size: videoBlob.size,
                    chunk_size: videoBlob.size, // Determine chunk size, here we assume small enough for single chunk
                    total_chunk_count: 1,
                },
            }),
        });

        if (!initResponse.ok) {
            const errText = await initResponse.text();
            console.error("[tiktok-upload] Init failed:", errText);
            return { success: false, error: `Upload init failed: ${errText}` };
        }

        const initData = await initResponse.json();
        const uploadUrl = initData.data.upload_url;

        if (!uploadUrl) {
            return { success: false, error: "No upload URL returned from TikTok" };
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
            const errText = await uploadResponse.text();
            console.error("[tiktok-upload] Upload PUT failed:", errText);
            return { success: false, error: `Upload failed: ${errText}` };
        }

        // Note: TikTok V2 API handles processing asynchronously. 
        // Once the PUT is done, the post is created but might take time to process.
        // There isn't always a direct "success" ID returned immediately in the PUT response body 
        // in the same way YouTube does, but a 200 OK means it's queued/processing on their end.

        console.log(`[tiktok-upload] Success! Upload accepted.`);
        return { success: true };

    } catch (error: any) {
        console.error(`[tiktok-upload] Error uploading to ${account.display_name}:`, error);
        return { success: false, error: error.message };
    }
}

Deno.serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const {
            project_id,
            video_url,
            title,
            account_id,
            exclude_account_ids = []
        } = await req.json();

        if (!project_id || !video_url) {
            return new Response(JSON.stringify({ error: "project_id and video_url are required" }), {
                status: 400,
                headers: { ...corsHeaders, "Content-Type": "application/json" }
            });
        }

        const supabase = createClient(
            Deno.env.get("SUPABASE_URL")!,
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
        );

        // Fetch Accounts
        const { data: allAccounts, error: accountsError } = await supabase
            .from("tiktok_accounts")
            .select("*")
            .eq("project_id", project_id)
            .eq("enabled", true);

        if (accountsError || !allAccounts || allAccounts.length === 0) {
            return new Response(JSON.stringify({ error: "No enabled TikTok accounts found" }), {
                status: 400,
                headers: { ...corsHeaders, "Content-Type": "application/json" }
            });
        }

        // Account Selection Logic (Simple exclusion + Random for now, can perform cooldown logic later if needed)
        // Filter excluded
        const excludeSet = new Set(exclude_account_ids);
        let availableAccounts = allAccounts.filter((a: any) => !excludeSet.has(a.id));
        if (availableAccounts.length === 0) availableAccounts = allAccounts;

        // Pick one (Random for now)
        const selectedAccount = availableAccounts[Math.floor(Math.random() * availableAccounts.length)];

        if (account_id) {
            // user forced specific account
            const forced = allAccounts.find((a: any) => a.id === account_id);
            if (forced) Object.assign(selectedAccount, forced);
        }

        console.log(`[tiktok-upload] Selected account: ${selectedAccount.display_name}`);

        // Download Video
        console.log("[tiktok-upload] Downloading video...");
        const videoResponse = await fetch(video_url);
        if (!videoResponse.ok) throw new Error("Failed to download video");
        const videoBlob = await videoResponse.blob();

        // Upload
        const result = await uploadToAccount(supabase, selectedAccount, videoBlob, title || "New Video");

        // Log to Queue (as completed or failed)
        await supabase.from("tiktok_post_queue").insert({
            project_id,
            account_id: selectedAccount.id,
            video_url,
            caption: title,
            privacy: selectedAccount.privacy,
            status: result.success ? "published" : "failed", // 'published' is closest to 'completed'
            posted_at: result.success ? new Date().toISOString() : null,
            error_message: result.error || null,
            scheduled_for: new Date().toISOString()
        });

        if (result.success) {
            return new Response(JSON.stringify({ success: true, account_id: selectedAccount.id }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" }
            });
        } else {
            return new Response(JSON.stringify({ error: result.error }), {
                status: 500,
                headers: { ...corsHeaders, "Content-Type": "application/json" }
            });
        }

    } catch (error: any) {
        console.error("[tiktok-upload] Error:", error);
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
    }
});
