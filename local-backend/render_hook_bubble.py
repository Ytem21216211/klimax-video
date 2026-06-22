#!/usr/bin/env python3
import json
import os
import sys

from PIL import Image, ImageDraw, ImageFont, ImageFilter


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

    # Anchor the emoji on the Latin cap-height (~0.72 * em), not the nominal
    # font_size (which is the full em-box). The browser renders an inline emoji
    # at roughly the cap/x band of the line; seeding from font_size lands on a
    # ~52px Apple Color Emoji strike that towers over the 38px caps and inflates
    # the bubble height. 0.72 * 53 -> nearest valid 40px strike, matching preview.
    target = max(8, int(round(font_size * 0.72)))
    candidates = [target]
    for delta in range(1, 49):
        candidates.extend([target - delta, target + delta])
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
    line_advance: float,
):
    # Each line occupies a fixed `line_advance` slot (CSS line-height), and its
    # glyph box is vertically centred inside that slot — like a browser line box.
    # This keeps the total block height glyph-independent (n * line_advance) so a
    # tall emoji or descender never grows the rendered text vs the preview.
    slot_top = top_y
    for line in lines:
        _width, height, top = rich_text_size(draw, line, text_font, emoji_font)
        draw_y = slot_top + (line_advance - height) / 2 - top
        draw_rich_line(draw, line, center_x, draw_y, text_font, emoji_font, fill)
        slot_top += line_advance


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
    max_bubble_width = max(240, min(CANVAS_WIDTH, int(config.get("maxWidth", config.get("bubbleWidth", 980)))))
    min_bubble_height = max(80, min(CANVAS_HEIGHT, int(config.get("minHeight", config.get("bubbleHeight", 120)))))
    radius_cfg = max(8, int(config.get("radius", 64)))
    # TikTok-native corner: a fixed FRACTION of the bubble height (measured ~0.19 from a
    # real TikTok caption) instead of a fixed px value — so the rounded-rectangle look
    # holds for 1 or 2 lines and at any scale (a fixed px turned short bubbles into a
    # full "pill"). radiusRatio>0 wins over the legacy fixed `radius`.
    radius_ratio = float(config.get("radiusRatio", 0) or 0)

    image = Image.new("RGBA", (CANVAS_WIDTH, CANVAS_HEIGHT), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    font = load_font(font_path, font_size)
    emoji_font = load_emoji_font(font_size)

    padding_x = int(config.get("paddingX", 56))
    padding_y = int(config.get("paddingY", 30))
    max_text_width = max(120, max_bubble_width - padding_x * 2)
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

    # Fixed CSS line-box advance (Tailwind `leading-snug` = 1.375) so the text
    # block height is exactly n_lines * 1.375 * font_size, glyph-independent and
    # identical to the browser preview (no PIL em-box / emoji inflation).
    line_advance = font_size * 1.375
    n_lines = max(1, len(lines))
    text_height = int(round(n_lines * line_advance))
    # Bubble hugs the text: width = widest line + padding, capped at maxWidth;
    # height grows with the line count, floored at minHeight.
    text_width = 0
    for line in lines or [""]:
        text_width = max(text_width, rich_text_size(draw, line, font, emoji_font)[0])
    bubble_width = max(240, min(max_bubble_width, int(text_width) + padding_x * 2))
    bubble_height = max(min_bubble_height, text_height + padding_y * 2)
    bubble_left = max(0, min(CANVAS_WIDTH - bubble_width, center_x - bubble_width // 2))
    bubble_right = bubble_left + bubble_width
    bubble_top = max(0, min(CANVAS_HEIGHT - bubble_height, center_y - bubble_height // 2))
    bubble_bottom = bubble_top + bubble_height
    # Configurable corner radius, never beyond the full pill (half-height). With
    # radiusRatio set, the radius tracks the height (TikTok ~0.19) for a consistent
    # rounded-rectangle on any line count.
    radius = round(bubble_height * radius_ratio) if radius_ratio > 0 else radius_cfg
    radius = max(8, min(radius, bubble_height // 2))

    # Soft drop shadow under the bubble — reproduces the preview's
    # shadow-[0_16px_50px_rgba(0,0,0,0.45)] scaled to the 1080-wide canvas. The
    # pill shape is drawn on its own layer, offset down, Gaussian-blurred and
    # composited UNDER the bubble (the opaque bubble is painted on top after).
    shadow_offset_y = int(config.get("shadowOffsetY", 30))
    shadow_blur = float(config.get("shadowBlur", 40))
    shadow_alpha = max(0, min(255, int(config.get("shadowAlpha", 120))))
    if shadow_alpha > 0:
        shadow = Image.new("RGBA", (CANVAS_WIDTH, CANVAS_HEIGHT), (0, 0, 0, 0))
        ImageDraw.Draw(shadow).rounded_rectangle(
            (bubble_left, bubble_top + shadow_offset_y, bubble_right, bubble_bottom + shadow_offset_y),
            radius=radius,
            fill=(0, 0, 0, shadow_alpha),
        )
        image.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(shadow_blur)))

    draw.rounded_rectangle(
        (bubble_left, bubble_top, bubble_right, bubble_bottom),
        radius=radius,
        fill=bubble_color,
    )

    text_x = bubble_left + bubble_width / 2
    text_y = bubble_top + (bubble_height - text_height) / 2
    draw_rich_multiline(draw, lines, text_x, text_y, font, emoji_font, text_color, line_advance)

    image.save(output_path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
