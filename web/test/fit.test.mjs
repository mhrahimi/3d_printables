// Fit checks for what the configurator adds: partitions, tall modules, mixed walls.
import fs from 'node:fs';
import Module from 'manifold-3d';
import * as Kn from '../kernel.js';
const { DEFAULTS, createKernel, cleanMesh, stlBytes } = Kn;
const M = await Module(); M.setup(); const K = createKernel(M);
let n = 0, bad = 0;
const check = (name, ok, detail = '') => { n++; if (!ok) { bad++; console.log('  FAIL', name, detail); } };
const iv = (a, b) => { const x = a.intersect(b); const v = x.volume(); x.delete(); return v; };
const mv = (m, x, y, z) => m.translate([x, y, z]);
// print meshes for inspection: set PRINT_DIR, default a temp folder
const out = process.env.PRINT_DIR ? `${process.env.PRINT_DIR}/js_print` : `${(await import('node:os')).tmpdir()}/drawer-wall-js_print`; fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out, { recursive: true });
const save = (name, kind, m) => { const pm = Kn.printMesh(kind, Kn.useMesh(cleanMesh(m))); const d = Kn.meshDefects(pm); check(name + ' print mesh closed', !(d.open || d.doubled || d.zero), JSON.stringify(d)); fs.writeFileSync(`${out}/${name}.stl`, stlBytes(pm)); };

for (const over of [{}, { unit_w: 80, unit_h: 50, depth: 160, fit_dovetail: 0.3 }, { unit_w: 100, unit_h: 36, depth: 90, fit_dovetail: 0.15 }]) {
  const p = { ...DEFAULTS, ...over }, U = p.unit_w, Vh = p.unit_h, tag = JSON.stringify(over);
  const mx = Kn.maxUnits(p);
  const c11 = K.case(p, 1, 1);
  // tall and wide modules against 1x1 neighbours, and on a base plate
  for (let h = 2; h <= Math.min(3, mx.h); h++) {
    const tall = K.case(p, 1, h); let v = 0;
    for (let j = 0; j < h; j++) { const nb = mv(c11, U, j * Vh, 0); v += iv(tall, nb); nb.delete(); const nl = mv(c11, -U, j * Vh, 0); v += iv(tall, nl); nl.delete(); }
    check(`1x${h} between stacks of 1x1 ${tag}`, v < 1e-3, v);
    const top = mv(c11, 0, h * Vh, 0); check(`1x1 on 1x${h} ${tag}`, iv(tall, top) < 1e-3); top.delete(); tall.delete();
  }
  for (let w = 2; w <= mx.w; w++) {
    const wide = K.case(p, w, 1); let v = 0;
    for (let i = 0; i < w; i++) { const a = mv(c11, i * U, Vh, 0); v += iv(wide, a); a.delete(); const b = mv(c11, i * U, -Vh, 0); v += iv(wide, b); b.delete(); }
    const base = K.base(p, w); v += iv(wide, base);
    check(`${w}x1 between rows of 1x1 and on a base ${tag}`, v < 1e-3, v);
    // lock: pulled forward past the play, the wide module is caught by the row below
    const [wz0, , zf] = Kn.lockWindowZ(p); const pulled = mv(wide, 0, 0, -(zf - wz0 + 0.15));
    check(`${w}x1 pulled forward is caught by the base lock ${tag}`, iv(pulled, base) > 1e-3); pulled.delete();
    const pushed = mv(wide, 0, 0, 0.3); check(`${w}x1 pushed back is stopped ${tag}`, iv(pushed, base) > 1e-3); pushed.delete();
    base.delete(); wide.delete();
  }
  // partitioned drawers in their casings
  const stop = Kn.stopTravel(p);
  for (const [w, h] of [[1, 1], [2, 1], [1, 2], [mx.w, Math.min(3, mx.h)]]) {
    const cs = K.case(p, w, h), na = Kn.maxAcross(p, w, h), nd = Kn.maxDeep(p);
    for (const a of [...new Set([1, 2, na])]) {
      const xs = Kn.acrossCenters(p, w, h, a);
      const variants = { slots: K.drawer(p, w, h, { slots: xs.centers }), walls: K.drawer(p, w, h, { wallsX: xs.centers, wallsZ: Kn.deepCenters(p, nd).centers }) };
      for (const [kind, d] of Object.entries(variants)) {
        const name = `drawer ${w}x${h} ${kind} x${a} ${tag}`;
        check(name + ' closed: free', iv(cs, d) < 1e-3, iv(cs, d));
        const at = mv(d, 0, 0, -(stop - 0.05)), past = mv(d, 0, 0, -(stop + 0.4)), deep = mv(d, 0, 0, 0.3);
        check(name + ' at stop: free', iv(cs, at) < 1e-3); check(name + ' past stop: blocked', iv(cs, past) > 1e-3);
        check(name + ' pushed in: blocked', iv(cs, deep) > 1e-3); at.delete(); past.delete(); deep.delete();
        if (kind === 'slots') {
          const dv = K.divider(p, h); let v = 0;
          for (const xc of xs.centers) { const q = mv(dv, xc, 0, 0); v += iv(d, q); q.delete(); }
          check(name + ' dividers in slots: free', v < 1e-3, v); dv.delete();
          check(name + ` compartment >= 12 mm`, a === 1 || xs.comp >= 12 - 1e-9, xs.comp);
        }
        if (!Object.keys(over).length) save(`drawer_${w}x${h}_${kind}_${a}`, 'drawer', d);
        d.delete();
      }
    }
    if (!Object.keys(over).length) save(`case_${w}x${h}`, 'case', cs);
    cs.delete();
  }
  if (!Object.keys(over).length) { for (const h of [1, 2, 3]) { const d = K.divider(p, h); save(`divider_h${h}`, 'divider', d); d.delete(); }
    const b = K.base(p, 4); save('base_4', 'base', b); b.delete(); const r = K.couponRail(p); save('test_rail', 'coupon', r); r.delete();
    const g = K.couponGroove(p, 0.35, 5); save('test_groove_035', 'coupon', g); g.delete(); }
  c11.delete();
}
console.log(`${n} fit checks, ${bad} failed`);
process.exit(bad ? 1 : 0);
