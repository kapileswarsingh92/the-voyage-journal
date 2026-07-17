"""
Generates a handful of extra "snapshot" style photos (no title text/stamp,
square-ish crop) to populate story photo galleries for the demo. Reuses the
same Pillow scene-drawing helpers as generate_covers.py.

Run: python3 scripts/generate_gallery.py
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

from generate_covers import PALETTES, add_grain, draw_scene, frame, sun, vertical_gradient

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "static" / "uploads"
OUT_DIR.mkdir(parents=True, exist_ok=True)

SIZE = (1100, 1100)


def make_snapshot(fname, palette_idx, scene, seed, sun_pos=(0.7, 0.32)):
    palette = PALETTES[palette_idx]
    img = vertical_gradient(SIZE, palette["sky_top"], palette["sky_bot"])
    d = ImageDraw.Draw(img)
    sun(d, SIZE[0] * sun_pos[0], SIZE[1] * sun_pos[1], 80, palette["sun"])

    # draw_scene() hard-codes 1600x1000 canvas geometry; render on a matching
    # canvas, then crop a square from it so the illustration keeps its proportions.
    scene_w, scene_h = 1600, 1000
    scene_img = vertical_gradient((scene_w, scene_h), palette["sky_top"], palette["sky_bot"])
    sd = ImageDraw.Draw(scene_img)
    sun(sd, scene_w * sun_pos[0], scene_h * sun_pos[1], 100, palette["sun"])
    draw_scene(sd, scene, palette, seed)
    scene_img = add_grain(scene_img, amount=14).filter(ImageFilter.GaussianBlur(0.4))
    # crop a true square (matching scene_h) so resizing to SIZE never distorts circles
    offset_x = int((scene_w - scene_h) * (sun_pos[0] * 0.6 + 0.2))
    crop = scene_img.crop((offset_x, 0, offset_x + scene_h, scene_h)).resize(SIZE, Image.LANCZOS)

    frame(crop, (250, 244, 232), inset=22, line_w=3, gap=8)
    crop.save(OUT_DIR / fname, quality=88)
    print("wrote", fname)


GALLERY_SPECS = [
    # (filename, palette_idx, scene, seed)
    ("gallery-santorini-1.jpg", 4, "coast", 11),
    ("gallery-santorini-2.jpg", 2, "desert", 23),
    ("gallery-santorini-3.jpg", 4, "city", 37),
    ("gallery-kyoto-1.jpg", 3, "forest", 51),
    ("gallery-kyoto-2.jpg", 3, "mountains", 62),
    ("gallery-kyoto-3.jpg", 1, "forest", 74),
    ("gallery-bali-1.jpg", 1, "tropics", 81),
    ("gallery-bali-2.jpg", 1, "coast", 93),
]

if __name__ == "__main__":
    for fname, palette_idx, scene, seed in GALLERY_SPECS:
        make_snapshot(fname, palette_idx, scene, seed)
