// Clearance test (node test_clearance.mjs ['{"param": value}']).
// Fit audit: for every mating pair, measure on the real geometry how far the part can move in each
// direction before it touches its mate (the running clearance), and the smallest gap at rest.
import Module from 'manifold-3d';
import * as Kn from '../kernel.js';
const M = await Module(); M.setup(); const K = createK();
function createK() { return Kn.createKernel(M); }
const over = JSON.parse(process.argv[2] || '{}');
const p = { ...Kn.DEFAULTS, ...over }, U = p.unit_w, V = p.unit_h, g = p.gap;
const iv = (a, b) => { const x = a.intersect(b); const v = x.volume(); x.delete(); return v; };
const mv = (m, x, y, z) => m.translate([x, y, z]);
const toList = (b) => (Array.isArray(b) ? b : [b]);
const hit = (a, bs, d) => { const m = mv(a, ...d); const v = toList(bs).reduce((s, b) => s + iv(m, b), 0); m.delete(); return v > 1e-4; };
/** Smallest move along `dir` (unit vector) at which `a` touches `bs`, searched to `lim` mm. */
function play(a, bs, dir, lim = 3) {
  if (hit(a, bs, [0, 0, 0])) return 0;
  let lo = 0, hi = Infinity;
  for (let t = 0.05; t <= lim + 1e-9; t += 0.05) { if (hit(a, bs, dir.map((c) => c * t))) { hi = t; break; } lo = t; }
  if (hi === Infinity) return Infinity;
  for (let i = 0; i < 14; i++) { const m = (lo + hi) / 2; if (hit(a, bs, dir.map((c) => c * m))) hi = m; else lo = m; }
  return hi;
}
const gapTo = (a, bs) => Math.min(...toList(bs).map((b) => a.minGap(b, 3)));
const rows = [];
const f = (v) => (v === Infinity ? 'free' : v.toFixed(2));
function pair(name, a0, bs, dirs, note = '', back = 0.2) {
  const a = back ? mv(a0, 0, 0, -back) : a0;   // off its push-in stop, so only running clearances count
  const r = { name, rest: gapTo(a, bs), gravityRest: 0, overlap: toList(bs).reduce((s, b) => s + iv(a, b), 0) };
  for (const [k, d] of Object.entries(dirs)) r[k] = play(a, bs, d);
  r.note = note; rows.push(r);
  console.log(name.padEnd(46), 'overlap', r.overlap.toFixed(4).padStart(7), 'gap', f(r.rest).padStart(5),
    Object.keys(dirs).map((k) => `${k} ${f(r[k])}`).join('  '), note);
}
const X = { '+x': [1, 0, 0], '-x': [-1, 0, 0] }, Y = { '+y': [0, 1, 0], '-y': [0, -1, 0] };
const XY = { ...X, ...Y };

// casings
const c11 = K.case(p, 1, 1);
pair('casing on casing (vertical joint)', mv(c11, 0, V, 0), c11, XY);
pair('casing beside casing (horizontal joint)', mv(c11, U, 0, 0), c11, XY);
const c21 = K.case(p, 2, 1), c12 = K.case(p, 1, 2);
pair('2x1 casing on two 1x1', mv(c21, 0, V, 0), [c11, mv(c11, U, 0, 0)], XY);
pair('1x2 casing beside two 1x1', mv(c12, U, 0, 0), [c11, mv(c11, 0, V, 0)], XY);
const base = K.base(p, 1);
pair('casing on base plate', c11, base, XY);

