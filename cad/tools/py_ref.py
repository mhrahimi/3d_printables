"""Export the CadQuery reference parts the JavaScript kernel is compared against.

    python tools/py_ref.py OUT_PREFIX '{"unit_w": 80}'
"""
import json
import sys

import cadquery as cq

sys.path.insert(0, ".")
from drawer_system import parts  # noqa: E402
from drawer_system.params import Params  # noqa: E402

prefix = sys.argv[1]
p = Params(**json.loads(sys.argv[2] if len(sys.argv) > 2 else "{}"))
jobs = {
    "case_1x1": lambda: parts.case(p, 1, 1), "case_2x1": lambda: parts.case(p, 2, 1),
    "case_1x2": lambda: parts.case(p, 1, 2), "case_3x2": lambda: parts.case(p, 3, 2),
    "drawer_1x1": lambda: parts.drawer(p, 1, 1), "drawer_2x2": lambda: parts.drawer(p, 2, 2),
    "divider_h1": lambda: parts.divider(p, 1), "base_2": lambda: parts.base_plate(p, 2),
    "coupon_rail": lambda: parts.coupon_rail(p), "coupon_groove": lambda: parts.coupon_groove(p, 0.25, marks=3),
}
for name, fn in jobs.items():
    cq.exporters.export(fn(), f"{prefix}_{name}.stl", tolerance=0.005, angularTolerance=0.05)
    print(name)
