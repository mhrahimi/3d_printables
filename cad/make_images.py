#!/usr/bin/env python3
"""Review/documentation images (offscreen VTK).  python make_images.py [out_dir]"""
from __future__ import annotations

import os
import sys

import cadquery as cq

from drawer_system import Params, parts
from drawer_system.parts import to_use, print_pose
from drawer_system.geom import translate, box
from drawer_system.render import render, PALETTE as C
import build

OUT = sys.argv[1] if len(sys.argv) > 1 else "out/images"
os.makedirs(OUT, exist_ok=True)
p = Params()
U, V, D = p.unit_w, p.unit_h, p.depth
LIGHT, MID, DARK = (0.80, 0.82, 0.85), (0.62, 0.65, 0.70), (0.30, 0.32, 0.35)
ORANGE = C["drawer"]
TEAL = (0.30, 0.72, 0.68)


def U_(s):
    return to_use(s)


def cut(shape, x0, x1, y0, y1, z0, z1):
    return shape.intersect(box(x0, x1, y0, y1, z0, z1))


# ---------------------------------------------------------------- hero + wall
asm, layout = build.example_wall(p)
items = []
for ch in asm.children:
    s = ch.obj if isinstance(ch.obj, cq.Shape) else ch.obj.val()
    col = ORANGE if ch.name.startswith("drawer") else (C["base"] if ch.name.startswith("base") else DARK)
    items.append((s, col, 1))
render(items, f"{OUT}/01_example_wall.png", view=(0.55, 0.35, 1.0), size=(1600, 1250), zoom=1.08)
render(items, f"{OUT}/02_example_wall_side.png", view=(1.0, 0.55, 0.5), size=(1600, 1250), zoom=1.08)

# ---------------------------------------------------------------- single module
c11 = parts.case(p, 1, 1)
d11 = parts.drawer(p, 1, 1)
render([(U_(c11), LIGHT, 1), (U_(translate(d11, 0, 0, -45)), ORANGE, 1)],
       f"{OUT}/03_module_1x1.png", view=(0.75, 0.6, 1.2), size=(1400, 1050))
render([(U_(c11), LIGHT, 1)], f"{OUT}/04_case_rear_bottom.png", view=(-0.7, -0.6, -1.0),
       size=(1400, 1050))

# ---------------------------------------------------------------- how modules join
above = translate(c11, 0, V, -70)        # upper module half slid in
right = translate(c11, U, 0, -95)        # right module starting to slide in
render([(U_(c11), LIGHT, 1), (U_(above), MID, 1), (U_(right), TEAL, 1)],
       f"{OUT}/05_joining_modules.png", view=(0.9, 0.7, 1.1), size=(1500, 1150))

# ---------------------------------------------------------------- section: dovetail
zc = 60.0
sec_lo = cut(c11, 15, 45, 30, 44, zc, zc + 4)
sec_hi = cut(translate(c11, 0, V, 0), 15, 45, 36, 50, zc, zc + 4)
render([(U_(sec_lo), LIGHT, 1), (U_(sec_hi), TEAL, 1)], f"{OUT}/06_section_dovetail.png",
       view=(0.0, 0.0, 1.0), size=(1300, 900), parallel=True, zoom=1.0)

# ---------------------------------------------------------------- section: lock
xb = p.lock_x + 0.3 + p.lock_bump_w / 2
up = translate(c11, 0, V, 0)
sl_lo = cut(c11, xb - 1.5, xb + 1.5, 34, 44, -1, 16)
sl_hi = cut(up, xb - 1.5, xb + 1.5, 36, 46, -1, 16)
render([(U_(sl_lo), LIGHT, 1), (U_(sl_hi), TEAL, 1)], f"{OUT}/07_section_lock.png",
       view=(1.0, 0.0, 0.0), up=(0, 1, 0), size=(1300, 900), parallel=True, zoom=1.0)

# ---------------------------------------------------------------- section: drawer stop
xi0, xi1, yi0, yi1 = p.interior(1, 1)
xs = xi0 + p.slit + 0.2 + p.stop_bump_w / 2
shift = p.drawer_box(1, 1)[5] - p.stop_inside
dr_stop = translate(d11, 0, 0, -shift)
s_case = cut(c11, xs - 0.6, xs + 0.6, -1, 12, -1, 34)
s_dr = cut(dr_stop, xs - 0.6, xs + 0.6, -1, 12, -1, 34)
render([(U_(s_case), LIGHT, 1), (U_(s_dr), ORANGE, 1)], f"{OUT}/08_section_drawer_stop.png",
       view=(1.0, 0.0, 0.0), size=(1400, 800), parallel=True, zoom=1.0)
render([(U_(c11), LIGHT, 1), (U_(dr_stop), ORANGE, 1)], f"{OUT}/09_drawer_at_stop.png",
       view=(0.8, 0.55, 1.0), size=(1400, 1050))

# ---------------------------------------------------------------- front band close-ups
cs_use = U_(c11)
render([(cs_use, LIGHT, 1)], f"{OUT}/10_flexures_from_below.png", view=(-0.35, -1.0, 0.75),
       focus=(30, 1, -6, 26), size=(1400, 1000))
render([(cs_use, LIGHT, 1)], f"{OUT}/11_flexures_inside.png", view=(0.25, 0.6, 1.0),
       focus=(30, 5, -8, 28), size=(1400, 1000))

# ---------------------------------------------------------------- drawer
render([(U_(d11), ORANGE, 1)], f"{OUT}/12_drawer_1x1.png", view=(0.8, 0.9, 1.4), size=(1400, 1050))
render([(U_(d11), ORANGE, 1)], f"{OUT}/13_drawer_underside.png", view=(0.7, -0.9, -0.6),
       size=(1400, 1050))

# ---------------------------------------------------------------- print orientation
bed = []
pc = print_pose("case", U_(c11))
pd = translate(print_pose("drawer", U_(d11)), 75, 0, 0)
pv = translate(print_pose("divider", U_(parts.divider(p, 1))), 75, 140, 0)
bed_plate = box(-5, 251, -5, 251, -1.2, 0)
render([(bed_plate, (0.85, 0.85, 0.80), 1), (translate(pc, 0, 60, 0), DARK, 1), (pd, ORANGE, 1),
        (translate(pv, 0, -5, 0), (0.95, 0.85, 0.55), 1)],
       f"{OUT}/14_print_orientation.png", view=(0.6, -1.0, 0.9), up=(0, 0, 1), size=(1500, 1100))

# ---------------------------------------------------------------- test kit
kit = [(translate(print_pose("coupon_rail", U_(parts.coupon_rail(p))), 0, 0, 0), DARK, 1)]
for k, f in enumerate(build.FITS, start=1):
    kit.append((translate(print_pose("coupon_groove", U_(parts.coupon_groove(p, f, marks=k))),
                          34 * k, 0, 0), TEAL, 1))
kit.append((translate(print_pose("case", U_(parts.case(p, 1, 1, depth=48.0))), 0, 30, 0), LIGHT, 1))
kit.append((translate(print_pose("drawer", U_(parts.drawer(p, 1, 1, depth=48.0))), 80, 30, 0),
            ORANGE, 1))
render(kit, f"{OUT}/15_test_kit.png", view=(0.5, -1.0, 0.9), up=(0, 0, 1), size=(1500, 1000))
print("images written to", OUT)
