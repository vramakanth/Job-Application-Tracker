/**
 * e2e.test.js — End-to-end simulation of the zero-knowledge encryption
 * lifecycle. Exercises real WebCrypto primitives the browser uses, and
 * mirrors the server's state transitions in plain JS (no Express needed —
 * the sandbox can't install deps, but we can validate the protocol).
 *
 * Walks the full lifecycle: register → login → jobs round-trip →
 * change password → recover → regenerate codes. If any step breaks the
 * dataKey chain, users lose access to their jobs — this catches that.
 */

'use strict';
const { webcrypto } = require('crypto');
const subtle = webcrypto.subtle;

let passed = 0, failed = 0;
async function t(name, fn) {
  try { await fn(); console.log(' ✓', name); passed++; }
  catch (e) { console.log(' ✗', name, '—', e.message); failed++; }
}

// Mirror CryptoEngine exactly (same PBKDF2 params as index.html)
const b64e = buf => Buffer.from(buf).toString('base64');
const b64d = s   => Uint8Array.from(Buffer.from(s, 'base64'));
async function deriveKey(password, salt) {
  const raw = await subtle.importKey('raw', Buffer.from(password, 'utf8'), 'PBKDF2', false, ['deriveKey']);
  return subtle.deriveKey(
    { name: 'PBKDF2', salt: Buffer.from(salt.toLowerCase(), 'utf8'), iterations: 100000, hash: 'SHA-256' },
    raw, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']
  );
}
async function generateDataKey() {
  return subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}
async function wrapKey(dataKey, wrappingKey) {
  const iv = webcrypto.getRandomValues(new Uint8Array(12));
  const rawKey = await subtle.exportKey('raw', dataKey);
  const ct = await subtle.encrypt({ name: 'AES-GCM', iv }, wrappingKey, rawKey);
  const combined = new Uint8Array(12 + ct.byteLength);
  combined.set(iv); combined.set(new Uint8Array(ct), 12);
  return b64e(combined);
}
async function unwrapKey(b64, wrappingKey) {
  const combined = b64d(b64);
  const rawKey = await subtle.decrypt({ name: 'AES-GCM', iv: combined.slice(0, 12) }, wrappingKey, combined.slice(12));
  return subtle.importKey('raw', rawKey, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}
async function encryptData(dataKey, value) {
  const iv = webcrypto.getRandomValues(new Uint8Array(12));
  const plaintext = typeof value === 'string' ? value : JSON.stringify(value);
  const ct = await subtle.encrypt({ name: 'AES-GCM', iv }, dataKey, Buffer.from(plaintext, 'utf8'));
  const combined = new Uint8Array(12 + ct.byteLength);
  combined.set(iv); combined.set(new Uint8Array(ct), 12);
  return b64e(combined);
}
async function decryptData(dataKey, b64) {
  const combined = b64d(b64);
  const pt = await subtle.decrypt({ name: 'AES-GCM', iv: combined.slice(0, 12) }, dataKey, combined.slice(12));
  return Buffer.from(pt).toString('utf8');
}

// Server state model (mirrors server.js behavior for the endpoints we care about)
function makeUserDB() {
  const users = {};
  const jobs  = {};
  return {
    register(u, ph, edk, slots) {
      users[u] = { username: u, passwordHash: ph, encrypted: true, encryptedDataKey: edk,
                   recoveryKeySlots: slots.map(s => ({ ...s, used: false })),
                   recoveryCodesGeneratedAt: Date.now() };
    },
    get(u) { return users[u]; },
    changePassword(u, ph, edk) {
      if (users[u].encrypted && !edk) throw new Error('missing newEncryptedDataKey');
      users[u].passwordHash = ph;
      if (edk) users[u].encryptedDataKey = edk;
    },
    recoverPhase1(u) { return (users[u].recoveryKeySlots || []).filter(s => !s.used); },
    recoverPhase2(u, ph, edk, idx) {
      const slot = users[u].recoveryKeySlots.find(s => s.index === idx && !s.used);
      if (!slot) throw new Error('slot not found');
      slot.used = true;
      users[u].passwordHash = ph;
      users[u].encryptedDataKey = edk;
    },
    regenerate(u, slots) {
      users[u].recoveryKeySlots = slots.map(s => ({ ...s, used: false }));
      users[u].recoveryCodesGeneratedAt = Date.now();
    },
    status(u) {
      const user = users[u];
      return user.encrypted
        ? { count: user.recoveryKeySlots.filter(s => !s.used).length, encrypted: true, createdAt: user.recoveryCodesGeneratedAt }
        : { count: 0, encrypted: false };
    },
    putJobs(u, env)  { jobs[u] = env; },
    getJobs(u)       { return jobs[u]; },
  };
}
const hash = pw => 'H:' + pw;
const matches = (pw, h) => h === 'H:' + pw;
const genRawCodes = n => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: n }, () =>
    Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
  );
};

