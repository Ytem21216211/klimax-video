DO $$
DECLARE
    t_name text;
    col_exists boolean;
BEGIN
    FOR t_name IN 
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    LOOP
        -- Enable Row Level Security
        EXECUTE 'ALTER TABLE public.' || quote_ident(t_name) || ' ENABLE ROW LEVEL SECURITY;';

        -- Check if user_id column exists
        SELECT EXISTS (
            SELECT 1 
            FROM information_schema.columns 
            WHERE table_schema = 'public' 
              AND table_name = t_name 
              AND column_name = 'user_id'
        ) INTO col_exists;

        IF col_exists THEN
            -- Safely drop existing restrictive standard policy if created by this script before, or just use CREATE POLICY IF NOT EXISTS (not natively supported before PG14 for everything but we can catch duplicate object exceptions)
            BEGIN
                EXECUTE '
                    CREATE POLICY "Users can only access their own data" 
                    ON public.' || quote_ident(t_name) || ' 
                    FOR ALL 
                    USING (auth.uid() = user_id);
                ';
            EXCEPTION
                WHEN duplicate_object THEN
                    -- Policy already exists, ignore
                    NULL;
            END;
        END IF;

        -- For profiles which has an explicit 'id' column mapping to auth.uid()
        IF t_name = 'profiles' THEN
             BEGIN
                EXECUTE '
                    CREATE POLICY "Users can only access their own profile" 
                    ON public.profiles 
                    FOR ALL 
                    USING (auth.uid() = id);
                ';
            EXCEPTION WHEN duplicate_object THEN NULL; END;
            
            BEGIN
                EXECUTE '
                    CREATE POLICY "Profiles are viewable by everyone" 
                    ON public.profiles 
                    FOR SELECT 
                    USING (true);
                ';
            EXCEPTION WHEN duplicate_object THEN NULL; END;
        END IF;
    END LOOP;
END
$$;
