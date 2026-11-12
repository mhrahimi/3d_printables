"""All dimensions of the modular drawer system, in millimetres.

Every part is generated from one Params object.  Change a value here (or pass
overrides on the command line with --set name=value) and rebuild.

Coordinate system used everywhere ("use" orientation):
    X  width, left -> right as seen from the front
    Y  height, bottom -> top
    Z  depth, front face at z = 0, back at z = depth
The grid origin is the bottom-left-front corner of a module's grid cell.

Face roles (fixed for every module, so any two modules mate):
    top and right faces   carry dovetail RAILS and lock WINDOWS   ("R" faces)
    bottom and left faces carry dovetail GROOVES and lock TONGUES ("G" faces)
"""
from __future__ import annotations

import math
from dataclasses import dataclass, fields, asdict


@dataclass
class Params:
    # ---------------------------------------------------------------- grid
    unit_w: float = 60.0        # grid pitch in X (outside width of a 1-wide module + gap)
    unit_h: float = 40.0        # grid pitch in Y
    depth: float = 130.0        # case depth, front to back
    gap: float = 0.2            # nominal gap between neighbouring modules

    # ---------------------------------------------------------------- case walls
    wall: float = 1.6           # top and right walls (rail faces)
    groove_backing: float = 0.8 # material left behind a groove at the nominal 0.25 mm fit
    edge_chamfer: float = 0.5   # 45 deg chamfer on front edges (elephant's-foot relief)

    # ---------------------------------------------------------------- dovetail
    dt_height: float = 1.6      # rail height above the module face
    dt_neck: float = 5.0        # rail width where it leaves the face
    dt_angle: float = 30.0      # flank undercut, degrees from the face normal
    dt_tip_chamfer: float = 0.4 # chamfer on the rail's outer corners
    fit_dovetail: float = 0.25  # clearance per side between rail and groove
    dt_start: float = 10.5      # rails/grooves start this far behind the front face
    dt_flare: float = 0.5       # extra width at the groove's rear entry (lead-in)
    dt_flare_len: float = 5.0

    # ---------------------------------------------------------------- flexure band
    band: float = 8.0           # flexures live in the first `band` mm (printed on the bed)
    slit: float = 0.7           # width of the cuts that free a flexure

    # ---------------------------------------------------------------- module lock
    lock_len: float = 18.0      # tongue length
    lock_t: float = 1.6         # tongue thickness
    lock_bump: float = 1.4      # bump height proud of the module face
    lock_bump_w: float = 5.0    # bump width along the tongue
    lock_bump_z: float = 1.4    # bump starts this far behind the front face
    lock_bump_top: float = 1.0  # flat on top of the bump (z)
    lock_catch_deg: float = 45.0  # holding face, deg from the sliding direction
    lock_ramp_deg: float = 30.0   # lead-in face
    lock_x: float = 22.0        # free end of a bottom tongue, from the cell's left edge
    lock_y: float = 8.0         # free end of a left tongue, from the cell's bottom edge
    window_fit: float = 0.4     # clearance around the bump inside the window (x/y)
    lock_play: float = 0.4      # free travel along the depth before the lock catches

    # ---------------------------------------------------------------- drawer stop
    stop_len: float = 14.5      # spring tongue length
    stop_t: float = 1.2         # spring tongue thickness
    stop_bump: float = 1.1      # bump height above the floor
    stop_bump_w: float = 2.6    # bump width (x)
    stop_bump_z: float = 1.2    # bump starts this far behind the front face
    stop_bump_top: float = 1.5  # flat on top of the bump (z)
    stop_ramp_deg: float = 30.0   # insertion side (front)
    stop_catch_deg: float = 50.0  # removal side (back)
    stop_inside: float = 30.0   # drawer length still inside the case at the stop
    stop_recess: float = 0.2    # spring sits this far below the floor so a loaded
                                # drawer never presses it down

    # ---------------------------------------------------------------- rear lip
    rear_lip_w: float = 3.0     # how far the lip reaches in from the walls
    rear_lip_t: float = 1.6     # flat part; a 45 deg chamfer sits in front of it

    # ---------------------------------------------------------------- drawer
    fit_side: float = 0.35      # drawer-to-case clearance, each side
    fit_top: float = 0.5        # clearance above the drawer
    d_wall: float = 1.2
    d_floor: float = 1.2
    d_front: float = 2.0
    d_front_recess: float = 0.3 # drawer face sits this far behind the case face
    d_chamfer: float = 5.0      # 45 deg chamfer on the drawer's bottom long edges (stop channel)
    d_edge: float = 0.4         # chamfer on the drawer's bottom front/back edges
    d_scoop: float = 6.0        # 45 deg scoop inside the front-bottom corner (0 = none)
    catch_len: float = 3.0      # length of the drawer's catch block
    pull_depth: float = 6.0     # pull lip projects this far in front of the drawer face
    pull_t: float = 1.8         # pull lip thickness at its front edge
    pull_radius: float = 2.0    # rounding of the pull lip corners (plan view)
    label: bool = True
    label_h: float = 14.0
    label_margin: float = 6.0
    label_depth: float = 0.6
    divider_pitch: float = 30.0 # divider slots every N mm, centred
    divider_t: float = 1.2
    divider_fit: float = 0.2    # per side, divider in its slot
    rib_t: float = 1.0          # slot rib thickness (x)
    rib_d: float = 1.2          # slot rib depth (z)

    # ---------------------------------------------------------------- base plate
    base_t: float = 3.0

    # ================================================================ derived
    FIT_NOMINAL = 0.25

    @property
    def thick(self) -> float:
        """Bottom/left (groove) wall thickness.

        It does not depend on fit_dovetail: a looser fit only deepens the groove
        (see backing), so the springs keep their room to flex and casings and
        drawers from batches with different clearances stay interchangeable."""
        return self.dt_height - self.gap + self.FIT_NOMINAL + self.groove_backing

    @property
    def backing(self) -> float:
        """Material actually left behind a groove at the chosen fit_dovetail."""
        return self.groove_backing + self.FIT_NOMINAL - self.fit_dovetail

    @property
    def dt_head(self) -> float:
        return self.dt_neck + 2 * self.dt_height * math.tan(math.radians(self.dt_angle))

    def outer(self, w: int, h: int):
        """Module body extents (x0, x1, y0, y1)."""
        g = self.gap / 2
        return g, w * self.unit_w - g, g, h * self.unit_h - g

    def interior(self, w: int, h: int):
        x0, x1, y0, y1 = self.outer(w, h)
        return x0 + self.thick, x1 - self.wall, y0 + self.thick, y1 - self.wall

    # lock bump profile in its own frame: v = outward from the tongue's outer
    # surface, z = depth.  Returned as a closed polygon.
    def lock_profile(self):
        v_face = self.thick - self.lock_t          # tongue surface -> module face
        v_tip = v_face + self.lock_bump
        za = self.lock_bump_z
        zb = za + v_tip / math.tan(math.radians(self.lock_catch_deg))
        zc = zb + self.lock_bump_top
        zd = zc + self.lock_bump / math.tan(math.radians(self.lock_ramp_deg))
        return [(0.0, za), (v_tip, zb), (v_tip, zc), (v_face, zd), (0.0, zd)]

    def lock_window_z(self):
        """z-range of the window in an R face that receives the bump."""
        v_face = self.thick - self.lock_t
        v_r = v_face + self.gap                     # R face plane in bump frame
        prof = self.lock_profile()
        za, zb, zc, zd = prof[0][1], prof[1][1], prof[2][1], prof[3][1]
        v_tip = prof[1][0]
        z_front_at_r = za + v_r * (zb - za) / v_tip
        z_rear_at_r = zc + (v_tip - v_r) * (zd - zc) / (v_tip - v_face)
        return z_front_at_r - self.lock_play, z_rear_at_r + self.window_fit, z_front_at_r

    def stop_profile(self):
        """Drawer-stop bump: (v = height above the floor, z) polygon.  The bump
        rises from the recessed spring surface (v = -stop_recess)."""
        r, b = self.stop_recess, self.stop_bump
        z0 = self.stop_bump_z
        z1 = z0 + (b + r) / math.tan(math.radians(self.stop_ramp_deg))
        z2 = z1 + self.stop_bump_top
        z3 = z2 + (b + r) / math.tan(math.radians(self.stop_catch_deg))
        return [(-r, z0), (b, z1), (b, z2), (-r, z3)]

    def stop_catch_z(self):
        """z where the bump's holding face meets the floor plane (v = 0)."""
        r = self.stop_recess
        return self.stop_profile()[-1][1] - r / math.tan(math.radians(self.stop_catch_deg))

    def drawer_box(self, w: int, h: int):
        """Drawer outer box in case coordinates, closed position:
        (x0, x1, y0, y1, z_front, z_rear)."""
        xi0, xi1, yi0, yi1 = self.interior(w, h)
        # the rear lip is a 45 deg chamfer: the drawer's rear corners meet it
        # `clear` behind the chamfer root, where clear is the smallest gap
        # between the drawer's rear edges and the case walls
        clear = min(self.fit_side, self.fit_top, self.d_edge)
        z_rear = self.depth - self.rear_lip_t - self.rear_lip_w + clear
        return (xi0 + self.fit_side, xi1 - self.fit_side, yi0, yi1 - self.fit_top,
                self.d_front_recess, z_rear)

    # ================================================================ checks
    def check(self, sizes=((1, 1),)):
        """Raise ValueError if the parameters cannot produce a working part."""
        errs = []
        if self.band + self.slit + 1.0 > self.dt_start:
            errs.append("band + slit must end at least 1 mm before dt_start")
        if self.lock_profile()[-1][1] > self.band - 0.3:
            errs.append("lock bump does not fit inside the flexure band")
        if self.stop_profile()[-1][1] > self.band - 0.3:
            errs.append("stop bump does not fit inside the flexure band")
        wz0, wz1, zf = self.lock_window_z()
        if wz0 < 1.8:
            errs.append(f"only {wz0:.2f} mm of wall in front of the lock window (need 1.8); "
                        "raise lock_bump_z")
        if self.lock_play < 0.2:
            errs.append("lock_play below 0.2 mm risks modules not seating")
        if self.backing < 0.6 - 1e-9:
            errs.append(f"only {self.backing:.2f} mm left behind the groove (need 0.6); "
                        "lower fit_dovetail or raise groove_backing")
        if self.fit_dovetail < 0.1:
            errs.append("fit_dovetail below 0.1 mm will not slide")
        if self.thick - self.lock_t < 0.6:
            errs.append("lock tongue is not thinner than the groove wall")
        room = self.thick - self.stop_recess - self.stop_t + self.gap
        if room < self.stop_bump + 0.1:
            errs.append(f"stop tongue has {room:.2f} mm to deflect, needs stop_bump + 0.1")
        if self.slit < 0.5:
            errs.append("slit narrower than 0.5 mm will fuse when printed")
        # bottom wall layout for a 1-wide module: stop | anchor | lock | anchor | stop
        xi0, xi1, _, _ = self.interior(1, 1)
        left_fix = xi0 + self.slit + self.stop_len
        right_fix = xi1 - self.slit - self.stop_len
        a1 = (self.lock_x - self.slit) - left_fix
        a2 = right_fix - (self.lock_x + self.lock_len)
        if min(a1, a2) < 2.0:
            errs.append(f"bottom-wall anchors too narrow ({a1:.2f}, {a2:.2f} mm); "
                        "adjust lock_x / lock_len / stop_len")
        if self.lock_y - self.slit < self.thick + 1.0:
            errs.append("left lock tongue collides with the bottom wall")
        _, _, yi0, yi1 = self.interior(1, 1)
        if self.lock_y + self.lock_len > yi1 - 1.0:
            errs.append("left lock tongue collides with the top wall")
        # drawer stop bump must sit inside the drawer's corner chamfer
        x_bump_hi = xi0 + self.slit + 0.2 + self.stop_bump_w
        chamfer_x_at_top = xi0 + self.fit_side + self.d_chamfer - self.stop_bump
        if x_bump_hi > chamfer_x_at_top - 0.4:
            errs.append("stop bump does not clear the drawer chamfer; raise d_chamfer")
        for (w, h) in sizes:
            x0, x1, y0, y1 = self.outer(w, h)
            if x1 - x0 > 250 or y1 - y0 > 250 or self.depth > 250:
                errs.append(f"{w}x{h} does not fit a 256 mm bed")
        if self.stop_inside < self.band + self.catch_len + 10:
            errs.append("stop_inside too small")
        if errs:
            raise ValueError("Parameter check failed:\n  - " + "\n  - ".join(errs))
        return True

    # ================================================================ io
    def as_dict(self):
        d = asdict(self)
        d["thick (derived)"] = round(self.thick, 3)
        d["backing (derived)"] = round(self.backing, 3)
        d["dt_head (derived)"] = round(self.dt_head, 3)
        return d

    def override(self, assignments):
        """Apply 'name=value' strings."""
        types = {f.name: f.type for f in fields(self)}
        for a in assignments or []:
            k, v = a.split("=", 1)
            k = k.strip()
            if k not in types:
                raise KeyError(f"unknown parameter {k}")
            cur = getattr(self, k)
            if isinstance(cur, bool):
                setattr(self, k, v.strip().lower() in ("1", "true", "yes", "on"))
            else:
                setattr(self, k, type(cur)(v))
        return self
