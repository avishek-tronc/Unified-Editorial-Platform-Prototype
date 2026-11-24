import textwrap, html, json, sys

W, H = 1700, 900
LANE_Y = [250, 490, 730]
X0, X1 = 330, 1450
SW = 176
R = 120
COL = [("#BFE3F7", "#1C7FC0"), ("#FBD9B0", "#D9822B"), ("#C9E7B4", "#4E9A2E")]


def esc(s):
    return html.escape(s, quote=True)


def wrap(text, width):
    return textwrap.wrap(text, width)


def text_block(cx, cy, text, width, size=15, weight="600", color="#1F2937", lh=1.22):
    lines = wrap(text, width)
    n = len(lines)
    out = []
    y0 = cy - (n - 1) * size * lh / 2 + size * 0.35
    for i, ln in enumerate(lines):
        out.append(f'<text x="{cx}" y="{y0 + i*size*lh:.1f}" font-size="{size}" font-weight="{weight}" fill="{color}" text-anchor="middle">{esc(ln)}</text>')
    return "".join(out)


def chevron(cx, cy, w, h, direction, stroke, fill="#FFFFFF"):
    t = 18
    l, r, tp, bt = cx - w / 2, cx + w / 2, cy - h / 2, cy + h / 2
    if direction > 0:
        pts = [(l, tp), (r - t, tp), (r + t, cy), (r - t, bt), (l, bt), (l + 2 * t, cy)]
    else:
        pts = [(r, tp), (l + t, tp), (l - t, cy), (l + t, bt), (r, bt), (r - 2 * t, cy)]
    p = " ".join(f"{x:.1f},{y:.1f}" for x, y in pts)
    return f'<polygon points="{p}" fill="{fill}" fill-opacity="0.92" stroke="{stroke}" stroke-width="2"/>'


def avatar(cx, cy, r, color, label=None):
    s = [f'<g><circle cx="{cx}" cy="{cy}" r="{r}" fill="#FFFFFF" stroke="{color}" stroke-width="4"/>',
         f'<circle cx="{cx}" cy="{cy - r*0.22:.1f}" r="{r*0.3:.1f}" fill="{color}"/>',
         f'<path d="M{cx - r*0.55:.1f},{cy + r*0.62:.1f} Q{cx},{cy - r*0.05:.1f} {cx + r*0.55:.1f},{cy + r*0.62:.1f} Z" fill="{color}"/>']
    if label:
        s.append(f'<text x="{cx}" y="{cy + r + 18}" font-size="13" font-weight="700" fill="{color}" text-anchor="middle">{esc(label)}</text>')
    s.append("</g>")
    return "".join(s)


