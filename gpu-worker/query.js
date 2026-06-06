import { createClient } from '@supabase/supabase-js';
const supabase = createClient('https://jvlhockppezyupkwpqac.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp2bGhvY2twcGV6eXVwa3dwcWFjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2MTc1NjEsImV4cCI6MjA4NjE5MzU2MX0.EgicjtXCEVyHn_3Z_tCoP_ec7LS6VBwjBttcvx5JEnQ');

async function check() {
  const { data, error } = await supabase.from('render_queue').select('id, status, error_message, spec').order('created_at', { ascending: false }).limit(5);
  if (error) console.error(error);
  else {
    data.forEach(d => {
      console.log('---');
      console.log('ID:', d.id);
      console.log('Status:', d.status);
      console.log('Error:', d.error_message);
      console.log('Subtitle Style:', d.spec?.subtitles?.style);
    });
  }
}
check();
