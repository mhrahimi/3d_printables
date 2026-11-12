// Drawer wall builder: layout editor, 3D preview, parts list, ZIP export.
// `Kn` (the geometry kernel) and `WASM_B64` are defined above this code by the build.

const CDN = {
  three: 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.min.js',
  manifold: 'https://cdn.jsdelivr.net/npm/manifold-3d@3.5.4/manifold.js',
  fflate: 'https://cdn.jsdelivr.net/npm/fflate@0.8.2/esm/browser.js',
};
// absolute, so the link still works in the README inside a downloaded ZIP
const GUIDE_URL = new URL('__GUIDE_URL__', location.href).href;
const KIT_URL = new URL('__DOCS_URL__fit-test-kit.html', location.href).href;
/** Starting clearances per side (mm) and density per filament; see docs/materials. */
const MATERIALS = {
  PLA: { label: 'PLA / PLA+', rail: 0.25, side: 0.35, top: 0.5, rho: 1.24 },
  PETG: { label: 'PETG', rail: 0.30, side: 0.40, top: 0.55, rho: 1.27 },
  ABS: { label: 'ABS / ASA', rail: 0.35, side: 0.45, top: 0.6, rho: 1.05 },
};
const OFFSETS = [-0.1, -0.05, 0, 0.05, 0.1];
const RAILS = { standard: { dt_height: 1.6, dt_neck: 5 }, sturdy: { dt_height: 2.0, dt_neck: 6 } };
const CASE_COLORS = [['Deep blue', '#12325c'], ['Graphite', '#30343b'], ['Grey', '#aeb6c2'], ['White', '#eef2f5'], ['Orange', '#e8742a']];
// cyan is the page's own highlight colour, so it is not offered for drawers
const DRAWER_COLORS = [['White', '#f1f4f6'], ['Orange', '#f08a24'], ['Yellow', '#f2c230'], ['Red', '#d9473a'], ['Clear', 'clear']];
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)');
const ICON = (id) => `<svg class="ic" aria-hidden="true"><use href="#i-${id}"/></svg>`;
const LIMITS = { cols: [1, 8], rows: 12, unit_w: [60, 120], unit_h: [32, 80], depth: [80, 220] };
const STORE_KEY = 'drawer-wall-builder-v3';
/** The stiffening rod chosen for structural panels. */
const rodOf = (f) => ({ shape: f.rodShape, d: f.rodD, key: `${f.rodShape}${String(f.rodD).replace('.', 'p')}`,
  label: `${f.rodShape === 'round' ? 'Round rod' : 'Square bar'}, ${fmt(f.rodD)} mm` });
const PANEL_STYLES = ['none', 'minimal', 'labeled', 'structural'];
const BED = 250;

const EXAMPLE = () => ({
  cols: 4,
  rows: [                                   // stored top to bottom; shown and numbered from the bottom
    { m: 1, h: 1, across: 1, deep: 1, labelL: '', labelR: '' },
    { m: 1, h: 1, across: 2, deep: 1, labelL: '', labelR: '' },
    { m: 2, h: 1, across: 3, deep: 1, labelL: '', labelR: '' },
    { m: 2, h: 2, across: 2, deep: 2, labelL: '', labelR: '' },
  ],
  style: 'fixed',                           // 'fixed' printed-in walls | 'removable' dividers
  finish: { top: 'none', sides: 'none', bottom: 'none', legStyle: 'tapered', legH: 7.5,
    rodShape: 'round', rodD: 6,
    labelMode: 'title',                     // 'title' one text per panel | 'each' per column (top) and per row (sides)
    lettering: 'engraved',                  // 'engraved' pressed in | 'raised'
    tilt: false,                            // top labels on a 45 deg strip along the front edge
    // printed pieces per panel group: 'long' as long as the bed allows | 'each' one per column (top, bottom) or row (sides)
    pieces_top: 'long', pieces_sides: 'long', pieces_bottom: 'long',
    topLabel: 'Workshop', leftLabel: '', rightLabel: '', colLabels: [] },
  showDims: true,
  caseColor: CASE_COLORS[0][1], drawerColor: DRAWER_COLORS[0][1],
  unit_w: 60, unit_h: 40, depth: 130, material: 'PLA', railOffset: 0, drawerOffset: 0, rails: 'standard', pull: 'lip',
});

let state = EXAMPLE();
try {
  const saved = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
  if (saved && Array.isArray(saved.rows) && saved.rows.length) {
    // the default leg height went from 40 to 15 mm: move designs still on the old default
    if (!saved.legs15 && saved.finish && saved.finish.legH === 40) saved.finish.legH = 15;
    // legs became optional and lower by default: designs still on the old default lose them
    if (!saved.legs75 && saved.finish && saved.finish.bottom === 'legs' && saved.finish.legH === 15) { saved.finish.bottom = 'plate'; saved.finish.legH = 7.5; }
    // no finish panels by default: designs still on the old defaults (labelled top, minimal sides, base plate) lose them
    const f0 = saved.finish;
    if (!saved.finNone && f0 && f0.top === 'labeled' && f0.sides === 'minimal' && f0.bottom === 'plate') { f0.top = 'none'; f0.sides = 'none'; f0.bottom = 'none'; }
    // cyan drawers looked like the page's highlight: move them to white
    if (saved.drawerColor === '#5ae8d3') saved.drawerColor = '#f1f4f6';
    state = { ...state, ...saved };
  }
  state.legs15 = true; state.legs75 = true; state.finNone = true;
} catch { /* storage unavailable: start from the example */ }

const $ = (id) => document.getElementById(id);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const fmt = (v, d = 1) => (Math.round(v * 10 ** d) / 10 ** d).toFixed(d).replace(/\.0+$/, '');
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ---------------------------------------------------------------- parameters and layout
function params() {
  const mat = MATERIALS[state.material];
  return { ...Kn.DEFAULTS, ...RAILS[state.rails], unit_w: state.unit_w, unit_h: state.unit_h, depth: state.depth,
    fit_dovetail: +(mat.rail + state.railOffset).toFixed(3), fit_side: +(mat.side + state.drawerOffset).toFixed(3),
    fit_top: +(mat.top + state.drawerOffset).toFixed(3), pull: state.pull };
}

/** Clamp the state to what the current base size and width allow. */
function normalize() {
  const s = state;
  s.cols = clamp(Math.round(s.cols) || 1, ...LIMITS.cols);
  for (const k of ['unit_w', 'unit_h', 'depth']) s[k] = clamp(Number(s[k]) || Kn.DEFAULTS[k], ...LIMITS[k]);
  if (!MATERIALS[s.material]) s.material = 'PLA';
  // older saves stored an absolute rail clearance: turn it into an offset from the PLA preset
  if (typeof s.fit === 'number') { s.railOffset = s.fit - MATERIALS.PLA.rail; delete s.fit; }
  const near = (v) => OFFSETS.reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a), 0);
  s.railOffset = near(Number(s.railOffset) || 0); s.drawerOffset = near(Number(s.drawerOffset) || 0);
  if (!RAILS[s.rails]) s.rails = 'standard';
  if (s.pull !== 'notch') s.pull = 'lip';
  if (s.style !== 'removable') s.style = 'fixed';
  s.showDims = s.showDims !== false;
  const f = s.finish = { ...EXAMPLE().finish, ...(s.finish || {}) };
  if ('base' in s) { if (!s.base && f.bottom === 'plate') f.bottom = 'none'; delete s.base; }
  if (!PANEL_STYLES.includes(f.top)) f.top = 'minimal';
  if (!PANEL_STYLES.includes(f.sides)) f.sides = 'minimal';
  if (!['none', 'plate', 'legs'].includes(f.bottom)) f.bottom = 'plate';
  if (!['straight', 'tapered', 'plinth'].includes(f.legStyle)) f.legStyle = 'tapered';
  f.legH = clamp(Math.round((Number(f.legH) || 7.5) / 2.5) * 2.5, 5, 120);
  delete f.rod;
  if (!['round', 'square'].includes(f.rodShape)) f.rodShape = 'round';
  f.rodD = clamp(Math.round((Number(f.rodD) || 6) * 2) / 2, Kn.ROD_MIN, Kn.ROD_MAX);
  if (!['title', 'each'].includes(f.labelMode)) f.labelMode = 'title';
  if (!['engraved', 'raised'].includes(f.lettering)) f.lettering = 'engraved';
  f.tilt = !!f.tilt;
  for (const k of ['top', 'sides', 'bottom']) if (!['long', 'each'].includes(f[`pieces_${k}`])) f[`pieces_${k}`] = f.pieces === 'each' ? 'each' : 'long';
  delete f.pieces;
  for (const k of ['topLabel', 'leftLabel', 'rightLabel']) f[k] = String(f[k] || '').slice(0, 24);
  f.colLabels = Array.from({ length: s.cols }, (_, i) => String((f.colLabels || [])[i] || '').slice(0, 12));
  const p = params(), mx = Kn.maxUnits(p);
  if (!s.rows.length) s.rows.push({ m: 1, h: 1, across: 1, deep: 1 });
  s.rows = s.rows.slice(0, LIMITS.rows);
  for (const r of s.rows) {
    r.h = clamp(Math.round(r.h) || 1, 1, Math.min(3, mx.h));
    r.m = clamp(Math.round(r.m) || 1, 1, Math.min(mx.w, s.cols));
    r.across = clamp(Math.round(r.across) || 1, 1, Kn.maxAcross(p, r.m, r.h));
    r.deep = s.style === 'removable' ? 1 : clamp(Math.round(r.deep) || 1, 1, Kn.maxDeep(p));
    r.labelL = String(r.labelL || '').slice(0, 16); r.labelR = String(r.labelR || '').slice(0, 16);
  }
  return { p, mx };
}

