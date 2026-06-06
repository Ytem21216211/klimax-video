# MineCaption AI — Complete Product Description

> **Version:** February 2026  
> **Stack:** React + TypeScript (Vite), Supabase (PostgreSQL + Edge Functions + Storage), FFmpeg GPU Worker, ElevenLabs, YouTube Data API v3, TikTok API v2

---

## 1. Overview

**MineCaption AI** (also referred to internally as **MineEdit AI**) is a full-stack SaaS platform designed specifically for **Minecraft content creators**. It automates the entire short-form video production pipeline — from AI script generation and voiceover synthesis to video rendering, subtitle styling, and multi-platform auto-posting — while providing a deep analytics intelligence layer to continuously optimize content performance.

The platform is built around a **project-based workflow**: each project represents a video series or content channel. Users upload raw gameplay clips, configure their visual style, and let the AI handle the rest — generating scripts, voiceovers, editing the video, and posting it to YouTube and TikTok automatically.

---

## 2. Core Architecture

### 2.1 Frontend
- **Framework:** React 18 + TypeScript, built with Vite
- **Routing:** React Router v6 (SPA, all routes rewrite to `index.html` via `vercel.json`)
- **UI:** Radix UI primitives + Tailwind CSS + shadcn/ui component library
- **State Management:** React Query (TanStack Query v5) for server state; local `useState` for UI state
- **Real-time:** Supabase Realtime (Postgres CDC) for live project status, render progress, and dashboard updates
- **Deployment:** Vercel (static SPA)

### 2.2 Backend
- **Database:** Supabase (PostgreSQL) with Row-Level Security (RLS) policies
- **Edge Functions:** 43 Deno-based Supabase Edge Functions (serverless)
- **Storage:** Supabase Storage (buckets: `video-clips`, `voiceovers`, `project-assets`)
- **File Upload:** TUS resumable upload protocol (up to 2GB per file, pause/resume support)

### 2.3 Rendering Infrastructure
- **GPU Worker:** A dedicated Hetzner server running a Node.js/TypeScript worker (`gpu-worker/`)
- **Renderer:** FFmpeg (CPU or GPU/NVENC) for video composition, subtitle burning, audio mixing
- **Job Queue:** `render_queue` table in Supabase; worker polls for jobs via `worker-api` Edge Function
- **Communication:** Worker authenticates with `GPU_WORKER_SECRET` header

### 2.4 Third-Party Integrations
| Service | Purpose |
|---|---|
| **ElevenLabs** | AI voiceover synthesis, voice cloning, voice design |
| **OpenAI / Gemini** | Script generation, AI chat (Command Center, Dev Assistant) |
| **YouTube Data API v3** | Video upload, analytics sync, channel data |
| **TikTok API v2** | OAuth, video upload |
| **Discord Webhooks** | Notifications on video completion, uploads |

---

## 3. Pages & Features

### 3.1 Landing Page (`/`)
- Marketing landing page with hero section, features overview, pricing, and footer
- Footer links: Features, How It Works, Pricing, Login, Privacy Policy, Terms of Service, Cookie Policy
- Waitlist signup flow (`/waitlist`)

### 3.2 Authentication (`/auth`)
- Email/password authentication via Supabase Auth
- Protected routes redirect unauthenticated users to `/auth`
- Open access: anyone can create an account and access the platform immediately

### 3.3 Dashboard (`/dashboard`)
The main hub after login. Displays:
- **Quick Action Cards:** New Project, View Analyzed Clips, SFX Library, Voice Library, ScriptForge, Datalligence, Command Center, Templates
- **Projects Grid:** All user projects with real-time status badges (draft, processing, queued, rendering, completed, failed)
- **Real-time updates:** Supabase Realtime subscription on the `projects` table — status and progress update live without page refresh
- **Invitation Banner:** Displays pending team invitations

### 3.4 Project Editor (`/project/:projectId`)
The most feature-rich page in the platform. Organized into tabs:

