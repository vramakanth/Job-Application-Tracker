// behavior.test.js — functional coverage.
// Instead of asserting "the code contains a _partial flag assignment", we
// actually EXECUTE the function and check the result. Catches regressions
// that source-level regex passes (renamed variables, refactored structure
// that still "looks right") would miss.

const fs = require('fs');
const path = require('path');

const serverSrc = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
const feSrc     = fs.readFileSync(path.join(__dirname, '../../frontend/public/index.html'), 'utf8');

let passed = 0, failed = 0;
function t(name, fn) {
  try { fn(); console.log(` ✓ ${name}`); passed++; }
  catch (e) { console.log(` ✗ ${name} — ${e.message}`); failed++; }
}

// Extract a named function's source (matched on opening `function NAME(`)
function extractFn(src, name) {
  const patterns = [
    `async function ${name}(`,
    `function ${name}(`,
  ];
  let start = -1;
  for (const p of patterns) { const i = src.indexOf(p); if (i >= 0) { start = i; break; } }
  if (start < 0) throw new Error(`function ${name} not found`);
  let depth = 0, i = start;
  while (i < src.length) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) break; }
    i++;
  }
  return src.slice(start, i + 1);
}

// ════════════════════════════════════════════════════════════════════════════
// parseJson — strategy ladder with _partial flag on lossy recovery
// ════════════════════════════════════════════════════════════════════════════
console.log('\n── parseJson: real input/output behavior');

// Inject parseJson into a local sandbox
eval(extractFn(serverSrc, 'parseJson'));

t('clean JSON: no _partial flag', () => {
  const out = parseJson('{"a":1,"b":"hello"}');
  if (out.a !== 1) throw new Error('value dropped');
  if (out._partial) throw new Error('clean input falsely flagged partial');
});

t('strips markdown code fences', () => {
  const out = parseJson('```json\n{"x":5}\n```');
  if (out.x !== 5) throw new Error('fences not stripped');
});

t('leading garbage before first { is dropped', () => {
  const out = parseJson('here is the response: {"ok":true}');
  if (out.ok !== true) throw new Error('leading prose not stripped');
});

t('truncated mid-string: strategy-3 recovers early keys + flags _partial', () => {
  // Imagine AI response got cut off mid-field. Everything up to the break
  // should still be parseable; the truncated bit should be dropped.
  const truncated = '{"overview":"hi","culture":{"summary":"this was cut';
  const out = parseJson(truncated);
  if (!out) throw new Error('no recovery');
  if (!out._partial) throw new Error('_partial flag NOT set on lossy recovery');
  if (out.overview !== 'hi') throw new Error('early field was dropped');
});

t('truncated between complete keys: recovers last good state', () => {
  const truncated = '{"a":1,"b":2,"c":3,';  // trailing comma, no closer
  const out = parseJson(truncated);
  if (!out) throw new Error('no recovery');
  if (out._partial !== true) throw new Error('_partial not flagged');
  if (out.a !== 1 || out.b !== 2 || out.c !== 3) throw new Error('recoverable keys lost');
});

t('completely unparseable: throws', () => {
  let threw = false;
  try { parseJson('%%% not json at all %%%'); } catch { threw = true; }
  if (!threw) throw new Error('should have thrown on garbage');
});

// ════════════════════════════════════════════════════════════════════════════
// STATUS migration: legacy statuses transparently map to current vocabulary
// ════════════════════════════════════════════════════════════════════════════
console.log('\n── STATUS_MIGRATE: real migration behavior');

// Extract both STATUSES array and STATUS_MIGRATE map from the frontend
function extractConst(src, name) {
  const m = src.match(new RegExp('const\\s+' + name + '\\s*=\\s*([\\s\\S]+?);'));
  if (!m) throw new Error(`const ${name} not found`);
  return m[1];
}
const STATUSES = eval(extractConst(feSrc, 'STATUSES'));
const STATUS_MIGRATE = eval('(' + extractConst(feSrc, 'STATUS_MIGRATE') + ')');

