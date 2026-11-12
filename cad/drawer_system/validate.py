"""Geometric validation of fit, assembly paths and flexure loads.

Run:  python -m drawer_system.validate  [--set name=value ...]

All checks run on exact B-rep solids (OpenCascade booleans and distances),
not on meshes.
"""
from __future__ import annotations

import argparse
import json
import math
import sys
from dataclasses import replace

import cadquery as cq
from OCP.BRepExtrema import BRepExtrema_DistShapeShape

from .params import Params
from . import parts
from .geom import translate, box

TOL_VOL = 1e-3   # mm^3; anything below is numerical noise from touching faces


def inter_vol(a: cq.Shape, b: cq.Shape) -> float:
    ba, bb = a.BoundingBox(), b.BoundingBox()
    if (ba.xmax < bb.xmin or bb.xmax < ba.xmin or ba.ymax < bb.ymin or bb.ymax < ba.ymin
            or ba.zmax < bb.zmin or bb.zmax < ba.zmin):
        return 0.0
    return a.intersect(b).Volume()


def inter_bbox(a, b):
    s = a.intersect(b)
    if s.Volume() < TOL_VOL:
        return None
    bb = s.BoundingBox()
    return (bb.xmin, bb.xmax, bb.ymin, bb.ymax, bb.zmin, bb.zmax)


def min_dist(a: cq.Shape, b: cq.Shape) -> float:
    d = BRepExtrema_DistShapeShape(a.wrapped, b.wrapped)
    d.Perform()
    return d.Value()


class Report:
    def __init__(self):
        self.rows = []
        self.failed = 0

    def check(self, name, ok, detail=""):
        self.rows.append(dict(check=name, ok=bool(ok), detail=detail))
        if not ok:
            self.failed += 1
        print(f"  [{'PASS' if ok else 'FAIL'}] {name}" + (f"  - {detail}" if detail else ""))

    def info(self, name, detail):
        self.rows.append(dict(check=name, ok=None, detail=detail))
        print(f"  [info] {name}  - {detail}")


def strain_cantilever(delta, t, L):
    return 3 * delta * t / (2 * L * L)


