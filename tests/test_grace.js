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
    onInstalled: { addListener: () => {} }
  },
  alarms: { onAlarm: { addListener: (fn) => { listeners.alarm = fn; } }, create: () => {} },
  tabs: {
    onActivated: { addListener: (fn) => { listeners.tabActivated = fn; } },
    onUpdated: { addListener: () => {} },
    onRemoved: { addListener: () => {} },
    query: async () => [{ id: 7, url: 'https://youtube.com/', windowId: 1 }],
    get: async () => ({ id: 7, url: 'https://youtube.com/', windowId: 1 }),
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
  notifications: {
    create: () => {},
    clear: () => {},
    onClicked: { addListener: () => {} }
  },
  action: { setBadgeText: () => {}, setBadgeBackgroundColor: () => {}, setIcon: () => {}, setBadgeTextColor: () => {} },
  i18n: { getMessage: (k, s) => k + (s ? ':' + s.join(',') : '') }
};

function loadBackground() {
  ['shared/tldts.min.js', 'shared/hostname.js', 'shared/storage.js'].forEach((p) =>
    eval(fs.readFileSync(path.join(root, p), 'utf8'))
  );
  eval(fs.readFileSync(path.join(root, 'background.js'), 'utf8'));
}

const msg = (m) => new Promise((res) => listeners.onMessage(m, null, res));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const navigate = async (url) => {
  redirected.length = 0;
  listeners.beforeNavigate({ frameId: 0, tabId: 7, url });
  await sleep(100);
};

(async () => {
  let failures = 0;
  const check = (label, cond) => { if (cond) console.log('PASS', label); else { console.log('FAIL', label); failures++; } };

  loadBackground();
  await msg({ type: 'GET_DATA' });

  // ---- limit reached -> redirect ----
  let d = await HE.storage.load();
  d.settings.limits['youtube.com'] = { dailyMs: 60 * 60000, remindAtMs: 0 };
  d.domains['youtube.com'] = { timeMs: 61 * 60000 };
  await HE.storage.save(d);
  await navigate('https://youtube.com/watch');
  check('limit reached redirects', redirected.length === 1 && redirected[0].url.indexOf('blocked/blocked.html') !== -1);

  // ---- grant grace -> navigation allowed (baseline captured at grant time) ----
  await msg({ type: 'GRANT_LIMIT_GRACE', host: 'youtube.com' });
  d = await HE.storage.load();
  check('grace baseline stored (used at grant)', d.grace['youtube.com'] === 61 * 60000);
  await navigate('https://youtube.com/watch');
  check('grace allows navigation', redirected.length === 0);

  // ---- REGRESSION: re-grant right after the first grant, navigation must NOT be pulled back ----
  // (1.4.6 defect: re-granting kept the cumulative overspend and blocked immediately)
  await msg({ type: 'GRANT_LIMIT_GRACE', host: 'youtube.com' });
  d = await HE.storage.load();
  check('re-grant resets baseline to current used', d.grace['youtube.com'] === 61 * 60000);
  await navigate('https://youtube.com/watch');
  check('re-grant then navigate stays allowed', redirected.length === 0);

  // ---- grace allowance partially consumed -> still allowed (used spent counts, wall clock does not) ----
  d = await HE.storage.load();
  d.domains['youtube.com'] = { timeMs: 61 * 60000 + 4 * 60000 }; // baseline 61min, used 4min of the 5min allowance
  await HE.storage.save(d);
  await navigate('https://youtube.com/watch');
  check('partially-consumed grace still allows navigation', redirected.length === 0);

  // ---- overspent beyond grace -> redirect with graceGranted=1 (no re-authorize) ----
  d = await HE.storage.load();
  d.domains['youtube.com'] = { timeMs: 61 * 60000 + 5 * 60000 + 1000 }; // baseline + 5min + 1s
  await HE.storage.save(d);
  await navigate('https://youtube.com/watch');
  const grantedUrl = redirected.length === 1 && redirected[0].url.indexOf('graceGranted=1') !== -1;
  check('overspent grace redirects again', redirected.length === 1);
  check('overspent redirect marks graceGranted=1', grantedUrl);

  // ---- blacklist ignores grace ----
  await msg({ type: 'GRANT_LIMIT_GRACE', host: 'youtube.com' });
  await msg({ type: 'ADD_BLACKLIST', host: 'youtube.com' });
  await navigate('https://youtube.com/watch');
  check('blacklist redirects despite grace', redirected.length === 1);

  // ---- REMOVE_LIMIT clears grace anchor ----
  await msg({ type: 'REMOVE_BLACKLIST', host: 'youtube.com' });
  await msg({ type: 'REMOVE_LIMIT', host: 'youtube.com' });
  d = await HE.storage.load();
  check('remove limit clears grace', !d.grace['youtube.com']);

  // ---- rollover clears grace ----
  d = await HE.storage.load();
  d.settings.limits['youtube.com'] = { dailyMs: 60 * 60000, remindAtMs: 0 };
  d.domains['youtube.com'] = { timeMs: 61 * 60000 };
  d.grace['youtube.com'] = 5 * 60000;
  d.date = '2000-01-01';
  await HE.storage.save(d);
  d = await HE.storage.load();
  check('rollover clears grace', !d.grace || !d.grace['youtube.com']);

  // ---- CLEAR_TODAY fully resets: grace, blocks, pomodoro counts ----
  await msg({ type: 'GRANT_LIMIT_GRACE', host: 'youtube.com' });
  await msg({ type: 'CLEAR_TODAY' });
  d = await HE.storage.load();
  check('CLEAR_TODAY clears grace', !d.grace['youtube.com']);
  check('CLEAR_TODAY resets blocksToday', d.blocksToday.count === 0);
  check('CLEAR_TODAY resets pomodoroToday', d.pomodoroToday.rounds === 0 && d.pomodoroToday.focusMs === 0);
  check('CLEAR_TODAY clears domains', !d.domains['youtube.com']);

  // ---- paused: limit not enforced at all ----
  await msg({ type: 'GRANT_LIMIT_GRACE', host: 'youtube.com' });
  await msg({ type: 'PAUSE' });
  await navigate('https://youtube.com/watch');
  check('paused allows navigation (limit)', redirected.length === 0);
  await msg({ type: 'RESUME' });

  console.log(failures === 0 ? 'GRACE CHECKS PASS' : failures + ' FAILURES');
  process.exit(failures === 0 ? 0 : 1);
})();
