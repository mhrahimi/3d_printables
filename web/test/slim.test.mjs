// Slim side strips: one SLIM_D deep strip per row at the front of each side, tied together by a
// single vertical rod. Every strip is one printable solid; stacked on a column of casings the
// strips clear the casings and each other, lock like a full panel, slide on touching only their
// lock bumps, and the rod runs through every row.
import Module from 'manifold-3d';
import * as Kn from '../kernel.js';
const { DEFAULTS, createKernel, cleanMesh } = Kn;
const M = await Module(); M.setup(); const K = createKernel(M);
let n = 0, bad = 0;
const check = (name, ok, detail = '') => { n++; if (!ok) { bad++; console.log('  FAIL', name, detail); } };
const iv = (a, b) => { const x = a.intersect(b); const v = x.volume(); x.delete(); return v; };
const mv = (m, x, y, z) => m.translate([x, y, z]);
const solidOK = (name, m, kind) => {
  const c = cleanMesh(m), d = Kn.meshDefects(c);
  check(name + ': one closed solid', m.status() === 'NoError' && K.components(m) === 1 && !(d.open || d.doubled || d.zero), JSON.stringify(d) + ' pieces ' + K.components(m));
  const pm = Kn.printMesh(kind, Kn.useMesh(c)), dp = Kn.meshDefects(pm);
  check(name + ': print mesh closed, fits bed', !(dp.open || dp.doubled || dp.zero) && Math.max(...pm.size) <= 250, pm.size.map((v) => v.toFixed(1)).join(' x '));
};

const sets = [{}, { unit_w: 80, unit_h: 50, depth: 160, fit_dovetail: 0.3 }, { unit_w: 100, unit_h: 36, depth: 90, fit_dovetail: 0.15 },
  { dt_height: 2, dt_neck: 6, fit_dovetail: 0.45, fit_side: 0.55, fit_top: 0.7 }];
