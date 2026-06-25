#!/usr/bin/env python3
# Composites ONE carousel slide (1080x1350, 4:5) from a JSON config:
#   background (AI image, cover-cropped) + bottom scrim + optional anatomy diagram overlay
#   + title bubble + explanation panel.  CTA slide = brand background + Klimax logo + CTA title.
# Reuses the rich-text / font / rounded-bubble machinery from render_hook_bubble.py.
import json
import os
import random
import sys

from PIL import Image, ImageDraw, ImageFilter

from render_hook_bubble import (
    load_font,
    load_emoji_font,
    draw_rich_multiline,
    rich_text_size,
    hex_to_rgba,
)

CW, CH = 1080, 1350  # IG carousel 4:5


def cover_crop(img, w, h):
    img = img.convert("RGBA")
    sw, sh = img.size
    scale = max(w / sw, h / sh)
    nw, nh = max(w, int(sw * scale)), max(h, int(sh * scale))
    img = img.resize((nw, nh), Image.LANCZOS)
    left, top = (nw - w) // 2, (nh - h) // 2
    return img.crop((left, top, left + w, top + h))


def bottom_scrim(w, h, max_alpha=135, frac=0.5):
    """Black gradient, transparent at the top, opaque toward the bottom — legibility."""
    scrim = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    px = scrim.load()
    start = int(h * (1 - frac))
    for y in range(start, h):
        t = (y - start) / max(1, (h - start))
        a = int(max_alpha * (t ** 1.4))
        for x in range(0, w, 1):
            px[x, y] = (8, 6, 14, a)
    return scrim


def wrap_lines(draw, text, font, emoji_font, max_w):
    out = []
    for para in str(text).split("\n"):
        words = para.split()
        cur = ""
        for wd in words:
            nxt = (cur + " " + wd).strip()
            if cur and rich_text_size(draw, nxt, font, emoji_font)[0] > max_w:
                out.append(cur)
                cur = wd
            else:
                cur = nxt
        out.append(cur)
    return [l for l in out if l != ""] or [""]


def draw_text_block(base, text, font_path, font_size, color, center_x, top_y, max_w, advance_ratio=1.3):
    draw = ImageDraw.Draw(base)
    font = load_font(font_path, font_size)
    emoji = load_emoji_font(font_size)
    lines = wrap_lines(draw, text, font, emoji, max_w)
    adv = font_size * advance_ratio
    draw_rich_multiline(draw, lines, center_x, top_y, font, emoji, color, adv)
    return int(round(len(lines) * adv))


def rounded_panel(base, box, radius, fill):
    layer = Image.new("RGBA", base.size, (0, 0, 0, 0))
    ImageDraw.Draw(layer).rounded_rectangle(box, radius=radius, fill=fill)
    base.alpha_composite(layer)


def main() -> int:
    if len(sys.argv) < 2:
        return 1
    with open(sys.argv[1], "r", encoding="utf8") as fh:
        cfg = json.load(fh)

    rng = random.Random(int(cfg.get("seed", 0)) & 0xFFFFFFFF)
    accent = hex_to_rgba(cfg.get("accentColor"), (227, 36, 255, 255))
    title_font = cfg.get("titleFontPath")
    body_font = cfg.get("bodyFontPath")

    # --- background ---
    bg_path = cfg.get("backgroundPath")
    if bg_path and os.path.exists(bg_path):
        canvas = cover_crop(Image.open(bg_path), CW, CH)
    else:
        canvas = Image.new("RGBA", (CW, CH), (18, 14, 26, 255))
    canvas = canvas.convert("RGBA")

    is_cta = bool(cfg.get("isCta"))

    if is_cta:
        # Brand-forward CTA: darken bg, centered Klimax logo, CTA title below.
        canvas.alpha_composite(Image.new("RGBA", (CW, CH), (10, 8, 16, 170)))
        logo_path = cfg.get("logoPath")
        if logo_path and os.path.exists(logo_path):
            logo = Image.open(logo_path).convert("RGBA")
            lw = int(CW * 0.56)
            lh = int(logo.size[1] * (lw / logo.size[0]))
            logo = logo.resize((lw, lh), Image.LANCZOS)
            canvas.alpha_composite(logo, ((CW - lw) // 2, int(CH * 0.16)))
        title = cfg.get("title", "On peut faire ça avec Klimax")
        draw_text_block(canvas, title, title_font, 76, (255, 255, 255, 255),
                        CW // 2, int(CH * 0.74), int(CW * 0.82), advance_ratio=1.25)
        canvas.convert("RGBA").save(cfg["outputPath"])
        return 0

    # --- content slide: LIGHT scrim only at the bottom (keep the AI image visible) ---
    canvas.alpha_composite(bottom_scrim(CW, CH, max_alpha=130 + rng.randint(-10, 15)))

    # --- optional anatomy diagram, on a soft white card, upper-middle ---
    diagram_path = cfg.get("diagramPath")
    if diagram_path and os.path.exists(diagram_path):
        diag = cover_crop(Image.open(diagram_path), int(CW * 0.74), int(CW * 0.56))
        dw, dh = diag.size
        dx = (CW - dw) // 2
        dy = int(CH * 0.05) + rng.randint(-10, 10)
        rounded_panel(canvas, (dx - 18, dy - 18, dx + dw + 18, dy + dh + 18), 36, (255, 255, 255, 235))
        canvas.alpha_composite(diag, (dx, dy))
        text_top = dy + dh + 48
    else:
        # No diagram card → the AI background is the hero; text sits in the lower third.
        text_top = int(CH * 0.60)

    # --- title (accent bubble) ---
    title = cfg.get("title", "")
    if title:
        tmp = ImageDraw.Draw(canvas)
        tfont = load_font(title_font, 78)
        tw = rich_text_size(tmp, title, tfont, None)[0]
        bw = min(int(CW * 0.9), int(tw) + 96)
        bx = (CW - bw) // 2
        radius = 28 + rng.randint(0, 18)
        title_h = draw_text_block  # placeholder to keep flow; measure via wrap below
        lines_h = 78 * 1.2 * len(wrap_lines(tmp, title, tfont, None, bw - 96))
        rounded_panel(canvas, (bx, text_top, bx + bw, int(text_top + lines_h + 36)), radius,
                      (accent[0], accent[1], accent[2], 235))
        draw_text_block(canvas, title, title_font, 78, (255, 255, 255, 255),
                        CW // 2, text_top + 18, bw - 96, advance_ratio=1.2)
        text_top = int(text_top + lines_h + 36) + 28

    # --- explanation ---
    expl = cfg.get("explanation", "")
    if expl:
        # Shrink the body font if the explanation is long so it never runs off the slide.
        body_size = 42 if len(expl) <= 120 else (36 if len(expl) <= 200 else 31)
        draw_text_block(canvas, expl, body_font, body_size, (240, 240, 248, 255),
                        CW // 2, text_top, int(CW * 0.86), advance_ratio=1.3)

    canvas.convert("RGBA").save(cfg["outputPath"])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
