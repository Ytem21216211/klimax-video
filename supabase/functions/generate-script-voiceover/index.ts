import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ScriptGenerationRequest {
  projectId: string;
  description?: string;
  gamemodeId?: string;
  targetLengthSeconds?: number;
  // A/B Testing parameters
  hookVariations?: number; // 2-3 variations
  hookStyles?: string[]; // Optional: specific styles to test
  testName?: string; // Name for the A/B test
  voiceId?: string; // UUID from our voices table
  injectedAngle?: string; // Specific angle to force for Lab Video generation
}

interface HookVariation {
  hook_style: string;
  hook_text: string;
  full_script: string;
}

const HOOK_STYLES = {
  question: "Opens with a direct question to the viewer that creates curiosity",
  bold_claim: "Makes a strong, confident statement about the server or experience",
  mystery: "Creates intrigue with a cliffhanger or mysterious statement",
  challenge: "Dares the viewer to try something or presents a challenge",
  action: "Jumps straight into describing an exciting action or moment",
};

async function generateHookVariation(
  OPENAI_API_KEY: string,
  hookStyle: string,
  serverName: string,
  baseScript: string,
  gamemodeInfo: string
): Promise<{ hook_text: string; full_script: string }> {
  const hookInstruction = `Generate a ${hookStyle.toUpperCase()} hook for this Minecraft server video. 
${HOOK_STYLES[hookStyle as keyof typeof HOOK_STYLES]}

Server: ${serverName}
${gamemodeInfo}

The hook should be 1-2 sentences that immediately grab attention. Then seamlessly transition into the following script content:

${baseScript}

Return the complete script with your new hook at the beginning.`;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: 'Return ONLY the exact words a narrator would speak. No meta commentary, no brackets, no labels. Use the generate_hook_script tool.'
        },
        { role: 'user', content: hookInstruction },
      ],
      tools: [
        {
          type: 'function',
          function: {
            name: 'generate_hook_script',
            description: 'Return the hook text and full script for TTS.',
            parameters: {
              type: 'object',
              properties: {
                hook_text: {
                  type: 'string',
                  description: 'Just the hook sentence(s) - the opening 1-2 sentences.',
                },
                full_script: {
                  type: 'string',
                  description: 'The complete script including the hook and body.',
                },
              },
              required: ['hook_text', 'full_script'],
              additionalProperties: false,
            },
          },
        },
      ],
      tool_choice: { type: 'function', function: { name: 'generate_hook_script' } },
      temperature: 0.95, // Higher temperature for more variety
    }),
  });

  if (!response.ok) {
    throw new Error(`Hook generation failed: ${await response.text()}`);
  }

  const data = await response.json();
  const toolCall = data?.choices?.[0]?.message?.tool_calls?.[0];

  if (!toolCall || toolCall.function?.name !== 'generate_hook_script') {
    throw new Error('AI did not return structured hook');
  }

  const parsed = JSON.parse(toolCall.function.arguments);
  return {
    hook_text: parsed.hook_text.replace(/[\[\](){}]/g, '').trim(),
    full_script: parsed.full_script.replace(/[\[\](){}]/g, '').trim(),
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const {
      projectId,
      description,
      gamemodeId,
      targetLengthSeconds = 30,
      hookVariations,
      hookStyles,
      testName,
      voiceId: requestedVoiceId,
      injectedAngle,
    }: ScriptGenerationRequest = await req.json();

    const clampedLength = Math.max(15, Math.min(60, targetLengthSeconds));
    const minWords = Math.round(clampedLength * 2.5);
    const maxWords = Math.round(clampedLength * 3);

    console.log(`Generating script for project: ${projectId}, target: ${clampedLength}s (${minWords}-${maxWords} words)`);
    if (hookVariations) {
      console.log(`A/B Testing enabled: ${hookVariations} variations`);
    }

    const authHeader = req.headers.get('authorization');
    if (!authHeader) throw new Error('Missing authorization header');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const supabaseUser = createClient(supabaseUrl, Deno.env.get('SUPABASE_PUBLISHABLE_KEY')!, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !user) throw new Error('Authentication required');

    let gamemodeInfo = "";
    let brainContext = "";

    if (gamemodeId) {
      const { data: gamemode } = await supabase
        .from('gamemodes')
        .select('name, description, brain')
        .eq('id', gamemodeId)
        .single();

      if (gamemode) {
        gamemodeInfo = `\n\nGamemode: ${gamemode.name}\nGamemode Description: ${gamemode.description}`;

        // Build brain context for AI
        const brain = gamemode.brain as any;
        if (brain && (brain.what_works?.length > 0 || brain.avoid?.length > 0)) {
          const whatWorks = brain.what_works?.slice(0, 5).map((w: any) =>
            `- ${w.insight} (${w.confidence}% confidence)`
          ).join('\n') || 'None yet';

          const whatToAvoid = brain.avoid?.slice(0, 5).map((a: any) =>
            `- ${a.pattern}: ${a.reason}`
          ).join('\n') || 'None yet';

          brainContext = `
HISTORICAL INSIGHTS FOR THIS AUDIENCE (Use these to craft better content):
${brain.summary || 'Learning in progress...'}

WHAT WORKS FOR THIS GAMEMODE:
${whatWorks}

WHAT TO AVOID:
${whatToAvoid}

CURRENT HYPOTHESIS: ${brain.current_hypothesis || 'None - experimenting with different approaches'}
`;
          console.log('Brain context injected into prompt');
        }
      }
    }

    let trainingExamples = "";

    if (gamemodeId) {
      // Fetch hand-picked neural examples first (HIGHEST PRIORITY)
      const { data: neuralExamples } = await supabase
        .from('training_examples')
        .select('content, type, title')
        .eq('gamemode_id', gamemodeId)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(15);

      if (neuralExamples && neuralExamples.length > 0) {
        const scripts = neuralExamples.filter(e => e.type === 'script');
        const hooks = neuralExamples.filter(e => e.type === 'hook');
        
        if (scripts.length > 0) {
          trainingExamples += `\n\n=== HAND-PICKED SUCCESSFUL SCRIPTS (STUDY THESE PATTERNS) ===\n${scripts.map((s, i) => `Example ${i + 1} [${s.title}]:\n${s.content}`).join('\n\n')}`;
        }
        if (hooks.length > 0) {
          trainingExamples += `\n\n=== HIGH-RETENTION HOOKS (USE AS INSPIRATION) ===\n${hooks.map((h, i) => `- "${h.content}" (${h.title})`).join('\n')}`;
        }
      }

      // Fetch transcribed scripts (LOWER PRIORITY)
      const { data: scripts } = await supabase
        .from('training_scripts')
        .select('transcript')
        .eq('gamemode_id', gamemodeId)
        .eq('user_id', user.id)
        .limit(5);

      if (scripts && scripts.length > 0) {
        trainingExamples += `\n\n=== ADDITIONAL STYLE REFERENCES ===\n${scripts.map((s, i) => `Reference ${i + 1}:\n${s.transcript}`).join('\n\n')}`;
      }
    }

    const { data: generalScripts } = await supabase
      .from('training_scripts')
      .select('transcript')
      .is('gamemode_id', null)
      .eq('user_id', user.id)
      .limit(3);

    if (generalScripts && generalScripts.length > 0) {
      const generalExamples = generalScripts.map((s, i) => `General Example ${i + 1}:\n${s.transcript}`).join('\n\n');
      trainingExamples += `\n\nHere are general style examples that work for any gamemode:\n${generalExamples}`;
    }

    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
    if (!OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is not configured');
    }

    const { data: project, error: authProjectError } = await supabase
      .from('projects')
      .select('title, user_id')
      .eq('id', projectId)
      .single();

    if (authProjectError || !project) {
      throw new Error('Project not found');
    }

    if (project.user_id !== user.id) {
      const { data: membership } = await supabase
        .from('project_members')
        .select('role')
        .eq('project_id', projectId)
        .eq('user_id', user.id)
        .single();

      if (!membership) {
        throw new Error('Unauthorized to access or modify this project');
      }
    }

    const serverName = project.title || 'Minecraft server';

    // For A/B testing, first generate the base script (body without hook)
    const isABTest = hookVariations && hookVariations >= 2 && hookVariations <= 3;

    // Anti-repetition logic: random hooks so it doesn't get stuck on one phrase
    const possibleHooks = [
      "Ever wanted to dominate in PvP?",
      "This is how you become unstoppable.",
      "Most players don't know this trick...",
      "Stop playing Minecraft wrong.",
      "I found the craziest server ever.",
      "If you're not playing here, you're missing out.",
      "This might be the best server I've ever seen.",
      "Watch this right now if you want to win.",
      "This is actually insane.",
    ];

    // Pick 3 random examples
    const randomHooks = possibleHooks
      .sort(() => 0.5 - Math.random())
      .slice(0, 3)
      .map((h) => `- "${h}"`)
      .join('\n');

    const hookVarietyInstruction = isABTest
      ? `Generate the BODY of the script only (no opening hook). Start from the second sentence. The hook will be generated separately for A/B testing.`
      : injectedAngle
        ? `CRITICAL: You MUST base the entire script around this specific angle/hook idea: "${injectedAngle}". \nMake it the core focus of the opening and the video.`
        : `CRITICAL: Do NOT start with "[Server Name] is a Minecraft server" or similar introductory phrases. Instead, start with an attention-grabbing hook like a question, bold claim, challenge, or action statement.

DO NOT USE: "You won't believe what happens on..." (This is overused and forbidden).

Examples of good hooks (pick a style like these, but be creative):
${randomHooks}

Jump straight into the action - no introductions.`;

    const aiPrompt = `Server Name: ${serverName}\n\n${description || 'A Minecraft server'}${gamemodeInfo ? `\n${gamemodeInfo}` : ''}\n\nTarget length: ${clampedLength} seconds (${minWords}-${maxWords} words)\n\n${hookVarietyInstruction}\n\nIMPORTANT: Use "${serverName}" as the server name in the script, not any other name.`;

    console.log("Calling fine-tuned model for script generation (spoken-only)...");

    // Inject brain context into system prompt if available
    const systemBase = `You are an expert Minecraft video script writer. 
    
    === NEURAL OBLIGATION ===
    The user has provided hand-picked "Neural Brain" examples (scripts and hooks) that are proven to work. 
    You are OBLIGATED to study these patterns carefully. Look at the pacing, the vocabulary, the way the hook is structured, and the emotional arc. 
    Do NOT copy them word-for-word, but you MUST inspire your new script from these specific high-performance structures.
    
    ${trainingExamples}
    
    ${brainContext}
    
    Return ONLY the exact words a narrator would speak. No meta commentary, no mentions of prompts/system/tools, no stage directions, no brackets, no labels. Use the generate_spoken_script tool.`;

    // ============ INTELLIGENCE LAYER ============
    console.log("Fetching latest strategy insignts...");

    let strategyContext = ""; // Declare strategyContext here

    try {
      // 1. Fetch latest insights from DB
      const { data: insights, error: insightsError } = await supabase
        .from('insights')
        .select('*')
        .eq('niche', 'minecraft') // Hardcoded for MVP
        .order('created_at', { ascending: false })
        .limit(10); // Get a few latest to filter in memory

      if (insightsError) {
        console.error("Error fetching insights (skipping intelligence layer):", insightsError);
      } else {
        // 2. Resolve Strategy
        const winningArchetype = insights?.find((i: any) => i.insight_type === 'winning_archetype')?.payload;
        const competitorGap = insights?.find((i: any) => i.insight_type === 'competitor_gap')?.payload;
        const velocityTarget = insights?.find((i: any) => i.insight_type === 'velocity_target')?.payload;

        if (winningArchetype) {
          strategyContext += `\nWINNING PATTERN: Validated high-performance structure is '${winningArchetype.archetype}' style (${winningArchetype.visual_style}).\n`;
        }

        if (competitorGap && competitorGap.losing_gamemode === (gamemodeInfo ? gamemodeInfo.split(':')[1]?.trim() : '')) {
          strategyContext += `\nCOMPETITIVE ALERT: Competitors are beating us in this gamemode by ${Math.round(competitorGap.gap)} points. purely due to '${competitorGap.losing_gamemode}' execution.\n`;
        }

        if (velocityTarget) {
          strategyContext += `\nVELOCITY TARGET: Aim for high-retention hook to hit ${velocityTarget.target_views_2h} views in 2 hours.\n`;
        }
      }
    } catch (err) {
      console.error("Unexpected error in Intelligence Layer:", err);
    }

    // 3. Inject into System Prompt
    const intelligenceSystemPrompt = `
    ${systemBase}
    
    === STRATEGIC INTELLIGENCE (MUST FOLLOW) ===
    ${strategyContext || "No specific market insights available. Use standard best practices."}
    
    You are an adaptive AI. Use the above insights to tailor the script structure, tone, and pacing.
    `;

    // console.log("Intelligence Prompt Injected:", intelligenceSystemPrompt);

    const systemPromptFinal = intelligenceSystemPrompt;



    let script = '';

    const aiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: systemPromptFinal },
          { role: 'user', content: aiPrompt },
        ],
        tools: [
          {
            type: 'function',
            function: {
              name: 'generate_spoken_script',
              description:
                'Return ONLY spoken narrator words for TTS. No music cues, no sound effects, no brackets, no annotations, no meta.',
              parameters: {
                type: 'object',
                properties: {
                  spoken_text: {
                    type: 'string',
                    description: 'The exact words the narrator will speak. Pure dialogue only.',
                  },
                },
                required: ['spoken_text'],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: 'function', function: { name: 'generate_spoken_script' } },
        temperature: 0.9,
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('AI API error:', aiResponse.status, errorText);
      throw new Error('AI script generation failed');
    }

    const aiData = await aiResponse.json();
    const toolCall = aiData?.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall || toolCall.function?.name !== 'generate_spoken_script') {
      console.error('AI did not use the required tool:', aiData);
      throw new Error('AI did not return structured script');
    }

    try {
      const parsedArgs = JSON.parse(toolCall.function.arguments);
      script = String(parsedArgs?.spoken_text ?? '').trim();
    } catch (e) {
      console.error('Failed to parse tool arguments:', toolCall.function.arguments);
      throw new Error('Failed to parse structured script');
    }

    script = script.replace(/[\[\](){}]/g, '').trim();

    if (!script) {
      throw new Error('Script generation returned empty result.');
    }



    console.log('Base script:', script);

    // ============ A/B TESTING FLOW ============
    if (isABTest) {
      console.log(`Starting A/B test with ${hookVariations} variations...`);

      // Determine which hook styles to test
      const availableStyles = Object.keys(HOOK_STYLES);
      let stylesToTest: string[];

      if (hookStyles && hookStyles.length >= hookVariations) {
        stylesToTest = hookStyles.slice(0, hookVariations);
      } else {
        // Randomly select styles
        const shuffled = [...availableStyles].sort(() => Math.random() - 0.5);
        stylesToTest = shuffled.slice(0, hookVariations);
      }

      console.log(`Testing hook styles: ${stylesToTest.join(', ')}`);

      // Create A/B test record
      const { data: abTest, error: abTestError } = await supabase
        .from('hook_ab_tests')
        .insert({
          user_id: user.id,
          project_id: projectId,
          gamemode_id: gamemodeId || null,
          test_name: testName || `Hook Test ${new Date().toLocaleDateString()}`,
          base_script: script,
          status: 'running',
        })
        .select()
        .single();

      if (abTestError) throw abTestError;

      console.log(`Created A/B test: ${abTest.id}`);

      // Generate each hook variation
      const variations: HookVariation[] = [];

      for (const style of stylesToTest) {
        try {
          console.log(`Generating ${style} hook...`);
          const hookResult = await generateHookVariation(
            OPENAI_API_KEY,
            style,
            serverName,
            script,
            gamemodeInfo
          );

          variations.push({
            hook_style: style,
            hook_text: hookResult.hook_text,
            full_script: hookResult.full_script,
          });

          console.log(`✓ ${style} hook: "${hookResult.hook_text.substring(0, 50)}..."`);
        } catch (e) {
          console.error(`Failed to generate ${style} hook:`, e);
        }
      }

      if (variations.length < 2) {
        throw new Error('Failed to generate enough hook variations');
      }

      // Store variations in database
      const variationRecords = [];
      for (const variation of variations) {
        const { data: variationRecord, error: varError } = await supabase
          .from('hook_variations')
          .insert({
            test_id: abTest.id,
            project_id: projectId,
            hook_style: variation.hook_style,
            hook_text: variation.hook_text,
            full_script: variation.full_script,
            status: 'pending',
          })
          .select()
          .single();

        if (varError) {
          console.error('Failed to save variation:', varError);
        } else {
          variationRecords.push(variationRecord);
        }
      }

      return new Response(
        JSON.stringify({
          success: true,
          ab_test: true,
          test_id: abTest.id,
          variations: variationRecords,
          base_script: script,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ============ STANDARD FLOW (single script) ============
    console.log('Final script:', script);

    console.log("Generating voiceover with OpenAI TTS...");

    // Known OpenAI voices
    const openAiVoices = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer', 'ash', 'ballad', 'coral', 'sage', 'verse'];

    // Map ElevenLabs voice IDs to OpenAI voices if possible, otherwise use a default
    // Default OpenAI voices: alloy, echo, fable, onyx, nova, shimmer
    let openAiVoice = 'onyx'; // Default professional male voice
    
    if (requestedVoiceId) {
      // 1. Check if the ID itself is a known OpenAI voice
      const idLower = requestedVoiceId.toLowerCase();
      if (openAiVoices.includes(idLower)) {
        openAiVoice = idLower;
        console.log(`Using requested voice ID directly as OpenAI voice: ${openAiVoice}`);
      } else {
        // 2. Otherwise look it up in the database
        const { data: voiceData } = await supabase
          .from('voices')
          .select('name, elevenlabs_voice_id, category')
          .eq('id', requestedVoiceId)
          .single();

        if (voiceData) {
          const voiceIdRaw = voiceData.elevenlabs_voice_id?.toLowerCase() || '';
          const name = voiceData.name?.toLowerCase() || '';
          
          if (openAiVoices.includes(voiceIdRaw)) {
            openAiVoice = voiceIdRaw;
          } else if (name.includes('alloy')) openAiVoice = 'alloy';
          else if (name.includes('echo')) openAiVoice = 'echo';
          else if (name.includes('fable')) openAiVoice = 'fable';
          else if (name.includes('onyx')) openAiVoice = 'onyx';
          else if (name.includes('nova')) openAiVoice = 'nova';
          else if (name.includes('shimmer')) openAiVoice = 'shimmer';
          else if (name.includes('ash')) openAiVoice = 'ash';
          else if (name.includes('ballad')) openAiVoice = 'ballad';
          else if (name.includes('coral')) openAiVoice = 'coral';
          else if (name.includes('sage')) openAiVoice = 'sage';
          else if (name.includes('verse')) openAiVoice = 'verse';
          else if (name.includes('female')) openAiVoice = 'nova';
          else if (name.includes('male')) openAiVoice = 'onyx';
          
          console.log(`Mapped DB voice ${name} (ID: ${voiceIdRaw}) to OpenAI: ${openAiVoice}`);
        }
      }
    }

    const ttsResponse = await fetch(
      'https://api.openai.com/v1/audio/speech',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'tts-1',
          input: script,
          voice: openAiVoice,
          response_format: 'mp3',
          speed: 1.0,
        }),
      }
    );

    if (!ttsResponse.ok) {
      const errorText = await ttsResponse.text();
      console.error('OpenAI TTS API error:', ttsResponse.status, errorText);
      throw new Error('Voice generation failed via OpenAI');
    }

    const audioBuffer = await ttsResponse.arrayBuffer();
    const audioBytes = new Uint8Array(audioBuffer);

    // Convert to base64 to return directly - no storage
    const base64Audio = btoa(String.fromCharCode(...audioBytes));

    console.log("OpenAI Voiceover generated, returning directly (no storage)");

    return new Response(
      JSON.stringify({
        success: true,
        script,
        audioData: base64Audio, // Return audio directly as base64
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error generating script:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
