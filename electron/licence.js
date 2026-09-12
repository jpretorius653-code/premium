// ============================================================
//  ISS Weighbridge — licensing (main process)            v10
//
//  What changed and why
//  · Before 10.0 every check lived in the renderer: salted SHA-256 of short
//    codes, shared by every site. Anyone with the code could complete an
//    install on any PC, and anyone who could drop a file into the UI override
//    folder could remove the checks altogether.
//  · A licence is now a small signed statement — site, plan, bridges, and the
//    Windows MachineGuid it was issued for — signed with an Ed25519 key that
//    only ever lives on the vendor's own PC (tools/iss-licence.mjs). This
//    file holds the PUBLIC half only. A licence copied to another PC fails
//    the machine check; an edited one fails the signature.
//  · UI overrides must carry a matching signature (index.html.sig) once a
//    public key is present, so the hot-swap folder stops being a way around
//    the licence.
//
//  Safe rollout: with no public key in electron/licence-key.pub.pem the app
//  runs in "legacy" mode, exactly as 9.9.x did. Nothing on site changes until
//  the key is generated and a build ships with it.
// ============================================================
'use strict';
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const PUBKEY_FILE = path.join(__dirname, 'licence-key.pub.pem');
const PREFIX = 'ISS1';

let _pub = null, _pubLoaded = false, _machine = null;

function publicKey() {
  if (_pubLoaded) return _pub;
  _pubLoaded = true;
  try {
    const pem = fs.readFileSync(PUBKEY_FILE, 'utf8');
    if (/BEGIN PUBLIC KEY/.test(pem)) _pub = crypto.createPublicKey(pem);
  } catch (_) { _pub = null; }
  return _pub;
}
function mode() { return publicKey() ? 'signed' : 'legacy'; }

const b64u = {
  enc: (buf) => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
  dec: (s) => Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64'),
};

// ── machine identity ───────────────────────────────────────────────────────
// Windows MachineGuid survives app reinstalls and user changes, and changes
// when Windows is reinstalled — which is the right moment to re-licence.
function rawMachineGuid() {
  if (process.platform === 'win32') {
    try {
      const out = execFileSync('reg', ['query', 'HKLM\\SOFTWARE\\Microsoft\\Cryptography', '/v', 'MachineGuid'],
        { encoding: 'utf8', windowsHide: true, timeout: 4000 });
      const m = out.match(/MachineGuid\s+REG_SZ\s+([0-9a-f-]{36})/i);
      if (m) return m[1].toLowerCase();
    } catch (_) {}
  }
  // fallback: host name + first physical MAC (dev machines, Linux CI)
  const nets = os.networkInterfaces();
  const mac = Object.values(nets).flat().find((n) => n && !n.internal && n.mac && n.mac !== '00:00:00:00:00:00');
  return os.hostname() + '|' + (mac ? mac.mac : 'nomac');
}
const B32 = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // no 0/O/1/I — read over the phone
function machineId() {
  if (_machine) return _machine;
  const h = crypto.createHash('sha256').update('ISS-WB-MACHINE|' + rawMachineGuid()).digest();
  let s = '';
  for (let i = 0; i < 16; i++) s += B32[h[i] % 32];
  _machine = s.match(/.{4}/g).join('-');
  return _machine;
}

// ── licences ───────────────────────────────────────────────────────────────
function parse(code) {
  const parts = String(code || '').trim().split('.');
  if (parts.length !== 3 || parts[0] !== PREFIX) return { ok: false, reason: 'Not a licence key' };
  let payload;
  try { payload = JSON.parse(b64u.dec(parts[1]).toString('utf8')); }
  catch (_) { return { ok: false, reason: 'Licence key is damaged' }; }
  return { ok: true, payload, signed: parts[0] + '.' + parts[1], sig: b64u.dec(parts[2]) };
}

function verify(code) {
  const key = publicKey();
  if (!key) return { ok: false, reason: 'This build has no licence key — legacy codes apply' };
  const p = parse(code);
  if (!p.ok) return p;
  let good = false;
  try { good = crypto.verify(null, Buffer.from(p.signed, 'utf8'), key, p.sig); } catch (_) {}
  if (!good) return { ok: false, reason: 'Licence signature is not valid' };
  const L = p.payload;
  if (L.machine !== machineId()) return { ok: false, reason: 'Licence was issued for another PC (' + L.machine + ')', licence: L };
  if (L.expires && Date.now() > new Date(L.expires + 'T23:59:59').getTime())
    return { ok: false, reason: 'Licence expired on ' + L.expires, licence: L };
  return { ok: true, licence: L };
}

class Licence {
  constructor(userData) { this.file = path.join(userData, 'licence.json'); }
  _read() { try { return JSON.parse(fs.readFileSync(this.file, 'utf8')); } catch (_) { return null; } }
  status() {
    const stored = this._read();
    const base = { mode: mode(), machine: machineId() };
    if (!stored || !stored.code) return Object.assign(base, { valid: false, reason: 'No licence installed' });
    const v = verify(stored.code);
    return Object.assign(base, { valid: v.ok, reason: v.reason || '', licence: v.licence || null });
  }
  apply(code, atomicWrite) {
    const v = verify(code);
    if (!v.ok) return Object.assign({ mode: mode(), machine: machineId(), valid: false }, v);
    atomicWrite(this.file, JSON.stringify({ code: String(code).trim(), appliedAt: new Date().toISOString() }, null, 2));
    return this.status();
  }
}

// ── signed UI overrides ────────────────────────────────────────────────────
// index.html.sig = base64 Ed25519 signature over the exact bytes of index.html
function overrideAllowed(htmlPath) {
  const key = publicKey();
  if (!key) return { ok: true, why: 'legacy mode (no public key)' };
  try {
    const sig = Buffer.from(fs.readFileSync(htmlPath + '.sig', 'utf8').trim(), 'base64');
    const ok = crypto.verify(null, fs.readFileSync(htmlPath), key, sig);
    return ok ? { ok: true, why: 'signature valid' } : { ok: false, why: 'signature does not match this file' };
  } catch (e) {
    return { ok: false, why: fs.existsSync(htmlPath + '.sig') ? 'unreadable signature' : 'no index.html.sig next to it' };
  }
}

module.exports = { Licence, machineId, mode, verify, overrideAllowed, parse, b64u, PREFIX };
