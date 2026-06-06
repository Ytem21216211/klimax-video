import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { sfxId, name, description } = await req.json();
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");

    if (!OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY not configured");
    }

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `You are an expert sound designer. Analyze the following SFX metadata. 
Output a concise 'Neural Acoustic Profile' that will be used by an AI placement engine to match this sound to video moments.
Include:
1. Primary Category (Action, Reward, UI, Ambient, Impact)
2. Semantic Intensity (1-10)
3. Matching Keywords (e.g., 'teleport', 'click', 'cheer', 'hit')
4. Ideal Context (e.g., 'fast movement', 'item gain')

Format: [AI-ANALYSIS] Profile: {Category} | Intensity: {1-10} | Keywords: {comma separated} | Context: {concise}`
          },
          {
            role: "user",
            content: `Name: ${name}\nDescription: ${description || "No description provided"}`
          }
        ],
        temperature: 0.3,
      }),
    });

    const data = await response.json();
    const aiAnalysis = data.choices?.[0]?.message?.content || "[AI-ANALYSIS] Profile: Generic | Intensity: 5 | Keywords: sound | Context: unknown";

    // Update the database
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    await admin.from("sfx_library").update({ description: aiAnalysis }).eq("id", sfxId);

    return new Response(JSON.stringify({ success: true, analysis: aiAnalysis }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Analysis failed:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
