const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');

let store = {};
const listeners = {};
let badge = { text: null, color: null };

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
    onActivated: { addListener: () => {} },
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
  idle: {
    onStateChanged: { addListener: () => {} },
    queryState: async () => 'active'
  },
  webNavigation: { onBeforeNavigate: { addListener: () => {} } },
  notifications: { create: () => {}, clear: () => {}, onClicked: { addListener: () => {} } },
  action: {
    setBadgeText: (o) => { badge.text = o.text; },
    setBadgeBackgroundColor: () => {},
    setIcon: () => {}
  },
  i18n: { getMessage: (k, s) => k + (s ? ':' + s.join(',') : '') }
};

['shared/tldts.min.js', 'shared/hostname.js', 'shared/storage.js'].forEach((p) =>
  eval(fs.readFileSync(path.join(root, p), 'utf8'))
);
eval(fs.readFileSync(path.join(root, 'background.js'), 'utf8'));

const HE = global.HE;
const msg = (m) => new Promise((res) => listeners.onMessage(m, null, res));

(async () => {
  let failures = 0;
  const check = (label, cond) => { if (cond) console.log('PASS', label); else { console.log('FAIL', label); failures++; } };

  await msg({ type: 'GET_DATA' });

  let d = await HE.storage.load();
  d.domains = { 'a.com': { timeMs: 5 * 3600000 + 30 * 60000 } }; // 5h30m -> 5:30
  await HE.storage.save(d);
  await msg({ type: 'SET_BADGE_MODE', mode: 'total' });
  await new Promise((r) => setTimeout(r, 30));
  check('badge <10h keeps h:mm (5:30)', badge.text === '5:30');

  d = await HE.storage.load();
  d.domains = { 'a.com': { timeMs: 10 * 3600000 + 30 * 60000 } }; // 10h30m -> 10h
  await HE.storage.save(d);
  await msg({ type: 'SET_BADGE_MODE', mode: 'total' });
  await new Promise((r) => setTimeout(r, 30));
  check('badge >=10h compact (10h)', badge.text === '10h');

  d = await HE.storage.load();
  d.domains = { 'a.com': { timeMs: 99 * 3600000 + 5 * 60000 } }; // 99h05m -> 99h
  await HE.storage.save(d);
  await msg({ type: 'SET_BADGE_MODE', mode: 'total' });
  await new Promise((r) => setTimeout(r, 30));
  check('badge 99h stays 3 chars', badge.text === '99h' && badge.text.length <= 4);

  console.log(failures === 0 ? 'BADGE CHECKS PASS' : failures + ' FAILURES');
  process.exit(failures === 0 ? 0 : 1);
})();