/** Module widths (grid units) that fill a row: as many `m`-wide as fit, then the remainder. */
function rowWidths(cols, m) {
  const out = Array(Math.floor(cols / m)).fill(m);
  if (cols % m) out.push(cols % m);
  return out;
}

function drawerSpec(p, w, h, row) {
  const across = Math.min(row.across, Kn.maxAcross(p, w, h));
  const deep = state.style === 'removable' ? 1 : row.deep;
  const ac = Kn.acrossCenters(p, w, h, across), dc = Kn.deepCenters(p, deep);
  const removable = state.style === 'removable';
  let tag = 'open';
  if (across > 1 || deep > 1) tag = removable ? `slots-${across}` : `walls-${across}x${deep}`;
  return {
    key: `drawer_${w}x${h}_${tag}`, across, deep, removable,
    opt: removable ? { slots: ac.centers } : { wallsX: ac.centers, wallsZ: dc.centers },
    dividerX: removable ? ac.centers : [],
    compW: ac.comp, compD: dc.comp,
  };
}

function layout(p, mx) {
  const modules = [], counts = new Map();
  const add = (key, def) => { const c = counts.get(key); if (c) c.qty += def.qty || 1; else counts.set(key, { ...def, key, qty: def.qty || 1 }); };
  let y = 0, drawers = 0;
  const rows = [...state.rows.keys()].reverse();          // build from the bottom up
  for (const ri of rows) {
    const row = state.rows[ri];
    let col = 0;
    for (const w of rowWidths(state.cols, row.m)) {
      const d = drawerSpec(p, w, row.h, row);
      modules.push({ row: ri, col, y, w, h: row.h, drawer: d });
      add(`case_${w}x${row.h}`, { kind: 'case', w, h: row.h, label: `Casing ${w}×${row.h}` });
      const what = d.across === 1 && d.deep === 1 ? 'open'
        : d.removable ? `${d.across} compartments, slots for dividers`
          : `${d.across * d.deep} compartments (${d.across} × ${d.deep})`;
      add(d.key, { kind: 'drawer', w, h: row.h, spec: d, label: `Drawer ${w}×${row.h}, ${what}` });
      if (d.dividerX.length) add(`divider_h${row.h}`, { kind: 'divider', h: row.h, label: `Divider, ${row.h}× height`, qty: d.dividerX.length });
      col += w; drawers++;
    }
    y += row.h;
  }
  const fin = finishLayout(p, y);
  for (const pn of fin.panels) add(pn.key, pn.def);
  const rod = rodOf(state.finish);
  if (fin.plugs) add(`plug_${rod.key}`, { kind: 'plug', rod, label: `End plug for ${rod.label.toLowerCase()}`, qty: fin.plugs });
  const order = { panel: 0, case: 1, drawer: 2, divider: 3, plug: 4 };
  const parts = [...counts.values()].sort((a, b) => order[a.kind] - order[b.kind] || (a.h || 0) - (b.h || 0) || (a.w || 0) - (b.w || 0) || a.key.localeCompare(b.key));
  return { modules, parts, unitsHigh: y, drawers, panels: fin.panels, rods: fin.rods, ext: fin.ext, topT: fin.topT, bottomH: fin.bottomH };
}

/**
 * Split a run of cells (sizes in grid units) into printed pieces. 'each': one piece per cell;
 * 'long': as many whole cells as fit the bed. Pieces never split a cell, so a row's or a
 * column's label is never cut in two.
 */
function pieces(cells, pitch, g, extLo, extHi, mode) {
  const out = []; let i = 0, start = 0;
  while (i < cells.length) {
    let k = 1, n = cells[i];
    const lo = i === 0 ? extLo : 0, len = (nn, last) => nn * pitch - g + lo + (last ? extHi : 0);
    if (mode !== 'each') while (i + k < cells.length && len(n + cells[i + k], i + k + 1 === cells.length) <= BED) { n += cells[i + k]; k++; }
    const last = i + k === cells.length;
    out.push({ start, n, extLo: lo, extHi: last ? extHi : 0, cells: [i, i + k] });
    start += n; i += k;
  }
  return out;
}
const hash = (t) => { let h = 0; for (const c of t) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h.toString(36); };

/** Top, side and bottom finish panels for a wall `H` units high. */
function finishLayout(p, H) {
  const f = state.finish, U = p.unit_w, V = p.unit_h, g = p.gap, D = p.depth, rod = rodOf(f);
  const look = { raised: f.lettering === 'raised', tilt: f.tilt };
  const sideT = f.sides === 'none' ? 0 : Kn.panelT(p, f.sides, rod, look, 'right'), ext = f.sides === 'none' ? 0 : sideT + g;
  const panels = [], rods = []; let plugs = 0;
  const name = { minimal: 'minimal', labeled: 'labelled', structural: 'structural' };
  const lab = (text, cap, width, cu, cv) => { const L = Kn.labelPolys(text, cap, width); return L.polys.length ? { ...L, cu, cv } : null; };
  const lookTag = (side) => (Kn.panelEdge(side, 'labeled', look) ? `_${look.raised ? 'R' : 'E'}${side === 'top' && look.tilt ? 'T' : ''}` : '');
  const labelKey = (labels) => (labels.length ? '_' + hash(JSON.stringify(labels.map((L) => [L.text, L.cu, L.cv, L.cap]))) : '');
  const quote = (labels) => (labels.length ? ` (${labels.map((L) => `“${L.text}”`).join(', ')})` : '');
  const each = f.labelMode === 'each';

  if (f.top !== 'none') {
    const segs = pieces(Array(state.cols).fill(1), U, g, ext, ext, f.pieces_top), mid = state.cols / 2;
    const titleSeg = segs.find((sg) => sg.start < mid && mid <= sg.start + sg.n) || segs[0];
    for (const sg of segs) {
      const labels = [];
      if (f.top === 'labeled') {
        const capT = f.tilt ? 8 : 10, cv = (cap) => (f.tilt ? 0 : 7 + cap / 2);
        if (each) for (let c = sg.start; c < sg.start + sg.n; c++) {
          const L = lab(f.colLabels[c], capT, U - 10, (c - sg.start + 0.5) * U, cv(capT)); if (L) labels.push(L);
        } else if (sg === titleSeg) {
          const cu = segs.length === 1 ? mid * U : (sg.n * U) / 2;
          const L = lab(f.topLabel, capT, sg.n * U - 24, cu, cv(capT)); if (L) labels.push(L);
        }
      }
      const opt = { side: 'top', n: sg.n, style: f.top, rod, extLo: sg.extLo, extHi: sg.extHi, labels, look };
      const key = `top_${f.top}${f.top === 'structural' ? '_' + rod.key : ''}${f.top === 'labeled' ? lookTag('top') : ''}_${sg.n}w${sg.extLo ? '_L' : ''}${sg.extHi ? '_R' : ''}${labelKey(labels)}`;
      panels.push({ key, x: sg.start * U, y: H * V, def: { kind: 'panel', opt, pose: Kn.panelPose('top', f.top, look),
        label: `Top panel, ${name[f.top]}${f.top === 'labeled' && f.tilt ? ' with tilted strip' : ''}, ${sg.n} wide${quote(labels)}` } });
    }
    if (f.top === 'structural') { rods.push({ rod, len: state.cols * U - g + 2 * ext - 2 * Kn.PLUG_LEN - 1, qty: 2, where: 'top' }); plugs += 4; }
  }
  if (f.sides !== 'none') {
    // rows from the bottom up, so pieces break between rows
    const order = [...state.rows.keys()].reverse(), cells = order.map((ri) => state.rows[ri].h);
    const segs = pieces(cells, V, g, 0, 0, f.pieces_sides), mid = H / 2;
    const titleSeg = segs.find((sg) => sg.start < mid && mid <= sg.start + sg.n) || segs[0];
    for (const side of ['left', 'right']) for (const sg of segs) {
      const labels = [];
      if (f.sides === 'labeled') {
        if (each) {
          let y = 0;
          for (let c = sg.cells[0]; c < sg.cells[1]; c++) {
            const r = state.rows[order[c]], cap = Math.min(10, r.h * V - 16);
            if (cap >= 5) { const L = lab(side === 'left' ? r.labelL : r.labelR, cap, D - 28, D / 2, y + (r.h * V) / 2); if (L) labels.push(L); }
            y += r.h * V;
          }
        } else if (sg === titleSeg) {
          const cap = Math.min(10, sg.n * V - 16), cv = segs.length === 1 ? mid * V : (sg.n * V) / 2;
          if (cap >= 5) { const L = lab(side === 'left' ? f.leftLabel : f.rightLabel, cap, D - 28, D / 2, cv); if (L) labels.push(L); }
        }
      }
      const opt = { side, n: sg.n, style: f.sides, rod, labels, look };
      const key = `${side}_${f.sides}${f.sides === 'structural' ? '_' + rod.key : ''}${f.sides === 'labeled' ? lookTag(side) : ''}_${sg.n}h${labelKey(labels)}`;
      panels.push({ key, x: side === 'left' ? 0 : state.cols * U, y: sg.start * V, def: { kind: 'panel', opt, pose: Kn.panelPose(side, f.sides, look),
        label: `${side === 'left' ? 'Left' : 'Right'} side panel, ${name[f.sides]}, ${sg.n} high${quote(labels)}` } });
    }
    if (f.sides === 'structural') { rods.push({ rod, len: H * V - g - 2 * Kn.PLUG_LEN - 1, qty: 4, where: 'sides' }); plugs += 8; }
  }
  if (f.bottom !== 'none') {
    const legs = f.bottom === 'legs' ? { style: f.legStyle, h: f.legH } : null;
    for (const sg of pieces(Array(state.cols).fill(1), U, g, ext, ext, f.pieces_bottom)) {
      const opt = { side: 'bottom', n: sg.n, style: f.bottom, legs, extLo: sg.extLo, extHi: sg.extHi };
      const key = `bottom_${legs ? `${legs.style}${String(legs.h).replace(".", "p")}` : 'plate'}_${sg.n}w${sg.extLo ? '_L' : ''}${sg.extHi ? '_R' : ''}`;
      panels.push({ key, x: sg.start * U, y: 0, def: { kind: 'panel', opt, pose: Kn.panelPose('bottom', f.bottom),
        label: legs ? `Base with ${legs.style} legs, ${legs.h} mm, ${sg.n} wide` : `Base plate, ${sg.n} wide` } });
    }
  }
  const topT = f.top === 'none' ? (p.dt_height - g)
    : Kn.panelT(p, f.top, rod, look, 'top') + g + (f.top === 'labeled' && f.tilt ? Kn.TILT : 0);
  const bottomH = f.bottom === 'none' ? p.lock_bump - g : p.base_t + g + (f.bottom === 'legs' ? f.legH : 0);
  return { panels, rods, plugs, ext, topT, bottomH };
}

