/**
 * smoke.test.js — UI regression tests
 * Run: node smoke.test.js
 */
const fs = require('fs');
const src = fs.readFileSync(require('path').join(__dirname,'../public/index.html'), 'utf8');
let pass=0, fail=0;
const t = (name, fn) => { try { fn(); console.log(' ✓', name); pass++; } catch(e) { console.log(' ✗', name, '—', e.message.slice(0,80)); fail++; } };
const has  = s => { if (!src.includes(s)) throw new Error('missing: ' + s.slice(0,60)); };
const not  = s => { if (src.includes(s))  throw new Error('found:   ' + s.slice(0,60)); };
const count = (s, n) => { const c=(src.match(new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'g'))||[]).length; if(c!==n) throw new Error(`expected ${n}, got ${c}`); };

// ── Core function names ─────────────────────────────────────────────────────
console.log('\n── Core function names');
t('addJob (not createJob)',    () => has('function addJob('));
t('doLogin (not login)',       () => has('function doLogin('));
t('displayMap app:flex',        () => has("app:'flex'"));
t('postingText: text.slice',   () => has('postingText: text.slice'));
t('stale is boolean field',    () => has('j.stale'));
t('stale not in STATUSES',     () => { if (src.match(/STATUSES.*stale|stale.*STATUSES/)) throw new Error('stale in STATUSES'); });

// ── Tab default ─────────────────────────────────────────────────────────────
console.log('\n── Tab behaviour');
t("Default tab = 'insights'",  () => has("activeDetailTab = 'insights'"));
t("selectJob sets insights tab",() => { const idx=src.indexOf("function selectJob"); const body=src.slice(idx,idx+600); if(!body.includes("'insights'")) throw new Error("selectJob doesn't set insights"); });
t('Insights tab exists',       () => has("switchTab('insights')"));
t('Notes tab exists',          () => has("switchTab('notes')"));

// ── Landing page ────────────────────────────────────────────────────────────
console.log('\n── Landing page');
t('Get started before Sign in in top-right', () => {
  const gs = src.indexOf("Get started</button>\n      <button onclick=\"showScreen('login')");
  if (gs < 0) throw new Error('order wrong — Get started must precede Sign in');
});
t('Sign in button present',    () => has("showScreen('login')"));
t('Get started button present',() => has("showScreen('register')"));

// ── Footer / logo labels removed ───────────────────────────────────────────
console.log('\n── Branding');
t('No "job tracker" auth-logo-sub',  () => not('<div class="auth-logo-sub">job tracker</div>'));
t('No "job tracker" logo-sub',       () => not('<div class="logo-sub">job tracker</div>'));

// ── Settings ────────────────────────────────────────────────────────────────
console.log('\n── Settings');
t('No X close button in settings content header', () => {
  // The inline close button with closeSettings() title=Close should be gone
  if (src.includes('title="Close"') && src.includes('closeSettings()') && src.includes('&#x2715;')) {
    throw new Error('X close button still present');
  }
});
t("Finnhub link opens Financial tab directly", () => has("openSettings('financial')"));
t('showSettingsSection re-populates finnhub key', () => {
  const idx = src.indexOf('function showSettingsSection');
  const body = src.slice(idx, idx + 300);
  if (!body.includes('finnhub_key')) throw new Error('finnhub re-populate missing');
});

// ── Insights ────────────────────────────────────────────────────────────────
console.log('\n── Insights');
t('Financial section exists',  () => has('Financial Data'));
t('Stock section exists',      () => has('Stock &amp; financials'));
t('Finnhub key in localStorage', () => has("finnhub_key"));

// ── Extension ───────────────────────────────────────────────────────────────
console.log('\n── Extension');
t('Extension download link exists', () => has('/api/extension'));

// ── No removed features ────────────────────────────────────────────────────
console.log('\n── Removed features absent');
t('No referral pipeline',      () => not('referralPipeline'));

console.log(`\n${pass}/${pass+fail} passed${fail ? ' ← FAILURES' : '  ✓'}`);
if (fail) process.exit(1);

// ── Landing page feature tiles ──────────────────────────────────────────────
console.log('\n── Feature tiles');
t('Tile 1: Company intelligence', () => has('Company intelligence'));
t('Tile 2: Compensation Research', () => has('Compensation Research'));
t('Tile 3: AI resume tailoring',  () => has('AI resume tailoring'));
t('Tile 4: Interview Prep tile',  () => {
  // Confirm "Interview Prep" tile comes after "AI resume tailoring" in the HTML
  const ai  = src.indexOf('AI resume tailoring');
  const ip  = src.indexOf('Interview Prep</div>', ai);
  if (ip < 0) throw new Error('Interview Prep not after AI tailoring');
});
t('Tile 5: Pipeline tracking',    () => has('Pipeline tracking'));
t('No "Formatting preserved"',    () => not('Formatting preserved'));
t('No "Salary intelligence"',     () => not('Salary intelligence'));