def build(spec):
    o = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}" font-family="Segoe UI, Arial, Helvetica, sans-serif">',
         f'<rect width="{W}" height="{H}" fill="#FFFFFF"/>',
         f'<text x="40" y="52" font-size="30" font-weight="700" fill="#0039A6">{esc(spec["title"])}</text>',
         f'<text x="{W/2}" y="92" font-size="19" font-weight="600" fill="#C0187A" text-anchor="middle">{esc(spec["persona"])}</text>']
    # lane label column
    for i, lane in enumerate(spec["lanes"]):
        y = LANE_Y[i]
        o.append(f'<rect x="30" y="{y - 112}" width="70" height="224" rx="6" fill="#EEF3FB" stroke="#B4C7E7"/>')
        o.append(f'<text transform="translate(72,{y}) rotate(-90)" font-size="16" font-weight="700" fill="#1730A3" text-anchor="middle">{esc(lane["name"])}</text>')
    # bands
    y1, y2, y3 = LANE_Y
    o.append(f'<path d="M{X0},{y1} H{X1}" stroke="{COL[0][0]}" stroke-width="{SW}" fill="none" stroke-linecap="round"/>')
    o.append(f'<path d="M{X1},{y1} A{R},{R} 0 0 1 {X1},{y2}" stroke="{COL[1][0]}" stroke-width="{SW}" fill="none"/>')
    o.append(f'<path d="M{X1},{y2} H{X0}" stroke="{COL[1][0]}" stroke-width="{SW}" fill="none"/>')
    o.append(f'<path d="M{X0},{y2} A{R},{R} 0 0 0 {X0},{y3}" stroke="{COL[2][0]}" stroke-width="{SW}" fill="none"/>')
    o.append(f'<path d="M{X0},{y3} H{X1}" stroke="{COL[2][0]}" stroke-width="{SW}" fill="none" stroke-linecap="round"/>')
    # step labels
    o.append(f'<text x="{X0 + 120}" y="{y1 - SW/2 + 22}" font-size="16" font-weight="700" fill="{COL[0][1]}">{esc(spec["lanes"][0]["step"])}</text>')
    o.append(f'<text transform="translate({X1 + R + SW/2 - 14},{(y1+y2)/2}) rotate(90)" font-size="16" font-weight="700" fill="{COL[1][1]}" text-anchor="middle">{esc(spec["lanes"][1]["step"])}</text>')
    o.append(f'<text x="{X0 + 120}" y="{y3 - SW/2 + 22}" font-size="16" font-weight="700" fill="{COL[2][1]}">{esc(spec["lanes"][2]["step"])}</text>')
    o.append(f'<text transform="translate({X0 - R - SW/2 + 30},{(y2+y3)/2}) rotate(-90)" font-size="13" font-weight="700" fill="{COL[2][1]}" text-anchor="middle">{esc(spec.get("turn2", ""))}</text>')

    cw, ch = 255, 118
    # lane 1: avatar + pain bubble + 3 cards left->right
    l1 = spec["lanes"][0]["cards"]
    o.append(avatar(X0 - 10, y1, 56, COL[0][1]))
    xs = [X0 + 230, X0 + 520, X0 + 810, X0 + 1100]
    for k, c in enumerate(l1):
        o.append(chevron(xs[k], y1 + 6, cw, ch, 1, COL[0][1], "#FFFFFF" if k else "#FFF7E6"))
        o.append(text_block(xs[k] + 4, y1 + 6, c, 24, 15, "700" if k else "600", "#1F2937" if k else "#7A4B00"))
    # lane 2 right->left
    o.append(avatar(X1 + 30, y2, 50, COL[1][1]))
    xs2 = [X1 - 190, X1 - 480, X1 - 770, X1 - 1060]
    for k, c in enumerate(spec["lanes"][1]["cards"]):
        o.append(chevron(xs2[k], y2 + 6, cw, ch, -1, COL[1][1]))
        o.append(text_block(xs2[k] - 4, y2 + 6, c, 24, 15, "700"))
    # lane 3 left->right, last is outcome
    o.append(avatar(X0 - 10, y3, 50, COL[2][1]))
    l3 = spec["lanes"][2]["cards"]
    xs3 = [X0 + 230, X0 + 520, X0 + 810]
    for k, c in enumerate(l3[:-1]):
        o.append(chevron(xs3[k], y3 + 6, cw, ch, 1, COL[2][1]))
        o.append(text_block(xs3[k] + 4, y3 + 6, c, 24, 15, "700"))
    # outcome
    ox = X0 + 1090
    o.append(f'<rect x="{ox - 140}" y="{y3 - 62}" width="290" height="136" rx="16" fill="#0039A6"/>')
    o.append(text_block(ox, y3 + 6, l3[-1], 30, 16, "700", "#FFFFFF"))
    # legend
    o.append(f'<rect x="130" y="{H-44}" width="20" height="14" fill="#FFF7E6" stroke="{COL[0][1]}"/><text x="158" y="{H-32}" font-size="13" fill="#374151">Pain point today</text>')
    o.append(f'<rect x="300" y="{H-44}" width="20" height="14" fill="#FFFFFF" stroke="#6B7280"/><text x="328" y="{H-32}" font-size="13" fill="#374151">Activity supported by the working prototype</text>')
    o.append(f'<rect x="660" y="{H-44}" width="20" height="14" fill="#0039A6"/><text x="688" y="{H-32}" font-size="13" fill="#374151">Outcome for the persona</text>')
    o.append(f'<text x="{W-40}" y="{H-32}" font-size="12" fill="#6B7280" text-anchor="end">Format adapted from the Group-16 DT empathy journeys (slides 7 and 8)</text>')
    o.append("</svg>")
    return "".join(o)


if __name__ == "__main__":
    specs = json.load(open(sys.argv[1]))
    for name, spec in specs.items():
        open(f"{sys.argv[2]}/{name}.svg", "w").write(build(spec))
