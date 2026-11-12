"""Part generators: case (housing), drawer, divider, base plate, test pieces.

All parts are returned in "use" coordinates (see params.py).  The case is
already in its print orientation: front face down on the bed (z = 0).
Use print_pose() to get the other parts into their print orientation.
"""
from __future__ import annotations

import math

import cadquery as cq

from .params import Params
from .geom import (box, prism, loft_rects, offset_polygon, fuse_all, cut_all,
                   single_solid, translate, rotate, drop_to_bed)

SQ2 = math.sqrt(2.0)
EMB = 0.6  # how far rails are embedded into their wall for a clean union


# ===================================================================== dovetail
def rail_profile(p: Params):
    """Rail cross-section in (u, v): u across the rail, v out of the R face."""
    a = p.dt_neck / 2
    h = p.dt_height
    b = a + h * math.tan(math.radians(p.dt_angle))
    k = p.dt_tip_chamfer
    L = math.hypot(b - a, h)
    fx, fy = (b - a) / L, h / L
    c1 = (b - fx * k, h - fy * k)
    c2 = (b - k, h)
    return [(-a, -EMB), (a, -EMB), (a, 0.0), c1, c2,
            (-c2[0], c2[1]), (-c1[0], c1[1]), (-a, 0.0)]


def groove_profile(p: Params, extra: float = 0.0):
    return offset_polygon(rail_profile(p), p.fit_dovetail + extra)


def groove_mouth_halfwidth(p: Params):
    th = math.radians(p.dt_angle)
    return p.dt_neck / 2 + p.gap * math.tan(th) + p.fit_dovetail / math.cos(th)


def _map(face: str, c: float, base: float, pts):
    """Map (u, v) dovetail coordinates onto a module face.

    face 'top'    : rail on the top face, u -> x (centre c), v -> +y from base
    face 'right'  : rail on the right face, u -> y (centre c), v -> +x from base
    """
    if face == "top":
        return [(c + u, base + v) for u, v in pts]            # (x, y)
    if face == "right":
        return [(base + v, c + u) for u, v in pts]            # (x, y)
    raise ValueError(face)


def _ramp_keep(face: str, base: float, z_start: float, c: float, span: float,
               depth: float, slack: float = 0.0):
    """Half-space prism keeping v <= z - z_start (+slack): 45 deg front end."""
    lo, hi = c - span, c + span
    big = depth + 20
    pts = [(-8.0, z_start - 8.0 + slack), (12.0, z_start + 12.0 + slack),
           (12.0, big), (-8.0, big)]                        # (v, z)
    if face == "top":
        return prism("x", [(base + v, z) for v, z in pts], lo, hi)
    return prism("y", [(base + v, z) for v, z in pts], lo, hi)


def rail(p: Params, face: str, c: float, base: float, z_end: float):
    sec = _map(face, c, base, rail_profile(p))
    solid = prism("z", sec, p.dt_start - 2.0, z_end)
    keep = _ramp_keep(face, base, p.dt_start, c, 10.0, z_end)
    return solid.intersect(keep)


def groove_cutter(p: Params, face: str, c: float, base: float, z_end: float):
    """Cutter for the groove in the neighbour that receives a rail.

    `base` is the plane of the R face the rail stands on (v = 0), expressed in
    the coordinates of the module being cut.
    """
    prof = groove_profile(p)
    main = prism("z", _map(face, c, base, prof), p.dt_start - 2.0, z_end + 1.0)
    m = groove_mouth_halfwidth(p)
    k = 0.4
    g = p.gap
    mouth = [(-(m + k), g - 1.0), (m + k, g - 1.0), (m + k, g), (m, g + k),
             (-m, g + k), (-(m + k), g)]
    mouth_s = prism("z", _map(face, c, base, mouth), p.dt_start - 2.0, z_end + 1.0)
    keep = _ramp_keep(face, base, p.dt_start, c, 12.0, z_end + 1.0)
    cutter = main.fuse(mouth_s).intersect(keep)
    # rear lead-in flare (loft between the groove and a wider groove)
    # it widens the mouth and flanks only: the groove floor keeps its depth, so the
    # wall behind it never thins below the groove backing
    # (each half is shifted sideways, so every edge stays parallel to its partner)
    flare_prof = [(u + math.copysign(p.dt_flare, u), v) for u, v in prof]
    z0 = z_end - p.dt_flare_len

    def wire(points, z):
        pts3 = [cq.Vector(x, y, z) for x, y in _map(face, c, base, points)]
        return cq.Wire.makePolygon(pts3, close=True)
    flare = cq.Solid.makeLoft([wire(prof, z0), wire(flare_prof, z_end + 0.01)], ruled=True)
    tail = prism("z", _map(face, c, base, flare_prof), z_end + 0.01 - 1e-3, z_end + 1.0)
    return cutter.fuse(flare, tail)