#### Tab: Generate
- **Prompt field:** Free-text prompt describing the video content
- **Script generation:** AI generates a script based on the prompt, project gamemode, and training data from ScriptForge
- **Target script length:** Configurable (slider, in seconds)
- **Video upload:** Drag-and-drop or file picker for raw gameplay clips (MP4, MOV, WebM, up to 2GB each)
- **Voiceover upload:** Upload custom voiceover audio files
- **Resumable uploads:** TUS protocol with pause/resume, progress tracking, and auto-commit to database on completion
- **Generate button:** Triggers the full AI pipeline (script → voiceover → render)
- **Lab Mode:** Batch video generation (generates multiple video variants at once)
- **Creative Mode:** Enables AI to make more experimental creative decisions
- **Real-time render progress:** Live progress bar and ETA display, driven by Supabase Realtime
- **Video preview:** Inline video player for completed renders
- **Download button:** Direct download of the rendered MP4
- **Browser notifications:** Push notification when video render completes

#### Tab: Settings
- **Project title editor:** Inline editable title
- **Aspect ratio:** 9:16 (vertical/TikTok), 16:9 (landscape/YouTube), 1:1 (square)
- **Voice configurator:** Select from custom voices in the Voice Library
- **Discord webhook:** Configure a Discord webhook URL for notifications
- **YouTube post delay:** Set a delay (in minutes) before auto-posting to YouTube after render

#### Tab: Subtitle Style
Full subtitle customization with live preview:
- **Style presets:** static, animated, word-by-word, karaoke, bounce, etc.
- **Font family:** Selectable from curated list
- **Font size:** Slider control
- **Text color:** Color picker
- **Stroke:** Enable/disable, color, width
- **Shadow:** Enable/disable, opacity, blur, distance
- **Glow:** Enable/disable, color, intensity, size
- **Transition animation:** Fade, slide, bounce, etc.
- **SFX on subtitle:** Attach a sound effect from the SFX Library to play on each subtitle word/phrase
- **SFX volume:** Volume slider
- **Visual Mode:** Enables visual subtitle effects
- **Creative Mode:** AI-driven subtitle creativity

#### Tab: Beginning Effect
- **Enable/disable** a custom intro effect at the start of the video
- **Image upload:** Custom intro image/logo
- **SFX attachment:** Sound effect to play at the beginning

#### Tab: IP Pop-up
Highly configurable Minecraft server IP overlay:
- **Enable/disable** the pop-up
- **Text configuration:** Custom text content, font, size, color, position, animation
- **Image 1 & Image 2:** Two configurable image slots (e.g., server logo, background)
- **Position:** X/Y coordinates, anchor point
- **Timing:** When the pop-up appears and disappears in the video
- **Animation:** Entrance/exit animation style

#### Tab: End Screen
- **Enable/disable** end screen
- **Blur effect:** Option to blur the background video during end screen
- **IP text:** Server IP displayed on end screen
- **IP settings:** Font, size, color, position
- **Logo:** Upload a logo image for the end screen

#### Tab: Music
- **Enable/disable** background music
- **Music selection:** Choose from uploaded tracks in the music library
- **Volume:** Volume slider
- **Start time:** Offset (in seconds) for when music begins

#### Tab: YouTube Auto-Post
Multi-account YouTube management:
- **Connect multiple YouTube channels** via OAuth 2.0
- **Per-account settings:** Channel name, custom title template, custom description, tags, category, privacy (public/private/unlisted), made-for-kids flag
- **Enable/disable** per account
- **Cooldown:** Configurable posting cooldown per account
- **Scheduled posting:** Posts are queued with a configurable delay
- **Warmup mode:** Gradual posting schedule for new accounts

#### Tab: TikTok Auto-Post
Multi-account TikTok management:
- **Connect multiple TikTok accounts** via OAuth 2.0 (TikTok API v2)
- **Per-account settings:** Display name, avatar, privacy (public/friends/private), enable/disable
- **Auto-post trigger:** Automatically uploads to TikTok when a video render completes

#### Tab: Team / Invitations
- **Invite users** to collaborate on the project
- **Role-based access:** Manage who can view or edit the project

---

### 3.5 ScriptForge (`/scriptforge`)
The AI scriptwriter training system. Three tabs:

#### Gamemodes
- Create and manage **Gamemodes** (e.g., "Lifesteal SMP", "Bedwars", "Survival")
- Each gamemode has a name and description that contextualizes the AI's script generation
- Gamemodes are used across the entire platform to segment content and analytics

