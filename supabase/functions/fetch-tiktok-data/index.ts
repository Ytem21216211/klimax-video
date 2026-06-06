import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // 1. Ensure Default Scoring Weights Exist
    const { data: weights, error: weightsError } = await supabase
      .from('scoring_weights')
      .select('*')
      .eq('niche', 'default')
      .single();

    if (!weights && !weightsError) {
      console.log("Seeding default scoring weights...");
      await supabase.from('scoring_weights').insert({
        niche: 'default',
        weights: {
          like: 1.0,
          comment: 2.2,
          share: 3.5,
          save: 3.8,
          full_watch: 4.5,
          rewatch: 5.5,
          profile_click: 2.0,
          follow: 4.0
        },
        thresholds: {
          stage_0: 500,
          stage_1: 2000,
          stage_2: 10000,
          stage_3: 50000,
          stage_4: 250000
        }
      });
    }

    // 2. Fetch Active Videos to Update
    const { data: videos, error: videoError } = await supabase
      .from('tracked_videos')
      .select('*')
      .eq('status', 'active');

    if (videoError) throw videoError;

    const updates = [];
    const snapshots = [];

    // 3. (MOCK) Fetch Metrics for each video
    // In production, this would call Apify or TikTok API
    for (const video of videos || []) {
      // Simulate metric growth based on "random" factors + current score
      const isViral = Math.random() > 0.8;
      const growthFactor = isViral ? 1.5 : 1.05;

      // Mock fetching "real-time" data
      // For now, we just increment existing values or initialize them
      // In a real app, we would fetch the ACTUAL current values from TikTok

      // Get last snapshot to calculate growth
      const { data: lastSnapshot } = await supabase
        .from('analytics_snapshots')
        .select('*')
        .eq('video_id', video.id)
        .order('timestamp', { ascending: false })
        .limit(1)
        .single();

      const currentViews = lastSnapshot ? Number(lastSnapshot.views) : 0;
      const newViews = Math.floor(currentViews * growthFactor) + Math.floor(Math.random() * 100);

      const viewsAdded = newViews - currentViews;

      // Calculate realistic engagement based on standard ratios
      const newLikes = (lastSnapshot?.likes || 0) + Math.floor(viewsAdded * 0.1); // 10% like rate
      const newComments = (lastSnapshot?.comments || 0) + Math.floor(viewsAdded * 0.01); // 1% comment rate
      const newShares = (lastSnapshot?.shares || 0) + Math.floor(viewsAdded * 0.005); // 0.5% share rate
      const newSaves = (lastSnapshot?.saves || 0) + Math.floor(viewsAdded * 0.015); // 1.5% save rate

      const snapshot = {
        video_id: video.id,
        views: newViews,
        likes: newLikes,
        comments: newComments,
        shares: newShares,
        saves: newSaves,
        completion_rate: Math.random() * 0.6 + 0.2, // Random 20-80%
        avg_watch_time: video.duration ? video.duration * (Math.random() * 0.5 + 0.3) : 0,
      };

      snapshots.push(snapshot);

      // We will trigger score calculation separately or via database trigger
      // For now, let's just log it
      console.log(`Prepared update for video ${video.tiktok_id}: ${newViews} views`);
    }

    // 4. Batch Insert Snapshots
    if (snapshots.length > 0) {
      const { error: insertError } = await supabase
        .from('analytics_snapshots')
        .insert(snapshots);

      if (insertError) throw insertError;
    }

    return new Response(
      JSON.stringify({
        success: true,
        processed: videos?.length || 0,
        message: "Metrics updated and snapshots created"
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );

  } catch (error: any) {
    console.error('Error fetching tiktok data:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      },
    );
  }
});
