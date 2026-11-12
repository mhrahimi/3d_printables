// Finish add-ons: every variant is one closed solid, fits the wall, locks, and leaves room for its rods.
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
const out = process.env.PRINT_DIR ? `${process.env.PRINT_DIR}/addons_print` : `${(await import('node:os')).tmpdir()}/drawer-wall-addons_print`; fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out, { recursive: true });
const solidOK = (name, m, kind, save) => {
  const c = cleanMesh(m), d = Kn.meshDefects(c);
  check(name + ': one closed solid', m.status() === 'NoError' && K.components(m) === 1 && !(d.open || d.doubled || d.zero), JSON.stringify(d) + ' pieces ' + K.components(m));
  const pm = Kn.printMesh(kind, Kn.useMesh(c)), dp = Kn.meshDefects(pm);
  check(name + ': print mesh closed, fits bed', !(dp.open || dp.doubled || dp.zero) && Math.max(pm.size[0], pm.size[1]) <= 250 && pm.size[2] <= 250, pm.size.map((v) => v.toFixed(1)).join(' x '));
  if (save) fs.writeFileSync(`${out}/${save}.stl`, stlBytes(pm));
};
// panel variants: style plus label look (raised letters, tilted strip on the top)
const VARIANTS = [
  { id: 'minimal', style: 'minimal' }, { id: 'labeled', style: 'labeled', look: {} },
  { id: 'labeled_raised', style: 'labeled', look: { raised: true } },
  { id: 'labeled_tilt', style: 'labeled', look: { tilt: true } },
  { id: 'labeled_raised_tilt', style: 'labeled', look: { raised: true, tilt: true } },
  { id: 'structural', style: 'structural' }];
