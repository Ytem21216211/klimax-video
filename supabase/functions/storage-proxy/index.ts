import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ADMIN_EMAILS = [
  "roliumgens@gmail.com",
  "dipsan@mineviral.xyz",
  "stn1xer@gmail.com"
];

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      throw new Error('Missing authorization header');
    }

    const { bucket, path } = await req.json();
    if (!bucket || !path) {
      throw new Error('Missing bucket or path in request body');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // 1. Verify user identity using their own token
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      console.error('Auth check failed:', userError);
      throw new Error('Authentication required');
    }

    // 2. Check for Admin privileges
    if (!ADMIN_EMAILS.includes(user.email?.toLowerCase() || "")) {
      console.warn(`Unauthorized access attempt by: ${user.email}`);
      throw new Error('Access denied: Admin only');
    }

    // 3. Create a service client to fetch the file
    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);

    console.log(`Proxying download for ${user.email}: ${bucket}/${path}`);

    // Download the file internally
    const { data, error } = await serviceClient.storage
      .from(bucket)
      .download(path);

    if (error) {
      console.error('Storage error:', error);
      throw error;
    }

    if (!data) {
      throw new Error('No data received from storage');
    }

    // Return the blob with CORS headers
    return new Response(data, {
      headers: {
        ...corsHeaders,
        'Content-Type': data.type || 'application/octet-stream',
        'Content-Length': data.size.toString(),
      },
    });

  } catch (error: any) {
    console.error('Storage Proxy error:', error.message);
    const status = error.message.includes('denied') ? 403 : (error.message.includes('Authentication') ? 401 : 400);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