# ===================================================================== flexures
def _flexure_cuts(p, wall, span, free_at_low, t, tongue_kind, recess=0.0):
    """Slits and outer pocket that free a tongue in a G wall.

    wall  : 'bottom' (tongue runs along x) or 'left' (tongue runs along y)
    span  : (a, b) extent of the tongue along its length, a < b
    free_at_low : True if the free end is at `a`
    t     : tongue thickness, measured from the inner face of the wall
    Returns list of cutter solids.
    """
    a, b = span
    s = p.slit
    out_face = p.gap / 2                       # outer face of the G wall
    inner = p.gap / 2 + p.thick                # inner face of the G wall
    zt = p.band
    ext = (a - s, b) if free_at_low else (a, b + s)
    cuts = []
    # free-end slit, full band height, through the wall
    fs = (a - s, a) if free_at_low else (b, b + s)
    # rear slit across the tongue, through the wall
    rear = (ext[0], ext[1])
    # pocket: everything outside the tongue thickness, 45 deg roof for printing
    tp = inner - recess - t
    pocket_pts = [(out_face - 1.5, -1.0), (tp, -1.0), (tp, zt + s),
                  (out_face, zt + s + (tp - out_face)),
                  (out_face - 1.5, zt + s + (tp - out_face) + 1.5)]
    # flare the free-end slit where it meets the bed so first-layer squish
    # (elephant's foot) cannot weld the tongue to the wall
    fl = 0.4
    flare = [(fs[0] - fl, -1.0), (fs[1] + fl, -1.0), (fs[1] + fl, 0.0), (fs[1], 2 * fl),
             (fs[0], 2 * fl), (fs[0] - fl, 0.0)]
    if recess > 0 and wall == "bottom":
        cuts.append(box(ext[0], ext[1], inner - recess, inner + 0.6, -1.0, zt + s))
    if wall == "bottom":
        cuts.append(prism("y", flare, out_face - 1.5, inner + 0.6))
        cuts.append(box(fs[0], fs[1], out_face - 1.5, inner + 0.6, -1.0, zt + s))
        cuts.append(box(rear[0], rear[1], out_face - 1.5, inner + 0.6, zt, zt + s))
        cuts.append(prism("x", pocket_pts, ext[0], ext[1]))
    else:  # left wall: thickness along x, tongue along y
        cuts.append(prism("x", flare, out_face - 1.5, inner + 0.6))
        cuts.append(box(out_face - 1.5, inner + 0.6, fs[0], fs[1], -1.0, zt + s))
        cuts.append(box(out_face - 1.5, inner + 0.6, rear[0], rear[1], zt, zt + s))
        cuts.append(prism("y", pocket_pts, ext[0], ext[1]))
    return cuts


def lock_bump(p, wall, lo, hi):
    """Bump on a lock tongue, protruding out of the G face."""
    tp = p.gap / 2 + p.thick - p.lock_t      # tongue outer surface
    prof = p.lock_profile()                  # (v outward, z)
    if wall == "bottom":
        return prism("x", [(tp - v, z) for v, z in prof], lo, hi)
    return prism("y", [(tp - v, z) for v, z in prof], lo, hi)


def stop_bump(p, lo, hi):
    """Drawer-stop bump on the floor (bottom wall), protruding up."""
    inner = p.gap / 2 + p.thick
    prof = p.stop_profile()                  # (v above the floor, z)
    pts = [(inner + v, z) for v, z in prof]
    # sink the base slightly into the tongue for a clean union
    vb = prof[0][0] - 0.3
    pts = [(inner + vb, prof[0][1])] + pts + [(inner + vb, prof[-1][1])]
    return prism("x", pts, lo, hi)


