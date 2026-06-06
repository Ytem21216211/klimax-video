

# Complete Implementation Plan: Self-Hosted FFmpeg Video Rendering System

## Executive Summary

Replace Creatomate with a self-hosted FFmpeg-based rendering system, eliminating per-video costs (~$0.75-1.00/video) in favor of a fixed monthly server cost (~$80-200/month). At 3,000+ videos/month, this saves approximately **$2,000-$2,800/month** ($24,000-$33,600/year).

---

## Part 1: What You Need to Buy

### Required Infrastructure

| Item | Recommended Provider | Monthly Cost | Why This One |
|------|---------------------|--------------|--------------|
| **GPU Server** | Hetzner AX102 | ~$150/mo | Best value: 64GB RAM, dedicated GPU, 2x1TB NVMe |
| **Backup/CDN** | Cloudflare R2 | ~$5-20/mo | Cheap egress, fast delivery |
| **Domain** | Already have | $0 | For worker API endpoint |

### Recommended: Hetzner AX102

```text
Hetzner AX102 Dedicated Server (~$150/month)
--------------------------------------------
- AMD Ryzen 9 5950X (16 cores / 32 threads)
- 128GB DDR4 ECC RAM
- 2x 3.84TB NVMe SSD (RAID 1)
- NVIDIA RTX A4000 or RTX 4000 GPU (optional addon ~$50/mo)
- 1 Gbit/s unmetered bandwidth
- Location: Germany/Finland (low latency to EU)
```

### Alternative: RunPod (Pay-Per-Use)

```text
RunPod GPU Cloud (~$0.20-0.50/hour)
------------------------------------
- RTX 4090 / A40 / A100 available
- Pay only when rendering
- Auto-scale to demand
- Good for variable workloads
```

### Cost Comparison at 3,000 Videos/Month

| Solution | Monthly Cost | Per-Video | Annual |
|----------|-------------|-----------|--------|
| **Current (Creatomate)** | $2,250-$3,000 | $0.75-1.00 | $27,000-$36,000 |
| **Self-Hosted (Hetzner)** | ~$150-200 | $0.00 | ~$1,800-$2,400 |
| **Savings** | **$2,050-$2,800** | - | **$24,600-$33,600** |

---

## Part 2: Complete Feature Inventory

Based on the 3,300-line `process-video` edge function, here's every Creatomate feature currently in use:

### Tier 1: Core Video Assembly (Week 1)

| Feature | Current Implementation | FFmpeg Approach | Difficulty |
|---------|----------------------|-----------------|------------|
| Multi-clip sequencing | Creatomate timeline | `concat` filter | Easy |
| Audio mixing (voiceover + music + SFX) | Multi-track audio | `amix` / `amerge` filters | Easy |
| Volume control per track | `volume` property | `volume` filter | Easy |
| Audio fade in/out | `afade` animation | `afade` filter | Easy |
| Aspect ratios (9:16, 16:9, 1:1, 4:5) | RenderScript dimensions | `-s` flag | Easy |
| H.264 encoding @ 30fps | Creatomate output | `libx264` / NVENC | Easy |
| Clip trimming | `trim_start`, `trim_duration` | `-ss`, `-t` flags | Easy |
| Video scaling/fitting | `fit: cover` | `scale`, `crop` filters | Easy |

### Tier 2: Transitions (Week 1-2)

Currently using 15+ transition types:

| Transition | Creatomate Type | FFmpeg Equivalent |
|------------|----------------|-------------------|
| Fade | `fade` | `xfade=transition=fade` |
| Slide Left/Right/Up/Down | `slide` with direction | `xfade=transition=slideleft/slideright/slideup/slidedown` |
| Wipe Left/Right | `wipe` | `xfade=transition=wipeleft/wiperight` |
| Zoom In/Out | `scale` animation | `xfade=transition=zoomin/zoomout` |
| Circular Wipe | `circular-wipe` | `xfade=transition=circlecrop` |
| Spin | `rotate` | `xfade=transition=radial` |
| Flip H/V | `rotate` with axis | Custom shader (medium) |
| Glitch | `shake` + `color-shift` | Custom filter chain |
| Shake | `shake` | `drawtext` offset animation |
| Bounce | `scale` with `back-out` | `zoompan` with easing |
| Film Roll | `slide` with easing | `xfade=transition=slidedown` |