// ---------------------------------------------------------------- geometry cache
let K = null;                       // kernel bound to the WASM module
let cache = new Map(), cacheParams = '';
function getPart(p, key, kind, build, pose = kind) {
  const sig = JSON.stringify(p);
  if (sig !== cacheParams) { cache = new Map(); cacheParams = sig; for (const g of geoCache.values()) g.dispose(); geoCache.clear(); }
  let e = cache.get(key);
  if (!e) {
    const m = build();
    const mesh = Kn.useMesh(Kn.cleanMesh(m));
    e = { kind, mesh, volume: m.volume(), print: Kn.printMesh(pose, mesh) };
    m.delete();
    cache.set(key, e);
  }
  return e;
}
function buildDef(p, def) {
  if (def.kind === 'case') return getPart(p, def.key, 'case', () => K.case(p, def.w, def.h));
  if (def.kind === 'drawer') return getPart(p, def.key, 'drawer', () => K.drawer(p, def.w, def.h, def.spec.opt));
  if (def.kind === 'divider') return getPart(p, def.key, 'divider', () => K.divider(p, def.h));
  if (def.kind === 'plug') return getPart(p, def.key, 'plug', () => K.plug(p, def.rod));
  return getPart(p, def.key, 'panel', () => K.panel(p, def.opt), def.pose);
}
// ---------------------------------------------------------------- model (state -> everything derived)
let model = null;
function compute() {
  const { p, mx } = normalize();
  const errors = Kn.check(p);
  if (errors.length) return { p, mx, errors };
  const lay = layout(p, mx);
  const rho = MATERIALS[state.material].rho;
  let grams = 0, pieces = 0, gCase = 0, gDrawer = 0;
  for (const def of lay.parts) {
    const e = buildDef(p, def);
    def.entry = e; def.size = e.print.size; def.grams = (e.volume / 1000) * rho;
    grams += def.grams * def.qty; pieces += def.qty;
    if (def.kind === 'case' || def.kind === 'panel' || def.kind === 'plug') gCase += def.grams * def.qty; else gDrawer += def.grams * def.qty;
  }
  const U = p.unit_w, V = p.unit_h;
  // outer size: side panels (or bare rails and lock bumps), top panel, base and legs, pull lips
  const sides = state.finish.sides === 'none' ? p.dt_height + p.lock_bump : 2 * lay.ext;
  const size = [state.cols * U - p.gap + sides, lay.unitsHigh * V - p.gap + lay.topT + lay.bottomH,
    p.depth + p.pull_depth - p.d_front_recess];
  return { p, mx, errors: [], ...lay, grams, pieces, gCase, gDrawer, size };
}

// ---------------------------------------------------------------- 3D preview
let THREE = null, view3d = null;
const geoCache = new Map();

function makeGeometry(key, mesh) {
  let g = geoCache.get(key);
  if (g) return g;
  const V = mesh.vertProperties, T = mesh.triVerts, pos = new Float32Array(T.length * 3);
  for (let i = 0; i < T.length; i++) { pos[i * 3] = V[T[i] * 3]; pos[i * 3 + 1] = V[T[i] * 3 + 1]; pos[i * 3 + 2] = V[T[i] * 3 + 2]; }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.computeVertexNormals();                       // non-indexed: flat shading
  g = { geo, edges: new THREE.EdgesGeometry(geo, 28), dispose() { this.geo.dispose(); this.edges.dispose(); } };
  geoCache.set(key, g);
  return g;
}

function initView() {
  const canvas = $('view');
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true }); } catch { return null; }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 5, 20000);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a94a6, 1.5));
  const key = new THREE.DirectionalLight(0xffffff, 2.2); scene.add(key);
  const fill = new THREE.DirectionalLight(0xffffff, 0.7); scene.add(fill);
  const root = new THREE.Group(); scene.add(root);
  const v = {
    renderer, scene, camera, root, canvas, key, fill,
    az: 0.62, el: 0.3, dist: 800, target: new THREE.Vector3(), radius: 200,
    drawers: [], cases: [], dirty: true, raf: 0, last: 0, hover: null, hlRow: -1,
  };

  const place = () => {
    const ce = Math.cos(v.el);
    camera.position.set(v.target.x + v.dist * ce * Math.sin(v.az), v.target.y + v.dist * Math.sin(v.el), v.target.z + v.dist * ce * Math.cos(v.az));
    camera.lookAt(v.target);
    key.position.copy(camera.position).add(new THREE.Vector3(-v.dist * 0.3, v.dist * 0.7, v.dist * 0.2));
    fill.position.set(v.target.x - v.dist, v.target.y + v.dist * 0.2, v.target.z + v.dist * 0.5);
  };
  v.invalidate = () => { v.dirty = true; if (!v.raf) v.raf = requestAnimationFrame(frame); };
  function frame(now) {
    v.raf = 0;
    const dt = Math.min(0.05, (now - (v.last || now)) / 1000); v.last = now;
    let moving = false;
    for (const d of v.drawers) {
      const diff = d.target - d.cur;
      if (Math.abs(diff) > 0.001 && !REDUCED.matches) { d.cur += diff * Math.min(1, dt * 9 + 0.02); moving = true; } else d.cur = d.target;
      d.group.position.z = d.cur * d.travel;
    }
    if (v.dirty || moving) { place(); renderer.render(scene, camera); placeDimLabels(v); v.dirty = false; }
    if (moving) v.raf = requestAnimationFrame(frame); else v.last = 0;
  }
  v.resize = () => {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); v.invalidate();
  };
  v.fit = () => {
    const half = THREE.MathUtils.degToRad(camera.fov / 2);
    const lim = Math.min(half, Math.atan(Math.tan(half) * camera.aspect));
    v.dist = (v.radius / Math.sin(lim)) * 1.12;          // a margin for the dimension lines
    v.az = 0.62; v.el = 0.3; v.invalidate();
  };
  new ResizeObserver(v.resize).observe(canvas);

  // orbit (drag), pan (shift or right drag, two fingers), zoom (wheel, pinch), click a drawer
  const ptrs = new Map(); let moved = 0, pinch = 0;
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  const pick = (ev) => {
    const r = canvas.getBoundingClientRect();
    ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(v.drawers.map((d) => d.mesh), false)[0];
    return hit ? v.drawers.find((d) => d.mesh === hit.object) : null;
  };
  const pan = (dx, dy) => {
    const s = (v.dist * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * 2) / canvas.clientHeight;
    const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0), up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
    v.target.addScaledVector(right, -dx * s).addScaledVector(up, dy * s);
  };
  canvas.addEventListener('pointerdown', (ev) => { canvas.setPointerCapture(ev.pointerId); ptrs.set(ev.pointerId, { x: ev.clientX, y: ev.clientY, b: ev.button, shift: ev.shiftKey }); moved = 0; pinch = 0; });
  canvas.addEventListener('pointermove', (ev) => {
    const q = ptrs.get(ev.pointerId);
    if (!q) { const h = pick(ev); canvas.style.cursor = h ? 'pointer' : 'grab'; return; }
    const dx = ev.clientX - q.x, dy = ev.clientY - q.y; q.x = ev.clientX; q.y = ev.clientY; moved += Math.abs(dx) + Math.abs(dy);
    if (ptrs.size === 2) {
      const [a, b] = [...ptrs.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch) v.dist = clamp(v.dist * (pinch / d), v.radius * 0.4, v.radius * 12);
      pinch = d; pan(dx / 2, dy / 2);
    } else if (q.b === 2 || q.b === 1 || q.shift) pan(dx, dy);
    else { v.az -= dx * 0.008; v.el = clamp(v.el + dy * 0.008, -1.45, 1.45); }
    v.invalidate();
  });
  const up = (ev) => {
    const q = ptrs.get(ev.pointerId); ptrs.delete(ev.pointerId);
    if (q && moved < 5 && ev.type === 'pointerup') { const d = pick(ev); if (d) { d.target = d.target ? 0 : 1; v.invalidate(); syncOpenButton(); } }
  };
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('contextmenu', (ev) => ev.preventDefault());
  canvas.addEventListener('wheel', (ev) => { ev.preventDefault(); v.dist = clamp(v.dist * Math.exp(ev.deltaY * 0.0012), v.radius * 0.4, v.radius * 12); v.invalidate(); }, { passive: false });
  canvas.addEventListener('keydown', (ev) => {
    const k = ev.key; let used = true;
    if (k === 'ArrowLeft') v.az -= 0.12; else if (k === 'ArrowRight') v.az += 0.12;
    else if (k === 'ArrowUp') v.el = clamp(v.el + 0.1, -1.45, 1.45); else if (k === 'ArrowDown') v.el = clamp(v.el - 0.1, -1.45, 1.45);
    else if (k === '+' || k === '=') v.dist *= 0.88; else if (k === '-') v.dist /= 0.88; else used = false;
    if (used) { ev.preventDefault(); v.invalidate(); }
  });
  return v;
}

