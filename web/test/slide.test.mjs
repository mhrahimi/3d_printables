// Slide test: move each part along its whole insertion path in 0.5 mm steps and map every
// contact. Casings and panels may only touch their neighbours with their lock bumps (which
// deflect a spring); drawers may only touch their casing's stop springs. Everything must be
// free in its final position.
import Module from 'manifold-3d';
import * as Kn from '../kernel.js';
const M = await Module(); M.setup(); const K = Kn.createKernel(M);
let n = 0, bad = 0;
const check = (name, ok, detail = '') => { n++; if (!ok) { bad++; console.log('  FAIL', name, detail); } };
const big = 1e4;
const zone = (x0, x1, y0, y1) => M.Manifold.cube([x1 - x0, y1 - y0, 2 * big], false).translate([x0, y0, -big]);

/**
 * Slide `part` from `from` mm in front of its seat to the seat (build frame: front is -z) against
 * `others`. Contact inside `allowed` (spring bumps, swept along z) is expected; anything else fails.
 * Returns the contact windows [start, end] in mm before the seat, for the report.
 */
function sweep(name, part, others, allowed, from) {
  const windows = []; let cur = null, stray = null;
  for (let s = from; s >= -1e-9; s -= 0.5) {
    const m = part.translate([0, 0, -s]);
    let touch = 0, other = 0;
    for (const o of others) {
      const x = m.intersect(o), v = x.volume();
      if (v > 1e-4) { touch += v; const y = x.subtract(allowed), w = y.volume(); y.delete(); if (w > 1e-3) other += w; }
      x.delete();
    }
    m.delete();
    if (other > 1e-3 && !stray) stray = `${s.toFixed(1)} mm before the seat: ${other.toFixed(3)} mm3 outside the spring bumps`;
    if (touch > 1e-4) { if (!cur) cur = [s, s]; cur[1] = s; } else if (cur) { windows.push(cur); cur = null; }
  }
  if (cur) windows.push(cur);
  const seated = windows.length && windows[windows.length - 1][1] < 0.25;
  check(`${name}: only spring bumps touch on the way in`, !stray, stray);
  check(`${name}: free when seated`, !seated, JSON.stringify(windows));
  console.log(`  ${name}: contact at ${windows.map(([a, b]) => `${a.toFixed(1)}–${b.toFixed(1)}`).join(', ') || 'none'} mm before the seat`);
  return windows;
}

const SETS = [{ tag: 'default', over: {} }, { tag: 'sturdy rails, ABS', over: { dt_height: 2, dt_neck: 6, fit_dovetail: 0.35, fit_side: 0.45, fit_top: 0.6 } },
  { tag: 'tight PLA, notch pull', over: { fit_dovetail: 0.15, fit_side: 0.25, fit_top: 0.4, pull: 'notch' } }];
for (const { tag, over } of SETS) {
  const p = { ...Kn.DEFAULTS, ...over }, U = p.unit_w, V = p.unit_h, g = p.gap, D = p.depth, lb = p.lock_bump, bw = p.lock_bump_w;
  console.log(tag);
  // a 1x1 casing slides into the corner above one casing and right of another
  const below = K.case(p, 1, 1).translate([U, 0, 0]), left = K.case(p, 1, 1).translate([0, V, 0]);
  const mover = K.case(p, 1, 1).translate([U, V, 0]);
  const xa = U + p.lock_x + 0.3 - 1, ya = V + p.lock_y + 0.3 - 1;
  const bumps = M.Manifold.union([zone(xa, xa + bw + 2, V + g / 2 - lb - 0.3, V + g / 2 + 0.6), zone(U + g / 2 - lb - 0.3, U + g / 2 + 0.6, ya, ya + bw + 2)]);
  const w1 = sweep(`casing into a corner (${tag})`, mover, [below, left], bumps, D + 2);
  check(`casing into a corner (${tag}): each lock clicks once, near the end`, w1.length >= 1 && w1.every(([a]) => a <= D + 1));
  // a 2x1 casing on two 1x1 casings: two bottom locks
  const pair = [K.case(p, 1, 1), K.case(p, 1, 1).translate([U, 0, 0])], wide = K.case(p, 2, 1).translate([0, V, 0]);
  const xb = (i) => i * U + p.lock_x + 0.3 - 1;
  const bumps2 = M.Manifold.union([0, 1].map((i) => zone(xb(i), xb(i) + bw + 2, V + g / 2 - lb - 0.3, V + g / 2 + 0.6)));
  sweep(`2x1 casing onto two 1x1 (${tag})`, wide, pair, bumps2, D + 2);
  // drawers into their casings: only the floor stop springs may touch
  for (const [w, h] of [[1, 1], [2, 1], [1, 2]]) {
    const cs = K.case(p, w, h), d = K.drawer(p, w, h, { wallsX: Kn.acrossCenters(p, w, h, 2).centers });
    const [xi0, xi1, yi0] = Kn.interior(p, w, h), reach = p.slit + p.stop_len + 2;
    const springs = M.Manifold.union([zone(xi0 - 1, xi0 + reach, yi0 - 1, yi0 + p.stop_bump + 0.5), zone(xi1 - reach, xi1 + 1, yi0 - 1, yi0 + p.stop_bump + 0.5)]);
    // from fully outside: the catch blocks cross the stop springs once, where the stop holds the drawer
    const travel = Kn.stopTravel(p), ws = sweep(`drawer ${w}x${h} into its casing (${tag})`, d, [cs], springs, D + 2);
    check(`drawer ${w}x${h} (${tag}): clicks past the stop once, at the stop`, ws.length === 1 && ws[0][0] >= travel && ws[0][1] <= travel + 4, JSON.stringify(ws));
    [cs, d, springs].forEach((q) => q.delete());
  }
  // top and right panels slide on from the front like casings
  const c = K.case(p, 1, 1);
  const top = K.panel(p, { side: 'top', n: 1, style: 'minimal' }).translate([0, V, 0]);
  const right = K.panel(p, { side: 'right', n: 1, style: 'minimal' }).translate([U, 0, 0]);
  const tb = zone(p.lock_x + 0.3 - 1, p.lock_x + 0.3 + bw + 1, V + g / 2 - lb - 0.3, V + g / 2 + 0.6);
  const rb = zone(U + g / 2 - lb - 0.3, U + g / 2 + 0.6, p.lock_y + 0.3 - 1, p.lock_y + 0.3 + bw + 1);
  sweep(`top panel onto a casing (${tag})`, top, [c], tb, D + 2);
  sweep(`right panel onto a casing (${tag})`, right, [c], rb, D + 2);
  [below, left, mover, ...pair, wide, bumps, bumps2, c, top, right, tb, rb].forEach((q) => q.delete());
}
console.log(`${n} slide checks, ${bad} failed`);
process.exit(bad ? 1 : 0);
