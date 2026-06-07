#!/usr/bin/env python3
import sys
from pathlib import Path

from PIL import Image


def main() -> int:
    if len(sys.argv) < 3:
        return 1

    input_path = Path(sys.argv[1])
    output_path = Path(sys.argv[2])
    padding = int(sys.argv[3]) if len(sys.argv) > 3 else 24

    image = Image.open(input_path).convert("RGBA")
    alpha_bbox = image.getchannel("A").getbbox()
    if not alpha_bbox:
        image.save(output_path)
        return 0

    left, top, right, bottom = alpha_bbox
    left = max(0, left - padding)
    top = max(0, top - padding)
    right = min(image.width, right + padding)
    bottom = min(image.height, bottom + padding)
    image.crop((left, top, right, bottom)).save(output_path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
