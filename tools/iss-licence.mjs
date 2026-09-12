#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════════
//  ISS Weighbridge — licence tool  (runs on the VENDOR's PC only)
//
//    node tools/iss-licence.mjs keygen
//        Creates the signing key pair ONCE. The private key goes to
//        %USERPROFILE%\.iss-licence\private.pem (never into the repo); the
//        public key is written to electron/licence-key.pub.pem, which IS
//        committed. Builds made after this run in "signed" mode.
//
//    node tools/iss-licence.mjs issue --machine ABCD-EFGH-JKLM-NPQR --site hillside
//                                     [--tier basic|premium] [--bridges 1|2] [--expires 2027-12-31]
//        Prints a licence key for one PC. The machine ID is shown on the
//        activation screen and in Help → About.
//
//    node tools/iss-licence.mjs sign-ui path\to\index.html
//        Writes index.html.sig so a signed build will accept that file from
//        the UI override folder.
//
//    node tools/iss-licence.mjs show ISS1.xxxxx.yyyyy
//        Decodes a key and checks its signature against the public key.
//
//  Lose the private key and you can no longer issue licences for builds that
//  carry its public key: back it up somewhere offline. Leak it and anyone can
//  issue licences: never commit it, never paste it into a chat or CI secret.
// ════════════════════════════════════════════════════════════════════════════
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUB = path.join(ROOT, 'electron', 'licence-key.pub.pem');
const PRIV = process.env.ISS_LICENCE_KEY || path.join(os.homedir(), '.iss-licence', 'private.pem');
const b64u = (buf) => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = (s) => Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64');

const [cmd, ...rest] = process.argv.slice(2);
const arg = (k, d) => { const i = rest.indexOf('--' + k); return i >= 0 ? rest[i + 1] : d; };
const die = (m) => { console.error('✗ ' + m); process.exit(1); };
const privKey = () => {
  if (!fs.existsSync(PRIV)) die(`No private key at ${PRIV}. Run "keygen" first (or set ISS_LICENCE_KEY).`);
  return crypto.createPrivateKey(fs.readFileSync(PRIV, 'utf8'));
};

if (cmd === 'keygen') {
  if (fs.existsSync(PRIV)) die(`A private key already exists at ${PRIV}. Refusing to overwrite it — every licence issued with it would stop verifying in new builds.`);
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  fs.mkdirSync(path.dirname(PRIV), { recursive: true });
  fs.writeFileSync(PRIV, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
  fs.writeFileSync(PUB, publicKey.export({ type: 'spki', format: 'pem' }));
  console.log(`✓ private key → ${PRIV}   (back this up offline; never commit it)`);
  console.log(`✓ public key  → ${path.relative(ROOT, PUB)}   (commit this; builds are now "signed")`);
} else if (cmd === 'issue') {
  const machine = String(arg('machine', '')).toUpperCase().trim();
  const site = String(arg('site', '')).toLowerCase().trim();
  if (!/^[A-Z2-9]{4}(-[A-Z2-9]{4}){3}$/.test(machine)) die('--machine must look like ABCD-EFGH-JKLM-NPQR (from the activation screen)');
  if (!/^[a-z0-9_-]{2,40}$/.test(site)) die('--site must be the site code, e.g. hillside');
  const tier = arg('tier', 'basic');
  if (!['basic', 'premium'].includes(tier)) die('--tier is basic or premium');
  const expires = arg('expires', '');
  if (expires && !/^\d{4}-\d{2}-\d{2}$/.test(expires)) die('--expires is YYYY-MM-DD');
  const payload = { v: 1, site, tier, bridges: parseInt(arg('bridges', tier === 'premium' ? '2' : '1'), 10),
    machine, issued: new Date().toISOString().slice(0, 10), ...(expires ? { expires } : {}) };
  const signed = 'ISS1.' + b64u(JSON.stringify(payload));
  const sig = crypto.sign(null, Buffer.from(signed, 'utf8'), privKey());
  console.log(signed + '.' + b64u(sig));
} else if (cmd === 'sign-ui') {
  const file = rest[0];
  if (!file || !fs.existsSync(file)) die('sign-ui needs the path to an index.html');
  const sig = crypto.sign(null, fs.readFileSync(file), privKey());
  fs.writeFileSync(file + '.sig', sig.toString('base64') + '\n');
  console.log(`✓ ${file}.sig — copy BOTH files into the override folder`);
} else if (cmd === 'show') {
  const parts = String(rest[0] || '').split('.');
  if (parts.length !== 3 || parts[0] !== 'ISS1') die('Not an ISS1 licence key');
  console.log(JSON.parse(unb64u(parts[1]).toString('utf8')));
  if (fs.existsSync(PUB)) {
    const ok = crypto.verify(null, Buffer.from(parts[0] + '.' + parts[1]), crypto.createPublicKey(fs.readFileSync(PUB, 'utf8')), unb64u(parts[2]));
    console.log(ok ? '✓ signature valid for this repo\'s public key' : '✗ signature does NOT match this repo\'s public key');
  }
} else {
  console.log('usage: node tools/iss-licence.mjs keygen | issue --machine … --site … [--tier] [--bridges] [--expires] | sign-ui <index.html> | show <key>');
  process.exit(cmd ? 1 : 0);
}
