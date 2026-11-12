// Every part the configurator can ask for: closed 2-manifold, one piece, no zero-area triangles.
import Module from 'manifold-3d';
import * as Kn from '../kernel.js';
const { DEFAULTS, createKernel, cleanMesh, meshDefects } = Kn;
const M = await Module(); M.setup(); const K = createKernel(M);
const sets = [{}, { unit_w: 80, unit_h: 50, depth: 160, fit_dovetail: 0.3 }, { unit_w: 60, unit_h: 32, depth: 80, fit_dovetail: 0.15 },
  { unit_w: 100, unit_h: 60, depth: 200, fit_dovetail: 0.35 }, { unit_w: 72.5, unit_h: 45, depth: 115 }, { unit_w: 59, unit_h: 36, depth: 100, fit_dovetail: 0.2 },
  // sturdy rails, ABS clearances at their loosest, finger-notch pulls; PLA at its tightest
  { dt_height: 2, dt_neck: 6 }, { dt_height: 2, dt_neck: 6, fit_dovetail: 0.45, fit_side: 0.55, fit_top: 0.7, pull: 'notch' },
  { fit_dovetail: 0.15, fit_side: 0.25, fit_top: 0.4, pull: 'notch' }];
let n = 0, bad = 0, tMax = 0;
const test = (name, m) => {
  const t = performance.now(); const c = cleanMesh(m); tMax = Math.max(tMax, performance.now() - t);
  const d = meshDefects(c), parts = K.components(m); n++;
  if (d.open || d.doubled || d.zero || parts !== 1 || m.status() !== 'NoError' || !(m.volume() > 0)) { bad++; console.log('  PROBLEM', name, d, 'pieces', parts, m.status()); }
  m.delete();
};
for (const over of sets) {
  const p = { ...DEFAULTS, ...over }; const errs = Kn.check(p); if (errs.length) { console.log('check failed', over, errs); bad++; continue; }
  const mx = Kn.maxUnits(p); const tag = JSON.stringify(over);
  for (let w = 1; w <= mx.w; w++) for (let h = 1; h <= Math.min(3, mx.h); h++) {
    test(`case ${w}x${h} ${tag}`, K.case(p, w, h));
    const na = Kn.maxAcross(p, w, h), nd = Kn.maxDeep(p);
    for (const a of [...new Set([1, 2, 3, na])]) {
      const xs = Kn.acrossCenters(p, w, h, a).centers;
      test(`drawer ${w}x${h} slots ${a} ${tag}`, K.drawer(p, w, h, { slots: xs }));
      for (const dd of [...new Set([1, 2, nd])]) test(`drawer ${w}x${h} walls ${a}x${dd} ${tag}`, K.drawer(p, w, h, { wallsX: xs, wallsZ: Kn.deepCenters(p, dd).centers }));
    }
  }
  for (let h = 1; h <= Math.min(3, mx.h); h++) test(`divider h${h} ${tag}`, K.divider(p, h));
  for (let w = 1; w <= mx.w; w++) test(`base ${w} ${tag}`, K.base(p, w));
  test(`coupon rail ${tag}`, K.couponRail(p));
  [0.15, 0.2, 0.25, 0.3, 0.35].forEach((f, i) => test(`coupon groove ${f} ${tag}`, K.couponGroove(p, f, i + 1)));
  const q = { ...p, depth: 48 }; test(`mini case ${tag}`, K.case(q, 1, 1)); test(`mini drawer ${tag}`, K.drawer(q, 1, 1));
}
console.log(`${n} parts over ${sets.length} parameter sets: ${bad} with problems; slowest clean-up ${tMax.toFixed(0)} ms`);
process.exit(bad ? 1 : 0);
