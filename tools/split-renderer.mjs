#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════════
//  Turn a BUILT index.html back into renderer/src modules.
//  For when all you have is a renderer copied off a site PC.
//
//    node tools/split-renderer.mjs path/to/index.html [--out renderer/src]
//
//  Needs a v10+ build (made with module banners). Brand-pack and generated
//  token blocks are skipped: they come from renderer/brands.
// ════════════════════════════════════════════════════════════════════════════
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [file, ...rest] = process.argv.slice(2);
const outDir = path.resolve(ROOT, rest[rest.indexOf('--out') + 1] && rest.includes('--out') ? rest[rest.indexOf('--out') + 1] : 'renderer/src');
if (!file) { console.error('usage: node tools/split-renderer.mjs <index.html> [--out dir]'); process.exit(1); }
const html = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
if (!html.includes('/*@module ')) { console.error('✗ no module banners — this renderer predates v10'); process.exit(1); }

const written = [];
const put = (rel, text) => {
  if (rel.includes('(generated)')) return;
  const p = path.join(outDir, rel); fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, text); written.push(rel);
};
// app modules carry start and end banners
for (const m of html.matchAll(/\/\*@module ([^*]+?) \*\/\n([\s\S]*?)\/\*@end \1 \*\/\n/g)) put(m[1], m[2]);
// stylesheets carry a start banner only; each runs to the next banner or </style>
const css = html.slice(html.indexOf('<style>') + 8, html.indexOf('</style>'));
const parts = css.split(/\/\*@module ([^*]+?) \*\/\n/);
for (let i = 1; i < parts.length; i += 2) put(parts[i], parts[i + 1]);
const app = written.filter((f) => f.startsWith('app/'));
const styles = written.filter((f) => f.startsWith('styles/'));
const manifestPath = path.join(outDir, 'manifest.json');
const prev = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : {};
fs.writeFileSync(manifestPath, JSON.stringify({ ...prev, styles, app, vendor: prev.vendor || ['vendor/qrcode.js'], brands: true }, null, 2) + '\n');
console.log(`✓ ${written.length} modules → ${path.relative(ROOT, outDir)} (template and vendor files are kept as they are)`);
