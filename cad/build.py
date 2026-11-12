#!/usr/bin/env python3
"""Build every printable part of the modular drawer system.

    python build.py                         # default set into ./out
    python build.py --sizes 1x1,3x2         # only these module sizes
    python build.py --set fit_dovetail=0.30 --set depth=150 --out out_150
    python build.py --list-params           # show every parameter and its value

Outputs
    out/stl/   print-ready meshes, already in print orientation
    out/step/  editable B-rep solids in assembly ("use") orientation
    out/step/example_wall.step   an assembled example wall
    out/parts.csv, out/params.json
"""
from __future__ import annotations

import argparse
import csv
import json
import os
import sys
import time

import cadquery as cq

from drawer_system import Params, parts
from drawer_system.parts import to_use, print_pose
from drawer_system.geom import translate

DEFAULT_SIZES = ["1x1", "2x1", "3x1", "4x1", "1x2", "2x2", "3x2", "4x2"]
DENSITY = {"PLA": 1.24, "PETG": 1.27}


def parse_sizes(s):
    out = []
    for tok in s.split(","):
        w, h = tok.lower().split("x")
        out.append((int(w), int(h)))
    return out


def export(shape_use, kind, name, out, rows, step=True):
    os.makedirs(os.path.join(out, "stl"), exist_ok=True)
    os.makedirs(os.path.join(out, "step"), exist_ok=True)
    pr = print_pose(kind, shape_use)
    stl = os.path.join(out, "stl", name + ".stl")
    pr.exportStl(stl, tolerance=0.01, angularTolerance=0.1)
    if step:
        cq.exporters.export(cq.Workplane().add(shape_use), os.path.join(out, "step", name + ".step"))
    import trimesh                       # mesh extents are exact; B-rep boxes are padded
    ex = trimesh.load(stl).extents
    vol = shape_use.Volume() / 1000.0
    rows.append(dict(part=name, kind=kind, print_x=round(ex[0], 1), print_y=round(ex[1], 1),
                     print_z=round(ex[2], 1), volume_cm3=round(vol, 1),
                     PLA_g=round(vol * DENSITY["PLA"], 0), PETG_g=round(vol * DENSITY["PETG"], 0)))
    print(f"  {name:32s} {ex[0]:6.1f} x {ex[1]:6.1f} x {ex[2]:6.1f} mm  {vol:6.1f} cm3")


def example_wall(p: Params):
    """A 4 x 4 wall mixing sizes, on a 4-wide base, one drawer at its stop."""
    layout = [  # (w, h, col, row)
        (2, 1, 0, 0), (1, 1, 2, 0), (1, 1, 3, 0),
        (1, 1, 0, 1), (1, 1, 1, 1), (1, 1, 2, 1), (1, 1, 3, 1),
        (2, 2, 0, 2), (1, 2, 2, 2), (1, 1, 3, 2), (1, 1, 3, 3),
    ]
    asm = cq.Assembly(name="example_wall")
    cache = {}
    shift_stop = p.drawer_box(1, 1)[5] - p.stop_inside
    asm.add(to_use(parts.base_plate(p, 4)), name="base_4", color=cq.Color(0.45, 0.47, 0.5))
    for k, (w, h, c, r) in enumerate(layout):
        if (w, h) not in cache:
            cache[(w, h)] = (parts.case(p, w, h), parts.drawer(p, w, h))
        cs, dr = cache[(w, h)]
        dx, dy = c * p.unit_w, r * p.unit_h
        asm.add(to_use(translate(cs, dx, dy, 0)), name=f"case_{w}x{h}_c{c}r{r}",
                color=cq.Color(0.22, 0.23, 0.26))
        pull = shift_stop if (c, r) == (2, 1) else (40.0 if (c, r) == (1, 1) else 0.0)
        asm.add(to_use(translate(dr, dx, dy, -pull)), name=f"drawer_{w}x{h}_c{c}r{r}",
                color=cq.Color(0.93, 0.48, 0.16))
    return asm, layout


