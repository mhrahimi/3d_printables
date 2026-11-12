// Parametric geometry for the modular drawer system, on the Manifold kernel.
// A line-for-line port of drawer_system/params.py + parts.py (CadQuery).
//
// Build frame: x = width (left -> right seen from the BACK), y = up,
// z = depth with the front face at z = 0 and the back at z = depth.
// toUse() mirrors a part in z into the use frame: +x right as seen from the
// front, +y up, front at z = 0, back at z = -depth, drawers pull towards +z.

export const DEFAULTS = {
  unit_w: 60, unit_h: 40, depth: 130, gap: 0.2,
  wall: 1.6, groove_backing: 0.8, edge_chamfer: 0.5,
  dt_height: 1.6, dt_neck: 5, dt_angle: 30, dt_tip_chamfer: 0.4, fit_dovetail: 0.25,
  dt_start: 10.5, dt_flare: 0.5, dt_flare_len: 5,
  band: 8, slit: 0.7,
  lock_len: 18, lock_t: 1.6, lock_bump: 1.4, lock_bump_w: 5, lock_bump_z: 1.4, lock_bump_top: 1,
  lock_catch_deg: 45, lock_ramp_deg: 30, lock_x: 22, lock_y: 8, window_fit: 0.4, lock_play: 0.4,
  stop_len: 14.5, stop_t: 1.2, stop_bump: 1.1, stop_bump_w: 2.6, stop_bump_z: 1.2, stop_bump_top: 1.5,
  stop_ramp_deg: 30, stop_catch_deg: 50, stop_inside: 30, stop_recess: 0.2,
  rear_lip_w: 3, rear_lip_t: 1.6,
  fit_side: 0.35, fit_top: 0.5, d_wall: 1.2, d_floor: 1.2, d_front: 2, d_front_recess: 0.3,
  d_chamfer: 5, d_edge: 0.4, d_scoop: 6, catch_len: 3, pull: 'lip', pull_depth: 6, pull_t: 1.8, pull_radius: 2,
  label: true, label_h: 14, label_margin: 6, label_depth: 0.6,
  divider_pitch: 30, divider_t: 1.2, divider_fit: 0.2, rib_t: 1, rib_d: 1.2,
  base_t: 3,
  panel_t: 3, deboss: 0.6, leg_wall: 1.6,
};

const rad = (d) => (d * Math.PI) / 180;
const SQ2 = Math.SQRT2;
const EMB = 0.6;   // rails are sunk this far into their wall
const OV = 0.3;    // overlap used wherever two pieces are joined

// ------------------------------------------------------------------ derived
/** Grooved (bottom/left) wall thickness.  It does not depend on the rail
 *  clearance: a looser fit only deepens the groove, so casings and drawers
 *  from batches with different clearances stay interchangeable. */
export const FIT_NOMINAL = 0.25;
export const thick = (p) => p.dt_height - p.gap + FIT_NOMINAL + p.groove_backing;
export const grooveBacking = (p) => p.groove_backing + FIT_NOMINAL - p.fit_dovetail;
export function outer(p, w, h) {
  const g = p.gap / 2;
  return [g, w * p.unit_w - g, g, h * p.unit_h - g];
}
export function interior(p, w, h) {
  const [x0, x1, y0, y1] = outer(p, w, h);
  return [x0 + thick(p), x1 - p.wall, y0 + thick(p), y1 - p.wall];
}
export function lockProfile(p) {
  const vFace = thick(p) - p.lock_t;
  const vTip = vFace + p.lock_bump;
  const za = p.lock_bump_z;
  const zb = za + vTip / Math.tan(rad(p.lock_catch_deg));
  const zc = zb + p.lock_bump_top;
  const zd = zc + p.lock_bump / Math.tan(rad(p.lock_ramp_deg));
  return [[0, za], [vTip, zb], [vTip, zc], [vFace, zd], [0, zd]];
}
export function lockWindowZ(p) {
  const vFace = thick(p) - p.lock_t;
  const vR = vFace + p.gap;
  const pr = lockProfile(p);
  const za = pr[0][1], zb = pr[1][1], zc = pr[2][1], zd = pr[3][1], vTip = pr[1][0];
  const zFront = za + (vR * (zb - za)) / vTip;
  const zRear = zc + ((vTip - vR) * (zd - zc)) / (vTip - vFace);
  return [zFront - p.lock_play, zRear + p.window_fit, zFront];
}
export function stopProfile(p) {
  const r = p.stop_recess, b = p.stop_bump;
  const z0 = p.stop_bump_z;
  const z1 = z0 + (b + r) / Math.tan(rad(p.stop_ramp_deg));
  const z2 = z1 + p.stop_bump_top;
  const z3 = z2 + (b + r) / Math.tan(rad(p.stop_catch_deg));
  return [[-r, z0], [b, z1], [b, z2], [-r, z3]];
}
export const stopCatchZ = (p) =>
  stopProfile(p)[3][1] - p.stop_recess / Math.tan(rad(p.stop_catch_deg));
/** Finger notch for p.pull === 'notch': radius and how far it reaches down from the rim. */
export function notchSize(p, w = 1, h = 1) {
  if (p.pull !== 'notch') return null;
  const [X0, X1, Y0, Y1] = drawerBox(p, w, h);
  const r = Math.min(11, 0.2 * (X1 - X0)), depth = Math.min(0.75 * r, 0.3 * (Y1 - Y0));
  return { r, depth };
}
export function drawerBox(p, w, h) {
  const [xi0, xi1, yi0, yi1] = interior(p, w, h);
  const clear = Math.min(p.fit_side, p.fit_top, p.d_edge);
  const zRear = p.depth - p.rear_lip_t - p.rear_lip_w + clear;
  return [xi0 + p.fit_side, xi1 - p.fit_side, yi0, yi1 - p.fit_top, p.d_front_recess, zRear];
}
/** How far a drawer slides out before the stop catches it. */
export const stopTravel = (p) => drawerBox(p, 1, 1)[5] - p.stop_inside;

/** Largest module (grid units) that fits a square bed. */
export function maxUnits(p, bed = 256) {
  const lim = bed - 6;
  const extra = p.dt_height + p.lock_bump - p.gap;
  return {
    w: Math.max(1, Math.floor((lim - extra) / p.unit_w)),
    h: Math.max(1, Math.floor((lim - extra) / p.unit_h)),
  };
}

/** x centres (drawer coordinates) of n-1 partitions making n equal compartments. */
export function acrossCenters(p, w, h, n) {
  const [X0, X1] = drawerBox(p, w, h);
  const a = X0 + p.d_wall, b = X1 - p.d_wall, t = p.divider_t;
  const comp = (b - a - (n - 1) * t) / n;
  const out = [];
  for (let i = 1; i < n; i++) out.push(a + i * comp + (i - 0.5) * t);
  return { centers: out, comp };
}
/** z centres of m-1 cross walls making m equal compartments front to back. */
export function deepCenters(p, m) {
  const [, , , , Zf, Zr] = drawerBox(p, 1, 1);
  const a = Zf + p.d_front, b = Zr - p.d_wall, t = p.divider_t;
  const comp = (b - a - (m - 1) * t) / m;
  const out = [];
  for (let i = 1; i < m; i++) out.push(a + i * comp + (i - 0.5) * t);
  return { centers: out, comp };
}
export function maxAcross(p, w, h, minComp = 12) {
  const [X0, X1] = drawerBox(p, w, h);
  const inner = X1 - X0 - 2 * p.d_wall;
  return Math.max(1, Math.floor((inner + p.divider_t) / (minComp + p.divider_t)));
}
export function maxDeep(p, minComp = 18) {
  const [, , , , Zf, Zr] = drawerBox(p, 1, 1);
  const inner = Zr - Zf - p.d_front - p.d_wall;
  return Math.max(1, Math.floor((inner + p.divider_t) / (minComp + p.divider_t)));
}

/** Parameter sanity checks (same rules as Params.check in Python). */
export function check(p) {
  const e = [];
  if (p.band + p.slit + 1 > p.dt_start) e.push('Flexure band reaches the rails.');
  if (lockProfile(p)[4][1] > p.band - 0.3) e.push('Lock bump does not fit the flexure band.');
  if (stopProfile(p)[3][1] > p.band - 0.3) e.push('Stop bump does not fit the flexure band.');
  if (lockWindowZ(p)[0] < 1.8) e.push('Too little wall in front of the lock window.');
  if (thick(p) - p.lock_t < 0.6) e.push('Lock spring is not thinner than its wall.');
  if (grooveBacking(p) < 0.6 - 1e-9) e.push('Rail clearance is too large: less than 0.6 mm of wall is left behind the groove.');
  if (p.fit_dovetail < 0.1) e.push('Rail clearance below 0.1 mm will not slide.');
  if (thick(p) - p.stop_recess - p.stop_t + p.gap < p.stop_bump + 0.1)
    e.push('Drawer-stop spring has no room to flex.');
  const [xi0, xi1, , yi1] = interior(p, 1, 1);
  const a1 = p.lock_x - p.slit - (xi0 + p.slit + p.stop_len);
  const a2 = xi1 - p.slit - p.stop_len - (p.lock_x + p.lock_len);
  if (Math.min(a1, a2) < 2) e.push('Base width is too small for the lock and stop springs (minimum 59 mm).');
  if (p.lock_y + p.lock_len > yi1 - 1) e.push('Base height is too small for the side lock (minimum 29 mm).');
  if (p.depth < p.stop_inside + 40) e.push('Depth is too small (minimum 70 mm).');
  if (p.depth > 250) e.push('Depth is more than a 256 mm printer can print.');
  return e;
}

