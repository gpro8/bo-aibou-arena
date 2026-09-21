#!/usr/bin/env python3
"""JPG strips (checkerboard) → 160px 3-frame PNG sheets. Keep stem names."""
from collections import deque
from pathlib import Path
from PIL import Image
from shutil import copy2

CACHE = Path("/Users/gpro/.hermes/profiles/dao-mod-grok/cache/images")
ROOT = Path("/Users/gpro/bo-aibou-arena/art/foes")
SIZE = 160
JOBS = [
    ("chiri", "img_e7fa4eb0dbed.jpeg"),
    ("nuppe", "img_61a229b106d8.jpeg"),
    ("go", "img_6e1d216c2f3b.jpeg"),
    ("kama", "img_6748a6014cbb.jpeg"),
]


def is_check(r, g, b):
    sat = max(r, g, b) - min(r, g, b)
    lum = (r + g + b) / 3
    if sat <= 22 and lum >= 188:
        return True
    if sat <= 36 and lum >= 228:
        return True
    return False


def knock(im):
    im = im.convert("RGBA")
    w, h = im.size
    px = im.load()
    q = deque()
    seen = [bytearray(w) for _ in range(h)]

    def push(x, y):
        if 0 <= x < w and 0 <= y < h and not seen[y][x]:
            q.append((x, y))

    for x in range(w):
        push(x, 0)
        push(x, h - 1)
    for y in range(h):
        push(0, y)
        push(w - 1, y)
    while q:
        x, y = q.popleft()
        if seen[y][x]:
            continue
        seen[y][x] = 1
        r, g, b, a = px[x, y]
        if not is_check(r, g, b):
            continue
        px[x, y] = (0, 0, 0, 0)
        push(x + 1, y)
        push(x - 1, y)
        push(x, y + 1)
        push(x, y - 1)
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a and is_check(r, g, b):
                px[x, y] = (0, 0, 0, 0)
    for _ in range(2):
        kill = []
        for y in range(h):
            for x in range(w):
                r, g, b, a = px[x, y]
                if a == 0 or not is_check(r, g, b):
                    continue
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nx, ny = x + dx, y + dy
                    if nx < 0 or ny < 0 or nx >= w or ny >= h or px[nx, ny][3] == 0:
                        kill.append((x, y))
                        break
        for x, y in kill:
            px[x, y] = (0, 0, 0, 0)
    return im


def tight(im, pad=2):
    bbox = im.split()[-1].getbbox()
    if not bbox:
        return im
    x0, y0, x1, y1 = bbox
    return im.crop((max(0, x0 - pad), max(0, y0 - pad), min(im.width, x1 + pad), min(im.height, y1 + pad)))


def fit(im, fill=0.92):
    im = tight(im)
    w, h = im.size
    scale = min(SIZE / w, SIZE / h) * fill
    nw, nh = max(1, int(round(w * scale))), max(1, int(round(h * scale)))
    im = im.resize((nw, nh), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    x = (SIZE - nw) // 2
    y = SIZE - nh - 2
    if y < 2:
        y = (SIZE - nh) // 2
    canvas.paste(im, (x, y), im)
    return canvas


def main():
    src_dir = ROOT / "src"
    src_dir.mkdir(parents=True, exist_ok=True)
    for stem, fname in JOBS:
        src = CACHE / fname
        copy2(src, src_dir / f"{stem}.jpg")
        raw = Image.open(src).convert("RGB")
        w, h = raw.size
        cw = w // 3
        frames = []
        for i in range(3):
            strip = knock(raw.crop((i * cw, 0, (i + 1) * cw, h)))
            frames.append(fit(strip, fill=0.90 if stem != "kama" else 0.88))
        out = ROOT / stem
        out.mkdir(parents=True, exist_ok=True)
        sheet = Image.new("RGBA", (SIZE * 3, SIZE), (0, 0, 0, 0))
        for i, fr in enumerate(frames):
            fr.save(out / f"{i}.png")
            sheet.paste(fr, (i * SIZE, 0), fr)
        sheet.save(out / "sheet.png")
        print(stem, sheet.size, (out / "sheet.png").stat().st_size)


if __name__ == "__main__":
    main()
