const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');

let store = {};
const listeners = {};
const sentMessages = [];

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
    sendMessage: async (msg) => { sentMessages.push(msg); }
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
  idle: { onStateChanged: { addListener: () => {} }, queryState: async () => 'active' },
  webNavigation: { onBeforeNavigate: { addListener: () => {} } },
  notifications: { create: () => {}, clear: () => {}, onClicked: { addListener: () => {} } },
  action: { setBadgeText: () => {}, setBadgeBackgroundColor: () => {}, setIcon: () => {}, setBadgeTextColor: () => {} },
  i18n: { getMessage: (k, s) => k + (s ? ':' + s.join(',') : '') }
};

['shared/tldts.min.js', 'shared/hostname.js', 'shared/storage.js'].forEach((p) =>
  eval(fs.readFileSync(path.join(root, p), 'utf8'))
);
eval(fs.readFileSync(path.join(root, 'background.js'), 'utf8'));

const HE = global.HE;
const msg = (m, sender) => new Promise((res) => listeners.onMessage(m, sender, res));

(async () => {
  let failures = 0;
  const check = (label, cond) => { if (cond) console.log('PASS', label); else { console.log('FAIL', label); failures++; } };

  await msg({ type: 'GET_DATA' });

  // SET_THEME / SET_COUNTDOWN round-trip
  await msg({ type: 'SET_THEME', theme: 'dark' });
  let d = await HE.storage.load();
  check('SET_THEME persists', d.settings.theme === 'dark');

  await msg({ type: 'SET_COUNTDOWN', enabled: true, clock: true, thresholdMin: 10, position: 'top-right', size: 'large', hideFullscreen: true });
  d = await HE.storage.load();
  check('SET_COUNTDOWN persists (incl clock)', d.settings.countdown.enabled === true && d.settings.countdown.clock === true && d.settings.countdown.thresholdMin === 10 && d.settings.countdown.position === 'top-right' && d.settings.countdown.size === 'large');
  check('SET_COUNTDOWN persists hideFullscreen', d.settings.countdown.hideFullscreen === true);

  // configure: pomodoro focus running + example.com limit near threshold
  d = await HE.storage.load();
  d.settings.pomodoro.enabled = true;
  d.pomodoroState = { phase: 'focus', remainingMs: 10 * 60000, anchorAt: Date.now() };
  d.settings.limits['example.com'] = { dailyMs: 3600000, remindAtMs: 3000000 };
  d.domains['example.com'] = { timeMs: 3600000 - 5 * 60000 }; // remaining 5 min <= 10 min threshold
  await HE.storage.save(d);

  sentMessages.length = 0;
  await msg({ type: 'COUNTDOWN_REQUEST' });
  await new Promise((r) => setTimeout(r, 30));
  const sent = sentMessages[sentMessages.length - 1];
  check('COUNTDOWN_REQUEST broadcasts HE_COUNTDOWN', sent && sent.type === 'HE_COUNTDOWN');
  check('two chips when pomodoro + site limit', sent && sent.chips.length === 2);
  const pomo = sent && sent.chips.find((c) => c.id === 'pomodoro');
  const site = sent && sent.chips.find((c) => c.id === 'site');
  check('pomodoro chip uses tomato emoji in focus', pomo && pomo.emoji === '\uD83C\uDF45');
  check('pomodoro chip ticks (wall-clock)', pomo && pomo.ticking === true);
  check('site chip ticks while counting', site && site.ticking === true);
  check('site chip uses hourglass emoji', site && site.emoji === '\u23F3');
  check('site chip remaining ~5min', site && Math.abs(site.remainingMs - 5 * 60000) < 2000);
  check('message carries clock + theme + position + size', sent && sent.clock === true && sent.theme === 'dark' && sent.position === 'top-right' && sent.size === 'large');
  check('message carries info object', sent && sent.info && typeof sent.info.totalMs === 'number' && typeof sent.info.blocks === 'number' && typeof sent.info.pomodoroRounds === 'number' && typeof sent.info.continuousMs === 'number');

  // break phase -> coffee emoji
  d = await HE.storage.load();
  d.pomodoroState = { phase: 'break', remainingMs: 2 * 60000, anchorAt: Date.now() };
  d.settings.limits['example.com'] = { dailyMs: 3600000, remindAtMs: 3000000 };
  d.domains['example.com'] = { timeMs: 600000 }; // remaining > threshold
  await HE.storage.save(d);
  sentMessages.length = 0;
  await msg({ type: 'COUNTDOWN_REQUEST' });
  await new Promise((r) => setTimeout(r, 30));
  const sent2 = sentMessages[sentMessages.length - 1];
  check('break phase only pomodoro chip (site above threshold)', sent2 && sent2.chips.length === 1);
  check('break chip uses coffee emoji', sent2 && sent2.chips[0].emoji === '\u2615');

  // ---- inside grace: site chip shows remaining allowance, same logic as a normal limit ----
  d = await HE.storage.load();
  d.settings.pomodoro.enabled = true;
  d.pomodoroState = { phase: 'idle', remainingMs: 0, anchorAt: Date.now() };
  d.settings.limits['example.com'] = { dailyMs: 30 * 60000, remindAtMs: 0 };
  d.domains['example.com'] = { timeMs: 32 * 60000 }; // overspent 2min of the 5min allowance
  d.grace['example.com'] = 5 * 60000;
  await HE.storage.save(d);
  sentMessages.length = 0;
  await msg({ type: 'COUNTDOWN_REQUEST' });
  await new Promise((r) => setTimeout(r, 30));
  const sentG = sentMessages[sentMessages.length - 1];
  const siteG = sentG && sentG.chips && sentG.chips.find((c) => c.id === 'site');
  check('grace: site chip shows remaining allowance (~3min)', !!siteG && Math.abs(siteG.remainingMs - 3 * 60000) < 2000);
  check('grace: site chip ticks like a normal limit', !!siteG && siteG.ticking === true);

  // ---- grace allowance exhausted: no site chip at all ----
  d = await HE.storage.load();
  d.domains['example.com'] = { timeMs: 30 * 60000 + 5 * 60000 + 1000 }; // overspent 5min + 1s
  await HE.storage.save(d);
  sentMessages.length = 0;
  await msg({ type: 'COUNTDOWN_REQUEST' });
  await new Promise((r) => setTimeout(r, 30));
  const sentH = sentMessages[sentMessages.length - 1];
  check('grace exhausted: no site chip', sentH && sentH.chips.length === 0);

  // countdown disabled + clock false -> HIDE
  await msg({ type: 'SET_COUNTDOWN', enabled: false, clock: false, thresholdMin: 10, position: 'middle-right', size: 'medium' });
  sentMessages.length = 0;
  await msg({ type: 'COUNTDOWN_REQUEST' });
  await new Promise((r) => setTimeout(r, 30));
  const sent3 = sentMessages[sentMessages.length - 1];
  check('disabled + no clock hides widget', sent3 && sent3.type === 'HE_COUNTDOWN_HIDE');

  // countdown disabled but clock true -> HE_COUNTDOWN with clock
  await msg({ type: 'SET_COUNTDOWN', enabled: false, clock: true, thresholdMin: 10, position: 'middle-right', size: 'medium' });
  d = await HE.storage.load();
  check('SET_COUNTDOWN hideFullscreen defaults off', d.settings.countdown.hideFullscreen === false);
  sentMessages.length = 0;
  await msg({ type: 'COUNTDOWN_REQUEST' });
  await new Promise((r) => setTimeout(r, 30));
  const sent4 = sentMessages[sentMessages.length - 1];
  check('disabled + clock shows HE_COUNTDOWN (clock only)', sent4 && sent4.type === 'HE_COUNTDOWN' && sent4.clock === true && sent4.chips.length === 0);

  console.log(failures === 0 ? 'COUNTDOWN CHECKS PASS' : failures + ' FAILURES');
  process.exit(failures === 0 ? 0 : 1);
})();