function rebuildScene(m) {
  const v = view3d;
  if (!v) return;
  const wasOpen = new Map(v.drawers.map((d) => [d.id, d.target]));
  while (v.root.children.length) v.root.remove(v.root.children[0]);
  for (const mat of v.mats || []) mat.dispose();
  const p = m.p, U = p.unit_w, Vh = p.unit_h, clear = state.drawerColor === 'clear';
  const caseMat = new THREE.MeshStandardMaterial({ color: state.caseColor, roughness: 0.72, metalness: 0.02 });
  const hlMat = new THREE.MeshStandardMaterial({ color: state.caseColor, roughness: 0.72, emissive: 0x5ae8d3, emissiveIntensity: 0.45 });
  const drawerMat = clear
    ? new THREE.MeshStandardMaterial({ color: 0xdff3f7, roughness: 0.25, transparent: true, opacity: 0.42, depthWrite: false, side: THREE.DoubleSide })
    : new THREE.MeshStandardMaterial({ color: state.drawerColor, roughness: 0.6, metalness: 0.02 });
  const lum = (hex) => { const c = new THREE.Color(hex); return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b; };
  const caseLine = new THREE.LineBasicMaterial({ color: lum(state.caseColor) > 0.35 ? 0x0b1830 : 0xc2fff6, transparent: true, opacity: lum(state.caseColor) > 0.35 ? 0.45 : 0.3 });
  const drawerLine = new THREE.LineBasicMaterial({ color: 0x06203f, transparent: true, opacity: clear ? 0.5 : 0.4 });
  v.mats = [caseMat, hlMat, drawerMat, caseLine, drawerLine];
  v.caseMat = caseMat; v.hlMat = hlMat;
  v.drawers = []; v.cases = [];
  const travel = Kn.stopTravel(p);
  const addPart = (parent, key, entry, mat, line) => {
    const g = makeGeometry(key, entry.mesh);
    const mesh = new THREE.Mesh(g.geo, mat); parent.add(mesh);
    parent.add(new THREE.LineSegments(g.edges, line));
    return mesh;
  };
  for (const mod of m.modules) {
    const grp = new THREE.Group(); grp.position.set(mod.col * U, mod.y * Vh, 0); v.root.add(grp);
    const ck = `case_${mod.w}x${mod.h}`;
    const cm = addPart(grp, ck, cache.get(ck), caseMat, caseLine); v.cases.push({ mesh: cm, row: mod.row });
    const dg = new THREE.Group(); grp.add(dg);
    const dm = addPart(dg, mod.drawer.key, cache.get(mod.drawer.key), drawerMat, drawerLine);
    if (clear) dm.renderOrder = 2;
    for (const x of mod.drawer.dividerX) {
      const h = new THREE.Group(); h.position.x = x; dg.add(h);
      const d = addPart(h, `divider_h${mod.h}`, cache.get(`divider_h${mod.h}`), drawerMat, drawerLine);
      if (clear) d.renderOrder = 2;
    }
    const id = `${mod.row}:${mod.col}`;
    const t = wasOpen.get(id) || 0;
    v.drawers.push({ id, group: dg, mesh: dm, travel, target: t, cur: t });
    dg.position.z = t * travel;
  }
  for (const pn of m.panels) {
    const grp = new THREE.Group(); grp.position.set(pn.x, pn.y * 1, 0); v.root.add(grp);
    addPart(grp, pn.key, cache.get(pn.key), caseMat, caseLine);
  }
  const y0 = -m.bottomH, y1 = m.unitsHigh * Vh + m.topT;
  const cx = (state.cols * U) / 2, cy = (y1 + y0) / 2, cz = (-p.depth + p.pull_depth) / 2;
  const newRadius = Math.hypot(state.cols * U + 2 * m.ext, y1 - y0, p.depth + p.pull_depth) / 2;
  const changed = Math.abs(newRadius - v.radius) > 1 || v.target.distanceTo(new THREE.Vector3(cx, cy, cz)) > v.radius * 2;
  v.target.set(cx, cy, cz);
  if (changed || !v.fitted) { v.radius = newRadius; v.fit(); v.fitted = true; }
  v.camera.near = Math.max(2, v.radius / 60); v.camera.far = v.radius * 40; v.camera.updateProjectionMatrix();
  buildDims(v);
  highlightRow(v.hlRow);
  v.invalidate(); syncOpenButton();
}

/**
 * Overall dimensions: thin lines just outside the wall's bounding box (width along the floor in
 * front, height up the front-left edge, depth along the floor on the right) and small labels.
 * Measured from the meshes with every drawer closed.
 */
function buildDims(v) {
  for (const d of v.drawers) d.group.position.z = 0;
  v.root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(v.root);
  for (const d of v.drawers) d.group.position.z = d.cur * d.travel;
  if (v.dims) { v.scene.remove(v.dims); v.dims.geometry.dispose(); }
  const { min: a, max: b } = box, off = Math.max(14, v.radius * 0.07), ext = off + 5, t = Math.max(2.5, v.radius * 0.012);
  const P = [];
  const seg = (x1, y1, z1, x2, y2, z2) => P.push(x1, y1, z1, x2, y2, z2);
  // width: on the floor in front
  const zw = b.z + off;
  seg(a.x, a.y, zw, b.x, a.y, zw); seg(a.x, a.y, b.z, a.x, a.y, b.z + ext); seg(b.x, a.y, b.z, b.x, a.y, b.z + ext);
  seg(a.x, a.y, zw - t, a.x, a.y, zw + t); seg(b.x, a.y, zw - t, b.x, a.y, zw + t);
  // height: up the front-left edge
  const xh = a.x - off;
  seg(xh, a.y, b.z, xh, b.y, b.z); seg(a.x, a.y, b.z, a.x - ext, a.y, b.z); seg(a.x, b.y, b.z, a.x - ext, b.y, b.z);
  seg(xh - t, a.y, b.z, xh + t, a.y, b.z); seg(xh - t, b.y, b.z, xh + t, b.y, b.z);
  // depth: along the floor on the right
  const xd = b.x + off;
  seg(xd, a.y, a.z, xd, a.y, b.z); seg(b.x, a.y, a.z, b.x + ext, a.y, a.z); seg(b.x, a.y, b.z, b.x + ext, a.y, b.z);
  seg(xd - t, a.y, a.z, xd + t, a.y, a.z); seg(xd - t, a.y, b.z, xd + t, a.y, b.z);
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  const ink = getComputedStyle(document.documentElement).getPropertyValue('--graphite').trim() || '#4a5866';
  v.dims = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: ink, transparent: true, opacity: 0.7 }));
  v.dims.visible = state.showDims;
  v.scene.add(v.dims);
  const size = new THREE.Vector3(); box.getSize(size);
  v.dimLabels = [
    { el: $('dim-w'), at: new THREE.Vector3((a.x + b.x) / 2, a.y, zw), text: `${fmt(size.x)} mm` },
    { el: $('dim-h'), at: new THREE.Vector3(xh, (a.y + b.y) / 2, b.z), text: `${fmt(size.y)} mm` },
    { el: $('dim-d'), at: new THREE.Vector3(xd, a.y, (a.z + b.z) / 2), text: `${fmt(size.z)} mm` },
  ];
  v.dimSize = [size.x, size.y, size.z];
  for (const L of v.dimLabels) L.el.textContent = L.text;
}
const _dimV = { x: 0, y: 0, z: 0 };
function placeDimLabels(v) {
  const show = !!(v.dims && state.showDims);
  $('dims').hidden = !show;
  if (!show) return;
  const w = v.canvas.clientWidth, h = v.canvas.clientHeight;
  for (const L of v.dimLabels) {
    const q = L.at.clone().project(v.camera);
    const off = q.z > 1 || Math.abs(q.x) > 1.1 || Math.abs(q.y) > 1.1;
    L.el.style.visibility = off ? 'hidden' : 'visible';
    L.el.style.transform = `translate(${((q.x + 1) / 2) * w}px, ${((1 - q.y) / 2) * h}px) translate(-50%, -50%)`;
  }
}
function syncDims() {
  const b = $('btn-dims'); b.setAttribute('aria-pressed', String(state.showDims));
  const t = state.showDims ? 'Hide dimensions' : 'Show dimensions';
  b.title = t; b.setAttribute('aria-label', t);
  if (view3d && view3d.dims) { view3d.dims.visible = state.showDims; view3d.invalidate(); }
}
function highlightRow(row) {
  const v = view3d; if (!v) return;
  v.hlRow = row;
  for (const c of v.cases) c.mesh.material = c.row === row ? v.hlMat : v.caseMat;
  for (const li of document.querySelectorAll('#rows .row')) li.classList.toggle('lit', +li.dataset.row === row);
  v.invalidate();
}
function syncOpenButton() {
  const v = view3d; if (!v) return;
  const any = v.drawers.some((d) => d.target > 0);
  const b = $('btn-open'), t = any ? 'Close all drawers' : 'Open all drawers';
  b.title = t; b.setAttribute('aria-label', t); b.setAttribute('aria-pressed', String(any));
  b.querySelector('use').setAttribute('href', any ? '#i-drawers-shut' : '#i-drawers-out');
}

// ---------------------------------------------------------------- UI
function stepper(id, label, value, text, canDown, canUp, hint = '') {
  return `<div class="field"><span class="field-label">${label}</span>
    <div class="stepper" role="group" aria-label="${esc(label)}">
      <button type="button" data-act="${id}" data-d="-1" data-fid="${id}-" ${canDown ? '' : 'disabled'} aria-label="Fewer: ${esc(label)}">${ICON('minus')}</button>
      <output>${text}</output>
      <button type="button" data-act="${id}" data-d="1" data-fid="${id}+" ${canUp ? '' : 'disabled'} aria-label="More: ${esc(label)}">${ICON('plus')}</button>
    </div>${hint ? `<span class="hint">${hint}</span>` : ''}</div>`;
}

