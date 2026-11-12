"""Support-free printability check on the exported STL meshes.

The part is sliced at the layer height.  For every layer, the area that is
not resting on the previous layer (allowing a 50 deg overhang) is found and
classified:

  overhang  - extends <= 0.6 mm past the layer below (normal sloped wall)
  bridge    - spans between two or more supported points (span reported)
  cantilever- unsupported area attached on one side only and reaching > 1 mm
  island    - not touching the previous layer at all (would need support)

Cantilevers and islands are failures; bridges are reported with their span.
"""
from __future__ import annotations

import math

import numpy as np
import trimesh
from shapely.geometry import Point, MultiPolygon, Polygon
from shapely.ops import unary_union


def _poly(section):
    if section is None:
        return Polygon()
    try:
        polys = section.polygons_full
    except Exception:
        return Polygon()
    if not polys:
        return Polygon()
    return unary_union([p.buffer(0) for p in polys])


def _parts(geom):
    if geom.is_empty:
        return []
    if isinstance(geom, Polygon):
        return [geom]
    return [g for g in getattr(geom, "geoms", []) if isinstance(g, Polygon)]


def analyze(mesh: trimesh.Trimesh, layer=0.2, max_angle=50.0, sliver=0.25):
    zmax = mesh.bounds[1][2]
    zs = np.arange(layer / 2, zmax, layer)
    secs = mesh.section_multiplane(plane_origin=[0, 0, 0], plane_normal=[0, 0, 1], heights=zs)
    allow = layer * math.tan(math.radians(max_angle))
    prev = None
    prev_wkb = None
    findings = []
    for z, sec in zip(zs, secs):
        cur = _poly(sec)
        if prev is None:
            prev = cur
            continue
        wkb = cur.wkb if not cur.is_empty else None
        if wkb is not None and wkb == prev_wkb:
            continue
        prev_wkb = wkb
        support = prev.buffer(allow)
        un = cur.difference(support)
        un = un.buffer(-sliver / 2).buffer(sliver / 2)
        for comp in _parts(un):
            if comp.area < 0.05:
                continue
            ring = comp.exterior.segmentize(0.3)
            pts = list(ring.coords)
            dmax = max(prev.distance(Point(xy)) for xy in pts)
            touch = comp.buffer(allow + sliver).intersection(prev.buffer(0.05))
            n_touch = len(_parts(touch)) if not touch.is_empty else 0
            if n_touch == 0:
                kind = "island"
            elif dmax <= 0.6:
                kind = "overhang"
            elif n_touch >= 2:
                kind = "bridge"
            else:
                kind = "cantilever" if dmax > 1.0 else "overhang"
            b = comp.bounds
            findings.append(dict(z=round(float(z), 2), kind=kind, area=round(comp.area, 2),
                                 reach=round(dmax, 2), span=round(2 * dmax, 1),
                                 bbox=[round(v, 1) for v in b]))
        prev = cur
    return findings


def summarize(name, findings):
    bad = [f for f in findings if f["kind"] in ("island", "cantilever")]
    bridges = [f for f in findings if f["kind"] == "bridge"]
    over = [f for f in findings if f["kind"] == "overhang"]
    longest = max((b["span"] for b in bridges), default=0.0)
    return dict(part=name, failures=len(bad), bridges=len(bridges), longest_bridge=longest,
                overhang_layers=len(over), details_bad=bad[:12],
                bridges_list=sorted(bridges, key=lambda f: -f["span"])[:8])
