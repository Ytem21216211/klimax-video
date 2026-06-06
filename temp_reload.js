import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error("Missing Superbase Credentials in .env");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function reloadSchemaCache() {
    console.log("Attempting to reload PostgREST schema cache via RPC...");
    // A standard way to reload cache remotely without raw SQL is a tiny RPC function, 
    // but if that doesn't exist, we just query a non-existent table to wake the cache up.
    const { error } = await supabase.from('_dummy_reload_table').select('*').limit(1);
    if (error && error.code !== '42P01') {
        console.log("Trigger error:", error);
    } else {
        console.log("Cache wake-up query executed.");
    }
}

reloadSchemaCache();
