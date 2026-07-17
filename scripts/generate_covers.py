"""
Generates premium, mid-century-travel-poster-style cover images for seed blog
posts using only Pillow + locally installed fonts (no internet required).
Run: python3 scripts/generate_covers.py
"""
import math
import random
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "static" / "uploads"
OUT_DIR.mkdir(parents=True, exist_ok=True)

SERIF = "/usr/share/fonts/truetype/google-fonts/Lora-Variable.ttf"
SANS = "/usr/share/fonts/truetype/google-fonts/Poppins-Regular.ttf"
SANS_MED = "/usr/share/fonts/truetype/google-fonts/Poppins-Medium.ttf"
SANS_BOLD = "/usr/share/fonts/truetype/google-fonts/Poppins-SemiBold.ttf"

W, H = 1600, 1000


def serif_font(size, weight=b"SemiBold"):
    f = ImageFont.truetype(SERIF, size)
    try:
        f.set_variation_by_name(weight)
    except Exception:
        pass
    return f


def lerp(a, b, t):
    return a + (b - a) * t


def lerp_color(c1, c2, t):
    return tuple(int(lerp(c1[i], c2[i], t)) for i in range(3))


def vertical_gradient(size, top, bottom):
    w, h = size
    img = Image.new("RGB", size, top)
    draw = ImageDraw.Draw(img)
    for y in range(h):
        t = y / max(h - 1, 1)
        draw.line([(0, y), (w, y)], fill=lerp_color(top, bottom, t))
    return img


def add_grain(img, amount=10):
    w, h = img.size
    noise = Image.effect_noise((w, h), amount).convert("L")
    noise_rgb = Image.merge("RGB", (noise, noise, noise))
    return Image.blend(img, noise_rgb, 0.035)


def sun(draw, cx, cy, r, color):
    draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=color)


def mountains(draw, base_y, w, h, layers):
    for peaks, color, y_off in layers:
        pts = [(0, base_y + y_off)]
        seg = w / (len(peaks))
        for i, peak_h in enumerate(peaks):
            x = seg * (i + 0.5)
            pts.append((x, base_y + y_off - peak_h))
        pts.append((w, base_y + y_off))
        pts.append((w, h))
        pts.append((0, h))
        draw.polygon(pts, fill=color)


def waves(draw, base_y, w, h, color, amp=18, period=180, y_off=0):
    pts = [(0, h)]
    x = 0
    while x <= w:
        y = base_y + y_off + amp * math.sin(x / period)
        pts.append((x, y))
        x += 10
    pts.append((w, h))
    draw.polygon(pts, fill=color)


def city_skyline(draw, base_y, w, h, color, seed=0):
    rnd = random.Random(seed)
    x = 0
    while x < w:
        bw = rnd.randint(50, 110)
        bh = rnd.randint(80, 280)
        draw.rectangle([x, base_y - bh, x + bw, h], fill=color)
        x += bw + rnd.randint(6, 18)


def palm(draw, x, y, scale, color):
    draw.line([(x, y), (x - 6 * scale, y - 70 * scale)], fill=color, width=int(7 * scale))
    for ang in (-70, -35, -5, 30, 65):
        rad = math.radians(ang)
        ex = x - 6 * scale + 55 * scale * math.sin(rad)
        ey = y - 70 * scale - 55 * scale * math.cos(rad)
        draw.line([(x - 6 * scale, y - 70 * scale), (ex, ey)], fill=color, width=int(5 * scale))


