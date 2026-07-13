"""Build compact phenology stage assets from five-column transparent strips.

Each source strip must contain five specimens on a transparent background. The
script preserves their relative vertical scale, recentres every specimen, and
emits browser-friendly 512 px WebP files with alpha.
"""

from __future__ import annotations

import argparse
from collections import deque
from pathlib import Path

from PIL import Image, ImageFilter


STAGE_NAMES = ("implantation", "emergence", "vegetative", "reproductive", "maturity")


def specimen_segments(strip: Image.Image) -> list[tuple[int, int]]:
    """Locate the five disconnected specimens instead of assuming equal spacing."""
    factor = 4
    alpha = strip.getchannel("A")
    height = alpha.height // factor
    width = alpha.width // factor
    reduced = alpha.filter(ImageFilter.MaxFilter(5)).resize((width, height), Image.Resampling.BOX)
    mask = [value > 10 for value in reduced.get_flattened_data()]
    seen = bytearray(width * height)
    components: list[tuple[int, int, int]] = []

    for start in range(width * height):
        if not mask[start] or seen[start]:
            continue
        queue: deque[int] = deque([start])
        seen[start] = 1
        size = 0
        _, start_x = divmod(start, width)
        min_x = max_x = start_x

        while queue:
            current = queue.pop()
            y, x = divmod(current, width)
            size += 1
            min_x = min(min_x, x)
            max_x = max(max_x, x)
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    if not (dx or dy):
                        continue
                    next_y, next_x = y + dy, x + dx
                    if not (0 <= next_y < height and 0 <= next_x < width):
                        continue
                    next_index = next_y * width + next_x
                    if mask[next_index] and not seen[next_index]:
                        seen[next_index] = 1
                        queue.append(next_index)

        if size > 20:
            components.append((size, min_x * factor, (max_x + 1) * factor))

    plants = sorted(sorted(components, reverse=True)[: len(STAGE_NAMES)], key=lambda item: item[1])
    if len(plants) != len(STAGE_NAMES):
        raise ValueError(f"Expected five specimens, found {len(plants)}")

    boundaries = [0]
    for current, following in zip(plants, plants[1:]):
        boundaries.append(round((current[2] + following[1]) / 2))
    boundaries.append(strip.width)
    return list(zip(boundaries, boundaries[1:]))


def build_strip(source: Path, output_dir: Path, canvas_size: int = 512) -> None:
    strip = Image.open(source).convert("RGBA")
    output_dir.mkdir(parents=True, exist_ok=True)
    specimen_height = int(canvas_size * 0.9)
    segments = specimen_segments(strip)

    for (left, right), stage_name in zip(segments, STAGE_NAMES):
        specimen = strip.crop((left, 0, right, strip.height))

        alpha = specimen.getchannel("A")
        bbox = alpha.point(lambda value: 255 if value > 8 else 0).getbbox()
        if bbox is None:
            raise ValueError(f"No visible specimen in {source.name}, stage {stage_name}")

        horizontal_padding = max(4, int(specimen.width * 0.025))
        crop_left = max(0, bbox[0] - horizontal_padding)
        crop_right = min(specimen.width, bbox[2] + horizontal_padding)
        specimen = specimen.crop((crop_left, 0, crop_right, strip.height))

        scale = specimen_height / strip.height
        target_width = max(1, round(specimen.width * scale))
        specimen = specimen.resize((target_width, specimen_height), Image.Resampling.LANCZOS)

        canvas = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))
        x = (canvas_size - target_width) // 2
        y = canvas_size - specimen_height - 12
        canvas.alpha_composite(specimen, (x, y))

        output = output_dir / f"{stage_name}.webp"
        canvas.save(output, "WEBP", quality=88, method=4, exact=True)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source_dir", type=Path)
    parser.add_argument("output_dir", type=Path)
    args = parser.parse_args()

    strips = sorted(args.source_dir.glob("*-strip.png"))
    if not strips:
        raise SystemExit(f"No *-strip.png files found in {args.source_dir}")

    for source in strips:
        crop_name = source.stem.removesuffix("-strip")
        build_strip(source, args.output_dir / crop_name)
        print(f"Built {crop_name}: {len(STAGE_NAMES)} stages")


if __name__ == "__main__":
    main()
