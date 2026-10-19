"""Draws the app icons as PNGs using only the Python standard library.

Run from the repo root: python3 scripts/make_icons.py
Writes public/icons/icon-192.png, icon-512.png and icon-maskable-512.png. The shapes match
public/icons/icon.svg: two boxes joined by a line, with a packet travelling between them.
"""

import struct
import zlib
from pathlib import Path

NAVY = (0x16, 0x22, 0x4A)
YELLOW = (0xFF, 0xE1, 0x4D)
WHITE = (0xFF, 0xFF, 0xFF)
LINE = (0xA9, 0xB3, 0xDA)
BLUE = (0x7D, 0x95, 0xFF)
SAMPLES = 3  # supersampling per axis, for smooth edges


def rounded_rect(cx, cy, w, h, r):
    def inside(x, y):
        dx = max(abs(x - cx) - (w / 2 - r), 0)
        dy = max(abs(y - cy) - (h / 2 - r), 0)
        return dx * dx + dy * dy <= r * r
    return inside


def circle(cx, cy, r):
    return lambda x, y: (x - cx) ** 2 + (y - cy) ** 2 <= r * r


def shapes(maskable):
    # Maskable icons get cropped to a circle by Android, so the drawing must sit in the
    # central safe zone (a circle of 80% diameter); shrink it and fill the whole square.
    s = 0.72 if maskable else 1.0

    def at(v):
        return 0.5 + (v - 0.5) * s

    bg = (lambda x, y: True) if maskable else rounded_rect(0.5, 0.5, 1.0, 1.0, 0.2)
    return [
        (bg, NAVY),
        (rounded_rect(0.5, 0.5, 0.40 * s, 0.022 * s, 0.011 * s), LINE),
        (rounded_rect(at(0.28), 0.5, 0.30 * s, 0.20 * s, 0.05 * s), YELLOW),
        (rounded_rect(at(0.72), 0.5, 0.30 * s, 0.20 * s, 0.05 * s), WHITE),
        (circle(0.5, 0.5, 0.06 * s), BLUE),
    ]


def render(size, maskable=False):
    layers = shapes(maskable)
    rows = []
    n = SAMPLES * SAMPLES
    for py in range(size):
        row = bytearray([0])  # PNG filter type 0 for this scanline
        for px in range(size):
            r = g = b = a = 0
            for sy in range(SAMPLES):
                for sx in range(SAMPLES):
                    x = (px + (sx + 0.5) / SAMPLES) / size
                    y = (py + (sy + 0.5) / SAMPLES) / size
                    colour = None
                    for inside, c in layers:
                        if inside(x, y):
                            colour = c
                    if colour:
                        r += colour[0]
                        g += colour[1]
                        b += colour[2]
                        a += 255
            if a:
                cover = a // 255
                row += bytes((r // cover, g // cover, b // cover, a // n))
            else:
                row += bytes(4)
        rows.append(bytes(row))
    return png(size, b''.join(rows))


def png(size, raw):
    def chunk(kind, data):
        return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data) & 0xFFFFFFFF)

    header = struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0)  # 8-bit RGBA
    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', header) + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b'')


def main():
    out = Path('public/icons')
    out.mkdir(parents=True, exist_ok=True)
    for name, size, maskable in [('icon-192.png', 192, False), ('icon-512.png', 512, False), ('icon-maskable-512.png', 512, True)]:
        (out / name).write_bytes(render(size, maskable))
        print('wrote', out / name)


if __name__ == '__main__':
    main()
