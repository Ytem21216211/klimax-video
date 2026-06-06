# MineCaption AI - Codebase Expert

## Overview
MineCaption AI (aka MineEdit AI) is a full-stack SaaS platform for Minecraft content creators.
It automates short-form video production: AI scripts → voiceovers → rendering → subtitle styling → multi-platform auto-posting (YouTube/TikTok).

## Tech Stack
- **Frontend**: React 18 + TypeScript, Vite, Tailwind CSS, shadcn/ui, React Router v6, TanStack React Query
- **Backend**: Supabase (PostgreSQL + 49 Edge Functions + Auth + Storage)
- **AI**: OpenAI/GPT-4, Grok (xAI), ElevenLabs
- **Video**: FFmpeg (CPU/GPU-NVENC), GPU Worker on Hetzner server
- **Deploy**: Vercel (frontend), Supabase (backend)

## Key Pages (21 total)
- `/` - Landing page
- `/auth` - Login with whitelist (roliumgens@gmail.com, bobyummy7@gmail.com)
- `/dashboard` - Project hub with real-time status
- `/project/:projectId` - Video editor (10+ tabs: Generate, Settings, Subtitles, IP Popup, End Screen, Music, YouTube, TikTok, Team)
- `/scriptforge` - AI script training (gamemodes, training scripts, competitors)
- `/voice-library` - ElevenLabs voice cloning/design
- `/sfx-library` - Sound effects management
- `/clips-factory` - Clip pool (gameplay/transition/b-roll, intensity levels)
- `/data-center` - Gamemode insights, weekly reports, competitor reports, A/B tests, automation
- `/datalligence` - Drag-drop analytics dashboard (40+ metrics, 10+ chart types)
- `/analytics` - Video scores and velocity tracking
- `/command-center` - Admin AI chat (admin: roiliumgens@gmail.com)
- `/agentik-flow` - Visual AI agent flow builder (React Flow)
- `/vizion` - AI style extractor from reference videos
- `/tablor` - View prediction/forecasting
- `/imports`, `/invitations` - Video library, team invites

## Core Features
1. **AI Script Generation** - GPT-4 with gamemode context + TikTok training scripts + competitor data
2. **Voice Synthesis** - ElevenLabs (generated, cloned, designed voices)
3. **Video Rendering** - GPU worker + FFmpeg with clip selection, zoom, transitions (30+ styles), subtitles (30+ animations), IP popup, end screen, music, SFX
4. **Subtitle Styling** - Font, size, color, stroke, shadow, glow, position, animation
5. **Multi-Platform Posting** - YouTube (multi-account OAuth, scheduling, warmup) + TikTok (OAuth, auto-upload)
6. **Analytics** - Views, retention, CTR, cognitive scoring (hook/CTA/editing), VQI, weekly AI reports
7. **Dev Assistant** - In-app AI coding helper

## Database (50+ tables)
- Core: `projects`, `videos`, `voiceovers`, `render_queue`, `gamemodes`, `clip_pool`, `sfx_library`, `voices`
- Analytics: `video_performance`, `video_analytics_snapshots`, `channel_analytics_snapshots`, `gamemode_insights`, `weekly_reports`
- Publishing: `youtube_accounts`, `tiktok_accounts`, `youtube_post_queue`, `tiktok_post_queue`