def bottom_layout(p: Params, w: int, h: int):
    """Positions of the flexures in the bottom wall and the left wall."""
    xi0, xi1, yi0, yi1 = p.interior(w, h)
    s = p.slit
    stops = [
        dict(span=(xi0 + s, xi0 + s + p.stop_len), free_low=True,
             bump=(xi0 + s + 0.2, xi0 + s + 0.2 + p.stop_bump_w)),
        dict(span=(xi1 - s - p.stop_len, xi1 - s), free_low=False,
             bump=(xi1 - s - 0.2 - p.stop_bump_w, xi1 - s - 0.2)),
    ]
    locks_b = []
    for i in range(w):
        xf = i * p.unit_w + p.lock_x
        locks_b.append(dict(span=(xf, xf + p.lock_len), free_low=True,
                            bump=(xf + 0.3, xf + 0.3 + p.lock_bump_w)))
    locks_l = []
    for j in range(h):
        yf = j * p.unit_h + p.lock_y
        locks_l.append(dict(span=(yf, yf + p.lock_len), free_low=True,
                            bump=(yf + 0.3, yf + 0.3 + p.lock_bump_w)))
    return stops, locks_b, locks_l


def window_cutters(p: Params, w: int, h: int, top=True, right=True, x1=None,
                   yref_top=None):
    xi0, xi1, yi0, yi1 = p.interior(w, h)
    X0, X1, Y0, Y1 = p.outer(w, h)
    wz0, wz1, _ = p.lock_window_z()
    f = p.window_fit
    cuts = []
    if top:
        for i in range(w):
            xa = i * p.unit_w + p.lock_x + 0.3 - f
            cuts.append(box(xa, xa + p.lock_bump_w + 2 * f, yi1 - 1.0, Y1 + 1.0, wz0, wz1))
    if right:
        for j in range(h):
            ya = j * p.unit_h + p.lock_y + 0.3 - f
            cuts.append(box(xi1 - 1.0, X1 + 1.0, ya, ya + p.lock_bump_w + 2 * f, wz0, wz1))
    return cuts


# ===================================================================== case
def front_outer_chamfers(p, X0, X1, Y0, Y1, c=None):
    c = p.edge_chamfer if c is None else c
    tri = lambda b: [(b - 3, -3), (b + c + 3, -3), (b - 3, c + 3)]
    cuts = [
        prism("x", [(y, z) for y, z in tri(Y0)], X0 - 1, X1 + 1),
        prism("x", [(2 * Y1 - y, z) for y, z in tri(Y1)], X0 - 1, X1 + 1),
        prism("y", [(x, z) for x, z in tri(X0)], Y0 - 1, Y1 + 1),
        prism("y", [(2 * X1 - x, z) for x, z in tri(X1)], Y0 - 1, Y1 + 1),
    ]
    return cuts


def case(p: Params, w: int = 1, h: int = 1, depth: float | None = None) -> cq.Solid:
    """Outer casing for a w x h module (front face on the bed, z = 0)."""
    D = p.depth if depth is None else depth
    X0, X1, Y0, Y1 = p.outer(w, h)
    xi0, xi1, yi0, yi1 = p.interior(w, h)
    c = p.edge_chamfer

    body = box(X0, X1, Y0, Y1, 0.0, D)
    cuts = front_outer_chamfers(p, X0, X1, Y0, Y1)
    cuts.append(box(xi0, xi1, yi0, yi1, -1.0, D + 1.0))
    cuts.append(loft_rects((xi0 - c - 1, xi1 + c + 1, yi0 - c - 1, yi1 + c + 1), -1.0,
                           (xi0, xi1, yi0, yi1), c))
    body = cut_all(body, cuts)

    # rear lip: drawer push-in stop, 45 deg chamfer so it prints without support
    L, T = p.rear_lip_w, p.rear_lip_t
    za = D - T - L
    lip = box(xi0, xi1, yi0, yi1, za, D)
    lip = lip.cut(loft_rects((xi0 - 0.01, xi1 + 0.01, yi0 - 0.01, yi1 + 0.01), za - 0.01,
                             (xi0 + L, xi1 - L, yi0 + L, yi1 - L), D - T),
                  box(xi0 + L, xi1 - L, yi0 + L, yi1 - L, D - T - 0.02, D + 1))
    adds = [lip]

    # rails: top face (one per column) and right face (one per row)
    for i in range(w):
        adds.append(rail(p, "top", (i + 0.5) * p.unit_w, Y1, D))
    for j in range(h):
        adds.append(rail(p, "right", (j + 0.5) * p.unit_h, X1, D))
    body = fuse_all(body, adds)

    # grooves: bottom (receives the rail of the module below, whose top face is
    # at y = -gap/2) and left (receives the rail of the module to the left)
    cuts = []
    for i in range(w):
        cuts.append(groove_cutter(p, "top", (i + 0.5) * p.unit_w, -p.gap / 2, D))
    for j in range(h):
        cuts.append(groove_cutter(p, "right", (j + 0.5) * p.unit_h, -p.gap / 2, D))
    # lock windows in the R faces
    cuts += window_cutters(p, w, h)
    # flexures in the G faces
    stops, locks_b, locks_l = bottom_layout(p, w, h)
    for s in stops:
        cuts += _flexure_cuts(p, "bottom", s["span"], s["free_low"], p.stop_t, "stop",
                              recess=p.stop_recess)
    for lk in locks_b:
        cuts += _flexure_cuts(p, "bottom", lk["span"], lk["free_low"], p.lock_t, "lock")
    for lk in locks_l:
        cuts += _flexure_cuts(p, "left", lk["span"], lk["free_low"], p.lock_t, "lock")
    body = cut_all(body, cuts)

    bumps = [stop_bump(p, *s["bump"]) for s in stops]
    bumps += [lock_bump(p, "bottom", *lk["bump"]) for lk in locks_b]
    bumps += [lock_bump(p, "left", *lk["bump"]) for lk in locks_l]
    body = fuse_all(body, bumps)
    return single_solid(body)


