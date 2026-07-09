from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets" / "rural-bengal-field.png"
OUTPUT = ROOT / "assets" / "rural-bengal-field-clear-sky.png"


def clamp(value, low, high):
    return max(low, min(high, value))


def smoothstep(edge0, edge1, value):
    t = clamp((value - edge0) / (edge1 - edge0), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def lerp(a, b, t):
    return int(round(a + (b - a) * t))


def sky_color(y, height):
    top = (76, 174, 226)
    mid = (127, 199, 230)
    horizon = (207, 229, 214)

    t = y / max(1, height - 1)
    if t < 0.36:
        local = t / 0.36
        return tuple(lerp(top[i], mid[i], local) for i in range(3))

    local = (t - 0.36) / 0.34
    local = clamp(local, 0.0, 1.0)
    return tuple(lerp(mid[i], horizon[i], local) for i in range(3))


def replacement_alpha(x, y, width, height, pixel):
    r, g, b = pixel
    lum = (r * 0.299) + (g * 0.587) + (b * 0.114)
    horizon_start = int(height * 0.49)
    horizon_end = int(height * 0.58)

    if y < horizon_start:
        vertical = 1.0
    elif y > horizon_end:
        vertical = 0.0
    else:
        vertical = 1.0 - smoothstep(horizon_start, horizon_end, y)

    blue_sky = b > 112 and b >= r * 0.82 and b >= g * 0.78
    pale_cloud = lum > 145 and abs(r - g) < 58 and abs(g - b) < 72
    sky_like = blue_sky or pale_cloud

    if not sky_like and y > int(height * 0.37):
        vertical *= 0.22

    green_vegetation = g > r * 1.04 and g > b * 0.86 and lum < 162
    dark_tree = lum < 118 and g >= r * 0.92
    if y > int(height * 0.39) and (green_vegetation or dark_tree):
        vertical *= 0.04

    # Leave a faint atmospheric glow near the left horizon from the original
    # image; it helps the replacement sky sit behind the tree line.
    left_haze = 1.0 - smoothstep(0, width * 0.34, x)
    if y > int(height * 0.34):
        vertical *= 1.0 - left_haze * 0.15

    return clamp(vertical, 0.0, 1.0)


def main():
    source = Image.open(SOURCE).convert("RGB")
    width, height = source.size
    pixels = source.load()
    output = Image.new("RGB", source.size)
    out = output.load()

    for y in range(height):
        base_color = sky_color(y, height)
        for x in range(width):
            original = pixels[x, y]
            alpha = replacement_alpha(x, y, width, height, original)

            # A tiny bit of original blue variation prevents the sky from
            # looking digitally flat while still removing the baked clouds.
            variation = ((x * 13 + y * 7) % 17) - 8
            clear = (
                clamp(base_color[0] + variation // 3, 0, 255),
                clamp(base_color[1] + variation // 4, 0, 255),
                clamp(base_color[2] + variation // 5, 0, 255),
            )

            out[x, y] = tuple(lerp(original[i], clear[i], alpha) for i in range(3))

    output.save(OUTPUT, optimize=True)
    print(f"Wrote {OUTPUT}")


if __name__ == "__main__":
    main()
