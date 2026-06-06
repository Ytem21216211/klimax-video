-- Add is_enabled to sfx_library
ALTER TABLE sfx_library ADD COLUMN IF NOT EXISTS is_enabled BOOLEAN DEFAULT true;

-- Update RLS if needed (assume public for now as it seems to be the case)
-- But wait, if we want to allow users to update it, we need a policy.
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'sfx_library' AND policyname = 'Users can update their own SFX enablement'
    ) THEN
        -- Since there is no user_id column yet, we might need to add it or just allow authenticated users to update for now
        -- However, it's better to add user_id now.
        ALTER TABLE sfx_library ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
    END IF;
END $$;
