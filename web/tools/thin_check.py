"""Layer-by-layer printability check for a 0.4 mm nozzle at 0.2 mm layers.

For every layer it finds:
  thin  - material narrower than 0.4 mm (a slicer drops it or prints it as a gap fill)
  gaps  - slots or clearances narrower than 0.3 mm (they fuse shut)
  islands - material only one layer (0.2 mm) thick in z
Reports regions bigger than a small area threshold so sharp-corner rounding is ignored.
"""
import glob
import os
import sys

import numpy as np
import trimesh
from shapely.geometry import MultiPolygon, Polygon
from shapely.ops import unary_union

LAYER = 0.2


def section(m, z):
    s = m.section(plane_origin=[0, 0, z], plane_normal=[0, 0, 1])
    if s is None:
        return Polygon()
    p2, _ = s.to_2D(to_2D=np.eye(4))
    polys = [Polygon(pl.exterior, pl.interiors) for pl in p2.polygons_full]
    return unary_union([q.buffer(0) for q in polys]) if polys else Polygon()


def pieces(geom, min_area, min_len):
    out = []
    gs = geom.geoms if hasattr(geom, "geoms") else [geom]
    for g in gs:
        if g.is_empty or g.area < min_area:
            continue
        x0, y0, x1, y1 = g.bounds
        if max(x1 - x0, y1 - y0) < min_len:
            continue
        if g.area / max(x1 - x0, y1 - y0) < 0.15:   # sub-0.15 mm sliver from layer stepping
            continue
        out.append((round(g.area, 2), [round(v, 1) for v in g.bounds]))
    return out


def check(fn):
    m = trimesh.load(fn)
    z0, z1 = m.bounds[0][2], m.bounds[1][2]
    zs = np.arange(z0 + LAYER / 2, z1, LAYER)
    secs = [section(m, z) for z in zs]
    probs = {"thin": [], "gaps": [], "islands": []}
    def gap_of(P):
        return P.buffer(0.15, join_style=2).buffer(-0.15, join_style=2).difference(P)
    gapsec = [gap_of(P) if not P.is_empty else Polygon() for P in secs]
    for i, (z, P) in enumerate(zip(zs, secs)):
        if P.is_empty:
            continue
        thin = P.difference(P.buffer(-0.2, join_style=2).buffer(0.2, join_style=2))
        for a, b in pieces(thin, 0.15, 1.0):
            probs["thin"].append((round(z, 1), a, b))
        # a real slot persists; a roof apex closes within a layer or two
        gap = gapsec[i]
        if 0 < i < len(secs) - 1:
            try:
                gap = gap.buffer(0).intersection(gapsec[i - 1].buffer(0.1)).intersection(gapsec[i + 1].buffer(0.1))
            except Exception:
                gap = gap.buffer(0.01).intersection(gapsec[i - 1].buffer(0.11)).intersection(gapsec[i + 1].buffer(0.11))
        for a, b in pieces(gap, 0.15, 1.0):
            probs["gaps"].append((round(z, 1), a, b))
        if 0 < i < len(secs) - 1:
            lone = P.difference(secs[i - 1].buffer(0.05)).difference(secs[i + 1].buffer(0.05))
            for a, b in pieces(lone, 0.5, 1.0):
                probs["islands"].append((round(z, 1), a, b))
    return m, probs


def main():
    files = []
    for d in sys.argv[1:]:
        files += sorted(glob.glob(os.path.join(d, "*.stl")))
    bad = 0
    for fn in files:
        m, pr = check(fn)
        n = sum(len(v) for v in pr.values())
        bad += n > 0
        tag = "OK " if not n else "CHK"
        print(f"{tag} {os.path.basename(fn):40s} layers {int(m.extents[2] / LAYER):4d}  "
              + "  ".join(f"{k} {len(v)}" for k, v in pr.items()))
        for k, v in pr.items():
            for row in v[:4]:
                print(f"      {k}: z={row[0]} area={row[1]} bounds={row[2]}")
            if len(v) > 4:
                print(f"      {k}: ... {len(v) - 4} more layers")
    print(f"\n{len(files)} meshes, {bad} flagged")


if __name__ == "__main__":
    main()