def run(p: Params, quick=False):
    R = Report()
    U, V, D = p.unit_w, p.unit_h, p.depth
    print("Building parts ...")
    c11 = parts.case(p, 1, 1)
    c21 = parts.case(p, 2, 1)
    c12 = parts.case(p, 1, 2)
    d11 = parts.drawer(p, 1, 1)
    d21 = parts.drawer(p, 2, 1)
    base2 = parts.base_plate(p, 2)

    # ------------------------------------------------------------- validity
    print("\n1. Solid validity")
    for name, s in [("case 1x1", c11), ("case 2x1", c21), ("case 1x2", c12),
                    ("drawer 1x1", d11), ("drawer 2x1", d21), ("base 2", base2),
                    ("divider", parts.divider(p, 1)), ("coupon rail", parts.coupon_rail(p)),
                    ("coupon groove", parts.coupon_groove(p, p.fit_dovetail))]:
        R.check(f"{name}: valid single solid", s.isValid() and len(s.Solids()) == 1,
                f"volume {s.Volume() / 1000:.1f} cm3")

    # ------------------------------------------------------------- static fit
    print("\n2. Static fit (modules at home position)")
    above = translate(c11, 0, V, 0)
    right = translate(c11, U, 0, 0)
    R.check("1x1 on 1x1: no interference", inter_vol(c11, above) < TOL_VOL,
            f"{inter_vol(c11, above):.4f} mm3")
    R.check("1x1 beside 1x1: no interference", inter_vol(c11, right) < TOL_VOL,
            f"{inter_vol(c11, right):.4f} mm3")
    top2 = translate(c21, 0, V, 0)
    v = inter_vol(c11, top2) + inter_vol(right, top2)
    R.check("2x1 across two 1x1: no interference", v < TOL_VOL, f"{v:.4f} mm3")
    side2 = translate(c12, U, 0, 0)
    v = inter_vol(c11, side2) + inter_vol(above, side2)
    R.check("1x2 beside two stacked 1x1: no interference", v < TOL_VOL, f"{v:.4f} mm3")
    v = inter_vol(base2, c11) + inter_vol(base2, right)
    R.check("two 1x1 on a 2-wide base: no interference", v < TOL_VOL, f"{v:.4f} mm3")
    v = inter_vol(c11, d11)
    R.check("drawer 1x1 closed in case: no interference", v < TOL_VOL, f"{v:.4f} mm3")
    v = inter_vol(c21, d21)
    R.check("drawer 2x1 closed in case: no interference", v < TOL_VOL, f"{v:.4f} mm3")
    # divider in its slot
    X0, X1, *_ = p.drawer_box(1, 1)
    div = translate(parts.divider(p, 1), (X0 + X1) / 2, 0, 0)
    v = inter_vol(d11, div)
    R.check("divider in centre slot: no interference", v < TOL_VOL, f"{v:.4f} mm3")

    # ------------------------------------------------------------- clearances
    print("\n3. Clearances")
    # measure along the straight part of the rail; its 45 deg front end is meant
    # to touch the groove end (that contact is the positive front-alignment stop)
    rail_only = parts.rail(p, "top", U / 2, V - p.gap / 2, D).intersect(
        box(0, U, V - 2, V + 5, 20, D - 10))
    d_rail = min_dist(rail_only, above)
    R.check(f"rail-to-groove clearance ~ fit_dovetail ({p.fit_dovetail})",
            abs(d_rail - p.fit_dovetail) < 0.03, f"{d_rail:.3f} mm")
    rail_end = parts.rail(p, "top", U / 2, V - p.gap / 2, D).intersect(
        box(0, U, V - 2, V + 5, 0, p.dt_start + p.dt_height + 1))
    R.check("rail front end touches groove end at home (alignment stop)",
            min_dist(rail_end, above) < 0.01, f"{min_dist(rail_end, above):.3f} mm")
    d_face = min_dist(box(1, U - 1, V - p.gap / 2 - 0.01, V - p.gap / 2, 20, 120), above)
    R.check(f"face-to-face gap = gap ({p.gap})", abs(d_face - p.gap) < 0.02, f"{d_face:.3f} mm")
    xi0, xi1, yi0, yi1 = p.interior(1, 1)
    dX0, dX1, dY0, dY1, dZf, dZr = p.drawer_box(1, 1)
    R.info("drawer side / top clearance", f"{dX0 - xi0:.2f} / {xi1 - dX1:.2f} / {yi1 - dY1:.2f} mm")
    R.info("drawer 1x1 outside (w x h x d)",
           f"{dX1 - dX0:.1f} x {dY1 - dY0:.1f} x {dZr - dZf:.1f} mm, "
           f"inside approx {dX1 - dX0 - 2 * p.d_wall:.1f} x {dY1 - dY0 - p.d_floor:.1f} x "
           f"{dZr - dZf - p.d_front - p.d_wall:.1f} mm")

    # ------------------------------------------------------------- module slide path
    print("\n4. Module insertion path (upper module slides in from the front)")
    wz0, wz1, zf = p.lock_window_z()
    steps = [0.0, 0.2, 0.4, 0.5, 0.7, 1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 6.5, 7.0, 7.5, 8.0,
             10.0, 15.0, 30.0, 60.0, 100.0]
    if quick:
        steps = [0.0, 0.5, 2.0, 5.0, 8.0, 30.0]
    worst = 0.0
    clash_ok = True
    for u in steps:
        g = translate(above, 0, 0, -u)
        bb = inter_bbox(c11, g)
        if bb is None:
            continue
        # interference must be the lock bump only: x within the bump, y below R face
        bx0 = p.lock_x + 0.3 - 0.01
        bx1 = bx0 + p.lock_bump_w + 0.02
        only_bump = (bb[0] >= bx0 - 0.02 and bb[1] <= bx1 + 0.02 and bb[2] >= V - p.gap / 2 - p.lock_bump - 0.05)
        depth = (V - p.gap / 2) - bb[2]
        worst = max(worst, depth)
        if not only_bump:
            clash_ok = False
            R.check(f"slide u={u}: only the lock bump interferes", False, f"bbox {bb}")
    R.check("vertical slide: nothing but the lock bump ever interferes", clash_ok)
    R.info("vertical slide: lock tongue deflection needed", f"{worst:.2f} mm "
           f"(bump {p.lock_bump} - gap {p.gap})")
    # positive stop backwards, latch forwards
    back = inter_vol(c11, translate(above, 0, 0, 0.3))
    R.check("upper module pushed 0.3 mm back: blocked by groove end (positive stop)",
            back > TOL_VOL, f"overlap {back:.3f} mm3")
    play = zf - wz0
    fwd = inter_vol(c11, translate(above, 0, 0, -(play + 0.15)))
    R.check(f"upper module pulled {play + 0.15:.2f} mm forward: caught by lock",
            fwd > TOL_VOL, f"overlap {fwd:.3f} mm3")
    R.info("lock free play along depth", f"{play:.2f} mm")

    # side joint
    worst_s = 0.0
    side_ok = True
    for u in steps:
        g = translate(right, 0, 0, -u)
        bb = inter_bbox(c11, g)
        if bb is None:
            continue
        only_bump = (bb[2] >= p.lock_y + 0.3 - 0.05 and bb[3] <= p.lock_y + 0.3 + p.lock_bump_w + 0.05
                     and bb[0] >= U - p.gap / 2 - p.lock_bump - 0.05)
        worst_s = max(worst_s, (U - p.gap / 2) - bb[0])
        if not only_bump:
            side_ok = False
            R.check(f"side slide u={u}: only the lock bump interferes", False, f"bbox {bb}")
    R.check("side slide: nothing but the lock bump ever interferes", side_ok)
    back = inter_vol(c11, translate(right, 0, 0, 0.3))
    R.check("right module pushed 0.3 mm back: blocked (positive stop)", back > TOL_VOL,
            f"overlap {back:.3f} mm3")
    fwd = inter_vol(c11, translate(right, 0, 0, -(play + 0.15)))
    R.check("right module pulled forward: caught by lock", fwd > TOL_VOL, f"overlap {fwd:.3f} mm3")

    # ------------------------------------------------------------- drawer travel
    print("\n5. Drawer travel")
    shift_stop = dZr - p.stop_inside
    s_list = [0, 20, 50, 80, 90, 94, 95, shift_stop - 0.05, shift_stop + 0.3, shift_stop + 1,
              shift_stop + 2, shift_stop + 3, shift_stop + 4, shift_stop + 6, shift_stop + 7.5,
              shift_stop + 9, shift_stop + 12]
    if quick:
        s_list = [0, 50, shift_stop - 0.05, shift_stop + 0.3, shift_stop + 3, shift_stop + 9]
    dr_ok = True
    worst_d = 0.0
    for s in s_list:
        dd = translate(d11, 0, 0, -s)
        bb = inter_bbox(c11, dd)
        if bb is None:
            continue
        # allowed: catch block vs stop bump, i.e. y within bump height above floor,
        # x near the side walls
        in_corner = (bb[3] <= yi0 + p.stop_bump + 0.05) and (
            bb[1] <= xi0 + p.slit + 0.2 + p.stop_bump_w + 0.05 or bb[0] >= xi1 - p.slit - 0.2 - p.stop_bump_w - 0.05)
        worst_d = max(worst_d, bb[3] - yi0)
        if not in_corner:
            # a bbox spanning both corners is fine if each piece is in a corner
            pieces = c11.intersect(dd).Solids()
            in_corner = all(
                (pc.BoundingBox().ymax <= yi0 + p.stop_bump + 0.05) for pc in pieces)
        if not in_corner:
            dr_ok = False
            R.check(f"drawer at s={s:.1f}: only catch blocks vs stop bumps", False, f"bbox {bb}")
    R.check("drawer travel: only the catch blocks touch the stop bumps", dr_ok)
    R.info("drawer stop: spring deflection needed", f"{worst_d:.2f} mm")
    at = inter_vol(c11, translate(d11, 0, 0, -(shift_stop - 0.05)))
    past = inter_vol(c11, translate(d11, 0, 0, -(shift_stop + 0.4)))
    R.check(f"drawer pulled to stop (out {shift_stop:.1f} mm, {p.stop_inside:.0f} mm still inside): free",
            at < TOL_VOL, f"{at:.4f} mm3")
    R.check("drawer pulled 0.4 mm past the stop: blocked", past > TOL_VOL, f"overlap {past:.3f} mm3")
    full = translate(d11, 0, 0, -(dZr + 1))
    R.check("drawer fully removed: free", inter_vol(c11, full) < TOL_VOL)
    pushed = inter_vol(c11, translate(d11, 0, 0, 0.3))
    R.check("drawer pushed 0.3 mm deeper than closed: blocked by rear lip", pushed > TOL_VOL,
            f"overlap {pushed:.3f} mm3")
    # tilt at the stop: rear rises until it meets the ceiling
    tilt_room = p.fit_top
    R.info("drawer tilt at stop", f"rear can lift {tilt_room:.2f} mm; catch block sits "
           f"{p.stop_inside - p.stop_catch_z():.1f} mm from the rear, so the catch "
           f"lifts ~{tilt_room * (p.stop_catch_z() / p.stop_inside):.2f} mm and keeps "
           f"{p.stop_bump - tilt_room * (p.stop_catch_z() / p.stop_inside):.2f} mm engagement")

    # stop springs must not carry the drawer (they sit stop_recess below the floor)
    sp_lo = xi0 + p.slit + 0.2 + p.stop_bump_w + 0.3
    sp_hi = xi0 + p.slit + p.stop_len
    spring = c11.intersect(box(sp_lo, sp_hi, yi0 - 1.0, yi0 + 0.01, 0.5, p.band - 0.5))
    ds = min_dist(spring, d11)
    R.check("closed drawer does not rest on the stop springs", ds >= p.stop_recess - 0.02,
            f"gap {ds:.2f} mm")
    # loaded drawer at the stop tips forward about the case's front edge until its
    # rear meets the ceiling; the catch must still hold in that attitude
    phi = math.degrees(math.asin((p.fit_top - 0.02) / p.stop_inside))
    tilted = translate(d11, 0, 0, -shift_stop).rotate(
        cq.Vector(0, yi0, 0), cq.Vector(1, yi0, 0), -phi)
    free = inter_vol(c11, tilted)
    R.check(f"drawer tipped {phi:.2f} deg at the stop: no clash", free < 0.01, f"{free:.4f} mm3")
    more = inter_vol(c11, translate(tilted, 0, 0, -0.4))
    R.check("tipped drawer pulled 0.4 mm further: still caught", more > TOL_VOL,
            f"overlap {more:.3f} mm3")

    if not quick:
        print("\n5b. Every exported size: drawer closed, at stop, past stop")
        for (w, h) in [(1, 1), (2, 1), (3, 1), (4, 1), (1, 2), (2, 2), (3, 2), (4, 2)]:
            cw = parts.case(p, w, h)
            dw = parts.drawer(p, w, h)
            sh = p.drawer_box(w, h)[5] - p.stop_inside
            a = inter_vol(cw, dw)
            b = inter_vol(cw, translate(dw, 0, 0, -(sh - 0.05)))
            c = inter_vol(cw, translate(dw, 0, 0, -(sh + 0.4)))
            R.check(f"{w}x{h}: closed free, stop free, past stop blocked",
                    a < TOL_VOL and b < TOL_VOL and c > TOL_VOL,
                    f"{a:.4f} / {b:.4f} / {c:.3f} mm3")

    # ------------------------------------------------------------- mechanics
    print("\n6. Flexure strain and forces (beam theory)")
    E = {"PLA": 3300.0, "PETG": 2000.0}
    allow = {"PLA": 0.020, "PETG": 0.035}        # conservative allowable bending strain (XY)
    mu = 0.3
    rows = []
    for name, L, t, b, defl, n, catch, ramp in [
            ("module lock tongue", p.lock_len, p.lock_t, p.band, worst, 1, p.lock_catch_deg, p.lock_ramp_deg),
            ("drawer stop tongue", p.stop_len, p.stop_t, p.band, worst_d, 2, p.stop_catch_deg, p.stop_ramp_deg)]:
        eps = strain_cantilever(defl, t, L)
        for mat in ("PLA", "PETG"):
            I = b * t ** 3 / 12
            k = 3 * E[mat] * I / L ** 3
            Fn = k * defl * n
            phi = math.atan(mu)
            f_out = Fn * math.tan(math.radians(catch) + phi)
            f_in = Fn * math.tan(math.radians(ramp) + phi)
            rows.append((name, mat, eps, k, f_in, f_out))
            R.check(f"{name} ({mat}): bending strain {eps * 100:.2f} % < {allow[mat] * 100:.1f} %",
                    eps < allow[mat] / 1.5,
                    f"stiffness {k:.2f} N/mm each, push-in ~{f_in:.1f} N, pull-out ~{f_out:.1f} N"
                    + (" (drawer out)" if "lock" in name else ""))
    # lock window bridge (material in front of the window) in bending
    span = p.lock_bump_w + 2 * p.window_fit
    sec = p.wall * wz0 ** 2 / 6
    f_allow = 25.0 * sec * 8 / span
    R.info("lock window front strip", f"carries ~{f_allow:.0f} N at 25 MPa (PLA) per window")
    # dovetail lip shear (pulling modules apart)
    th = math.radians(p.dt_angle)
    lip_root = p.dt_height - p.gap + p.fit_dovetail
    shear_area = 2 * lip_root * (D - p.dt_start)
    R.info("dovetail pull-apart", f"two groove lips, {shear_area:.0f} mm2 in shear "
           f"-> >{shear_area * 10 / 1000:.1f} kN at 10 MPa")

    print(f"\n{len(R.rows)} checks, {R.failed} failed")
    return R


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--set", action="append", default=[])
    ap.add_argument("--quick", action="store_true")
    ap.add_argument("--json")
    a = ap.parse_args(argv)
    p = Params().override(a.set)
    p.check(sizes=[(1, 1), (2, 1), (1, 2)])
    R = run(p, quick=a.quick)
    if a.json:
        with open(a.json, "w") as f:
            json.dump(dict(params=p.as_dict(), checks=R.rows, failed=R.failed), f, indent=1)
    sys.exit(1 if R.failed else 0)


if __name__ == "__main__":
    main()
