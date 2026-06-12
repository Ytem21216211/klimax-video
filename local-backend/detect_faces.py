#!/usr/bin/env python3
"""Face detector for the split-screen auto-framing.

Samples a handful of frames from a video, runs the UltraFace RFB-320 ONNX model
(via onnxruntime, no heavy deps), and reports the DOMINANT (largest) face's centre
as fractions of the frame, aggregated by median across frames (robust to head
movement / a stray background face).

Usage:  detect_faces.py <videoPath> [--samples N] [--model path.onnx]
Output (one JSON line to stdout):
  {"found": true, "cx": 0.62, "cy": 0.41, "w": 0.18, "h": 0.30, "hits": 11, "samples": 12}
  {"found": false}                      (no reliable face)
  {"error": "..."}                      (could not run)
"""
import json
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_MODEL = os.path.join(HERE, "models", "ultraface-rfb-320.onnx")
IN_W, IN_H = 320, 240
CONF_THRESHOLD = 0.70


def parse_args(argv):
    path = None
    samples = 12
    model = DEFAULT_MODEL
    i = 1
    while i < len(argv):
        a = argv[i]
        if a == "--samples" and i + 1 < len(argv):
            samples = max(3, int(argv[i + 1])); i += 2
        elif a == "--model" and i + 1 < len(argv):
            model = argv[i + 1]; i += 2
        elif path is None:
            path = a; i += 1
        else:
            i += 1
    return path, samples, model


def sample_frames(path, n):
    """Decode up to n evenly-spaced RGB frames (HxWx3 uint8).

    Short files (the norm here) are decoded SEQUENTIALLY and exact evenly-spaced
    frame indices are kept: seeking is keyframe-quantised, and on a freshly x264-encoded
    file (sparse keyframes) it lands the same frame for several requested times — which
    skews the median the caller computes. Long files fall back to time-based seeks."""
    import av
    frames = []
    container = av.open(path)
    try:
        stream = container.streams.video[0]
        stream.thread_type = "AUTO"
        total = int(stream.frames or 0)
        if 0 < total <= 1200:  # ~40 s @ 30 fps: cheap to walk through
            wanted = sorted({min(total - 1, int(total * (i + 0.5) / n)) for i in range(n)})
            wi = 0
            for k, frame in enumerate(container.decode(stream)):
                if wi >= len(wanted):
                    break
                if k == wanted[wi]:
                    frames.append(frame.to_ndarray(format="rgb24"))
                    wi += 1
            return frames
        duration = 0.0
        if container.duration:
            duration = float(container.duration) / av.time_base  # microseconds base
        elif stream.duration and stream.time_base:
            duration = float(stream.duration * stream.time_base)
        times = [duration * (i + 0.5) / n for i in range(n)] if duration > 0 else [0.0]
        for t in times:
            try:
                container.seek(int(t * av.time_base), backward=True, any_frame=False)
            except Exception:
                pass
            try:
                for frame in container.decode(stream):
                    frames.append(frame.to_ndarray(format="rgb24"))
                    break
            except Exception:
                continue
        # If seeking failed entirely (some odd containers), just take the first frames.
        if not frames:
            container.seek(0)
            for k, frame in enumerate(container.decode(stream)):
                frames.append(frame.to_ndarray(format="rgb24"))
                if len(frames) >= n:
                    break
    finally:
        container.close()
    return frames