### Tier 3: Subtitle System (Week 2)

This is the most complex part - 20+ subtitle animation styles:

| Style | Animation Type | FFmpeg/ASS Approach |
|-------|---------------|---------------------|
| static | Quick fade | `\fad(50,0)` |
| pop | Scale from 60% + fade | `\fscx60\fscy60` + `\t(\fscx100\fscy100)` |
| elastic | Scale overshoot | ASS `\t` with timing |
| slide-up/down | Position animation | `\move` tag |
| fly-in | Per-word flying | Complex ASS per-word |
| reveal | Typewriter reveal | `\kf` karaoke tags |
| bounce | Back-out easing | ASS `\t` transform |
| highlight | Text-scale | ASS `\fscx\fscy` |
| karaoke | Word-by-word appear | `\k` karaoke timing |
| typewriter | Character by character | `\kf` with timing |
| wave | Text wave | Multi-layer offset |
| zoom | Scale 50% to 105% to 100% | ASS transforms |
| glow | Fade + subtle scale | ASS blur effect |
| punch | Scale 200% to 98% to 100% | ASS transforms |
| smash | Scale 300% + shake | Multi-layer |
| crash | Drop + rotation + bounce | Complex ASS |
| float | Gentle drift up | `\move` |
| drift | Side drift + scale | ASS transforms |
| morph | Squash entrance | ASS width/height |
| spark | Quick scale burst | ASS transforms |
| pulse-grow | Growing pulse | ASS animation |
| ripple | Wave effect | Multi-pass ASS |
| cinematic | Slow reveal | ASS `\kf` |
| spotlight | Scale with fade-up | ASS combined |

### Tier 4: Text Styling Features

| Feature | Current | FFmpeg/ASS Approach |
|---------|---------|---------------------|
| Custom fonts (Montserrat, etc.) | `font_family` | Font embedding in ASS |
| Font weight (800) | `font_weight` | `\b1` bold tag |
| Text color | `fill_color` | `\c&HBBGGRR&` |
| Stroke/outline | `stroke_color`, `stroke_width` | `\bord` + `\3c` |
| Drop shadow | `shadow_color`, `shadow_blur` | `\shad` + `\4c` |
| Glow effect | Inner glow via shadow | Multi-layer blur |
| Rainbow keywords (Visual Mode) | Per-word colors | Per-character ASS styling |
| First sentence rainbow (Creative Mode) | Per-word rainbow colors | ASS color tags |

### Tier 5: End Screen System (Week 2-3)

| Feature | Current | FFmpeg Approach |
|---------|---------|-----------------|
| Blur background | Duplicated video with `blur_radius: 50` | `boxblur=50:50` filter |
| Dark overlay | Shape rectangle with rgba | `overlay` with color |
| Logo with animation | Scale + fade + flip | `scale` + `fade` filters |
| Logo glow effect | `shadow_color`, `shadow_blur` | Glow overlay layer |
| IP text styling | Full text properties | ASS subtitle |
| Rainbow glow on IP | Red glow with cyan | Multi-layer approach |
| Creative Mode animations | Scale overshoot + slide | Filter keyframes |

### Tier 6: Advanced Features (Week 3)

| Feature | Current | FFmpeg Approach |
|---------|---------|-----------------|
| Server name logo replacement | Overlay at word timings | Timed overlay filter |
| Progressive zoom on clips | `scale` animation | `zoompan` filter |
| SFX at transitions | Audio overlay at clip changes | Audio `concat` with timing |
| Word-level transcription | ElevenLabs STT | Keep using ElevenLabs |
| AI sentence boundaries | OpenAI analysis | Keep using OpenAI |
| AI keyword detection | OpenAI for Visual Mode | Keep using OpenAI |

---

## Part 3: System Architecture

### High-Level Flow

