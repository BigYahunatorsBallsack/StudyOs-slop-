"""App-Icon im Pixel-Stil (Farbschema „Retro“): offenes Buch vor einer Synthwave-Sonne, 16 × 16 Pixel.
Schreibt public/favicon.svg sowie die PNG-Icons (192, 512, maskierbar 512, Apple 180) mit harten Pixelkanten.

Aufruf: python3 tools/retro_icon.py   (braucht Pillow: python3 -m pip install pillow)"""
import sys
from PIL import Image

BG = '#0d0221'
COLORS = {'p': '#ff2a6d', 'c': '#05d9e8', 'y': '#ffd319', 'o': '#ff9b3d', 'w': '#f5e9ff', 'k': '#3d1f7a', 'r': '#c81d77'}
ART = """
................
.....yyyyyy.....
...yyyyyyyyyy...
..yyyyyyyyyyyy..
................
..oooooooooooo..
.pppppp..pppppp.
.pwwwwwppwwwwwp.
.pwcccwppwcccwp.
.pwwwwwppwwwwwp.
.pwccwwppwcccwp.
.pwwwwwppwwwwwp.
.pwcccwppwccwwp.
.pppppppppppppp.
kkkkkkkppkkkkkkk
rrrrrrrrrrrrrrrr
"""
ROWS = [r for r in ART.strip('\n').split('\n')]
N = len(ROWS)
assert all(len(r) == N for r in ROWS), 'Raster muss quadratisch sein'


def png(size, pad=0):
    """size Pixel, pad = Rand in Kunstpixeln (für maskierbare Icons)."""
    grid = N + 2 * pad
    img = Image.new('RGB', (grid, grid), BG)
    for y, row in enumerate(ROWS):
        for x, ch in enumerate(row[:N]):
            if ch in COLORS:
                img.putpixel((x + pad, y + pad), Image.new('RGB', (1, 1), COLORS[ch]).getpixel((0, 0)))
    return img.resize((size, size), Image.NEAREST)


def svg():
    rects = [f"<rect width='{N}' height='{N}' fill='{BG}'/>"]
    for y, row in enumerate(ROWS):
        x = 0
        while x < min(len(row), N):
            ch = row[x]
            run = 1
            while x + run < min(len(row), N) and row[x + run] == ch:
                run += 1
            if ch in COLORS:
                rects.append(f"<rect x='{x}' y='{y}' width='{run}' height='1' fill='{COLORS[ch]}'/>")
            x += run
    return f"<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 {N} {N}' shape-rendering='crispEdges'>{''.join(rects)}</svg>\n"


if __name__ == '__main__':
    out = sys.argv[1] if len(sys.argv) > 1 else 'public'
    open(f'{out}/favicon.svg', 'w', encoding='utf-8').write(svg())
    png(192).save(f'{out}/icon-192.png', optimize=True)
    png(512).save(f'{out}/icon-512.png', optimize=True)
    png(512, pad=2).save(f'{out}/icon-maskable-512.png', optimize=True)
    png(180).save(f'{out}/apple-touch-icon.png', optimize=True)
    print('Icons geschrieben nach', out)