// ── People & Diversity section ──────────────────────────────────────────────
console.log('\n── People & Diversity section');
t('No visa badge/pill in workforce', () => {
  const wfStart = src.indexOf('function renderWorkforceSection');
  const wfEnd   = src.indexOf('\nfunction renderCompensationSection');
  const wf = src.slice(wfStart, wfEnd);
  if (wf.includes('Sponsors visas') || wf.includes('visaLabel') || wf.includes('visaColor')) {
    throw new Error('visa badge still present');
  }
});
t('No headcountHistory growth chart', () => {
  const wfStart = src.indexOf('function renderWorkforceSection');
  const wfEnd   = src.indexOf('\nfunction renderCompensationSection');
  const wf = src.slice(wfStart, wfEnd);
  if (wf.includes('EMPLOYEE GROWTH') || wf.includes('headcountHistory')) throw new Error('growth chart still present');
});
t('No growing/shrinking trend badge in section header', () => {
  const wfStart = src.indexOf('function renderWorkforceSection');
  const wfEnd   = src.indexOf('\nfunction renderCompensationSection');
  const wf = src.slice(wfStart, wfEnd);
  if (wf.includes('insight-section-badge') && wf.includes('trendColor')) throw new Error('trend badge in header');
});
t('Stat cards use consistent border layout', () => {
  const wfStart = src.indexOf('function renderWorkforceSection');
  const wfEnd   = src.indexOf('\nfunction renderCompensationSection');
  const wf = src.slice(wfStart, wfEnd);
  if (!wf.includes('border-right:1px solid var(--border)')) throw new Error('no bordered stat cards');
});
t('avgTenure is a stat card (not tiny sub-label)', () => {
  const wfStart = src.indexOf('function renderWorkforceSection');
  const wfEnd   = src.indexOf('\nfunction renderCompensationSection');
  const wf = src.slice(wfStart, wfEnd);
  if (!wf.includes("'AVG TENURE'")) throw new Error('avgTenure not a stat card');
});
t('Layoff banner has proper 13px text', () => {
  const wfStart = src.indexOf('function renderWorkforceSection');
  const wfEnd   = src.indexOf('\nfunction renderCompensationSection');
  const wf = src.slice(wfStart, wfEnd);
  if (!wf.includes('font-size:13px;color:var(--text2)')) throw new Error('layoff text still low contrast');
});
t('Locations shown as pill chips', () => {
  const wfStart = src.indexOf('function renderWorkforceSection');
  const wfEnd   = src.indexOf('\nfunction renderCompensationSection');
  const wf = src.slice(wfStart, wfEnd);
  if (!wf.includes('OFFICE LOCATIONS')) throw new Error('no locations block');
  if (!wf.includes('border-radius:100px')) throw new Error('no pill chips');
});
t('renderAgeDistribution removed (inlined)', () => not('function renderAgeDistribution'));

// ── Watchlist & job list ─────────────────────────────────────────────────────
console.log('\n── Watchlist & job list');
t('Watchlist filter tab exists',       () => has("setFilter('watchlist')"));
t('getFilteredJobs handles watchlist', () => {
  const idx = src.indexOf("currentFilter === 'watchlist'");
  if (idx < 0) throw new Error('watchlist filter logic missing');
});
t('toggleWatchlist calls renderJobList (syncs inline star)', () => {
  const idx = src.indexOf('function toggleWatchlist');
  const body = src.slice(idx, idx + 300);
  if (!body.includes('renderJobList')) throw new Error('renderJobList not called — inline star wont update');
});
t('Inline star has adequate hit target (padding)', () => {
  const rl = src.slice(src.indexOf('function renderJobList'), src.indexOf('function selectJob'));
  if (!rl.includes('min-width:20px')) throw new Error('star hit target too small');
});
t('Inline star in job list item',      () => {
  // Star button inside renderJobList — uses event.stopPropagation to avoid selecting job
  const rl = src.slice(src.indexOf('function renderJobList'), src.indexOf('function selectJob'));
  if (!rl.includes('event.stopPropagation')) throw new Error('no stopPropagation on star');
  if (!rl.includes('toggleWatchlist')) throw new Error('no toggleWatchlist in job list');
});
t('Star+trash in aligned column in detail header', () => {
  // Both buttons in a flex-direction:column wrapper
  const dh = src.slice(src.indexOf('dv.innerHTML'), src.indexOf('dv.innerHTML') + 5000);
  if (!dh.includes('flex-direction:column')) throw new Error('no column wrapper for buttons');
  if (!dh.includes('toggleWatchlist') || !dh.includes('deleteJob')) throw new Error('missing buttons');
});
t('★ watchlist label on filter tab',   () => has('★ watchlist'));