#### Training Scripts
- Add individual TikTok video URLs as training examples
- **Import Account:** Import all videos from a TikTok account to use as training data
- The `transcribe-training-script` Edge Function transcribes the audio and stores the script text
- The AI learns writing style, hooks, CTAs, and pacing from these examples
- Scripts are tagged to a specific Gamemode

#### Competitors
- Add competitor YouTube/TikTok channels to monitor
- The `scrape-competitor-channel` Edge Function fetches their video data
- Used to generate **Competitor Intelligence Reports** in the Data Center

---

### 3.6 Data Center (`/data-center`)
The performance intelligence hub. Displays:

#### Overview Stats
- Total videos analyzed
- Average performance score (composite of hook, CTA, and editing style scores)
- Total gamemodes
- Total YouTube views
- Total YouTube likes
- Total watch time (hours)

#### Performance by Gamemode
Each gamemode card shows:
- Best hook text and score
- Best CTA text and score
- Best editing style and score
- Total videos analyzed for that gamemode
- Average scores across all metrics
- AI-generated patterns and recommendations

#### AI Decision Feed
- Real-time feed of autonomous AI decisions made by the system
- Decisions include: "Changed posting time based on peak hour data", "Updated script style based on retention analysis", etc.

#### Weekly Reports
- Automatically generated weekly performance summaries per gamemode
- Metrics: videos analyzed, average retention %, AI recommendations
- One-click "Apply Recommendations" to update project settings

#### Competitor Intelligence Reports
- Weekly reports on competitor channels
- Data: competitors analyzed, videos analyzed, trending topics, content gaps, recommended scripts

#### A/B Tests
- Track active A/B tests comparing different hooks, CTAs, or editing styles
- Results show which variant performed better

#### AI Autonomy Settings (per gamemode)
- Configure how much autonomy the AI has to make decisions automatically
- Toggle: auto-apply weekly report recommendations, auto-adjust posting schedule, etc.

#### Sync Analytics
- Manual trigger to sync YouTube analytics data via `sync-youtube-analytics` Edge Function

---

### 3.7 Datalligence (`/datalligence`)
A **Bloomberg Terminal-style analytics dashboard** for deep data exploration.

#### Layout
- **Header:** View mode selector, date range picker, refresh button, add widget button
- **Metric Sidebar:** Draggable metric tiles organized by category
- **Main Canvas:** Drag-and-drop widget grid

#### View Modes
- **Global:** All videos across all projects
- **By Project:** Filter to a specific project
- **By Gamemode:** Filter to a specific gamemode

#### KPI Cards (always visible)
- Total Views
- Average Retention %
- Subscribers Gained
- Active Videos count

#### Widget System
- Add unlimited chart widgets to the canvas
- **Drag metrics from sidebar** onto the canvas to create new charts
- **Drag metrics onto existing charts** to overlay/merge data
- Each widget is configurable: title, chart type, metrics displayed
- Remove individual widgets

#### Chart Types
- Line chart (time series)
- Area chart (time series)
- Bar chart (comparison)
- Horizontal bar chart
- Stacked bar chart
- Grouped bar chart
- Scatter plot
- Treemap
- Pie chart
- Donut chart

#### Available Metrics (40+)
**Raw Metrics:**
- Views, Likes, Comments, Dislikes, Shares, Favorites, Impressions, Watch Time

**Engagement:**
- Subscribers Gained/Lost, Engaged Views, Completed Views, Avg View %, Avg View Duration, Impressions CTR, Click Through Rate

**Ratios:**
- Like/View, Comment/View, Favorite/View, Comment/Like, Engaged/View

**Growth (Snapshot Deltas):**
- Δ Views, Δ Likes, Δ Comments, Δ Subscribers

**RCCLO / Cognitive:**
- Retention Score, Cognitive Score, Predicted Retention Score, Cut Frequency, Words/Second

**Channel-Level:**
- Total Channel Views, Total Subscribers, Unique Viewers, View Growth %, Sub Growth %

**Context:**
- Peak Hour, Traffic Sources, Performance Stage

---

### 3.8 Command Center (`/command-center`)
**Admin-only** AI control panel (restricted to a single admin email).