# ===================================================================== drawer
def _arc(cx, cz, r, a0, a1, n=8):
    return [(cx + r * math.cos(math.radians(a0 + (a1 - a0) * k / n)),
             cz + r * math.sin(math.radians(a0 + (a1 - a0) * k / n))) for k in range(n + 1)]


def divider_slots(p: Params, X0, X1):
    t = p.d_wall
    cx = (X0 + X1) / 2
    half_in = (X1 - X0) / 2 - t
    slots, k = [], 0
    while True:
        cands = [cx] if k == 0 else [cx - k * p.divider_pitch, cx + k * p.divider_pitch]
        cands = [c for c in cands if abs(c - cx) <= half_in - 15.0]
        if not cands:
            break
        slots += cands
        k += 1
    return sorted(slots)


def drawer(p: Params, w: int = 1, h: int = 1, depth: float | None = None) -> cq.Solid:
    """Drawer in case coordinates, closed position."""
    pp = p if depth is None else _with_depth(p, depth)
    X0, X1, Y0, Y1, Zf, Zr = pp.drawer_box(w, h)
    C, t, tf = pp.d_chamfer, pp.d_wall, pp.d_floor

    outer = [(X0, Y0 + C), (X0 + C, Y0), (X1 - C, Y0), (X1, Y0 + C), (X1, Y1), (X0, Y1)]
    body = prism("z", outer, Zf, Zr)
    ci = C + t * SQ2
    cav = [(X0 + t, Y0 + ci - t), (X0 + ci - tf, Y0 + tf), (X1 - ci + tf, Y0 + tf),
           (X1 - t, Y0 + ci - t), (X1 - t, Y1 + 1), (X0 + t, Y1 + 1)]
    cavity = prism("z", cav, Zf + pp.d_front, Zr - t)
    body = body.cut(cavity)

    adds = []
    # scoop: 45 deg fill in the front-bottom inside corner so small parts slide out
    if pp.d_scoop > 0:
        s, yf, zw = pp.d_scoop, Y0 + tf, Zf + pp.d_front
        scoop = prism("x", [(yf - 0.01, zw - 0.01), (yf - 0.01, zw + s), (yf + s, zw - 0.01)],
                      X0, X1)
        adds.append(scoop.intersect(cavity))
    # catch blocks: fill the corner chamfer for a short length
    shift = Zr - pp.stop_inside
    zc = pp.stop_catch_z() + shift
    for tri in ([(X0, Y0), (X0 + C + 0.02, Y0), (X0, Y0 + C + 0.02)],
                [(X1, Y0), (X1 - C - 0.02, Y0), (X1, Y0 + C + 0.02)]):
        adds.append(prism("z", tri, zc, zc + pp.catch_len))
    # pull lip with rounded corners (plan view)
    side = [(Y1, Zf + 0.6), (Y1, Zf - pp.pull_depth), (Y1 - pp.pull_t, Zf - pp.pull_depth),
            (Y1 - pp.pull_t - pp.pull_depth, Zf), (Y1 - pp.pull_t - pp.pull_depth, Zf + 0.6)]
    lip = prism("x", side, X0, X1)
    r = pp.pull_radius
    zf = Zf - pp.pull_depth
    plan = ([(X0, Zf + 1.0)] + _arc(X0 + r, zf + r, r, 180, 270) +
            _arc(X1 - r, zf + r, r, 270, 360) + [(X1, Zf + 1.0)])
    lip = lip.intersect(prism("y", plan, Y0 - 1, Y1 + 1))
    adds.append(lip)
    # divider slot ribs on front and back walls
    sw = pp.divider_t + 2 * pp.divider_fit
    for xc in divider_slots(pp, X0, X1):
        for xa in (xc - sw / 2 - pp.rib_t, xc + sw / 2):
            adds.append(box(xa, xa + pp.rib_t, Y0 + tf - 0.01, Y1 - 0.3,
                            Zf + pp.d_front - 0.01, Zf + pp.d_front + pp.rib_d))
            adds.append(box(xa, xa + pp.rib_t, Y0 + tf - 0.01, Y1 - 0.3,
                            Zr - t - pp.rib_d, Zr - t + 0.01))
    body = fuse_all(body, adds)

    cuts = []
    # label recess on the face, between the bottom chamfer and the lip
    if pp.label:
        lo = Y0 + C + 1.5
        hi = Y1 - pp.pull_t - pp.pull_depth - 1.5
        lh = min(pp.label_h, hi - lo)
        if lh >= 6:
            ym = (lo + hi) / 2
            ya, yb, dl = ym - lh / 2, ym + lh / 2, pp.label_depth
            # top edge sloped 45 deg so the recess prints without a flat ceiling
            cuts.append(prism("x", [(ya, Zf - 1), (ya, Zf + dl), (yb - dl, Zf + dl),
                                    (yb, Zf), (yb, Zf - 1)],
                              X0 + pp.label_margin, X1 - pp.label_margin))
    # small chamfers on the bottom front/back edges (elephant's foot)
    k = pp.d_edge
    cuts.append(prism("x", [(Y0 - 1, Zf - 1), (Y0 + k, Zf - 1), (Y0 + k, Zf), (Y0, Zf + k),
                            (Y0 - 1, Zf + k)], X0 - 1, X1 + 1))
    cuts.append(prism("x", [(Y0 - 1, Zr + 1), (Y0 + k, Zr + 1), (Y0 + k, Zr), (Y0, Zr - k),
                            (Y0 - 1, Zr - k)], X0 - 1, X1 + 1))
    body = cut_all(body, cuts)
    return single_solid(body)


