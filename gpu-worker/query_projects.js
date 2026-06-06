import { createClient } from '@supabase/supabase-js';
const supabase = createClient('https://jvlhockppezyupkwpqac.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp2bGhvY2twcGV6eXVwa3dwcWFjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2MTc1NjEsImV4cCI6MjA4NjE5MzU2MX0.EgicjtXCEVyHn_3Z_tCoP_ec7LS6VBwjBttcvx5JEnQ');

async function check() {
  const { data, error } = await supabase.from('projects').select('id, title, status, render_progress, created_at, updated_at').order('updated_at', { ascending: false }).limit(3);
  if (error) console.error(error);
  else {
    console.log(JSON.stringify(data, null, 2));
  }
}
check();
