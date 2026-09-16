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
  window.chrome = {
    i18n: { getMessage, getUILanguage: () => 'zh_CN' },
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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  // ---- hover panel with data ----
  const w = makeWidget('https://example.com/');
  w.listeners.onMessage({
    type: 'HE_COUNTDOWN',
    chips: [{ id: 'pomodoro', emoji: '\uD83C\uDF45', remainingMs: 600000, ticking: true }],
    clock: true, paused: false, ticking: true,
    position: 'middle-right', size: 'medium',
    info: {
      totalMs: 7500000, // 2h 5m
      siteHost: 'github.com', siteMs: 1500000, // 25m
      paused: false, continuousMs: 30 * 60000, continuousTargetMin: 45,
      pomodoroRounds: 3, pomodoroFocusMin: 75, blocks: 4,
      topHost: 'github.com', topMs: 1500000, hasAnyData: true
    }
  });
  const shadow = w.shadows[0];
  const clockChip = shadow.querySelector('.chip[data-id="clock"]');
  check('panel: clock chip exists', !!clockChip);
  clockChip.dispatchEvent(new w.window.MouseEvent('mouseover', { bubbles: true }));
  await sleep(20);
  const panel = shadow.querySelector('.info-panel');
  check('panel: created and visible', !!panel && panel.style.display === 'block');
  const lines = panel.querySelectorAll('.line');
  check('panel: three lines', lines.length === 3);
  check('panel: today line', lines[0].textContent.indexOf(zh.panelToday.message) !== -1 && lines[0].textContent.includes('2时5分钟'));
  check('panel: site line', lines[1].textContent.includes('github.com') && lines[1].textContent.includes('25分钟'));
  check('panel: continuous line', lines[2].textContent.includes('30分钟'));
  // mouseleave hides
  clockChip.dispatchEvent(new w.window.MouseEvent('mouseout', { bubbles: true }));
  await sleep(250);
  check('panel: hides after mouse leave', panel.style.display === 'none');

  // ---- hover any chip (pomodoro) opens the panel ----
  const wPomo = makeWidget('https://example.com/');
  wPomo.listeners.onMessage({
    type: 'HE_COUNTDOWN',
    chips: [{ id: 'pomodoro', emoji: '\uD83C\uDF45', remainingMs: 600000, ticking: true }],
    clock: false, paused: false, ticking: true,
    position: 'middle-right', size: 'medium',
    info: { totalMs: 60000, siteHost: null, siteMs: 0, paused: false, continuousMs: 0, continuousTargetMin: 45, pomodoroRounds: 0, pomodoroFocusMin: 0, blocks: 0, topHost: null, topMs: 0, hasAnyData: true }
  });
  const shadowPomo = wPomo.shadows[0];
  const pomoChip = shadowPomo.querySelector('.chip[data-id="pomodoro"]');
  check('panel: pomodoro chip exists (clock off)', !!pomoChip);
  pomoChip.dispatchEvent(new wPomo.window.MouseEvent('mouseover', { bubbles: true }));
  await sleep(20);
  const panelPomo = shadowPomo.querySelector('.info-panel');
  check('panel: pomodoro chip opens panel (clock off)', !!panelPomo && panelPomo.style.display === 'block');

  // ---- panel horizontal alignment follows position ----
  const wLeft = makeWidget('https://example.com/');
  wLeft.listeners.onMessage({
    type: 'HE_COUNTDOWN', chips: [], clock: true, paused: false, ticking: true,
    position: 'middle-left', size: 'medium',
    info: { totalMs: 0, siteHost: null, siteMs: 0, paused: false, continuousMs: 0, continuousTargetMin: 45, pomodoroRounds: 0, pomodoroFocusMin: 0, blocks: 0, topHost: null, topMs: 0, hasAnyData: false }
  });
  const shadowLeft = wLeft.shadows[0];
  const chipLeft = shadowLeft.querySelector('.chip[data-id="clock"]');
  chipLeft.dispatchEvent(new wLeft.window.MouseEvent('mouseover', { bubbles: true }));
  await sleep(20);
  const panelLeft = shadowLeft.querySelector('.info-panel');
  check('panel: left position aligns left edge', !!panelLeft && panelLeft.style.left === '0px' && panelLeft.style.right === 'auto');
  const wRight = makeWidget('https://example.com/');
  wRight.listeners.onMessage({
    type: 'HE_COUNTDOWN', chips: [], clock: true, paused: false, ticking: true,
    position: 'middle-right', size: 'medium',
    info: { totalMs: 0, siteHost: null, siteMs: 0, paused: false, continuousMs: 0, continuousTargetMin: 45, pomodoroRounds: 0, pomodoroFocusMin: 0, blocks: 0, topHost: null, topMs: 0, hasAnyData: false }
  });
  const shadowRight = wRight.shadows[0];
  const chipRight = shadowRight.querySelector('.chip[data-id="clock"]');
  chipRight.dispatchEvent(new wRight.window.MouseEvent('mouseover', { bubbles: true }));
  await sleep(20);
  const panelRight = shadowRight.querySelector('.info-panel');
  check('panel: right position aligns right edge', !!panelRight && panelRight.style.right === '0px' && panelRight.style.left === 'auto');

  // ---- paused line priority ----
  const w2 = makeWidget('https://example.com/');
  w2.listeners.onMessage({
    type: 'HE_COUNTDOWN', chips: [], clock: true, paused: true, ticking: false,
    position: 'middle-right', size: 'medium',
    info: { totalMs: 0, siteHost: null, siteMs: 0, paused: true, continuousMs: 0, continuousTargetMin: 45, pomodoroRounds: 0, pomodoroFocusMin: 0, blocks: 0, topHost: null, topMs: 0, hasAnyData: false }
  });
  const shadow2 = w2.shadows[0];
  const chip2 = shadow2.querySelector('.chip[data-id="clock"]');
  chip2.dispatchEvent(new w2.window.MouseEvent('mouseover', { bubbles: true }));
  await sleep(20);
  const lines2 = shadow2.querySelectorAll('.info-panel .line');
  check('paused: 3 lines with empty data', lines2.length === 3);
  check('paused: third line is paused', lines2[2].textContent.indexOf(zh.panelPaused.message) !== -1);

  // ---- away-stop round-over line ----
  const w3 = makeWidget('https://example.com/');
  w3.listeners.onMessage({
    type: 'HE_COUNTDOWN', chips: [], clock: true, paused: false, ticking: true,
    position: 'middle-right', size: 'medium',
    info: { totalMs: 0, siteHost: null, siteMs: 0, paused: false, continuousMs: 5 * 60000, continuousTargetMin: 45, pomodoroRounds: 0, pomodoroFocusMin: 0, blocks: 2, topHost: null, topMs: 0, hasAnyData: true }
  });
  const shadow3 = w3.shadows[0];
  const chip3 = shadow3.querySelector('.chip[data-id="clock"]');
  chip3.dispatchEvent(new w3.window.MouseEvent('mouseover', { bubbles: true }));
  await sleep(20);
  const lines3 = shadow3.querySelectorAll('.info-panel .line');
  check('away: line3 shows continuous (below half threshold)', lines3[2].textContent.indexOf(zh.panelContinuous.message.split('$TIME$')[0].trim()) === -1);
  check('away: line3 falls through', lines3[2].textContent.length > 0);

  // ---- blocks line when no pomodoro today ----
  const w4 = makeWidget('https://example.com/');
  w4.listeners.onMessage({
    type: 'HE_COUNTDOWN', chips: [], clock: true, paused: false, ticking: true,
    position: 'middle-right', size: 'medium',
    info: { totalMs: 500000, siteHost: 'x.com', siteMs: 100000, paused: false, continuousMs: 0, continuousTargetMin: 45, pomodoroRounds: 0, pomodoroFocusMin: 0, blocks: 3, topHost: 'x.com', topMs: 100000, hasAnyData: true }
  });
  const shadow4 = w4.shadows[0];
  const chip4 = shadow4.querySelector('.chip[data-id="clock"]');
  chip4.dispatchEvent(new w4.window.MouseEvent('mouseover', { bubbles: true }));
  await sleep(20);
  const lines4 = shadow4.querySelectorAll('.info-panel .line');
  check('blocks line shown', lines4[2].textContent.indexOf(zh.panelBlocks.message.split('$COUNT$')[0].trim()) !== -1 && lines4[2].textContent.includes('3'));

  // ---- pomodoro rounds line uses minutes directly (no double ms->min conversion) ----
  const w5 = makeWidget('https://example.com/');
  w5.listeners.onMessage({
    type: 'HE_COUNTDOWN', chips: [], clock: true, paused: false, ticking: true,
    position: 'middle-right', size: 'medium',
    info: { totalMs: 500000, siteHost: 'x.com', siteMs: 100000, paused: false, continuousMs: 0, continuousTargetMin: 45, pomodoroRounds: 1, pomodoroFocusMin: 25, blocks: 0, topHost: null, topMs: 0, hasAnyData: true }
  });
  const shadow5 = w5.shadows[0];
  const chip5 = shadow5.querySelector('.chip[data-id="clock"]');
  chip5.dispatchEvent(new w5.window.MouseEvent('mouseover', { bubbles: true }));
  await sleep(20);
  const lines5 = shadow5.querySelectorAll('.info-panel .line');
  check('rounds line shows completed count', lines5[2].textContent.indexOf(zh.panelRounds.message.split('$ROUNDS$')[0].trim()) !== -1 && lines5[2].textContent.includes('1'));
  check('rounds line shows 25 minutes (not 0)', lines5[2].textContent.includes('25分钟') && !lines5[2].textContent.includes('0分钟'));

  console.log(f === 0 ? 'PANEL CHECKS PASS' : f + ' FAILURES');
  process.exit(f === 0 ? 0 : 1);
})();