(async () => {
  const u = 'alice';
  let password = 'initial-password-1234';
  const db = makeUserDB();
  let dataKey, rawCodes;

  await t('Register: 8 recovery slots, encryptedDataKey stored, slots.used:false', async () => {
    dataKey = await generateDataKey();
    const pwKey = await deriveKey(password, u);
    const edk = await wrapKey(dataKey, pwKey);
    rawCodes = genRawCodes(8);
    const slots = await Promise.all(rawCodes.map(async (c, i) => ({
      index: i, slot: await wrapKey(dataKey, await deriveKey(c, u)),
    })));
    db.register(u, hash(password), edk, slots);
    const user = db.get(u);
    if (user.recoveryKeySlots.length !== 8)        throw new Error('expected 8 slots');
    if (!user.recoveryKeySlots.every(s => !s.used)) throw new Error('slots not fresh');
    if (user.encryptedDataKey !== edk)              throw new Error('edk not stored');
  });

  await t('Login: unwrap with pw-derived key returns working dataKey', async () => {
    const user = db.get(u);
    if (!matches(password, user.passwordHash)) throw new Error('pw hash mismatch');
    const pwKey = await deriveKey(password, u);
    const unwrapped = await unwrapKey(user.encryptedDataKey, pwKey);
    const probe = 'roundtrip-probe-' + Date.now();
    const ct = await encryptData(dataKey, probe);
    const pt = await decryptData(unwrapped, ct);
    if (pt !== probe) throw new Error('unwrapped key not functional');
  });

  await t('Wrong password cannot unwrap (AES-GCM integrity)', async () => {
    const user = db.get(u);
    const badKey = await deriveKey('wrong-password', u);
    let threw = false;
    try { await unwrapKey(user.encryptedDataKey, badKey); } catch { threw = true; }
    if (!threw) throw new Error('wrong password did not throw');
  });

  await t('Jobs: client encrypts → server stores ciphertext → GET decrypts back', async () => {
    const jobsPayload = { j1: { company: 'Acme', title: 'Engineer', salary: '$180k' }, j2: { company: 'Beta' } };
    const ct = await encryptData(dataKey, jobsPayload);
    db.putJobs(u, { __enc: true, data: ct });
    const stored = db.getJobs(u);
    if (stored.__enc !== true) throw new Error('envelope shape wrong');
    const decoded = JSON.parse(await decryptData(dataKey, stored.data));
    if (decoded.j1.salary !== '$180k') throw new Error('jobs mismatch after round-trip');
    if (decoded.j2.company !== 'Beta')  throw new Error('multi-job round-trip broken');
  });

  await t('Change password: old pw invalidated, new pw unwraps SAME dataKey', async () => {
    const newPw = 'new-password-abc-789';
    const newPwKey = await deriveKey(newPw, u);
    const newEdk = await wrapKey(dataKey, newPwKey);
    db.changePassword(u, hash(newPw), newEdk);
    // Old pw no longer matches
    if (matches(password, db.get(u).passwordHash)) throw new Error('old pw still works');
    // New pw unwraps and still decrypts jobs (dataKey preserved)
    const unwrapped = await unwrapKey(db.get(u).encryptedDataKey, newPwKey);
    const decoded = JSON.parse(await decryptData(unwrapped, db.getJobs(u).data));
    if (decoded.j1.company !== 'Acme') throw new Error('jobs lost after password change');
    password = newPw;
  });

  await t('Change password GUARD: missing newEncryptedDataKey throws for encrypted account', async () => {
    let threw = false;
    try { db.changePassword(u, 'H:whatever', null); } catch { threw = true; }
    if (!threw) throw new Error('server accepted pw change without new wrapped key');
  });

  await t('Recovery phase 1: returns ALL 8 unused slots', async () => {
    const slots = db.recoverPhase1(u);
    if (slots.length !== 8) throw new Error(`expected 8 slots, got ${slots.length}`);
  });

  await t('Recovery with code #5: EXACTLY slot #5 unwraps, others fail', async () => {
    const code = rawCodes[5];
    const codeKey = await deriveKey(code, u);
    const slots = db.recoverPhase1(u);
    let successes = 0, unwrappedKey = null, unwrappedIdx = null;
    for (const s of slots) {
      try { const k = await unwrapKey(s.slot, codeKey); successes++; unwrappedKey = k; unwrappedIdx = s.index; }
      catch {}
    }
    if (successes !== 1) throw new Error(`expected exactly 1 slot to unwrap, ${successes} did`);
    if (unwrappedIdx !== 5) throw new Error(`code #5 unwrapped wrong slot: ${unwrappedIdx}`);
    // Phase 2: reset password using recovered key
    const newPw = 'recovered-pw-xyz';
    const newPwKey = await deriveKey(newPw, u);
    const newEdk = await wrapKey(unwrappedKey, newPwKey);
    db.recoverPhase2(u, hash(newPw), newEdk, unwrappedIdx);
    password = newPw;
    // Verify jobs still decrypt with the recovered key
    const decoded = JSON.parse(await decryptData(unwrappedKey, db.getJobs(u).data));
    if (decoded.j1.company !== 'Acme') throw new Error('jobs lost in recovery');
  });

  await t('After recovery: 7 slots remain, slot #5 gone from unused list', async () => {
    const status = db.status(u);
    if (status.count !== 7) throw new Error(`expected 7, got ${status.count}`);
    const unused = db.recoverPhase1(u);
    if (unused.find(s => s.index === 5)) throw new Error('slot #5 still in unused list');
  });

  await t('Regenerate codes: 10 new slots replace 7 old; old codes cannot unwrap new slots', async () => {
    const newCodes = genRawCodes(10);
    const newSlots = await Promise.all(newCodes.map(async (c, i) => ({
      index: i, slot: await wrapKey(dataKey, await deriveKey(c, u)),
    })));
    db.regenerate(u, newSlots);
    if (db.status(u).count !== 10) throw new Error('regen did not refresh count to 10');
    // Old code #0 must not unwrap any new slot
    const oldKey = await deriveKey(rawCodes[0], u);
    const slots = db.recoverPhase1(u);
    let oldWorked = false;
    for (const s of slots) { try { await unwrapKey(s.slot, oldKey); oldWorked = true; break; } catch {} }
    if (oldWorked) throw new Error('OLD code still unwraps a slot after regen');
    // New code #3 should work
    const newKey = await deriveKey(newCodes[3], u);
    let newWorked = false, newIdx = null;
    for (const s of slots) { try { await unwrapKey(s.slot, newKey); newWorked = true; newIdx = s.index; break; } catch {} }
    if (!newWorked) throw new Error('new code does not unwrap');
    if (newIdx !== 3) throw new Error(`new code #3 unwrapped slot ${newIdx}`);
  });

  await t('Full lifecycle: after register → jobs → pw-change → recovery → regen, jobs still decryptable', async () => {
    const user = db.get(u);
    const pwKey = await deriveKey(password, u);
    const dk = await unwrapKey(user.encryptedDataKey, pwKey);
    const decoded = JSON.parse(await decryptData(dk, db.getJobs(u).data));
    if (decoded.j1.company !== 'Acme') throw new Error('data lost somewhere in the chain');
    if (decoded.j2.company !== 'Beta')  throw new Error('partial data lost');
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed) process.exit(1);
})();