- **Project sidebar:** Select any project to give it context
- **AI chat interface:** Streaming chat with an AI assistant (`admin-command-chat` Edge Function)
- **Capabilities:**
  - Generate videos for a project ("Generate 5 videos and post to Discord")
  - Update project settings ("Change the description to: New Lifesteal SMP")
  - Check render status ("What's the current render status?")
  - Generate scripts ("Write a script about PvP highlights")
  - Send Discord notifications
- **Real-time project status:** Live updates in the sidebar as projects change status
- **Streaming responses:** AI responses stream token-by-token

---

### 3.9 Voice Library (`/voice-library`)
Manage custom AI voices powered by ElevenLabs.

- **Voice categories:** Generated, Cloned, Premade
- **Design Voice:** Create a new voice from text parameters (gender, age, accent, style) via the `save-voice-design` Edge Function
- **Clone Voice:** Upload audio samples to clone a real voice via the `clone-voice` Edge Function
- **Preview:** Play a preview audio clip for each voice
- **Delete:** Remove voices from the library
- Voices are stored in the `voices` table and can be selected per-project in the Project Editor

---

### 3.10 SFX Library (`/sfx-library`)
Manage transition sound effects used in video rendering.

- Upload MP3/WAV audio files with name and description
- Preview any SFX in-browser
- Delete SFX
- SFX are stored in the `sfx_library` table and can be attached to subtitle events or beginning effects
- Duration is auto-detected on upload

---

### 3.11 Clips Factory (`/clips-factory`)
Manage the shared **clip pool** used for automated video generation.

- **Upload clips** (MP4, MOV, WebM) with metadata:
  - **Gamemode:** Which gamemode the clip belongs to (or "Global" for all)
  - **Category:** Gameplay, Transition, B-Roll
  - **Intensity:** Low (calm/intro), Medium (regular gameplay), High (action/excitement)
- **Bulk upload:** Select multiple files at once
- **Filter clips:** By gamemode, category, and intensity
- **Preview:** Play any clip in-browser
- **Edit metadata:** Change intensity or category inline
- **Usage tracking:** `used_count` field tracks how many times each clip has been used in renders
- **Stats:** Total clips, total duration, clips by intensity level
- Clips are stored in the `clip_pool` table and automatically selected by the AI during video generation based on intensity matching

---

### 3.12 Imports / Analyzed Clips (`/imports`)
- Browse the library of analyzed video clips
- View clips that have been processed and are ready for use

---

### 3.13 Invitations (`/invitations`)
- View and manage pending team invitations
- Accept or decline invitations to collaborate on projects

---

### 3.14 Analytics Dashboard (`/analytics`)
- Supplementary analytics view (separate from Datalligence)
- High-level channel performance overview

---

## 4. Backend: Edge Functions (43 Total)

### 4.1 Video Generation Pipeline

| Function | Description |
|---|---|
| `process-video` | **Core orchestrator.** Generates AI script, creates voiceover via ElevenLabs, builds the FFmpeg render payload (clips, audio, subtitles, effects), inserts into `render_queue` |
| `generate-script-voiceover` | Generates a script using AI (with gamemode context and training data) and synthesizes voiceover audio via ElevenLabs |
| `worker-api` | API for the GPU worker: claim jobs, report progress, complete jobs, fail jobs, get upload URLs. On job completion: triggers YouTube upload, TikTok upload, sends Discord notification |
| `generate-lab-videos` | Batch video generation — creates multiple video variants for a project simultaneously |
| `process-batch-job` | Processes a single batch job item from the lab generation queue |
| `recover-batch-jobs` | Recovers stuck or failed batch jobs |
| `check-render-status` | Polls the render queue for job status updates |
| `commit-project-uploads` | Links uploaded files (videos, voiceovers) to a project in the database after TUS upload completes |

### 4.2 YouTube Integration