def divider(p: Params, h: int = 1, depth: float | None = None) -> cq.Solid:
    """Divider plate for the centre slots, in use coordinates (x = thickness)."""
    pp = p if depth is None else _with_depth(p, depth)
    X0, X1, Y0, Y1, Zf, Zr = pp.drawer_box(1, h)
    y0 = Y0 + pp.d_floor
    y1 = Y1 - 0.8
    z0 = Zf + pp.d_front + 0.3
    z1 = Zr - pp.d_wall - 0.3
    t = pp.divider_t
    plate = box(-t / 2, t / 2, y0, y1, z0, z1)
    if pp.d_scoop > 0:                       # clear the scoop at the front-bottom corner
        s = pp.d_scoop + 0.4
        plate = plate.cut(prism("x", [(y0 - 1, z0 - 1), (y0 - 1, z0 + s + 1), (y0 + s + 1, z0 - 1)],
                                -t, t))
    # finger notch in the middle of the top edge
    zm = (z0 + z1) / 2
    notch = prism("x", [(y1 + 0.1, zm - 9), (y1 - 5, zm - 4), (y1 - 5, zm + 4),
                        (y1 + 0.1, zm + 9)], -t, t)
    return single_solid(plate.cut(notch))


# ===================================================================== base
def base_plate(p: Params, n: int = 1, depth: float | None = None) -> cq.Solid:
    """Plate the bottom row slides onto: an R face (rails + windows)."""
    D = p.depth if depth is None else depth
    X0, X1 = p.gap / 2, n * p.unit_w - p.gap / 2
    ytop = -p.gap / 2
    ybot = ytop - p.base_t
    body = box(X0, X1, ybot, ytop, 0, D)
    body = cut_all(body, front_outer_chamfers(p, X0, X1, ybot, ytop))
    adds = [rail(p, "top", (i + 0.5) * p.unit_w, ytop, D) for i in range(n)]
    body = fuse_all(body, adds)
    wz0, wz1, _ = p.lock_window_z()
    f = p.window_fit
    cuts = []
    for i in range(n):
        xa = i * p.unit_w + p.lock_x + 0.3 - f
        cuts.append(box(xa, xa + p.lock_bump_w + 2 * f, ybot - 1, ytop + 1, wz0, wz1))
    body = cut_all(body, cuts)
    return single_solid(body)