function signedArea(P) {
  let s = 0;
  for (let i = 0; i < P.length; i++) {
    const a = P[i], b = P[(i + 1) % P.length];
    s += a[0] * b[1] - b[0] * a[1];
  }
  return s / 2;
}
function offsetPolygon(pts, d) {
  const n = pts.length;
  const sgn = signedArea(pts) > 0 ? 1 : -1;
  const lines = [];
  for (let i = 0; i < n; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % n];
    const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy);
    const nx = (sgn * dy) / L, ny = (-sgn * dx) / L;
    lines.push([[x0 + nx * d, y0 + ny * d], [dx, dy]]);
  }
  const out = [];
  for (let i = 0; i < n; i++) {
    const [pp, r] = lines[(i - 1 + n) % n], [q, s] = lines[i];
    const cross = r[0] * s[1] - r[1] * s[0];
    if (Math.abs(cross) < 1e-12) { out.push(q); continue; }
    const t = ((q[0] - pp[0]) * s[1] - (q[1] - pp[1]) * s[0]) / cross;
    out.push([pp[0] + t * r[0], pp[1] + t * r[1]]);
  }
  return out;
}
function railProfile(p) {
  const a = p.dt_neck / 2, h = p.dt_height;
  const b = a + h * Math.tan(rad(p.dt_angle)), k = p.dt_tip_chamfer;
  const L = Math.hypot(b - a, h), fx = (b - a) / L, fy = h / L;
  const c1 = [b - fx * k, h - fy * k], c2 = [b - k, h];
  return [[-a, -EMB], [a, -EMB], [a, 0], c1, c2, [-c2[0], c2[1]], [-c1[0], c1[1]], [-a, 0]];
}
const grooveProfile = (p, extra = 0) => offsetPolygon(railProfile(p), p.fit_dovetail + extra);
function grooveMouthHalf(p) {
  const th = rad(p.dt_angle);
  return p.dt_neck / 2 + p.gap * Math.tan(th) + p.fit_dovetail / Math.cos(th);
}
const mapFace = (face, c, base, pts) =>
  face === 'top' ? pts.map(([u, v]) => [c + u, base + v]) : pts.map(([u, v]) => [base + v, c + u]);

// ------------------------------------------------------------------ finish add-ons (pure helpers)
export const ROD_FIT = 0.3;      // clearance per side around a rod (long channels printed on edge, oversize dowels)
export const PLUG_LEN = 8;       // printed plug that closes each end of a rod channel
export const TILT = 12;          // tilted label strip on the top panel: 12 x 12 mm, face at 45 deg
export const ROD_MIN = 3;
export const ROD_MAX = 12;
/**
 * Panels that cannot lie face-down print standing on their front edge:
 * structural ones (rod channels), and labelled ones with raised letters or a tilted strip.
 * look = { raised, tilt } for labelled panels.
 */
export function panelEdge(side, style, look = {}) {
  if (style === 'structural') return true;
  return style === 'labeled' && (!!look.raised || (!!look.tilt && side === 'top'));
}
/** Thickness of a top or side panel. */
export function panelT(p, style, rod, look = {}, side = 'top') {
  if (style === 'structural') return thick(p) + 0.4 + rod.d + 2 * ROD_FIT + 1.2;
  // edge-printed panels need room behind the lock spring to flex into
  if (panelEdge(side, style, look)) return thick(p) + (p.lock_bump - p.gap + 0.3) + 1.2;
  return p.panel_t;
}
/** Depth positions (from the front) of the two rod channels. */
export const rodZ = (p) => { const a = Math.max(20, 0.22 * p.depth); return [a, p.depth - a]; };
/**
 * Slim side pieces: one 30 mm strip per row at the front, carrying a single vertical rod that
 * runs through every row. The channel sits behind the lock spring (which ends ~12 mm in).
 */
export const SLIM_D = 30;
export const slimRodZ = (rod) => SLIM_D - (rod.d / 2 + ROD_FIT) - 3;
/** Print orientation of an add-on: thin panels lie flat, thick ones stand on their front edge. */
export function panelPose(side, style, look = {}) {
  if (side === 'bottom') return style === 'legs' ? 'case' : 'base';
  if (panelEdge(side, style, look)) return 'case';
  return { top: 'topflat', right: 'rightflat', left: 'leftflat' }[side];
}

// Single-stroke capitals on a 4 x 6 grid (polylines), for engraved labels.
const O_ = [[1, 0], [0, 1], [0, 5], [1, 6], [3, 6], [4, 5], [4, 1], [3, 0], [1, 0]];
const P_ = [[0, 0], [0, 6], [3, 6], [4, 5], [4, 4], [3, 3], [0, 3]];
const GLYPHS = {
  A: [[[0, 0], [2, 6], [4, 0]], [[1, 2], [3, 2]]],
  B: [[[0, 0], [0, 6], [3, 6], [4, 5], [4, 4], [3, 3], [0, 3]], [[3, 3], [4, 2], [4, 1], [3, 0], [0, 0]]],
  C: [[[4, 5], [3, 6], [1, 6], [0, 5], [0, 1], [1, 0], [3, 0], [4, 1]]],
  D: [[[0, 0], [0, 6], [2, 6], [4, 4], [4, 2], [2, 0], [0, 0]]],
  E: [[[4, 6], [0, 6], [0, 0], [4, 0]], [[0, 3], [3, 3]]],
  F: [[[4, 6], [0, 6], [0, 0]], [[0, 3], [3, 3]]],
  G: [[[4, 5], [3, 6], [1, 6], [0, 5], [0, 1], [1, 0], [3, 0], [4, 1], [4, 3], [2, 3]]],
  H: [[[0, 0], [0, 6]], [[4, 0], [4, 6]], [[0, 3], [4, 3]]],
  I: [[[1, 0], [3, 0]], [[2, 0], [2, 6]], [[1, 6], [3, 6]]],
  J: [[[0, 1], [1, 0], [3, 0], [4, 1], [4, 6]]],
  K: [[[0, 0], [0, 6]], [[4, 6], [0, 3], [4, 0]]],
  L: [[[0, 6], [0, 0], [4, 0]]],
  M: [[[0, 0], [0, 6], [2, 3], [4, 6], [4, 0]]],
  N: [[[0, 0], [0, 6], [4, 0], [4, 6]]],
  O: [O_],
  P: [P_],
  Q: [O_, [[2.5, 1.5], [4, 0]]],
  R: [P_, [[2, 3], [4, 0]]],
  S: [[[4, 5], [3, 6], [1, 6], [0, 5], [0, 4], [1, 3], [3, 3], [4, 2], [4, 1], [3, 0], [1, 0], [0, 1]]],
  T: [[[0, 6], [4, 6]], [[2, 6], [2, 0]]],
  U: [[[0, 6], [0, 1], [1, 0], [3, 0], [4, 1], [4, 6]]],
  V: [[[0, 6], [2, 0], [4, 6]]],
  W: [[[0, 6], [1, 0], [2, 4], [3, 0], [4, 6]]],
  X: [[[0, 0], [4, 6]], [[0, 6], [4, 0]]],
  Y: [[[0, 6], [2, 3], [4, 6]], [[2, 3], [2, 0]]],
  Z: [[[0, 6], [4, 6], [0, 0], [4, 0]]],
  0: [O_, [[1.4, 2], [2.6, 4]]],
  1: [[[1, 5], [2, 6], [2, 0]], [[1, 0], [3, 0]]],
  2: [[[0, 5], [1, 6], [3, 6], [4, 5], [4, 4], [0, 0], [4, 0]]],
  3: [[[0, 5], [1, 6], [3, 6], [4, 5], [4, 4], [3, 3], [1.5, 3]], [[3, 3], [4, 2], [4, 1], [3, 0], [1, 0], [0, 1]]],
  4: [[[3, 0], [3, 6], [0, 2], [4, 2]]],
  5: [[[4, 6], [0, 6], [0, 3.5], [3, 3.5], [4, 2.5], [4, 1], [3, 0], [1, 0], [0, 1]]],
  6: [[[4, 5], [3, 6], [1, 6], [0, 5], [0, 1], [1, 0], [3, 0], [4, 1], [4, 2.5], [3, 3.5], [0, 3.5]]],
  7: [[[0, 6], [4, 6], [1.5, 0]]],
  8: [[[1, 3], [0, 4], [0, 5], [1, 6], [3, 6], [4, 5], [4, 4], [3, 3], [1, 3], [0, 2], [0, 1], [1, 0], [3, 0], [4, 1], [4, 2], [3, 3]]],
  9: [[[0, 1], [1, 0], [3, 0], [4, 1], [4, 5], [3, 6], [1, 6], [0, 5], [0, 3.5], [1, 2.5], [4, 2.5]]],
  '-': [[[0.5, 3], [3.5, 3]]],
  '+': [[[0.5, 3], [3.5, 3]], [[2, 1.5], [2, 4.5]]],
  '/': [[[0, 0], [4, 6]]],
  '.': [[[2, 0], [2, 0]]],
  ':': [[[2, 1], [2, 1]], [[2, 4.5], [2, 4.5]]],
  '&': [[[4, 0], [1, 4.5], [1, 5.5], [1.75, 6], [2.5, 5.5], [2.5, 4.5], [0, 2], [0, 1], [1, 0], [2.5, 0], [4, 2]]],
  '#': [[[0.8, 0], [1.2, 6]], [[2.8, 0], [3.2, 6]], [[0, 2], [4, 2]], [[0, 4], [4, 4]]],
};
/** Characters a label may use (others are dropped). */
export const labelClean = (text) => [...String(text || '').toUpperCase()].filter((c) => c === ' ' || GLYPHS[c]).join('').replace(/\s+/g, ' ').trim().slice(0, 24);
/**
 * Outline polygons of an engraved label, centred on (0, 0): u to the right, v up.
 * The cap height shrinks (down to 5 mm) to fit maxWidth; extra letters are dropped.
 */
