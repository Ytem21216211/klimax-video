import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ============================================================================
// Feature Extraction Engine
// Extracts visual + linguistic features from RenderSpec for cognitive analysis
// ============================================================================

// Subtitle style → intensity score mapping (1 = calm, 5 = extreme)
const STYLE_INTENSITY: Record<string, number> = {
    // Calm (1)
    'static': 1, 'float': 1, 'drift': 1, 'fade': 1,
    // Mild (2)
    'slide-up': 2, 'slide-down': 2, 'reveal': 2, 'typewriter': 2, 'karaoke': 2,
    'spotlight': 2, 'blur-in': 2, 'cinematic': 2,
    // Moderate (3)
    'pop': 3, 'elastic': 3, 'fly-in': 3, 'highlight': 3, 'wave': 3,
    'zoom': 3, 'glow': 3, 'morph': 3, 'pulse-grow': 3, 'ripple': 3,
    'drop': 3, 'swing': 3,
    // Intense (4)
    'bounce': 4, 'punch': 4, 'slam': 4, 'wobble': 4, 'flip': 4,
    'spin-in': 4, 'scale-rotate': 4, 'stomp': 4, 'jitter': 4,
    'rubberband': 4, 'heartbeat': 4, 'jump': 4,
    // Extreme (5)
    'smash': 5, 'crash': 5, 'spark': 5, 'glitch': 5, 'flash': 5,
    'explode': 5,
};

// Syllable counting (English approximation)
function countSyllables(word: string): number {
    const w = word.toLowerCase().replace(/[^a-z]/g, '');
    if (w.length <= 2) return 1;

    let count = 0;
    const vowels = 'aeiouy';
    let prevVowel = false;

    for (let i = 0; i < w.length; i++) {
        const isVowel = vowels.includes(w[i]);
        if (isVowel && !prevVowel) count++;
        prevVowel = isVowel;
    }

    // Handle silent 'e'
    if (w.endsWith('e') && count > 1) count--;
    // Handle '-le' endings
    if (w.endsWith('le') && w.length > 2 && !vowels.includes(w[w.length - 3])) count++;

    return Math.max(count, 1);
}

interface RenderSpec {
    clips: Array<{ url: string; start: number; duration: number; transition?: { type: string; duration: number } }>;
    audio?: {
        voiceover?: { url: string; volume: number };
        sfx?: Array<{ url: string; time: number; volume: number }>;
    };
    subtitles?: {
        style: string;
        settings: Record<string, any>;
        chunks: Array<{ text: string; start: number; end: number; words?: Array<{ text: string; start: number; end: number }> }>;
    };
    endScreen?: { enabled: boolean };
    beginningEffect?: { enabled: boolean };
    ipPopup?: { enabled: boolean };
}

interface ExtractedFeatures {
    // Visual
    clip_count: number;
    avg_clip_duration: number;
    total_duration: number;
    cut_frequency: number;
    zoom_frequency: number;
    transition_diversity: number;
    sfx_density: number;
    subtitle_style_intensity: number;
    has_beginning_effect: boolean;
    has_end_screen: boolean;
    has_ip_popup: boolean;
    // Linguistic
    subtitle_words_per_second: number;
    subtitle_avg_chunk_length: number;
    word_complexity_score: number;
    syllables_per_second: number;
    total_word_count: number;
    total_syllable_count: number;
}

