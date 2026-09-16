const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');

let store = {};
const listeners = {};
const notifications = [];
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
    query: async () => [{ id: 7, url: 'https://example.com/', windowId: 1 }],
    get: async () => ({ id: 7, url: 'https://example.com/', windowId: 1 }),
    update: async () => {},
    sendMessage: async () => {}
  },
  windows: {
    onRemoved: { addListener: () => {} },
    onFocusChanged: { addListener: () => {} },
    getLastFocused: async () => ({ id: 1, focused: true, type: 'normal' })
  },
  idle: { onStateChanged: { addListener: () => {} }, queryState: async () => idleState },
  webNavigation: { onBeforeNavigate: { addListener: () => {} } },
  notifications: {
    create: (id) => { notifications.push(id); },
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

(async () => {
  let failures = 0;
  const check = (label, cond) => { if (cond) console.log('PASS', label); else { console.log('FAIL', label); failures++; } };

  // ---- normal cycle (idle active): focus -> break -> focus ----
  loadBackground();
  await msg({ type: 'GET_DATA' });
  let d = await HE.storage.load();
  d.settings.pomodoro.enabled = true;
  d.settings.pomodoro.focusMinutes = 1;
  d.settings.pomodoro.breakMinutes = 1;
  d.pomodoroState = { phase: 'focus', remainingMs: 2000, anchorAt: Date.now() };
  await HE.storage.save(d);

  idleState = 'active';
  notifications.length = 0;
  listeners.tabActivated({ tabId: 7, windowId: 1 });
  await sleep(2500);
  listeners.tabActivated({ tabId: 7, windowId: 1 });
  await sleep(100);
  d = await HE.storage.load();
  check('wall-clock focus -> break', d.pomodoroState.phase === 'break');
  check('focus-end notify on active', notifications.indexOf('he-pomodoro-focus-end') !== -1);
  check('no round-over on active focus end', notifications.indexOf('he-pomodoro-round-over') === -1);

  d.pomodoroState = { phase: 'break', remainingMs: 2000, anchorAt: Date.now() };
  await HE.storage.save(d);
  notifications.length = 0;
  await sleep(2500);
  listeners.tabActivated({ tabId: 7, windowId: 1 });
  await sleep(100);
  d = await HE.storage.load();
  check('wall-clock break -> focus (active)', d.pomodoroState.phase === 'focus');
  check('break-end notify on active', notifications.indexOf('he-pomodoro-break-end') !== -1);

  // ---- away (idle): break ends -> round stops + one notify ----
  d.pomodoroState = { phase: 'break', remainingMs: 2000, anchorAt: Date.now() };
  await HE.storage.save(d);
  idleState = 'idle';
  notifications.length = 0;
  await sleep(2500);
  listeners.tabActivated({ tabId: 7, windowId: 1 });
  await sleep(100);
  d = await HE.storage.load();
  check('away: break ends -> round stops (idle)', d.pomodoroState.phase === 'idle');
  check('away: round-over notify sent', notifications.indexOf('he-pomodoro-round-over') !== -1);
  check('away: no break-end notify', notifications.indexOf('he-pomodoro-break-end') === -1);

  // ---- closed: fresh load detects stale anchor, stops + cancels ----
  d = await HE.storage.load();
  d.settings.pomodoro.enabled = true;
  d.pomodoroState = { phase: 'focus', remainingMs: 1500000, anchorAt: Date.now() - 3 * 60 * 1000 };
  await HE.storage.save(d);
  notifications.length = 0;
  loadBackground(); // fresh init -> handleClosedPomodoro
  await sleep(100);
  d = await HE.storage.load();
  check('closed: pomodoro stopped on reopen', d.pomodoroState.phase === 'idle');
  check('closed: cancelled notify sent', notifications.indexOf('he-pomodoro-cancelled') !== -1);

  // ---- running adjustment must not reset the current phase ----
  d = await HE.storage.load();
  d.settings.pomodoro.enabled = true;
  d.pomodoroState = { phase: 'focus', remainingMs: 1500000, anchorAt: Date.now() };
  await HE.storage.save(d);
  await msg({ type: 'SET_POMODORO', enabled: true, focusMinutes: 30, breakMinutes: 5, rounds: 4 });
  d = await HE.storage.load();
  check('running adjustment keeps current countdown', d.pomodoroState.phase === 'focus' && Math.abs(d.pomodoroState.remainingMs - 1500000) < 2000);
  check('running adjustment applies new settings', d.settings.pomodoro.focusMinutes === 30 && d.settings.pomodoro.rounds === 4);

  console.log(failures === 0 ? 'POMODORO WALL-CLOCK CHECKS PASS' : failures + ' FAILURES');
  process.exit(failures === 0 ? 0 : 1);
})();