export function labelPolys(text, cap, maxWidth) {
  let chars = [...labelClean(text)];
  const widthOf = (n, u) => (n * 5.5 - 1.5) * u;
  let u = cap / 6;
  if (chars.length && widthOf(chars.length, u) > maxWidth) u = Math.max(5 / 6, maxWidth / (chars.length * 5.5 - 1.5));
  while (chars.length && widthOf(chars.length, u) > maxWidth + 1e-9) chars.pop();
  if (!chars.length) return { polys: [], width: 0, cap: 0, text: '' };
  const hw = Math.max(0.5, 0.4 * u), W = widthOf(chars.length, u), polys = [];
  const oct = (x, y) => Array.from({ length: 8 }, (_, k) => [x + hw * 1.0824 * Math.cos(rad(22.5 + 45 * k)), y + hw * 1.0824 * Math.sin(rad(22.5 + 45 * k))]);
  chars.forEach((ch, i) => {
    const x0 = -W / 2 + i * 5.5 * u, y0 = -3 * u;
    for (const line of GLYPHS[ch] || []) {
      const pts = line.map(([a, b]) => [x0 + a * u, y0 + b * u]);
      pts.forEach(([x, y]) => polys.push(oct(x, y)));
      for (let k = 0; k + 1 < pts.length; k++) {
        const [ax, ay] = pts[k], [bx, by] = pts[k + 1], L = Math.hypot(bx - ax, by - ay);
        if (L < 1e-6) continue;
        const nx = (-(by - ay) / L) * hw, ny = ((bx - ax) / L) * hw;
        polys.push([[ax + nx, ay + ny], [ax - nx, ay - ny], [bx - nx, by - ny], [bx + nx, by + ny]]);
      }
    }
  });
  return { polys, width: W + 2 * hw, cap: 6 * u + 2 * hw, text: chars.join('') };
}

