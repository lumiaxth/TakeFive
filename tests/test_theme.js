const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const root = path.join(__dirname, '..');

const html = '<!DOCTYPE html><html><head></head><body></body></html>';
const dom = new JSDOM(html, { runScripts: 'outside-only' });
const { window } = dom;
const store = { settings: { theme: 'dark' } };
window.chrome = {
  storage: {
    local: {
      async get(k) {
        if (k === null) return { ...store };
        if (typeof k === 'string') return { [k]: store[k] };
        const out = {}; for (const x of k) if (x in store) out[x] = store[x];
        return out;
      },
      async set(o) { Object.assign(store, o); }
    },
    onChanged: { addListener: () => {} }
  }
};
window.HE = {};
window.eval(fs.readFileSync(path.join(root, 'shared/theme.js'), 'utf8'));
window.HE.theme.init();

setTimeout(() => {
  let failures = 0;
  const check = (label, cond) => { if (cond) console.log('PASS', label); else { console.log('FAIL', label); failures++; } };
  check('init reads dark theme from storage', window.document.documentElement.dataset.theme === 'dark');
  window.HE.theme.apply('light');
  check('apply light sets data-theme', window.document.documentElement.dataset.theme === 'light');
  window.HE.theme.apply('dark');
  check('apply dark sets data-theme', window.document.documentElement.dataset.theme === 'dark');
  window.HE.theme.apply('system');
  check('apply system resolves to light/dark', ['light', 'dark'].includes(window.document.documentElement.dataset.theme));
  console.log(failures === 0 ? 'THEME CHECKS PASS' : failures + ' FAILURES');
  process.exit(failures === 0 ? 0 : 1);
}, 80);