/** Front view of one row: each drawer, its pull and its compartment walls, to scale. */
function rowSketch(p, r, widths, d) {
  const U = 10, H = 7 * r.h, W = state.cols * U, parts = [];
  let x = 0;
  for (const w of widths) {
    const across = Math.min(r.across, Kn.maxAcross(p, w, r.h)), x0 = x + 0.6, x1 = x + w * U - 0.6;
    parts.push(`<rect class="drawer" x="${x0}" y="0.6" width="${x1 - x0}" height="${H - 1.2}" rx="0.6"/>`);
    for (let k = 1; k < across; k++) { const xs = x0 + ((x1 - x0) * k) / across; parts.push(`<line class="wall" x1="${xs}" x2="${xs}" y1="2" y2="${H - 2}"/>`); }
    const cx = (x0 + x1) / 2; parts.push(`<rect class="pull" x="${cx - 3}" y="${H - 2.6}" width="6" height="1.2" rx="0.4"/>`);
    x += w * U;
  }
  const deep = d.deep > 1 ? `, ${d.deep} compartments front to back` : '';
  const label = `${widths.length} drawer${widths.length > 1 ? 's' : ''}, ${d.across} compartment${d.across > 1 ? 's' : ''} across${deep}`;
  return `<svg class="sketch" viewBox="0 0 ${W} ${H}" width="${state.cols * 18}" height="${r.h * 12.6}" role="img" aria-label="${label}">${parts.join('')}</svg>`;
}

/** Rows are stored top to bottom but shown, numbered and built from the bottom up. */
const rowNo = (ri) => state.rows.length - ri;

function renderRows(m) {
  const { p, mx } = m, U = p.unit_w, V = p.unit_h, n = state.rows.length;
  const maxM = Math.min(mx.w, state.cols), maxH = Math.min(3, mx.h), maxD = Kn.maxDeep(p);
  const order = [...state.rows.keys()];                  // top row first, as on the wall
  $('rows').innerHTML = order.map((i) => {
    const r = state.rows[i], k = rowNo(i);
    const widths = rowWidths(state.cols, r.m);
    const [X0, X1, Y0, Y1, Zf, Zr] = Kn.drawerBox(p, r.m, r.h);
    const d = drawerSpec(p, r.m, r.h, r);
    const inner = `${fmt(X1 - X0 - 2 * p.d_wall)} × ${fmt(Y1 - Y0 - p.d_floor)} × ${fmt(Zr - Zf - p.d_front - p.d_wall)}`;
    const rest = widths.length > 1 && widths[widths.length - 1] !== r.m ? ` plus one ${widths[widths.length - 1]} column${widths[widths.length - 1] > 1 ? 's' : ''} wide to fill the row` : '';
    const count = widths.filter((w) => w === r.m).length;
    const comp = d.across > 1 || d.deep > 1 ? ` Each compartment ${fmt(d.compW)} × ${fmt(d.compD)} mm.` : '';
    const hs = [1, 2, 3].filter((h) => h <= maxH).map((h) =>
      `<button type="button" data-act="h" data-i="${i}" data-v="${h}" data-fid="h${i}-${h}" aria-pressed="${r.h === h}" aria-label="${h} unit${h > 1 ? 's' : ''} high">${h}×</button>`).join('');
    const pos = k === 1 ? 'bottom' : k === n ? 'top' : '';
    const name = `row ${k}`;
    return `<li class="row" data-row="${i}" aria-label="Row ${k} of ${n}${pos ? `, ${pos}` : ''}">
      <div class="row-no" aria-hidden="true">${k}${pos ? `<small>${pos}</small>` : ''}</div>
      <div class="row-body">
        <div class="row-top">
          ${rowSketch(p, r, widths, d)}
          <span class="row-tools" role="group" aria-label="Arrange ${name}">
            <button type="button" class="icon-btn" data-act="up" data-i="${i}" data-fid="up${i}" ${i ? '' : 'disabled'} aria-label="Move ${name} up the wall" title="Move up the wall">${ICON('up')}</button>
            <button type="button" class="icon-btn" data-act="down" data-i="${i}" data-fid="down${i}" ${i < n - 1 ? '' : 'disabled'} aria-label="Move ${name} down the wall" title="Move down the wall">${ICON('down')}</button>
            <button type="button" class="icon-btn" data-act="copy" data-i="${i}" data-fid="copy${i}" ${n < LIMITS.rows ? '' : 'disabled'} aria-label="Duplicate ${name} above it" title="Duplicate above">${ICON('dup')}</button>
            <button type="button" class="icon-btn danger" data-act="del" data-i="${i}" data-fid="del${i}" ${n > 1 ? '' : 'disabled'} aria-label="Delete ${name}" title="Delete">${ICON('trash')}</button>
          </span>
        </div>
        <div class="pair">
          ${stepper(`m:${i}`, 'Drawer width', r.m, `${r.m} col${r.m > 1 ? 's' : ''}`, r.m > 1, r.m < maxM, `${fmt(r.m * U - p.gap)} mm`)}
          <div class="field"><span class="field-label" id="lh${i}">Height</span>
            <div class="seg compact" role="group" aria-labelledby="lh${i}">${hs}</div><span class="hint">${fmt(r.h * V - p.gap)} mm</span></div>
          ${stepper(`a:${i}`, 'Split across', r.across, r.across, r.across > 1, r.across < Kn.maxAcross(p, r.m, r.h))}
          ${state.style === 'removable' ? '' : stepper(`d:${i}`, 'Split front to back', r.deep, r.deep, r.deep > 1, r.deep < maxD)}
        </div>
        <p class="row-note">${count} drawer${count > 1 ? 's' : ''}${rest}. Inside ${inner} mm.${comp}</p>
      </div>
    </li>`;
  }).join('');
  $('add-row').disabled = n >= LIMITS.rows;
  renderWhere();
}

/** The small front view next to the rows: the whole wall, with the active row filled in. */
let activeRow = -1, focusRow = -1;
function renderWhere() {
  const n = state.rows.length, total = state.rows.reduce((a, r) => a + r.h, 0);
  const cw = 10, ch = 7, W = state.cols * cw, H = total * ch, parts = [];
  let y = H;
  for (let k = 1; k <= n; k++) {
    const ri = n - k, r = state.rows[ri], h = r.h * ch;
    y -= h;
    let x = 0; const cells = [];
    for (const w of rowWidths(state.cols, r.m)) { cells.push(`<rect class="cell" x="${x + 0.5}" y="${y + 0.5}" width="${w * cw - 1}" height="${h - 1}"/>`); x += w * cw; }
    parts.push(`<g data-row="${ri}" class="${ri === activeRow ? 'on' : ''}"><title>Row ${k}</title>${cells.join('')}</g>`);
  }
  parts.push(`<rect class="floor" x="-1" y="${H + 1}" width="${W + 2}" height="1.5"/>`);
  const el = $('elev');
  el.setAttribute('viewBox', `-1.5 -1.5 ${W + 3} ${H + 5}`);
  el.setAttribute('preserveAspectRatio', 'xMidYMax meet');
  el.innerHTML = parts.join('');
  $('where-text').innerHTML = activeRow >= 0 && activeRow < n
    ? `<b>Row ${rowNo(activeRow)} of ${n}</b>${rowNo(activeRow) === 1 ? 'the bottom row' : rowNo(activeRow) === n ? 'the top row' : `${rowNo(activeRow) - 1} below it, ${n - rowNo(activeRow)} above`}`
    : `<b>${n} row${n > 1 ? 's' : ''}</b>Point at or tab into a row to see where it sits. Row 1 is the bottom.`;
}
function setActiveRow(ri) {
  if (ri === activeRow) return;
  activeRow = ri;
  highlightRow(ri);
  for (const g of $('elev').querySelectorAll('g[data-row]')) g.classList.toggle('on', +g.dataset.row === ri);
  renderWhere();
}