```text
 +--------------------------------------------------+
 |                 MineEdit Frontend                |
 +--------------------------------------------------+
                        |
                        v
 +--------------------------------------------------+
 |           Supabase Edge Function                 |
 |           (process-video - MODIFIED)             |
 |                                                  |
 |  1. Gather all assets (clips, voiceover, music)  |
 |  2. Run transcription (ElevenLabs)               |
 |  3. Run AI analysis (OpenAI)                     |
 |  4. Build render specification (JSON)            |
 |  5. Insert job into render_queue table           |
 |  6. Return immediately                           |
 +--------------------------------------------------+
                        |
                        v
 +--------------------------------------------------+
 |              render_queue Table                  |
 |  - job_id, project_id, status, spec, created_at  |
 +--------------------------------------------------+
                        |
                        v (polling every 5s)
 +--------------------------------------------------+
 |           GPU Worker Server (Hetzner)            |
 |                                                  |
 |  Node.js Worker Process:                         |
 |  1. Poll render_queue for pending jobs           |
 |  2. Download all assets from Supabase Storage    |
 |  3. Generate ASS subtitle file                   |
 |  4. Build FFmpeg filter graph                    |
 |  5. Execute FFmpeg (GPU-accelerated)             |
 |  6. Upload result to Supabase Storage            |
 |  7. Update project status to "completed"         |
 |  8. Trigger webhooks (Discord, YouTube)          |
 +--------------------------------------------------+
                        |
                        v
 +--------------------------------------------------+
 |           Supabase Storage (exports)             |
 |           Final MP4 + Thumbnail                  |
 +--------------------------------------------------+
```

### Database Changes

New table: `render_queue`

```sql
CREATE TABLE render_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id),
  user_id UUID NOT NULL,
  status TEXT DEFAULT 'pending', -- pending, processing, completed, failed
  spec JSONB NOT NULL, -- Full render specification
  priority INTEGER DEFAULT 0,
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,
  error_message TEXT,
  worker_id TEXT, -- Which worker picked it up
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for efficient polling
CREATE INDEX idx_render_queue_pending ON render_queue(status, priority DESC, created_at ASC) 
  WHERE status = 'pending';
```

### Render Specification Format

```json
{
  "version": 1,
  "project_id": "uuid",
  "output": {
    "width": 1080,
    "height": 1920,
    "fps": 30,
    "codec": "h264",
    "quality": "high"
  },
  "clips": [
    {
      "url": "signed-url",
      "start": 0,
      "duration": 3.5,
      "trim_start": 0,
      "transition": {
        "type": "slide-left",
        "duration": 0.4
      }
    }
  ],
  "audio": {
    "voiceover": {
      "url": "signed-url",
      "volume": 100
    },
    "music": {
      "url": "signed-url",
      "volume": 30,
      "start_time": 5,
      "fade_out": 2
    },
    "sfx": [
      { "url": "signed-url", "time": 3.5, "volume": 60 }
    ]
  },
  "subtitles": {
    "style": "pop",
    "settings": {
      "fontSize": 6,
      "fontFamily": "Montserrat",
      "textColor": "#ffffff",
      "strokeEnabled": true,
      "strokeColor": "#000000",
      "strokeWidth": 2,
      "glowEnabled": true,
      "glowColor": "#ff0000"
    },
    "chunks": [
      {
        "text": "JOIN THE",
        "start": 0.1,
        "end": 0.8,
        "keywords": [0]
      }
    ]
  },
  "endScreen": {
    "enabled": true,
    "start": 28,
    "duration": 2,
    "blur": true,
    "logo": "signed-url",
    "ipText": "play.server.com",
    "ipSettings": { ... }
  }
}
```

---

## Part 4: Implementation Timeline

### Phase 1: Core Engine (Days 1-5)

**Goals:** Get basic video assembly working

#### Day 1-2: Server Setup
- Provision Hetzner AX102 server
- Install Ubuntu 22.04 LTS
- Install FFmpeg with NVENC support
- Install Node.js 20 LTS
- Set up PM2 for process management
- Configure firewall (only allow Supabase IPs)

