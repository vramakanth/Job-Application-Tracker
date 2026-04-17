/**
 * crypto.test.js — Zero-knowledge crypto round-trip tests
 *
 * Unlike encryption.test.js (which boots the server), this file tests the
 * pure cryptographic primitives and wire-format round-trips without
 * requiring express, bcrypt, or any backend dependency. Safe to run in
 * offline/CI environments without node_modules.
 *
 * Run: node backend/tests/crypto.test.js
 */
'use strict';
const crypto = require('crypto').webcrypto;

let pass = 0, fail = 0;
function t(name, fn) {
  return fn().then(
    () => { console.log(` ✓ ${name}`); pass++; },
    (e) => { console.log(` ✗ ${name} — ${e.message}`); fail++; }
  );
}

// ── Exact port of CryptoEngine from frontend/public/index.html ──────────────
const CryptoEngine = {
  async deriveKey(password, salt) {
    const enc = new TextEncoder();
    const raw = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: enc.encode(String(salt).toLowerCase()), iterations: 100000, hash: 'SHA-256' },
      raw,
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt']
    );
  },
  async generateDataKey() {
    return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  },
  async wrapKey(dataKey, wrappingKey) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const rawKey = await crypto.subtle.exportKey('raw', dataKey);
    const enc = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, wrappingKey, rawKey);
    const combined = new Uint8Array(12 + enc.byteLength);
    combined.set(iv); combined.set(new Uint8Array(enc), 12);
    return Buffer.from(combined).toString('base64');
  },
  async unwrapKey(b64, wrappingKey) {
    const combined = new Uint8Array(Buffer.from(b64, 'base64'));
    const iv = combined.slice(0, 12);
    const data = combined.slice(12);
    const rawKey = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, wrappingKey, data);
    return crypto.subtle.importKey('raw', rawKey, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  },
  async encrypt(dataKey, value) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const enc = new TextEncoder();
    const pt = typeof value === 'string' ? value : JSON.stringify(value);
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, dataKey, enc.encode(pt));
    const combined = new Uint8Array(12 + ct.byteLength);
    combined.set(iv); combined.set(new Uint8Array(ct), 12);
    return Buffer.from(combined).toString('base64');
  },
  async decrypt(dataKey, b64) {
    const combined = new Uint8Array(Buffer.from(b64, 'base64'));
    const iv = combined.slice(0, 12);
    const data = combined.slice(12);
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, dataKey, data);
    const s = new TextDecoder().decode(pt);
    try { return JSON.parse(s); } catch { return s; }
  },
};

