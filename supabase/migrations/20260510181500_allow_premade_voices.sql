-- Allow everyone to view premade (standard) voices
CREATE POLICY "Anyone can view premade voices"
  ON public.voices FOR SELECT
  USING (category = 'premade');

-- Ensure premade voices are actually available to the system
-- (In case some are still tied to a specific user)
UPDATE public.voices 
SET user_id = '6159ec35-0d91-4d13-b885-55334e41e7cd' 
WHERE category = 'premade';
