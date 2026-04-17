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

// ── Landing page features (editorial layout) ────────────────────────────────
console.log('\n── Feature sections');
t('I. Company intelligence',      () => has('Company intelligence'));
t('II. Compensation research',    () => has('Compensation research'));
t('III. Resume tailoring',        () => has('Resume tailoring'));
t('IV. Interview prep',           () => has('Interview prep'));
t('V. Pipeline tracking',         () => has('Pipeline tracking'));
t('VI. Library section',          () => has('>Library</h3>'));
t('Features ordered I → II → III → IV → V → VI', () => {
  const order = ['Company intelligence','Compensation research','Resume tailoring','Interview prep','Pipeline tracking','>Library</h3>'];
  const idxs = order.map(s => src.indexOf(s));
  for (let i = 1; i < idxs.length; i++) {
    if (idxs[i] < 0)          throw new Error('missing: ' + order[i]);
    if (idxs[i] <= idxs[i-1]) throw new Error('order wrong at ' + order[i]);
  }
});
t('No Roman numeral markers in features (removed)', () => {
  // Roman numerals used to live as standalone <div> markers with amber 0.25em letter-spacing.
  // Feature titles must not carry per-section roman numerals anymore.
  if (/letter-spacing:0\.25em">(?:I|II|III|IV|V|VI)</.test(src)) {
    throw new Error('roman numeral marker still present');
  }
});
t('No per-column top rules above features', () => {
  // The per-column amber hairline was: border-top:1px solid rgba(232,168,56,0.3)
  if (src.includes('border-top:1px solid rgba(232,168,56,0.3)')) {
    throw new Error('per-column amber top rule still present');
  }
});
t('No feature cards (glass/backdrop-filter tile pattern removed)', () => {
  if (src.includes('backdrop-filter:blur(14px)')) throw new Error('old card pattern still present');
});
t('No legacy tile SVG icons in landing features', () => {
  if (src.includes('M3 9l9-7 9 7v11')) throw new Error('old house icon still in source');
});
t('Section-opening hairline rule above features (still present)', () => {
  if (!src.includes('border-top:1px solid rgba(242,234,216,0.12)')) throw new Error('section hairline missing');
});
t('No "Formatting preserved"',    () => not('Formatting preserved'));
t('No "Salary intelligence"',     () => not('Salary intelligence'));

// ── Hero: eyebrow + wordmark + tagline ──────────────────────────────────────
console.log('\n── Hero');
t('Eyebrow: "A JOB SEARCH WORKSPACE" above wordmark', () => {
  if (!src.includes('A JOB SEARCH WORKSPACE')) throw new Error('eyebrow missing');
  // Must come before the Summit wordmark in source order
  const eb = src.indexOf('A JOB SEARCH WORKSPACE');
  const wm = src.indexOf('>Summit</h1>');
  if (eb < 0 || wm < 0 || eb > wm) throw new Error('eyebrow not above wordmark');
});
t('Eyebrow uses mono + amber', () => {
  const idx = src.indexOf('A JOB SEARCH WORKSPACE');
  const tag = src.slice(Math.max(0, idx - 300), idx);
  if (!tag.includes('var(--mono)')) throw new Error('eyebrow not in mono');
  if (!tag.includes('#e8a838'))     throw new Error('eyebrow not amber');
});

// ── Landing hero tagline (mountaineering, not SaaS product-bullets) ─────────
console.log('\n── Hero tagline');
t('New tagline: Study the mountain',   () => has('Study the mountain'));
t('New tagline: Prepare the climb',    () => has('Prepare the climb'));
t('New tagline: Reach the summit',     () => has('Reach the summit'));
t('Old SaaS tagline removed: "Track every application"', () => not('Track every application'));
t('Old SaaS tagline removed: "Tailor every resume"',     () => not('Tailor every resume'));
t('Old SaaS tagline removed: "Land the role"',           () => not('Land the role'));

// ── Footer colophon (no CTA — sticky nav handles conversion) ───────────────
console.log('\n── Footer colophon');
t('No "Begin the climb" CTA button',   () => not('Begin the climb'));
t('No "Get started for free" CTA',     () => not('Get started for free'));
t('No "No credit card" pitch text',    () => not('NO CREDIT CARD'));
t('JOBSUMMIT.APP colophon present',    () => has('JOBSUMMIT.APP'));
t('No section rule framing the old CTA', () => {
  // That framing rule was the only 0.08-opacity border on the page
  if (src.includes('border-top:1px solid rgba(242,234,216,0.08)')) {
    throw new Error('old CTA-framing rule still present');
  }
});

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

