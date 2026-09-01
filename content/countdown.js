/*
    TakeFive - Website Time Tracker & Blocker
    Copyright (C) 2026  Xue Tianhao (GitHub: @lumiaxth)

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

(function () {
  let host = null;
  let shadow = null;
  let timer = null;
  let state = null; // { chips, clock, paused, theme, position, size }

  function fmtCountdown(ms) {
    const totalSec = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    const mm = m < 10 ? '0' + m : String(m);
    const ss = s < 10 ? '0' + s : String(s);
    if (h > 0) {
      return h + ':' + mm + ':' + ss;
    }
    return mm + ':' + ss;
  }

  function fmtClock() {
    const d = new Date();
    const h = d.getHours();
    const m = d.getMinutes();
    return (h < 10 ? '0' + h : String(h)) + ':' + (m < 10 ? '0' + m : String(m));
  }

  function isExtensionPage() {
    return location.protocol === 'chrome-extension:';
  }

  function displayChips() {
    const out = [];
    if (state && state.clock) {
      out.push({ id: 'clock', emoji: '\uD83D\uDD50', ticking: true });
    }
    if (state && state.chips) {
      state.chips.forEach((c) => {
        if (isExtensionPage() && c.id !== 'pomodoro') return;
        out.push(c);
      });
    }
    return out;
  }

  function render() {
    if (!host) {
      host = document.createElement('div');
      host.style.all = 'initial';
      host.style.position = 'fixed';
      host.style.zIndex = '2147483646';
      host.style.pointerEvents = 'none';
      document.documentElement.appendChild(host);
      shadow = host.attachShadow({ mode: 'closed' });
      const style = document.createElement('style');
      style.textContent = buildStyles();
      shadow.appendChild(style);
    }
    host.style.display = state && !document.hidden ? 'block' : 'none';
    if (!state) return;

    const dark = state.theme === 'dark' || (state.theme === 'system' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
    const pos = state.position;
    host.style.top = pos.indexOf('top') === 0 ? '16px' : 'auto';
    host.style.bottom = pos.indexOf('bottom') === 0 ? '16px' : 'auto';
    host.style.left = pos.indexOf('left') !== -1 ? '16px' : 'auto';
    host.style.right = pos.indexOf('right') !== -1 ? '16px' : 'auto';
    host.style.transform = pos.indexOf('middle') !== -1 ? 'translateY(-50%)' : 'none';
    if (pos.indexOf('middle') !== -1) host.style.top = '50%';

    let container = shadow.querySelector('.he-cd');
    if (!container) {
      container = document.createElement('div');
      container.className = 'he-cd';
      shadow.appendChild(container);
    }
    container.className = 'he-cd ' + (dark ? 'dark' : 'light') + ' ' + (state.size || 'medium');
    container.innerHTML = displayChips().map((c) => chipHtml(c)).join('');
    update();
  }

  function chipHtml(c) {
    return (
      '<div class="chip" data-id="' + c.id + '"><span class="emoji">' + c.emoji + '</span>' +
      '<span class="time">' + (c.id === 'clock' ? fmtClock() : fmtCountdown(c.remainingMs)) + '</span></div>'
    );
  }

  function update() {
    if (!state) return;
    displayChips().forEach((c) => {
      const el = shadow.querySelector('.chip[data-id="' + c.id + '"] .time');
      if (el) el.textContent = c.id === 'clock' ? fmtClock() : fmtCountdown(c.remainingMs);
    });
  }

  function startTimer() {
    stopTimer();
    if (!state || !hasTickingChip()) return;
    timer = setInterval(() => {
      if (!state || !hasTickingChip()) return;
      let changed = false;
      (state.chips || []).forEach((c) => {
        if (c.ticking && c.remainingMs > 0) { c.remainingMs -= 1000; changed = true; }
      });
      if (changed || state.clock) update();
    }, 1000);
  }

  function hasTickingChip() {
    if (!state) return false;
    if (state.clock) return true;
    return displayChips().some((c) => c.ticking);
  }

  function stopTimer() {
    if (timer) { clearInterval(timer); timer = null; }
  }

  function apply(next) {
    state = next;
    if (!next) { render(); return; }
    render();
    if (hasTickingChip()) startTimer();
    else stopTimer();
  }

  function buildStyles() {
    return (
      ':host{all:initial}' +
      '.he-cd{display:flex;flex-direction:column;gap:8px;font-family:system-ui,-apple-system,"Segoe UI",Roboto,"PingFang SC","Microsoft YaHei",sans-serif;}' +
      '.chip{display:flex;align-items:center;gap:8px;padding:8px 12px;border-radius:12px;font-weight:600;' +
      'box-shadow:0 4px 16px rgba(0,0,0,.18);}' +
      '.chip .emoji{font-size:20px;line-height:1;}' +
      '.chip .time{font-variant-numeric:tabular-nums;white-space:nowrap;}' +
      '.light .chip{background:rgba(255,255,255,.95);color:#1f2937;border:1px solid #e5e7eb;}' +
      '.dark .chip{background:#252526;color:#FFFFFF;border:1px solid #333333;}' +
      '.small .chip{padding:5px 9px;border-radius:9px;font-size:12px;}' +
      '.small .chip .emoji{font-size:16px;}' +
      '.medium .chip{padding:8px 12px;font-size:14px;}' +
      '.large .chip{padding:12px 16px;font-size:17px;}' +
      '.large .chip .emoji{font-size:26px;}'
    );
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg && msg.type === 'HE_COUNTDOWN') apply(msg);
    else if (msg && msg.type === 'HE_COUNTDOWN_HIDE') apply(null);
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      stopTimer();
      if (host) host.style.display = 'none';
    } else if (state) {
      // re-request fresh state from the background
      try {
        chrome.runtime.sendMessage({ type: 'COUNTDOWN_REQUEST' });
      } catch (e) { /* ignore */ }
    }
  });

  // initialize on injection so the widget appears without waiting for a push
  try {
    chrome.runtime.sendMessage({ type: 'COUNTDOWN_REQUEST' });
  } catch (e) { /* ignore */ }
})();
