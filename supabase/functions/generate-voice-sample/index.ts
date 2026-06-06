import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Expose-Headers': 'X-Generated-Voice-Id',
};

console.log("Function script loaded. Version: std-serve-revert");

serve(async (req) => {
    // Check if the request is an OPTIONS request (for CORS)
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    // Explicitly handle Authorization if needed, or just log for debugging
    const authHeader = req.headers.get('Authorization');
    console.log(`[Request] Method: ${req.method}, Auth: ${authHeader ? 'Present' : 'Missing'}`);
    console.log("Request received. Auth header present:", !!authHeader);

    try {
        const { gender, age, accent, accent_strength, text, description } = await req.json();
        const ELEVENLABS_API_KEY = Deno.env.get('ELEVENLABS_API_KEY');

        if (!ELEVENLABS_API_KEY) {
            throw new Error('ElevenLabs API key not configured');
        }

        // Default text if none provided
        const previewText = text || "This is a preview of the voice you are designing. I hope you like it.";

        // Construct voice description from parameters if explicit description is missing
        let voiceDescription = description;
        if (!voiceDescription || voiceDescription.trim().length === 0) {
            // Map simple values to more descriptive prompts
            const ageMap: Record<string, string> = {
                'young': 'young',
                'middle_aged': 'middle-aged',
                'old': 'elderly'
            };
            const genderMap: Record<string, string> = {
                'male': 'male',
                'female': 'female'
            };

            const ageTerm = ageMap[age] || age || 'middle-aged';
            const genderTerm = genderMap[gender] || gender || 'male';
            const accentTerm = accent ? `${accent} accent` : 'neutral accent';

            voiceDescription = `A ${ageTerm} ${genderTerm} voice with a strong ${accentTerm}.`;

            if (accent_strength) {
                // ElevenLabs prompt understands intensity/strength descriptors too
                if (accent_strength > 1.5) voiceDescription += " Very distinct and strong accent.";
                else if (accent_strength < 0.5) voiceDescription += " Subtle accent.";
            }
        }

        console.log(`Generating voice preview with description: "${voiceDescription}"`);

        // Use Voice Design API (create-previews)
        // https://elevenlabs.io/docs/api-reference/text-to-voice/create-previews
        const response = await fetch('https://api.elevenlabs.io/v1/text-to-voice/create-previews', {
            method: 'POST',
            headers: {
                'xi-api-key': ELEVENLABS_API_KEY,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                voice_description: voiceDescription,
                text: previewText,
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('ElevenLabs API error:', response.status, errorText);
            throw new Error(`Failed to generate voice preview: ${errorText}`);
        }

        const data = await response.json();

        // The API returns { previews: [{ audio_base_64: "...", generated_voice_id: "..." }] }
        if (!data.previews || data.previews.length === 0 || !data.previews[0].audio_base_64) {
            console.error('Unexpected API response:', data);
            throw new Error('No audio preview returned from ElevenLabs');
        }

        const audioBase64 = data.previews[0].audio_base_64;
        const generatedVoiceId = data.previews[0].generated_voice_id;

        console.log(`Generated preview for voice ID: ${generatedVoiceId}`);


        // Return JSON with base64 audio and ID to avoid header parsing issues on client
        return new Response(JSON.stringify({
            voiceId: generatedVoiceId,
            audioBase64: audioBase64
        }), {
            headers: {
                ...corsHeaders,
                'Content-Type': 'application/json',
            },
        });


    } catch (error: any) {
        console.error('Error generating voice sample:', error);
        return new Response(JSON.stringify({
            error: error.message,
            details: error.toString()
        }), {
            status: 500, // Ensure this isn't returning 401 accidentally
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
});