# ===================================================================== test pieces
def _with_depth(p: Params, depth: float) -> Params:
    from dataclasses import replace
    return replace(p, depth=depth)


def coupon_rail(p: Params, depth: float = 30.0) -> cq.Solid:
    """Slice of an R (top) face: rail + lock window, with stiffening flanges.

    Same print orientation as a case (front face on the bed)."""
    xa, xb = p.lock_x - 6.0, p.unit_w - p.lock_x + 6.0     # 16 .. 44 by default
    Y1 = p.unit_h - p.gap / 2
    yi1 = Y1 - p.wall
    fl = 7.0
    body = box(xa, xb, yi1, Y1, 0, depth)
    body = body.fuse(box(xa, xa + p.wall, yi1 - fl, Y1, 0, depth),
                     box(xb - p.wall, xb, yi1 - fl, Y1, 0, depth))
    body = cut_all(body, front_outer_chamfers(p, xa, xb, yi1 - fl, Y1))
    body = body.fuse(rail(p, "top", p.unit_w / 2, Y1, depth)).clean()
    wz0, wz1, _ = p.lock_window_z()
    f = p.window_fit
    xw = p.lock_x + 0.3 - f
    body = body.cut(box(xw, xw + p.lock_bump_w + 2 * f, yi1 - 1, Y1 + 1, wz0, wz1)).clean()
    return single_solid(body)


def coupon_groove(p: Params, fit: float, depth: float = 30.0, marks: int = 0) -> cq.Solid:
    """Slice of a G (bottom) face with a groove at clearance `fit` and a lock
    tongue.  `marks` small notches on the right flange identify the fit."""
    from dataclasses import replace
    q = replace(p, fit_dovetail=fit)
    xa, xb = q.lock_x - 6.0, q.unit_w - q.lock_x + 6.0
    y0 = q.gap / 2
    yi0 = y0 + q.thick
    fl = 7.0
    body = box(xa, xb, y0, yi0, 0, depth)
    body = body.fuse(box(xa, xa + q.wall, y0, yi0 + fl, 0, depth),
                     box(xb - q.wall, xb, y0, yi0 + fl, 0, depth))
    body = cut_all(body, front_outer_chamfers(q, xa, xb, y0, yi0 + fl))
    cuts = [groove_cutter(q, "top", q.unit_w / 2, -q.gap / 2, depth)]
    span = (q.lock_x, q.lock_x + q.lock_len)
    cuts += _flexure_cuts(q, "bottom", span, True, q.lock_t, "lock")
    # identification notches: on the top edge of the right flange, at the back
    for k in range(marks):
        zc = depth - 3.0 - 3.0 * k
        # V-notch (45 deg flanks in z) so it prints without overhang
        ytop = yi0 + fl
        cuts.append(prism("x", [(ytop + 1, zc - 2.2), (ytop - 1.2, zc), (ytop + 1, zc + 2.2)],
                          xb - q.wall - 0.5, xb + 0.5))
    body = cut_all(body, cuts)
    body = body.fuse(lock_bump(q, "bottom", span[0] + 0.3, span[0] + 0.3 + q.lock_bump_w)).clean()
    return single_solid(body)


# ===================================================================== frames
# Parts are BUILT in a frame where z runs from the front face (z=0) to the back.
# Seen from the front that frame is left-handed (+x appears on the viewer's
# left), so every exported part is mirrored in z into the USE frame:
#     +x to the viewer's right, +y up, front face at z = 0, back at z = -depth,
#     drawers pull out towards +z (towards the viewer).
# In the use frame the rails are on the TOP and RIGHT faces and the grooves on
# the BOTTOM and LEFT faces, as seen from the front.  All parts go through the
# same mirror, so mating geometry is unchanged.
def to_use(shape: cq.Shape) -> cq.Shape:
    return shape.mirror("XY")


def print_pose(kind: str, use_shape: cq.Shape) -> cq.Shape:
    """Rotate a part from the use frame into its print orientation on z = 0."""
    if kind in ("case", "coupon_rail", "coupon_groove"):
        return drop_to_bed(rotate(use_shape, "x", 180))   # front face on the bed
    if kind in ("drawer", "base"):
        return drop_to_bed(rotate(use_shape, "x", 90))    # floor on the bed (+y -> +z)
    if kind == "divider":
        return drop_to_bed(rotate(use_shape, "y", 90))    # plate flat
    raise ValueError(kind)