| Function | Description |
|---|---|
| `youtube-oauth-start` | Initiates YouTube OAuth 2.0 flow, redirects to Google consent screen |
| `youtube-oauth-callback` | Handles OAuth callback, exchanges code for tokens, stores in `youtube_accounts` |
| `youtube-upload` | Uploads a rendered video to YouTube with metadata (title, description, tags, privacy). Handles token refresh. Supports scheduled posting via `youtube_post_queue` |
| `process-youtube-queue` | Processes pending items in `youtube_post_queue` — handles scheduled/delayed uploads |
| `sync-youtube-analytics` | Syncs YouTube analytics for all tracked videos (views, likes, comments, watch time, etc.) into `video_performance` and `video_analytics_snapshots` |
| `sync-channel-analytics` | Syncs channel-level analytics (total views, subscribers, unique viewers) into `channel_analytics_snapshots` |
| `warmup-youtube-accounts` | Manages gradual posting schedules for new YouTube accounts to avoid spam detection |

### 4.3 TikTok Integration

| Function | Description |
|---|---|
| `tiktok-oauth-start` | Initiates TikTok OAuth 2.0 flow (Login Kit + Video Kit scopes) |
| `tiktok-oauth-callback` | Handles callback, exchanges code for tokens, fetches user info, stores in `tiktok_accounts` |
| `tiktok-upload` | Uploads a rendered video to TikTok using the two-step FILE_UPLOAD method (init → PUT). Handles token refresh |
| `process-tiktok-queue` | Processes pending items in `tiktok_post_queue` — handles scheduled/delayed TikTok uploads |
| `fetch-tiktok-data` | Fetches data from TikTok accounts (videos, analytics) |
| `import-tiktok-account` | Imports a TikTok account's videos as training scripts for ScriptForge |

### 4.4 Analytics & Intelligence

| Function | Description |
|---|---|
| `calculate-scores` | Calculates performance scores (hook score, CTA score, editing style score) for videos |
| `compute-vqi` | Computes the Video Quality Index (VQI) — a composite performance metric |
| `compute-cognitive-model` | Runs the cognitive model on video features to predict retention |
| `extract-cognitive-features` | Extracts cognitive features from a video (clip count, avg clip duration, cut frequency, subtitle words/second) |
| `analyze-video` | Analyzes an uploaded video for metadata, duration, and content features |
| `analyze-sentence-boundaries` | Analyzes subtitle text to find optimal sentence break points |
| `transcribe-audio` | Transcribes audio files to text using AI |
| `transcribe-training-script` | Transcribes a TikTok training video's audio and stores the script |
| `generate-weekly-report` | Generates a weekly performance report per gamemode with AI recommendations |
| `generate-competitor-report` | Generates a competitor intelligence report by analyzing competitor channels |
| `scrape-competitor-channel` | Scrapes a competitor YouTube/TikTok channel for video data |
| `update-project-brain` | Updates the AI "brain" for a project with new performance data and insights |
| `autonomous-decision-engine` | Makes autonomous AI decisions (e.g., adjust posting time, change script style) based on performance data |
| `apply-report-settings` | Applies recommendations from a weekly report to project settings |

### 4.5 Voice & Audio

| Function | Description |
|---|---|
| `clone-voice` | Clones a voice using ElevenLabs Voice Cloning API from uploaded audio samples |
| `save-voice-design` | Creates a new AI voice using ElevenLabs Voice Design API from text parameters |
| `generate-voice-sample` | Generates a sample audio clip for a voice design preview |
| `generate-sfx` | Generates sound effects using AI |

### 4.6 AI Assistants

| Function | Description |
|---|---|
| `admin-command-chat` | Streaming AI chat for the Command Center. Has access to project data and can trigger actions (generate videos, send Discord messages, update settings) |
| `dev-assistant-chat` | Developer assistant chat for internal debugging and development help |
| `github-repo-reader` | Reads GitHub repository content for the dev assistant |

### 4.7 Utilities

| Function | Description |
|---|---|
| `generate-spy-videos` | Generates "spy" video variants for competitive analysis |

---

## 5. Database Schema

### Core Tables

| Table | Description |
|---|---|
| `projects` | Core project record. Stores all settings as JSONB columns |
| `videos` | Raw gameplay clips linked to a project |
| `voiceovers` | Voiceover audio files linked to a project |
| `render_queue` | Job queue for the GPU worker |
| `gamemodes` | User-defined content categories |
| `clip_pool` | Shared video clip library for automated generation |
| `sfx_library` | Sound effects library |
| `voices` | Custom AI voices (ElevenLabs) |

### Analytics Tables

