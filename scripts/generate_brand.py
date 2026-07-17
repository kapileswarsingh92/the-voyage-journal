"""Generates the homepage hero banner (no text baked in — HTML overlays it)."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from generate_covers import (  # noqa: E402
    PALETTES,
    W,
    H,
    add_grain,
    draw_scene,
    frame,
    sun,
    vertical_gradient,
)
from PIL import Image, ImageDraw, ImageFilter  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "static" / "img"
OUT.mkdir(parents=True, exist_ok=True)

HERO_W, HERO_H = 2400, 1400


def make_hero():
    import generate_covers as gc  # noqa

    gc.W, gc.H = HERO_W, HERO_H
    palette = PALETTES[0]
    img = vertical_gradient((HERO_W, HERO_H), palette["sky_top"], palette["sky_bot"])
    d = ImageDraw.Draw(img)
    sun(d, HERO_W * 0.24, HERO_H * 0.30, 150, palette["sun"])
    draw_scene(d, "mountains", palette, seed=42)
    img = add_grain(img, amount=14)
    img = img.filter(ImageFilter.GaussianBlur(0.5))

    scrim = Image.new("L", (HERO_W, HERO_H), 0)
    sd = ImageDraw.Draw(scrim)
    for y in range(HERO_H):
        t = y / HERO_H
        val = int(120 * max(0, (t - 0.35) / 0.65)) if t > 0.35 else 0
        sd.line([(0, y), (HERO_W, y)], fill=val)
    black = Image.new("RGB", (HERO_W, HERO_H), (12, 9, 10))
    img.paste(black, (0, 0), scrim)

    img.save(OUT / "hero.jpg", quality=90)
    print("wrote hero.jpg")


if __name__ == "__main__":
    make_hero()