t('STATUSES is the 5-entry reduced set', () => {
  const expected = ['to apply','applied','interview','offer','rejected'];
  if (STATUSES.length !== 5) throw new Error(`expected 5 statuses, got ${STATUSES.length}`);
  for (const s of expected) {
    if (!STATUSES.includes(s)) throw new Error(`missing: ${s}`);
  }
});

t('every legacy status migrates to a CURRENT status', () => {
  for (const [legacy, current] of Object.entries(STATUS_MIGRATE)) {
    if (!STATUSES.includes(current)) {
      throw new Error(`STATUS_MIGRATE[${legacy}] = ${current} — not a valid current status`);
    }
  }
});

t('screening/interviewing → interview (interview-loop collapse)', () => {
  if (STATUS_MIGRATE['screening']     !== 'interview') throw new Error('screening not mapped');
  if (STATUS_MIGRATE['interviewing']  !== 'interview') throw new Error('interviewing not mapped');
});

t('ghosted/withdrawn/expired → rejected (end-state collapse)', () => {
  for (const end of ['ghosted','withdrawn','expired']) {
    if (STATUS_MIGRATE[end] !== 'rejected') throw new Error(`${end} should map to rejected`);
  }
});

t('applying migration to a jobs map updates statuses in place', () => {
  const jobs = {
    j1: { id: 'j1', status: 'interviewing' },
    j2: { id: 'j2', status: 'applied' },       // already current
    j3: { id: 'j3', status: 'ghosted' },
    j4: { id: 'j4', status: 'screening' },
  };
  // This mirrors the loadJobs snippet
  Object.values(jobs).forEach(j => {
    if (j.status && STATUS_MIGRATE[j.status]) j.status = STATUS_MIGRATE[j.status];
  });
  if (jobs.j1.status !== 'interview') throw new Error('interviewing not migrated');
  if (jobs.j2.status !== 'applied')   throw new Error('current status mistakenly touched');
  if (jobs.j3.status !== 'rejected')  throw new Error('ghosted not migrated');
  if (jobs.j4.status !== 'interview') throw new Error('screening not migrated');
});

// ════════════════════════════════════════════════════════════════════════════
// Mirror allowlist: the right hosts in, aggregators out
// ════════════════════════════════════════════════════════════════════════════
console.log('\n── Mirror allowlist: real URL acceptance');

// Extract isAllowlistedMirror — it depends on MIRROR_ALLOWLIST.
// `const` declarations inside eval are block-scoped to the eval itself and do
// NOT leak out. Same problem would hit STATUSES except extractConst returns
// the array literal, not the declaration. Assign to global explicitly here.
const allowlistSrc = serverSrc.match(/const MIRROR_ALLOWLIST\s*=\s*(\[[\s\S]+?\]);/);
global.MIRROR_ALLOWLIST = eval('(' + allowlistSrc[1] + ')');
eval(extractFn(serverSrc, 'isAllowlistedMirror'));

t('Greenhouse URL accepted', () => {
  if (!isAllowlistedMirror('https://boards.greenhouse.io/acme/jobs/12345')) {
    throw new Error('Greenhouse rejected');
  }
});

t('Lever URL accepted', () => {
  if (!isAllowlistedMirror('https://jobs.lever.co/acme/some-id')) {
    throw new Error('Lever rejected');
  }
});

t('Ashby URL accepted', () => {
  if (!isAllowlistedMirror('https://jobs.ashbyhq.com/acme/role-id')) {
    throw new Error('Ashby rejected');
  }
});

t('careers.company.com subdomain accepted', () => {
  if (!isAllowlistedMirror('https://careers.acme.com/jobs/senior-engineer')) {
    throw new Error('company-careers subdomain rejected');
  }
});

t('LinkedIn rejected (the bot-blocking source, not a fix)', () => {
  if (isAllowlistedMirror('https://www.linkedin.com/jobs/view/12345')) {
    throw new Error('LinkedIn must NOT be in allowlist');
  }
});