| Table | Description |
|---|---|
| `video_performance` | Per-video YouTube analytics (views, likes, comments, watch time, CTR, etc.) |
| `video_analytics_snapshots` | Time-series snapshots of video performance (delta tracking) |
| `channel_analytics_snapshots` | Time-series snapshots of channel-level metrics |
| `video_cognitive_features` | Cognitive/structural features extracted from each video |
| `gamemode_insights` | Aggregated best-performing hooks, CTAs, and editing styles per gamemode |
| `weekly_reports` | Auto-generated weekly performance reports |
| `competitor_reports` | Competitor intelligence reports |
| `ab_tests` | A/B test records and results |

### Training & Intelligence Tables

| Table | Description |
|---|---|
| `training_scripts` | Transcribed scripts from TikTok training videos |
| `competitors` | Tracked competitor channels |

### Social Publishing Tables

| Table | Description |
|---|---|
| `youtube_accounts` | Connected YouTube channels with OAuth tokens and posting settings |
| `youtube_post_queue` | Queue for scheduled YouTube video uploads |
| `tiktok_accounts` | Connected TikTok accounts with OAuth tokens and posting settings |
| `tiktok_post_queue` | Queue for scheduled TikTok video uploads |

### Access Control Tables

| Table | Description |
|---|---|
| `invitations` | Team invitations to projects |
| `project_members` | Project membership and roles |

---

## 6. Data Tracked Per Video

When a video is published and analytics are synced, the following data points are tracked:

### YouTube Raw Metrics
- `youtube_views` — Total view count
- `youtube_likes` — Total likes
- `youtube_dislikes` — Total dislikes
- `youtube_comments` — Total comments
- `youtube_favorites` — Total favorites
- `youtube_shares` — Total shares
- `youtube_subscribers_gained` — Subscribers gained from this video
- `youtube_subscribers_lost` — Subscribers lost from this video
- `youtube_impressions` — Total impressions
- `youtube_impressions_ctr` — Impressions click-through rate
- `youtube_watch_time_seconds` — Total watch time in seconds
- `youtube_avg_view_duration_seconds` — Average view duration
- `youtube_avg_view_percentage` — Average view percentage (retention)
- `youtube_engaged_views` — Views with engagement actions
- `youtube_completed_views` — Views that watched to completion
- `youtube_peak_hour` — Hour of day with most views
- `youtube_traffic_sources` — Traffic source breakdown (JSON)
- `youtube_click_through_rate` — Overall CTR

### Computed Ratios
- `ratio_like_to_view` — Like rate
- `ratio_comment_to_view` — Comment rate
- `ratio_favorite_to_view` — Favorite rate
- `ratio_comment_to_like` — Comment-to-like ratio
- `ratio_engaged_to_view` — Engagement rate

### AI Scores
- `hook_score` — How effective the video's opening hook is (0–100)
- `cta_score` — How effective the call-to-action is (0–100)
- `editing_style_score` — How effective the editing style is (0–100)
- `retention_score` — Predicted/actual retention score
- `cognitive_score` — Cognitive load score (how stimulating the video is)
- `predicted_retention_score` — ML-predicted retention before publishing

### Cognitive/Structural Features
- `clip_count` — Number of video clips used
- `avg_clip_duration` — Average clip length in seconds
- `total_duration` — Total video duration
- `cut_frequency` — Cuts per second
- `subtitle_words_per_second` — Subtitle reading speed
- `predicted_high_tier_prob` — Probability of being a top-performing video

### Time-Series Snapshots (tracked over time)
- `views`, `likes`, `comments`, `shares`, `dislikes`
- `subscribers_gained`, `impressions`, `watch_time_seconds`
- `avg_view_percentage`, `engaged_views`, `completed_views`
- `delta_views`, `delta_likes`, `delta_comments` — Change since last snapshot
- `hours_since_publish` — Age of video at snapshot time
- `performance_stage` — Lifecycle stage (launch, growth, plateau, decline)

### Channel-Level Snapshots
- `total_views`, `total_subscribers`, `total_videos`
- `unique_viewers`
- `delta_views`, `delta_subscribers`
- `growth_rate_views`, `growth_rate_subscribers`

---

## 7. Video Generation Pipeline (End-to-End)