def letterbox_rgb(rgb, w, h):
    """Resize preserving aspect ratio, pad with gray. Returns (img, sx, sy, pw, ph)
    where sx/sy is the used scale area fraction and pw/ph the left/top pad fraction.

    A plain stretch-resize (the usual UltraFace preprocessing) distorts landscape and
    portrait frames DIFFERENTLY, which biases the regressed boxes by a few % of width —
    enough to visibly de-centre a face that is framed from this signal. Letterboxing
    keeps the geometry identical whatever the input aspect."""
    from PIL import Image
    ih, iw = rgb.shape[:2]
    scale = min(w / iw, h / ih)
    nw, nh = max(1, int(round(iw * scale))), max(1, int(round(ih * scale)))
    img = Image.new("RGB", (w, h), (114, 114, 114))
    img.paste(Image.fromarray(rgb).resize((nw, nh), Image.BILINEAR), ((w - nw) // 2, (h - nh) // 2))
    return np.asarray(img), nw / w, nh / h, ((w - nw) // 2) / w, ((h - nh) // 2) / h


def run_model(session, in_name, rgb):
    small, sx, sy, px, py = letterbox_rgb(rgb, IN_W, IN_H)
    blob = (small.astype(np.float32) - 127.0) / 128.0
    blob = np.transpose(blob, (2, 0, 1))[np.newaxis, :, :, :]  # 1x3xHxW
    scores, boxes = session.run(None, {in_name: blob})
    scores = scores[0]          # (N, 2)
    boxes = boxes[0]            # (N, 4) normalized x1,y1,x2,y2 in letterboxed coords
    conf = scores[:, 1]
    keep = conf > CONF_THRESHOLD
    if not np.any(keep):
        return None
    b = boxes[keep]
    c = conf[keep]
    # Dominant = largest area (the foreground speaker), tie-broken by confidence.
    areas = np.clip(b[:, 2] - b[:, 0], 0, 1) * np.clip(b[:, 3] - b[:, 1], 0, 1)
    idx = int(np.argmax(areas * 0.7 + c * 0.3))
    x1, y1, x2, y2 = [float(v) for v in b[idx]]
    # Map letterboxed coords back to source-frame fractions.
    def unx(v):
        return float(np.clip((v - px) / sx, 0.0, 1.0))
    def uny(v):
        return float(np.clip((v - py) / sy, 0.0, 1.0))
    x1, x2, y1, y2 = unx(x1), unx(x2), uny(y1), uny(y2)
    return [(x1 + x2) / 2.0, (y1 + y2) / 2.0, x2 - x1, y2 - y1]


def main():
    path, samples, model = parse_args(sys.argv)
    if not path or not os.path.exists(path):
        print(json.dumps({"error": "video not found"})); return 0
    if not os.path.exists(model):
        print(json.dumps({"error": "model not found"})); return 0
    try:
        import onnxruntime as ort
        opts = ort.SessionOptions()
        opts.log_severity_level = 3  # silence the initializer warnings
        session = ort.InferenceSession(model, sess_options=opts, providers=["CPUExecutionProvider"])
        in_name = session.get_inputs()[0].name
    except Exception as e:
        print(json.dumps({"error": "onnx init: %s" % e})); return 0

    try:
        frames = sample_frames(path, samples)
    except Exception as e:
        print(json.dumps({"error": "decode: %s" % e})); return 0

    cxs, cys, ws, hs = [], [], [], []
    for rgb in frames:
        try:
            box = run_model(session, in_name, rgb)
            # PASS 2 — refine in OUTPUT-like geometry. The regressed box shifts by a few
            # % of width depending on how large the face is in the analysed image (small
            # in a wide landscape frame, big in the final 9:16 crop). So re-detect inside
            # a 9:16 window centred on the rough face: the face now has the same relative
            # size as in the rendered output, which cancels that bias. Mapped back to
            # full-frame fractions; falls back to the rough box if the refine pass fails.
            if box:
                ih, iw = rgb.shape[:2]
                crop_w = int(round(ih * 9 / 16))
                if crop_w < iw:  # only useful when the source is wider than 9:16
                    left = int(round(box[0] * iw - crop_w / 2))
                    left = max(0, min(iw - crop_w, left))
                    sub = rgb[:, left:left + crop_w]
                    refined = run_model(session, in_name, sub)
                    if refined:
                        box = [
                            (left + refined[0] * crop_w) / iw,
                            refined[1],
                            refined[2] * crop_w / iw,
                            refined[3],
                        ]
        except Exception:
            box = None
        if box:
            cxs.append(box[0]); cys.append(box[1]); ws.append(box[2]); hs.append(box[3])

    hits = len(cxs)
    # Required hits scale with the request but never exceed what was decodable —
    # a still image (1 frame) just needs its 1 hit.
    required = min(max(2, samples // 3), max(1, len(frames)))
    if hits < required:
        print(json.dumps({"found": False, "hits": hits, "samples": samples}))
        return 0

    cx, cy = float(np.median(cxs)), float(np.median(cys))

    # CLOSED-LOOP CALIBRATION. The box regression has a small content-dependent bias
    # (e.g. heavy hair on one side pulls the box off the visible face), so a crop
    # anchored on the raw median can still sit ~5% off in the rendered output. Fix:
    # simulate the renderer's cover-fit crop around the current anchor, re-detect
    # INSIDE that crop (the same geometry the viewer sees), and shift the anchor by
    # the measured residual. Two iterations converge to a centred face by
    # construction — whatever the bias was.
    CAL_ZOOM = 1.12  # representative base zoom (variants use ~100-120%)
    for _ in range(2):
        residuals = []
        for rgb in frames:
            ih, iw = rgb.shape[:2]
            As = iw / ih
            wfrac = 1080.0 / (As * 1920.0 * CAL_ZOOM)  # crop window width, frame fraction
            hfrac = 1.0 / CAL_ZOOM
            if wfrac >= 1.0:
                continue  # no horizontal overscan to recentre with
            wcx = min(1.0 - wfrac / 2, max(wfrac / 2, cx))
            wcy = min(1.0 - hfrac / 2, max(hfrac / 2, cy))
            x0 = int(round((wcx - wfrac / 2) * iw)); x1 = int(round((wcx + wfrac / 2) * iw))
            y0 = int(round((wcy - hfrac / 2) * ih)); y1 = int(round((wcy + hfrac / 2) * ih))
            sub = rgb[max(0, y0):y1, max(0, x0):x1]
            if sub.size == 0:
                continue
            try:
                got = run_model(session, in_name, sub)
            except Exception:
                got = None
            if got:
                residuals.append((got[0] - 0.5) * wfrac)  # back to frame fraction
        if len(residuals) < max(1, len(frames) // 3):
            break
        delta = float(np.median(residuals))
        cx = min(1.0, max(0.0, cx + delta))
        if abs(delta) < 0.002:
            break

    out = {
        "found": True,
        "cx": round(cx, 4),
        "cy": round(cy, 4),
        "w": round(float(np.median(ws)), 4),
        "h": round(float(np.median(hs)), 4),
        "hits": hits,
        "samples": samples,
    }
    print(json.dumps(out))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
