import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const { project_id } = await req.json();

        if (!project_id) {
            throw new Error("Project ID is required");
        }

        const clientKey = Deno.env.get("TIKTOK_CLIENT_KEY");
        // Make sure to set TIKTOK_REDIRECT_URI in your Supabase secrets.
        // Usually: https://<project-ref>.supabase.co/functions/v1/tiktok-oauth-callback
        const redirectUri = Deno.env.get("TIKTOK_REDIRECT_URI");

        if (!clientKey || !redirectUri) {
            throw new Error("TikTok configuration missing (TIKTOK_CLIENT_KEY or TIKTOK_REDIRECT_URI)");
        }

        // TikTok OAuth V2 URL
        // Scopes: user.info.basic, video.upload
        const scopes = ["user.info.basic", "video.upload"].join(",");

        // State: project_id (to link account to project on callback)
        const state = project_id;

        // Construct Auth URL
        const authUrl = `https://www.tiktok.com/v2/auth/authorize/?client_key=${clientKey}&response_type=code&scope=${scopes}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`;

        return new Response(
            JSON.stringify({ auth_url: authUrl }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );

    } catch (error) {
        console.error("Error in tiktok-oauth-start:", error);
        return new Response(
            JSON.stringify({ error: error.message }),
            {
                status: 400,
                headers: { ...corsHeaders, "Content-Type": "application/json" }
            }
        );
    }
});