const STYLES = VARIANTS.map((v) => v.id), VAR = Object.fromEntries(VARIANTS.map((v) => [v.id, v]));
const sets = [{}, { unit_w: 80, unit_h: 50, depth: 160, fit_dovetail: 0.3 }, { unit_w: 100, unit_h: 36, depth: 90, fit_dovetail: 0.15 }];
for (const [si, over] of sets.entries()) {
  const p = { ...DEFAULTS, ...over }, U = p.unit_w, V = p.unit_h, g = p.gap, D = p.depth, tag = si ? JSON.stringify(over) : '';
  const first = si === 0;
  const c11 = K.case(p, 1, 1);
  const wall = [[0, 0], [1, 0], [0, 1], [1, 1]].map(([c, r]) => mv(c11, c * U, r * V, 0));
  const ivWall = (m) => wall.reduce((s, w) => s + iv(m, w), 0);
  const [wz0, , zf] = Kn.lockWindowZ(p), play = zf - wz0;
  for (const rod of [{ shape: 'round', d: 6 }, { shape: 'square', d: 8 }]) {
    for (const sideId of STYLES.filter((id) => !id.includes('tilt'))) {
      const sideStyle = VAR[sideId].style, sLook = VAR[sideId].look;
      const Ts = Kn.panelT(p, sideStyle, rod, sLook, 'right'), ext = Ts + g;
      const lab = (cu, cv, w, t = 'M3 Screws & Nuts', cap = 10) => ({ ...Kn.labelPolys(t, cap, w), cu, cv });
      // per-row labels on the sides (one per unit row), a title otherwise
      const sideLabels = sideStyle === 'labeled' ? (sLook.raised ? [lab(D / 2, V / 2, D - 28, 'BOLTS', 8), lab(D / 2, 1.5 * V, D - 28, 'M4', 8)] : [lab(D / 2, V, D - 28)]) : [];
      const right0 = K.panel(p, { side: 'right', n: 2, style: sideStyle, rod, labels: sideLabels, look: sLook });
      const left0 = K.panel(p, { side: 'left', n: 2, style: sideStyle, rod, labels: sideLabels, look: sLook });
      const name = `${sideId} ${rod.shape}${rod.d} ${tag}`;
      solidOK(`right ${name}`, right0, Kn.panelPose('right', sideStyle, sLook), first && rod.d === 6 ? `right_${sideId}` : null);
      solidOK(`left ${name}`, left0, Kn.panelPose('left', sideStyle, sLook), first && rod.d === 6 ? `left_${sideId}` : null);
      if (sideStyle === 'labeled') {
        const plain = K.panel(p, { side: 'right', n: 2, style: 'labeled', rod, look: sLook });
        const dv = right0.volume() - plain.volume();
        check(`right ${name}: label is ${sLook.raised ? 'raised' : 'engraved'}`, sLook.raised ? dv > 10 : dv < -10, dv); plain.delete();
      }
      const right = mv(right0, 2 * U, 0, 0), left = left0;
      check(`right ${name}: no interference at rest`, ivWall(right) < 1e-3, ivWall(right));
      check(`left ${name}: no interference at rest`, ivWall(left) < 1e-3, ivWall(left));
      // right panel slides on from the front; left panel is a rail face the casings slide along
      const rp = mv(right, 0, 0, -(play + 0.15)), rb = mv(right, 0, 0, 0.3);
      check(`right ${name}: pulled forward is caught`, ivWall(rp) > 1e-3); check(`right ${name}: pushed back is stopped`, ivWall(rb) > 1e-3);
      for (const u of [1, 4, 9, 30, D * 0.6]) {
        const s = mv(right, 0, 0, -u); let ok = true;
        for (const w of wall) { const x = s.intersect(w); if (x.volume() > 1e-3) { const bb = x.boundingBox(); if (bb.min[0] < 2 * U - g / 2 - p.lock_bump - 0.01) ok = false; } x.delete(); }
        check(`right ${name}: sliding at ${u.toFixed(0)} mm only the bumps touch`, ok); s.delete();
      }
      const cp = mv(c11, 0, 0, -(play + 0.15)), cb = mv(c11, 0, 0, 0.3);
      check(`left ${name}: casing pulled forward is caught`, iv(cp, left) > 1e-3); check(`left ${name}: casing pushed back is stopped`, iv(cb, left) > 1e-3);
      cp.delete(); cb.delete(); rp.delete(); rb.delete();
      if (sideStyle === 'structural') {
        const r = rod.d / 2, xr = thick => thick + 0.4 + r + Kn.ROD_FIT, L = 2 * V - g - 2 * Kn.PLUG_LEN - 1;
        const bar = rod.shape === 'round' ? M.Manifold.cylinder(L, r, r, 48).rotate([-90, 0, 0]) : M.Manifold.cube([rod.d, L, rod.d], false).translate([-r, 0, -r]);
        let v = 0;
        for (const zc of Kn.rodZ(p)) for (const x of [2 * U + g / 2 + xr(Kn.thick(p)), -g / 2 - xr(Kn.thick(p))]) { const b = bar.translate([x, g / 2 + Kn.PLUG_LEN + 0.5, zc]); v += iv(b, right) + iv(b, left); b.delete(); }
        check(`sides ${name}: rods pass through the channels`, v < 1e-3, v);
        const plug = K.plug(p, rod);
        solidOK(`plug ${rod.shape}${rod.d} ${tag}`, plug, 'plug', first ? `plug_${rod.shape}${rod.d}` : null);
        const pv = iv(plug.rotate([-90, 0, 0]).translate([2 * U + g / 2 + xr(Kn.thick(p)), g / 2, Kn.rodZ(p)[0]]), right);
        check(`plug ${name}: only the crush ribs interfere`, pv > 0.05 && pv < 4, pv);
        plug.delete(); bar.delete();
      }
      for (const topId of STYLES) {
        const topStyle = VAR[topId].style, tLook = VAR[topId].look;
        // per-column labels on a tilted strip, a title otherwise
        const tls = topStyle !== 'labeled' ? [] : tLook.tilt ? [lab(U / 2, 0, U - 10, 'M3', 8), lab(1.5 * U, 0, U - 10, 'NUTS', 8)] : [lab(U, 13 + 5, 2 * U - 24)];
        const top0 = K.panel(p, { side: 'top', n: 2, style: topStyle, rod, extLo: ext, extHi: ext, labels: tls, look: tLook });
        const tn = `top ${topId} over ${name}`;
        solidOK(tn, top0, Kn.panelPose('top', topStyle, tLook), first && rod.d === 6 && sideStyle === 'minimal' ? `top_${topId}` : null);
        const top = mv(top0, 0, 2 * V, 0);
        const v = ivWall(top) + iv(top, right) + iv(top, left);
        check(`${tn}: no interference with wall or sides`, v < 1e-3, v);
        const tp = mv(top, 0, 0, -(play + 0.15)), tb = mv(top, 0, 0, 0.3);
        check(`${tn}: pulled forward is caught`, ivWall(tp) > 1e-3); check(`${tn}: pushed back is stopped`, ivWall(tb) > 1e-3);
        tp.delete(); tb.delete();
        if (topStyle === 'labeled') {
          const plain = K.panel(p, { side: 'top', n: 2, style: 'labeled', rod, extLo: ext, extHi: ext, look: tLook });
          const dv = top0.volume() - plain.volume();
          check(`${tn}: label is ${tLook.raised ? 'raised' : 'engraved'}`, tLook.raised ? dv > 10 : dv < -10, dv); plain.delete();
        }
        if (topStyle === 'structural') {
          const r = rod.d / 2, L = 2 * U - g + 2 * ext - 2 * Kn.PLUG_LEN - 1, yc = 2 * V + g / 2 + Kn.thick(p) + 0.4 + r + Kn.ROD_FIT;
          const bar = rod.shape === 'round' ? M.Manifold.cylinder(L, r, r, 48).rotate([0, 90, 0]) : M.Manifold.cube([L, rod.d, rod.d], false).translate([0, -r, -r]);
          let rv = 0; for (const zc of Kn.rodZ(p)) { const b = bar.translate([g / 2 - ext + Kn.PLUG_LEN + 0.5, yc, zc]); rv += iv(b, top) + iv(b, right) + iv(b, left); b.delete(); }
          check(`${tn}: rods pass through the channels`, rv < 1e-3, rv); bar.delete();
        }
        top.delete(); top0.delete();
      }
      for (const legs of [null, { style: 'straight', h: 40 }, { style: 'tapered', h: 60 }, { style: 'plinth', h: 30 }, { style: 'tapered', h: 120 }, { style: 'straight', h: 10 }]) {
        const b0 = K.panel(p, { side: 'bottom', n: 2, style: legs ? 'legs' : 'plate', legs, extLo: ext, extHi: ext });
        const bn = `bottom ${legs ? legs.style + legs.h : 'plate'} under ${name}`;
        solidOK(bn, b0, Kn.panelPose('bottom', legs ? 'legs' : 'plate'), first && rod.d === 6 && sideStyle === 'minimal' ? `bottom_${legs ? legs.style + legs.h : 'plate'}` : null);
        const v = ivWall(b0) + iv(b0, right) + iv(b0, left);
        check(`${bn}: no interference with wall or sides`, v < 1e-3, v);
        const cp2 = mv(c11, 0, 0, -(play + 0.15)), cb2 = mv(c11, 0, 0, 0.3);
        check(`${bn}: casing pulled forward is caught`, iv(cp2, b0) > 1e-3); check(`${bn}: casing pushed back is stopped`, iv(cb2, b0) > 1e-3);
        cp2.delete(); cb2.delete(); b0.delete();
      }
      right.delete(); right0.delete(); left0.delete();
    }
  }
  // longest pieces a 256 mm bed takes, and wide leg bases with a centre leg
  const mx = Kn.maxUnits(p);
  for (const id of STYLES) {
    const { style, look } = VAR[id], rod = { shape: 'round', d: 6 }, nv = Math.floor((250 + g) / V), nw = mx.w;
    if (!id.includes('tilt')) {
      solidOK(`right ${id} ${nv} high ${tag}`, K.panel(p, { side: 'right', n: nv, style, rod, look }), Kn.panelPose('right', style, look), first ? `right_${id}_long` : null);
      solidOK(`left ${id} ${nv} high ${tag}`, K.panel(p, { side: 'left', n: nv, style, rod, look }), Kn.panelPose('left', style, look), first ? `left_${id}_long` : null);
    }
    solidOK(`top ${id} ${nw} wide ${tag}`, K.panel(p, { side: 'top', n: nw, style, rod, look }), Kn.panelPose('top', style, look), first ? `top_${id}_long` : null);
  }
  // any rod size the builder accepts: smallest and largest, round and square, through top and side channels
  if (first) for (const rod of [{ shape: 'round', d: Kn.ROD_MIN }, { shape: 'square', d: Kn.ROD_MIN }, { shape: 'round', d: Kn.ROD_MAX }, { shape: 'square', d: Kn.ROD_MAX }, { shape: 'square', d: 9.5 }]) {
    const top = K.panel(p, { side: 'top', n: 2, style: 'structural', rod }), r = rod.d / 2, L = 2 * U - g - 2 * Kn.PLUG_LEN - 1;
    solidOK(`top structural ${rod.shape}${rod.d}`, top, 'case', `top_structural_${rod.shape}${rod.d}`);
    const yc = g / 2 + Kn.thick(p) + 0.4 + r + Kn.ROD_FIT;
    const bar = rod.shape === 'round' ? M.Manifold.cylinder(L, r, r, 48).rotate([0, 90, 0]) : M.Manifold.cube([L, rod.d, rod.d], false).translate([0, -r, -r]);
    let rv = 0; for (const zc of Kn.rodZ(p)) { const b = bar.translate([g / 2 + Kn.PLUG_LEN + 0.5, yc, zc]); rv += iv(b, top); b.delete(); }
    check(`top structural ${rod.shape}${rod.d}: rod passes`, rv < 1e-3, rv);
    // a square bar must sit in a square hole: 0.3 mm on every side, corners included
    if (rod.shape === 'square') for (const zc of Kn.rodZ(p)) {
      const big = M.Manifold.cube([L, rod.d + 0.58, rod.d + 0.58], false).translate([g / 2 + Kn.PLUG_LEN + 0.5, yc - r - 0.29, zc - r - 0.29]);
      const huge = M.Manifold.cube([L, rod.d + 0.7, rod.d + 0.7], false).translate([g / 2 + Kn.PLUG_LEN + 0.5, yc - r - 0.35, zc - r - 0.35]);
      check(`square channel ${rod.d}: square, 0.3 mm each side`, iv(big, top) < 1e-3 && iv(huge, top) > 1, [iv(big, top), iv(huge, top)]);
      big.delete(); huge.delete();
    }
    const plug = K.plug(p, rod); solidOK(`plug ${rod.shape}${rod.d}`, plug, 'plug', `plug_${rod.shape}${rod.d}`);
    const pv = iv(plug.rotate([0, 90, 0]).translate([g / 2 - 0.1, yc, Kn.rodZ(p)[0]]), top);
    check(`plug ${rod.shape}${rod.d}: only the crush ribs interfere`, pv > 0.05 && pv < 6, pv);
    bar.delete(); top.delete(); plug.delete();
  }
  for (const st of ['straight', 'tapered', 'plinth']) solidOK(`bottom ${st} ${mx.w} wide ${tag}`, K.panel(p, { side: 'bottom', n: mx.w, style: 'legs', legs: { style: st, h: 80 } }), 'case', first ? `bottom_${st}80_wide` : null);
  wall.forEach((w) => w.delete()); c11.delete();
}
console.log(`${n} add-on checks, ${bad} failed`);
process.exit(bad ? 1 : 0);
