const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');

let store = {};
const listeners = {};
const redirected = [];
let idleState = 'active';

global.importScripts = () => {};

global.chrome = {
  storage: {
    local: {
      async get(k) {
        if (k === null) return { ...store };
        const out = {};
        if (typeof k === 'string') k = [k];
        for (const x of k) if (x in store) out[x] = store[x];
        return out;
      },
      async set(o) { Object.assign(store, o); },
      async clear() { store = {}; }
    }
  },
  runtime: {
    getURL: (p) => 'chrome-extension://abc/' + p,
    onMessage: { addListener: (fn) => { listeners.onMessage = fn; } },
    onInstalled: { addListener: () => {} },
    sendMessage: async () => {}
  },
  alarms: { onAlarm: { addListener: (fn) => { listeners.alarm = fn; } }, create: () => {} },
  tabs: {
    onActivated: { addListener: (fn) => { listeners.tabActivated = fn; } },
    onUpdated: { addListener: () => {} },
    onRemoved: { addListener: () => {} },
    query: async () => [],
    get: async () => ({ id: 7, url: 'https://example.com/', windowId: 1 }),
    update: async (tabId, opts) => { redirected.push({ tabId, url: opts.url }); },
    sendMessage: async () => {}
  },
  windows: {
    onRemoved: { addListener: () => {} },
    onFocusChanged: { addListener: () => {} },
    getLastFocused: async () => ({ id: 1, focused: true, type: 'normal' })
  },
  idle: { onStateChanged: { addListener: () => {} }, queryState: async () => idleState },
  webNavigation: { onBeforeNavigate: { addListener: (fn) => { listeners.beforeNavigate = fn; } } },
  notifications: { create: () => {}, clear: () => {}, onClicked: { addListener: () => {} } },
  action: { setBadgeText: () => {}, setBadgeBackgroundColor: () => {}, setIcon: () => {}, setBadgeTextColor: () => {} },
  i18n: { getMessage: (k, s) => k + (s ? ':' + s.join(',') : '') }
};

function loadBackground() {
  ['shared/tldts.min.js', 'shared/hostname.js', 'shared/storage.js', 'shared/backup.js'].forEach((p) =>
    eval(fs.readFileSync(path.join(root, p), 'utf8'))
  );
  eval(fs.readFileSync(path.join(root, 'background.js'), 'utf8'));
}

const msg = (m, sender) => new Promise((res) => listeners.onMessage(m, sender, res));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  let failures = 0;
  const check = (label, cond) => { if (cond) console.log('PASS', label); else { console.log('FAIL', label); failures++; } };

  loadBackground();
  await msg({ type: 'GET_DATA' });

  // ---- invalid backups rejected ----
  let r = await msg({ type: 'IMPORT_BACKUP', payload: { kind: 'other', version: 1, settings: {} } });
  check('invalid kind rejected', r && r.ok === false && r.error === 'invalidBackup');
  r = await msg({ type: 'IMPORT_BACKUP', payload: { kind: 'takefive-backup', version: 0, settings: {} } });
  check('invalid version rejected', r.ok === false && r.error === 'invalidBackup');
  r = await msg({ type: 'IMPORT_BACKUP', payload: { kind: 'takefive-backup', version: 1 } });
  check('missing settings and data rejected', r.ok === false && r.error === 'invalidBackup');

  // ---- data-only import (dashboard style): data fields overwrite, settings untouched ----
  {
    const d0 = await HE.storage.load();
    d0.domains = { 'old.com': { timeMs: 123000 } };
    d0.pomodoroState = { phase: 'focus', remainingMs: 700000, anchorAt: Date.now() };
    d0.grace = {};
    d0.history = [{ date: '2020-01-01', domains: { a: { timeMs: 1 } } }];
    d0.settings.theme = 'light';
    await HE.storage.save(d0);
  }
  r = await msg({
    type: 'IMPORT_BACKUP',
    payload: {
      kind: 'takefive-backup',
      version: 1,
      data: {
        date: HE.storage.getTodayKey(),
        domains: { 'x.com': { timeMs: 4200000 } },
        history: [{ date: '2026-08-31', domains: { 'y.com': { timeMs: 1000 } } }],
        pomodoroToday: { date: HE.storage.getTodayKey(), rounds: 2, focusMs: 3000000 },
        blocksToday: { date: HE.storage.getTodayKey(), count: 3 },
        usage: { accumulatedMs: 60000, lastStopAt: 0 },
        grace: {}
      }
    }
  });
  check('data-only import ok', r && r.ok === true);
  const d1 = await HE.storage.load();
  check('data-only import overwrites domains', d1.domains['x.com'] && d1.domains['x.com'].timeMs === 4200000);
  check('data-only import overwrites history', d1.history.length === 1 && d1.history[0].date === '2026-08-31');
  check('data-only import overwrites pomodoroToday', d1.pomodoroToday.rounds === 2);
  check('data-only import overwrites blocksToday', d1.blocksToday.count === 3);
  check('data-only import keeps settings (theme)', d1.settings.theme === 'light');
  check('data-only import keeps running pomodoro', d1.pomodoroState.phase === 'focus' && d1.pomodoroState.remainingMs > 600000 && d1.pomodoroState.remainingMs <= 700000);

  // ---- full import (options style): settings via mergeDefaults + data overwrite ----
  const fullPayload = {
    kind: 'takefive-backup',
    version: 1,
    settings: { limits: { 'dry.com': { dailyMs: 300000, remindAtMs: 0 } }, blacklist: ['dry.com'], theme: 'dark', badgeMode: 'total' },
    data: {
      date: HE.storage.getTodayKey(),
      domains: { 'z.com': { timeMs: 90000 } },
      history: [],
      pomodoroToday: { date: HE.storage.getTodayKey(), rounds: 0, focusMs: 0 },
      blocksToday: { date: HE.storage.getTodayKey(), count: 0 },
      usage: { accumulatedMs: 0, lastStopAt: 0 },
      grace: {}
    }
  };
  r = await msg({ type: 'IMPORT_BACKUP', payload: fullPayload });
  check('full import ok', r && r.ok === true);
  const d2 = await HE.storage.load();
  check('full import applies settings', d2.settings.theme === 'dark' && !!d2.settings.limits['dry.com']);
  check('full import overwrites date', d2.date === HE.storage.getTodayKey());
  check('full import overwrites domains', d2.domains['z.com'] && d2.domains['z.com'].timeMs === 90000);
  check('full import overwrites history', Array.isArray(d2.history) && d2.history.length === 0);
  check('full import resets pomodoroToday', d2.pomodoroToday.rounds === 0);
  check('full import resets blocksToday', d2.blocksToday.count === 0);

  console.log(failures === 0 ? 'BACKUP CHECKS PASS' : failures + ' FAILURES');
  process.exit(failures === 0 ? 0 : 1);
})();
