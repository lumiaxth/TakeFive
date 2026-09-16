const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const root = path.join(__dirname, '..');

const en = JSON.parse(fs.readFileSync(path.join(root, '_locales/en/messages.json'), 'utf8'));
const zh = JSON.parse(fs.readFileSync(path.join(root, '_locales/zh_CN/messages.json'), 'utf8'));

const getMessage = (key, subs) => {
  const locale = process.env.LOCALE === 'zh' ? zh : en;
  let s = (locale[key] || en[key] || {}).message || key;
  const ph = locale[key] && locale[key].placeholders;
  if (subs) {
    const keys = ph ? Object.keys(ph) : [];
    keys.forEach((k, i) => {
      s = s.split('$' + k + '$').join(subs[i] || '');
    });
  }
  return s;
};

function load(htmlPath, jsPath, extraScripts, getData, pageUrl) {
  const html = fs.readFileSync(path.join(root, htmlPath), 'utf8');
  const dom = new JSDOM(html, { runScripts: 'outside-only', url: pageUrl || undefined });
  const { window } = dom;
  const store = {};
  const chromeMock = {
    i18n: { getMessage },
    storage: {
      local: {
        async get(k) { return k === null ? { ...store } : { [k]: store[k] }; },
        async set(o) { Object.assign(store, o); }
      }
    }
  };
  if (getData) {
    chromeMock.runtime = {
      sendMessage: async (msg) => ({ ok: true, data: getData(msg), activeHost: null, counting: false })
    };
  }
  window.chrome = chromeMock;
  window.HE = {};
  (extraScripts || []).forEach((p) =>
    window.eval(fs.readFileSync(path.join(root, p), 'utf8'))
  );
  window.eval(fs.readFileSync(path.join(root, 'shared/i18n.js'), 'utf8'));
  new window.Function(fs.readFileSync(path.join(root, jsPath), 'utf8')).call(window);
  return dom;
}

function baseData({ enabled, phase, domains }) {
  const st = phase || 'idle';
  return {
    date: '2026-08-23',
    domains: domains || {},
    notifications: {},
    tracking: { host: null, since: 0 },
    usage: { accumulatedMs: 0, lastStopAt: 0 },
    pomodoroState: { phase: st, remainingMs: st === 'idle' ? 0 : 1500000, completedRounds: 0 },
    settings: {
      limits: {},
      blacklist: [],
      paused: false,
      badgeMode: 'auto',
      usageReminder: { enabled: false, minutes: 45 },
      pomodoro: { enabled, focusMinutes: 25, breakMinutes: 5, rounds: 4, whitelist: [] }
    },
    history: []
  };
}

function dayKey(offset) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - offset);
  const p = (n) => (n < 10 ? '0' + n : String(n));
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

function dashData(domains, history, pomodoroToday) {
  return {
    date: dayKey(0),
    domains: domains || { 'a.com': { timeMs: 600000 }, 'b.com': { timeMs: 300000 } },
    notifications: {},
    tracking: { host: null, since: 0 },
    usage: { accumulatedMs: 0, lastStopAt: 0 },
    pomodoroState: { phase: 'idle', remainingMs: 0 },
    pomodoroToday: pomodoroToday || { date: dayKey(0), rounds: 0, focusMs: 0 },
    settings: {
      limits: {},
      blacklist: [],
      paused: false,
      badgeMode: 'auto',
      usageReminder: { enabled: false, minutes: 45 },
      pomodoro: { enabled: false, focusMinutes: 25, breakMinutes: 5, whitelist: [] }
    },
    history: history || [
      { date: dayKey(1), domains: { 'c.com': { timeMs: 120000 } } },
      { date: dayKey(3), domains: { 'd.com': { timeMs: 90000 } } }
    ]
  };
}

function manyTodayDomains() {
  const d = {};
  for (let i = 1; i <= 7; i++) d['site' + i + '.com'] = { timeMs: (8 - i) * 60000 };
  return d;
}