## Python Pipelines
- **video-indexing/**: CLIP embeddings + ChromaDB for semantic video search
- **vizion/**: Scene detection, optical flow, OCR → GPT-4 JSON preset

## GPU Worker
Node.js worker that polls render_queue, claims jobs, runs FFmpeg, uploads to Supabase Storage, triggers webhooks.

## Important Paths
- Frontend: `src/`
- Edge Functions: `supabase/functions/`
- GPU Worker: `gpu-worker/`
- Python Pipelines: `video-indexing/`, `vizion/`
- DB Types: `src/integrations/supabase/types.ts` (2030 lines)
- Product Spec: `product_description.md`

---

# FFmpeg Development Protocol

## CRITICAL RULE
Whenever a new feature touches the **editing side of MineCaption**, you MUST do the following before writing a single line of code:

---

## Step 1: Audit the existing FFmpeg codebase
- Read every file that contains FFmpeg logic
- Map out all active FFmpeg commands, flags, filter chains, and pipelines
- Identify all input/output formats currently in use
- Note any custom FFmpeg wrappers, helper functions, or abstractions already built

## Step 2: Analyze for conflicts
Before building, answer these questions:
- Does the new feature require a new FFmpeg filter or command that could conflict with existing ones?
- Does it change the order of operations in an existing pipeline?
- Does it introduce a new codec, format, or resolution that the current stack doesn't already handle?
- Could it affect render times or memory usage on the Hetzner machine in a way that breaks other features?
- Does it modify any shared FFmpeg utility or wrapper used by multiple features?

## Step 3: Design for compatibility
- The new feature must slot into the existing pipeline cleanly — no monkey-patching
- If a new FFmpeg filter chain is needed, it must be isolated and not mutate shared state
- If an existing command needs to be modified, refactor it properly — do not duplicate it
- Always account for the Hetzner machine's resource constraints (CPU, RAM, disk I/O)
- Output formats must remain consistent with what downstream features expect

## Step 4: Validate before shipping
- Trace the full render path end to end with the new feature included
- Confirm no existing feature breaks when the new one is active
- If in doubt, build a dry-run / test flag that runs the FFmpeg command without writing output

---

## Why this matters
MineCaption's rendering runs on a single Hetzner machine via FFmpeg. There is no safety net. A broken FFmpeg pipeline means broken renders for all users. Every editing feature is interconnected through that pipeline. Sustainability means every new feature must be aware of everything that came before it.

## The standard
Don't just make it work. Make it work **without breaking anything that already works.**

---

# Code Quality Protocol — Minimax m2.7 Highspeed Standard

## THE RULE
Before saving any code to the codebase, you MUST self-review it against every checkpoint in this document. This is not optional. This is not a suggestion. If the code does not pass, rewrite it until it does.

---

## CHECKPOINT 1: Will this break when we add more features?

Ask yourself:
- Is any logic hardcoded that will need to change later? If yes, make it configurable.
- Are there magic numbers or magic strings? Replace them with named constants.
- Is this function doing more than one job? If yes, split it.
- Does this code assume a specific state that might not always exist? Handle the edge cases now.
- If we double the number of features tomorrow, does this still hold up? If not, refactor before saving.

---

## CHECKPOINT 2: Is this sustainable long-term?

Ask yourself:
- Will another developer (or future me) understand this in 6 months without explanation?
- Are variable and function names descriptive and unambiguous?
- Is there any duplicated logic that should be a shared utility instead?
- Are dependencies minimal and justified? No unnecessary imports or libraries.
- Is the folder/file structure logical and consistent with the rest of the codebase?

---

## CHECKPOINT 3: Is this robust?

Ask yourself:
- What happens if this function receives unexpected input? Handle it.
- What happens if an external service (API, database, FFmpeg, etc.) fails or times out? Handle it.
- Are errors caught and logged in a way that makes debugging fast?
- Is there any silent failure — code that fails without telling anyone? Eliminate it.
- Are async operations handled correctly? No unhandled promises, no race conditions.

---

## CHECKPOINT 4: Is this performant enough to scale?

Ask yourself:
- Does this make unnecessary repeated calls (API, DB, file system) that could be batched or cached?
- Is any loop doing work that could be done once outside the loop?
- Does this block the main thread when it doesn't need to?
- On the infrastructure this runs on (Hetzner VPS), will this hold up under real load?

---

## CHECKPOINT 5: Does this integrate cleanly?

Ask yourself:
- Does this touch shared utilities, pipelines, or data structures? If yes, trace every downstream dependency and confirm nothing breaks.
- Is the output format of this code consistent with what other parts of the system expect?
- Does this introduce a new pattern that conflicts with existing patterns in the codebase?
- If this is removed or replaced later, how painful will that be? Design for replaceability.

---

## CHECKPOINT 6: Final self-review before saving

Run through this checklist line by line:
- [ ] No hardcoded values that should be variables
- [ ] No duplicated logic
- [ ] All edge cases handled
- [ ] All errors caught and surfaced
- [ ] Function/variable names are clear and accurate
- [ ] No unnecessary complexity — simplest possible solution that works
- [ ] Consistent with the rest of the codebase in style and structure
- [ ] Tested mentally end-to-end — I can trace the full execution path in my head
- [ ] If this breaks, it breaks loudly and clearly — not silently

---

## THE STANDARD

Fast code that breaks is worthless. The goal is code that ships fast AND holds up permanently. Every line saved to this codebase is a commitment. Write it like it's staying forever.

If you are unsure about any checkpoint — stop, think harder, then rewrite. Never save code you have doubts about.
