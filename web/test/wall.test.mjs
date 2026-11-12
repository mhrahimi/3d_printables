// Whole-wall test: assemble complete walls (casings, drawers, dividers, finish panels, legs,
// rods' panels, labels) exactly where the builder places them, then check every pair of parts
// for overlap, with all drawers closed and again with all drawers at their stops.
import Module from 'manifold-3d';
import * as Kn from '../kernel.js';
const M = await Module(); M.setup(); const K = Kn.createKernel(M);
let n = 0, bad = 0;
const check = (name, ok, detail = '') => { n++; if (!ok) { bad++; console.log('  FAIL', name, detail); } };

/** Overlap between every pair of parts whose boxes touch; returns the worst pairs. */
function overlaps(parts) {
  const boxes = parts.map((q) => q.m.boundingBox()), hits = [];
  for (let i = 0; i < parts.length; i++) for (let j = i + 1; j < parts.length; j++) {
    const a = boxes[i], b = boxes[j];
    if ([0, 1, 2].some((k) => a.max[k] < b.min[k] || b.max[k] < a.min[k])) continue;
    const x = parts[i].m.intersect(parts[j].m), v = x.volume(); x.delete();
    if (v > 1e-3) hits.push(`${parts[i].name} / ${parts[j].name}: ${v.toFixed(3)} mm3`);
  }
  return hits;
}

const WALLS = [
  { name: 'default, labelled top on a tilted strip, legs', over: {},
    rows: [{ m: 2, h: 2, a: 2, d: 2 }, { m: 2, h: 1, a: 3, d: 1 }, { m: 1, h: 1, a: 2, d: 1, slots: true }, { m: 3, h: 1, a: 1, d: 1 }],
    finish: { top: 'labeled', look: { raised: true, tilt: true }, sides: 'minimal', bottom: 'legs' } },
  { name: 'sturdy rails, ABS clearances, notch pulls, structural panels', over: { dt_height: 2, dt_neck: 6, fit_dovetail: 0.35, fit_side: 0.45, fit_top: 0.6, pull: 'notch' },
    rows: [{ m: 4, h: 1, a: 3, d: 2 }, { m: 1, h: 2, a: 1, d: 1 }, { m: 2, h: 1, a: 2, d: 1, slots: true }],
    finish: { top: 'structural', sides: 'structural', bottom: 'plate', rod: { shape: 'square', d: 8 } } },
  { name: 'tight PLA, labelled raised sides, one piece per column and row', over: { fit_dovetail: 0.15, fit_side: 0.25, fit_top: 0.4 },
    rows: [{ m: 1, h: 1, a: 1, d: 1 }, { m: 1, h: 2, a: 2, d: 2 }], each: true,
    finish: { top: 'minimal', sides: 'labeled', look: { raised: true }, bottom: 'legs' } },
];

for (const W of WALLS) {
  const p = { ...Kn.DEFAULTS, ...W.over }, U = p.unit_w, V = p.unit_h, g = p.gap, cols = 4;
  const parts = [], drawers = [];
  let y = 0;
  for (const r of W.rows) {                                 // bottom up
    let col = 0;
    const widths = Array(Math.floor(cols / r.m)).fill(r.m); if (cols % r.m) widths.push(cols % r.m);
    for (const w of widths) {
      parts.push({ name: `case ${w}x${r.h} @${col},${y}`, m: K.case(p, w, r.h).translate([col * U, y * V, 0]) });
      const a = Math.min(r.a, Kn.maxAcross(p, w, r.h)), xs = Kn.acrossCenters(p, w, r.h, a).centers;
      const d = K.drawer(p, w, r.h, r.slots ? { slots: xs } : { wallsX: xs, wallsZ: Kn.deepCenters(p, r.d).centers });
      const grp = [d.translate([col * U, y * V, 0])];
      if (r.slots) for (const xc of xs) grp.push(K.divider(p, r.h).translate([col * U + xc, y * V, 0]));
      drawers.push({ name: `drawer ${w}x${r.h} @${col},${y}`, m: grp.length > 1 ? M.Manifold.union(grp) : grp[0] });
      col += w;
    }
    y += r.h;
  }
  const H = y, f = W.finish, rod = f.rod || { shape: 'round', d: 6 };
  const sideT = Kn.panelT(p, f.sides, rod, f.look, 'right'), ext = sideT + g;
  const lab = (t, cap, width, cu, cv) => ({ ...Kn.labelPolys(t, cap, width), cu, cv });
  const runs = (count, sizes) => (W.each ? sizes.map((s, i) => ({ start: sizes.slice(0, i).reduce((a, b) => a + b, 0), n: s, first: i === 0, last: i === sizes.length - 1 }))
    : [{ start: 0, n: count, first: true, last: true }]);
  for (const sg of runs(cols, Array(cols).fill(1))) {
    const labels = f.top === 'labeled' ? Array.from({ length: sg.n }, (_, i) => lab(`C${sg.start + i + 1}`, 8, U - 10, (i + 0.5) * U, f.look.tilt ? 0 : 11)) : [];
    parts.push({ name: `top @${sg.start}`, m: K.panel(p, { side: 'top', n: sg.n, style: f.top, rod, look: f.look, labels, extLo: sg.first ? ext : 0, extHi: sg.last ? ext : 0 }).translate([sg.start * U, H * V, 0]) });
    parts.push({ name: `bottom @${sg.start}`, m: K.panel(p, { side: 'bottom', n: sg.n, style: f.bottom, legs: { style: 'tapered', h: 15 }, extLo: sg.first ? ext : 0, extHi: sg.last ? ext : 0 }) .translate([sg.start * U, 0, 0]) });
  }
  for (const side of ['left', 'right']) for (const sg of runs(H, W.rows.map((r) => r.h))) {
    const labels = f.sides === 'labeled' ? [lab(`R${sg.start + 1}`, 8, p.depth - 28, p.depth / 2, (sg.n * V) / 2)] : [];
    parts.push({ name: `${side} @${sg.start}`, m: K.panel(p, { side, n: sg.n, style: f.sides, rod, look: f.look, labels }).translate([side === 'left' ? 0 : cols * U, sg.start * V, 0]) });
  }
  const closed = overlaps([...parts, ...drawers]);
  check(`${W.name}: ${parts.length + drawers.length} parts, no two overlap with drawers closed`, !closed.length, closed.slice(0, 5).join('; '));
  const travel = Kn.stopTravel(p) - 0.05;
  const open = drawers.map((d) => ({ name: d.name + ' open', m: d.m.translate([0, 0, -travel]) }));
  const atStop = overlaps([...parts, ...open]);
  check(`${W.name}: no two overlap with every drawer at its stop`, !atStop.length, atStop.slice(0, 5).join('; '));
  [...parts, ...drawers, ...open].forEach((q) => q.m.delete());
}
console.log(`${n} whole-wall checks, ${bad} failed`);
process.exit(bad ? 1 : 0);