function renderControls(m) {
  const { mx } = m;
  $('cols-out').textContent = state.cols;
  $('cols-hint').textContent = `${state.cols} × ${state.unit_w} mm = ${fmt(state.cols * state.unit_w)} mm of drawers, side to side`;
  $('cols-down').disabled = state.cols <= LIMITS.cols[0]; $('cols-up').disabled = state.cols >= LIMITS.cols[1];
  for (const b of document.querySelectorAll('[data-style]')) b.setAttribute('aria-pressed', String(b.dataset.style === state.style));
  $('style-note').textContent = state.style === 'removable'
    ? 'Drawers get slots and separate divider plates you can lift out. Dividers run front to back only.'
    : 'Partition walls are printed as part of the drawer, across and front to back.';
  const f = state.finish;
  for (const b of document.querySelectorAll('[data-fin]')) b.setAttribute('aria-pressed', String(String(f[b.dataset.fin]) === b.dataset.v));
  const topL = f.top === 'labeled', sideL = f.sides === 'labeled';
  $('labels-section').hidden = !topL && !sideL;
  $('lmode-each').textContent = topL && sideL ? 'Each column and row' : topL ? 'Each column' : 'Each row';
  $('tilt-field').hidden = !topL;
  const edge = [topL && Kn.panelEdge('top', 'labeled', { raised: f.lettering === 'raised', tilt: f.tilt }) && 'top',
    sideL && f.lettering === 'raised' && 'side'].filter(Boolean);
  $('label-print-hint').textContent = edge.length
    ? `Raised letters${f.tilt && topL ? ' and the tilted strip' : ''} can't print face down, so the labelled ${edge.join(' and ')} panel${edge.length > 1 ? 's' : ''} print standing on the front edge, ${fmt(Kn.panelT(m.p, 'labeled', null, { raised: true }))} mm thick.`
    : 'Pressed-in letters 0.6 mm deep. The panels print flat, face down.';
  renderLabelInputs(topL, sideL);
  $('legs-fields').hidden = f.bottom !== 'legs';
  $('rod-field').hidden = f.top !== 'structural' && f.sides !== 'structural';
  if (document.activeElement !== $('fin-rodD')) $('fin-rodD').value = f.rodD;
  $('rod-hint').textContent = `${f.rodShape === 'round' ? 'Diameter' : 'Width across the flats'}, ${Kn.ROD_MIN} to ${Kn.ROD_MAX} mm. Each channel is ${fmt(f.rodD + 2 * Kn.ROD_FIT)} mm${f.rodShape === 'square' ? ' square' : ''} (0.3 mm clearance), and two rods run through each structural panel, closed with printed end plugs. Cut lengths are in the parts list.`;
  for (const k of ['top', 'sides', 'bottom']) $(`pieces-${k}-field`).hidden = f[k] === 'none';
  $('leg-out').textContent = `${fmt(f.legH)} mm`; $('leg-down').disabled = f.legH <= 5; $('leg-up').disabled = f.legH >= 120;
  const sw = (list, cur, kind) => list.map(([name, hex]) =>
    `<button type="button" class="swatch${hex === 'clear' ? ' clear' : ''}" data-color="${kind}" data-v="${hex}" data-fid="${kind}${hex}" aria-pressed="${hex === cur}" aria-label="${name}" title="${name}" style="--sw:${hex === 'clear' ? 'transparent' : hex}"></button>`).join('');
  $('case-colors').innerHTML = sw(CASE_COLORS, state.caseColor, 'case');
  $('drawer-colors').innerHTML = sw(DRAWER_COLORS, state.drawerColor, 'drawer');
  for (const k of ['unit_w', 'unit_h', 'depth']) if (document.activeElement !== $(`adv-${k}`)) $(`adv-${k}`).value = state[k];
  const mat = MATERIALS[state.material], p = m.p, sgn = (o) => (o > 0 ? '+' : o < 0 ? '−' : '±') + Math.abs(o).toFixed(2);
  $('adv-material').value = state.material;
  $('material-hint').textContent = `Sets the starting clearances per side: rails ${mat.rail.toFixed(2)} mm, drawers ${mat.side.toFixed(2)} mm. Also used for the weight estimate.`;
  const opts = (sel, base, label) => { sel.innerHTML = OFFSETS.map((o) => `<option value="${o}">${o === 0 ? `Preset, ${base.toFixed(2)} mm` : `${sgn(o)} → ${(base + o).toFixed(2)} mm`}${label(o)}</option>`).join(''); };
  opts($('adv-railOffset'), mat.rail, (o) => ` (${Math.round(o / 0.05) + 3}-notch piece)`);
  opts($('adv-drawerOffset'), mat.side, (o) => (Math.abs(o) === 0.1 || o === 0 ? ` (${Math.round(o / 0.1) + 2}-notch slice)` : ''));
  $('adv-railOffset').value = String(state.railOffset); $('adv-drawerOffset').value = String(state.drawerOffset);
  $('rail-fit-hint').textContent = `These files use ${p.fit_dovetail.toFixed(2)} mm per side between rail and groove.`;
  $('drawer-fit-hint').textContent = `These files use ${p.fit_side.toFixed(2)} mm per side and ${p.fit_top.toFixed(2)} mm above each drawer.`;
  for (const b of document.querySelectorAll('[data-rails]')) b.setAttribute('aria-pressed', String(b.dataset.rails === state.rails));
  for (const b of document.querySelectorAll('[data-pull]')) b.setAttribute('aria-pressed', String(b.dataset.pull === state.pull));
  $('adv-note').textContent = `Largest module on a 256 mm printer at this size: ${mx.w} wide, ${Math.min(3, mx.h)} high.`;
}

let labelSig = '';
/** Text boxes for the labels: rebuilt only when their number changes, so typing keeps focus. */
function renderLabelInputs(topL, sideL) {
  const f = state.finish, each = f.labelMode === 'each', n = state.rows.length;
  const sig = JSON.stringify([topL, sideL, each, state.cols, n]);
  const box = $('label-inputs');
  if (sig !== labelSig) {
    labelSig = sig;
    const input = (id, label, max, ph = '') => `<input type="text" class="text" id="${id}" maxlength="${max}" autocomplete="off" aria-label="${label}" placeholder="${ph}">`;
    const html = [];
    if (!each) {
      if (topL) html.push(`<label class="field" for="lab-top"><span class="field-label">Top title</span>${input('lab-top', 'Top title', 24)}</label>`);
      if (sideL) html.push(`<div class="pair"><label class="field" for="lab-left"><span class="field-label">Left side title</span>${input('lab-left', 'Left side title', 24)}</label>
        <label class="field" for="lab-right"><span class="field-label">Right side title</span>${input('lab-right', 'Right side title', 24)}</label></div>`);
    } else {
      if (topL) html.push(`<div class="field"><span class="field-label">Top, one label per column, left to right</span><div class="label-grid cols">${
        Array.from({ length: state.cols }, (_, c) => input(`lab-col-${c}`, `Column ${c + 1} label`, 12, `Column ${c + 1}`)).join('')}</div></div>`);
      if (sideL) html.push(`<div class="field"><span class="field-label">Sides, one label per row</span><div class="label-grid"><span></span><span class="head">Left</span><span class="head">Right</span>${
        [...state.rows.keys()].map((ri) => `<span class="k">Row ${rowNo(ri)}</span>${input(`lab-l-${ri}`, `Row ${rowNo(ri)} left label`, 16)}${input(`lab-r-${ri}`, `Row ${rowNo(ri)} right label`, 16)}`).join('')}</div></div>`);
    }
    box.innerHTML = html.join('');
  }
  const set = (id, v) => { const el = $(id); if (el && document.activeElement !== el) el.value = v; };
  set('lab-top', f.topLabel); set('lab-left', f.leftLabel); set('lab-right', f.rightLabel);
  f.colLabels.forEach((v, c) => set(`lab-col-${c}`, v));
  state.rows.forEach((r, ri) => { set(`lab-l-${ri}`, r.labelL); set(`lab-r-${ri}`, r.labelR); });
}

function renderParts(m) {
  const kg = (g) => (g >= 1000 ? `${fmt(g / 1000, 2)} kg` : `${Math.round(g)} g`);
  $('stats').innerHTML = [
    [`${fmt(m.size[0])} × ${fmt(m.size[1])} × ${fmt(m.size[2])} mm`, 'width × height × depth'],
    [m.drawers, m.drawers === 1 ? 'drawer' : 'drawers'],
    [m.pieces, 'pieces to print'],
    [kg(m.grams), `of ${state.material}, estimated`],
  ].map(([v, l]) => `<div><dt>${l}</dt><dd>${v}</dd></div>`).join('');
  $('zip-label').innerHTML = `Download ${m.parts.length} <span class="zip-ext">part </span>files<span class="zip-ext"> (.zip)</span>`;
  $('parts-body').innerHTML = m.parts.map((d) => `<tr>
      <td><span class="dot ${d.kind === 'case' || d.kind === 'panel' || d.kind === 'plug' ? 'dot-case' : 'dot-drawer'}"></span>${esc(d.label)}<span class="file">${d.qty}x_${d.key}.stl</span></td>
      <td class="num qty" aria-label="Quantity ${d.qty}">${d.qty}</td>
      <td class="num" data-label="Print size">${fmt(d.size[0])} × ${fmt(d.size[1])} × ${fmt(d.size[2])} mm</td>
      <td class="num" data-label="Each">${Math.round(d.grams)} g</td>
      <td class="num" data-label="Total">${Math.round(d.grams * d.qty)} g</td></tr>`).join('');
  $('parts-foot').innerHTML = `<tr><td>Total</td><td class="num qty">${m.pieces}</td><td></td><td></td><td class="num" data-label="Weight">${Math.round(m.grams)} g</td></tr>`;
  const kp = $('kiri-part'), keep = kp.value;
  kp.innerHTML = `<option value="">All ${m.parts.length} parts, one of each</option>` + m.parts.map((d) => `<option value="${esc(d.key)}">${esc(d.label)} (print ${d.qty})</option>`).join('');
  kp.value = m.parts.some((d) => d.key === keep) ? keep : '';
  $('rods-wrap').hidden = !m.rods.length;
  $('rods-body').innerHTML = m.rods.map((r) => `<tr><td>${r.rod.label} (${r.where})</td><td class="num qty">${r.qty}</td><td class="num">${fmt(r.len)}</td></tr>`).join('');
  const cl = state.drawerColor === 'clear' ? 'clear' : 'drawer colour';
  $('by-color').textContent = `Casings, panels and legs: ${kg(m.gCase)}. Drawers and dividers (${cl}): ${kg(m.gDrawer)}. Weights assume solid walls and ${MATERIALS[state.material].rho} g/cm³; allow about 10% extra.`;
  document.documentElement.style.setProperty('--case-color', state.caseColor);
  document.documentElement.style.setProperty('--drawer-color', state.drawerColor === 'clear' ? '#dff3f7' : state.drawerColor);
}

function update() {
  const fid = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.fid : null;
  let m;
  try { m = compute(); } catch (err) { console.error(err); setStatus(`Could not generate this layout: ${err.message}`, 'bad'); return; }
  renderControls(m);
  const box = $('adv-errors');
  if (m.errors.length) { box.hidden = false; box.textContent = m.errors.join(' '); $('advanced').open = true; showTab('print'); setStatus('This unit size does not work. See 3 Print.', 'bad'); return; }
  box.hidden = true;
  model = m;
  renderRows(m); rebuildScene(m); syncDims();
  // the 3D view measures the real meshes (raised letters, tilted strip included): prefer that size
  if (view3d && view3d.dimSize) m.size = view3d.dimSize;
  renderParts(m);
  if (fid) { const el = document.querySelector(`[data-fid="${CSS.escape(fid)}"]`); if (el && !el.disabled) el.focus({ preventScroll: true }); }
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch { /* not saved; nothing depends on it */ }
}

