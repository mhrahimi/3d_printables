"""Check every exported STL: watertight, fits the bed, prints without support.

    python -m drawer_system.check_stl out/stl [--bed 256]
"""
import glob
import json
import os
import sys

import trimesh

from .printcheck import analyze, summarize


def main():
    folder = sys.argv[1] if len(sys.argv) > 1 else "out/stl"
    bed = float(sys.argv[sys.argv.index("--bed") + 1]) if "--bed" in sys.argv else 256.0
    rows, bad = [], 0
    for fn in sorted(glob.glob(os.path.join(folder, "*.stl"))):
        name = os.path.basename(fn)[:-4]
        m = trimesh.load(fn)
        s = summarize(name, analyze(m))
        ex = [round(float(v), 1) for v in m.extents]
        fits = all(v <= bed - 4 for v in ex)
        ok = m.is_watertight and m.is_volume and fits and s["failures"] == 0
        bad += not ok
        rows.append(dict(part=name, ok=ok, watertight=bool(m.is_watertight), size=ex, fits_bed=fits,
                         unsupported=s["failures"], bridges=s["bridges"],
                         longest_bridge_mm=s["longest_bridge"]))
        print(f"{'OK ' if ok else 'BAD'} {name:30s} {ex[0]:6.1f} x {ex[1]:6.1f} x {ex[2]:6.1f}"
              f"  watertight={m.is_watertight}  unsupported={s['failures']}"
              f"  bridges={s['bridges']} (longest {s['longest_bridge']} mm)")
    with open(os.path.join(os.path.dirname(folder.rstrip('/')), "printcheck.json"), "w") as f:
        json.dump(rows, f, indent=1)
    print(f"\n{len(rows)} meshes, {bad} with problems")
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
