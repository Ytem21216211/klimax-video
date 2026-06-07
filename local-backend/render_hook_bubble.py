#!/usr/bin/env python3
import json
import os
import sys

from PIL import Image, ImageDraw, ImageFont


CANVAS_WIDTH = 1080
CANVAS_HEIGHT = 1920
EMOJI_FONT_PATH = "/System/Library/Fonts/Apple Color Emoji.ttc"


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


def load_emoji_font(font_size: int):
    if not os.path.exists(EMOJI_FONT_PATH):
        return None

    candidates = [font_size]
    for delta in range(1, 49):
        candidates.extend([font_size - delta, font_size + delta])
    candidates.extend([160, 96, 64, 40])

    tried: set[int] = set()
    for size in candidates:
        size = max(8, min(256, int(size)))
        if size in tried:
            continue
        tried.add(size)
        try:
            return ImageFont.truetype(EMOJI_FONT_PATH, size)
        except Exception:
            continue
    return None


def is_emoji_base(char: str) -> bool:
    code = ord(char)
    return (
        0x1F000 <= code <= 0x1FAFF
        or 0x2600 <= code <= 0x27BF
        or 0x2300 <= code <= 0x23FF
    )


def is_emoji_modifier(char: str) -> bool:
    code = ord(char)
    return (
        code == 0xFE0F
        or code == 0x200D
        or 0x1F3FB <= code <= 0x1F3FF
        or 0xE0020 <= code <= 0xE007F
    )


def rich_runs(text: str) -> list[tuple[str, bool]]:
    runs: list[tuple[str, bool]] = []
    text_buffer: list[str] = []
    index = 0
    while index < len(text):
        char = text[index]
        if not is_emoji_base(char):
            text_buffer.append(char)
            index += 1
            continue

        if text_buffer:
            runs.append(("".join(text_buffer), False))
            text_buffer = []

        emoji = [char]
        index += 1
        while index < len(text):
            current = text[index]
            if is_emoji_modifier(current):
                emoji.append(current)
                index += 1
                if current == "\u200d" and index < len(text):
                    emoji.append(text[index])
                    index += 1
                continue
            break
        runs.append(("".join(emoji), True))

    if text_buffer:
        runs.append(("".join(text_buffer), False))
    return runs


def run_bbox(draw: ImageDraw.ImageDraw, text: str, font, is_emoji: bool):
    kwargs = {"embedded_color": True} if is_emoji else {}
    try:
        return draw.textbbox((0, 0), text, font=font, **kwargs)
    except TypeError:
        return draw.textbbox((0, 0), text, font=font)


def rich_text_size(draw: ImageDraw.ImageDraw, text: str, text_font, emoji_font):
    width = 0
    top = 0
    bottom = 0
    has_content = False
    for value, is_emoji in rich_runs(text):
        font = emoji_font if is_emoji and emoji_font else text_font
        bbox = run_bbox(draw, value, font, is_emoji and emoji_font is not None)
        width += bbox[2] - bbox[0]
        top = min(top, bbox[1])
        bottom = max(bottom, bbox[3])
        has_content = True
    return width, max(0, bottom - top), top if has_content else 0


def rich_multiline_bbox(draw: ImageDraw.ImageDraw, lines: list[str], text_font, emoji_font, spacing: int):
    max_width = 0
    total_height = 0
    first_top = 0
    for index, line in enumerate(lines or [""]):
        width, height, top = rich_text_size(draw, line, text_font, emoji_font)
        max_width = max(max_width, width)
        if index == 0:
            first_top = top
        total_height += height
        if index < len(lines) - 1:
            total_height += spacing
    return 0, first_top, max_width, total_height + first_top


def draw_rich_line(
    draw: ImageDraw.ImageDraw,
    line: str,
    center_x: float,
    top_y: float,
    text_font,
    emoji_font,
    fill,
):
    width, _height, _top = rich_text_size(draw, line, text_font, emoji_font)
    x = center_x - width / 2
    for value, is_emoji in rich_runs(line):
        font = emoji_font if is_emoji and emoji_font else text_font
        emoji_enabled = is_emoji and emoji_font is not None
        try:
            draw.text((x, top_y), value, fill=fill, font=font, embedded_color=emoji_enabled)
        except TypeError:
            draw.text((x, top_y), value, fill=fill, font=font)
        bbox = run_bbox(draw, value, font, emoji_enabled)
        x += bbox[2] - bbox[0]


def draw_rich_multiline(
    draw: ImageDraw.ImageDraw,
    lines: list[str],
    center_x: float,
    top_y: float,
    text_font,
    emoji_font,
    fill,
    spacing: int,
):
    y = top_y
    for line in lines:
        _width, height, _top = rich_text_size(draw, line, text_font, emoji_font)
        draw_rich_line(draw, line, center_x, y, text_font, emoji_font, fill)
        y += height + spacing


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
    center_y = int(config.get("centerY", config.get("top", 1030)))
    target_bubble_width = max(240, min(CANVAS_WIDTH, int(config.get("bubbleWidth", 980))))
    target_bubble_height = max(80, min(CANVAS_HEIGHT, int(config.get("bubbleHeight", 120))))

    image = Image.new("RGBA", (CANVAS_WIDTH, CANVAS_HEIGHT), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    font = load_font(font_path, font_size)
    emoji_font = load_emoji_font(font_size)

    padding_x = 64
    padding_y = 32
    max_text_width = max(120, target_bubble_width - padding_x * 2)
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
            width = rich_text_size(draw, next_line, font, emoji_font)[0]
            if current and width > max_text_width:
                lines.append(current)
                current = word
            else:
                current = next_line
        if current:
            lines.append(current)

    line_spacing = max(10, int(font_size * 0.22))
    bbox = rich_multiline_bbox(draw, lines, font, emoji_font, line_spacing)
    text_width = bbox[2] - bbox[0]
    text_height = bbox[3] - bbox[1]
    bubble_width = target_bubble_width
    bubble_height = max(target_bubble_height, text_height + padding_y * 2)
    bubble_left = max(0, min(CANVAS_WIDTH - bubble_width, center_x - bubble_width // 2))
    bubble_right = bubble_left + bubble_width
    bubble_top = max(0, min(CANVAS_HEIGHT - bubble_height, center_y - bubble_height // 2))
    bubble_bottom = bubble_top + bubble_height
    radius = min(96, bubble_height // 2)

    draw.rounded_rectangle(
        (bubble_left, bubble_top, bubble_right, bubble_bottom),
        radius=radius,
        fill=bubble_color,
    )

    text_x = bubble_left + bubble_width / 2
    text_y = bubble_top + (bubble_height - text_height) / 2 - bbox[1]
    draw_rich_multiline(draw, lines, text_x, text_y, font, emoji_font, text_color, line_spacing)

    image.save(output_path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
