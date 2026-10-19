"""Erzeugt die Grafiken des Farbschemas „Retro“ (src/retro.css): die Pixel-Skyline als SVG-Daten-URI
(Gebäude in zwei Reihen, einzelne beleuchtete Fenster, Horizont-Glühen in harten Stufen) und die Pixel-Sonne
als clip-path-Polygon. Fester Zufalls-Startwert, also immer dieselbe Stadt.

Aufruf: python3 tools/retro_skyline.py  → Werte in src/retro.css bei url(...) bzw. clip-path einsetzen."""
import random, urllib.parse, math
random.seed(7)
W, H = 320, 72
parts = [f"<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 {W} {H}' width='{W}' height='{H}' shape-rendering='crispEdges'>"]
# Horizont-Glühen: harte Stufen statt Verlauf
for i, (c, o) in enumerate([('#ff2a6d', .10), ('#ff2a6d', .16), ('#c81d77', .22), ('#7b1fa2', .30)]):
    y = H - 34 + i * 6
    parts.append(f"<rect x='0' y='{y}' width='{W}' height='{H - y}' fill='{c}' fill-opacity='{o}'/>")
# hintere Reihe (dunkler, niedriger), vordere Reihe
for layer, (col, hmin, hmax, wmin, wmax) in enumerate([('#24104f', 14, 34, 10, 22), ('#160733', 18, 52, 12, 26)]):
    x = -random.randint(0, 8)
    while x < W:
        w = random.randint(wmin, wmax); h = random.randint(hmin, hmax)
        y = H - h
        parts.append(f"<rect x='{x}' y='{y}' width='{w}' height='{h}' fill='{col}'/>")
        if layer == 1 and random.random() < .35:  # Antenne / Dachaufbau
            parts.append(f"<rect x='{x + w // 2}' y='{y - 4}' width='2' height='4' fill='{col}'/>")
        # Fenster: einzelne beleuchtete Pixel
        for wy in range(y + 3, H - 3, 4):
            for wx in range(x + 2, x + w - 2, 4):
                if random.random() < (.10 if layer == 0 else .16):
                    c = random.choice(['#ffd319', '#ffd319', '#05d9e8', '#ff2a6d'])
                    parts.append(f"<rect x='{wx}' y='{wy}' width='2' height='2' fill='{c}' fill-opacity='{.55 if layer == 0 else .8}'/>")
        x += w + random.randint(0, 3)
parts.append("</svg>")
svg = "".join(parts)
uri = "data:image/svg+xml," + urllib.parse.quote(svg, safe="/:=' ")
print('SKYLINE:', uri)
# Pixel-Kreis als Polygon (16 Stufen je Hälfte)
N = 12; pts_r = []; pts_l = []
for i in range(N):
    y0, y1 = i / N, (i + 1) / N
    ym = (y0 + y1) / 2
    half = math.sqrt(max(0, .25 - (ym - .5) ** 2))
    xr, xl = .5 + half, .5 - half
    pts_r += [(xr, y0), (xr, y1)]
    pts_l += [(xl, y0), (xl, y1)]
poly = pts_r + list(reversed(pts_l))
print('SONNE:', "polygon(" + ", ".join(f"{x*100:.1f}% {y*100:.1f}%" for x, y in poly) + ")")