const rods = [{ shape: 'round', d: 6 }, { shape: 'square', d: 8 }, { shape: 'round', d: Kn.ROD_MIN }, { shape: 'round', d: Kn.ROD_MAX }, { shape: 'square', d: Kn.ROD_MAX }];
for (const [si, over] of sets.entries()) {
  const p = { ...DEFAULTS, ...over }, U = p.unit_w, V = p.unit_h, g = p.gap, tag = si ? JSON.stringify(over) : 'default';
  // one column, three rows: a 1x1, a 1x2 (two units high) and a 1x1 on top
  const rows = [1, 2, 1], ys = [0, 1, 3], H = 4;
  const cases = rows.map((h, i) => mv(K.case(p, 1, h), 0, ys[i] * V, 0));
  const ivAll = (m, list) => list.reduce((s, w) => s + iv(m, w), 0);
  const [wz0, , zf] = Kn.lockWindowZ(p), play = zf - wz0;
  for (const rod of si === 0 ? rods : rods.slice(0, 2)) {
    for (const style of ['minimal', 'labeled', 'structural']) {
      const name = `${style} ${rod.shape}${rod.d} ${tag}`;
      const strips = { left: [], right: [] };
      for (const side of ['left', 'right']) rows.forEach((h, i) => {
        const m = K.panel(p, { side, n: h, style, rod, slim: true, labels: [] });
        if (i < 2) solidOK(`${side} slim ${h} high ${name}`, m, Kn.panelPose(side, 'structural'));
        const bb = m.boundingBox();
        check(`${side} slim ${name}: ${Kn.SLIM_D} mm deep`, Math.abs(bb.max[2] - bb.min[2] - Kn.SLIM_D) < 0.01, bb.max[2] - bb.min[2]);
        strips[side].push(mv(m, side === 'left' ? 0 : U, ys[i] * V, 0)); m.delete();
      });
      if (style !== 'minimal') { strips.left.forEach((s) => s.delete()); strips.right.forEach((s) => s.delete()); continue; } // same geometry for every style
      for (const side of ['left', 'right']) {
        const S = strips[side];
        check(`${side} slim ${name}: no interference with the casings at rest`, ivAll(S[0], cases) + ivAll(S[1], cases) + ivAll(S[2], cases) < 1e-3);
        check(`${side} slim ${name}: rows clear each other`, iv(S[0], S[1]) + iv(S[1], S[2]) < 1e-3);
        // one rod through every row
        const T = Kn.panelT(p, 'structural', rod, {}, side), r = rod.d / 2, L = H * V - g - 2 * Kn.PLUG_LEN - 1;
        const xc = side === 'left' ? -g / 2 - (Kn.thick(p) + 0.4 + r + Kn.ROD_FIT) : U + g / 2 + Kn.thick(p) + 0.4 + r + Kn.ROD_FIT;
        const bar = rod.shape === 'round' ? M.Manifold.cylinder(L, r, r, 48).rotate([-90, 0, 0]) : M.Manifold.cube([rod.d, L, rod.d], false).translate([-r, 0, -r]);
        const b = bar.translate([xc, g / 2 + Kn.PLUG_LEN + 0.5, Kn.slimRodZ(rod)]);
        check(`${side} slim ${name}: the rod runs through all rows`, ivAll(b, S) < 1e-3, ivAll(b, S));
        // and it is held: a bar 0.7 mm fatter than the rod does hit the strips
        const fat = rod.shape === 'round' ? M.Manifold.cylinder(L, r + 0.35, r + 0.35, 48).rotate([-90, 0, 0]) : M.Manifold.cube([rod.d + 0.7, L, rod.d + 0.7], false).translate([-r - 0.35, 0, -r - 0.35]);
        const fb = fat.translate([xc, g / 2 + Kn.PLUG_LEN + 0.5, Kn.slimRodZ(rod)]);
        check(`${side} slim ${name}: the channel fits the rod closely`, ivAll(fb, S) > 1, ivAll(fb, S));
        check(`${side} slim ${name}: the channel stays inside the strip`, Kn.slimRodZ(rod) + r + Kn.ROD_FIT < Kn.SLIM_D - 1 && Kn.slimRodZ(rod) - r - Kn.ROD_FIT > 12 && T > 0);
        const plug = K.plug(p, rod).rotate([-90, 0, 0]).translate([xc, g / 2, Kn.slimRodZ(rod)]);
        const pv = iv(plug, S[0]);
        check(`${side} slim ${name}: end plug grips with its ribs only`, pv > 0.05 && pv < 6, pv);
        [bar, b, fat, fb, plug].forEach((x) => x.delete());
      }
      // locks: the right strip slides on from the front and clicks; casings slide along the left strip
      const R = strips.right[0], Lf = strips.left[0];
      const rp = mv(R, 0, 0, -(play + 0.15)), rb = mv(R, 0, 0, 0.3);
      check(`right slim ${name}: pulled forward is caught`, ivAll(rp, cases) > 1e-3); check(`right slim ${name}: pushed back is stopped`, ivAll(rb, cases) > 1e-3);
      const cp = mv(cases[0], 0, 0, -(play + 0.15)), cb = mv(cases[0], 0, 0, 0.3);
      check(`left slim ${name}: casing pulled forward is caught`, iv(cp, Lf) > 1e-3); check(`left slim ${name}: casing pushed back is stopped`, iv(cb, Lf) > 1e-3);
      for (const u of [1, 4, 9, 20, Kn.SLIM_D - 2]) {
        const s = mv(R, 0, 0, -u); let ok = true;
        for (const w of cases) { const x = s.intersect(w); if (x.volume() > 1e-3) { const bb = x.boundingBox(); if (bb.min[0] < U - g / 2 - p.lock_bump - 0.01) ok = false; } x.delete(); }
        check(`right slim ${name}: sliding on at ${u.toFixed(0)} mm only the bumps touch`, ok); s.delete();
        const c = mv(cases[0], 0, 0, -u); let okL = true;
        { const x = c.intersect(Lf); if (x.volume() > 1e-3) { const bb = x.boundingBox(); if (bb.max[0] > g / 2 + p.lock_bump + 0.01) okL = false; } x.delete(); }
        check(`left slim ${name}: casing sliding in at ${u.toFixed(0)} mm only the bumps touch`, okL); c.delete();
      }
      [rp, rb, cp, cb].forEach((x) => x.delete());
      strips.left.forEach((s) => s.delete()); strips.right.forEach((s) => s.delete());
    }
  }
  cases.forEach((c) => c.delete());
}
console.log(`${n} slim strip checks, ${bad} failed`);
process.exit(bad ? 1 : 0);
