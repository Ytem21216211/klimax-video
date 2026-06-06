import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

console.log("Function script loaded. Version: save-voice-v2-robust");

serve(async (req) => {
    // 1. Handle CORS
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        console.log(`[Request] Method: ${req.method}`);

        // 2. Validate Environment Variables
        const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
        const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
        const ELEVENLABS_API_KEY = Deno.env.get('ELEVENLABS_API_KEY');

        if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !ELEVENLABS_API_KEY) {
            console.error("Missing Environment Variables: ", {
                hasUrl: !!SUPABASE_URL,
                hasServiceKey: !!SUPABASE_SERVICE_ROLE_KEY,
                hasElevenKey: !!ELEVENLABS_API_KEY
            });
            throw new Error("Server configuration error: Missing API Keys.");
        }

        // 3. Initiate Supabase Admin Client
        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

        // 4. Parse Request Body
        let body;
        try {
            body = await req.json();
        } catch (e) {
            throw new Error("Invalid JSON body");
        }

        const { name, description, gender, age, accent, accent_strength, preview_text, generated_voice_id } = body;

        // 5. Auth Check (Manually verify JWT if needed, or trust the user ID passed if we trust the client - better to verify)
        const authHeader = req.headers.get('Authorization');
        if (!authHeader) {
            throw new Error('Missing Authorization header');
        }

        // Create a client with the user's token to get their ID safely
        // Use SUPABASE_ANON_KEY as it is standard in Edge Functions (alias for public key)
        const publicAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_PUBLISHABLE_KEY') || '';
        const supabaseUserClient = createClient(SUPABASE_URL, publicAnonKey, {
            global: { headers: { Authorization: authHeader } }
        });
        const { data: { user }, error: userError } = await supabaseUserClient.auth.getUser();

        if (userError || !user) {
            console.error("Auth failed:", userError);
            throw new Error("Authentication failed: Invalid Token");
        }

        console.log(`User authenticated: ${user.id}`);

        // 6. Ensure Profile Exists (Fixing Foreign Key 500 Error)
        // We use the ADMIN client (supabase) to bypass RLS for this check/insert if needed, 
        // but strictly speaking, we are just ensuring data integrity.
        const { data: profile } = await supabase
            .from('profiles')
            .select('id')
            .eq('id', user.id)
            .single();

        if (!profile) {
            console.warn(`Profile missing for ${user.id}. Auto-creating...`);
            const { error: createProfileError } = await supabase
                .from('profiles')
                .insert({
                    id: user.id,
                    username: user.email?.split('@')[0] || 'user_' + user.id.slice(0, 8),
                });

            if (createProfileError) {
                console.error("Failed to create profile:", createProfileError);
                // We don't throw here, we try to proceed, maybe the race condition fixed it
            }
        }

        // 7. Call ElevenLabs API
        let voiceId = generated_voice_id;
        let elevenLabsResponse = null;

        // If we already have a generated_voice_id from preview, we verify or finalize it
        // BUT the endpoint `create-voice-from-preview` is what we used.
        // Actually, looking at docs: 
        // - `create-previews` returns `generated_voice_id`.
        // - To save it, we call `create-voice-from-preview` which RETURNS the final `voice_id`.
        // The user's code was doing this correctly.

        console.log(`Processing voice: ${name} (ID: ${generated_voice_id || 'NEW'})`);

        if (generated_voice_id) {
            // Check if this ID already exists in our DB? No, ElevenLabs IDs are unique.

            const resp = await fetch('https://api.elevenlabs.io/v1/text-to-voice/create-voice-from-preview', {
                method: 'POST',
                headers: {
                    'xi-api-key': ELEVENLABS_API_KEY,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    voice_name: name,
                    voice_description: description || `Generated voice (${gender}, ${age})`,
                    generated_voice_id: generated_voice_id,
                }),
            });

            if (!resp.ok) {
                const errText = await resp.text();
                console.error("ElevenLabs Create From Preview Error:", errText);
                throw new Error(`ElevenLabs API Error: ${errText}`);
            }
            elevenLabsResponse = await resp.json();

        } else {
            // Create fresh
            const resp = await fetch('https://api.elevenlabs.io/v1/voice-generation/create-voice', {
                method: 'POST',
                headers: {
                    'xi-api-key': ELEVENLABS_API_KEY,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    voice_name: name,
                    voice_description: description || `Generated voice`,
                    generated_voice_params: {
                        gender, age, accent,
                        accent_strength: Number(accent_strength || 1),
                        text: preview_text || "Hello."
                    }
                }),
            });

            if (!resp.ok) {
                const errText = await resp.text();
                console.error("ElevenLabs Create Fresh Error:", errText);
                throw new Error(`ElevenLabs API Error: ${errText}`);
            }
            elevenLabsResponse = await resp.json();
        }

        voiceId = elevenLabsResponse.voice_id;
        if (!voiceId) {
            console.error("No voice_id in response:", elevenLabsResponse);
            throw new Error("ElevenLabs did not return a voice_id");
        }

        console.log(`ElevenLabs Voice Created: ${voiceId}`);

        // 8. Save to Database (UPSERT to handle duplicates)
        // using upsert on (user_id, elevenlabs_voice_id) if unique constraint exists
        // OR just checking if it exists.
        // The migration `UNIQUE(user_id, elevenlabs_voice_id)` exists.

        const { data: savedVoice, error: saveError } = await supabase
            .from('voices')
            .upsert({
                user_id: user.id,
                elevenlabs_voice_id: voiceId,
                name: name,
                category: 'generated',
                description: description || 'Custom Voice',
                // preview_url: ... (if available)
            }, {
                onConflict: 'user_id,elevenlabs_voice_id'
            })
            .select()
            .single();

        if (saveError) {
            console.error("Database Save Error:", saveError);
            throw new Error(`Database Error: ${saveError.message}`);
        }

        console.log("Voice saved to DB:", savedVoice.id);

        return new Response(JSON.stringify({ success: true, voice: savedVoice }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200
        });

    } catch (error: any) {
        console.error("Fatal Function Error:", error);
        return new Response(JSON.stringify({
            error: error.message || "Internal Server Error",
            details: error.toString()
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400, // Return 400 so client sees the JSON error, not a generic 500
        });
    }
});
