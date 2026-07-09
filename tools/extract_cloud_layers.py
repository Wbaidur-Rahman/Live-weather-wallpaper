from pathlib import Path
from PIL import Image, ImageFilter, ImageEnhance


ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"
SOURCE = ASSETS / "rural-bengal-field.png"
MUTED = ASSETS / "rural-bengal-field-cloud-muted.png"

CROPS = [
    ("cloud-original-main.png", (250, 85, 1085, 440)),
    ("cloud-original-right.png", (930, 145, 1630, 455)),
    ("cloud-original-left-wisp.png", (0, 20, 455, 335)),
]


def alpha_for_pixel(r, g, b):
    mx = max(r, g, b)
    mn = min(r, g, b)
    saturation = 0 if mx == 0 else (mx - mn) / mx
    whiteness = min(r, g, b)

    cloud = (whiteness - 158) / 72
    low_sat = (0.48 - saturation) / 0.48
    bright = (mx - 150) / 80

    alpha = max(0, min(1, cloud)) * max(0, min(1, low_sat)) * max(0, min(1, bright))
    alpha = alpha ** 0.72
    value = int(max(0, min(230, alpha * 255)))
    return 0 if value < 24 else value


def extract_clouds(source):
    for name, box in CROPS:
        crop = source.crop(box).convert("RGBA")
        alpha = Image.new("L", crop.size, 0)
        src = crop.convert("RGB")

        alpha_pixels = []
        for r, g, b in src.getdata():
            alpha_pixels.append(alpha_for_pixel(r, g, b))
        alpha.putdata(alpha_pixels)
        alpha = alpha.filter(ImageFilter.GaussianBlur(2))
        alpha = ImageEnhance.Contrast(alpha).enhance(1.55)
        alpha = alpha.point(lambda value: 0 if value < 64 else min(235, int((value - 64) * 1.38)))
        alpha = feather_edges(alpha)
        alpha = alpha.filter(ImageFilter.GaussianBlur(1.2))

        furnished = furnish_cloud_colors(src, alpha)
        furnished.putalpha(alpha)
        furnished.save(ASSETS / name)


def furnish_cloud_colors(src, alpha):
    out = Image.new("RGB", src.size)
    pixels = []

    for (r, g, b), a in zip(src.getdata(), alpha.getdata()):
      lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
      blue_cast = max(0, b - (r + g) / 2)
      highlight = max(0, min(1, (lum - 168) / 72))
      underside = max(0, min(1, (176 - lum) / 70))

      neutral_r = 218 + highlight * 34 - underside * 42
      neutral_g = 222 + highlight * 31 - underside * 38
      neutral_b = 220 + highlight * 24 - underside * 28

      # Keep original cloud texture, but pull blue-sky leftovers toward cloud gray.
      keep = 0.38 if a > 110 else 0.24
      rr = r * keep + neutral_r * (1 - keep)
      gg = g * keep + neutral_g * (1 - keep)
      bb = (b - blue_cast * 0.35) * keep + neutral_b * (1 - keep)

      pixels.append((int(max(0, min(255, rr))), int(max(0, min(255, gg))), int(max(0, min(255, bb)))))

    out.putdata(pixels)
    out = ImageEnhance.Contrast(out).enhance(1.12)
    out = ImageEnhance.Brightness(out).enhance(1.03)
    return out


def feather_edges(alpha):
    width, height = alpha.size
    feather_x = 54
    feather_top = 24
    feather_bottom = 96
    pixels = []

    for y in range(height):
        top = min(1, y / feather_top)
        bottom = min(1, (height - 1 - y) / feather_bottom)
        vertical = max(0, min(top, bottom))
        for x in range(width):
            left = min(1, x / feather_x)
            right = min(1, (width - 1 - x) / feather_x)
            edge = max(0, min(left, right, vertical))
            pixels.append(int(alpha.getpixel((x, y)) * edge))

    out = Image.new("L", alpha.size, 0)
    out.putdata(pixels)
    return out


def create_muted_background(source):
    muted = source.convert("RGB")
    sky = muted.crop((0, 0, muted.width, int(muted.height * 0.54)))
    soft = sky.filter(ImageFilter.GaussianBlur(18))
    soft = ImageEnhance.Color(soft).enhance(0.86)
    soft = ImageEnhance.Brightness(soft).enhance(1.02)

    mask = Image.new("L", sky.size, 0)
    mask_pixels = []
    for x, y in ((x, y) for y in range(sky.height) for x in range(sky.width)):
        r, g, b = sky.getpixel((x, y))
        cloud_alpha = alpha_for_pixel(r, g, b)
        vertical = max(0, min(255, int((1 - y / sky.height) * 150 + 55)))
        mask_pixels.append(max(cloud_alpha, vertical // 3))
    mask.putdata(mask_pixels)
    mask = mask.filter(ImageFilter.GaussianBlur(12))

    muted.paste(Image.composite(soft, sky, mask), (0, 0))
    muted.save(MUTED)


def main():
    source = Image.open(SOURCE).convert("RGB")
    create_muted_background(source)
    extract_clouds(source)


if __name__ == "__main__":
    main()
