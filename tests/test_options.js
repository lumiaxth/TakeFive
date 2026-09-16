const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const root = path.join(__dirname, '..');

const zh = JSON.parse(fs.readFileSync(path.join(root, '_locales/zh_CN/messages.json'), 'utf8'));
const getMessage = (key, subs) => {
  let s = (zh[key] || {}).message || key;
  const ph = (zh[key] || {}).placeholders;
  if (subs) { const ks = ph ? Object.keys(ph) : []; ks.forEach((k, i) => { s = s.split('$' + k + '$').join(subs[i] || ''); }); }
  return s;
};

const data = {
  date: '2026-08-23', domains: {}, notifications: {}, tracking: { host: null, since: 0 },
  usage: { accumulatedMs: 0, lastStopAt: 0 }, pomodoroState: { phase: 'idle', remainingMs: 0 },
  settings: {
    limits: {}, blacklist: [], paused: false, badgeMode: 'auto', theme: 'dark',
    countdown: { enabled: true, thresholdMin: 15, position: 'bottom-right', size: 'small' },
    usageReminder: { enabled: false, minutes: 45 },
    pomodoro: { enabled: false, focusMinutes: 25, breakMinutes: 5, whitelist: [] }
  },
  history: []
};

const html = fs.readFileSync(path.join(root, 'options/options.html'), 'utf8');
const dom = new JSDOM(html, { runScripts: 'outside-only' });
const { window } = dom;
const store = { settings: { theme: 'dark' } };
window.chrome = {
  i18n: { getMessage },
  storage: {
    local: { async get(k) { return k === null ? { ...store } : { [k]: store[k] }; }, async set(o) { Object.assign(store, o); } },
    onChanged: { addListener: () => {} }
  },
  runtime: { sendMessage: async () => ({ ok: true, data, activeHost: null, counting: false }) }
};
window.HE = {};
['shared/tldts.min.js','shared/hostname.js','shared/storage.js','shared/i18n.js','shared/theme.js'].forEach((p) =>
  window.eval(fs.readFileSync(path.join(root, p), 'utf8'))
);
new window.Function(fs.readFileSync(path.join(root, 'options/options.js'), 'utf8')).call(window);

setTimeout(() => {
  const doc = window.document;
  let f = 0;
  const check = (label, cond) => { if (cond) console.log('PASS', label); else { console.log('FAIL', label); f++; } };
  const h2s = [...doc.querySelectorAll('.card h2')].map((h) => h.textContent);
  check('h2[0] appearance', h2s[0] === zh.appearanceSection.message);
  check('h2[1] countdown', h2s[1] === zh.countdownSection.message);
  check('h2[2] usageReminder', h2s[2] === zh.usageReminderSection.message);
  check('h2[3] pomodoro', h2s[3] === zh.pomodoroSection.message);
  check('h2[4] limits', h2s[4] === zh.limitsSection.message);
  check('h2[5] blacklist', h2s[5] === zh.blacklistSection.message);
  check('theme select has 3 options', doc.getElementById('themeMode').options.length === 3);
  check('theme value from storage (dark)', doc.getElementById('themeMode').value === 'dark');
  check('data-theme applied dark', window.document.documentElement.dataset.theme === 'dark');
  check('countdown position 6 options', doc.getElementById('countdownPosition').options.length === 6);
  check('countdown size 3 options', doc.getElementById('countdownSize').options.length === 3);
  check('countdown fields from storage', doc.getElementById('countdownPosition').value === 'bottom-right' && doc.getElementById('countdownSize').value === 'small');
  check('floating clock checkbox exists', !!doc.getElementById('floatingClockEnabled'));
  check('themeDark option text', doc.querySelector('#themeMode option[value="dark"]').textContent === zh.themeDark.message);
  console.log(f === 0 ? 'OPTIONS CHECKS PASS' : f + ' FAILURES');
  process.exit(f === 0 ? 0 : 1);
}, 120);
