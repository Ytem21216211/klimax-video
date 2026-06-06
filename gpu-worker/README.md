# MineEdit GPU Worker

Self-hosted FFmpeg video rendering worker for MineEdit.

## Prerequisites

- Node.js 20+
- FFmpeg with NVENC support (for GPU acceleration)
- Access to Supabase project

## Installation

### 1. Install Dependencies

#### Option A: GPU (NVENC)
```bash
# Ubuntu/Debian with NVIDIA GPU
sudo apt update
sudo apt install -y nvidia-cuda-toolkit ffmpeg
ffmpeg -encoders | grep nvenc # Verify
```

#### Option B: CPU (Standard)
```bash
# Ubuntu/Debian CPU-only
sudo apt update
sudo apt install -y ffmpeg
# Run the font setup script to ensure subtitles work
chmod +x scripts/setup-fonts.sh
./scripts/setup-fonts.sh
```

### 2. Install Node.js 20

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

### 3. Clone and setup

```bash
cd /opt
git clone <your-repo> mineedit-gpu-worker
cd mineedit-gpu-worker/gpu-worker
npm install
npm run build
```

### 4. Configure environment

```bash
cp .env.example .env
nano .env
```

Fill in:
- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Service role key from Supabase dashboard
- `WORKER_ID` - Unique identifier for this worker
- `USE_NVENC` - Set to `true` if GPU available

### 5. Install PM2 and start

```bash
npm install -g pm2
pm2 start dist/index.js --name mineedit-worker
pm2 save
pm2 startup
```

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `SUPABASE_URL` | - | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | - | Service role key |
| `WORKER_ID` | `worker-{timestamp}` | Unique worker identifier |
| `POLL_INTERVAL_MS` | `5000` | How often to check for jobs (ms) |
| `MAX_CONCURRENT_JOBS` | `2` | Max parallel renders |
| `TEMP_DIR` | `/tmp/mineedit-renders` | Temporary file directory |
| `FFMPEG_PATH` | `ffmpeg` | Path to FFmpeg binary |
| `USE_NVENC` | `true` | Use GPU encoding |

## Monitoring

```bash
# View logs
pm2 logs mineedit-worker

# Check status
pm2 status

# Restart
pm2 restart mineedit-worker
```

## Architecture

```
render_queue (Supabase)
       │
       ▼ (poll every 5s)
┌──────────────────┐
│   GPU Worker     │
│                  │
│ 1. Claim job     │
│ 2. Download      │
│ 3. FFmpeg render │
│ 4. Upload        │
│ 5. Webhooks      │
└──────────────────┘
       │
       ▼
Supabase Storage (exports bucket)
```

## Scaling

To add more workers:
1. Deploy on additional servers
2. Use unique `WORKER_ID` for each
3. All workers poll the same queue atomically

## Troubleshooting

### NVENC not found
```bash
# Check NVIDIA driver
nvidia-smi

# Check FFmpeg encoders
ffmpeg -encoders 2>/dev/null | grep nvenc

# If not available, set USE_NVENC=false
```

### Permission errors
```bash
# Ensure temp directory is writable
sudo mkdir -p /tmp/mineedit-renders
sudo chmod 777 /tmp/mineedit-renders
```

### Connection issues
```bash
# Test Supabase connection
curl -H "apikey: YOUR_ANON_KEY" \
     "https://YOUR_PROJECT.supabase.co/rest/v1/"
```
