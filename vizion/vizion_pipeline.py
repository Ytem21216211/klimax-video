import os
import cv2
import json
import logging
import numpy as np
from pathlib import Path
from scenedetect import detect, ContentDetector
import easyocr
from openai import OpenAI
from dotenv import load_dotenv
from typing import List, Dict, Any, Optional

# Setup Logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Load .env (for OPENAI_API_KEY)
load_dotenv()

# Initialize EasyOCR Reader (using English)
try:
    reader = easyocr.Reader(['en'], gpu=True)
    logger.info("EasyOCR initialized with GPU.")
except Exception as e:
    logger.warning(f"Failed to initialize EasyOCR with GPU. Falling back to CPU. Error: {e}")
    reader = easyocr.Reader(['en'], gpu=False)

# Initialize OpenAI
client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))

# Paths
BASE_DIR = Path(__file__).parent
INPUT_DIR = BASE_DIR / "vizion_input"
OUTPUT_JSON = BASE_DIR / "MineCaption_Preset.json"

# --- STEP 1: Pacing Engine ---
def extract_pacing(video_path: str) -> Optional[Dict[str, float]]:
    """Calculates average clip duration in seconds by detecting hard cuts."""
    try:
        logger.info(f"Extracting pacing from {video_path}")
        scene_list = detect(video_path, ContentDetector())
        if not scene_list:
            return None
        
        durations = [(scene[1].get_frames() - scene[0].get_frames()) / scene[0].get_framerate() for scene in scene_list]
        avg_duration = sum(durations) / len(durations)
        return {"avg_duration": float(avg_duration)}
    except Exception as e:
        logger.error(f"Error extracting pacing: {e}")
        return None

# --- STEP 2: Motion Tracker / Optical Flow ---
def extract_zoom_physics(video_path: str) -> Optional[float]:
    """Calculates radial velocity of the center 50% to determine zoom scale."""
    try:
        logger.info(f"Extracting zoom physics from {video_path}")
        cap = cv2.VideoCapture(video_path)
        ret, prev_frame = cap.read()
        if not ret: return None

        h, w = prev_frame.shape[:2]
        # Crop to center 50% to avoid edge artifacts/borders
        ch_start, ch_end = int(h*0.25), int(h*0.75)
        cw_start, cw_end = int(w*0.25), int(w*0.75)
        
        prev_gray = cv2.cvtColor(prev_frame[ch_start:ch_end, cw_start:cw_end], cv2.COLOR_BGR2GRAY)
        
        total_zoom_factor = 0.0
        frame_count = 0

        center_y, center_x = (ch_end - ch_start) / 2, (cw_end - cw_start) / 2
        y_grid, x_grid = np.mgrid[0:(ch_end-ch_start), 0:(cw_end-cw_start)]
        y_vectors = y_grid - center_y
        x_vectors = x_grid - center_x
        norms = np.sqrt(x_vectors**2 + y_vectors**2)
        norms[norms == 0] = 1 # avoid division by zero
        
        # Unit vectors pointing radially outward from center
        unit_u = x_vectors / norms
        unit_v = y_vectors / norms

        while True:
            ret, frame = cap.read()
            if not ret: break

            gray = cv2.cvtColor(frame[ch_start:ch_end, cw_start:cw_end], cv2.COLOR_BGR2GRAY)
            flow = cv2.calcOpticalFlowFarneback(prev_gray, gray, None, 0.5, 3, 15, 3, 5, 1.2, 0)
            
            # Flow arrays
            flow_u = flow[..., 0]
            flow_v = flow[..., 1]

            # Dot product of flow vectors with radial unit vectors to find expansion/contraction
            radial_flow = (flow_u * unit_u) + (flow_v * unit_v)
            
            # Average radial expansion (+ is zoom in, - is zoom out)
            avg_expansion = np.mean(radial_flow)
            
            # Accumulate scale multiplier (simplified assumption for overall scale)
            # A scale > 1 means zooming in.
            scale_diff = 1.0 + (avg_expansion / 100.0) # Arbitrary scaling factor for stable float representation
            total_zoom_factor += scale_diff

            prev_gray = gray
            frame_count += 1
            
            # Subsample frames to speed up processing
            cap.set(cv2.CAP_PROP_POS_FRAMES, cap.get(cv2.CAP_PROP_POS_FRAMES) + 4)

        cap.release()
        
        if frame_count == 0: return None
        avg_zoom = total_zoom_factor / frame_count
        return min(max(float(avg_zoom), 0.5), 2.0) # Clamp between highly unreasonable values
    except Exception as e:
        logger.error(f"Error extracting zoom physics: {e}")
        return None

