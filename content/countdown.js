(function () {
  let host = null;
  let shadow = null;
  let timer = null;
  let state = null; // { chips, paused, theme, position, size }

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
    host.style.display = state ? 'block' : 'none';
    if (!state) return;

    const dark = state.theme === 'dark' || (state.theme === 'system' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
    const pos = state.position;
    host.style.top = pos.indexOf('top') === 0 ? '16px' : 'auto';
    host.style.bottom = pos.indexOf('bottom') === 0 ? '16px' : 'auto';
    host.style.left = pos.indexOf('left') !== -1 ? '16px' : 'auto';
    host.style.right = pos.indexOf('right') !== -1 ? '16px' : 'auto';
    host.style.transform = pos.indexOf('middle') !== -1 ? 'translateY(-50%)' : 'none';
    if (pos.indexOf('middle') !== -1) host.style.top = '50%';

    let html = '<div class="he-cd ' + (dark ? 'dark' : 'light') + ' ' + (state.size || 'medium') + '">';
    (state.chips || []).forEach((c) => {
      html +=
        '<div class="chip" data-id="' + c.id + '"><span class="emoji">' + c.emoji + '</span>' +
        '<span class="time">' + fmtCountdown(c.remainingMs) + '</span></div>';
    });
    html += '</div>';
    shadow.querySelector('.he-cd') ? (shadow.querySelector('.he-cd').outerHTML = html) : (shadow.innerHTML = html);
    update();
  }

  function update() {
    if (!state) return;
    (state.chips || []).forEach((c) => {
      const el = shadow.querySelector('.chip[data-id="' + c.id + '"] .time');
      if (el) el.textContent = fmtCountdown(c.remainingMs);
    });
  }

  function startTimer() {
    stopTimer();
    timer = setInterval(() => {
      if (!state || state.paused) return;
      let changed = false;
      (state.chips || []).forEach((c) => {
        if (c.remainingMs > 0) { c.remainingMs -= 1000; changed = true; }
      });
      if (changed) update();
    }, 1000);
  }

  function stopTimer() {
    if (timer) { clearInterval(timer); timer = null; }
  }

  function apply(next) {
    state = next;
    if (!next) { render(); return; }
    render();
    if (next.paused) stopTimer();
    else startTimer();
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
      '.dark .chip{background:rgba(31,41,55,.95);color:#f3f4f6;border:1px solid #374151;}' +
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
})();
