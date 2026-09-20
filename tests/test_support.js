const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');

let failures = 0;
const check = (label, cond) => {
  if (cond) console.log('PASS', label);
  else { console.log('FAIL', label); failures++; }
};

// Load shared/support.js into a fresh sandbox with configurable chrome.i18n + navigator
function loadSupport(opts) {
  const sandbox = {
    chrome: {
      i18n: { getUILanguage: () => opts.uiLang || 'en' },
      tabs: opts.tabs !== undefined ? opts.tabs : { create: () => {} }
    },
    navigator: { userAgent: opts.ua || '' },
    location: { href: '' }
  };
  const code = fs.readFileSync(path.join(root, 'shared/support.js'), 'utf8');
  new Function('globalThis', 'chrome', 'navigator', 'location', code)(sandbox, sandbox.chrome, sandbox.navigator, sandbox.location);
  return sandbox;
}

// ---- sponsorUrl: language branch ----
check('sponsor: zh -> ifdian', loadSupport({ uiLang: 'zh_CN' }).HE.support.sponsorUrl() === 'https://ifdian.net/a/lumiaxth');
check('sponsor: zh_TW -> ifdian', loadSupport({ uiLang: 'zh_TW' }).HE.support.sponsorUrl() === 'https://ifdian.net/a/lumiaxth');
check('sponsor: en -> ko-fi', loadSupport({ uiLang: 'en' }).HE.support.sponsorUrl() === 'https://ko-fi.com/lumiaxth');
check('sponsor: unknown -> ko-fi (non-zh)', loadSupport({ uiLang: 'ja' }).HE.support.sponsorUrl() === 'https://ko-fi.com/lumiaxth');

// ---- storeUrl: UA branch ----
check(
  'store: Firefox -> AMO',
  loadSupport({ ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0' }).HE.support.storeUrl() === 'https://addons.mozilla.org/firefox/addon/takefive/'
);
check(
  'store: Edge -> edge store',
  loadSupport({ ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0' }).HE.support.storeUrl() === 'https://microsoftedge.microsoft.com/addons/detail/ioobdmlggonpicbhbkfaclhmjhicpknb'
);
check('store: Chromium/unknown -> Edge store', loadSupport({ ua: 'Mozilla/5.0 Chrome/120.0 Safari/537.36' }).HE.support.storeUrl().indexOf('microsoftedge.microsoft.com') !== -1);

// ---- open: tabs.create preferred, navigation fallback ----
const created = [];
const withTabs = loadSupport({ uiLang: 'zh', tabs: { create: (o) => { created.push(o.url); } } });
withTabs.HE.support.open('https://example.com/');
check('open: uses tabs.create when available', created.length === 1 && created[0] === 'https://example.com/');

const withoutTabs = loadSupport({ uiLang: 'zh', tabs: {} }); // tabs exists but no create API
withoutTabs.HE.support.open('https://example.com/fallback');
check('open: falls back to location.href', withoutTabs.location.href === 'https://example.com/fallback');

console.log(failures === 0 ? 'SUPPORT CHECKS PASS' : failures + ' FAILURES');
process.exit(failures === 0 ? 0 : 1);
