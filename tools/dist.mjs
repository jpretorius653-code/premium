#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════════
//  Windows installer for one brand.
//
//    node tools/dist.mjs                   → dist/ISS-Weighbridge-Setup-<version>.exe
//    node tools/dist.mjs --brand promnatic → dist/Promnatic-Weighbridge-Setup-<version>.exe
//
//  1. builds renderer/index.html with the brand pack
//  2. puts the brand's icon at build/icon.png
//  3. runs electron-builder with the brand's product name and app id
//
//  productName decides the %APPDATA% folder. storage.js adopts config and
//  state from every name this app has shipped under, so a PC moving between
//  names keeps its activation, users, tickets and paired COM ports.
// ════════════════════════════════════════════════════════════════════════════
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const brand = (() => { const i = args.indexOf('--brand'); return i >= 0 ? args[i + 1] : 'iss'; })();
const dir = path.join(ROOT, 'renderer', 'brands', brand);
if (!fs.existsSync(path.join(dir, 'brand.json'))) { console.error(`✗ no brand pack "${brand}"`); process.exit(1); }
const B = JSON.parse(fs.readFileSync(path.join(dir, 'brand.json'), 'utf8'));

// On Windows npx is a .cmd file, so the call has to go through the shell — and
// the shell splits on spaces. "ISS Weighbridge" arrived at electron-builder as
// two arguments ("Unknown arguments: Weighbridge"). Quote anything with a space.
const WIN = process.platform === 'win32';
const q = (x) => (WIN && /[\s&()^|<>]/.test(x) ? `"${x}"` : x);
const run = (cmd, a) => {
  const r = spawnSync(q(cmd), a.map(q), { cwd: ROOT, stdio: 'inherit', shell: WIN });
  if (r.status !== 0) process.exit(r.status || 1);
};

run(process.execPath, [path.join('tools', 'build-renderer.mjs'), '--brand', brand]);
run(process.execPath, [path.join('tools', 'check.mjs'), '--brand', brand]);

const icon = ['png'].map((e) => path.join(dir, 'icon.' + e)).find((p) => fs.existsSync(p));
if (icon) fs.copyFileSync(icon, path.join(ROOT, 'build', 'icon.png'));

const artifact = B.appName.replace(/[^A-Za-z0-9]+/g, '-') + '-Setup-${version}.${ext}';
run('npx', ['electron-builder', '--win', 'nsis', '--x64', '--publish', 'never',
  `-c.productName=${B.appName}`, `-c.appId=${B.appId}`, `-c.artifactName=${artifact}`,
  `-c.nsis.shortcutName=${B.appName}`, `-c.extraMetadata.productName=${B.appName}`]);
console.log(`✓ ${B.appName} installer in dist/`);
