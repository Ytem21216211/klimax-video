import argparse
import json
import chromadb
from sentence_transformers import SentenceTransformer
import torch
import sys

class VideoSearcher:
    def __init__(self, db_path="video_db", model_name="clip-ViT-B-32"):
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        
        # Load CLIP model (same as processor)
        self.model = SentenceTransformer(model_name, device=self.device)
        
        # Initialize ChromaDB
        self.chroma_client = chromadb.PersistentClient(path=db_path)
        try:
            self.collection = self.chroma_client.get_collection(name="video_frames")
        except:
            # Create a mock or handle empty case if needed, but usually it should exist if indexed
            self.collection = None

    def search(self, query, top_k=5):
        if not self.collection:
            return {"ids": [[]], "metadatas": [[]], "distances": [[]]}
            
        # Embed query
        query_embedding = self.model.encode([query], convert_to_numpy=True).tolist()
        
        # Search in ChromaDB
        results = self.collection.query(
            query_embeddings=query_embedding,
            n_results=top_k
        )
        
        return results

def format_timestamp(seconds):
    mins = int(seconds // 60)
    secs = int(seconds % 60)
    return f"{mins:02d}:{secs:02d}"

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Search for video clips using text queries.")
    parser.add_argument("--query", type=str, required=True, help="Search query (text)")
    parser.add_argument("--limit", type=int, default=5, help="Number of results to return")
    parser.add_argument("--db_path", type=str, default="video_db", help="Path to ChromaDB persistent storage")
    parser.add_argument("--json", action="store_true", help="Output results in JSON format")
    
    args = parser.parse_args()
    
    searcher = VideoSearcher(db_path=args.db_path)
    results = searcher.search(args.query, top_k=args.limit)
    
    if args.json:
        output_results = []
        for i in range(len(results['ids'][0])):
            metadata = results['metadatas'][0][i]
            distance = results['distances'][0][i]
            output_results.append({
                "score": 1 - distance,
                "timestamp": metadata['timestamp'],
                "clip_id": metadata['clip_id'],
                "video_path": metadata['video_path'],
                "formatted_time": format_timestamp(metadata['timestamp'])
            })
        print(json.dumps(output_results))
    else:
        print(f"\nTop results for: '{args.query}'")
        print("-" * 50)
        
        for i in range(len(results['ids'][0])):
            res_id = results['ids'][0][i]
            metadata = results['metadatas'][0][i]
            distance = results['distances'][0][i]
            
            timestamp = metadata['timestamp']
            clip_id = metadata['clip_id']
            similarity = 1 - distance
            
            print(f"[{i+1}] Score: {similarity:.4f} | Time: {format_timestamp(timestamp)} (s: {timestamp}) | Clip: {clip_id}")
            print(f"    FFmpeg slice command: ffmpeg -ss {timestamp} -i \"{metadata['video_path']}\" -t 5 -c copy output_clip_{i}.mp4")
            print("-" * 50)

