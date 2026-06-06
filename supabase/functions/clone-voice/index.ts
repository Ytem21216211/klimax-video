import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const { name, description, file_url } = await req.json();

        // Genral validation
        if (!name || !file_url) {
            throw new Error('Missing name or file_url');
        }

        // Auth check
        const authHeader = req.headers.get('authorization');
        if (!authHeader) throw new Error('Missing authorization header');

        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseKey);

        // Get user from auth header
        const supabaseUser = createClient(supabaseUrl, Deno.env.get('SUPABASE_PUBLISHABLE_KEY')!, {
            global: { headers: { Authorization: authHeader } }
        });
        const { data: { user }, error: userError } = await supabaseUser.auth.getUser();

        if (userError || !user) throw new Error('Authentication required');

        const ELEVENLABS_API_KEY = Deno.env.get('ELEVENLABS_API_KEY');
        if (!ELEVENLABS_API_KEY) throw new Error('ElevenLabs API key not configured');

        console.log(`Cloning voice: ${name} from ${file_url}`);

        // Download the audio file
        const audioResponse = await fetch(file_url);
        if (!audioResponse.ok) {
            throw new Error(`Failed to download audio file: ${audioResponse.status}`);
        }
        const audioBlob = await audioResponse.blob();

        // Prepare FormData for ElevenLabs
        const formData = new FormData();
        formData.append('name', name);
        formData.append('description', description || 'Cloned voice');
        formData.append('files', audioBlob, 'sample.mp3');
        // formData.append('labels', JSON.stringify({ "accent": "American" })); // Optional

        // Call ElevenLabs to Add Voice
        const response = await fetch('https://api.elevenlabs.io/v1/voices/add', {
            method: 'POST',
            headers: {
                'xi-api-key': ELEVENLABS_API_KEY,
            },
            body: formData,
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('ElevenLabs API error:', response.status, errorText);
            throw new Error(`Failed to clone voice: ${errorText}`);
        }

        const data = await response.json();
        const voiceId = data.voice_id;

        console.log(`Voice cloned with ID: ${voiceId}`);

        // Insert into Supabase voices table
        const { data: voiceRecord, error: dbError } = await supabase
            .from('voices')
            .insert({
                user_id: user.id,
                elevenlabs_voice_id: voiceId,
                name: name,
                category: 'cloned',
                description: description || 'Instant Voice Clone',
                preview_url: file_url // Reuse the uploaded file as preview
            })
            .select()
            .single();

        if (dbError) {
            console.error('Database error:', dbError);
            throw dbError;
        }

        return new Response(JSON.stringify({ success: true, voice: voiceRecord }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });

    } catch (error) {
        console.error('Error cloning voice:', error);
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
});