def dotted_circle_stamp(size, text_lines, ring_color, text_color):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    cx = cy = size / 2
    r_outer = size / 2 - 4
    r_inner = r_outer - 14
    n_dots = 44
    for i in range(n_dots):
        ang = 2 * math.pi * i / n_dots
        dx = cx + r_outer * math.cos(ang)
        dy = cy + r_outer * math.sin(ang)
        d.ellipse([dx - 3, dy - 3, dx + 3, dy + 3], fill=ring_color)
    d.ellipse([cx - r_inner, cy - r_inner, cx + r_inner, cy + r_inner], outline=ring_color, width=3)
    f_sm = ImageFont.truetype(SANS_MED, int(size * 0.085))
    total_h = len(text_lines) * int(size * 0.11)
    ty = cy - total_h / 2
    for line in text_lines:
        bbox = d.textbbox((0, 0), line, font=f_sm)
        tw = bbox[2] - bbox[0]
        d.text((cx - tw / 2, ty), line, font=f_sm, fill=text_color)
        ty += int(size * 0.11)
    return img.rotate(-9, resample=Image.BICUBIC, expand=False)


def frame(img, border_color, inset=34, line_w=3, gap=10):
    d = ImageDraw.Draw(img)
    w, h = img.size
    d.rectangle([inset, inset, w - inset, h - inset], outline=border_color, width=line_w)
    d.rectangle(
        [inset + gap, inset + gap, w - inset - gap, h - inset - gap],
        outline=border_color,
        width=1,
    )
    return img


def text_with_shadow(draw, xy, text, font, fill, shadow=(0, 0, 0, 90), offset=3):
    x, y = xy
    draw.text((x + offset, y + offset), text, font=font, fill=shadow)
    draw.text((x, y), text, font=font, fill=fill)


def draw_scene(d, kind, palette, seed):
    rnd = random.Random(seed)
    if kind == "mountains":
        peaks_back = [rnd.randint(120, 240) for _ in range(6)]
        peaks_front = [rnd.randint(200, 360) for _ in range(5)]
        mountains(d, 700, W, H, [(peaks_back, palette["mid"], 40), (peaks_front, palette["fg"], 0)])
    elif kind == "coast":
        waves(d, 760, W, H, palette["mid"], amp=14, period=220, y_off=0)
        waves(d, 820, W, H, palette["fg"], amp=20, period=160, y_off=30)
    elif kind == "desert":
        peaks_back = [rnd.randint(40, 90) for _ in range(4)]
        mountains(d, 760, W, H, [(peaks_back, palette["mid"], 20)])
        d.ellipse([-200, 780, 600, 1000], fill=palette["fg"])
        d.ellipse([900, 820, 1700, 1050], fill=palette["fg"])
    elif kind == "city":
        city_skyline(d, 760, W, H, palette["mid"], seed=seed)
        city_skyline(d, 820, W, H, palette["fg"], seed=seed + 5)
    elif kind == "forest":
        peaks_back = [rnd.randint(90, 160) for _ in range(9)]
        peaks_front = [rnd.randint(140, 220) for _ in range(7)]
        mountains(d, 740, W, H, [(peaks_back, palette["mid"], 30), (peaks_front, palette["fg"], 0)])
    elif kind == "tropics":
        waves(d, 800, W, H, palette["mid"], amp=10, period=260, y_off=10)
        d.rectangle([0, 850, W, H], fill=palette["fg"])
        for i, x in enumerate([180, 420, 1180, 1400]):
            palm(d, x, 850, 1.4 + (i % 2) * 0.4, palette["accent"])
    elif kind == "countryside":
        peaks_back = [rnd.randint(30, 70) for _ in range(10)]
        mountains(d, 780, W, H, [(peaks_back, palette["mid"], 10)])
        d.rectangle([0, 840, W, H], fill=palette["fg"])