// ------------------------------------------------------------------ kernel
export function createKernel(M) {
  const { Manifold, CrossSection } = M;
  let trash = [];
  const keep = (o) => { trash.push(o); return o; };
  /** Run fn, free every intermediate solid it made, return its result. */
  const scoped = (fn) => (...args) => {
    const start = trash.length;
    const r = fn(...args);
    for (let i = trash.length - 1; i >= start; i--) if (trash[i] !== r) trash[i].delete();
    trash.length = start;
    return r;
  };

  const box = (x0, x1, y0, y1, z0, z1) =>
    keep(keep(Manifold.cube([x1 - x0, y1 - y0, z1 - z0])).translate([x0, y0, z0]));
  const ccw = (pts) => { const P = pts.map((q) => [q[0], q[1]]); if (signedArea(P) < 0) P.reverse(); return P; };
  function extrudeAlong(axis, polys, lo, hi) {
    const cs = keep(new CrossSection(polys, 'Positive'));
    const m = keep(cs.extrude(hi - lo));
    if (axis === 'z') return keep(m.translate([0, 0, lo]));
    if (axis === 'x') return keep(m.transform([0, 1, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, lo, 0, 0, 1]));
    return keep(m.transform([1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, lo, 0, 1]));
  }
  const prism = (axis, pts, lo, hi) => extrudeAlong(axis, [ccw(pts)], lo, hi);
  /** Union of many polygons, extruded (used for engraved text). */
  const prismMulti = (axis, polys, lo, hi) => extrudeAlong(axis, polys.map(ccw), lo, hi);
  const hull = (pts) => keep(Manifold.hull(pts));
  const loftRects = (r0, z0, r1, z1) => {
    const c = ([x0, x1, y0, y1], z) => [[x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z]];
    return hull([...c(r0, z0), ...c(r1, z1)]);
  };
  const union = (list) => (list.length === 1 ? list[0] : keep(Manifold.union(list)));
  const cut = (a, tools) => (tools.length ? keep(a.subtract(union(tools))) : a);
  const fuse = (a, tools) => (tools.length ? union([a, ...tools]) : a);
  const isect = (a, b) => keep(a.intersect(b));

  // ---------------------------------------------------------------- dovetail
  function rampKeep(face, base, zStart, c, span, depth) {
    const big = depth + 20;
    const pts = [[-8, zStart - 8], [12, zStart + 12], [12, big], [-8, big]];
    return prism(face === 'top' ? 'x' : 'y', pts.map(([v, z]) => [base + v, z]), c - span, c + span);
  }
  function rail(p, face, c, base, zEnd) {
    const solid = prism('z', mapFace(face, c, base, railProfile(p)), p.dt_start - 2, zEnd);
    return isect(solid, rampKeep(face, base, p.dt_start, c, 10, zEnd));
  }
  function grooveCutter(p, face, c, base, zEnd) {
    const prof = grooveProfile(p);
    const main = prism('z', mapFace(face, c, base, prof), p.dt_start - 2, zEnd + 1);
    const m = grooveMouthHalf(p), k = 0.4, g = p.gap;
    const mouth = [[-(m + k), g - 1], [m + k, g - 1], [m + k, g], [m, g + k], [-m, g + k], [-(m + k), g]];
    const mouthS = prism('z', mapFace(face, c, base, mouth), p.dt_start - 2, zEnd + 1);
    const cutter = isect(union([main, mouthS]), rampKeep(face, base, p.dt_start, c, 12, zEnd + 1));
    // rear lead-in: ruled loft from the groove to a wider groove.  The profile
    // is a stem (indices 0,1,2,7) plus a head (2..7); both pieces are convex
    // and their corresponding edges are parallel, so each loft is a hull.
    // it widens the mouth and flanks only: the groove floor keeps its depth, so the
    // wall behind it never thins below the groove backing
    // (each half is shifted sideways, so every edge stays parallel to its partner)
    const flareProf = prof.map(([u, v]) => [u + Math.sign(u) * p.dt_flare, v]);
    const z0 = zEnd - p.dt_flare_len, z1 = zEnd + 0.01;
    const ring = (pr, idx, z) => mapFace(face, c, base, idx.map((i) => pr[i])).map(([x, y]) => [x, y, z]);
    const stem = [0, 1, 2, 7], head = [2, 3, 4, 5, 6, 7];
    // the stem piece reaches 0.2 mm up into the head piece (which is wider there)
    const up = (pr) => pr.map(([u, v], i) => (i === 2 || i === 7 ? [u, v + 0.2] : [u, v]));
    const flare = [
      hull([...ring(up(prof), stem, z0), ...ring(up(flareProf), stem, z1)]),
      hull([...ring(prof, head, z0), ...ring(flareProf, head, z1)]),
    ];
    const tail = prism('z', mapFace(face, c, base, flareProf), z1 - 1e-3, zEnd + 1);
    return union([cutter, ...flare, tail]);
  }

  // ---------------------------------------------------------------- flexures
  function flexureCuts(p, wall, span, freeLow, t, recess = 0) {
    const [a, b] = span, s = p.slit;
    const outFace = p.gap / 2, inner = p.gap / 2 + thick(p), zt = p.band;
    const ext = freeLow ? [a - s, b] : [a, b + s];
    const fs = freeLow ? [a - s, a] : [b, b + s];
    const tp = inner - recess - t;
    const pocket = [[outFace - 1.5, -1], [tp, -1], [tp, zt + s], [outFace, zt + s + (tp - outFace)],
      [outFace - 1.5, zt + s + (tp - outFace) + 1.5]];
    const fl = 0.4;
    const flare = [[fs[0] - fl, -1], [fs[1] + fl, -1], [fs[1] + fl, 0], [fs[1], 2 * fl], [fs[0], 2 * fl], [fs[0] - fl, 0]];
    const cuts = [];
    if (wall === 'bottom') {
      if (recess > 0) cuts.push(box(ext[0], ext[1], inner - recess, inner + 0.6, -1, zt + s));
      cuts.push(prism('y', flare, outFace - 1.5, inner + 0.6));
      cuts.push(box(fs[0], fs[1], outFace - 1.5, inner + 0.6, -1, zt + s));
      cuts.push(box(ext[0], ext[1], outFace - 1.5, inner + 0.6, zt, zt + s));
      cuts.push(prism('x', pocket, ext[0], ext[1]));
    } else {
      cuts.push(prism('x', flare, outFace - 1.5, inner + 0.6));
      cuts.push(box(outFace - 1.5, inner + 0.6, fs[0], fs[1], -1, zt + s));
      cuts.push(box(outFace - 1.5, inner + 0.6, ext[0], ext[1], zt, zt + s));
      cuts.push(prism('y', pocket, ext[0], ext[1]));
    }
    return cuts;
  }
  function lockBump(p, wall, lo, hi) {
    const tp = p.gap / 2 + thick(p) - p.lock_t;
    const prof = lockProfile(p);
    const pts = [[-OV, prof[0][1]], ...prof.slice(0, 4), [-OV, prof[4][1]]];   // base sunk into the tongue
    return prism(wall === 'bottom' ? 'x' : 'y', pts.map(([v, z]) => [tp - v, z]), lo, hi);
  }
  function stopBump(p, lo, hi) {
    const inner = p.gap / 2 + thick(p), prof = stopProfile(p);
    const vb = prof[0][0] - 0.3;
    const pts = [[inner + vb, prof[0][1]], ...prof.map(([v, z]) => [inner + v, z]), [inner + vb, prof[3][1]]];
    return prism('x', pts, lo, hi);
  }
  function bottomLayout(p, w, h) {
    const [xi0, xi1] = interior(p, w, h), s = p.slit;
    const stops = [
      { span: [xi0 + s, xi0 + s + p.stop_len], freeLow: true, bump: [xi0 + s + 0.2, xi0 + s + 0.2 + p.stop_bump_w] },
      { span: [xi1 - s - p.stop_len, xi1 - s], freeLow: false, bump: [xi1 - s - 0.2 - p.stop_bump_w, xi1 - s - 0.2] },
    ];
    const locksB = [], locksL = [];
    for (let i = 0; i < w; i++) {
      const xf = i * p.unit_w + p.lock_x;
      locksB.push({ span: [xf, xf + p.lock_len], bump: [xf + 0.3, xf + 0.3 + p.lock_bump_w] });
    }
    for (let j = 0; j < h; j++) {
      const yf = j * p.unit_h + p.lock_y;
      locksL.push({ span: [yf, yf + p.lock_len], bump: [yf + 0.3, yf + 0.3 + p.lock_bump_w] });
    }
    return { stops, locksB, locksL };
  }
  function frontOuterChamfers(p, X0, X1, Y0, Y1) {
    const c = p.edge_chamfer;
    const tri = (b) => [[b - 3, -3], [b + c + 3, -3], [b - 3, c + 3]];
    return [
      prism('x', tri(Y0), X0 - 1, X1 + 1),
      prism('x', tri(Y1).map(([y, z]) => [2 * Y1 - y, z]), X0 - 1, X1 + 1),
      prism('y', tri(X0), Y0 - 1, Y1 + 1),
      prism('y', tri(X1).map(([x, z]) => [2 * X1 - x, z]), Y0 - 1, Y1 + 1),
    ];
  }

  // ---------------------------------------------------------------- casing
  function caseBuild(p, w = 1, h = 1) {
    const D = p.depth;
    const [X0, X1, Y0, Y1] = outer(p, w, h);
    const [xi0, xi1, yi0, yi1] = interior(p, w, h);
    const c = p.edge_chamfer;
    let body = box(X0, X1, Y0, Y1, 0, D);
    let cuts = frontOuterChamfers(p, X0, X1, Y0, Y1);
    cuts.push(box(xi0, xi1, yi0, yi1, -1, D + 1));
    cuts.push(loftRects([xi0 - c - 1, xi1 + c + 1, yi0 - c - 1, yi1 + c + 1], -1, [xi0, xi1, yi0, yi1], c));
    body = cut(body, cuts);

    const L = p.rear_lip_w, T = p.rear_lip_t, za = D - T - L;
    // the lip is sunk OV into the four walls so the union is a real overlap,
    // never a face-to-face contact (grooves are cut afterwards)
    const lip = cut(box(xi0 - OV, xi1 + OV, yi0 - OV, yi1 + OV, za, D), [
      loftRects([xi0 - 0.01, xi1 + 0.01, yi0 - 0.01, yi1 + 0.01], za - 0.01, [xi0 + L, xi1 - L, yi0 + L, yi1 - L], D - T),
      box(xi0 + L, xi1 - L, yi0 + L, yi1 - L, D - T - 0.02, D + 1),
    ]);
    const adds = [lip];
    for (let i = 0; i < w; i++) adds.push(rail(p, 'top', (i + 0.5) * p.unit_w, Y1, D));
    for (let j = 0; j < h; j++) adds.push(rail(p, 'right', (j + 0.5) * p.unit_h, X1, D));
    body = fuse(body, adds);

    cuts = [];
    for (let i = 0; i < w; i++) cuts.push(grooveCutter(p, 'top', (i + 0.5) * p.unit_w, -p.gap / 2, D));
    for (let j = 0; j < h; j++) cuts.push(grooveCutter(p, 'right', (j + 0.5) * p.unit_h, -p.gap / 2, D));
    const [wz0, wz1] = lockWindowZ(p), f = p.window_fit;
    for (let i = 0; i < w; i++) {
      const xa = i * p.unit_w + p.lock_x + 0.3 - f;
      cuts.push(box(xa, xa + p.lock_bump_w + 2 * f, yi1 - 1, Y1 + 1, wz0, wz1));
    }
    for (let j = 0; j < h; j++) {
      const ya = j * p.unit_h + p.lock_y + 0.3 - f;
      cuts.push(box(xi1 - 1, X1 + 1, ya, ya + p.lock_bump_w + 2 * f, wz0, wz1));
    }
    const lay = bottomLayout(p, w, h);
    for (const s of lay.stops) cuts.push(...flexureCuts(p, 'bottom', s.span, s.freeLow, p.stop_t, p.stop_recess));
    for (const k of lay.locksB) cuts.push(...flexureCuts(p, 'bottom', k.span, true, p.lock_t));
    for (const k of lay.locksL) cuts.push(...flexureCuts(p, 'left', k.span, true, p.lock_t));
    body = cut(body, cuts);

    const bumps = lay.stops.map((s) => stopBump(p, ...s.bump));
    for (const k of lay.locksB) bumps.push(lockBump(p, 'bottom', ...k.bump));
    for (const k of lay.locksL) bumps.push(lockBump(p, 'left', ...k.bump));
    return fuse(body, bumps);
  }

  // ---------------------------------------------------------------- drawer
  const arc = (cx, cz, r, a0, a1, n = 8) =>
    Array.from({ length: n + 1 }, (_, k) => {
      const a = rad(a0 + ((a1 - a0) * k) / n);
      return [cx + r * Math.cos(a), cz + r * Math.sin(a)];
    });

  /**
   * opt.slots  : x centres of removable-divider slots (rib pairs front and back)
   * opt.wallsX : x centres of printed-in walls running front to back
   * opt.wallsZ : z centres of printed-in walls running side to side
   */
  function drawerBuild(p, w = 1, h = 1, opt = {}) {
    const [X0, X1, Y0, Y1, Zf, Zr] = drawerBox(p, w, h);
    const C = p.d_chamfer, t = p.d_wall, tf = p.d_floor;
    const shell = prism('z', [[X0, Y0 + C], [X0 + C, Y0], [X1 - C, Y0], [X1, Y0 + C], [X1, Y1], [X0, Y1]], Zf, Zr);
    const ci = C + t * SQ2;
    const cavity = prism('z', [[X0 + t, Y0 + ci - t], [X0 + ci - tf, Y0 + tf], [X1 - ci + tf, Y0 + tf],
      [X1 - t, Y0 + ci - t], [X1 - t, Y1 + 1], [X0 + t, Y1 + 1]], Zf + p.d_front, Zr - t);
    let body = keep(shell.subtract(cavity));

    const adds = [];
    if (p.d_scoop > 0) {
      const s = p.d_scoop, yf = Y0 + tf, zw = Zf + p.d_front;
      const o = 0.5;   // legs sunk into the floor and the front wall; same sloping face
      const e = o - 0.01;
      adds.push(isect(prism('x', [[yf - o, zw - o], [yf - o, zw + s + e], [yf + s + e, zw - o]], X0, X1), shell));
    }
    const zc = stopCatchZ(p) + (Zr - p.stop_inside);
    adds.push(prism('z', [[X0, Y0], [X0 + C + OV, Y0], [X0, Y0 + C + OV]], zc, zc + p.catch_len));
    adds.push(prism('z', [[X1, Y0], [X1 - C - OV, Y0], [X1, Y0 + C + OV]], zc, zc + p.catch_len));
    // pull: a lip along the top of the front ('lip'), or a round finger notch cut into it ('notch')
    const notch = notchSize(p, w, h);
    if (!notch) {
      const side = [[Y1, Zf + 0.6], [Y1, Zf - p.pull_depth], [Y1 - p.pull_t, Zf - p.pull_depth],
        [Y1 - p.pull_t - p.pull_depth, Zf], [Y1 - p.pull_t - p.pull_depth, Zf + 0.6]];
      const r = p.pull_radius, zf = Zf - p.pull_depth;
      const plan = [[X0, Zf + 1], ...arc(X0 + r, zf + r, r, 180, 270), ...arc(X1 - r, zf + r, r, 270, 360), [X1, Zf + 1]];
      adds.push(isect(prism('x', side, X0, X1), prism('y', plan, Y0 - 1, Y1 + 1)));
    }
    const sw = p.divider_t + 2 * p.divider_fit;
    for (const xc of opt.slots || []) {
      for (const xa of [xc - sw / 2 - p.rib_t, xc + sw / 2]) {
        adds.push(box(xa, xa + p.rib_t, Y0 + tf - OV, Y1 - 0.3, Zf + p.d_front - OV, Zf + p.d_front + p.rib_d));
        adds.push(box(xa, xa + p.rib_t, Y0 + tf - OV, Y1 - 0.3, Zr - t - p.rib_d, Zr - t + OV));
      }
    }
    const wt = p.divider_t;
    const walls = [];
    for (const xc of opt.wallsX || []) walls.push(box(xc - wt / 2, xc + wt / 2, Y0, Y1, Zf + 0.5, Zr - 0.5));
    for (const zw of opt.wallsZ || []) walls.push(box(X0, X1, Y0, Y1, zw - wt / 2, zw + wt / 2));
    if (walls.length) adds.push(isect(union(walls), shell));
    body = fuse(body, adds);

    const cuts = [];
    if (p.label) {
      const lo = Y0 + C + 1.5, hi = (notch ? Y1 - notch.depth : Y1 - p.pull_t - p.pull_depth) - 1.5;
      const lh = Math.min(p.label_h, hi - lo);
      if (lh >= 6 && X1 - X0 - 2 * p.label_margin > 10) {
        const ym = (lo + hi) / 2, ya = ym - lh / 2, yb = ym + lh / 2, dl = p.label_depth;
        cuts.push(prism('x', [[ya, Zf - 1], [ya, Zf + dl], [yb - dl, Zf + dl], [yb, Zf], [yb, Zf - 1]],
          X0 + p.label_margin, X1 - p.label_margin));
      }
    }
    if (notch) {
      // circle centred above the rim; it also trims the front ends of walls and slot ribs behind it
      const xc = (X0 + X1) / 2, yc = Y1 + notch.r - notch.depth, pts = [];
      for (let i = 0; i < 48; i++) { const a = (i / 48) * 2 * Math.PI; pts.push([xc + notch.r * Math.cos(a), yc + notch.r * Math.sin(a)]); }
      cuts.push(prism('z', pts, Zf - 1, Zf + p.d_front + 8));
    }
    const k = p.d_edge;
    cuts.push(prism('x', [[Y0 - 1, Zf - 1], [Y0 + k, Zf - 1], [Y0 + k, Zf], [Y0, Zf + k], [Y0 - 1, Zf + k]], X0 - 1, X1 + 1));
    cuts.push(prism('x', [[Y0 - 1, Zr + 1], [Y0 + k, Zr + 1], [Y0 + k, Zr], [Y0, Zr - k], [Y0 - 1, Zr - k]], X0 - 1, X1 + 1));
    return cut(body, cuts);
  }

  function dividerBuild(p, h = 1) {
    const [, , Y0, Y1, Zf, Zr] = drawerBox(p, 1, h);
    const y0 = Y0 + p.d_floor, y1 = Y1 - 0.8;
    const z0 = Zf + p.d_front + 0.3, z1 = Zr - p.d_wall - 0.3, t = p.divider_t;
    const cuts = [];
    if (p.d_scoop > 0) {
      const s = p.d_scoop + 0.4;
      cuts.push(prism('x', [[y0 - 1, z0 - 1], [y0 - 1, z0 + s + 1], [y0 + s + 1, z0 - 1]], -t, t));
    }
    const zm = (z0 + z1) / 2;
    cuts.push(prism('x', [[y1 + 0.1, zm - 9], [y1 - 5, zm - 4], [y1 - 5, zm + 4], [y1 + 0.1, zm + 9]], -t, t));
    return cut(box(-t / 2, t / 2, y0, y1, z0, z1), cuts);
  }

  // ---------------------------------------------------------------- finish panels and legs
  // Two families, set by which wall face they meet:
  //   G panels (top, right) carry grooves and lock springs, like a casing's bottom wall;
  //   R panels (bottom, left) carry rails and lock pockets, like a casing's top wall.
  // Both are built lying horizontally (top / bottom); the side panels are the
  // same parts with x and y swapped.

  /** Slab whose exposed face (at yExp) has a c x 45 deg chamfer all round. */
  function slab(X0, X1, yMate, yExp, Z0, Z1, c) {
    const s = Math.sign(yMate - yExp), pts = [];
    for (const [x, z] of [[X0, Z0], [X1, Z0], [X1, Z1], [X0, Z1]]) pts.push([x, yMate, z], [x, yExp + s * c, z]);
    for (const [x, z] of [[X0 + c, Z0 + c], [X1 - c, Z0 + c], [X1 - c, Z1 - c], [X0 + c, Z1 - c]]) pts.push([x, yExp, z]);
    return hull(pts);
  }
  /** Two channels along x for round or square rods; round ones are teardrops so they print on edge. */
  function rodChannels(p, rod, X0, X1, yc, zs = rodZ(p)) {
    const r = rod.d / 2 + ROD_FIT, out = [];
    for (const zc of zs) {
      let pts;
      // +z is up when printed. Square bars get a true square channel (its roof is a short
      // bridge, under 13 mm); round ones a teardrop with a 45 deg roof
      if (rod.shape === 'square') pts = [[yc - r, zc - r], [yc + r, zc - r], [yc + r, zc + r], [yc - r, zc + r]];
      else {
        // polygon drawn around the circle (flats on the radius), so the full clearance is real
        const rc = r / Math.cos(rad(7.5));
        pts = [];
        for (let k = 0; k <= 18; k++) { const a = rad(135 + k * 15); pts.push([yc + rc * Math.cos(a), zc + rc * Math.sin(a)]); }
        pts.push([yc, zc + rc * SQ2]);
      }
      out.push(prism('x', pts, X0 - 1, X1 + 1));
    }
    return out;
  }

  function gPanelBuild(p, o) {
    const D = p.depth, g = p.gap, s = p.slit, T = o.T;
    const X0 = g / 2 - (o.extLo || 0), X1 = o.n * o.pitch - g / 2 + (o.extHi || 0), Y0 = g / 2, Y1 = Y0 + T;
    const body = o.edge ? box(X0, X1, Y0, Y1, 0, D) : slab(X0, X1, Y0, Y1, 0, D, p.edge_chamfer);
    const cuts = frontOuterChamfers(p, X0, X1, Y0, Y1), bumps = [];
    const inner = Y0 + thick(p), zt = p.band, bw = p.lock_bump_w, lb = p.lock_bump;
    for (let i = 0; i < o.n; i++) {
      cuts.push(grooveCutter(p, 'top', (i + 0.5) * o.pitch, -g / 2, D));
      const xf = i * o.pitch + o.lockOff, xe = xf + p.lock_len;
      if (o.edge) {
        // thick panel, printed on its front edge: the spring is built as in a casing,
        // with hidden room behind it to flex into
        cuts.push(...flexureCuts(p, 'bottom', [xf, xe], true, p.lock_t));
        const cav = lb - g + 0.3;      // 45 deg roof, so nothing needs bridging on edge
        cuts.push(prism('x', [[inner - 0.01, -1], [inner + cav, -1], [inner + cav, zt + s], [inner - 0.01, zt + s + cav]], xf - s, xe));
        bumps.push(lockBump(p, 'bottom', xf + 0.3, xf + 0.3 + bw));
      } else {
        // thin panel, printed flat with the exposed face on the bed: the spring is the
        // exposed skin itself, and its bump stands on a post through the pocket
        const Yt = Y1 - p.lock_t, fl = 0.4;
        cuts.push(box(xf - s, xf, Y0 - 1, Y1 + 1, -1, zt + s));
        cuts.push(box(xf - s, xe, Y0 - 1, Y1 + 1, zt, zt + s));
        cuts.push(box(xf - s, xe, Y0 - 1, Yt, -1, zt + s));
        cuts.push(prism('z', [[xf - s - fl, Y1 + 1], [xf + fl, Y1 + 1], [xf + fl, Y1], [xf, Y1 - 2 * fl], [xf - s, Y1 - 2 * fl], [xf - s - fl, Y1]], -1, zt + s));
        cuts.push(prism('x', [[Y1 + 1, zt - fl], [Y1 + 1, zt + s + fl], [Y1, zt + s + fl], [Y1 - 2 * fl, zt + s], [Y1 - 2 * fl, zt], [Y1, zt - fl]], xf - s, xe));
        const tc = Math.tan(rad(p.lock_catch_deg)), z1 = p.lock_bump_z + (thick(p) - p.lock_t) / tc;
        const z2 = z1 + lb / tc, z3 = z2 + p.lock_bump_top, z4 = z3 + lb / Math.tan(rad(p.lock_ramp_deg));
        bumps.push(prism('x', [[Yt + OV, z1], [Y0, z1], [Y0 - lb, z2], [Y0 - lb, z3], [Y0, z4], [Yt + OV, z4]], xf + 0.3, xf + 0.3 + bw));
      }
    }
    if (o.rod) cuts.push(...rodChannels(p, o.rod, X0, X1, Y0 + thick(p) + 0.4 + o.rod.d / 2 + ROD_FIT, o.rodZ));
    return fuse(cut(body, cuts), bumps);
  }

  /** Hollow runner legs under a plate: profiles in (x, y), full depth, closed at the front. */
  function legSolids(p, L, X0, X1, ybot, n, pitch) {
    const D = p.depth, w = p.leg_wall, yb = ybot - L.h, yT = ybot + OV, up = ybot + 5, out = [];
    const shell = (outer, tall) => keep(prism('z', outer, 0, D).subtract(prism('z', offsetPolygon(tall, -w), 1.2, D + 1)));
    const mids = (half, inset) => { const a = X0 + inset + half, b = X1 - inset - half; return n >= 3 ? [a, (X0 + X1) / 2, b] : [a, b]; };
    if (L.style === 'plinth') {
      const a = X0 + 6, b = X1 - 6;
      out.push(shell([[a, yb], [b, yb], [b, yT], [a, yT]], [[a, yb], [b, yb], [b, up], [a, up]]));
      for (let i = 1; i < n; i++) out.push(box(i * pitch - w / 2, i * pitch + w / 2, yb + w / 2, yT, 0, D));
    } else if (L.style === 'tapered') {
      const top = 11, foot = 5.5, k = (top - foot) / (yT - yb), tall = top + k * (up - yT);
      for (const c of mids(top, 3)) out.push(shell([[c - foot, yb], [c + foot, yb], [c + top, yT], [c - top, yT]], [[c - foot, yb], [c + foot, yb], [c + tall, up], [c - tall, up]]));
    } else {
      for (const c of mids(7, 3)) out.push(shell([[c - 7, yb], [c + 7, yb], [c + 7, yT], [c - 7, yT]], [[c - 7, yb], [c + 7, yb], [c + 7, up], [c - 7, up]]));
    }
    return out;
  }

  function rPanelBuild(p, o) {
    const D = p.depth, g = p.gap, ytop = -g / 2, ybot = ytop - o.T;
    const X0 = g / 2 - (o.extLo || 0), X1 = o.n * o.pitch - g / 2 + (o.extHi || 0);
    let body = o.flat ? slab(X0, X1, ytop, ybot, 0, D, p.edge_chamfer) : box(X0, X1, ybot, ytop, 0, D);
    body = cut(body, frontOuterChamfers(p, X0, X1, ybot, ytop));
    const adds = [];
    for (let i = 0; i < o.n; i++) adds.push(rail(p, 'top', (i + 0.5) * o.pitch, ytop, D));
    if (o.legs) adds.push(...legSolids(p, o.legs, X0, X1, ybot, o.n, o.pitch));
    body = fuse(body, adds);
    const [wz0, wz1] = lockWindowZ(p), f = p.window_fit, cuts = [];
    const pd = p.lock_bump - g + 0.4;     // blind pockets keep the exposed face clean; 45 deg roof for printing on edge
    for (let i = 0; i < o.n; i++) {
      const xa = i * o.pitch + o.lockOff + 0.3 - f, xb = xa + p.lock_bump_w + 2 * f;
      if (o.through) cuts.push(box(xa, xb, ybot - 1, ytop + 1, wz0, wz1));
      else cuts.push(prism('x', [[ytop + 1, wz0], [ytop - pd, wz0], [ytop - pd, wz1], [ytop + 1, wz1 + pd + 1]], xa, xb));
    }
    if (o.rod) cuts.push(...rodChannels(p, o.rod, X0, X1, ytop - (thick(p) + 0.4 + o.rod.d / 2 + ROD_FIT), o.rodZ));
    return cut(body, cuts);
  }

  const baseBuild = (p, n = 1) => rPanelBuild(p, { n, pitch: p.unit_w, lockOff: p.lock_x, T: p.base_t, through: true });

  /**
   * A finish panel in the frame of the wall cell it borders.
   * o.side  'top' | 'right' | 'left' | 'bottom'      o.n      length in grid units
   * o.style 'minimal' | 'labeled' | 'structural' (top, sides); 'plate' | 'legs' (bottom)
   * o.extLo, o.extHi  extra length at each end (top and bottom reach over the side panels)
   * o.rod   { shape: 'round' | 'square', d }          o.legs   { style, h }
   * o.labels [{ polys, cu, cv }]  text centred at (cu, cv) on the exposed face (o.label: one)
   * o.look  { raised, tilt }  raised letters instead of engraved; tilted strip (top only)
   * o.slim  sides only: a SLIM_D deep strip with one rod channel (any style; labels dropped)
   */
  function panelBuild(p, o) {
    const horiz = o.side === 'top' || o.side === 'bottom';
    // slim side strip: a structural piece cut to SLIM_D deep with one rod channel
    if (o.slim && !horiz) { p = { ...p, depth: SLIM_D }; o = { ...o, style: 'structural', labels: [], label: null }; }
    const rod = o.style === 'structural' ? o.rod : null;
    const c = { n: o.n, pitch: horiz ? p.unit_w : p.unit_h, lockOff: horiz ? p.lock_x : p.lock_y, extLo: o.extLo, extHi: o.extHi, rod,
      rodZ: o.slim && !horiz ? [slimRodZ(rod)] : undefined };
    let m;
    if (o.side === 'bottom') m = rPanelBuild(p, { ...c, rod: null, T: p.base_t, legs: o.style === 'legs' ? o.legs : null, flat: o.style !== 'legs' });
    else {
      const look = o.style === 'labeled' ? (o.look || {}) : {};
      const edge = panelEdge(o.side, o.style, look), tilt = o.side === 'top' && o.style === 'labeled' && !!look.tilt;
      const T = panelT(p, o.style, o.rod, look, o.side), face = p.gap / 2 + T;
      m = o.side === 'left' ? rPanelBuild(p, { ...c, T, flat: !edge }) : gPanelBuild(p, { ...c, T, edge });
      if (tilt) {
        // label strip along the front edge, its face at 45 deg towards the front and up
        const X0 = p.gap / 2 - (o.extLo || 0), X1 = o.n * c.pitch - p.gap / 2 + (o.extHi || 0);
        m = fuse(m, [prism('x', [[face - OV, 0], [face + TILT, TILT], [face - OV, TILT]], X0, X1)]);
      }
      if (!horiz) m = keep(m.mirror([1, -1, 0]));                        // swap x and y
      const labels = (o.labels || (o.label ? [o.label] : [])).filter((L) => L && L.polys && L.polys.length);
      if (labels.length && !rod) {
        const d = p.deboss, raised = !!look.raised, tools = [];
        for (const L of labels) {
          if (tilt && raised) {
            // raised letters on the 45 deg strip grow straight along the print's up axis (z) with
            // vertical walls, cut off parallel to the face: no letter edge starts in mid-air
            const s = SQ2 / 2, n = [0, s, -s];
            const t = prismMulti('z', L.polys.map((q) => q.map(([u, v]) => [L.cu + u, face + TILT / 2 + v * s])), -2, TILT + 2);
            tools.push(keep(t.trimByPlane(n, s * face - OV).trimByPlane([0, -s, s], -(s * face + d))));
          } else if (tilt) {
            // text drawn in a local plane, then laid onto the strip face (x stays x, v runs up the slope)
            const t = prismMulti('y', L.polys.map((q) => q.map(([u, v]) => [L.cu + u, v])), -d, 1);
            tools.push(keep(t.rotate([-45, 0, 0]).translate([0, face + TILT / 2, TILT / 2])));
          } else if (o.side === 'top') tools.push(prismMulti('y', L.polys.map((q) => q.map(([u, v]) => [L.cu + u, L.cv + v])), raised ? face - OV : face - d, raised ? face + d : face + 1));
          else if (o.side === 'right') tools.push(prismMulti('x', L.polys.map((q) => q.map(([u, v]) => [L.cv + v, L.cu + u])), raised ? face - OV : face - d, raised ? face + d : face + 1));
          else tools.push(prismMulti('x', L.polys.map((q) => q.map(([u, v]) => [L.cv + v, L.cu - u])), raised ? -face - d : -face - 1, raised ? -face + OV : -face + d));
        }
        m = raised ? fuse(m, tools) : cut(m, tools);
      }
    }
    return m;
  }

  /** Plug that closes the end of a rod channel: a peg with four crush ribs, printed standing. */
  function plugBuild(p, rod) {
    // core 0.075 mm under the channel, four ribs 0.15 mm over it; both ends chamfered 0.4 mm
    // (the bed end against elephant's foot, the far end as the lead-in) and the ribs ramp in
    const r = rod.d / 2 + ROD_FIT, c = r - 0.075, L = PLUG_LEN, e = 0.4, ri = r + 0.15;
    const ring = (s, z) => (rod.shape === 'square' ? [[-s, -s, z], [s, -s, z], [s, s, z], [-s, s, z]]
      : Array.from({ length: 48 }, (_, k) => [s * Math.cos(k * Math.PI / 24), s * Math.sin(k * Math.PI / 24), z]));
    const core = hull([...ring(c - e, 0), ...ring(c, e), ...ring(c, L - e), ...ring(c - e, L)]);
    const rib = hull([[c - 0.3, -0.3, 1], [c - 0.3, 0.3, 1], [ri, -0.3, 1 + ri - c], [ri, 0.3, 1 + ri - c],
      [ri, -0.3, L - 1.5], [ri, 0.3, L - 1.5], [c - 0.3, -0.3, L - e], [c - 0.3, 0.3, L - e], [c, -0.3, L - e], [c, 0.3, L - e]]);
    const parts = [core];
    for (let k = 0; k < 4; k++) parts.push(keep(rib.rotate([0, 0, 90 * k])));
    return union(parts);
  }

  // ---------------------------------------------------------------- test pieces
  function couponRailBuild(p, depth = 30) {
    const xa = p.lock_x - 6, xb = p.unit_w - p.lock_x + 6;
    const Y1 = p.unit_h - p.gap / 2, yi1 = Y1 - p.wall, fl = 7;
    let body = union([box(xa, xb, yi1, Y1, 0, depth), box(xa, xa + p.wall, yi1 - fl, Y1, 0, depth),
      box(xb - p.wall, xb, yi1 - fl, Y1, 0, depth)]);
    body = cut(body, frontOuterChamfers(p, xa, xb, yi1 - fl, Y1));
    body = fuse(body, [rail(p, 'top', p.unit_w / 2, Y1, depth)]);
    const [wz0, wz1] = lockWindowZ(p), f = p.window_fit, xw = p.lock_x + 0.3 - f;
    return cut(body, [box(xw, xw + p.lock_bump_w + 2 * f, yi1 - 1, Y1 + 1, wz0, wz1)]);
  }
  function couponGrooveBuild(p, fit, marks = 0, depth = 30) {
    const q = { ...p, fit_dovetail: fit };
    const xa = q.lock_x - 6, xb = q.unit_w - q.lock_x + 6;
    const y0 = q.gap / 2, yi0 = y0 + thick(q), fl = 7;
    let body = union([box(xa, xb, y0, yi0, 0, depth), box(xa, xa + q.wall, y0, yi0 + fl, 0, depth),
      box(xb - q.wall, xb, y0, yi0 + fl, 0, depth)]);
    body = cut(body, frontOuterChamfers(q, xa, xb, y0, yi0 + fl));
    const cuts = [grooveCutter(q, 'top', q.unit_w / 2, -q.gap / 2, depth)];
    const span = [q.lock_x, q.lock_x + q.lock_len];
    cuts.push(...flexureCuts(q, 'bottom', span, true, q.lock_t));
    const ytop = yi0 + fl;
    for (let k = 0; k < marks; k++) {
      const zc = depth - 3 - 3 * k;
      cuts.push(prism('x', [[ytop + 1, zc - 2.2], [ytop - 1.2, zc], [ytop + 1, zc + 2.2]], xb - q.wall - 0.5, xb + 0.5));
    }
    body = cut(body, cuts);
    return fuse(body, [lockBump(q, 'bottom', span[0] + 0.3, span[0] + 0.3 + q.lock_bump_w)]);
  }

  /**
   * Drawer-clearance test: a 16 mm slice of a 1x1 casing's drawer opening (a plain ring), and
   * 12 mm slices of a drawer's outer shape at a chosen gap per side. Slide each slice into the
   * ring: `marks` V-notches on top tell them apart. Both print standing on a cut face.
   */
  function couponDrawerCaseBuild(p, depth = 16) {
    const [xi0, xi1, yi0, yi1] = interior(p, 1, 1), t = 2;
    const ring = cut(box(xi0 - t, xi1 + t, yi0 - t, yi1 + t, 0, depth), [box(xi0, xi1, yi0, yi1, -1, depth + 1)]);
    return cut(ring, frontOuterChamfers(p, xi0 - t, xi1 + t, yi0 - t, yi1 + t));
  }
  function couponDrawerBuild(p, gap, marks = 0, depth = 12) {
    const q = { ...p, fit_side: gap, fit_top: p.fit_top + (gap - p.fit_side) };
    const [X0, X1, Y0, Y1] = drawerBox(q, 1, 1);
    const C = q.d_chamfer, t = q.d_wall, tf = q.d_floor, ci = C + t * SQ2;
    const outer = prism('z', [[X0, Y0 + C], [X0 + C, Y0], [X1 - C, Y0], [X1, Y0 + C], [X1, Y1], [X0, Y1]], 0, depth);
    const inner = prism('z', [[X0 + t, Y0 + ci - t], [X0 + ci - tf, Y0 + tf], [X1 - ci + tf, Y0 + tf],
      [X1 - t, Y0 + ci - t], [X1 - t, Y1 + 1], [X0 + t, Y1 + 1]], -1, depth + 1);
    const cuts = [inner];
    for (let k = 0; k < marks; k++) {
      const zc = depth - 3 - 3 * k;
      cuts.push(prism('x', [[Y1 + 1, zc - 2.2], [Y1 - 1.2, zc], [Y1 + 1, zc + 2.2]], X1 - t - 1, X1 + 1));
    }
    return cut(outer, cuts);
  }

  // ---------------------------------------------------------------- frames
  const toUse = (m) => m.mirror([0, 0, 1]);
  const ROT = { case: [180, 0, 0], coupon: [180, 0, 0], drawer: [90, 0, 0], base: [90, 0, 0], divider: [0, 90, 0] };
  /** Print orientation, resting on z = 0 with its corner at the origin. */
  function printPose(kind, useM) {
    const r = useM.rotate(ROT[kind]);
    const bb = r.boundingBox();
    const out = r.translate([-bb.min[0], -bb.min[1], -bb.min[2]]);
    r.delete();
    return out;
  }
  function components(m) {
    const parts = m.decompose();
    const n = parts.length;
    parts.forEach((q) => q.delete());
    return n;
  }

  return {
    case: scoped(caseBuild), drawer: scoped(drawerBuild), divider: scoped(dividerBuild),
    base: scoped(baseBuild), couponRail: scoped(couponRailBuild), couponGroove: scoped(couponGrooveBuild),
    couponDrawerCase: scoped(couponDrawerCaseBuild), couponDrawer: scoped(couponDrawerBuild),
    panel: scoped(panelBuild), plug: scoped(plugBuild),
    toUse, printPose, components,
    box: scoped(box),
  };
}

