"""Small geometry helpers on top of CadQuery shapes.

Everything is built from prisms (a 2-D polygon extruded along a world axis) and
boxes, so each feature's cross-section can be written down explicitly and is
easy to check.
"""
from __future__ import annotations

import math
from typing import Iterable, Sequence

import cadquery as cq

Pt = tuple[float, float]


def box(x0, x1, y0, y1, z0, z1) -> cq.Solid:
    return cq.Solid.makeBox(x1 - x0, y1 - y0, z1 - z0, cq.Vector(x0, y0, z0))


def _face_from(points3d) -> cq.Face:
    wire = cq.Wire.makePolygon([cq.Vector(*p) for p in points3d], close=True)
    return cq.Face.makeFromWires(wire)


def prism(axis: str, pts: Sequence[Pt], lo: float, hi: float) -> cq.Solid:
    """Extrude a polygon along a world axis.

    axis 'x': pts are (y, z), extruded from x=lo to x=hi
    axis 'y': pts are (x, z), extruded from y=lo to y=hi
    axis 'z': pts are (x, y), extruded from z=lo to z=hi
    """
    if axis == "x":
        p3 = [(lo, a, b) for a, b in pts]
        vec = cq.Vector(hi - lo, 0, 0)
    elif axis == "y":
        p3 = [(a, lo, b) for a, b in pts]
        vec = cq.Vector(0, hi - lo, 0)
    elif axis == "z":
        p3 = [(a, b, lo) for a, b in pts]
        vec = cq.Vector(0, 0, hi - lo)
    else:
        raise ValueError(axis)
    solid = cq.Solid.extrudeLinear(_face_from(p3), vec)
    if solid.Volume() < 0:   # polygon was clockwise for this axis: flip
        solid = cq.Solid(solid.wrapped.Reversed())
    return solid


def loft_rects(r0, z0, r1, z1) -> cq.Solid:
    """Ruled loft between two axis-aligned rectangles (x0, x1, y0, y1)."""
    def wire(r, z):
        x0, x1, y0, y1 = r
        return cq.Wire.makePolygon(
            [cq.Vector(x0, y0, z), cq.Vector(x1, y0, z), cq.Vector(x1, y1, z),
             cq.Vector(x0, y1, z)], close=True)
    return cq.Solid.makeLoft([wire(r0, z0), wire(r1, z1)], ruled=True)


def offset_polygon(pts: Sequence[Pt], d: float) -> list[Pt]:
    """Offset a convex-ish closed polygon outward by d (miter joins).

    Used for the dovetail groove (rail profile + clearance).  The rail profile
    is convex apart from the neck, and the neck corners are filled by the
    straight extension below the face, so a mitre offset is exact enough.
    """
    n = len(pts)
    # orientation: positive area = counter-clockwise
    area = sum(pts[i][0] * pts[(i + 1) % n][1] - pts[(i + 1) % n][0] * pts[i][1]
               for i in range(n)) / 2
    sgn = 1 if area > 0 else -1
    lines = []
    for i in range(n):
        (x0, y0), (x1, y1) = pts[i], pts[(i + 1) % n]
        dx, dy = x1 - x0, y1 - y0
        L = math.hypot(dx, dy)
        nx, ny = sgn * dy / L, -sgn * dx / L      # outward normal
        lines.append(((x0 + nx * d, y0 + ny * d), (dx, dy)))
    out = []
    for i in range(n):
        (p, r), (q, s) = lines[i - 1], lines[i]
        cross = r[0] * s[1] - r[1] * s[0]
        if abs(cross) < 1e-12:
            out.append(q)
            continue
        t = ((q[0] - p[0]) * s[1] - (q[1] - p[1]) * s[0]) / cross
        out.append((p[0] + t * r[0], p[1] + t * r[1]))
    return out


def fuse_all(base: cq.Shape, tools: Iterable[cq.Shape]) -> cq.Shape:
    tools = list(tools)
    return base.fuse(*tools).clean() if tools else base


def cut_all(base: cq.Shape, tools: Iterable[cq.Shape]) -> cq.Shape:
    tools = list(tools)
    return base.cut(*tools).clean() if tools else base


def single_solid(shape: cq.Shape) -> cq.Solid:
    solids = shape.Solids()
    if len(solids) != 1:
        vols = sorted((s.Volume() for s in solids), reverse=True)
        raise RuntimeError(f"expected one solid, got {len(solids)}: {vols[:6]}")
    return solids[0]


def translate(shape: cq.Shape, dx=0.0, dy=0.0, dz=0.0) -> cq.Shape:
    return shape.translate(cq.Vector(dx, dy, dz))


def rotate(shape: cq.Shape, axis: str, deg: float) -> cq.Shape:
    v = {"x": (1, 0, 0), "y": (0, 1, 0), "z": (0, 0, 1)}[axis]
    return shape.rotate(cq.Vector(0, 0, 0), cq.Vector(*v), deg)


def drop_to_bed(shape: cq.Shape) -> cq.Shape:
    """Move a shape so its bounding box starts at x=y=z=0."""
    bb = shape.BoundingBox()
    return translate(shape, -bb.xmin, -bb.ymin, -bb.zmin)
