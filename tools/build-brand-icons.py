"""Slice the Asuka brand sheet into app/tray/state icons.

The sheet is a promotional overview: one large rounded icon, one tray avatar and
six state avatars. Coordinates are tuned for the 1536x1024 source; rerun after
replacing assets/asuka-sheet.png.
"""
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
SHEET = ROOT / "assets" / "asuka-sheet.png"
BRAND = ROOT / "assets" / "brand"
PUBLIC = ROOT / "public" / "assets" / "brand"

# (left, top, size, mask) in source pixels
CROPS = {
    "app": (240, 45, 442, "rounded"),
    "tray": (1011, 201, 224, "circle"),
    "state-normal": (82, 679, 176, "circle"),
    "state-busy": (323, 669, 180, "circle"),
    "state-warning": (564, 679, 180, "rounded"),
    "state-error": (807, 679, 180, "rounded"),
    "state-paused": (1044, 679, 190, "rounded"),
    "state-offline": (1284, 679, 190, "rounded"),
}


def mask(size: int, shape: str) -> Image.Image:
    scale = 4
    big = Image.new("L", (size * scale, size * scale), 0)
    draw = ImageDraw.Draw(big)
    edge = 2 * scale
    if shape == "circle":
        draw.ellipse((edge, edge, size * scale - edge, size * scale - edge), fill=255)
    else:
        radius = int(size * scale * 0.215)
        draw.rounded_rectangle(
            (edge, edge, size * scale - edge, size * scale - edge),
            radius=radius,
            fill=255,
        )
    return big.resize((size, size), Image.LANCZOS)


def build() -> None:
    sheet = Image.open(SHEET).convert("RGBA")
    BRAND.mkdir(parents=True, exist_ok=True)
    PUBLIC.mkdir(parents=True, exist_ok=True)

    icons = {}
    for name, (left, top, size, shape) in CROPS.items():
        tile = sheet.crop((left, top, left + size, top + size)).convert("RGBA")
        tile.putalpha(mask(size, shape))
        icons[name] = tile

    app = icons["app"]

    # Executable / favicon. Source art is 442px, so 512 is the useful ceiling;
    # the ICO keeps standard Windows sizes.
    app.resize((1024, 1024), Image.LANCZOS).save(ROOT / "assets" / "app-icon.png")
    app.resize((512, 512), Image.LANCZOS).save(BRAND / "app-512.png")
    app.resize((256, 256), Image.LANCZOS).save(
        ROOT / "assets" / "app.ico",
        format="ICO",
        sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)],
    )

    exports = {
        "app": (512, "app.png"),
        "tray": (256, "logo.png"),
        "state-normal": (128, "state-normal.png"),
        "state-busy": (128, "state-busy.png"),
        "state-warning": (128, "state-warning.png"),
        "state-error": (128, "state-error.png"),
        "state-paused": (128, "state-paused.png"),
        "state-offline": (128, "state-offline.png"),
    }
    for key, (size, filename) in exports.items():
        image = icons[key].resize((size, size), Image.LANCZOS)
        image.save(BRAND / filename)
        image.save(PUBLIC / filename)

    print("brand icons written to assets/brand and public/assets/brand")


if __name__ == "__main__":
    build()
