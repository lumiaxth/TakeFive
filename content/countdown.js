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
  let state = null; // { chips, clock, paused, theme, position, size, info }
  let panelVisible = false;
  let hideTimer = null;

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

  function t(key, subs) {
    try {
      const m = chrome.i18n.getMessage(key, subs);
      return m || key;
    } catch (e) {
      return key;
    }
  }

  function fmtMinutes(min) {
    const m = Math.max(0, Math.floor(min));
    const h = Math.floor(m / 60);
    const rm = m % 60;
    return h > 0 ? h + 'h ' + rm + 'm' : rm + 'm';
  }

  function buildInfoLines() {
    const info = state && state.info;
    if (!info) return [];
    const lines = [];
    lines.push({ icon: '\uD83D\uDCC5', text: t('panelToday') + ' ' + fmtMinutes(info.totalMs / 60000) });
    if (info.siteHost) {
      lines.push({ icon: '\uD83C\uDF10', text: t('panelCurrentSite') + ' ' + info.siteHost + ' \u00B7 ' + fmtMinutes(info.siteMs / 60000) });
    } else {
      lines.push({ icon: '\uD83C\uDF10', text: t('panelNoSite') });
    }
    if (info.paused) {
      lines.push({ icon: '\u23F8\uFE0F', text: t('panelPaused') });
    } else if (info.continuousTargetMin > 0 && info.continuousMs >= (info.continuousTargetMin / 2) * 60000) {
      lines.push({ icon: '\u23F0', text: t('panelContinuous', [fmtMinutes(info.continuousMs / 60000)]) });
    } else if (info.pomodoroRounds > 0) {
      lines.push({ icon: '\uD83C\uDF45', text: t('panelRounds', [String(info.pomodoroRounds), String(Math.round(info.pomodoroFocusMin))]) });
    } else if (info.blocks > 0) {
      lines.push({ icon: '\uD83D\uDEAB', text: t('panelBlocks', [String(info.blocks)]) });
    } else if (info.topHost) {
      lines.push({ icon: '\uD83D\uDD25', text: t('panelTop', [info.topHost, fmtMinutes(info.topMs / 60000)]) });
    } else {
      lines.push({ icon: '\uD83C\uDF31', text: t('panelNoRecords') });
    }
    return lines;
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
      bindHover();
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
      container.addEventListener('mouseenter', showPanel);
      container.addEventListener('mouseleave', hidePanelSoon);
    }
    container.className = 'he-cd ' + (dark ? 'dark' : 'light') + ' ' + (state.size || 'medium');
    container.innerHTML = displayChips().map((c) => chipHtml(c)).join('');
    const panel = shadow.querySelector('.info-panel');
    if (panel) {
      panel.className = 'info-panel ' + (dark ? 'dark' : 'light');
      panel.style.display = panelVisible ? 'block' : 'none';
    }
    update();
  }

  function showPanel() {
    if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
    if (!shadow || !state) return;
    panelVisible = true;
    let panel = shadow.querySelector('.info-panel');
    if (!panel) {
      panel = document.createElement('div');
      panel.className = 'info-panel';
      shadow.appendChild(panel);
    }
    const dark = state.theme === 'dark' || (state.theme === 'system' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
    panel.className = 'info-panel ' + (dark ? 'dark' : 'light');
    if (state.position.indexOf('bottom') === 0 || state.position.indexOf('top') === 0) {
      panel.style.top = state.position.indexOf('bottom') === 0 ? 'auto' : 'calc(100% + 10px)';
      panel.style.bottom = state.position.indexOf('bottom') === 0 ? 'calc(100% + 10px)' : 'auto';
    } else {
      panel.style.top = 'calc(100% + 10px)';
      panel.style.bottom = 'auto';
    }
    panel.innerHTML = buildInfoLines()
      .map((l) => '<div class="line"><span class="icon">' + l.icon + '</span><span class="text">' + escapeHtml(l.text) + '</span></div>')
      .join('');
    panel.style.display = 'block';
  }

  function hidePanel() {
    panelVisible = false;
    if (shadow) {
      const panel = shadow.querySelector('.info-panel');
      if (panel) panel.style.display = 'none';
    }
  }

  function hidePanelSoon() {
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      hidePanel();
      hideTimer = null;
    }, 180);
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
    );
  }

  function bindHover() {
    shadow.addEventListener('mouseover', (e) => {
      const chip = e.target.closest && e.target.closest('.chip[data-id="clock"]');
      if (chip) showPanel();
    });
    shadow.addEventListener('mouseout', (e) => {
      const chip = e.target.closest && e.target.closest('.chip[data-id="clock"]');
      if (chip) hidePanelSoon();
    });
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
      '.he-cd{display:flex;flex-direction:column;gap:8px;pointer-events:auto;' +
      'font-family:system-ui,-apple-system,"Segoe UI",Roboto,"PingFang SC","Microsoft YaHei",sans-serif;}' +
      '.chip{display:flex;align-items:center;gap:8px;padding:8px 12px;border-radius:12px;font-weight:600;' +
      'box-shadow:0 4px 16px rgba(0,0,0,.18);}' +
      '.chip .emoji{font-size:20px;line-height:1;}' +
      '.chip .time{font-variant-numeric:tabular-nums;white-space:nowrap;}' +
      '.chip[data-id="clock"]{cursor:default;}' +
      '.light .chip{background:rgba(255,255,255,.95);color:#1f2937;border:1px solid #e5e7eb;}' +
      '.dark .chip{background:#252526;color:#FFFFFF;border:1px solid #333333;}' +
      '.small .chip{padding:5px 9px;border-radius:9px;font-size:12px;}' +
      '.small .chip .emoji{font-size:16px;}' +
      '.medium .chip{padding:8px 12px;font-size:14px;}' +
      '.large .chip{padding:12px 16px;font-size:17px;}' +
      '.large .chip .emoji{font-size:26px;}' +
      '.info-panel{position:absolute;right:0;min-width:190px;max-width:240px;' +
      'display:flex;flex-direction:column;gap:6px;padding:12px 14px;border-radius:12px;' +
      'box-shadow:0 6px 20px rgba(0,0,0,.22);pointer-events:auto;' +
      'font-family:system-ui,-apple-system,"Segoe UI",Roboto,"PingFang SC","Microsoft YaHei",sans-serif;}' +
      '.info-panel .line{display:flex;align-items:flex-start;gap:8px;font-size:12px;font-weight:500;line-height:1.5;}' +
      '.info-panel .icon{flex-shrink:0;font-size:14px;line-height:1.4;}' +
      '.info-panel .text{word-break:break-all;}' +
      '.info-panel.light{background:rgba(255,255,255,.97);color:#1f2937;border:1px solid #e5e7eb;}' +
      '.info-panel.dark{background:#252526;color:#FFFFFF;border:1px solid #333333;}' +
      '.info-panel.dark .text{color:#ADADAD;}' +
      '.info-panel.dark .line:first-child .text{color:#FFFFFF;font-weight:600;}'
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