// drawers
for (const [w, h] of [[1, 1], [2, 1], [1, 2], [2, 2]]) {
  const cs = K.case(p, w, h), d = K.drawer(p, w, h, {});
  pair(`drawer ${w}x${h} in casing`, d, cs, XY, 'closed');
  const out = Kn.stopTravel(p) - 0.05;
  pair(`drawer ${w}x${h} at the stop`, mv(d, 0, 0, -out), cs, XY, 'open', 0);
  cs.delete(); d.delete();
}
// dividers
{
  const xs = Kn.acrossCenters(p, 1, 1, 2), d = K.drawer(p, 1, 1, { slots: xs.centers }), dv = K.divider(p, 1);
  pair('divider in drawer slot', mv(dv, xs.centers[0], 0, 0), d, { ...X, '+y': [0, 1, 0], '+z': [0, 0, 1], '-z': [0, 0, -1] }, '', 0);
  d.delete(); dv.delete();
}
// finish add-ons
const rod6 = { shape: 'round', d: 6 }, sq8 = { shape: 'square', d: 8 };
for (const style of ['minimal', 'structural']) {
  const rod = rod6, ext = Kn.panelT(p, style, rod) + g;
  const top = mv(K.panel(p, { side: 'top', n: 1, style, rod }), 0, V, 0);
  pair(`top panel ${style} on casing`, top, c11, XY);
  const right = mv(K.panel(p, { side: 'right', n: 1, style, rod }), U, 0, 0);
  pair(`right panel ${style} on casing`, right, c11, XY);
  const left = K.panel(p, { side: 'left', n: 1, style, rod });
  pair(`casing on left panel ${style}`, c11, left, XY);
  const topX = mv(K.panel(p, { side: 'top', n: 1, style: 'minimal', rod, extLo: ext, extHi: ext }), 0, V, 0);
  pair(`top panel over ${style} side panels`, topX, [c11, right, left], XY);
}
const legs = K.panel(p, { side: 'bottom', n: 1, style: 'legs', legs: { style: 'tapered', h: 40 } });
pair('casing on leg base', c11, legs, XY);
// rods and plugs
for (const rod of [rod6, { shape: 'round', d: 8 }, { shape: 'square', d: 6 }, sq8]) {
  const pn = K.panel(p, { side: 'top', n: 1, style: 'structural', rod }), r = rod.d / 2;
  const yc = g / 2 + Kn.thick(p) + 0.4 + r + Kn.ROD_FIT, zc = Kn.rodZ(p)[0], L = U - 2 * Kn.PLUG_LEN - 1;
  const plugIn = K.plug(p, rod).rotate([0, 90, 0]).translate([0, yc, zc]), pg = plugIn.minGap(pn, 1); plugIn.delete();
  const bar = (rod.shape === 'round' ? M.Manifold.cylinder(L, r, r, 96).rotate([0, 90, 0]) : M.Manifold.cube([L, rod.d, rod.d], false).translate([0, -r, -r])).translate([Kn.PLUG_LEN + 0.5, yc, zc]);
  pair(`${rod.shape} ${rod.d} mm rod in channel`, bar, pn, { ...Y, '+z': [0, 0, 1], '-z': [0, 0, -1] }, '', 0);
  const plug = K.plug(p, rod).rotate([0, 90, 0]).translate([0, yc, zc]);
  const inter = iv(plug, pn), ribArea = 4 * 0.6 * (Kn.PLUG_LEN - 2.4);
  console.log(`  plug for ${rod.shape} ${rod.d}: interference ${inter.toFixed(3)} mm3, about ${(inter / ribArea).toFixed(3)} mm per rib`);
}

// expected running clearances (mm) for the parameters given
const want = {
  'casing on casing (vertical joint)': { '+x': p.fit_dovetail / Math.cos(Math.PI / 6), '-y': Math.min(p.gap, p.fit_dovetail) },
  'drawer 1x1 at the stop': { '+x': p.fit_side, '+y': p.fit_top },
  'divider in drawer slot': { '+x': p.divider_fit },
  'round 6 mm rod in channel': { '+y': Kn.ROD_FIT, '-z': Kn.ROD_FIT },
  'square 8 mm rod in channel': { '+y': Kn.ROD_FIT, '-z': Kn.ROD_FIT },
};
let bad = 0;
for (const r of rows) {
  if (r.overlap > 1e-3) { bad++; console.log('FAIL overlap', r.name, r.overlap); }
  for (const [k, v] of Object.entries(want[r.name] || {})) if (Math.abs(r[k] - v) > 0.02) { bad++; console.log('FAIL', r.name, k, r[k], 'expected', v); }
  for (const k of ['+x', '-x', '+y', '-y']) if (k in r && r[k] !== 0 && r[k] < 0.15 && !/at the stop|in casing/.test(r.name)) { bad++; console.log('FAIL tight', r.name, k, r[k]); }
}
console.log(`${rows.length} mating pairs measured, ${bad} problems`);
process.exit(bad ? 1 : 0);
