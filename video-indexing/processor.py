import os
import subprocess
import shutil
import tempfile
import torch
from PIL import Image
from sentence_transformers import SentenceTransformer
import chromadb
from tqdm import tqdm
import time
import glob
import argparse

class VideoProcessor:
    def __init__(self, db_path="video_db", model_name="clip-ViT-B-32"):
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        print(f"Using device: {self.device}")
        
        # Load CLIP model
        self.model = SentenceTransformer(model_name, device=self.device)
        
        # Initialize ChromaDB
        self.chroma_client = chromadb.PersistentClient(path=db_path)
        self.collection = self.chroma_client.get_or_create_collection(
            name="video_frames",
            metadata={"hnsw:space": "cosine"}
        )

    def extract_frames(self, video_path, tmp_dir):
        """
        Extracts 1 frame per second, downscaled to 224x224, high quality.
        """
        print(f"Extracting frames from {video_path}...")
        # Template for frame naming: frame_0001.jpg, frame_0002.jpg, etc.
        output_pattern = os.path.join(tmp_dir, "frame_%04d.jpg")
        
        command = [
            "ffmpeg",
            "-i", video_path,
            "-vf", "fps=1,scale=224:224",
            "-q:v", "2",
            output_pattern,
            "-y" # Overwrite if exists
        ]
        
        try:
            subprocess.run(command, check=True, capture_output=True)
            print("Frame extraction complete.")
        except subprocess.CalledProcessError as e:
            print(f"Error during FFmpeg extraction: {e.stderr.decode()}")
            raise

    def process_video(self, video_path, clip_id=None, batch_size=32, force=False):
        if clip_id is None:
            clip_id = os.path.basename(video_path)
            
        # Check if already indexed
        if not force:
            existing = self.collection.get(where={"clip_id": clip_id}, limit=1)
            if existing and existing['ids']:
                print(f"Video '{clip_id}' is already indexed. Use --force to re-index.")
                return

        with tempfile.TemporaryDirectory() as tmp_dir:
            self.extract_frames(video_path, tmp_dir)
            
            frame_files = sorted(glob.glob(os.path.join(tmp_dir, "frame_*.jpg")))
            if not frame_files:
                print("No frames extracted.")
                return

            print(f"Processing {len(frame_files)} frames...")
            
            embeddings = []
            metadatas = []
            ids = []
            
            # Process in batches
            for i in tqdm(range(0, len(frame_files), batch_size)):
                batch_files = frame_files[i : i + batch_size]
                batch_images = [Image.open(f) for f in batch_files]
                
                # Get embeddings
                batch_embeddings = self.model.encode(batch_images, convert_to_numpy=True)
                
                for j, frame_file in enumerate(batch_files):
                    try:
                        frame_num = int(os.path.basename(frame_file).split('_')[1].split('.')[0])
                        timestamp = frame_num - 1 # 0-indexed timestamp
                    except:
                        timestamp = i + j
                        
                    embeddings.append(batch_embeddings[j].tolist())
                    metadatas.append({
                        "clip_id": clip_id,
                        "timestamp": timestamp,
                        "video_path": video_path
                    })
                    ids.append(f"{clip_id}_{timestamp}")

            # Upsert into ChromaDB
            print(f"Indexing {len(embeddings)} frames into ChromaDB...")
            # Use upsert to handle overlays if force=True
            self.collection.upsert(
                embeddings=embeddings,
                metadatas=metadatas,
                ids=ids
            )
            print("Indexing complete.")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Process video and index frames for CLIP search.")
    parser.add_argument("--video", type=str, required=True, help="Path to video file")
    parser.add_argument("--video_id", type=str, help="Unique ID for the video (defaults to filename)")
    parser.add_argument("--db_path", type=str, default="video_db", help="Path to ChromaDB storage")
    parser.add_argument("--force", action="store_true", help="Re-index even if already exists")
    
    args = parser.parse_args()
    
    processor = VideoProcessor(db_path=args.db_path)
    processor.process_video(args.video, clip_id=args.video_id, force=args.force)