// ── Finnhub key fix ──────────────────────────────────────────────────────────
console.log('\n── Finnhub key');
t('saveFinnhubKeySetting calls renderDetail after save', () => {
  const idx = src.indexOf('function saveFinnhubKeySetting');
  const body = src.slice(idx, idx + 400);
  if (!body.includes('renderDetail')) throw new Error('renderDetail not called after save — insights tab stays stale');
});
t('clearFinnhubKey calls renderDetail after clear', () => {
  const idx = src.indexOf('function clearFinnhubKey');
  const body = src.slice(idx, idx + 400);
  if (!body.includes('renderDetail')) throw new Error('renderDetail not called after clear');
});
t('hasFinnhub reads from localStorage in renderInsightsTab', () => {
  const idx = src.indexOf('function renderInsightsTab');
  const body = src.slice(idx, idx + 300);
  if (!body.includes("localStorage.getItem('finnhub_key')")) throw new Error('hasFinnhub not reading from localStorage');
});

// ── Browser fetch fallback ───────────────────────────────────────────────────
console.log('\n── Browser fetch fallback (job posting)');
t('refetchPosting tries server first then browser', () => {
  const idx = src.indexOf('async function refetchPosting');
  const body = src.slice(idx, idx + 4000);
  if (!body.includes('/api/parse-job')) throw new Error('missing server-side parse-job call');
  if (!body.includes('_browserFetchPosting')) throw new Error('missing browser fetch fallback');
});
t('_browserFetchPosting defined with chrome.tabs', () => {
  has('async function _browserFetchPosting');
  const idx = src.indexOf('async function _browserFetchPosting');
  const body = src.slice(idx, idx + 600);
  if (!body.includes('chrome.tabs')) throw new Error('chrome.tabs not used');
  // extractJob message is in _browserFetchPosting (separate function)
});
t('_browserFetchPosting checks chrome availability', () => {
  const idx = src.indexOf('async function _browserFetchPosting');
  const body = src.slice(idx, idx + 300);
  if (!body.includes("typeof chrome === 'undefined'")) throw new Error('no chrome availability check');
});
t('refetchPosting has helpful fallback UI for blocked sites', () => {
  const idx = src.indexOf('async function refetchPosting');
  const body = src.slice(idx, idx + 4000);
  if (!body.includes('Open job page')) throw new Error('no helpful fallback message');
  if (!body.includes("target=\"_blank\"")) throw new Error('no open-in-tab link');
});
t('refetchPosting closes background tab after extraction', () => {
  const idx = src.indexOf('async function _browserFetchPosting');
  const body = src.slice(idx, idx + 800);
  if (!body.includes('chrome.tabs.remove')) throw new Error('background tab not closed');
});

// ── Help in sidebar ──────────────────────────────────────────────────────────
console.log('\n── Help in sidebar');
t('Help button in sidebar action buttons', () => {
  // Must be a sidebar-action-btn with data-section="help" calling showHelp()
  const sidebarStart = src.indexOf('class="sidebar-action-btns"');
  const sidebarEnd   = src.indexOf('</div>', sidebarStart + 100) + 6;
  const bar = src.slice(sidebarStart, sidebarEnd + 600); // wide enough to catch all buttons
  if (!bar.includes("data-section=\"help\"")) throw new Error('no data-section=help in sidebar');
  if (!bar.includes("showHelp()"))           throw new Error('no showHelp() call in sidebar');
});
t('showHelp() function exists', () => has('function showHelp()'));
t('showHelp() calls openSection("help")', () => {
  const idx  = src.indexOf('function showHelp()');
  const body = src.slice(idx, idx + 200);
  if (!body.includes("openSection('help')")) throw new Error('openSection not called');
});
t('Help removed from settings nav', () => not('snav-help'));
t('Settings Help pane has redirect to sidebar', () => {
  const idx  = src.indexOf('id="spane-help"');
  const body = src.slice(idx, idx + 600);
  if (!body.includes('showHelp()')) throw new Error('no showHelp link in settings pane');
});