// ------------------------------------------------------------------ mesh output
/** Binary STL from a Manifold mesh (optionally transformed by a 3x4 matrix). */
export function stlBytes(meshes) {
  const list = Array.isArray(meshes) ? meshes : [meshes];
  let nTri = 0;
  for (const m of list) nTri += m.triVerts.length / 3;
  const buf = new ArrayBuffer(84 + nTri * 50);
  const dv = new DataView(buf);
  dv.setUint32(80, nTri, true);
  let o = 84;
  for (const m of list) {
    const P = m.vertProperties, T = m.triVerts, np = m.numProp, tr = m.matrix;
    const pt = (i) => {
      const x = P[i * np], y = P[i * np + 1], z = P[i * np + 2];
      return tr ? [tr[0] * x + tr[1] * y + tr[2] * z + tr[3], tr[4] * x + tr[5] * y + tr[6] * z + tr[7],
        tr[8] * x + tr[9] * y + tr[10] * z + tr[11]] : [x, y, z];
    };
    for (let i = 0; i < T.length; i += 3) {
      const a = pt(T[i]), b = pt(T[i + 1]), c = pt(T[i + 2]);
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
      const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const L = Math.hypot(nx, ny, nz) || 1;
      nx /= L; ny /= L; nz /= L;
      dv.setFloat32(o, nx, true); dv.setFloat32(o + 4, ny, true); dv.setFloat32(o + 8, nz, true);
      o += 12;
      for (const q of [a, b, c]) {
        dv.setFloat32(o, q[0], true); dv.setFloat32(o + 4, q[1], true); dv.setFloat32(o + 8, q[2], true);
        o += 12;
      }
      o += 2;
    }
  }
  return new Uint8Array(buf);
}