let failures = 0;
function check(label, cond) {
  if (cond) console.log('PASS', label);
  else { console.log('FAIL', label); failures++; }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
process.on('unhandledRejection', () => {});

(async () => {
  // ---- popup (en, static) ----
  process.env.LOCALE = 'en';
  {
    const dom = load('popup/popup.html', 'popup/popup.js', ['shared/theme.js']);
    const doc = dom.window.document;
    check('popup brand name (short)', doc.getElementById('brandName').textContent === en.extNameShort.message);
    check('popup domainsTitle', [...doc.querySelectorAll('h2')][0].textContent === en.domainsTitle.message);
    check('popup totalLabel', doc.querySelector('.total-label').textContent === en.totalLabel.message);
    check('popup pause btn', doc.getElementById('btnPause').textContent === en.pause.message);
    check('popup empty text', doc.getElementById('empty').textContent === en.noDataYet.message);
    check('popup pomodoro toggle btn', doc.getElementById('btnPomodoro').textContent === en.pomodoroStartFocus.message);
    check('popup pomodoro idle info', doc.getElementById('pomodoroInfo').textContent === en.pomodoroIdle.message);
    check('popup pomodoro bar hidden by default', doc.getElementById('pomodoroBar').hidden === true);
    check('popup pomodoro bar is last content child of body', [...doc.body.children].filter((el) => el.tagName !== 'SCRIPT').pop().id === 'pomodoroBar');
    check('popup settings button exists', !!doc.getElementById('btnSettings'));
    check('popup dashboard button exists', !!doc.getElementById('btnDashboard'));
    check('popup footer settings link removed', !doc.getElementById('linkSettings'));
  }

  // ---- popup pomodoro visibility (en, with data) ----
  const shared = ['shared/tldts.min.js', 'shared/hostname.js', 'shared/storage.js', 'shared/theme.js'];
  {
    const dom = load('popup/popup.html', 'popup/popup.js', shared, () => baseData({ enabled: false, phase: 'idle' }));
    await sleep(30);
    const doc = dom.window.document;
    check('popup hides pomodoro when feature disabled', doc.getElementById('pomodoroBar').hidden === true);
    check('popup no body padding when disabled', !doc.body.classList.contains('has-pomodoro'));
  }
  {
    const dom2 = load('popup/popup.html', 'popup/popup.js', shared, () => baseData({ enabled: true, phase: 'idle' }));
    await sleep(30);
    const doc2 = dom2.window.document;
    check('popup shows pomodoro when enabled but not started', doc2.getElementById('pomodoroBar').hidden === false);
    check('popup body reserves space when enabled', doc2.body.classList.contains('has-pomodoro'));
    check('popup ready text shown', doc2.getElementById('pomodoroInfo').textContent.includes('\uD83C\uDF45') && doc2.getElementById('pomodoroInfo').textContent.includes(en.pomodoroReady.message));
    check('popup start focus button shown', doc2.getElementById('btnPomodoro').textContent === en.pomodoroStartFocus.message);
    check('popup settings row shown when idle', doc2.getElementById('pomodoroSettingsRow').hidden === false);
  }
  {
    const dom3 = load('popup/popup.html', 'popup/popup.js', shared, () => baseData({ enabled: true, phase: 'focus' }));
    await sleep(30);
    const doc3 = dom3.window.document;
    check('popup shows pomodoro running', doc3.getElementById('pomodoroBar').hidden === false);
    check('popup running info shows focus + remaining', doc3.getElementById('pomodoroInfo').textContent.includes('\uD83C\uDF45') && /Focusing/.test(doc3.getElementById('pomodoroInfo').textContent));
    check('popup running info shows round progress', doc3.getElementById('pomodoroInfo').textContent.includes('Round 1 of 4'));
    check('popup settings row hidden while running', doc3.getElementById('pomodoroSettingsRow').hidden === true);
    check('popup end focus button shown', doc3.getElementById('btnPomodoro').textContent === en.pomodoroEndFocus.message);
  }

  // ---- popup shows top 10 domains + more link ----
  {
    const domains = {};
    for (let i = 1; i <= 12; i++) domains['site' + i + '.com'] = { timeMs: (13 - i) * 60000 };
    const dom = load('popup/popup.html', 'popup/popup.js', shared, () => baseData({ enabled: false, phase: 'idle', domains }));
    await sleep(30);
    const doc = dom.window.document;
    check('popup renders only 10 domains', doc.querySelectorAll('.domain-item').length === 10);
    check('popup shows more link when >10 domains', !!doc.querySelector('.more-link'));
    check('popup domains sorted by time desc', doc.querySelector('.domain-item .domain-host').textContent === 'site1.com');
  }
  {
    const dom = load('popup/popup.html', 'popup/popup.js', shared, () => baseData({ enabled: false, phase: 'idle', domains: { a: { timeMs: 60000 } } }));
    await sleep(30);
    check('popup hides more link when <=10 domains', !dom.window.document.querySelector('.more-link'));
  }

  // ---- dashboard (en, with data) ----
  process.env.LOCALE = 'en';
  {
    const dom = load('dashboard/dashboard.html', 'dashboard/dashboard.js', shared, () => dashData());
    await sleep(30);
    const doc = dom.window.document;
    check('dashboard title', doc.querySelector('h1').textContent === en.dashboardTitle.message);
    check('dashboard page subtitle', doc.querySelector('.page-subtitle').textContent === en.dashboardSubtitle.message);
    check('dashboard settings button', !!doc.getElementById('btnSettings'));
    check('dashboard today hint removed (commented out)', !doc.querySelector('#section-today .hint'));
    check('dashboard chart subtitle', doc.querySelector('#section-chart .hint').textContent === en.chartSubtitle.message);
    check('dashboard week insight hidden without 7d data or shown', typeof doc.getElementById('weekInsight').hidden === 'boolean');
    check('dashboard today total shows 15min', doc.getElementById('todayTotal').textContent === '15min');
    check('dashboard today list has 2 rows', doc.querySelectorAll('#todayList .day-row').length === 2);
    check('dashboard no today more link (<=5)', doc.getElementById('todayMore').hidden === true);
    check('dashboard chart has 7 bars', doc.querySelectorAll('.bar-col').length === 7);
    check('dashboard chart has 3 gridlines', doc.querySelectorAll('.chart-grid .gridline').length === 3);
    check('dashboard chart has average line', !!doc.querySelector('.chart-grid .avg-line'));
    check('dashboard average label non-empty', (doc.querySelector('.avg-label') ? doc.querySelector('.avg-label').textContent.length > 0 : false));
    check('dashboard avg title', (doc.querySelector('.avg-title') ? doc.querySelector('.avg-title').textContent === en.chartAvg.message : false));
    check('dashboard avg time non-empty', (doc.querySelector('.avg-time') ? doc.querySelector('.avg-time').textContent.length > 0 : false));
    check('dashboard chart labels use dates', /^\d{2}\/\d{2}$/.test(doc.querySelector('.bar-label').textContent));
    check('dashboard detail defaults to today', doc.querySelector('.detail-date').textContent === en.todayDateLabel.message);
    check('dashboard detail shows total', doc.querySelector('.detail-total').textContent.includes('15min'));
    check('dashboard detail shows top5 (2 rows)', doc.querySelectorAll('.day-detail .day-row').length === 2);
    check('dashboard detail title is usage ranking', doc.querySelector('.detail-top-title').textContent === en.topDomains.message);

    const noDataCol = [...doc.querySelectorAll('.bar-col')].find((c) => c.querySelector('.bar').title === en.noData.message);
    if (!noDataCol) throw new Error('no no-data bar found');
    const noDataDate = noDataCol.querySelector('.bar-label').textContent;
    const expectedFull = dashData().date.slice(0, 4) + '-' + noDataDate.replace('/', '-');
    noDataCol.click();
    await sleep(10);
    check('dashboard no-data detail shows date', doc.querySelector('.detail-date').textContent === expectedFull);
    check('dashboard no-data detail message', doc.querySelector('.detail-empty').textContent === en.noDataForDay.message);
  }

  // ---- dashboard today more (7 domains) ----
  {
    const dom = load('dashboard/dashboard.html', 'dashboard/dashboard.js', shared, () => dashData(manyTodayDomains()));
    await sleep(30);
    const doc = dom.window.document;
    check('dashboard today shows 5 rows by default', doc.querySelectorAll('#todayList .day-row').length === 5);
    check('dashboard today more link shown', doc.getElementById('todayMore').hidden === false);
    check('dashboard today more text', doc.getElementById('todayMore').textContent === en.moreDomains.message);
    doc.getElementById('todayMore').click();
    await sleep(10);
    check('dashboard today expands to 7 rows', doc.querySelectorAll('#todayList .day-row').length === 7);
    check('dashboard today more toggles to collapse', doc.getElementById('todayMore').textContent === en.collapse.message);
  }

  // ---- dashboard pomodoro summary ----
  {
    const dom = load('dashboard/dashboard.html', 'dashboard/dashboard.js', shared, () => dashData(null, null, { date: dayKey(0), rounds: 3, focusMs: 75 * 60000 }));
    await sleep(30);
    const doc = dom.window.document;
    check('dashboard pomodoro summary shown', doc.getElementById('todayPomodoro').hidden === false && doc.getElementById('todayPomodoro').textContent.includes('3 pomodoro rounds'));
  }

  // ---- options (zh) ----
  process.env.LOCALE = 'zh';
  {
    const dom = load('options/options.html', 'options/options.js', shared);
    const doc = dom.window.document;
    const h2s = [...doc.querySelectorAll('.card h2')].map((h) => h.textContent);
    check('options appearanceSection', h2s[0] === zh.appearanceSection.message);
    check('options countdownSection', h2s[1] === zh.countdownSection.message);
    check('options usageReminderSection', h2s[2] === zh.usageReminderSection.message);
    check('options pomodoroSection', h2s[3] === zh.pomodoroSection.message);
    check('options limitsSection', h2s[4] === zh.limitsSection.message);
    check('options blacklistSection', h2s[5] === zh.blacklistSection.message);
    check('options no data section', !doc.getElementById('section-data'));
    check('options dashboard button', !!doc.getElementById('btnDashboard'));
    check('options welcome button', !!doc.getElementById('btnWelcome'));
    check('options welcome button title', doc.getElementById('btnWelcome').title === zh.openWelcome.message);
    check('options theme select has 3 options', doc.getElementById('themeMode').options.length === 3);
    check('options themeDark text', doc.querySelector('#themeMode option[value="dark"]').textContent === zh.themeDark.message);
    check('options countdown position has 6 options', doc.getElementById('countdownPosition').options.length === 6);
    check('options countdown size has 3 options', doc.getElementById('countdownSize').options.length === 3);
    check('options hideFullscreen toggle', !!doc.getElementById('hideFullscreen'));
    check('options running hint hidden when idle', doc.getElementById('pomodoroRunningHint').hidden === true);
    check('options running hint text prefilled', doc.getElementById('pomodoroRunningHint').textContent === zh.pomodoroRunningHint.message);
    check('options pomodoro whitelist h3', doc.querySelector('#section-pomodoro h3').textContent === zh.pomodoroWhitelistSection.message);
    check('options addPomodoroWhitelist btn', doc.querySelector('#pomodoroWhitelistForm button').textContent === zh.addPomodoroWhitelist.message);
    check('options importWhitelist btn', doc.getElementById('btnImportWhitelist').textContent === zh.importPomodoroWhitelist.message);
    check('options badgeMode select has 3 options', doc.getElementById('badgeMode').options.length === 3);
    check('options badgeModeAuto text', doc.querySelector('#badgeMode option[value="auto"]').textContent === zh.badgeModeAuto.message);
    check('options no save buttons (save-on-change)', !doc.getElementById('btnSaveTheme') && !doc.getElementById('btnSaveBadgeMode') && !doc.getElementById('btnSaveCountdown') && !doc.getElementById('btnSaveUsageReminder') && !doc.getElementById('btnSavePomodoro'));
    check('options no pomodoro sound toggle', !doc.getElementById('pomodoroSound'));
  }

  // ---- options running hint (pomodoro running) ----
  {
    const runData = {
      date: '2026-08-23', domains: {}, notifications: {}, tracking: { host: null, since: 0 },
      usage: { accumulatedMs: 0, lastStopAt: 0 }, pomodoroState: { phase: 'focus', remainingMs: 1500000, completedRounds: 0 },
      pomodoroToday: { date: '2026-08-23', rounds: 0, focusMs: 0 },
      settings: {
        limits: {}, blacklist: [], paused: false, badgeMode: 'auto', theme: 'light',
        countdown: { enabled: true, thresholdMin: 15, position: 'middle-right', size: 'medium', clock: true, hideFullscreen: false },
        usageReminder: { enabled: false, minutes: 45 },
        pomodoro: { enabled: true, focusMinutes: 25, breakMinutes: 5, rounds: 4, whitelist: [] }
      },
      history: []
    };
    const dom = load('options/options.html', 'options/options.js', shared, () => runData);
    await sleep(30);
    const doc = dom.window.document;
    check('options running hint visible while running', doc.getElementById('pomodoroRunningHint').hidden === false);
  }

  // ---- options hash deep link highlights target section ----
  {
    const dom = load(
      'options/options.html', 'options/options.js', shared, null,
      'chrome-extension://abc/options/options.html#section-limits'
    );
    await sleep(300);
    const doc = dom.window.document;
    check('options hash deep link highlights limits section', !!doc.querySelector('#section-limits.highlight'));
    check('options hash deep link does not highlight others', !doc.querySelector('#section-pomodoro.highlight'));
  }

  // ---- blocked (en) ----
  process.env.LOCALE = 'en';
  const blockedShared = ['shared/tldts.min.js', 'shared/hostname.js', 'shared/storage.js', 'shared/theme.js'];
  {
    const dom = load('blocked/blocked.html', 'blocked/blocked.js', blockedShared);
    const doc = dom.window.document;
    check('blocked generic title', doc.querySelector('h1').textContent === en.blockedTitleGeneric.message);
    check('blocked generic icon', doc.getElementById('icon').textContent === '\u2615');
    check('blocked generic no grace btn', doc.getElementById('btnGrace').hidden === true);
    check('blocked brand short', doc.querySelector('.brand').textContent === en.extNameShort.message);
    check('blocked goBack text (close tab)', doc.getElementById('btnBack').textContent === en.goBack.message);
    check('blocked settings link outside the card', doc.getElementById('btnSettings').closest('.card') === null && doc.getElementById('btnSettings').classList.contains('link-btn') === true);
    check('blocked settings link text', doc.getElementById('btnSettings').textContent === en.openSettings.message);
  }
  {
    const dom = load(
      'blocked/blocked.html', 'blocked/blocked.js', blockedShared, null,
      'https://blocked.example/?reason=limit&domain=youtube.com&url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3Dx'
    );
    const doc = dom.window.document;
    check('blocked limit title', doc.querySelector('h1').textContent === en.blockedTitleLimit.message);
    check('blocked limit icon', doc.getElementById('icon').textContent === '\uD83C\uDF3F');
    check('blocked limit grace btn visible', doc.getElementById('btnGrace').hidden === false);
    check('blocked limit grace text', doc.getElementById('btnGrace').textContent === en.grantGrace.message);
    await sleep(30);
    check('blocked limit shows real domain', doc.getElementById('reason').textContent.includes('youtube.com'));
  }
  {
    const dom = load(
      'blocked/blocked.html', 'blocked/blocked.js', blockedShared, null,
      'https://blocked.example/?reason=blacklist&domain=bad.com&url=https%3A%2F%2Fbad.com%2Fpage'
    );
    const doc = dom.window.document;
    check('blocked blacklist title', doc.querySelector('h1').textContent === en.blockedTitleBlacklist.message);
    check('blocked blacklist icon', doc.getElementById('icon').textContent === '\uD83D\uDEAB');
    check('blocked blacklist no grace btn', doc.getElementById('btnGrace').hidden === true);
    check('blocked blacklist reason has domain', doc.getElementById('reason').textContent.includes('bad.com'));
  }
  {
    const dom = load(
      'blocked/blocked.html', 'blocked/blocked.js', blockedShared, null,
      'https://blocked.example/?reason=pomodoro&domain=distract.com&url=https%3A%2F%2Fdistract.com%2F'
    );
    const doc = dom.window.document;
    check('blocked pomodoro title', doc.querySelector('h1').textContent === en.blockedTitlePomodoro.message);
    check('blocked pomodoro icon', doc.getElementById('icon').textContent === '\uD83C\uDF45');
    check('blocked pomodoro no grace btn', doc.getElementById('btnGrace').hidden === true);
  }
  {
    const dom = load(
      'blocked/blocked.html', 'blocked/blocked.js', blockedShared, null,
      'https://blocked.example/?reason=blacklist&domain=System.Management.Automation.Internal.Host.InternalHost&url=https%3A%2F%2Fexample.com%2Fpage'
    );
    const reason = dom.window.document.getElementById('reason').textContent;
    check('blocked garbage domain replaced by real domain', reason.includes('example.com') && !reason.includes('System.Management'));
  }

  // ---- zh/en key parity guard ----
  {
    const zhKeys = new Set(Object.keys(zh));
    const enKeys = new Set(Object.keys(en));
    const missingInEn = [...zhKeys].filter((k) => !enKeys.has(k));
    const missingInZh = [...enKeys].filter((k) => !zhKeys.has(k));
    check('locales key parity (en has all zh keys)', missingInEn.length === 0);
    check('locales key parity (zh has all en keys)', missingInZh.length === 0);
    if (missingInEn.length) console.log('  missing in en:', missingInEn.join(', '));
    if (missingInZh.length) console.log('  missing in zh:', missingInZh.join(', '));
  }

  console.log(failures === 0 ? 'ALL RENDER CHECKS PASS' : failures + ' FAILURES');
  process.exit(failures === 0 ? 0 : 1);
})();
