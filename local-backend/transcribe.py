#!/usr/bin/env python3
import json
import sys

from faster_whisper import WhisperModel


def main() -> int:
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Missing media path"}))
        return 1

    media_path = sys.argv[1]
    model_name = sys.argv[2] if len(sys.argv) > 2 else "tiny"

    model = WhisperModel(model_name, device="cpu", compute_type="int8")
    segments, info = model.transcribe(
        media_path,
        beam_size=2,
        best_of=2,
        word_timestamps=True,
        vad_filter=True,
        condition_on_previous_text=False,
        # Anti-repetition: Whisper sometimes loops on one token ("test test test…")
        # when the audio is unclear/music. A SCALAR temperature disables the fallback
        # ladder, so a repetitive decode is kept as-is. Pass the full temperature ladder
        # so a segment whose output is too repetitive (compression_ratio_threshold) or
        # low-confidence (log_prob_threshold) is RE-DECODED at a higher temperature, and
        # forbid repeated trigrams outright during decoding.
        temperature=[0.0, 0.2, 0.4, 0.6, 0.8, 1.0],
        compression_ratio_threshold=2.4,
        log_prob_threshold=-1.0,
        no_repeat_ngram_size=3,
    )

    result = {
        "language": getattr(info, "language", "unknown"),
        "duration": float(getattr(info, "duration", 0) or 0),
        "segments": [],
    }

    for segment in segments:
        words = []
        for word in getattr(segment, "words", []) or []:
            text = (getattr(word, "word", "") or "").strip()
            if not text:
                continue
            words.append(
                {
                    "start": float(getattr(word, "start", segment.start) or segment.start),
                    "end": float(getattr(word, "end", segment.end) or segment.end),
                    "word": text,
                }
            )

        result["segments"].append(
            {
                "start": float(segment.start),
                "end": float(segment.end),
                "text": (segment.text or "").strip(),
                "words": words,
            }
        )

    print(json.dumps(result, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
