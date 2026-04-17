/**
 * joblist.test.js — Unit tests for job list empty states, filter reset, and naming
 *
 * Tests the logic that handles:
 *   - Stale filter reset on loadJobs (mobile "empty list" bug)
 *   - Smart empty-list: no jobs vs filter has no matches
 *   - Empty state copy mentions "Add job"
 *   - "Document Library" renamed to "Library" everywhere
 *
 * Run: node joblist.test.js
 */

const fs   = require('fs');
const path = require('path');
const src  = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');

let pass = 0, fail = 0;
const t   = (name, fn) => { try { fn(); console.log(' ✓', name); pass++; } catch(e) { console.log(' ✗', name, '—', e.message.slice(0,90)); fail++; } };
const has = (s) => { if (!src.includes(s)) throw new Error('missing: ' + s.slice(0,60)); };
const not = (s) => { if (src.includes(s)) throw new Error('found:   ' + s.slice(0,60)); };

// ── DOM shim + function extraction ───────────────────────────────────────────
global.document = {
  getElementById: () => null,
  querySelectorAll: () => ({ forEach: () => {} }),
};
global.currentFilter = 'all';
global.jobs = {};
global.renderJobList = () => {};
global.renderDetail  = () => {};
global.scheduleSave  = () => {};
global.bulkMode      = false;
global.bulkSelected  = new Set();
global.currentJobId  = null;

function extractFn(name) {
  const start = src.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`function ${name} not found`);
  let depth = 0, i = start;
  while (i < src.length) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) break; }
    i++;
  }
  return src.slice(start, i + 1);
}

function extractAsync(name) {
  const start = src.indexOf(`async function ${name}(`);
  if (start < 0) throw new Error(`async function ${name} not found`);
  let depth = 0, i = start;
  while (i < src.length) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) break; }
    i++;
  }
  return src.slice(start, i + 1);
}

eval(extractFn('getFilteredJobs'));
eval(extractFn('setFilter'));

// ── loadJobs resets currentFilter ────────────────────────────────────────────
console.log('\n── loadJobs filter reset (mobile empty list bug)');

t('loadJobs() resets currentFilter to "all" at start', () => {
  const loadJobsSrc = extractAsync('loadJobs');
  if (!loadJobsSrc.includes("currentFilter = 'all'")) {
    throw new Error('currentFilter not reset — stale filter survives page load');
  }
});

t('reset comment explains purpose', () => {
  const loadJobsSrc = extractAsync('loadJobs');
  if (!loadJobsSrc.includes('reset stale filter')) {
    throw new Error('no explanatory comment on reset');
  }
});

t('filter reset happens before jobs are rendered', () => {
  // The reset must come BEFORE any renderJobList() call in loadJobs
  const loadJobsSrc = extractAsync('loadJobs');
  const resetIdx  = loadJobsSrc.indexOf("currentFilter = 'all'");
  const renderIdx = loadJobsSrc.indexOf('renderJobList');
  if (resetIdx < 0) throw new Error('no reset found');
  if (renderIdx > 0 && resetIdx > renderIdx) {
    throw new Error('reset comes AFTER renderJobList — jobs render before filter is cleared');
  }
});

t('stale filter scenario: applied filter + to-apply jobs → would show empty on old code', () => {
  // Simulate the exact bug: filter='applied' but jobs are 'to apply'
  global.jobs = {
    a: { id:'a', title:'Eng', company:'Acme', status:'to apply', stale:false, createdAt:Date.now(), notes:[] },
    b: { id:'b', title:'Dev', company:'Beta', status:'to apply', stale:false, createdAt:Date.now()-1000, notes:[] },
  };
  global.currentFilter = 'applied'; // stuck from old broken setFilter
  const before = getFilteredJobs().length;
  if (before !== 0) throw new Error(`Expected 0 with 'applied' filter, got ${before}`);
  // After loadJobs reset:
  global.currentFilter = 'all';
  const after = getFilteredJobs().length;
  if (after !== 2) throw new Error(`Expected 2 with 'all' filter, got ${after}`);
});

// ── renderJobList empty-list states (source checks) ──────────────────────────
console.log('\n── renderJobList empty states');

// Extract the renderJobList source for structural checks
const rlSrc = src.slice(src.indexOf('function renderJobList'), src.indexOf('function renderJobList') + 2000);

t('no jobs → "No applications yet" text in source', () => {
  if (!rlSrc.includes('No applications yet')) throw new Error('missing "No applications yet"');
});

t('no jobs → "Add job" text in empty-zero source', () => {
  if (!rlSrc.includes('Add job')) throw new Error('"Add job" missing from empty-zero message');
});

