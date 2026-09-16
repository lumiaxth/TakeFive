const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const root = path.join(__dirname, '..');

function makeWidget(url) {
  const dom = new JSDOM('<!DOCTYPE html><html><head></head><body></body></html>', { runScripts: 'outside-only', url });
  const { window } = dom;
  const listeners = {};
  const shadows = [];
  const origAttach = window.Element.prototype.attachShadow;
  window.Element.prototype.attachShadow = function (init) {
    const sr = origAttach.call(this, init);
    shadows.push(sr);
    return sr;
  };
  // jsdom defaults to document.hidden === true; force a visible page
  try {
    Object.defineProperty(window.document, 'hidden', { value: false, configurable: true });
    Object.defineProperty(window.document, 'visibilityState', { value: 'visible', configurable: true });
  } catch (e) { /* ignore */ }
  window.chrome = {
    runtime: {
      onMessage: { addListener: (fn) => { listeners.onMessage = fn; } },
      sendMessage: () => {}
    }
  };
  window.eval(fs.readFileSync(path.join(root, 'content/countdown.js'), 'utf8'));
  return { window, listeners, shadows };
}

let f = 0;
const check = (label, cond) => { if (cond) console.log('PASS', label); else { console.log('FAIL', label); f++; } };

// ---- web page widget ----
{
  const w = makeWidget('https://example.com/');
  w.listeners.onMessage({ type: 'HE_COUNTDOWN', chips: [
    { id: 'pomodoro', emoji: '\uD83C\uDF45', remainingMs: 600000, ticking: true },
    { id: 'site', emoji: '\u23F3', remainingMs: 300000, ticking: false }
  ], theme: 'dark', clock: true, paused: false, ticking: true, position: 'middle-right', size: 'medium' });

  const host = w.window.document.documentElement.lastElementChild;
  const shadow = w.shadows[0];
  check('web: widget host appended', !!host);
  check('web: shadow root created', !!shadow);
  const chips = shadow ? shadow.querySelectorAll('.chip') : [];
  check('web: 3 chips (clock + pomodoro + site)', chips.length === 3);
  check('web: clock chip first', chips[0].getAttribute('data-id') === 'clock');
  check('web: clock chip emoji', chips[0].querySelector('.emoji').textContent === '\uD83D\uDD50');
  check('web: clock chip time is HH:MM', /^\d{2}:\d{2}$/.test(chips[0].querySelector('.time').textContent));
  check('web: pomodoro chip emoji tomato', chips[1].querySelector('.emoji').textContent === '\uD83C\uDF45');
  check('web: site chip emoji hourglass', chips[2].querySelector('.emoji').textContent === '\u23F3');
  check('web: dark class applied', shadow.querySelector('.he-cd').classList.contains('dark'));

  // hide
  w.listeners.onMessage({ type: 'HE_COUNTDOWN_HIDE' });
  check('web: hide hides widget', w.window.document.documentElement.lastElementChild.style.display === 'none');
}

// ---- extension page widget filters site chip ----
{
  const w = makeWidget('chrome-extension://abc/options/options.html');
  w.listeners.onMessage({ type: 'HE_COUNTDOWN', chips: [
    { id: 'pomodoro', emoji: '\uD83C\uDF45', remainingMs: 600000, ticking: true },
    { id: 'site', emoji: '\u23F3', remainingMs: 300000, ticking: false }
  ], theme: 'light', clock: false, paused: false, ticking: true, position: 'top-right', size: 'small' });

  const shadow = w.shadows[0];
  const chips = shadow ? shadow.querySelectorAll('.chip') : [];
  check('ext page: only pomodoro chip (site filtered)', chips.length === 1);
  check('ext page: chip is pomodoro', chips[0].getAttribute('data-id') === 'pomodoro');
}

// ---- clock only (no chips) ----
{
  const w = makeWidget('https://example.com/');
  w.listeners.onMessage({ type: 'HE_COUNTDOWN', chips: [], theme: 'light', clock: true, paused: false, ticking: true, position: 'bottom-left', size: 'medium' });
  const shadow = w.shadows[0];
  const chips = shadow ? shadow.querySelectorAll('.chip') : [];
  check('clock-only: one chip rendered', chips.length === 1);
  check('clock-only: clock chip', chips[0].getAttribute('data-id') === 'clock');
}

// ---- hide in fullscreen (setting on/off) ----
{
  const w = makeWidget('https://example.com/');
  w.listeners.onMessage({ type: 'HE_COUNTDOWN', chips: [], theme: 'light', clock: true, paused: false, ticking: true, position: 'middle-right', size: 'medium', hideFullscreen: true });
  const host = w.window.document.documentElement.lastElementChild;
  check('fs: widget visible normally', host.style.display === 'block');
  // simulate entering page fullscreen
  Object.defineProperty(w.window.document, 'fullscreenElement', { value: {}, configurable: true });
  w.window.document.dispatchEvent(new w.window.Event('fullscreenchange'));
  check('fs: widget hides in fullscreen (setting on)', host.style.display === 'none');
  // simulate leaving fullscreen
  Object.defineProperty(w.window.document, 'fullscreenElement', { value: null, configurable: true });
  w.window.document.dispatchEvent(new w.window.Event('fullscreenchange'));
  check('fs: widget restores after fullscreen', host.style.display === 'block');
}
{
  const w = makeWidget('https://example.com/');
  w.listeners.onMessage({ type: 'HE_COUNTDOWN', chips: [], theme: 'light', clock: true, paused: false, ticking: true, position: 'middle-right', size: 'medium', hideFullscreen: false });
  const host = w.window.document.documentElement.lastElementChild;
  Object.defineProperty(w.window.document, 'fullscreenElement', { value: {}, configurable: true });
  w.window.document.dispatchEvent(new w.window.Event('fullscreenchange'));
  check('fs: widget stays visible when setting off', host.style.display === 'block');
}

console.log(f === 0 ? 'WIDGET CHECKS PASS' : f + ' FAILURES');
process.exit(f === 0 ? 0 : 1);