// ── Typography (Fraunces + Lato) ────────────────────────────────────────────
console.log('\n── Typography');
t('Google Fonts loads Fraunces',        () => has('family=Fraunces'));
t('Google Fonts loads Lato',            () => has('Lato:'));
t('Google Fonts loads DM Mono',         () => has('DM+Mono'));
t('No DM Sans reference',               () => not('DM+Sans'));
t('No Geist font reference',            () => { if (/'Geist'|"Geist"/.test(src)) throw new Error('Geist still referenced'); });
t('--font-display CSS var declared',    () => has('--font-display:'));
t('--font uses Lato',                   () => { if (!/--font:\s*'Lato'/.test(src)) throw new Error('--font not Lato'); });
t('.detail-title uses display serif',   () => {
  const m = src.match(/\.detail-title\s*\{[^}]*\}/);
  if (!m || !m[0].includes('var(--font-display)')) throw new Error('.detail-title missing font-display');
});
t('.auth-heading uses display serif',   () => {
  const m = src.match(/\.auth-heading\s*\{[^}]*\}/);
  if (!m || !m[0].includes('var(--font-display)')) throw new Error('.auth-heading missing font-display');
});
t('.modal-title uses display serif',    () => {
  const m = src.match(/\.modal-title\s*\{[^}]*\}/);
  if (!m || !m[0].includes('var(--font-display)')) throw new Error('.modal-title missing font-display');
});
t('.insight-card-value uses display serif', () => {
  const m = src.match(/\.insight-card-value\s*\{[^}]*\}/);
  if (!m || !m[0].includes('var(--font-display)')) throw new Error('.insight-card-value missing font-display');
});
t('.auth-logo-text uses display serif', () => {
  const m = src.match(/\.auth-logo-text\s*\{[^}]*\}/);
  if (!m || !m[0].includes('var(--font-display)')) throw new Error('.auth-logo-text missing font-display');
});
t('.empty-state h2 uses display serif', () => {
  const m = src.match(/\.empty-state h2\s*\{[^}]*\}/);
  if (!m || !m[0].includes('var(--font-display)')) throw new Error('.empty-state h2 missing font-display');
});
t('Landing hero <h1>Summit uses display serif', () => {
  const idx = src.indexOf('>Summit</h1>');
  if (idx < 0) throw new Error('Summit <h1> not found');
  const tag = src.slice(Math.max(0, idx - 400), idx);
  if (!tag.includes('var(--font-display)')) throw new Error('hero h1 missing font-display');
});
t('font-optical-sizing enabled on body', () => has('font-optical-sizing: auto'));
t('text-rendering optimizeLegibility on body', () => has('text-rendering: optimizeLegibility'));

// ── User settings sync (Finnhub key server-synced via zero-knowledge) ──────
console.log('\n── User settings sync');
t('SYNCED_SETTING_KEYS array declared',      () => has('SYNCED_SETTING_KEYS ='));
t('finnhub_key listed in SYNCED_SETTING_KEYS', () => {
  const m = src.match(/SYNCED_SETTING_KEYS\s*=\s*\[([^\]]+)\]/);
  if (!m || !m[1].includes("'finnhub_key'")) throw new Error('finnhub_key not in SYNCED_SETTING_KEYS');
});
t('loadUserSettings() function exists',      () => has('async function loadUserSettings()'));
t('saveUserSettings() function exists',      () => has('async function saveUserSettings()'));
t('loadUserSettings hits /api/user-settings', () => {
  const idx = src.indexOf('async function loadUserSettings');
  const body = src.slice(idx, idx + 2000);
  if (!body.includes("'/api/user-settings'")) throw new Error('wrong endpoint');
});
t('loadUserSettings handles 404 as migration', () => {
  const idx = src.indexOf('async function loadUserSettings');
  const body = src.slice(idx, idx + 2000);
  if (!body.includes('404')) throw new Error('no 404 branch');
  if (!body.includes('saveUserSettings()')) throw new Error('404 branch does not push localStorage up');
});
t('loadUserSettings decrypts for zero-knowledge accounts', () => {
  const idx = src.indexOf('async function loadUserSettings');
  const body = src.slice(idx, idx + 2000);
  if (!body.includes('CryptoEngine.decrypt(dataKey')) throw new Error('no client-side decrypt');
});
t('loadUserSettings removes cleared keys from localStorage (clear propagation)', () => {
  const idx = src.indexOf('async function loadUserSettings');
  const body = src.slice(idx, idx + 2000);
  if (!body.includes('localStorage.removeItem(k)')) throw new Error('missing clear-propagation');
});
t('saveUserSettings encrypts for zero-knowledge accounts', () => {
  const idx = src.indexOf('async function saveUserSettings');
  const body = src.slice(idx, idx + 1200);
  if (!body.includes('isEncrypted && dataKey')) throw new Error('no encrypted branch');
  if (!body.includes('CryptoEngine.encrypt(dataKey')) throw new Error('no client-side encrypt');
  if (!body.includes('__enc: true')) throw new Error('no __enc wrapper');
});
t('saveUserSettings PUTs to /api/user-settings', () => {
  const idx = src.indexOf('async function saveUserSettings');
  const body = src.slice(idx, idx + 1200);
  if (!body.includes("method: 'PUT'") && !body.includes('method:"PUT"')) throw new Error('not PUT');
  if (!body.includes("'/api/user-settings'")) throw new Error('wrong endpoint');
});
t('saveFinnhubKeySetting calls saveUserSettings', () => {
  const idx = src.indexOf('function saveFinnhubKeySetting');
  const body = src.slice(idx, idx + 600);
  if (!body.includes('saveUserSettings()')) throw new Error('no sync call on save');
});
t('clearFinnhubKey calls saveUserSettings', () => {
  const idx = src.indexOf('function clearFinnhubKey');
  const body = src.slice(idx, idx + 400);
  if (!body.includes('saveUserSettings()')) throw new Error('no sync call on clear');
});
t('loadUserSettings wired into session restore', () => {
  // The page-load branch: if (token && currentUser) { ... loadUserSettings(); }
  const m = src.match(/if \(token && currentUser\) \{[^}]*loadUserSettings\(\)[^}]*\}/);
  if (!m) throw new Error('loadUserSettings not called on session restore');
});
t('loadUserSettings wired into login success', () => {
  const idx = src.indexOf('async function doLogin');
  const body = src.slice(idx, idx + 3000);
  if (!body.includes('loadUserSettings()')) throw new Error('loadUserSettings not called after login');
});
t('enableEncryption re-encrypts settings after upgrade', () => {
  const idx = src.indexOf('async function enableEncryption');
  const body = src.slice(idx, idx + 3500);
  if (!body.includes('saveUserSettings()')) throw new Error('no saveUserSettings call after upgrade');
});
