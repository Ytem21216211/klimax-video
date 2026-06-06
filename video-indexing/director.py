import os
import argparse
import subprocess
import tempfile
import shutil
import re
from search import VideoSearcher

class VideoDirector:
    def __init__(self, db_path="video_db"):
        self.searcher = VideoSearcher(db_path=db_path)
        self.used_clips = set() # Store (clip_id, timestamp)

    def split_script_into_scenes(self, script, words_per_scene=5):
        """
        Splits a script into short scenes based on word count or punctuation.
        """
        # Clean transcript
        words = script.split()
        scenes = []
        current_scene = []
        
        for word in words:
            current_scene.append(word)
            # Split if we hit a limit or punctuation
            if len(current_scene) >= words_per_scene or word.endswith(('.', '!', '?', ',')):
                scenes.append(" ".join(current_scene))
                current_scene = []
        
        if current_scene:
            scenes.append(" ".join(current_scene))
            
        return [s for s in scenes if s.strip()]

    def assemble_video(self, script_text, audio_path, output_path, scene_duration=3):
        scenes = self.split_script_into_scenes(script_text)
        print(f"Split script into {len(scenes)} scenes.")
        
        with tempfile.TemporaryDirectory() as tmp_dir:
            clip_paths = []
            
            for i, scene in enumerate(scenes):
                print(f"Finding visual for scene {i+1}: '{scene}'")
                results = self.searcher.search(scene, top_k=10)
                
                # Find the best unused clip
                best_match = None
                for idx in range(len(results['ids'][0])):
                    metadata = results['metadatas'][0][idx]
                    clip_key = (metadata['clip_id'], metadata['timestamp'])
                    
                    if clip_key not in self.used_clips:
                        best_match = metadata
                        self.used_clips.add(clip_key)
                        break
                
                if not best_match:
                    # Fallback to first if all used (unlikely for short scripts)
                    best_match = results['metadatas'][0][0]
                
                # Generate sub-clip
                clip_filename = os.path.join(tmp_dir, f"clip_{i:04d}.mp4")
                video_source = best_match['video_path']
                start_time = best_match['timestamp']
                
                print(f"  Using: {best_match['clip_id']} at {start_time}s")
                
                # FFmpeg sub-clip extraction
                # We re-encode to ensure all clips have same resolution/framerate for concat
                # Using 720p 30fps default for the final broll consistency
                cmd = [
                    "ffmpeg",
                    "-ss", str(start_time),
                    "-t", str(scene_duration),
                    "-i", video_source,
                    "-vf", "scale=1280:720,fps=30",
                    "-c:v", "libx264",
                    "-preset", "veryfast",
                    "-an", # No audio from original video
                    clip_filename,
                    "-y"
                ]
                subprocess.run(cmd, check=True, capture_output=True)
                clip_paths.append(clip_filename)

            # Join all clips
            print("Joining clips...")
            list_file_path = os.path.join(tmp_dir, "clips.txt")
            with open(list_file_path, "w") as f:
                for cp in clip_paths:
                    # FFmpeg concat demuxer needs escaped paths
                    f.write(f"file '{os.path.abspath(cp)}'\n")
            
            temp_broll = os.path.join(tmp_dir, "broll_no_audio.mp4")
            concat_cmd = [
                "ffmpeg",
                "-f", "concat",
                "-safe", "0",
                "-i", list_file_path,
                "-c", "copy",
                temp_broll,
                "-y"
            ]
            subprocess.run(concat_cmd, check=True, capture_output=True)
            
            # Combine with audio
            print(f"Finalizing with audio: {audio_path}")
            final_cmd = [
                "ffmpeg",
                "-i", temp_broll,
                "-i", audio_path,
                "-c:v", "copy",
                "-c:a", "aac",
                "-map", "0:v:0",
                "-map", "1:a:0",
                "-shortest", # Clip to shortest stream (usually broll is slightly longer than audio)
                output_path,
                "-y"
            ]
            subprocess.run(final_cmd, check=True, capture_output=True)
            print(f"Success! Final video saved to {output_path}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Assemble Minecraft video from script and audio.")
    parser.add_argument("--script", required=True, help="Voiceover script text")
    parser.add_argument("--audio", required=True, help="Path to voiceover audio file")
    parser.add_argument("--output", default="final_video.mp4", help="Output filename")
    parser.add_argument("--db", default="video_db", help="Path to ChromaDB directory")
    
    args = parser.parse_args()
    
    director = VideoDirector(db_path=args.db)
    director.assemble_video(args.script, args.audio, args.output)