#### Day 3-4: Worker Foundation
- Create Node.js worker project
- Implement Supabase client connection
- Build job polling system (check every 5s)
- Implement asset download (parallel downloads)
- Basic FFmpeg command builder
- Upload result to Supabase Storage

#### Day 5: Basic Assembly
- Video concatenation (`concat` filter)
- Audio mixing (voiceover + music)
- Volume controls
- Basic fade transitions
- H.264 encoding with NVENC

**Deliverable:** Can render simple videos with clips + voiceover + music

### Phase 2: Transitions + Audio (Days 6-8)

**Goals:** Full transition parity

#### Day 6: FFmpeg Transitions
- Implement all `xfade` transitions:
  - fade, slideleft/right/up/down
  - wipeleft/wiperight
  - zoomin/zoomout, circlecrop
- Map transition names to FFmpeg equivalents

#### Day 7: Complex Transitions
- Glitch effect (multi-filter chain)
- Shake effect (drawtext offset)
- Bounce with easing (zoompan)

#### Day 8: Audio Refinement
- Per-clip volume normalization
- Crossfade between clips
- SFX insertion at transition points
- Audio fade in/out

**Deliverable:** All 15 transition types working

### Phase 3: Subtitle Engine (Days 9-14)

**Goals:** Full subtitle animation parity

#### Day 9-10: ASS Subtitle Generator
- Build ASS file generator in Node.js
- Font embedding support
- Basic styling (color, stroke, shadow)
- Word-level timing from transcription

#### Day 11-12: Animation Styles
- Implement all 20+ animation styles:
  - pop, elastic, bounce, zoom (scale transforms)
  - slide-up/down, fly-in (position transforms)
  - reveal, typewriter, karaoke (progressive reveal)
  - wave, ripple (multi-layer effects)
  - punch, smash, crash (impact animations)

#### Day 13: Advanced Text Effects
- Glow effect (multi-layer blur)
- Rainbow keywords (per-character colors)
- First sentence rainbow (Creative Mode)
- Shadow layer for glow+shadow combo

#### Day 14: Visual Mode Keywords
- Parse keyword indices from spec
- Apply rainbow colors to specific words
- Per-word color variation

**Deliverable:** All subtitle styles with glow/rainbow effects

### Phase 4: End Screen + Polish (Days 15-18)

**Goals:** End screen parity and full integration

#### Day 15: End Screen Core
- Blur background (extract last frame, boxblur)
- Dark overlay composition
- Logo positioning and scaling
- IP text rendering

#### Day 16: End Screen Animations
- Logo scale + fade animations
- IP text entrance animations
- Creative Mode enhanced effects
- Rainbow glow for IP text

#### Day 17: Server Logo Replacement
- Detect server name timings from spec
- Create overlay at exact moments
- Logo scaling and positioning

#### Day 18: Integration
- Connect to existing `process-video` flow
- Modify edge function to insert queue jobs
- Status polling and progress updates
- Discord + YouTube webhook triggers

**Deliverable:** Full feature parity with Creatomate

### Phase 5: Testing + Deployment (Days 19-21)

#### Day 19: Quality Testing
- Side-by-side comparison with Creatomate outputs
- Verify all transitions render correctly
- Test all subtitle styles
- Check audio sync

#### Day 20: Load Testing
- Process 50 videos in parallel
- Monitor server resources
- Optimize bottlenecks
- Test failure recovery

#### Day 21: Production Deployment
- Switch live traffic to new system
- Keep Creatomate as fallback (30 days)
- Monitor error rates
- Disable Creatomate after confidence period

---

## Part 5: Shopping List Summary

### One-Time Setup Costs

| Item | Cost |
|------|------|
| Hetzner setup fee | ~$50 |
| Domain (if needed) | ~$10/year |
| **Total** | **~$60** |

### Monthly Recurring Costs

| Service | Provider | Cost |
|---------|----------|------|
| GPU Server | Hetzner AX102 | ~$150/mo |
| Storage CDN | Cloudflare R2 | ~$5-20/mo |
| **Total Monthly** | | **~$155-170/mo** |

### What You Already Have (No Additional Cost)

