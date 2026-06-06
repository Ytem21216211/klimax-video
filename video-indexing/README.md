# Video Indexing & Search Pipeline

A lightweight Python pipeline to index video content using CLIP (Contrastive Language-Image Pre-training) and search through it using natural language.

## Features
- **FFmpeg Integration**: Efficient frame extraction at 1fps.
- **Automated Downscaling**: Frames are resized to 224x224 during extraction for optimal CLIP performance.
- **Semantic Search**: Search for visuals using natural language (e.g., "a person jumping", "sunset over the city").
- **GPU Optimization**: Automatically uses CUDA if available, falls back to CPU.
- **Database**: Uses ChromaDB for fast vector similarity search.
- **CLI Search**: Get exact FFmpeg cut commands for matching scenes.

## Installation

1. Install FFmpeg on your system.
2. Install Python dependencies:
```bash
pip install -r requirements.txt
```

## Usage

### 1. Index a Video
Run the processor to extract frames and index them:
```bash
python processor.py "/path/to/your/video.mp4" [optional_clip_id]
```

### 2. Search for Content
Query the indexed database:
```bash
python search.py "a red car driving fast"
```
The search script will output the top matching timestamps and a ready-to-use FFmpeg command to cut that specific 5-second segment.

### 3. Assemble a Final Video (Director)
The director script automates the process of matching a script to visuals and adding a voiceover:
```bash
python director.py --script "Welcome to my Minecraft Server!" --audio "voiceover.mp3" --output "final_promo.mp4"
```
The script will:
- Split the text into scenes (4-6 words each).
- Search for the best unique visual match for each scene.
- Extract and concatenate sub-clips.
- Overlay the provided audio as the final soundtrack.

## Cleanup
The scripts automatically use temporary directories for frames and intermediate sub-clips, deleting them after processing to preserve disk space.
