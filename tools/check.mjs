#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════════
//  Pre-build / pre-commit checks. Fails loudly on the mistakes that have
//  actually happened on this project:
//    · renderer/index.html older than the source or with a stale build stamp
//    · main-process files that do not parse (black window on site)
//    · a private key or a Supabase secret key committed to the repo
//    · another brand's name leaking into a build
//
//    node tools/check.mjs [--brand iss]
// ════════════════════════════════════════════════════════════════════════════
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const brand = (() => { const i = args.indexOf('--brand'); return i >= 0 ? args[i + 1] : 'iss'; })();
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const problems = [];
const walk = (d, out = []) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (['node_modules', 'dist', '.git'].includes(e.name)) continue;
    const p = path.join(d, e.name);
    e.isDirectory() ? walk(p, out) : out.push(p);
  }
  return out;
};

// 1 · built renderer is current
const html = fs.readFileSync(path.join(ROOT, 'renderer', 'index.html'), 'utf8');
const stamp = (html.match(/const RENDERER_BUILD='([^']*)'/) || [])[1];
if (stamp !== pkg.version) problems.push(`renderer/index.html is build ${stamp}, package.json is ${pkg.version} — run npm run build:renderer`);
const built = fs.statSync(path.join(ROOT, 'renderer', 'index.html')).mtimeMs;
const newer = walk(path.join(ROOT, 'renderer', 'src')).concat(walk(path.join(ROOT, 'renderer', 'brands')))
  .filter((f) => fs.statSync(f).mtimeMs > built + 1000);
if (newer.length) problems.push(`renderer source changed after index.html was built (${path.relative(ROOT, newer[0])}…) — rebuild`);
const brandId = (html.match(/const BRAND=Object\.freeze\(\{"id":"([^"]+)"/) || [])[1];
if (brandId !== brand) problems.push(`renderer/index.html was built for brand "${brandId}", expected "${brand}"`);

// 2 · every script parses
for (const f of fs.readdirSync(path.join(ROOT, 'electron')).filter((f) => f.endsWith('.js'))) {
  const r = spawnSync(process.execPath, ['--check', path.join(ROOT, 'electron', f)], { encoding: 'utf8' });
  if (r.status !== 0) problems.push(`electron/${f} does not parse: ${r.stderr.split('\n').slice(0, 4).join(' ')}`);
}
const blocks = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
blocks.forEach((b, i) => { try { new vm.Script(b); } catch (e) { problems.push(`renderer script block ${i + 1}: ${e.message}`); } });

// 3 · secrets
for (const f of walk(ROOT)) {
  const rel = path.relative(ROOT, f).replace(/\\/g, '/');
  if (/\.(png|jpg|ico|exe|zip)$/i.test(rel)) continue;
  const s = fs.readFileSync(f, 'utf8');
  if (/BEGIN (ED25519 |EC |RSA )?PRIVATE KEY/.test(s)) problems.push(`${rel} contains a PRIVATE KEY — remove it and rotate the key`);
  if (/\bsb_secret_[A-Za-z0-9_-]{10,}/.test(s) || /"role"\s*:\s*"service_role"/.test(s)) problems.push(`${rel} contains a Supabase secret/service key`);
}

// 4 · brand leakage
const packs = fs.readdirSync(path.join(ROOT, 'renderer', 'brands'));
const others = packs.filter((b) => b !== brand)
  .map((b) => JSON.parse(fs.readFileSync(path.join(ROOT, 'renderer', 'brands', b, 'brand.json'), 'utf8')))
  .flatMap((b) => [b.vendor, b.vendorShort]).filter((v) => v && v.length > 3);
const visible = html.replace(/const KNOWN_BRAND_DEFAULTS=\[[^\]]*\]/, '').replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, '');
for (const o of others) if (visible.includes(o)) problems.push(`the ${brand} build still mentions "${o}"`);

if (problems.length) { console.error('✗ check failed\n  · ' + problems.join('\n  · ')); process.exit(1); }
console.log(`✓ checks passed · ${pkg.version} · brand ${brand}`);