let statusTimer = 0;
/** One message area for every action. `action` adds a button (e.g. Undo). Good news fades after 8 s. */
function setStatus(text, tone = '', action = null) {
  const el = $('status'); clearTimeout(statusTimer);
  el.textContent = text; el.dataset.tone = tone;
  if (action) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'btn'; b.textContent = action.label;
    b.onclick = () => { action.run(); }; el.append(' ', b);
  }
  if (text && tone !== 'bad') statusTimer = setTimeout(() => { if (el.textContent.startsWith(text)) { el.textContent = ''; el.dataset.tone = ''; } }, action ? 12000 : 8000);
}
let undoState = null, labelTimer = 0;
function undoable(message) {
  setStatus(message, '', { label: 'Undo', run: () => { if (!undoState) return; state = undoState; undoState = null; update(); setStatus('Undone.'); } });
}
/** Tabs: one panel at a time, arrow keys move between tabs. */
function showTab(name, focus = false) {
  for (const t of document.querySelectorAll('[role="tab"]')) {
    const on = t.id === `tab-${name}`;
    t.setAttribute('aria-selected', String(on)); t.tabIndex = on ? 0 : -1;
    $(t.getAttribute('aria-controls')).hidden = !on;
    if (on && focus) t.focus();
  }
  const c = document.querySelector('.controls'); if (c && c.scrollTop > 0) c.scrollTop = 0;
}

function bind() {
  $('cols-down').onclick = () => { state.cols--; update(); };
  $('cols-up').onclick = () => { state.cols++; update(); };
  $('add-row').onclick = () => {
    state.rows.unshift({ ...state.rows[0], labelL: '', labelR: '' }); update();
    const li = document.querySelector('#rows .row:first-child'); if (li) li.scrollIntoView({ block: 'nearest', behavior: REDUCED.matches ? 'auto' : 'smooth' });
    setActiveRow(0);
    setStatus(`Row ${state.rows.length} added on top, a copy of the row below it.`, 'good');
  };
  $('rows').addEventListener('click', (ev) => {
    const b = ev.target.closest('button[data-act]'); if (!b) return;
    const act = b.dataset.act, rows = state.rows;
    if (act.includes(':')) {
      const [f, i] = act.split(':'), r = rows[+i], d = +b.dataset.d;
      if (f === 'm') r.m += d; else if (f === 'a') r.across += d; else r.deep += d;
    } else {
      const i = +b.dataset.i;
      if (act === 'h') rows[i].h = +b.dataset.v;
      else if (act === 'up' && i > 0) [rows[i - 1], rows[i]] = [rows[i], rows[i - 1]];
      else if (act === 'down' && i < rows.length - 1) [rows[i + 1], rows[i]] = [rows[i], rows[i + 1]];
      else if (act === 'copy') rows.splice(i, 0, { ...rows[i] });
      else if (act === 'del' && rows.length > 1) { const k = rowNo(i); undoState = structuredClone(state); rows.splice(i, 1); activeRow = -1; update(); undoable(`Row ${k} deleted.`); return; }
    }
    update();
  });
  // the active row follows the pointer, and falls back to the row holding keyboard focus
  $('rows').addEventListener('pointerover', (ev) => { const c = ev.target.closest('.row'); if (c) setActiveRow(+c.dataset.row); });
  $('rows').addEventListener('pointerleave', () => setActiveRow(focusRow));
  $('rows').addEventListener('focusin', (ev) => { const c = ev.target.closest('.row'); focusRow = c ? +c.dataset.row : -1; setActiveRow(focusRow); });
  $('rows').addEventListener('focusout', (ev) => { if (!$('rows').contains(ev.relatedTarget)) { focusRow = -1; setActiveRow(-1); } });
  $('elev').addEventListener('click', (ev) => {
    const g = ev.target.closest('g[data-row]'); if (!g) return;
    const li = document.querySelector(`#rows .row[data-row="${g.dataset.row}"]`);
    if (li) { li.scrollIntoView({ block: 'center', behavior: REDUCED.matches ? 'auto' : 'smooth' }); li.querySelector('button:not(:disabled)')?.focus({ preventScroll: true }); }
  });
  $('label-inputs').addEventListener('input', (ev) => {
    // store every keystroke at once; only the rebuild waits for a pause in typing
    const id = ev.target.id, v = ev.target.value, f = state.finish;
    if (id === 'lab-top') f.topLabel = v; else if (id === 'lab-left') f.leftLabel = v; else if (id === 'lab-right') f.rightLabel = v;
    else if (id.startsWith('lab-col-')) f.colLabels[+id.slice(8)] = v;
    else if (id.startsWith('lab-l-')) state.rows[+id.slice(6)].labelL = v;
    else if (id.startsWith('lab-r-')) state.rows[+id.slice(6)].labelR = v;
    clearTimeout(labelTimer);
    labelTimer = setTimeout(update, 350);
  });
  $('fin-rodD').onchange = (e) => { state.finish.rodD = Number(e.target.value); update(); e.target.value = state.finish.rodD; };
  for (const b of document.querySelectorAll('[data-style]')) b.onclick = () => { state.style = b.dataset.style; update(); };
  for (const b of document.querySelectorAll('[data-fin]')) b.onclick = () => {
    const v = b.dataset.v; state.finish[b.dataset.fin] = v === 'true' ? true : v === 'false' ? false : v; update();
  };
  $('leg-down').onclick = () => { state.finish.legH -= 2.5; update(); };
  $('leg-up').onclick = () => { state.finish.legH += 2.5; update(); };
  document.addEventListener('click', (ev) => {
    const b = ev.target.closest('button[data-color]'); if (!b) return;
    state[b.dataset.color === 'case' ? 'caseColor' : 'drawerColor'] = b.dataset.v; update();
  });
  for (const k of ['unit_w', 'unit_h', 'depth']) $(`adv-${k}`).onchange = (e) => { state[k] = Number(e.target.value); update(); e.target.value = state[k]; };
  $('adv-railOffset').onchange = (e) => { state.railOffset = Number(e.target.value); update(); };
  $('adv-drawerOffset').onchange = (e) => { state.drawerOffset = Number(e.target.value); update(); };
  for (const b of document.querySelectorAll('[data-rails]')) b.onclick = () => { state.rails = b.dataset.rails; update(); };
  for (const b of document.querySelectorAll('[data-pull]')) b.onclick = () => { state.pull = b.dataset.pull; update(); };
  $('adv-material').onchange = (e) => { state.material = e.target.value; update(); };
  $('btn-reset').onclick = () => { undoState = structuredClone(state); state = EXAMPLE(); update(); if (view3d) view3d.fit(); showTab('layout'); undoable('Back to the example wall.'); };
  const tabs = [...document.querySelectorAll('[role="tab"]')], names = tabs.map((t) => t.id.slice(4));
  tabs.forEach((t, i) => {
    t.onclick = () => showTab(names[i]);
    t.onkeydown = (e) => {
      const k = { ArrowRight: 1, ArrowLeft: -1, Home: -i, End: tabs.length - 1 - i }[e.key];
      if (k === undefined) return; e.preventDefault(); showTab(names[(i + k + tabs.length) % tabs.length], true);
    };
  });
  for (const b of document.querySelectorAll('[data-goto]')) b.onclick = () => { showTab(b.dataset.goto, true); document.querySelector('.controls').scrollIntoView({ block: 'start', behavior: 'auto' }); };
  $('btn-open').onclick = () => { const v = view3d; if (!v) return; const any = v.drawers.some((d) => d.target > 0); for (const d of v.drawers) d.target = any ? 0 : 1; v.invalidate(); syncOpenButton(); };
  $('btn-view').onclick = () => { if (view3d) view3d.fit(); };
  $('btn-dims').onclick = () => { state.showDims = !state.showDims; syncDims(); try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch { /* not saved */ } };
  $('btn-zip').onclick = downloadZip;
  $('btn-copy').onclick = copyList;
  $('btn-kiri').onclick = () => openKiri($('kiri-part').value || null);
  $('kiri-close').onclick = () => $('kiri-dlg').close();
  $('kiri-resend').onclick = () => sendKiri();
}


// ---------------------------------------------------------------- Kiri:Moto
// Grid.Space's browser slicer, embedded in an iframe and driven through its frame
// message API ({clear}, {load: url}). Notes from testing the live site (v4.7.3):
// - {parse: data} never adds the part (its STL reader ignores the callback), so each
//   part goes as a data: URL through {load}; Kiri picks the reader from the
//   ".stl" in the URL, hence the name= parameter.
// - Kiri sends no reliable reply, and restores its last workspace while it starts,
//   so we wait a little after the frame loads, clear the bed, and on a cold start
//   send once more a few seconds later (clear + send again, so nothing doubles).
const KIRI = { url: 'https://grid.space/kiri/', origin: 'https://grid.space' };
let kiriJob = null, kiriFrame = null;

function stlDataUrl(name, bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return `data:application/octet-stream;name=${encodeURIComponent(name)}.stl;base64,${btoa(s)}`;
}

function openKiri(key) {
  if (!model) return;
  const parts = key ? model.parts.filter((d) => d.key === key) : model.parts;
  if (!parts.length) return;
  kiriJob = parts.map((d) => ({ label: d.label, url: stlDataUrl(`${d.qty}x_${d.key}`, Kn.stlBytes(d.entry.print)) }));
  $('kiri-what').textContent = key ? `· ${parts[0].label}`
    : `· one of each of the ${parts.length} parts (copy them in Kiri:Moto for the quantities in the parts list)`;
  const dlg = $('kiri-dlg'), fr = $('kiri-frame');
  if (!dlg.open) dlg.showModal();
  if (!kiriFrame) {
    kiriFrame = new Promise((res) => {
      fr.addEventListener('load', () => { setTimeout(res, 1200); setTimeout(() => sendKiri(), 4500); }, { once: true });
    });
    fr.src = KIRI.url;
    setStatus('Opening Kiri:Moto…');
  }
  kiriFrame.then(() => sendKiri());
}

