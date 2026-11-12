// Assemble the builder page: template + geometry kernel + app + embedded WASM and fonts.
//   node build.mjs [--out ../index.html] [--guide docs/build-guide.html]
// The defaults build the GitHub Pages site: index.html at the repository root, linking to the
// build guide in docs/. Pass an absolute --guide URL when the page is hosted elsewhere.
import fs from 'node:fs';
import path from 'node:path';
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const OUT = arg('--out', '../index.html'), GUIDE = arg('--guide', 'docs/build-guide.html');
const tpl = fs.readFileSync('src/template.html', 'utf8');
let kernel = fs.readFileSync('kernel.js', 'utf8');
const names = [...kernel.matchAll(/^export (?:const|function) (\w+)/gm)].map((m) => m[1]);
kernel = kernel.replace(/^export /gm, '');
const wrapped = `const Kn = (() => {\n${kernel}\nreturn { ${names.join(', ')} };\n})();`;
const app = fs.readFileSync('src/app.js', 'utf8').replaceAll('__GUIDE_URL__', GUIDE);
const wasm = fs.readFileSync('node_modules/manifold-3d/manifold.wasm').toString('base64');
for (const [n, t] of [['kernel', wrapped], ['app', app]]) if (/<\/script/i.test(t)) throw new Error(`${n} contains a closing script tag`);
// fonts are embedded (SIL Open Font License): no third-party request, no swap on load
const font = (f) => `url(data:font/woff2;base64,${fs.readFileSync('fonts/' + f).toString('base64')}) format("woff2")`;
const fonts = `@font-face { font-family: "Barlow Condensed"; font-weight: 600; font-display: swap; src: ${font('barlow-condensed-latin-600-normal.woff2')}; }
@font-face { font-family: "Barlow Condensed"; font-weight: 700; font-display: swap; src: ${font('barlow-condensed-latin-700-normal.woff2')}; }
@font-face { font-family: "Source Sans 3"; font-weight: 200 900; font-display: swap; src: ${font('source-sans-3-latin-wght-normal.woff2')}; }`;
const html = tpl.replaceAll('__GUIDE_URL__', GUIDE).replace('/*__FONTS__*/', () => fonts).replace('__WASM_B64__', () => wasm).replace('/*__KERNEL__*/', () => wrapped).replace('/*__APP__*/', () => app);
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, html);
console.log(OUT, (html.length / 1024).toFixed(0), 'KB; kernel exports:', names.length, '; guide:', GUIDE);