function extractFeatures(spec: RenderSpec): ExtractedFeatures {
    const clips = spec.clips || [];
    const subtitles = spec.subtitles;
    const sfxList = spec.audio?.sfx || [];

    // --- Visual Features ---
    const clipCount = clips.length;
    const totalDuration = clips.reduce((sum, c) => sum + (c.duration || 0), 0);
    const safeDuration = Math.max(totalDuration, 0.1);
    const avgClipDuration = clipCount > 0 ? totalDuration / clipCount : 0;
    const cutFrequency = clipCount / safeDuration;

    // Zoom transitions
    const transitions = clips
        .map(c => c.transition?.type)
        .filter(Boolean) as string[];
    const zoomTransitions = transitions.filter(t => t.includes('zoom')).length;
    const zoomFrequency = zoomTransitions / safeDuration;

    // Transition diversity
    const uniqueTransitions = new Set(transitions);
    const transitionDiversity = transitions.length > 0
        ? uniqueTransitions.size / transitions.length
        : 0;

    // SFX density
    const sfxDensity = sfxList.length / safeDuration;

    // Subtitle style intensity
    const styleIntensity = subtitles
        ? (STYLE_INTENSITY[subtitles.style] || 3)
        : 1;

    // --- Linguistic Features ---
    const chunks = subtitles?.chunks || [];
    let totalWords = 0;
    let totalSyllables = 0;
    const chunkWordCounts: number[] = [];

    for (const chunk of chunks) {
        const words = chunk.text.split(/\s+/).filter(w => w.length > 0);
        totalWords += words.length;
        chunkWordCounts.push(words.length);
        for (const word of words) {
            totalSyllables += countSyllables(word);
        }
    }

    // Subtitle text time span (from first chunk start to last chunk end)
    const subtitleSpan = chunks.length > 0
        ? Math.max(chunks[chunks.length - 1].end - chunks[0].start, 0.1)
        : safeDuration;

    const wordsPerSecond = totalWords / subtitleSpan;
    const avgChunkLength = chunkWordCounts.length > 0
        ? chunkWordCounts.reduce((a, b) => a + b, 0) / chunkWordCounts.length
        : 0;
    const wordComplexity = totalWords > 0 ? totalSyllables / totalWords : 1;
    const syllablesPerSecond = totalSyllables / subtitleSpan;

    return {
        clip_count: clipCount,
        avg_clip_duration: parseFloat(avgClipDuration.toFixed(3)),
        total_duration: parseFloat(totalDuration.toFixed(3)),
        cut_frequency: parseFloat(cutFrequency.toFixed(4)),
        zoom_frequency: parseFloat(zoomFrequency.toFixed(4)),
        transition_diversity: parseFloat(transitionDiversity.toFixed(3)),
        sfx_density: parseFloat(sfxDensity.toFixed(4)),
        subtitle_style_intensity: styleIntensity,
        has_beginning_effect: !!spec.beginningEffect?.enabled,
        has_end_screen: !!spec.endScreen?.enabled,
        has_ip_popup: !!spec.ipPopup?.enabled,
        subtitle_words_per_second: parseFloat(wordsPerSecond.toFixed(3)),
        subtitle_avg_chunk_length: parseFloat(avgChunkLength.toFixed(2)),
        word_complexity_score: parseFloat(wordComplexity.toFixed(3)),
        syllables_per_second: parseFloat(syllablesPerSecond.toFixed(3)),
        total_word_count: totalWords,
        total_syllable_count: totalSyllables,
    };
}

// ============================================================================
// Main handler
// ============================================================================
Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const {
            video_performance_id,
            render_spec,
            user_id,
            project_id,
        } = await req.json();

        if (!render_spec) {
            return new Response(JSON.stringify({ error: 'render_spec is required' }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        const supabase = createClient(
            Deno.env.get('SUPABASE_URL')!,
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
        );

        console.log('[extract-cognitive-features] Extracting features...');

        // Extract features from render spec
        const features = extractFeatures(render_spec as RenderSpec);

        console.log('[extract-cognitive-features] Features:', JSON.stringify(features, null, 2));

        // Upsert into video_cognitive_features
        const record = {
            video_performance_id: video_performance_id || null,
            user_id: user_id || null,
            project_id: project_id || null,
            ...features,
            render_spec_snapshot: render_spec,
            updated_at: new Date().toISOString(),
        };

        let result;
        if (video_performance_id) {
            // Upsert by video_performance_id
            const { data, error } = await supabase
                .from('video_cognitive_features')
                .upsert(record, { onConflict: 'video_performance_id' })
                .select()
                .single();

            if (error) throw error;
            result = data;
        } else {
            // Insert without video_performance_id (e.g., pre-post scoring)
            const { data, error } = await supabase
                .from('video_cognitive_features')
                .insert(record)
                .select()
                .single();

            if (error) throw error;
            result = data;
        }

        console.log(`[extract-cognitive-features] Stored features: ${result.id}`);

        return new Response(JSON.stringify({
            success: true,
            feature_id: result.id,
            features,
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });

    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error('[extract-cognitive-features] Error:', error);
        return new Response(JSON.stringify({ error: message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
});