function sendKiri() {
  const win = $('kiri-frame').contentWindow;
  if (!win || !kiriJob) return;
  win.postMessage({ clear: true }, KIRI.origin);
  for (const p of kiriJob) win.postMessage({ load: p.url }, KIRI.origin);
  setStatus(`Sent ${kiriJob.length === 1 ? kiriJob[0].label : `${kiriJob.length} parts`} to Kiri:Moto. If the bed stays empty, press Send again.`);
}

// ---------------------------------------------------------------- export
function partsText(m) {
  const lines = [`Drawer wall: ${state.cols} units wide, ${m.unitsHigh} units high (${fmt(m.size[0])} x ${fmt(m.size[1])} x ${fmt(m.size[2])} mm)`, ''];
  for (const d of m.parts) lines.push(`${String(d.qty).padStart(3)} x  ${d.label}  [${d.qty}x_${d.key}.stl]  ${Math.round(d.grams)} g each`);
  lines.push('', `${m.pieces} pieces, about ${Math.round(m.grams)} g of ${state.material}`);
  if (m.rods.length) { lines.push('', 'Rods to cut (not printed):'); for (const r of m.rods) lines.push(`${String(r.qty).padStart(3)} x  ${r.rod.label}, ${fmt(r.len)} mm long (${r.where})`); }
  return lines.join('\n');
}
async function copyList() {
  if (!model) return;
  try { await navigator.clipboard.writeText(partsText(model)); setStatus('Parts list copied.', 'good'); }
  catch { setStatus('Copying is blocked in this view. Select the table and copy it by hand.', 'bad'); }
}

function readme(m) {
  const p = m.p, rows = state.rows.map((r, i) => {
    const part = r.across > 1 || r.deep > 1 ? `, ${r.across}${state.style === 'removable' ? ' compartments with removable dividers' : ` x ${r.deep} printed-in compartments`}` : '';
    return `  Row ${i + 1}${i === 0 ? ' (top)' : ''}: drawers ${r.m} wide, ${r.h} high${part}`;
  });
  return `DRAWER WALL - PRINT FILES
Generated ${new Date().toISOString().slice(0, 10)} by the Drawer Wall Builder.

LAYOUT
  ${state.cols} units wide x ${m.unitsHigh} units high. One unit is ${p.unit_w} x ${p.unit_h} mm; casings are ${p.depth} mm deep.
  Overall size about ${fmt(m.size[0])} x ${fmt(m.size[1])} x ${fmt(m.size[2])} mm (width x height x depth).
${rows.join('\n')}

WHAT TO PRINT
${partsText(m).split('\n').slice(2).join('\n')}

  print/     one STL per part. The number in front of each file name is how many to print.
  assembly/  the whole wall as one model, for viewing. Do not print it.
  parts.csv  the same list as a spreadsheet.

PRINT SETTINGS
  The STL files are already in print orientation. Do not rotate or scale them.
  0.4 mm nozzle, 0.20 mm layers, 3 wall loops, 15% infill, no supports.
  Elephant's foot compensation 0.15 mm. Filament: ${MATERIALS[state.material].label}${state.material === 'ABS' ? ' (enclosure and a brim)' : ''}.
  Casings stand on their front face. Drawers print floor-down. Plates print flat.

FIT TEST KIT
  Not sure about the clearances? Print the fit test kit first (about 100 g):
  ${KIT_URL}
  These files use ${p.fit_dovetail.toFixed(2)} mm (rails) and ${p.fit_side.toFixed(2)} mm (drawers) per side.
FINISH
  Top: ${state.finish.top}. Sides: ${state.finish.sides}. Bottom: ${state.finish.bottom}${state.finish.bottom === 'legs' ? ` (${state.finish.legStyle} legs, ${state.finish.legH} mm)` : ''}.
  Panels lock on like casings: the top and right panels slide on from the front and click;
  the base and the left panel are rail faces the casings slide along.
  Top and bottom panels reach over the side panels, so fit the side panels first.
  Thin panels print flat with their show face on the bed. Structural panels and leg bases
  stand on their front edge. Do not rotate them.${m.rods.length ? `
  Structural panels: cut the rods to length (below), slide them into the channels and push
  a printed end plug into each channel end. Steel, aluminium or hardwood dowel all work.
${m.rods.map((r) => `    ${r.qty} x ${r.rod.label}, ${fmt(r.len)} mm (${r.where})`).join('\n')}` : ''}

ASSEMBLY
  1. Lay the base plates side by side, then slide the left side panel onto the casings' left
     grooves as you build the first column.
  2. Build from the bottom up and from left to right. Slide each EMPTY casing in
     from the front along the rails below and to its left until it clicks.
  3. Put the drawers in last. Each clicks once as it passes the stop.
  4. To take a casing out, remove its drawer and the drawers directly above and to
     its right, then pull it straight forward.
  Seen from the front, rails are on the top and right faces, grooves on the bottom and left.

Full build guide: ${GUIDE_URL}

SETTINGS USED
${JSON.stringify(state, null, 1)}
`;
}

async function saveFile(filename, bytes) {
  let dl = null;
  if (window.claude && typeof window.claude.use === 'function') { try { dl = await window.claude.use('downloads'); } catch { dl = null; } }
  if (dl) {
    try { await dl.save({ filename, data: new Blob([bytes]) }); return 'saved'; }
    catch (e) {
      if (e && e.code === 'declined') return 'declined';
      if (e && e.code === 'rate_limited') return 'busy';
      if (!e || !['unavailable', 'not_granted', 'capability_disabled', 'capability_removed'].includes(e.code)) throw e;
    }
  }
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/zip' }));
  const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return 'started';
}

let fflate = null;
/** Build the ZIP as { name: bytes }.  Exposed for testing. */
function zipEntries(m) {
  const p = m.p, files = {};
  for (const d of m.parts) files[`print/${d.qty}x_${d.key}.stl`] = Kn.stlBytes(d.entry.print);
  // assembled wall, z up, front facing -y
  const U = p.unit_w, V = p.unit_h, list = [];
  const at = (mesh, x, y) => ({ ...mesh, matrix: [1, 0, 0, x, 0, 0, -1, 0, 0, 1, 0, y] });
  for (const mod of m.modules) {
    list.push(at(cache.get(`case_${mod.w}x${mod.h}`).mesh, mod.col * U, mod.y * V));
    list.push(at(cache.get(mod.drawer.key).mesh, mod.col * U, mod.y * V));
    for (const x of mod.drawer.dividerX) list.push(at(cache.get(`divider_h${mod.h}`).mesh, mod.col * U + x, mod.y * V));
  }
  for (const pn of m.panels) list.push(at(cache.get(pn.key).mesh, pn.x, pn.y));
  files['assembly/drawer_wall_assembled.stl'] = Kn.stlBytes(list);
  const csv = ['part,file,quantity,print_x_mm,print_y_mm,print_z_mm,grams_each,grams_total'];
  for (const d of m.parts) csv.push([`"${d.label}"`, `${d.qty}x_${d.key}.stl`, d.qty, ...d.size.map((s) => fmt(s)), Math.round(d.grams), Math.round(d.grams * d.qty)].join(','));
  const enc = new TextEncoder();
  files['parts.csv'] = enc.encode(csv.join('\n') + '\n');
  files['README.txt'] = enc.encode(readme(m));
  return files;
}
async function downloadZip() {
  if (!model) return;
  const btn = $('btn-zip'); btn.disabled = true; setStatus('Building the ZIP…');
  await new Promise((r) => setTimeout(r, 30));
  try {
    if (!fflate) fflate = await import(CDN.fflate);
    const files = zipEntries(model), tree = {};
    for (const [k, v] of Object.entries(files)) tree[`drawer-wall/${k}`] = [v, { level: 6 }];
    const zip = fflate.zipSync(tree);
    const name = `drawer-wall-${state.cols}x${model.unitsHigh}.zip`;
    const res = await saveFile(name, zip);
    const n = Object.keys(files).filter((k) => k.endsWith('.stl')).length;
    setStatus(res === 'declined' ? 'Download cancelled.' : res === 'busy' ? 'A download prompt is already open.'
      : `${name}: ${n} STL files, ${fmt(zip.length / 1048576, 1)} MB.`, res === 'saved' || res === 'started' ? 'good' : '');
  } catch (err) {
    console.error(err);
    setStatus(`The ZIP could not be made: ${err && err.message ? err.message : err}`, 'bad');
  }
  btn.disabled = false;
}

// ---------------------------------------------------------------- start
async function start() {
  try {
    const [three, mf] = await Promise.all([import(CDN.three), import(CDN.manifold)]);
    THREE = three;
    const bin = Uint8Array.from(atob(WASM_B64), (c) => c.charCodeAt(0));
    const M = await mf.default({ wasmBinary: bin.buffer, locateFile: () => 'manifold.wasm' });
    M.setup();
    K = Kn.createKernel(M);
  } catch (err) {
    console.error(err);
    $('loading').textContent = 'The 3D engine could not load. Check your connection and reload the page.';
    $('loading').dataset.tone = 'bad';
    return;
  }
  view3d = initView();
  if (!view3d) { $('view-wrap').classList.add('no-gl'); $('view-hint').textContent = 'This browser cannot show the 3D preview. The parts list and download still work.'; }
  bind();
  update();
  $('loading').hidden = true;
  document.body.classList.add('ready');
  if (view3d) view3d.resize();
  window.__wall = { dims: () => view3d && view3d.dimSize, state: () => state, model: () => model, zipEntries: () => zipEntries(model), setState: (s) => { state = { ...state, ...s }; update(); } };
}
start();