/**
 * Clean indexed mesh of a solid, ready for STL export and display.
 *
 * Manifold's output is always a closed surface, but where parts were joined
 * face to face it keeps duplicate vertices linked by zero-area triangles.
 * Slicers tolerate those; strict mesh checkers drop them and report holes.
 * Working on the kernel's own edge connectivity, this
 *   1. welds vertices at identical positions,
 *   2. removes the needle triangles that collapse, re-joining their neighbours,
 *   3. flips (or drops, for back-to-back pairs) triangles whose corners are collinear.
 * The surface stays closed and its shape does not change.
 */
export function cleanMesh(manifold) {
  const g = manifold.getMesh();
  const np = g.numProp, src = g.vertProperties, nV0 = src.length / np;
  const T = Int32Array.from(g.triVerts), nH = T.length;
  const next = (h) => h - (h % 3) + ((h % 3) + 1) % 3;
  const prev = (h) => h - (h % 3) + ((h % 3) + 2) % 3;

  // connectivity from the unwelded mesh, where every directed edge is unique
  const twin = new Int32Array(nH).fill(-1);
  const seen = new Map();
  for (let h = 0; h < nH; h++) {
    const a = T[h], b = T[next(h)];
    const o = seen.get(b * nV0 + a);
    if (o !== undefined && twin[o] < 0) { twin[o] = h; twin[h] = o; } else seen.set(a * nV0 + b, h);
  }
  const link = (p, q) => { if (p >= 0) twin[p] = q; if (q >= 0) twin[q] = p; };

  // 1. weld vertices closer than 0.2 micron (cells of 1 micron, neighbours checked)
  const EPS2 = 2e-4 ** 2, CELL = 1e-3;
  const cells = new Map(), P = [];
  const remap = new Int32Array(nV0);
  for (let i = 0; i < nV0; i++) {
    const x = src[i * np], y = src[i * np + 1], z = src[i * np + 2];
    const cx = Math.round(x / CELL), cy = Math.round(y / CELL), cz = Math.round(z / CELL);
    let id = -1;
    for (let dx = -1; dx <= 1 && id < 0; dx++) for (let dy = -1; dy <= 1 && id < 0; dy++) for (let dz = -1; dz <= 1 && id < 0; dz++) {
      const l = cells.get((cx + dx) + ',' + (cy + dy) + ',' + (cz + dz));
      if (l) for (const q of l) if ((P[q * 3] - x) ** 2 + (P[q * 3 + 1] - y) ** 2 + (P[q * 3 + 2] - z) ** 2 <= EPS2) { id = q; break; }
    }
    if (id < 0) {
      id = P.length / 3; P.push(x, y, z);
      const k = cx + ',' + cy + ',' + cz, l = cells.get(k);
      if (l) l.push(id); else cells.set(k, [id]);
    }
    remap[i] = id;
  }
  for (let h = 0; h < nH; h++) T[h] = remap[T[h]];
  const alive = new Uint8Array(nH / 3).fill(1);

  // 2. collapse needles
  for (let again = true; again;) {
    again = false;
    for (let t = 0; t < nH; t += 3) {
      if (!alive[t / 3]) continue;
      const e = T[t] === T[t + 1] ? 0 : T[t + 1] === T[t + 2] ? 1 : T[t + 2] === T[t] ? 2 : -1;
      if (e < 0) continue;
      const z = t + e, h1 = next(z), h2 = prev(z);
      if (twin[z] >= 0) twin[twin[z]] = -1;
      if (twin[h1] !== h2) link(twin[h1], twin[h2]);
      alive[t / 3] = 0;
      again = true;
    }
  }

  // 3. collinear slivers
  const d2 = (a, b) => (P[a * 3] - P[b * 3]) ** 2 + (P[a * 3 + 1] - P[b * 3 + 1]) ** 2 + (P[a * 3 + 2] - P[b * 3 + 2]) ** 2;
  const area2 = (a, b, c) => {
    const ux = P[b * 3] - P[a * 3], uy = P[b * 3 + 1] - P[a * 3 + 1], uz = P[b * 3 + 2] - P[a * 3 + 2];
    const vx = P[c * 3] - P[a * 3], vy = P[c * 3 + 1] - P[a * 3 + 1], vz = P[c * 3 + 2] - P[a * 3 + 2];
    return Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
  };
  // half-edge along the longest side when the triangle is a sliver, else -1
  const sliver = (t) => {
    const l = [d2(T[t], T[t + 1]), d2(T[t + 1], T[t + 2]), d2(T[t + 2], T[t])];
    const e = l[0] >= l[1] && l[0] >= l[2] ? 0 : l[1] >= l[2] ? 1 : 2;
    return area2(T[t], T[t + 1], T[t + 2]) / Math.sqrt(l[e]) < 1e-6 ? t + e : -1;
  };
  for (let pass = 0; pass < 6000; pass++) {
    let pick = -1, fallback = -1, flap = -1;
    for (let t = 0; t < nH && pick < 0 && flap < 0; t += 3) {
      if (!alive[t / 3]) continue;
      const h = sliver(t);
      if (h < 0 || twin[h] < 0) continue;
      const q = twin[h], n = q - (q % 3);
      if (n === t) continue;
      if (T[prev(q)] === T[prev(h)]) flap = h;          // same three corners, back to back
      else if (sliver(n) < 0) pick = h;                 // against a real triangle: one sliver fewer
      else if (fallback < 0) fallback = h;
    }
    if (flap >= 0) {
      const q = twin[flap];
      link(twin[next(flap)], twin[prev(q)]);
      link(twin[prev(flap)], twin[next(q)]);
      alive[(flap - (flap % 3)) / 3] = 0;
      alive[(q - (q % 3)) / 3] = 0;
      continue;
    }
    const h = pick >= 0 ? pick : fallback;
    if (h < 0) break;
    // replace the two triangles on either side of h by the two on the other diagonal
    const q = twin[h], hn = next(h), hp = prev(h), qn = next(q), qp = prev(q);
    const i = T[h], j = T[hn], k = T[hp], x = T[qp];
    const A = twin[hn], B = twin[hp], C = twin[qn], D = twin[qp];
    const t = h - (h % 3), n = q - (q % 3);
    T[t] = k; T[t + 1] = i; T[t + 2] = x;              // k->i, i->x, x->k
    T[n] = k; T[n + 1] = x; T[n + 2] = j;              // k->x, x->j, j->k
    link(t, B); link(t + 1, C); link(t + 2, n); link(n + 1, D); link(n + 2, A);
  }

  // compact
  const used = new Int32Array(P.length / 3).fill(-1), V = [], out = [];
  for (let t = 0; t < nH; t += 3) {
    if (!alive[t / 3]) continue;
    for (let c = 0; c < 3; c++) {
      const v = T[t + c];
      if (used[v] < 0) { used[v] = V.length / 3; V.push(P[v * 3], P[v * 3 + 1], P[v * 3 + 2]); }
      out.push(used[v]);
    }
  }
  return { numProp: 3, vertProperties: Float32Array.from(V), triVerts: Uint32Array.from(out) };
}

