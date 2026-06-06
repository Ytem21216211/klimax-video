-- Create a table for logging Edge Function errors
CREATE TABLE IF NOT EXISTS public.function_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    function_name TEXT NOT NULL,
    log_type TEXT NOT NULL CHECK (log_type IN ('info', 'error', 'warn')),
    message TEXT NOT NULL,
    details JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Allow anyone to insert logs (for debugging purposes, can be restricted later)
ALTER TABLE public.function_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable insert for everyone" ON public.function_logs
FOR INSERT TO anon, authenticated, service_role
WITH CHECK (true);

CREATE POLICY "Enable read for everyone" ON public.function_logs
FOR SELECT TO anon, authenticated, service_role
USING (true);
