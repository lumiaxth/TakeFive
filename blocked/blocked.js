(function () {
  HE.i18n.apply();
  const t = (key, subs) => chrome.i18n.getMessage(key, subs);
  const units = { h: t('hoursShort'), m: t('minutesUnit'), s: 's' };
  const fmt = (ms) => HE.storage.formatDuration(ms, units);

  const params = new URLSearchParams(location.search);
  const reason = params.get('reason') || 'limit';
  const domain = params.get('domain') || '';
  const url = params.get('url') || '';

  document.title = t('blockedTitle');

  const reasonEl = document.getElementById('reason');
  const btnBreak = document.getElementById('btnBreak');
  const btnBack = document.getElementById('btnBack');

  if (reason === 'blacklist') {
    reasonEl.textContent = t('blockedReasonBlacklist', [domain]);
    btnBreak.hidden = true;
  } else if (reason === 'pomodoro') {
    reasonEl.textContent = t('blockedReasonPomodoro', [domain]);
    btnBreak.hidden = true;
  } else {
    HE.storage.load().then((data) => {
      const timeMs = (data.domains[domain] && data.domains[domain].timeMs) || 0;
      reasonEl.textContent = t('blockedReasonLimit', [domain, fmt(timeMs)]);
    });
  }

  btnBreak.addEventListener('click', async () => {
    await chrome.runtime.sendMessage({ type: 'PAUSE' });
    if (url && /^https?:/i.test(url)) {
      location.href = url;
    } else if (history.length > 1) {
      history.back();
    }
  });

  btnBack.addEventListener('click', () => {
    if (history.length > 1) history.back();
    else window.close();
  });
})();