/** Topology report for an indexed mesh: closed 2-manifold when all three are 0. */
export function meshDefects(mesh) {
  const T = mesh.triVerts, V = mesh.vertProperties, n = V.length / 3;
  const dir = new Map();
  let zero = 0;
  for (let t = 0; t < T.length; t += 3) {
    const [a, b, c] = [T[t], T[t + 1], T[t + 2]];
    for (const [u, v] of [[a, b], [b, c], [c, a]]) dir.set(u * n + v, (dir.get(u * n + v) || 0) + 1);
    const ux = V[b * 3] - V[a * 3], uy = V[b * 3 + 1] - V[a * 3 + 1], uz = V[b * 3 + 2] - V[a * 3 + 2];
    const vx = V[c * 3] - V[a * 3], vy = V[c * 3 + 1] - V[a * 3 + 1], vz = V[c * 3 + 2] - V[a * 3 + 2];
    if (Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) < 2e-7) zero++;
  }
  let open = 0, doubled = 0;
  for (const [k, c] of dir) {
    const u = Math.floor(k / n), v = k % n;
    if (!dir.has(v * n + u)) open++;
    if (c > 1) doubled++;
  }
  return { open, doubled, zero };
}

/** Build-frame mesh -> use frame (mirror in z; triangle winding reversed to stay outward). */
export function useMesh(mesh) {
  const V = Float32Array.from(mesh.vertProperties), T = Uint32Array.from(mesh.triVerts);
  for (let i = 2; i < V.length; i += 3) V[i] = -V[i];
  for (let t = 0; t < T.length; t += 3) { const a = T[t + 1]; T[t + 1] = T[t + 2]; T[t + 2] = a; }
  return { numProp: 3, vertProperties: V, triVerts: T };
}

