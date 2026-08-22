(function () {
  let currentBanner = null;
  let hideTimer = null;

  function showBanner(text) {
    if (!text) return;
    if (currentBanner) hideBanner();
    const host = document.createElement('div');
    host.style.all = 'initial';
    const shadow = host.attachShadow({ mode: 'closed' });
    const style = document.createElement('style');
    style.textContent =
      ':host{all:initial}' +
      '.he-banner{' +
      'position:fixed;top:0;left:0;right:0;z-index:2147483647;' +
      'display:flex;align-items:center;justify-content:center;' +
      'padding:12px 16px;font:500 14px/1.4 system-ui,-apple-system,"Segoe UI",Roboto,"PingFang SC","Microsoft YaHei",sans-serif;' +
      'color:#1f2937;background:#fef3c7;border-bottom:2px solid #d97706;' +
      'box-shadow:0 2px 12px rgba(0,0,0,.15);gap:12px;' +
      '}' +
      '.he-banner .he-close{' +
      'cursor:pointer;border:none;background:rgba(0,0,0,.08);color:#1f2937;' +
      'border-radius:50%;width:22px;height:22px;font-size:12px;line-height:1;flex-shrink:0;' +
      '}' +
      '.he-banner .he-close:hover{background:rgba(0,0,0,.16)}';
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