# --- STEP 3: Typography & Contour Math ---
def rgb_to_hex(r: int, g: int, b: int) -> str:
    return "#{:02x}{:02x}{:02x}".format(r, g, b).upper()

def extract_typography(video_path: str) -> Optional[Dict[str, Any]]:
    """Extracts font/stroke colors, stroke thickness, and Y-position from 5 random frames."""
    try:
        logger.info(f"Extracting typography from {video_path}")
        cap = cv2.VideoCapture(video_path)
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        if total_frames < 5: return None
        
        # Pick 5 equidistant frames
        target_frames = np.linspace(total_frames * 0.1, total_frames * 0.9, 5, dtype=int)
        
        metrics = []

        for f_idx in target_frames:
            cap.set(cv2.CAP_PROP_POS_FRAMES, f_idx)
            ret, frame = cap.read()
            if not ret: continue

            h, w = frame.shape[:2]
            
            # Detect text with EasyOCR
            results = reader.readtext(frame)
            if not results: continue
            
            # Process largest text block (assuming bounds are [ [tl, tr, br, bl], text, conf ])
            largest_box = max(results, key=lambda x: cv2.contourArea(np.array(x[0], dtype=np.float32)))
            bbox = np.array(largest_box[0]).astype(int)
            
            # Safely clamp coordinates
            tl, br = bbox[0], bbox[2]
            y1, y2 = max(0, tl[1]), min(h, br[1])
            x1, x2 = max(0, tl[0]), min(w, br[2])
            
            if (y2 - y1) < 10 or (x2 - x1) < 10: continue

            text_roi = frame[y1:y2, x1:x2]
            
            # 1. K-Means to find Top 2 Colors (Background/Stroke vs Font)
            pixels = text_roi.reshape((-1, 3)).astype(np.float32)
            criteria = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 10, 1.0)
            k = 3 # Assume: Text, Stroke, and generic Background
            _, labels, centers = cv2.kmeans(pixels, k, None, criteria, 10, cv2.KMEANS_RANDOM_CENTERS)
            centers = np.uint8(centers)
            
            # Count label frequencies
            counts = np.bincount(labels.flatten())
            sorted_indices = np.argsort(counts)[::-1]
            
            # Simplistic heuristic: Most frequent is bg/stroke, second most is usually text in a tight crop.
            if len(sorted_indices) >= 2:
                # Need to convert BGR to RGB for accurate hex
                stroke_bgr = centers[sorted_indices[0]]
                font_bgr = centers[sorted_indices[1]]
                stroke_hex = rgb_to_hex(stroke_bgr[2], stroke_bgr[1], stroke_bgr[0])
                font_hex = rgb_to_hex(font_bgr[2], font_bgr[1], font_bgr[0])
            else:
                continue

            # 2. Canny Edge for Stroke Thickness Estimate
            gray_roi = cv2.cvtColor(text_roi, cv2.COLOR_BGR2GRAY)
            edges = cv2.Canny(gray_roi, 50, 150)
            # Find contours on edges to estimate thickness
            contours, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            if contours:
                avg_contour_area = np.mean([cv2.contourArea(c) for c in contours])
                # Rough heuristic: percentage of height
                box_height = y2 - y1
                thickness_pct = (np.sqrt(avg_contour_area) / box_height) * 100.0 if box_height > 0 else 0
            else:
                thickness_pct = 0.0

            # 3. Y-Position Percentage (Center of BBox)
            center_y = (y1 + y2) / 2
            y_percent = (center_y / h) * 100

            metrics.append({
                "font_hex": font_hex,
                "stroke_hex": stroke_hex,
                "stroke_thickness": min(float(thickness_pct), 30.0), # cap at 30%
                "y_percent": float(y_percent)
            })

        cap.release()
        
        if not metrics: return None

        # Return the median of the 5 frames
        return {
            "font_hex": metrics[0]["font_hex"], # Median color representation is tricky, take first successful
            "stroke_hex": metrics[0]["stroke_hex"],
            "stroke_thickness": np.median([m["stroke_thickness"] for m in metrics]),
            "y_percent": np.median([m["y_percent"] for m in metrics])
        }

    except Exception as e:
        logger.error(f"Error extracting typography: {e}")
        return None

# --- STEP 4: Aggregation Engine ---
def remove_outliers(data: List[float], m: float = 2.0) -> List[float]:
    """Removes standard deviation outliers."""
    d = np.abs(data - np.median(data))
    mdev = np.median(d)
    s = d / (mdev if mdev else 1.)
    return [val for val, s_val in zip(data, s) if s_val < m]