# Starting clearances per side (mm) for each filament, and the two rail sizes (see docs/materials.md).
MATERIALS = {
    "pla": dict(rail=0.25, side=0.35, top=0.50),
    "petg": dict(rail=0.30, side=0.40, top=0.55),
    "abs": dict(rail=0.35, side=0.45, top=0.60),
}
RAILS = {"standard": dict(dt_height=1.6, dt_neck=5.0), "sturdy": dict(dt_height=2.0, dt_neck=6.0)}


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--sizes", default=",".join(DEFAULT_SIZES))
    ap.add_argument("--set", action="append", default=[], metavar="NAME=VALUE")
    ap.add_argument("--out", default="out")
    ap.add_argument("--no-step", action="store_true")
    ap.add_argument("--no-test", action="store_true", help="skip the fit-test pieces")
    ap.add_argument("--no-assembly", action="store_true")
    ap.add_argument("--list-params", action="store_true")
    ap.add_argument("--material", choices=sorted(MATERIALS), default="pla",
                    help="starting clearances: pla, petg or abs (abs also covers asa); --set overrides them")
    ap.add_argument("--rails", choices=sorted(RAILS), default="standard", help="standard (1.6 mm) or sturdy (2.0 mm) rails")
    a = ap.parse_args(argv)

    mat = MATERIALS[a.material]
    presets = [f"fit_dovetail={mat['rail']}", f"fit_side={mat['side']}", f"fit_top={mat['top']}"]
    presets += [f"{k}={v}" for k, v in RAILS[a.rails].items()]
    p = Params().override(presets + a.set)
    if a.list_params:
        for k, v in p.as_dict().items():
            print(f"{k:22s} {v}")
        return
    sizes = parse_sizes(a.sizes)
    p.check(sizes=sizes)
    os.makedirs(a.out, exist_ok=True)
    rows = []
    t0 = time.time()
    step = not a.no_step

    print("Cases and drawers")
    heights = sorted({h for _, h in sizes})
    for (w, h) in sizes:
        export(to_use(parts.case(p, w, h)), "case", f"case_{w}x{h}", a.out, rows, step)
        export(to_use(parts.drawer(p, w, h)), "drawer", f"drawer_{w}x{h}", a.out, rows, step)
    print("Dividers")
    for h in heights:
        export(to_use(parts.divider(p, h)), "divider", f"divider_h{h}", a.out, rows, step)
    print("Base plates")
    for n in sorted({w for w, _ in sizes} | {1, 2, 3, 4}):
        x1 = n * p.unit_w - p.gap / 2
        if x1 > 250:
            continue
        export(to_use(parts.base_plate(p, n)), "base", f"base_{n}", a.out, rows, step)

    if not a.no_test:
        print("Fit-test pieces")
        export(to_use(parts.coupon_rail(p)), "coupon_rail", "test_rail", a.out, rows, step)
        # groove pieces centred on the material preset: 3 notches = preset, 0.05 mm a notch
        for k, f in enumerate([round(p.fit_dovetail + d, 2) for d in (-0.10, -0.05, 0.0, 0.05, 0.10)], start=1):
            export(to_use(parts.coupon_groove(p, f, marks=k)), "coupon_groove",
                   f"test_groove_{f:.2f}mm_{k}notch", a.out, rows, step)
        export(to_use(parts.case(p, 1, 1, depth=48.0)), "case", "test_mini_case_1x1", a.out, rows, step)
        export(to_use(parts.drawer(p, 1, 1, depth=48.0)), "drawer", "test_mini_drawer_1x1", a.out, rows, step)

    if not a.no_assembly and step:
        print("Example wall assembly")
        asm, _ = example_wall(p)
        asm.export(os.path.join(a.out, "step", "example_wall.step"))

    with open(os.path.join(a.out, "parts.csv"), "w", newline="") as f:
        wr = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        wr.writeheader()
        wr.writerows(rows)
    with open(os.path.join(a.out, "params.json"), "w") as f:
        json.dump(p.as_dict(), f, indent=1)
    print(f"\n{len(rows)} parts written to {a.out}/ in {time.time() - t0:.0f} s")


if __name__ == "__main__":
    sys.exit(main())
