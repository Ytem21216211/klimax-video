import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { messages, apiKey, systemPrompt } = await req.json();
    const openaiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openaiKey) throw new Error('OPENAI_API_KEY not configured');

    console.log(`Calling Grok 4.3 with ${messages.length} messages`);

    const response = await fetch(`https://api.openai.com/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${openaiKey}`
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          ...(systemPrompt ? [{ role: "system", content: systemPrompt }] : []),
          ...messages.map((m: any) => ({
            role: m.role === 'model' ? 'assistant' : m.role,
            content: m.content
          }))
        ],
        temperature: 0.7,
      })
    });

    const data = await response.json();

    if (data.error) {
      throw new Error(`Grok API Error: ${data.error.message || JSON.stringify(data.error)}`);
    }

    const text = data.choices?.[0]?.message?.content || "No response generated.";

    return new Response(JSON.stringify({ text }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error: any) {
    console.error("Function Error:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});