def aggregate_math(input_dir: Path) -> Dict[str, Any]:
    """Loops through all MP4s and aggregates strict mathematical median/averages."""
    mp4_files = list(input_dir.glob("*.mp4"))
    if not mp4_files:
        logger.warning(f"No MP4 files found in {input_dir}")
        return {}

    logger.info(f"Found {len(mp4_files)} videos. Beginning extraction pipeline...")

    all_pacing = []
    all_zoom = []
    all_typo = []

    for idx, video in enumerate(mp4_files):
        logger.info(f"[{idx+1}/{len(mp4_files)}] Processing {video.name}...")
        
        pacing = extract_pacing(str(video))
        if pacing: all_pacing.append(pacing["avg_duration"])

        zoom = extract_zoom_physics(str(video))
        if zoom: all_zoom.append(zoom)

        typo = extract_typography(str(video))
        if typo: all_typo.append(typo)

    logger.info("Aggregating metrics and removing outliers...")
    
    # Safely aggregate
    final_pacing = np.median(remove_outliers(all_pacing)) if all_pacing else 1.5
    final_zoom = np.median(remove_outliers(all_zoom)) if all_zoom else 1.0
    final_y_pct = np.median(remove_outliers([t["y_percent"] for t in all_typo])) if all_typo else 75.0
    final_stroke = np.median(remove_outliers([t["stroke_thickness"] for t in all_typo])) if all_typo else 8.5
    
    # Take the most common hex code mode
    if all_typo:
        fonts = [t["font_hex"] for t in all_typo]
        strokes = [t["stroke_hex"] for t in all_typo]
        best_font = max(set(fonts), key=fonts.count)
        best_stroke = max(set(strokes), key=strokes.count)
    else:
        best_font = "#FFFFFF"
        best_stroke = "#000000"

    aggregated_data = {
        "pacing": {"average_clip_duration_seconds": float(final_pacing)},
        "visuals": {"zoom_velocity_scale": float(final_zoom)},
        "typography": {
            "font_hex": best_font,
            "stroke_hex": best_stroke,
            "stroke_thickness_percent": float(final_stroke),
            "y_position_percent": float(final_y_pct)
        }
    }
    
    logger.info(f"Aggregated Data Dictionary: {aggregated_data}")
    return aggregated_data

# --- STEP 5: LLM Synthesizer ---
def generate_json_preset(aggregated_data: Dict[str, Any], output_path: Path):
    """Sends raw extracted math to OpenAI to map strictly to the target JSON schema."""
    if not aggregated_data:
        logger.error("No aggregated data to send to LLM. Aborting.")
        return

    logger.info("Triggering LLM Synthesizer...")
    
    system_prompt = """You are an expert video editor and JSON architect. I have extracted raw computer vision math from a series of viral reference videos.
    You must map this data STRICTLY into the provided JSON schema representing a MineCaption editing preset. Do not include any reasoning, markdown blocking, or external text. ONLY return valid JSON.

    TARGET SCHEMA FORMAT:
    {
      "preset_name": "Extracted_Style_01",
      "pacing": {
        "average_clip_duration_seconds": float
      },
      "visuals": {
        "zoom_velocity_scale": float
      },
      "typography": {
        "font_hex": "string",
        "stroke_hex": "string",
        "stroke_thickness_percent": float,
        "y_position_percent": float
      }
    }
    """
    
    try:
        response = client.chat.completions.create(
            model="gpt-4o",
            response_format={ "type": "json_object" },
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": f"Here is the raw aggregated math dictionary: {json.dumps(aggregated_data)}"}
            ],
            temperature=0.2
        )
        
        json_output = response.choices[0].message.content
        preset_dict = json.loads(json_output)
        
        with open(output_path, "w") as f:
            json.dump(preset_dict, f, indent=4)
            
        logger.info(f"✅ Master JSON Preset successfully generated at: {output_path}")

    except Exception as e:
        logger.error(f"LLM Synthesis failed: {e}")

if __name__ == "__main__":
    if not INPUT_DIR.exists():
        INPUT_DIR.mkdir()
        logger.info(f"Created '{INPUT_DIR.name}' directory. Please drop reference MP4s here.")
    else:
        logger.info("Initializing Vizion v1 Pipeline...")
        master_data = aggregate_math(INPUT_DIR)
        generate_json_preset(master_data, OUTPUT_JSON)
