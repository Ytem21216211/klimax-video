const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error("Missing Superbase Credentials in .env");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function reloadSchemaCache() {
    console.log("Waking cache...");
    const { error } = await supabase.from('_non_existent_table').select('*').limit(1);
    if (error && error.code !== '42P01') {
        console.log("Trigger error:", error);
    } else {
        console.log("Cache wake-up query executed. The frontend should now be unblocked.");
    }
}

reloadSchemaCache();
