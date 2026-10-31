"""Projects Bangladesh division boundaries (geoBoundaries gbOpen BGD ADM1) to SVG paths in a 1000-wide viewBox."""
import json, math, sys
src, dst = sys.argv[1], sys.argv[2]
g = json.load(open(src, encoding="utf-8"))
NAMES = {"Chittagong": "Chattogram", "Barisal": "Barishal", "Dhaka": "Dhaka", "Khulna": "Khulna", "Mymensingh": "Mymensingh",
         "Rajshahi": "Rajshahi", "Rajshani": "Rajshahi", "Rangpur": "Rangpur", "Sylhet": "Sylhet"}
merc = lambda lon, lat: (lon, math.degrees(math.log(math.tan(math.pi / 4 + math.radians(lat) / 2))))
rings = []
for f in g["features"]:
    geom = f["geometry"]
    polys = geom["coordinates"] if geom["type"] == "MultiPolygon" else [geom["coordinates"]]
    rings.append((NAMES[f["properties"]["shapeName"]], [[merc(*p[:2]) for p in ring] for poly in polys for ring in poly]))
xs = [p[0] for _, rs in rings for r in rs for p in r]; ys = [p[1] for _, rs in rings for r in rs for p in r]
W = 1000; s = W / (max(xs) - min(xs)); H = (max(ys) - min(ys)) * s
out = []
for name, rs in rings:
    parts, cx, cy, n = [], 0, 0, 0
    for r in rs:
        pts = [((x - min(xs)) * s, (max(ys) - y) * s) for x, y in r]
        if len(pts) < 4: continue
        parts.append("M" + "L".join(f"{x:.1f},{y:.1f}" for x, y in pts) + "Z")
        cx += sum(p[0] for p in pts); cy += sum(p[1] for p in pts); n += len(pts)
    out.append({"division": name, "path": "".join(parts), "cx": round(cx / n, 1), "cy": round(cy / n, 1), "w": W, "h": round(H, 1)})
json.dump(out, open(dst, "w", encoding="utf-8"), separators=(",", ":"))
print(len(out), round(H), sum(len(o["path"]) for o in out))
