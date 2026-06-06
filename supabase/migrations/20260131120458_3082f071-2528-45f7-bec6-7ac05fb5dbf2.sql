-- Create hook_ab_tests table
CREATE TABLE public.hook_ab_tests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  gamemode_id UUID REFERENCES public.gamemodes(id) ON DELETE SET NULL,
  test_name TEXT NOT NULL,
  base_script TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'cancelled')),
  winner_variation_id UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  completed_at TIMESTAMP WITH TIME ZONE
);

-- Create hook_variations table
CREATE TABLE public.hook_variations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  test_id UUID NOT NULL REFERENCES public.hook_ab_tests(id) ON DELETE CASCADE,
  hook_style TEXT NOT NULL CHECK (hook_style IN ('question', 'bold_claim', 'mystery', 'challenge', 'action')),
  hook_text TEXT NOT NULL,
  full_script TEXT NOT NULL,
  video_performance_id UUID REFERENCES public.video_performance(id) ON DELETE SET NULL,
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  youtube_views INTEGER DEFAULT 0,
  youtube_avg_view_percentage NUMERIC,
  is_winner BOOLEAN DEFAULT false,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add foreign key for winner_variation_id after hook_variations is created
ALTER TABLE public.hook_ab_tests 
ADD CONSTRAINT hook_ab_tests_winner_variation_id_fkey 
FOREIGN KEY (winner_variation_id) REFERENCES public.hook_variations(id) ON DELETE SET NULL;

-- Enable RLS on hook_ab_tests
ALTER TABLE public.hook_ab_tests ENABLE ROW LEVEL SECURITY;

-- RLS policies for hook_ab_tests
CREATE POLICY "Users can view their own A/B tests"
ON public.hook_ab_tests
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own A/B tests"
ON public.hook_ab_tests
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own A/B tests"
ON public.hook_ab_tests
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own A/B tests"
ON public.hook_ab_tests
FOR DELETE
USING (auth.uid() = user_id);

-- Enable RLS on hook_variations
ALTER TABLE public.hook_variations ENABLE ROW LEVEL SECURITY;

-- RLS policies for hook_variations (based on test ownership)
CREATE POLICY "Users can view variations of their tests"
ON public.hook_variations
FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.hook_ab_tests
  WHERE hook_ab_tests.id = hook_variations.test_id
  AND hook_ab_tests.user_id = auth.uid()
));

CREATE POLICY "Users can create variations for their tests"
ON public.hook_variations
FOR INSERT
WITH CHECK (EXISTS (
  SELECT 1 FROM public.hook_ab_tests
  WHERE hook_ab_tests.id = hook_variations.test_id
  AND hook_ab_tests.user_id = auth.uid()
));

CREATE POLICY "Users can update variations of their tests"
ON public.hook_variations
FOR UPDATE
USING (EXISTS (
  SELECT 1 FROM public.hook_ab_tests
  WHERE hook_ab_tests.id = hook_variations.test_id
  AND hook_ab_tests.user_id = auth.uid()
));

CREATE POLICY "Users can delete variations of their tests"
ON public.hook_variations
FOR DELETE
USING (EXISTS (
  SELECT 1 FROM public.hook_ab_tests
  WHERE hook_ab_tests.id = hook_variations.test_id
  AND hook_ab_tests.user_id = auth.uid()
));

-- Create trigger for updating updated_at on hook_variations
CREATE TRIGGER update_hook_variations_updated_at
BEFORE UPDATE ON public.hook_variations
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create indexes for performance
CREATE INDEX idx_hook_ab_tests_user_id ON public.hook_ab_tests(user_id);
CREATE INDEX idx_hook_ab_tests_project_id ON public.hook_ab_tests(project_id);
CREATE INDEX idx_hook_ab_tests_status ON public.hook_ab_tests(status);
CREATE INDEX idx_hook_variations_test_id ON public.hook_variations(test_id);
CREATE INDEX idx_hook_variations_video_performance_id ON public.hook_variations(video_performance_id);