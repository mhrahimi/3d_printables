// Build the fit test kits as ready-to-print ZIPs, one per filament and rail size:
//   node tools/make_kits.mjs ../docs/kits
// The filament presets, clearance offsets and rail sizes are read from src/app.js, so the
// kits always match the builder. Run it again after changing any of them.
import fs from 'node:fs';
import Module from 'manifold-3d';
import { zipSync } from 'fflate';
import * as Kn from '../kernel.js';

const out = process.argv[2] || '../docs/kits';
fs.mkdirSync(out, { recursive: true });

const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const grab = (name) => {
  const m = app.match(new RegExp(`^const ${name} = ([^\\n]*(?:\\n(?!const |function |//)[^\\n]*)*);`, 'm'));
  if (!m) throw new Error(`${name} not found in app.js`);
  return m[1];
};
const OFFSETS = eval(`(${grab('OFFSETS')})`);
const MATERIALS = eval(`(${grab('MATERIALS')})`);
const RAILS = eval(`(${grab('RAILS')})`);
// test pieces centred on the filament's presets: 3 notches = preset rail clearance, 2 = preset drawer gap
const kitRails = (m) => OFFSETS.map((o, i) => ({ fit: +(m.rail + o).toFixed(2), notches: i + 1 }));
const kitDrawers = (m) => [-0.1, 0, 0.1].map((o, i) => ({ gap: +(m.side + o).toFixed(2), notches: i + 1 }));

const M = await Module(); M.setup();
const K = Kn.createKernel(M);
const part = (pose, m) => { const mesh = Kn.useMesh(Kn.cleanMesh(m)); m.delete(); return Kn.stlBytes(Kn.printMesh(pose, mesh)); };

const notes = (mat, rail, p) => `FIT TEST KIT - ${mat.label}, ${rail} rails
For the Drawer Wall Builder: https://mhrahimi.github.io/3d_printables/
Instructions with pictures: https://mhrahimi.github.io/3d_printables/docs/fit-test-kit.html

Print everything here (about 100 g) before the wall, with the settings you will use for it:
0.4 mm nozzle, 0.20 mm layers, 3 walls, 15% infill, no supports. Do not rotate or scale.
The number in front of each file name is how many to print.

RAILS
  Slide each test_groove piece onto test_rail. 3 V-notches is the ${mat.label} preset
  (${mat.rail.toFixed(2)} mm per side); each notch more or fewer is 0.05 mm looser or tighter.
  Pick the tightest piece that slides the full length by hand without wobble.

DRAWERS
  Slide each test_drawer_slice into test_drawer_opening. 2 notches is the preset
  (${mat.side.toFixed(2)} mm per side); 1 notch is 0.10 mm tighter, 3 notches 0.10 mm looser.
  Pick the one that slides freely without rattling.

THEN
  If a piece other than the preset fitted best, set the difference in the builder under
  3 Print > Advanced (rail clearance and drawer clearance) before downloading your wall.
  Join the two mini casings and try the mini drawer to feel both clicks.

Made for the standard ${p.unit_w} x ${p.unit_h} mm unit and ${rail} rails (${p.dt_height} mm high, ${p.dt_neck} mm neck).
`;

const list = [];
for (const [mk, mat] of Object.entries(MATERIALS)) {
  for (const rail of Object.keys(RAILS)) {
    const p = { ...Kn.DEFAULTS, ...RAILS[rail], fit_dovetail: mat.rail, fit_side: mat.side, fit_top: mat.top, pull: 'lip' };
    const q = { ...p, depth: 48 };
    const files = {};
    files['1x_test_rail.stl'] = part('coupon', K.couponRail(p));
    for (const g of kitRails(mat)) files[`1x_test_groove_${g.fit.toFixed(2)}mm_${g.notches}-notch.stl`] = part('coupon', K.couponGroove(p, g.fit, g.notches));
    files['1x_test_drawer_opening.stl'] = part('case', K.couponDrawerCase(p));
    for (const d of kitDrawers(mat)) files[`1x_test_drawer_slice_${d.gap.toFixed(2)}mm_${d.notches}-notch.stl`] = part('case', K.couponDrawer(p, d.gap, d.notches));
    files['2x_test_mini_casing.stl'] = part('case', K.case(q, 1, 1));
    files['1x_test_mini_drawer.stl'] = part('drawer', K.drawer(q, 1, 1, {}));
    files['README.txt'] = new TextEncoder().encode(notes(mat, rail, p));
    const name = `fit-test-kit_${mk}_${rail}.zip`;
    const tree = {};
    for (const [k, v] of Object.entries(files)) tree[`fit-test-kit_${mk}_${rail}/${k}`] = [v, { level: 9 }];
    const zip = zipSync(tree);
    fs.writeFileSync(`${out}/${name}`, zip);
    list.push(name);
    console.log(name.padEnd(36), Object.keys(files).length - 1, 'STL', (zip.length / 1024).toFixed(0), 'KB');
  }
}