1. **User triggers generation** in the Project Editor (Generate tab)
2. **`process-video`** Edge Function is invoked:
   - Fetches project settings (gamemode, subtitle style, music, effects, voice, etc.)
   - Calls `generate-script-voiceover` to generate a script using AI (with training data context) and synthesize voiceover via ElevenLabs
   - Selects clips from the `clip_pool` based on gamemode and intensity matching
   - Builds a complete FFmpeg render payload including:
     - Video clips with zoom animations (ease-out, full clip duration)
     - Voiceover audio track
     - Background music (if enabled)
     - Subtitle overlay (with all style settings: font, color, stroke, shadow, glow, animation)
     - Beginning effect (if enabled)
     - IP Pop-up overlay (if enabled)
     - End screen (if enabled)
   - Inserts job into `render_queue` with status `pending`
   - Updates project status to `queued`
3. **GPU Worker** (Hetzner server) polls `render_queue` via `worker-api`:
   - Claims the job (status → `processing`)
   - Downloads all assets (clips, voiceover, music, images)
   - Runs FFmpeg to compose the final video
   - Reports progress back to `worker-api` (updates `render_progress` on the project)
   - On completion: uploads the rendered MP4 to Supabase Storage
   - Calls `worker-api` complete endpoint with the output URL
4. **`worker-api` complete handler:**
   - Updates project status to `completed` with `output_url`
   - Checks for enabled YouTube accounts → triggers `youtube-upload`
   - Checks for enabled TikTok accounts → triggers `tiktok-upload`
   - Sends Discord webhook notification (if configured)
5. **Frontend** receives real-time update via Supabase Realtime → shows completed video, sends browser push notification

---

## 8. AI Script Generation

The script generation system uses:
- **Gamemode context:** The project's assigned gamemode description
- **Training scripts:** Transcribed TikTok videos added in ScriptForge, filtered by gamemode
- **Competitor data:** Trending topics and content gaps from competitor reports
- **Performance data:** Best-performing hooks and CTAs from `gamemode_insights`
- **Prompt:** User-provided free-text prompt
- **Target length:** Configurable script duration (in seconds)
- **Forbidden phrases:** Post-generation sanitizer removes blacklisted phrases (e.g., "You won't believe what happens")

---

## 9. Multi-Platform Auto-Posting

### YouTube
- Multiple channels per project
- OAuth 2.0 with token refresh
- Configurable per-channel: title template, description, tags, category, privacy, made-for-kids
- Scheduled posting with configurable delay (minutes after render completion)
- Warmup mode for new accounts
- Queue-based processing via `process-youtube-queue`

### TikTok
- Multiple accounts per project
- OAuth 2.0 (Login Kit + Video Kit)
- Two-step upload: init → PUT (TikTok FILE_UPLOAD method)
- Privacy levels: Public, Friends Only, Private
- Token auto-refresh
- Queue-based processing via `process-tiktok-queue`

---

## 10. Access Control & Roles

- **Authentication:** Supabase Auth (email/password)
- **Row-Level Security:** All tables protected by RLS policies
- **Admin role:** Single admin email (`roliumgens@gmail.com`) with access to Command Center and all projects
- **Invitation system:** Users can be invited to collaborate on specific projects
- **Waitlist:** New users must be on the waitlist or invited to access the platform

---

## 11. Notifications

- **Browser push notifications:** Sent when video render completes (requires user permission)
- **Discord webhooks:** Per-project webhook URL; notifications sent on:
  - Video render completion
  - YouTube upload success
  - TikTok upload initiation
- **In-app toasts:** Real-time feedback for all user actions

---

## 12. Developer Tools

### Dev Assistant
- In-app AI assistant for developers (toggle in Dashboard header)
- Powered by `dev-assistant-chat` Edge Function
- Can read GitHub repository content via `github-repo-reader`
- Helps with debugging, code questions, and feature implementation

### Storage Limits
- Per-file upload limit: 2GB
- Storage limit warning component displayed when approaching limits

---

## 13. Legal Pages

| Page | URL |
|---|---|
| Privacy Policy | `/privacy-policy` |
| Terms of Service | `/terms` |
| Cookie Policy | `/cookies` (linked in footer) |

---

*Last updated: February 18, 2026*
