
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY')

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { prompt, aspectRatio = '16:9', currentLayers = [], imageBase64 = null } = await req.json()

    if (!prompt) {
      throw new Error('Prompt is required')
    }

    console.log(`[AfterAI] Processing neural synthesis for: "${prompt}"...`)

    const messages: any[] = [
      {
        role: 'system',
        content: `You are an elite motion designer and After Effects expert. 
Your task is to generate a professional Remotion-compatible JSON configuration for a motion design.

IF CURRENT LAYERS ARE PROVIDED:
- You are in EDIT MODE. The user wants to modify the existing design.
- If the user asks for a change (e.g. "change color", "move text"), MODIFY the existing layer properties.
- DO NOT duplicate layers. If a layer represents the same entity, keep its ID and update its properties.
- Only add new layers if the user explicitly asks for something NEW.
- If the current layers include a placeholder like "AFTER AI" (ID: "text-1"), and the user's prompt implies a new design, REMOVE or REPLACE that placeholder.

OUTPUT FORMAT:
Return ONLY a JSON object with the following structure:
{
  "layers": [
    {
      "id": "unique-id-string", // Use the existing ID if editing, otherwise a new UUID
      "type": "text" | "solid" | "video" | "image" | "counter" | "cube",
      "name": "Human-readable name",
      "content": "Text content",
      "color": "Hex color (e.g. #ff00ea)",
      "topColor": "Hex color for top face of cube",
      "bottomColor": "Hex color for bottom face of cube",
      "textGradient": false,
      "gradientEnd": "#ffffff",
      "glow": 0, // Bloom intensity (0-100)
      "blur": 0, // Blur amount (0-20)
      "letterSpacing": "-0.05em",
      "strokeWidth": 0, // Text stroke width
      "strokeColor": "#ffffff",
      "size": 300, // For cube type
      "texturePrompt": "minecraft grass block", // Search term for image/cube texture
      "url": "Asset URL",
      "start": 0,
      "duration": 5,
      "x": 50,
      "y": 50,
      "rotateX": 0,
      "rotateY": 0,
      "rotateZ": 0,
      "scale": 1.0,
      "opacity": 1.0,
      "rotation": 0,
      "is3D": false,
      "rotateX": 0,
      "rotateY": 0,
      "startValue": 0,
      "endValue": 1000,
      "animations": [
        {
          "type": "fade-in" | "fade-out" | "slide-in-left" | "slide-in-right" | "slide-in-top" | "slide-in-bottom" | "zoom-in" | "zoom-out" | "shake" | "liquid-reveal",
          "time": 0,
          "duration": 1.0,
          "easing": "cubic_out" | "linear" | "back_out"
        }
      ]
    }
  ],
  "background_color": "#0c0916"
}

CREATIVE DIRECTION:
- For "smooth number counters" (e.g. 0 to 1000), use "type": "counter". Set "startValue" and "endValue" accordingly.
- For "3D text", set "is3D": true and use "rotateX"/"rotateY" to create perspective.
- For "liquid transitions" or "CCLeaf style", use "liquid-reveal" animation type and layered text with slight delays.
- Ensure colors are premium (vibrant gradients, sleek dark modes).
- Pacing should be snappy and professional.
- Max composition duration: 15 seconds.
`
      },
      {
        role: 'user',
        content: [
          { 
            type: 'text', 
            text: `USER PROMPT: ${prompt}\nASPECT RATIO: ${aspectRatio}\nCURRENT LAYERS: ${JSON.stringify(currentLayers)}` 
          },
          ...(imageBase64 ? [{ type: 'image_url', image_url: { url: imageBase64 } }] : [])
        ]
      }
    ]

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages,
        response_format: { type: 'json_object' },
        temperature: 0.7,
      }),
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`OpenAI API failed: ${error}`)
    }

    const data = await response.json()
    const config = JSON.parse(data.choices[0].message.content)

    return new Response(JSON.stringify({ success: true, config }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