t('Indeed rejected', () => {
  if (isAllowlistedMirror('https://www.indeed.com/viewjob?jk=abc')) {
    throw new Error('Indeed must NOT be in allowlist');
  }
});

t('ZipRecruiter rejected (the originally-reported Cloudflare source)', () => {
  if (isAllowlistedMirror('https://www.ziprecruiter.com/jobs/acme/role-slug')) {
    throw new Error('ZipRecruiter must NOT be in allowlist');
  }
});

t('Glassdoor rejected', () => {
  if (isAllowlistedMirror('https://www.glassdoor.com/job-listing/role-at-co-JV.htm')) {
    throw new Error('Glassdoor must NOT be in allowlist');
  }
});

t('Garbage URL returns null (does not throw)', () => {
  const r = isAllowlistedMirror('not-a-url');
  if (r !== null) throw new Error('expected null for malformed URL, got ' + r);
});

// ════════════════════════════════════════════════════════════════════════════
// buildPostingHtml: actual input → output (paragraph/heading/bullet shape)
// ════════════════════════════════════════════════════════════════════════════
console.log('\n── buildPostingHtml: real input/output');

// buildPostingHtml uses DOMParser (browser-only) on its j.postingHtml branch,
// and `esc()` for escaping. Stub both so we can run the postingText branch.
global.esc = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
global.DOMParser = class { parseFromString() { return null; } };  // forces postingText branch
global.jobs = {};
global.currentJobId = null;
global.emptyPosting = () => '<EMPTY/>';

eval(extractFn(feSrc, 'buildPostingHtml'));

t('single paragraph wrapped in <p>', () => {
  const out = buildPostingHtml({ postingText: 'This is a description of the role that has enough text to be considered real content. Lots of words go here.' });
  if (!out.includes('<p>')) throw new Error('no <p> wrapper');
  if (!out.includes('posting-body')) throw new Error('no outer .posting-body div');
});

t('double-newline splits produce multiple paragraphs', () => {
  const text = 'First paragraph about the role and what the company does in broad strokes.\n\nSecond paragraph covering the day-to-day responsibilities of this position in detail.';
  const out = buildPostingHtml({ postingText: text });
  const paraCount = (out.match(/<p>/g) || []).length;
  if (paraCount < 2) throw new Error(`expected 2+ <p>, got ${paraCount}`);
});

t('bullet-style lines become <ul><li>', () => {
  const text = 'Requirements:\n\n• 5 years experience\n• Strong JavaScript skills\n• Team player';
  const out = buildPostingHtml({ postingText: text });
  if (!out.includes('<ul>')) throw new Error('no <ul>');
  if (!out.includes('<li>')) throw new Error('no <li>');
  if (out.match(/<li>/g).length !== 3) throw new Error('expected 3 <li>, got ' + (out.match(/<li>/g) || []).length);
});

t('short no-punctuation line promoted to <h3>', () => {
  const text = 'About the Role\n\nWe are looking for a senior engineer to join our team. This person will work on core infrastructure and own major features end to end.';
  const out = buildPostingHtml({ postingText: text });
  if (!out.includes('<h3>About the Role</h3>')) throw new Error('short line not promoted to h3');
});

t('markup in postingText is sanitized (no raw tag leaks)', () => {
  const text = 'Some content with <script>alert(1)</script> embedded which should be sanitized so the user sees nothing executable and no XSS is possible.';
  const out = buildPostingHtml({ postingText: text });
  // toPlainText strips HTML tags before we ever esc() — either outcome
  // (stripped or escaped) is safe; what we require is no raw <script>.
  if (/<script>/i.test(out)) throw new Error('raw <script> tag leaked — XSS risk');
});

// ════════════════════════════════════════════════════════════════════════════
// Dark-mode contrast ratios (WCAG formula) — computed from the real palette
// in index.html. Locks in the "text is readable at night" fix so future color
// edits that accidentally dim a token get caught.
// ════════════════════════════════════════════════════════════════════════════
console.log('\n── Dark-mode contrast ratios (WCAG)');