PALETTES = [
    {"sky_top": (45, 33, 58), "sky_bot": (206, 96, 63), "mid": (168, 84, 63), "fg": (58, 40, 46), "accent": (222, 176, 90), "sun": (232, 168, 76)},
    {"sky_top": (22, 68, 78), "sky_bot": (233, 189, 106), "mid": (24, 92, 96), "fg": (17, 54, 58), "accent": (235, 214, 168), "sun": (243, 214, 148)},
    {"sky_top": (250, 214, 165), "sky_bot": (233, 143, 96), "mid": (196, 105, 74), "fg": (94, 55, 52), "accent": (250, 236, 214), "sun": (255, 235, 205)},
    {"sky_top": (33, 44, 66), "sky_bot": (94, 74, 120), "mid": (57, 58, 92), "fg": (32, 30, 48), "accent": (233, 196, 106), "sun": (233, 196, 106)},
    {"sky_top": (255, 226, 176), "sky_bot": (250, 172, 120), "mid": (216, 118, 88), "fg": (120, 63, 60), "accent": (255, 246, 227), "sun": (255, 250, 235)},
    {"sky_top": (198, 224, 214), "sky_bot": (238, 214, 158), "mid": (94, 140, 122), "fg": (48, 82, 68), "accent": (250, 244, 227), "sun": (250, 233, 186)},
]

POSTS = [
    {"file": "seed-santorini.jpg", "title": "Santorini", "caption": "GREECE · TRAVEL", "scene": "coast", "palette": 4},
    {"file": "seed-kyoto.jpg", "title": "Kyoto", "caption": "JAPAN · CULTURE", "scene": "forest", "palette": 3},
    {"file": "seed-patagonia.jpg", "title": "Patagonia", "caption": "ARGENTINA · ADVENTURE", "scene": "mountains", "palette": 0},
    {"file": "seed-marrakech.jpg", "title": "Marrakech", "caption": "MOROCCO · CULTURE", "scene": "desert", "palette": 2},
    {"file": "seed-lisbon.jpg", "title": "Lisbon", "caption": "PORTUGAL · LIFESTYLE", "scene": "city", "palette": 4},
    {"file": "seed-bali.jpg", "title": "Bali", "caption": "INDONESIA · WELLNESS", "scene": "tropics", "palette": 1},
    {"file": "seed-tuscany.jpg", "title": "Tuscany", "caption": "ITALY · FOOD & DRINK", "scene": "countryside", "palette": 5},
    {"file": "seed-newyork.jpg", "title": "New York City", "caption": "USA · LIFESTYLE", "scene": "city", "palette": 3},
    {"file": "seed-swissalps.jpg", "title": "The Swiss Alps", "caption": "SWITZERLAND · ADVENTURE", "scene": "mountains", "palette": 1},
]


def make_cover(spec, seed):
    palette = PALETTES[spec["palette"]]
    img = vertical_gradient((W, H), palette["sky_top"], palette["sky_bot"])
    d = ImageDraw.Draw(img)
    sun(d, W * 0.76, H * 0.34, 108, palette["sun"])
    draw_scene(d, spec["scene"], palette, seed)
    img = add_grain(img, amount=14)
    img = img.filter(ImageFilter.GaussianBlur(0.4))
    d = ImageDraw.Draw(img, "RGBA")

    # bottom gradient scrim for text legibility
    scrim = Image.new("L", (W, 260), 0)
    sd = ImageDraw.Draw(scrim)
    for y in range(260):
        sd.line([(0, y), (W, y)], fill=int(150 * (y / 260)))
    black = Image.new("RGB", (W, 260), (10, 8, 8))
    img.paste(black, (0, H - 260), scrim)

    d = ImageDraw.Draw(img)
    cap_font = ImageFont.truetype(SANS_MED, 30)
    title_font = serif_font(92, b"SemiBold")
    text_with_shadow(d, (66, H - 210), spec["caption"], cap_font, (233, 224, 205))
    text_with_shadow(d, (62, H - 175), spec["title"], title_font, (252, 248, 240))

    stamp = dotted_circle_stamp(180, ["VOYAGE", "JOURNAL", "• POST •"], (252, 248, 240), (252, 248, 240))
    img.paste(stamp, (W - 220, 60), stamp)

    frame(img, (250, 244, 232), inset=28, line_w=3, gap=9)
    img.save(OUT_DIR / spec["file"], quality=90)
    print("wrote", spec["file"])


if __name__ == "__main__":
    for i, spec in enumerate(POSTS):
        make_cover(spec, seed=i * 7 + 3)