t('two distinct empty cases: zero-jobs and filter-no-match', () => {
  // Must check total jobs count to differentiate
  if (!rlSrc.includes('Object.keys(jobs).length')) throw new Error('no total job count check');
  if (!rlSrc.includes('No applications yet'))       throw new Error('no zero-jobs message');
  if (!rlSrc.includes('Show all'))                  throw new Error('no filter-no-match Show all button');
});

t('filter-no-match message references currentFilter by name', () => {
  if (!rlSrc.includes('currentFilter')) throw new Error('currentFilter not shown in no-match message');
});

t('filter-no-match "Show all" button calls setFilter("all")', () => {
  if (!rlSrc.includes("setFilter('all')")) throw new Error("setFilter('all') not in source");
});

t('zero-jobs path shown only when total === 0', () => {
  // Ensure the "No applications yet" message is inside the total===0 branch
  const zeroIdx   = rlSrc.indexOf('No applications yet');
  const totalIdx  = rlSrc.indexOf('total === 0');
  if (totalIdx < 0) throw new Error('total === 0 check not found');
  if (zeroIdx < totalIdx) throw new Error('"No applications yet" appears before total===0 check');
});

t('jobs matching filter → job-item rendered (not empty state)', () => {
  // job-item class must appear in the render path (outside the empty branches)
  if (!rlSrc.includes('job-item')) throw new Error('no job-item class in renderJobList');
  // And the job-item must come after the early returns for empty cases
  const emptyReturn = rlSrc.lastIndexOf('return;');
  const jobItemIdx  = rlSrc.indexOf('job-item');
  if (jobItemIdx < emptyReturn) throw new Error('job-item appears before last empty-branch return');
});

// ── Source structure: empty state copy ───────────────────────────────────────
console.log('\n── Empty state copy');

t('right-pane empty state says "Add job" (not "Add a job application")', () => {
  const idx  = src.indexOf('id="empty-state"');
  const body = src.slice(idx, idx + 400);
  if (body.includes('Add a job application')) throw new Error('old copy still present');
  if (!body.includes('Add job'))              throw new Error('"Add job" not in empty state');
});

t('right-pane empty state does not say "Add a job application"', () => {
  not('Add a job application');
});

// ── Library naming ───────────────────────────────────────────────────────────
console.log('\n── "Library" naming (no "Document Library")');

t('no "Document Library" in user-visible text', () => {
  // Strip JS comments and check remaining HTML/JS
  const stripped = src.replace(/\/\/ ──[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
  const lower    = stripped.toLowerCase();
  // Allow "document library picker" as an internal variable/comment, flag user-visible uses
  const lines = lower.split('\n').filter(l =>
    l.includes('document library') &&
    !l.trim().startsWith('//')
  );
  if (lines.length > 0) throw new Error('Found "Document Library" in: ' + lines[0].trim().slice(0,80));
});

t('sidebar Library button present with data-section="library"', () => {
  const sidebarStart = src.indexOf('class="sidebar-action-btns"');
  const sidebarEnd   = sidebarStart + 800;
  const bar = src.slice(sidebarStart, sidebarEnd);
  if (!bar.includes('data-section="library"')) throw new Error('no data-section=library in sidebar');
  if (!bar.includes('showDocumentsPage'))       throw new Error('showDocumentsPage not in sidebar');
});

t('landing page feature tile says "Library" not "Document library"', () => {
  // Find the landing page feature grid
  const grid = src.slice(src.indexOf('<!-- Feature grid'), src.indexOf('<!-- Footer CTA'));
  if (grid.includes('Document library') || grid.includes('Document Library')) {
    throw new Error('landing page tile still says "Document library"');
  }
  if (!grid.includes('Library')) throw new Error('"Library" not on landing page');
});

t('docs section header says "Library"', () => {
  const idx  = src.indexOf('showDocumentsPage');
  const body = src.slice(idx, idx + 1000);
  if (body.includes('Document Library') || body.includes('Document library')) {
    throw new Error('docs section title still says Document Library');
  }
});

t('help section refers to "Library" not "Document Library"', () => {
  const idx  = src.indexOf('function showHelp()');
  const body = src.slice(idx, idx + 4000);
  if (body.includes('Document Library') || body.includes('Document library')) {
    throw new Error('help section still says Document Library');
  }
  if (!body.includes('Library')) throw new Error('"Library" not in help section');
});

// ── Summary ──────────────────────────────────────────────────────────────────
console.log(`\n${pass}/${pass + fail} passed${fail ? ' ← FAILURES' : '  ✓'}`);
if (fail) process.exit(1);
