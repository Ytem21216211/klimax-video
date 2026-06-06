#!/usr/bin/env python3
import json
import os
import sys

from PIL import Image, ImageDraw, ImageFont


CANVAS_WIDTH = 1080
CANVAS_HEIGHT = 1920


def load_font(font_path: str | None, font_size: int):
    candidates = [
        font_path,
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
        "/System/Library/Fonts/Supplemental/Impact.ttf",
    ]
    for candidate in candidates:
        if candidate and os.path.exists(candidate):
            try:
                return ImageFont.truetype(candidate, font_size)
            except Exception:
                continue
    return ImageFont.load_default()


def hex_to_rgba(value: str, fallback: tuple[int, int, int, int]) -> tuple[int, int, int, int]:
    if not value:
        return fallback
    value = value.strip().lstrip("#")
    if len(value) != 6:
        return fallback
    try:
        return tuple(int(value[i : i + 2], 16) for i in (0, 2, 4)) + (255,)
    except Exception:
        return fallback


def main() -> int:
    if len(sys.argv) < 2:
        return 1

    config_path = sys.argv[1]
    with open(config_path, "r", encoding="utf8") as handle:
        config = json.load(handle)

    output_path = config["outputPath"]
    text = config.get("text", "").rstrip() or "Tu connais cette sensation"
    font_size = int(config.get("fontSize", 44))
    font_path = config.get("fontPath")
    bubble_color = hex_to_rgba(config.get("bubbleColor"), (255, 255, 255, 255))
    text_color = hex_to_rgba(config.get("textColor"), (0, 0, 0, 255))
    center_x = int(config.get("centerX", CANVAS_WIDTH // 2))
    bubble_top = int(config.get("top", 1030))

    image = Image.new("RGBA", (CANVAS_WIDTH, CANVAS_HEIGHT), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    font = load_font(font_path, font_size)

    max_text_width = 920
    paragraphs = [paragraph.strip() for paragraph in text.split("\n")]
    lines: list[str] = []
    for paragraph in paragraphs:
        if not paragraph:
            lines.append("")
            continue
        words = paragraph.split()
        current = ""
        for word in words:
            next_line = f"{current} {word}".strip()
            width = draw.textbbox((0, 0), next_line, font=font)[2]
            if current and width > max_text_width:
                lines.append(current)
                current = word
            else:
                current = next_line
        if current:
            lines.append(current)

    line_spacing = max(10, int(font_size * 0.22))
    bbox = draw.multiline_textbbox((0, 0), "\n".join(lines), font=font, spacing=line_spacing, align="center")
    text_width = bbox[2] - bbox[0]
    text_height = bbox[3] - bbox[1]
    padding_x = 120
    padding_y = 32
    bubble_width = min(980, text_width + padding_x * 2)
    bubble_height = max(120, text_height + padding_y * 2)
    bubble_left = max(0, min(CANVAS_WIDTH - bubble_width, center_x - bubble_width // 2))
    bubble_right = bubble_left + bubble_width
    bubble_bottom = bubble_top + bubble_height
    radius = min(96, bubble_height // 2)

    draw.rounded_rectangle(
        (bubble_left, bubble_top, bubble_right, bubble_bottom),
        radius=radius,
        fill=bubble_color,
    )

    text_x = CANVAS_WIDTH / 2
    text_y = bubble_top + (bubble_height - text_height) / 2 - bbox[1]
    draw.multiline_text(
        (text_x, text_y),
        "\n".join(lines),
        fill=text_color,
        font=font,
        spacing=line_spacing,
        align="center",
        anchor="ma",
    )

    image.save(output_path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