async function run() {
  console.log('\n── Zero-knowledge crypto: primitives + round-trips');

  await t('password-derived key wraps/unwraps dataKey correctly', async () => {
    const dk = await CryptoEngine.generateDataKey();
    const pw = await CryptoEngine.deriveKey('correct horse battery', 'alice');
    const wrapped = await CryptoEngine.wrapKey(dk, pw);
    const unwrapped = await CryptoEngine.unwrapKey(wrapped, pw);
    // Round-trip a payload to verify it's the same key
    const ct = await CryptoEngine.encrypt(dk, { hello: 'world' });
    const pt = await CryptoEngine.decrypt(unwrapped, ct);
    if (pt.hello !== 'world') throw new Error('round-trip failed');
  });

  await t('wrong password cannot unwrap — throws, does not return wrong data', async () => {
    const dk = await CryptoEngine.generateDataKey();
    const right = await CryptoEngine.deriveKey('the correct password', 'alice');
    const wrong = await CryptoEngine.deriveKey('a different password', 'alice');
    const wrapped = await CryptoEngine.wrapKey(dk, right);
    let threw = false;
    try { await CryptoEngine.unwrapKey(wrapped, wrong); } catch { threw = true; }
    if (!threw) throw new Error('wrong key should not unwrap');
  });

  await t('username is the salt — same password, different user = different key', async () => {
    const k1 = await CryptoEngine.deriveKey('same password', 'alice');
    const k2 = await CryptoEngine.deriveKey('same password', 'bob');
    // Export both and compare
    const r1 = Buffer.from(await crypto.subtle.exportKey('raw', k1)).toString('hex');
    const r2 = Buffer.from(await crypto.subtle.exportKey('raw', k2)).toString('hex');
    if (r1 === r2) throw new Error('username not used as salt');
  });

  await t('salt is case-insensitive (username.toLowerCase in deriveKey)', async () => {
    // The deriveKey function lowercases salt — so 'Alice' and 'alice' derive the same key.
    // This is intentional: users can sign up with any case and still log in.
    const k1 = await CryptoEngine.deriveKey('same password', 'Alice');
    const k2 = await CryptoEngine.deriveKey('same password', 'alice');
    const r1 = Buffer.from(await crypto.subtle.exportKey('raw', k1)).toString('hex');
    const r2 = Buffer.from(await crypto.subtle.exportKey('raw', k2)).toString('hex');
    if (r1 !== r2) throw new Error('username salt not case-insensitive');
  });

  await t('8 recovery slots all wrap the same dataKey — any one recovers', async () => {
    const dk = await CryptoEngine.generateDataKey();
    const codes = ['ABCD', 'EFGH', 'JKLM', 'NPQR', 'STUV', 'WXYZ', '2345', '6789'];
    const slots = await Promise.all(codes.map(async (code, i) => {
      const codeKey = await CryptoEngine.deriveKey(code, 'alice');
      return { index: i, slot: await CryptoEngine.wrapKey(dk, codeKey) };
    }));
    // Pick slot #5 randomly — should unwrap with code[5] only
    const target = 5;
    const tryKey = await CryptoEngine.deriveKey(codes[target], 'alice');
    const recovered = await CryptoEngine.unwrapKey(slots[target].slot, tryKey);
    // Verify by round-tripping a payload
    const ct = await CryptoEngine.encrypt(dk, { test: 1 });
    const pt = await CryptoEngine.decrypt(recovered, ct);
    if (pt.test !== 1) throw new Error('recovered key does not match original');
  });

  await t('wrong code unwraps NO slots — user sees failure cleanly', async () => {
    const dk = await CryptoEngine.generateDataKey();
    const codes = ['ABCD', 'EFGH', 'JKLM'];
    const slots = await Promise.all(codes.map(async (code, i) => {
      const codeKey = await CryptoEngine.deriveKey(code, 'bob');
      return { index: i, slot: await CryptoEngine.wrapKey(dk, codeKey) };
    }));
    const wrongKey = await CryptoEngine.deriveKey('WRONG', 'bob');
    let anyWorked = false;
    for (const s of slots) {
      try { await CryptoEngine.unwrapKey(s.slot, wrongKey); anyWorked = true; } catch {}
    }
    if (anyWorked) throw new Error('wrong code unwrapped a slot — CRITICAL');
  });

  await t('ciphertext envelope matches wire format: 12-byte IV + AES-GCM body', async () => {
    const dk = await CryptoEngine.generateDataKey();
    const ct = await CryptoEngine.encrypt(dk, { some: 'data' });
    const bytes = Buffer.from(ct, 'base64');
    if (bytes.length < 12 + 16) throw new Error(`envelope too short: ${bytes.length} bytes`);
    // IV should be random — run twice and expect different IVs
    const ct2 = await CryptoEngine.encrypt(dk, { some: 'data' });
    const bytes2 = Buffer.from(ct2, 'base64');
    if (bytes.slice(0, 12).equals(bytes2.slice(0, 12))) throw new Error('IV reused');
    if (ct === ct2) throw new Error('identical ciphertexts for same input — IV not random');
  });

  await t('password change: old wrapped key dead, new one recovers data', async () => {
    // Simulate the full change-password ritual
    const dk = await CryptoEngine.generateDataKey();
    const oldPwKey = await CryptoEngine.deriveKey('old password', 'alice');
    const newPwKey = await CryptoEngine.deriveKey('new password', 'alice');
    // Server had this wrapped with old password
    const oldWrapped = await CryptoEngine.wrapKey(dk, oldPwKey);
    // Client unwraps with old, re-wraps with new
    const inMemory = await CryptoEngine.unwrapKey(oldWrapped, oldPwKey);
    const newWrapped = await CryptoEngine.wrapKey(inMemory, newPwKey);
    // After server swap, new password must still decrypt
    const afterSwap = await CryptoEngine.unwrapKey(newWrapped, newPwKey);
    // And any data previously encrypted with the key is still decryptable
    const ct = await CryptoEngine.encrypt(dk, { preserved: true });
    const pt = await CryptoEngine.decrypt(afterSwap, ct);
    if (!pt.preserved) throw new Error('data lost after password change');
    // Critical: old password must no longer unwrap the new blob
    let threw = false;
    try { await CryptoEngine.unwrapKey(newWrapped, oldPwKey); } catch { threw = true; }
    if (!threw) throw new Error('old password still works after change');
  });

  await t('recovery→new-password: recovered key can be re-wrapped for future logins', async () => {
    // User forgot password. They use a recovery code, set new password.
    const dk = await CryptoEngine.generateDataKey();
    const codeKey = await CryptoEngine.deriveKey('ABCD', 'alice');
    const slot = await CryptoEngine.wrapKey(dk, codeKey);

    // User enters code + new password
    const recovered = await CryptoEngine.unwrapKey(slot, codeKey);
    const newPwKey = await CryptoEngine.deriveKey('brand new password', 'alice');
    const newEncryptedDataKey = await CryptoEngine.wrapKey(recovered, newPwKey);

    // Later login: unwrap with new password
    const loginKey = await CryptoEngine.deriveKey('brand new password', 'alice');
    const afterLogin = await CryptoEngine.unwrapKey(newEncryptedDataKey, loginKey);

    // Data from before recovery still decrypts
    const ct = await CryptoEngine.encrypt(dk, { survives: true });
    const pt = await CryptoEngine.decrypt(afterLogin, ct);
    if (!pt.survives) throw new Error('data lost through recovery flow');
  });

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) process.exit(1);
}

run().catch(e => { console.error('Fatal:', e); process.exit(1); });
