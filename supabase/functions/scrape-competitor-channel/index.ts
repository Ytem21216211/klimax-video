import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const youtubeClientId = Deno.env.get('YOUTUBE_CLIENT_ID');
    const apifyToken = Deno.env.get('APIFY_API_TOKEN');

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Validate user from auth header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const userId = claimsData.claims.sub;

    const { competitorId, channelUrl, platform, gamemodeId, channelName } = await req.json();

    let targetCompetitorId = competitorId;

    // If no competitorId, we're adding a new competitor
    if (!targetCompetitorId && channelUrl && platform && gamemodeId) {
      const channelId = extractChannelId(channelUrl, platform);
      
      if (!channelId) {
        return new Response(JSON.stringify({ error: 'Could not extract channel ID from URL' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Create competitor channel record
      const { data: newCompetitor, error: insertError } = await supabase
        .from('competitor_channels')
        .insert({
          user_id: userId,
          gamemode_id: gamemodeId,
          platform,
          channel_url: channelUrl,
          channel_id: channelId,
          channel_name: channelName || channelId,
        })
        .select()
        .single();

      if (insertError) {
        if (insertError.code === '23505') {
          return new Response(JSON.stringify({ error: 'Competitor already exists' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        throw insertError;
      }

      targetCompetitorId = newCompetitor.id;
    }

    if (!targetCompetitorId) {
      return new Response(JSON.stringify({ error: 'Missing competitor info' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get competitor details
    const { data: competitor, error: competitorError } = await supabase
      .from('competitor_channels')
      .select('*')
      .eq('id', targetCompetitorId)
      .eq('user_id', userId)
      .single();

    if (competitorError || !competitor) {
      return new Response(JSON.stringify({ error: 'Competitor not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let videos: any[] = [];

    if (competitor.platform === 'youtube') {
      videos = await scrapeYouTubeChannel(competitor.channel_id, youtubeClientId);
    } else if (competitor.platform === 'tiktok') {
      videos = await scrapeTikTokChannel(competitor.channel_id, apifyToken);
    }

    console.log(`Scraped ${videos.length} videos from ${competitor.channel_name}`);

    // Save videos to database
    let savedCount = 0;
    for (const video of videos) {
      const { error: videoError } = await supabase
        .from('competitor_videos')
        .upsert({
          competitor_id: targetCompetitorId,
          user_id: userId,
          platform_video_id: video.id,
          title: video.title,
          description: video.description,
          view_count: video.views || 0,
          like_count: video.likes || 0,
          published_at: video.publishedAt,
          tags: video.tags || [],
          duration_seconds: video.duration,
          thumbnail_url: video.thumbnail,
          analyzed: false,
        }, {
          onConflict: 'competitor_id,platform_video_id',
        });

      if (!videoError) savedCount++;
    }

    // Update last scraped timestamp
    await supabase
      .from('competitor_channels')
      .update({ 
        last_scraped_at: new Date().toISOString(),
        channel_name: videos[0]?.channelName || competitor.channel_name,
      })
      .eq('id', targetCompetitorId);

    return new Response(JSON.stringify({ 
      success: true,
      competitorId: targetCompetitorId,
      videosFound: videos.length,
      videosSaved: savedCount,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('Error scraping competitor:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

function extractChannelId(url: string, platform: string): string | null {
  if (platform === 'youtube') {
    // Handle various YouTube URL formats
    const patterns = [
      /youtube\.com\/channel\/([^\/\?]+)/,
      /youtube\.com\/c\/([^\/\?]+)/,
      /youtube\.com\/@([^\/\?]+)/,
      /youtube\.com\/user\/([^\/\?]+)/,
    ];
    
    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) return match[1];
    }
  } else if (platform === 'tiktok') {
    // Handle TikTok URL formats
    const match = url.match(/tiktok\.com\/@([^\/\?]+)/);
    if (match) return match[1];
  }
  
  return null;
}

async function scrapeYouTubeChannel(channelId: string, _apiKey?: string): Promise<any[]> {
  // Use YouTube RSS feed (no API key needed for public data)
  try {
    // Try handle format first
    let feedUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
    
    // If channelId looks like a handle (@username), we need to resolve it
    if (channelId.startsWith('@') || !channelId.startsWith('UC')) {
      // For handles, try to fetch the channel page to get the channel ID
      const channelPage = await fetch(`https://www.youtube.com/${channelId.startsWith('@') ? channelId : '@' + channelId}`);
      const html = await channelPage.text();
      const match = html.match(/"channelId":"(UC[^"]+)"/);
      if (match) {
        feedUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${match[1]}`;
      }
    }

    const response = await fetch(feedUrl);
    if (!response.ok) {
      console.error('YouTube RSS feed error:', response.status);
      return [];
    }

    const xml = await response.text();
    const videos: any[] = [];

    // Parse XML manually (simple approach)
    const entries = xml.split('<entry>').slice(1);
    for (const entry of entries.slice(0, 30)) {
      const getId = (tag: string) => {
        const match = entry.match(new RegExp(`<yt:${tag}>([^<]+)</yt:${tag}>`));
        return match ? match[1] : null;
      };
      
      const getTag = (tag: string) => {
        const match = entry.match(new RegExp(`<${tag}>([^<]+)</${tag}>`));
        return match ? match[1] : null;
      };

      const getMediaTag = (attr: string) => {
        const match = entry.match(new RegExp(`<media:${attr}>([^<]+)</media:${attr}>`));
        return match ? match[1] : null;
      };

      const videoId = getId('videoId');
      if (!videoId) continue;

      videos.push({
        id: videoId,
        title: getTag('title') || '',
        description: getMediaTag('description') || '',
        publishedAt: getTag('published'),
        thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
        views: 0, // RSS doesn't include views
        likes: 0,
        tags: [],
        channelName: getTag('name'),
      });
    }

    return videos;
  } catch (error) {
    console.error('Error scraping YouTube:', error);
    return [];
  }
}

async function scrapeTikTokChannel(username: string, apifyToken?: string): Promise<any[]> {
  if (!apifyToken) {
    console.error('APIFY_API_TOKEN not configured');
    return [];
  }

  try {
    // Use the same Apify scraper as training scripts
    const response = await fetch('https://api.apify.com/v2/acts/clockworks~free-tiktok-scraper/run-sync-get-dataset-items?token=' + apifyToken, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        profiles: [username.replace('@', '')],
        resultsPerPage: 30,
        shouldDownloadVideos: false,
        shouldDownloadCovers: false,
      }),
    });

    if (!response.ok) {
      console.error('Apify error:', response.status);
      return [];
    }

    const data = await response.json();
    
    return data.map((item: any) => ({
      id: item.id,
      title: item.text || '',
      description: item.text || '',
      publishedAt: item.createTimeISO,
      thumbnail: item.videoMeta?.coverUrl,
      views: item.playCount || 0,
      likes: item.diggCount || 0,
      duration: item.videoMeta?.duration,
      tags: item.hashtags?.map((h: any) => h.name) || [],
      channelName: item.authorMeta?.name || username,
    }));
  } catch (error) {
    console.error('Error scraping TikTok:', error);
    return [];
  }
}