- ElevenLabs API (transcription) - already configured
- OpenAI API (AI analysis) - already configured
- Supabase Storage - already configured
- Discord/YouTube webhooks - already configured

---

## Part 6: Capacity Analysis

### Single Server Throughput

```text
Render time per 30-second video:
- CPU encoding (libx264): 2-4 minutes
- GPU encoding (NVENC): 1-2 minutes

With GPU acceleration:
- Videos per hour: 30-60
- Videos per day (24/7): 720-1,440
- Videos per month: 21,600-43,200

Your target (3,000/month):
- Required capacity: 3,000 / 30 days = 100 videos/day
- That's only ~4 hours of rendering per day
- Server utilization: ~17%
```

### Scaling Options

If you ever need more capacity:

| Scale | Solution | Videos/Month |
|-------|----------|--------------|
| 1x | Single Hetzner server | 20,000-40,000 |
| 2x | Add second server | 40,000-80,000 |
| 10x | RunPod auto-scale cluster | 200,000+ |

---

## Part 7: Technical Details

### FFmpeg Filter Graph Example

For a 3-clip video with transitions, subtitles, and end screen:

```bash
ffmpeg \
  -i clip1.mp4 -i clip2.mp4 -i clip3.mp4 \
  -i voiceover.mp3 -i music.mp3 \
  -filter_complex "
    [0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setpts=PTS-STARTPTS[v0];
    [1:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setpts=PTS-STARTPTS[v1];
    [2:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setpts=PTS-STARTPTS[v2];
    [v0][v1]xfade=transition=slideleft:duration=0.4:offset=3.1[t1];
    [t1][v2]xfade=transition=fade:duration=0.35:offset=6.2[vout];
    [vout]ass=subtitles.ass[vsub];
    [3:a]volume=1.0,afade=t=in:d=0.1[vo];
    [4:a]volume=0.3,atrim=start=5,afade=t=in:d=1,afade=t=out:st=25:d=2[mus];
    [vo][mus]amix=inputs=2:duration=longest[aout]
  " \
  -map "[vsub]" -map "[aout]" \
  -c:v h264_nvenc -preset p4 -cq 23 \
  -c:a aac -b:a 192k \
  -r 30 -pix_fmt yuv420p \
  output.mp4
```

### ASS Subtitle Example (Pop Animation)

```ass
[Script Info]
Title: MineEdit Subtitles
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920

[V4+ Styles]
Style: Default,Montserrat,65,&H00FFFFFF,&H00FFFFFF,&H00000000,&H80000000,1,0,0,0,100,100,0,0,1,3,2,2,0,0,0,0

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:00.10,0:00:00.80,Default,,0,0,400,,{\fscx60\fscy60\t(0,180,\fscx100\fscy100)\fad(80,0)}JOIN THE
Dialogue: 0,0:00:00.80,0:00:01.50,Default,,0,0,400,,{\fscx60\fscy60\t(0,180,\fscx100\fscy100)\fad(80,0)\c&H00FF00&}BEST {\c&HFFFFFF&}SERVER
```

---

## Part 8: Risk Mitigation

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Some animations look different | Medium | Extensive QA, keep Creatomate fallback 30 days |
| Server downtime | Low | PM2 auto-restart, Hetzner SLA 99.9% |
| Render failures | Low | Retry logic (3 attempts), error logging |
| Performance issues | Low | Start with GPU encoding, monitor metrics |
| Storage bandwidth | Very Low | Cloudflare R2 for CDN delivery |

### Fallback Strategy

```text
For first 30 days after launch:
1. New system handles all renders
2. If render fails 2x, auto-fallback to Creatomate
3. Monitor failure rate daily
4. After 30 days with <1% failures, disable Creatomate
```

---

## Part 9: Next Steps

Once you approve this plan, I will:

1. **Create the database migration** for the `render_queue` table
2. **Create the GPU worker server code** (Node.js project)
3. **Modify the `process-video` edge function** to use the new queue system
4. **Create setup documentation** for provisioning the Hetzner server

You will need to:
1. **Order the Hetzner AX102 server** (~$150/month)
2. **SSH into the server** to run the setup script I provide
3. **Test with a few videos** before going fully live