// sRGB → relative luminance per WCAG 2.1
function luminance(hex) {
  const h = hex.replace('#','');
  const [r,g,b] = [h.slice(0,2), h.slice(2,4), h.slice(4,6)].map(x => parseInt(x, 16) / 255);
  const linear = c => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}
function ratio(c1, c2) {
  const [l1, l2] = [luminance(c1), luminance(c2)].sort((a,b) => b-a);
  return (l1 + 0.05) / (l2 + 0.05);
}

// Pull the dark palette block from index.html and parse hex values.
// Anchor on `@media (prefers-color-scheme: dark)` so we don't accidentally
// grab the <meta name="theme-color" media="(prefers-color-scheme: dark)">
// tag earlier in the file.
const darkBlock = feSrc.match(/@media\s*\(prefers-color-scheme:\s*dark\)[\s\S]+?\}[\s\S]+?\}/)[0];
function varHex(name) {
  const m = darkBlock.match(new RegExp('--' + name + ':\\s*(#[0-9a-fA-F]{6})'));
  if (!m) throw new Error('dark --' + name + ' not found');
  return m[1];
}
const palette = {
  bg:    varHex('bg'),
  bg2:   varHex('bg2'),
  bg3:   varHex('bg3'),
  bg4:   varHex('bg4'),
  text:  varHex('text'),
  text2: varHex('text2'),
  text3: varHex('text3'),
};

const AA_BODY = 4.5;  // WCAG AA for normal-sized body text
const AA_LARGE = 3.0; // Large text only

t('--text on all bg surfaces: AAA-level (≥ 7:1)', () => {
  for (const bg of ['bg','bg2','bg3','bg4']) {
    const r = ratio(palette.text, palette[bg]);
    if (r < 7) throw new Error(`text on ${bg}: ${r.toFixed(2)} < 7`);
  }
});

t('--text2 on bg/bg2/bg3: passes AA body (≥ 4.5:1)', () => {
  for (const bg of ['bg','bg2','bg3']) {
    const r = ratio(palette.text2, palette[bg]);
    if (r < AA_BODY) throw new Error(`text2 on ${bg}: ${r.toFixed(2)} < ${AA_BODY}`);
  }
});

t('--text3 on bg/bg2: passes AA body (was 4.1 on bg3, failing)', () => {
  for (const bg of ['bg','bg2']) {
    const r = ratio(palette.text3, palette[bg]);
    if (r < AA_BODY) throw new Error(`text3 on ${bg}: ${r.toFixed(2)} < ${AA_BODY}`);
  }
});

t('--text3 on bg3 (cards/hover): passes AA body (regression target — was 4.1)', () => {
  const r = ratio(palette.text3, palette.bg3);
  if (r < AA_BODY) throw new Error(`text3 on bg3: ${r.toFixed(2)} < ${AA_BODY} — night-mode readability regression`);
});

t('--text3 on bg4 (pressed/active): passes AA body (regression target — was 3.4)', () => {
  const r = ratio(palette.text3, palette.bg4);
  if (r < AA_BODY) throw new Error(`text3 on bg4: ${r.toFixed(2)} < ${AA_BODY} — night-mode readability regression`);
});

t('admin.html dark palette matches main app (text3 same brightness)', () => {
  const adminSrc = fs.readFileSync(path.join(__dirname, '../../frontend/public/admin.html'), 'utf8');
  const m = adminSrc.match(/--text3:(#[0-9a-fA-F]{6})/);
  if (!m) throw new Error('admin --text3 not found');
  if (m[1].toLowerCase() !== palette.text3.toLowerCase()) {
    throw new Error(`admin --text3 (${m[1]}) drifted from main (${palette.text3})`);
  }
});

// ════════════════════════════════════════════════════════════════════════════
console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