const POSE = {                       // exact quarter-turn rotations of (x, y, z)
  case: (x, y, z) => [x, -y, -z],    // 180 deg about x: front face on the bed
  coupon: (x, y, z) => [x, -y, -z],
  drawer: (x, y, z) => [x, -z, y],   // +90 deg about x: floor on the bed
  base: (x, y, z) => [x, -z, y],
  divider: (x, y, z) => [z, y, -x],  // +90 deg about y: plate flat
  topflat: (x, y, z) => [x, z, -y],  // top panel: exposed (upper) face on the bed
  rightflat: (x, y, z) => [z, y, -x],  // right panel: exposed (outer) face on the bed
  leftflat: (x, y, z) => [-z, y, x],   // left panel: exposed (outer) face on the bed
  plug: (x, y, z) => [x, y, z],
};
/** Use-frame mesh -> print orientation, resting on z = 0 with its corner at the origin. */
export function printMesh(kind, mesh) {
  const S = mesh.vertProperties, V = new Float32Array(S.length), f = POSE[kind];
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < S.length; i += 3) {
    const q = f(S[i], S[i + 1], S[i + 2]);
    for (let c = 0; c < 3; c++) { V[i + c] = q[c]; if (q[c] < lo[c]) lo[c] = q[c]; if (q[c] > hi[c]) hi[c] = q[c]; }
  }
  for (let i = 0; i < V.length; i += 3) for (let c = 0; c < 3; c++) V[i + c] -= lo[c];
  return { numProp: 3, vertProperties: V, triVerts: mesh.triVerts, size: [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]] };
}
