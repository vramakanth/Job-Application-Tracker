/**
 * Summit — Frontend Smoke Tests
 * Runs in Node — no browser needed.
 * Catches mismatched onclick="X()" vs function X() bugs.
 *
 * Run: cd frontend/tests && npm install && npm test
 */

const fs = require('fs');
const path = require('path');

const HTML_PATH = path.join(__dirname, '../public/index.html');
const html = fs.readFileSync(HTML_PATH, 'utf8');

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Extract all function names defined in the inline <script> block */
function getDefinedFunctions(html) {
  const scriptMatch = html.match(/<script[^>]*>([\s\S]*?)<\/script>/);
  if (!scriptMatch) return new Set();
  const script = scriptMatch[1];
  const fns = new Set();
  // function foo(  async function foo(
  for (const m of script.matchAll(/(?:async\s+)?function\s+(\w+)\s*\(/g)) fns.add(m[1]);
  // const foo = (  const foo = async (  const foo = function
  for (const m of script.matchAll(/(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?(?:function|\(|async\s*\()/g)) fns.add(m[1]);
  return fns;
}

/** Extract all onclick="X()" calls from HTML (not inside <script>) */
function getOnclickCalls(html) {
  const htmlOnly = html.replace(/<script[\s\S]*?<\/script>/g, '');
  const calls = [];
  for (const m of htmlOnly.matchAll(/onclick="([^"]+)"/g)) {
    // Extract function name from things like: doLogin(), showScreen('login'), etc.
    const fnMatch = m[1].match(/^(\w+)\s*\(/);
    if (fnMatch) calls.push({ call: fnMatch[1], raw: m[1] });
    // Also catch: if(event.key==='Enter')doLogin()
    const enterMatch = m[1].match(/\)(\w+)\s*\(/);
    if (enterMatch) calls.push({ call: enterMatch[1], raw: m[1] });
  }
  return calls;
}

const defined = getDefinedFunctions(html);
const onclicks = getOnclickCalls(html);

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Frontend — button/function wiring', () => {
  // Deduplicate, ignore built-ins
  const builtins = new Set(['event', 'this', 'document', 'window', 'location', 'history', 'setTimeout', 'clearTimeout']);
  const unique = [...new Map(onclicks.map(o => [o.call, o])).values()]
    .filter(o => !builtins.has(o.call));

  it('has onclick handlers to check', () => {
    expect(unique.length).toBeGreaterThan(10);
  });

  // Generate one test per unique function call
  unique.forEach(({ call, raw }) => {
    it(`onclick="${raw}" → function ${call}() is defined`, () => {
      expect(defined.has(call)).toBe(true);
    });
  });
});

describe('Frontend — critical auth elements', () => {
  it('has #screen-login', () => expect(html).toContain('id="screen-login"'));
  it('has #screen-register', () => expect(html).toContain('id="screen-register"'));
  it('has #screen-landing', () => expect(html).toContain('id="screen-landing"'));
  it('has #screen-app', () => expect(html).toContain('id="screen-app"'));
  it('has #login-btn', () => expect(html).toContain('id="login-btn"'));
  it('has #register-btn', () => expect(html).toContain('id="register-btn"'));
  it('has #login-username', () => expect(html).toContain('id="login-username"'));
  it('has #login-password', () => expect(html).toContain('id="login-password"'));
  it('has #reg-username', () => expect(html).toContain('id="reg-username"'));
  it('has #reg-password', () => expect(html).toContain('id="reg-password"'));
  it('has #reg-confirm', () => expect(html).toContain('id="reg-confirm"'));
});

describe('Frontend — critical app elements', () => {
  it('has #job-list', () => expect(html).toContain('id="job-list"'));
  it('has #add-modal', () => expect(html).toContain('id="add-modal"'));
  it('has #job-url input', () => expect(html).toContain('id="job-url"'));
  it('has #user-name-display', () => expect(html).toContain('id="user-name-display"'));
  it('has logout button calling doLogout', () => expect(html).toContain('doLogout()'));
});

describe('Frontend — branding', () => {
  it('title is Summit', () => expect(html).toContain('<title>Summit'));
  it('no Pursuit branding remains', () => expect(html).not.toContain('Pursuit'));
  it('has Summit in h1 or logo', () => expect(html).toMatch(/>Summit</));
});

describe('Frontend — mountain background', () => {
  it('has mountain-bg element', () => expect(html).toContain('id="mountain-bg"'));
  it('uses real Unsplash photo', () => expect(html).toContain('unsplash.com'));
  it('applies grayscale filter for duotone', () => expect(html).toContain('grayscale(100%)'));
  it('applies multiply blend for split-tone', () => expect(html).toContain('mix-blend-mode:multiply'));
});

// ─── Regression tests for known bugs ─────────────────────────────────────────

describe('Regression — auth button wiring (known breakage pattern)', () => {
  it('login button calls doLogin not login', () => {
    expect(html).toContain('onclick="doLogin()"');
    expect(html).not.toContain('onclick="login()"');
  });

  it('register button calls doRegister not register', () => {
    expect(html).toContain('onclick="doRegister()"');
    expect(html).not.toContain('onclick="register()"');
  });

  it('save job button calls addJob not createJob', () => {
    expect(html).toContain('onclick="addJob()"');
    expect(html).not.toContain('onclick="createJob()"');
  });

  it('enter key on login password calls doLogin', () => {
    expect(html).toContain("Enter')doLogin()");
    expect(html).not.toContain("Enter')login()");
  });

  it('enter key on register confirm calls doRegister', () => {
    expect(html).toContain("Enter')doRegister()");
    expect(html).not.toContain("Enter')register()");
  });
});

describe('Regression — extract-fields field name', () => {
  it('frontend sends postingText not text to extract-fields', () => {
    // The critical fix: frontend was sending {text: ...} but server reads postingText
    expect(html).toContain("postingText: text.slice");
    expect(html).not.toContain("body: JSON.stringify({ url, text: text.slice");
  });
});

describe('Regression — landing page CTAs', () => {
  const idx = html.indexOf('id="screen-landing"');
  const end = html.indexOf('id="screen-login"', idx);
  const landing = html.slice(idx, end);

  it('no Pursuit branding anywhere', () => expect(html).not.toContain('Pursuit'));
  it('landing has Get started CTA', () => expect(landing).toMatch(/Get started/));
  it('landing has Sign in CTA', () => expect(landing).toMatch(/Sign in/));
});

describe('Regression — showScreen displayMap', () => {
  it('app screen uses flex not empty string (empty string is falsy)', () => {
    // The bug: displayMap = {app:''} then (displayMap['app'] || 'block') = 'block'
    // which makes screen-app display:block, breaking the flex layout
    expect(html).toContain("app:'flex'");
    expect(html).not.toContain("app:''");
  });
});

describe('Regression — extension download', () => {
  it('downloadExtension function is defined in JS', () => {
    expect(html).toContain('function downloadExtension()');
  });

  it('extension download button calls downloadExtension()', () => {
    expect(html).toContain('onclick="downloadExtension()"');
  });

  it('extension folder name is summit-extension (not applied-extension)', () => {
    expect(html).toContain('summit-extension');
    expect(html).not.toContain('applied-extension');
  });
});

describe('Regression — add job modal wiring', () => {
  it('add-modal exists', () => expect(html).toContain('id="add-modal"'));

  it('save job button calls addJob() not createJob()', () => {
    expect(html).toContain('onclick="addJob()"');
    expect(html).not.toContain('onclick="createJob()"');
  });

  it('parseJobUrl sends postingText field (not text) to extract-fields', () => {
    expect(html).toContain('postingText: text.slice');
    expect(html).not.toContain('body: JSON.stringify({ url, text: text.slice');
  });
});

describe('Regression — layout: app screen flex', () => {
  it("displayMap sets app to 'flex' not '' (empty string is falsy, causes block layout)", () => {
    expect(html).toContain("app:'flex'");
    expect(html).not.toContain("app:''");
  });
});

// ─── Regression: 8-item fixes ─────────────────────────────────────────────────

describe('Regression — analytics no close button', () => {
  it('closeAnalytics() not called from renderAnalytics header (section view has no close)', () => {
    // The × button was removed — analytics is now embedded in #section-view
    const analyticsIdx = html.indexOf('Analytics Dashboard');
    const nextSection = html.indexOf('function closeAnalytics', analyticsIdx);
    // The header section (within 500 chars of the title) should not have closeAnalytics onclick
    const headerSlice = html.slice(analyticsIdx, analyticsIdx + 500);
    expect(headerSlice).not.toContain('onclick="closeAnalytics()"');
  });
});

describe('Regression — Files tab removed', () => {
  it('Files tab not in detail tabs row', () => {
    // The Files tab div should be gone
    expect(html).not.toContain("onclick=\"switchTab('files')\"");
  });

  it('Files not in tab render chain', () => {
    // Should not fall back to renderFilesTab in the chain
    expect(html).not.toContain("activeDetailTab==='files' ? renderFilesTab");
  });
});

describe('Regression — sidebar button labels', () => {
  it('sidebar button says Library not Documents', () => {
    // The sidebar action button for the library section should say Library
    const btnIdx = html.indexOf("data-section=\"library\"");
    const btnSlice = html.slice(btnIdx, btnIdx + 400); // SVG is long, need wider window
    expect(btnSlice).toContain('Library');
    expect(btnSlice).not.toContain('>Documents<');
  });
});

describe('Regression — interview questions API', () => {
  it('request body includes count and existingQuestions fields', () => {
    expect(html).toContain('existingQuestions: existing.map(q => q.question)');
    expect(html).toContain('count: isAdding ? 10 : 15');
  });

  it('no self-referential postingText bug', () => {
    // Was: postingText: j.postingText || j.postingText (bug — references itself)
    expect(html).not.toContain('postingText: j.postingText || j.postingText');
    expect(html).toContain("postingText: j.postingText || ''");
  });
});

describe('Regression — job posting HTML rendering', () => {
  it('buildPostingHtml prefers clean text over raw HTML', () => {
    // The new code checks for substantial postingText first
    expect(html).toContain('const cleanText = j.postingText && j.postingText.length > 200');
  });

  it('strips HTML tags from postingText before display', () => {
    expect(html).toContain("replace(/<[^>]+>/g, ' ')");
  });
});

describe('Regression — encryption always on', () => {
  it('enc-upgrade-area removed from settings UI', () => {
    // The enable-encryption upgrade path should be gone
    expect(html).not.toContain('<div id="enc-upgrade-area"></div>');
  });
});

describe('Regression — workforce demographics', () => {
  it('renderAgeDistribution function defined', () => {
    expect(html).toContain('function renderAgeDistribution(wf)');
  });

  it('age brackets rendered (under30, 30to40, 40to50, over50)', () => {
    expect(html).toContain("key: 'under30'");
    expect(html).toContain("key: '30to40'");
    expect(html).toContain("key: 'over50'");
  });

  it('employee growth bar chart rendered from headcountHistory', () => {
    expect(html).toContain('EMPLOYEE GROWTH');
    expect(html).toContain('headcountHistory');
  });
});

// ─── Regression: 6-item fixes ─────────────────────────────────────────────────

describe('Regression — Settings as sidebar section', () => {
  it('settings sidebar-action-btn exists with data-section="settings"', () => {
    expect(html).toContain('data-section="settings"');
    expect(html).toContain('onclick="openSettings()"');
  });

  it('stale jobs button removed from sidebar', () => {
    // data-section="stale" should not be in sidebar-action-btns anymore
    const sidebarIdx = html.indexOf('class="sidebar-action-btns"');
    const sidebarEnd = html.indexOf('<!-- User bar -->', sidebarIdx);
    const sidebar = html.slice(sidebarIdx, sidebarEnd);
    expect(sidebar).not.toContain('data-section="stale"');
    expect(sidebar).not.toContain('showStaleJobs()');
  });

  it('settings panel has slide-in transition', () => {
    expect(html).toContain('settings-panel-inner');
    expect(html).toContain('translateX(100%)');
    expect(html).toContain('transition:transform 0.25s');
  });
});

describe('Regression — Stale as separate boolean field', () => {
  it('stale is NOT in STATUSES (it is a separate field, not a status)', () => {
    // stale is now j.stale boolean, not in the status dropdown
    expect(html).not.toContain(",'stale']");
    // STATUSES should end with expired
    expect(html).toContain("'expired']");
  });

  it('stale filter tab exists (filters on j.stale===true)', () => {
    expect(html).toContain("setFilter('stale')");
  });

  it('filter logic uses j.stale field not j.status', () => {
    expect(html).toContain("currentFilter === 'stale') { if (!j.stale)");
  });

  it('stale badge shown in job list when j.stale===true', () => {
    expect(html).toContain("j.stale ? '<span");
    expect(html).toContain("stale</span>'");
  });

  it('toggleStale function defined', () => {
    expect(html).toContain('function toggleStale(jobId)');
  });

  it('toggleStale sets staledByUser flag', () => {
    expect(html).toContain('j.staledByUser = true');
    expect(html).toContain('j.staledByUser = false');
  });

  it('stale toggle button rendered in detail header', () => {
    expect(html).toContain("toggleStale('${j.id}')");
  });

  it('auto-check checks staledByUser before overwriting', () => {
    expect(html).toContain('!j.staledByUser');
  });

  it('auto-check sets j.stale not j.status', () => {
    expect(html).toContain('j.stale = true');
    // Should NOT set stale as status
    expect(html).not.toContain("j.status = 'stale'");
  });

  it('stale not a color in statusColor function', () => {
    // statusColor only covers actual statuses
    const scIdx = html.indexOf('function statusColor');
    const scSlice = html.slice(scIdx, scIdx + 250);
    expect(scSlice).not.toContain("stale:'#ea580c'");
  });

  it('auto-check toggle exists in settings', () => {
    expect(html).toContain('auto-check-toggle');
    expect(html).toContain('JOB POSTING AUTO-CHECK');
  });

  it('autoCheckStaleJobs function defined', () => {
    expect(html).toContain('function autoCheckStaleJobs()');
  });

  it('setAutoCheck function defined', () => {
    expect(html).toContain('function setAutoCheck(enabled)');
  });
});

describe('Regression — Landing page icons', () => {
  it('feature card icons use currentColor not hardcoded orange', () => {
    const landingIdx = html.indexOf('id="screen-landing"');
    const loginIdx = html.indexOf('id="screen-login"');
    const landing = html.slice(landingIdx, loginIdx);
    // Should not have hardcoded orange stroke in feature SVGs
    expect(landing).not.toContain('stroke="#e8a838"');
    // Should have currentColor
    expect(landing).toContain('stroke="currentColor"');
  });
});

describe('Regression — Mobile transitions', () => {
  it('settings panel uses CSS transform transition (consistent with other sections)', () => {
    expect(html).toContain("transition:transform 0.25s cubic-bezier(0.4,0,0.2,1)");
  });
});
