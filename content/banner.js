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
/*
 * banner.js — 页面顶部横幅内容脚本。
 * 接收 HE_BANNER 在页面顶部展示提醒横幅（8 秒自动隐藏，Shadow DOM 隔离，
 * 深浅色跟随扩展主题设置）。
 */


(function () {
  let currentBanner = null;
  let hideTimer = null;

  function isDark() {
    try {
      return chrome.storage.local.get('settings').then((s) => {
        const theme = (s.settings && s.settings.theme) || 'system';
        if (theme === 'dark') return true;
        if (theme === 'light') return false;
        return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
      });
    } catch (e) {
      return Promise.resolve(false);
    }
  }

  function showBanner(text) {
    if (!text) return;
    if (currentBanner) hideBanner();
    isDark().then((dark) => {
      if (!text) return;
      const host = document.createElement('div');
      host.style.all = 'initial';
      const shadow = host.attachShadow({ mode: 'closed' });
      const style = document.createElement('style');
      const bg = dark ? '#4A2C16' : '#fef3c7';
      const border = dark ? '#FF9F5B' : '#d97706';
      const fg = dark ? '#FFFFFF' : '#1f2937';
      style.textContent =
        ':host{all:initial}' +
        '.he-banner{' +
        'position:fixed;top:0;left:0;right:0;z-index:2147483647;' +
        'display:flex;align-items:center;justify-content:center;' +
        'padding:12px 16px;font:500 14px/1.4 system-ui,-apple-system,"Segoe UI",Roboto,"PingFang SC","Microsoft YaHei",sans-serif;' +
        'color:' + fg + ';background:' + bg + ';border-bottom:2px solid ' + border + ';' +
        'box-shadow:0 2px 12px rgba(0,0,0,.15);gap:12px;' +
        '}' +
        '.he-banner .he-close{' +
        'cursor:pointer;border:none;background:rgba(0,0,0,.12);color:' + fg + ';' +
        'border-radius:50%;width:22px;height:22px;font-size:12px;line-height:1;flex-shrink:0;' +
        '}' +
        '.he-banner .he-close:hover{background:rgba(0,0,0,.2)}';
      const banner = document.createElement('div');
      banner.className = 'he-banner';
      const span = document.createElement('span');
      span.textContent = text;
      const close = document.createElement('button');
      close.className = 'he-close';
      close.textContent = '\u00d7';
      close.title = 'Close';
      close.addEventListener('click', hideBanner);
      banner.appendChild(span);
      banner.appendChild(close);
      shadow.appendChild(style);
      shadow.appendChild(banner);
      (document.body || document.documentElement).appendChild(host);
      currentBanner = { host, hide: hideBanner };
      hideTimer = setTimeout(hideBanner, 8000);
    });
  }

  function hideBanner() {
    if (hideTimer) {
      clearTimeout(hideTimer);
      hideTimer = null;
    }
    if (currentBanner) {
      currentBanner.host.remove();
      currentBanner = null;
    }
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg && msg.type === 'HE_BANNER') {
      showBanner(msg.text);
      sendResponse({ ok: true });
    }
  });
})();
