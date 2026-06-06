import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const url = new URL(req.url);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        // state contains project_id
        const error = url.searchParams.get("error");
        const errorDescription = url.searchParams.get("error_description");

        if (error) {
            throw new Error(`TikTok Auth Error: ${error} - ${errorDescription}`);
        }
        if (!code) {
            throw new Error("No code returned from TikTok");
        }
        if (!state) {
            throw new Error("No state (project_id) returned");
        }

        const projectId = state;

        // Supabase Setup
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        // TikTok Config
        const clientKey = Deno.env.get("TIKTOK_CLIENT_KEY")!;
        const clientSecret = Deno.env.get("TIKTOK_CLIENT_SECRET")!;
        const redirectUri = Deno.env.get("TIKTOK_REDIRECT_URI")!;

        // 1. Exchange Code for Tokens
        const tokenResponse = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                "Cache-Control": "no-cache",
            },
            body: new URLSearchParams({
                client_key: clientKey,
                client_secret: clientSecret,
                code: code,
                grant_type: "authorization_code",
                redirect_uri: redirectUri,
            }),
        });

        if (!tokenResponse.ok) {
            const errText = await tokenResponse.text();
            console.error("TikTok Token Error:", errText);
            throw new Error(`Failed to exchange token: ${errText}`);
        }

        const tokenData = await tokenResponse.json();
        /*
          tokenData structure:
          {
            access_token: "...",
            expires_in: 86400,
            refresh_token: "...",
            refresh_expires_in: 31536000,
            open_id: "...",
            scope: "...",
            token_type: "Bearer"
          }
        */

        const accessToken = tokenData.access_token;
        const refreshToken = tokenData.refresh_token;
        const openId = tokenData.open_id;

        // Calculate expiry dates
        const now = new Date();
        const expiresAt = new Date(now.getTime() + tokenData.expires_in * 1000);
        const refreshExpiresAt = new Date(now.getTime() + tokenData.refresh_expires_in * 1000);

        // 2. Fetch User Info
        const userInfoResponse = await fetch("https://open.tiktokapis.com/v2/user/info/?fields=open_id,union_id,avatar_url,display_name", {
            headers: {
                "Authorization": `Bearer ${accessToken}`,
            },
        });

        if (!userInfoResponse.ok) {
            const errText = await userInfoResponse.text();
            console.error("TikTok User Info Error:", errText);
            throw new Error(`Failed to fetch user info: ${errText}`);
        }

        const userInfoData = await userInfoResponse.json();
        const user = userInfoData.data.user;

        // 3. Upsert into Database
        const { error: upsertError } = await supabase
            .from("tiktok_accounts")
            .upsert({
                project_id: projectId,
                open_id: openId,
                access_token: accessToken,
                refresh_token: refreshToken,
                expires_at: expiresAt.toISOString(),
                refresh_expires_at: refreshExpiresAt.toISOString(),
                display_name: user.display_name,
                avatar_url: user.avatar_url,
                updated_at: new Date().toISOString(),
                enabled: true
            }, {
                onConflict: "project_id,open_id"
            });

        if (upsertError) {
            console.error("Supabase Upsert Error:", upsertError);
            throw new Error(`Database error: ${upsertError.message}`);
        }

        // 4. Redirect to App
        // We assume the app is running mostly at specific URL, but ideally we redirect to the project settings
        // Since we don't pass the base URL, we redirect to a known endpoint
        // Standard pattern: Redirect to app with success param
        // e.g. http://localhost:5173/project/<id>?tiktok_connected=true

        // NOTE: In production, Deno.env.get("APP_URL") should be used.
        // For now we try to guess or hardcode based on environment, or just return success text if dev.
        // But `tiktok-oauth-start` is called from the browser, so this is a browser redirect.
        // We'll use specific APP_URL env var if available, else default.
        const appUrl = Deno.env.get("APP_URL") || "http://localhost:5173";
        const redirectUrl = `${appUrl}/project/${projectId}?tiktok_connected=true`;

        return Response.redirect(redirectUrl, 302);

    } catch (error) {
        console.error("Error in tiktok-oauth-callback:", error);
        // Redirect with error
        const appUrl = Deno.env.get("APP_URL") || "http://localhost:5173";
        // We can't easily access projectId if it failed early, so we might redirect to base or just show JSON error if it's fatal
        // If we have state, we can redirect to project
        const url = new URL(req.url);
        const projectId = url.searchParams.get("state");
        if (projectId) {
            return Response.redirect(`${appUrl}/project/${projectId}?tiktok_error=${encodeURIComponent(error.message)}`, 302);
        }

        return new Response(
            JSON.stringify({ error: error.message }),
            {
                status: 400,
                headers: { ...corsHeaders, "Content-Type": "application/json" }
            }
        );
    }
});
