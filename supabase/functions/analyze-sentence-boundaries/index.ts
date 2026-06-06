import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Word {
  text: string;
  start: number;
  end: number;
}

interface SentenceBoundary {
  sentenceIndex: number;
  text: string;
  startTime: number;
  endTime: number;
  words: Word[];
}

// Minimum seconds per clip segment - prevents over-fragmentation
const MIN_SEGMENT_DURATION = 3.0;
const MIN_WORDS_PER_SEGMENT = 8;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { transcriptionText, words, clipCount } = await req.json();

    if (!transcriptionText || !words?.length) {
      throw new Error('Missing transcription data');
    }

    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
    if (!OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is not configured');
    }

    // Calculate total duration and optimal segment length
    const totalDuration = words[words.length - 1].end - words[0].start;
    const targetSegmentDuration = totalDuration / clipCount;
    const effectiveClipCount = Math.min(
      clipCount, 
      Math.floor(totalDuration / MIN_SEGMENT_DURATION)
    );

    console.log(`Analyzing: ${words.length} words, ${totalDuration.toFixed(1)}s total`);
    console.log(`Requested clips: ${clipCount}, effective clips: ${effectiveClipCount}`);
    console.log(`Target segment duration: ${targetSegmentDuration.toFixed(1)}s`);

    // If we can only fit fewer clips due to duration constraints, adjust
    const actualClipCount = Math.max(1, effectiveClipCount);
    const boundariesToFind = actualClipCount - 1;

    if (boundariesToFind <= 0) {
      // Only 1 clip needed - no boundaries
      console.log('Single clip needed, no boundaries');
      return new Response(
        JSON.stringify({
          success: true,
          sentences: [{
            sentenceIndex: 0,
            text: transcriptionText,
            startTime: words[0].start,
            endTime: words[words.length - 1].end,
            words: words,
          }],
          boundaryIndices: [],
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Use AI to identify natural sentence/thought boundaries
    const systemPrompt = `You are a video editing assistant that finds clip transition points in speech.

CRITICAL RULES:
1. You must return EXACTLY ${boundariesToFind} boundary points - no more, no less
2. Each segment must contain AT LEAST ${MIN_WORDS_PER_SEGMENT} words
3. Each segment should be roughly ${(totalDuration / actualClipCount).toFixed(0)} seconds long
4. ONLY cut at MAJOR sentence endings - complete thoughts with periods, question marks, or clear pauses
5. DO NOT cut at every period - only at major thought transitions
6. Prefer longer segments over shorter ones
7. Distribute boundaries EVENLY across the transcript - avoid clustering

The transcript has ${words.length} words spanning ${totalDuration.toFixed(1)} seconds.
You need ${boundariesToFind} boundaries to create ${actualClipCount} segments.

Return ONLY: {"boundaryIndices": [array of ${boundariesToFind} word indices]}`;

    const userPrompt = `Transcript: "${transcriptionText}"

Find ${boundariesToFind} MAJOR transition points for ${actualClipCount} video clips.
Each segment should be ~${(words.length / actualClipCount).toFixed(0)} words and ~${(totalDuration / actualClipCount).toFixed(0)}s.

Word count targets for even distribution:
${Array.from({length: boundariesToFind}, (_, i) => 
  `- Boundary ${i + 1}: around word index ${Math.floor((i + 1) * words.length / actualClipCount)}`
).join('\n')}

Return JSON: {"boundaryIndices": [${boundariesToFind} numbers]}`;

    const aiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.1, // Very low temperature for consistent results
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('AI gateway error:', aiResponse.status, errorText);
      
      if (aiResponse.status === 429) {
        throw new Error('Rate limited - please try again in a moment');
      }
      if (aiResponse.status === 402) {
        throw new Error('AI credits exhausted');
      }
      throw new Error(`AI analysis failed: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const aiContent = aiData.choices?.[0]?.message?.content || '';
    console.log('AI sentence boundary response:', aiContent);

    // Parse the AI response
    let boundaryIndices: number[] = [];
    try {
      const jsonMatch = aiContent.match(/\{[\s\S]*"boundaryIndices"[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        boundaryIndices = parsed.boundaryIndices || [];
      }
    } catch (parseError) {
      console.error('Failed to parse AI response, using fallback:', parseError);
    }

    // Validate and fix boundary indices
    boundaryIndices = boundaryIndices
      .filter((idx: number) => typeof idx === 'number' && idx >= MIN_WORDS_PER_SEGMENT - 1 && idx < words.length - MIN_WORDS_PER_SEGMENT)
      .sort((a: number, b: number) => a - b);

    // Remove boundaries that are too close together (less than MIN_WORDS_PER_SEGMENT apart)
    const spacedBoundaries: number[] = [];
    let lastBoundary = -MIN_WORDS_PER_SEGMENT;
    for (const boundary of boundaryIndices) {
      if (boundary - lastBoundary >= MIN_WORDS_PER_SEGMENT) {
        spacedBoundaries.push(boundary);
        lastBoundary = boundary;
      }
    }
    boundaryIndices = spacedBoundaries;

    // Also ensure last segment has enough words
    boundaryIndices = boundaryIndices.filter(idx => words.length - 1 - idx >= MIN_WORDS_PER_SEGMENT);

    console.log(`After validation: ${boundaryIndices.length} boundaries (target: ${boundariesToFind})`);

    // If we don't have the right number of boundaries, calculate fallback
    if (boundaryIndices.length !== boundariesToFind) {
      console.log('Using punctuation-based fallback with minimum segment enforcement');
      boundaryIndices = calculateFallbackBoundaries(words, actualClipCount, MIN_WORDS_PER_SEGMENT);
    }

    console.log(`Final boundary indices: [${boundaryIndices.join(', ')}]`);

    // Convert word indices to timestamps and build sentence boundaries
    const sentences: SentenceBoundary[] = [];
    let startIdx = 0;

    for (let i = 0; i <= boundaryIndices.length; i++) {
      const endIdx = i < boundaryIndices.length ? boundaryIndices[i] : words.length - 1;
      const segmentWords = words.slice(startIdx, endIdx + 1);
      
      if (segmentWords.length > 0) {
        const sentenceText = segmentWords.map((w: Word) => w.text).join(' ');
        const segmentDuration = segmentWords[segmentWords.length - 1].end - segmentWords[0].start;
        
        sentences.push({
          sentenceIndex: i,
          text: sentenceText,
          startTime: segmentWords[0].start,
          endTime: segmentWords[segmentWords.length - 1].end,
          words: segmentWords,
        });
        
        console.log(`  Segment ${i + 1}: ${segmentWords[0].start.toFixed(2)}s - ${segmentWords[segmentWords.length - 1].end.toFixed(2)}s (${segmentDuration.toFixed(1)}s, ${segmentWords.length} words)`);
      }
      
      startIdx = endIdx + 1;
    }

    console.log(`Created ${sentences.length} sentence segments for ${clipCount} clips`);

    return new Response(
      JSON.stringify({
        success: true,
        sentences,
        boundaryIndices,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Sentence boundary analysis error:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error',
        success: false,
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// Fallback: Find boundaries at punctuation marks, with minimum segment size
function calculateFallbackBoundaries(words: Word[], clipCount: number, minWords: number): number[] {
  const targetBoundaries = clipCount - 1;
  
  if (targetBoundaries <= 0) return [];
  
  const punctuationIndices: number[] = [];
  
  // Find all words ending with MAJOR punctuation (periods, question marks)
  words.forEach((word, idx) => {
    // Only consider as boundary if it leaves enough words for next segment
    if (/[.!?]$/.test(word.text.trim()) && idx >= minWords - 1 && words.length - 1 - idx >= minWords) {
      punctuationIndices.push(idx);
    }
  });

  console.log(`Fallback: Found ${punctuationIndices.length} valid punctuation points`);

  if (punctuationIndices.length === 0) {
    // No punctuation found, distribute evenly with minimum enforcement
    const step = Math.floor(words.length / clipCount);
    const boundaries: number[] = [];
    for (let i = 1; i < clipCount; i++) {
      const targetIdx = Math.min(i * step - 1, words.length - 1 - minWords);
      if (targetIdx >= minWords - 1 && (!boundaries.length || targetIdx - boundaries[boundaries.length - 1] >= minWords)) {
        boundaries.push(targetIdx);
      }
    }
    return boundaries;
  }

  // Select best punctuation points distributed across the transcript
  const result: number[] = [];
  const sectionSize = words.length / clipCount;
  
  for (let i = 1; i < clipCount && result.length < targetBoundaries; i++) {
    const targetIdx = Math.floor(i * sectionSize);
    
    // Find closest punctuation point to target that maintains minimum spacing
    let bestPunct = -1;
    let bestDist = Infinity;
    
    for (const punctIdx of punctuationIndices) {
      const dist = Math.abs(punctIdx - targetIdx);
      const lastBoundary = result.length > 0 ? result[result.length - 1] : -minWords;
      
      // Ensure minimum spacing from last boundary
      if (dist < bestDist && !result.includes(punctIdx) && punctIdx - lastBoundary >= minWords) {
        bestDist = dist;
        bestPunct = punctIdx;
      }
    }
    
    if (bestPunct >= 0) {
      result.push(bestPunct);
    }
  }

  return result.sort((a, b) => a - b);
}
