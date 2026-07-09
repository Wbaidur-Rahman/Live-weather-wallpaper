from pathlib import Path

from PIL import Image, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = ROOT / "assets" / "clouds" / "source"
OUT_DIR = ROOT / "assets" / "clouds"

MAX_WIDTH = 960
PAD = 36

VARIANTS = {
    "light": {
        "top": (252, 252, 242),
        "bottom": (198, 214, 214),
        "alpha": 2.05,
        "contrast": 0.92,
    },
    "grey": {
        "top": (176, 184, 185),
        "bottom": (91, 105, 110),
        "alpha": 2.2,
        "contrast": 0.98,
    },
    "dark": {
        "top": (100, 108, 111),
        "bottom": (31, 38, 42),
        "alpha": 2.35,
        "contrast": 1.05,
    },
}


def clamp(value, low, high):
    return max(low, min(high, value))


def mix(a, b, t):
    return int(round(a + (b - a) * t))


def bbox_with_pad(alpha, pad):
    bbox = alpha.point(lambda a: 255 if a > 2 else 0).getbbox()
    if not bbox:
        return (0, 0, alpha.width, alpha.height)

    left, top, right, bottom = bbox
    return (
        max(0, left - pad),
        max(0, top - pad),
        min(alpha.width, right + pad),
        min(alpha.height, bottom + pad),
    )


def make_variant(source, settings):
    image = source.convert("RGBA")
    alpha = image.getchannel("A")
    bbox = bbox_with_pad(alpha, PAD)
    image = image.crop(bbox)
    alpha = image.getchannel("A")

    if image.width > MAX_WIDTH:
        ratio = MAX_WIDTH / image.width
        size = (MAX_WIDTH, max(1, round(image.height * ratio)))
        image = image.resize(size, Image.Resampling.LANCZOS)
        alpha = alpha.resize(size, Image.Resampling.LANCZOS)

    alpha = alpha.filter(ImageFilter.GaussianBlur(0.25))
    alpha = alpha.point(
        lambda a: clamp(int(((a / 255) ** settings["contrast"]) * 255 * settings["alpha"]), 0, 235)
    )

    out = Image.new("RGBA", image.size, (0, 0, 0, 0))
    pixels = out.load()
    source_pixels = image.convert("RGBA").load()
    alpha_pixels = alpha.load()

    top = settings["top"]
    bottom = settings["bottom"]
    height = max(1, image.height - 1)

    for y in range(image.height):
        vertical = y / height
        for x in range(image.width):
            a = alpha_pixels[x, y]
            if a <= 1:
                continue

            sr, sg, sb, _ = source_pixels[x, y]
            texture = ((sr + sg + sb) / 765) - 0.5
            color = tuple(mix(top[i], bottom[i], vertical) for i in range(3))
            color = tuple(clamp(int(c + texture * 22), 0, 255) for c in color)
            pixels[x, y] = (*color, a)

    return out


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    sources = sorted(SOURCE_DIR.glob("FX_CloudAlpha*.png"))
    if not sources:
        raise SystemExit(f"No source PNG files found in {SOURCE_DIR}")

    for old in OUT_DIR.glob("cloud-*.png"):
        old.unlink()

    for index, path in enumerate(sources, start=1):
        source = Image.open(path)
        for name, settings in VARIANTS.items():
            out = make_variant(source, settings)
            out_path = OUT_DIR / f"cloud-{name}-{index:02d}.png"
            out.save(out_path, optimize=True)
            print(out_path.relative_to(ROOT))


if __name__ == "__main__":
    main()
