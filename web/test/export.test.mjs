import fs from 'node:fs';
import Module from 'manifold-3d';
import { DEFAULTS, createKernel, stlBytes, cleanMesh, drawerBox } from '../kernel.js';
const M = await Module(); M.setup();
const K = createKernel(M);
const out = process.argv[2]; fs.mkdirSync(out, { recursive: true });
const over = JSON.parse(process.argv[3] || '{}');
const p = { ...DEFAULTS, ...over };
// python default divider slots
function pySlots(p, w, h) {
  const [X0, X1] = drawerBox(p, w, h);
  const cx = (X0+X1)/2, half = (X1-X0)/2 - p.d_wall; const s=[]; let k=0;
  for(;;){ let c = k===0?[cx]:[cx-k*p.divider_pitch, cx+k*p.divider_pitch]; c=c.filter(v=>Math.abs(v-cx)<=half-15); if(!c.length)break; s.push(...c); k++; }
  return s.sort((a,b)=>a-b);
}
const jobs = {
  case_1x1: () => K.case(p,1,1), case_2x1: () => K.case(p,2,1), case_1x2: () => K.case(p,1,2), case_3x2: () => K.case(p,3,2),
  drawer_1x1: () => K.drawer(p,1,1,{slots:pySlots(p,1,1)}), drawer_2x2: () => K.drawer(p,2,2,{slots:pySlots(p,2,2)}),
  divider_h1: () => K.divider(p,1), base_2: () => K.base(p,2),
  coupon_rail: () => K.couponRail(p), coupon_groove: () => K.couponGroove(p,0.25,3),
};
for (const [name, fn] of Object.entries(jobs)) {
  const t = performance.now(); const m = fn(); const dt = performance.now()-t;
  const mesh = cleanMesh(m);
  fs.writeFileSync(`${out}/${name}.stl`, stlBytes(mesh));
  console.log(name.padEnd(14), 'status', m.status(), 'parts', K.components(m), 'vol', (m.volume()/1000).toFixed(3), 'tris', m.numTri(), dt.toFixed(0)+'ms');
  m.delete();
}
