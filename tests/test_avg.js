const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const root = path.join(__dirname, '..');

const en = JSON.parse(fs.readFileSync(path.join(root, '_locales/en/messages.json'), 'utf8'));
const getMessage = (key, subs) => {
  let s = (en[key] || {}).message || key;
  const ph = (en[key] || {}).placeholders;
  if (subs) {
    const ks = ph ? Object.keys(ph) : [];
    ks.forEach((k, i) => { s = s.split('$' + k + '$').join(subs[i] || ''); });
  }
  return s;
};

const html = fs.readFileSync(path.join(root, 'dashboard/dashboard.html'), 'utf8');
const dom = new JSDOM(html, { runScripts: 'outside-only' });
const { window } = dom;
const store = {};
window.chrome = {
  i18n: { getMessage },
  storage: { local: { async get(k) { return k === null ? { ...store } : { [k]: store[k] }; }, async set(o) { Object.assign(store, o); } }, onChanged: { addListener: () => {} } },
  runtime: {
    sendMessage: async () => {
      const d = new Date(); d.setHours(0, 0, 0, 0);
      const p = (n) => (n < 10 ? '0' + n : String(n));
      const key = d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
      return { ok: true, data: {
        date: key,
        domains: { 'a.com': { timeMs: 600000 }, 'b.com': { timeMs: 300000 } },
        notifications: {}, tracking: { host: null, since: 0 }, usage: { accumulatedMs: 0, lastStopAt: 0 },
        pomodoroState: { phase: 'idle', remainingMs: 0 },
        settings: { limits: {}, blacklist: [], paused: false, badgeMode: 'auto', usageReminder: { enabled: false, minutes: 45 }, pomodoro: { enabled: false, focusMinutes: 25, breakMinutes: 5, whitelist: [] } },
        history: []
      }, activeHost: null, counting: false };
    }
  }
};
window.HE = {};
['shared/tldts.min.js', 'shared/hostname.js', 'shared/storage.js'].forEach((p) => window.eval(fs.readFileSync(path.join(root, p), 'utf8')));
window.eval(fs.readFileSync(path.join(root, 'shared/i18n.js'), 'utf8'));
window.eval(fs.readFileSync(path.join(root, 'shared/theme.js'), 'utf8'));
new window.Function(fs.readFileSync(path.join(root, 'dashboard/dashboard.js'), 'utf8')).call(window);

setTimeout(() => {
  const doc = window.document;
  let f = 0;
  const check = (label, cond) => { if (cond) console.log('PASS', label); else { console.log('FAIL', label); f++; } };
  const title = doc.querySelector('.avg-title');
  const time = doc.querySelector('.avg-time');
  check('avg-title is chartAvg', !!title && title.textContent === en.chartAvg.message);
  check('avg-time non-empty', !!time && time.textContent.length > 0);
  check('avg-time shows duration', !!time && /^\d/.test(time.textContent));
  check('avg-label is two-line container', !!title && !!time && title.parentElement === time.parentElement);
  console.log(f === 0 ? 'AVG LABEL CHECKS PASS' : f + ' FAILURES');
  process.exit(f === 0 ? 0 : 1);
}, 80);
