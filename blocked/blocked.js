(function () {
  HE.i18n.apply();
  HE.theme.init();
  const t = (key, subs) => chrome.i18n.getMessage(key, subs);
  const units = { h: t('hoursShort'), m: t('minutesUnit'), s: 's' };
  const fmt = (ms) => HE.storage.formatDuration(ms, units);

  const params = new URLSearchParams(location.search);
  const rawReason = params.get('reason') || '';
  const url = params.get('url') || '';

  const CONFIG = {
    limit: { emoji: '\uD83C\uDF3F', titleKey: 'blockedTitleLimit', bodyKey: 'blockedReasonLimit', showBreak: true },
    blacklist: { emoji: '\uD83D\uDEAB', titleKey: 'blockedTitleBlacklist', bodyKey: 'blockedReasonBlacklist', showBreak: false },
    pomodoro: { emoji: '\uD83C\uDF45', titleKey: 'blockedTitlePomodoro', bodyKey: 'blockedReasonPomodoro', showBreak: false },
    generic: { emoji: '\u2615', titleKey: 'blockedTitleGeneric', bodyKey: 'blockedReasonGeneric', showBreak: true }
  };
  const cfg = CONFIG[rawReason] || CONFIG.generic;

  // Determine the blocked site defensively:
  // 1. prefer the registrable domain derived from the real `url` param
  // 2. otherwise validate the `domain` param
  // 3. otherwise fall back to generic text (never show garbage)
  let domain = '';
  if (url && /^https?:\/\//i.test(url)) {
    domain = HE.hostname.getRegistrableDomain(url) || '';
  }
  if (!domain) {
    const d = String(params.get('domain') || '').toLowerCase();
    if (/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/.test(d) && d.split('.').length <= 8) {
      domain = d;
    }
  }

  const iconEl = document.getElementById('icon');
  const titleEl = document.getElementById('title');
  const reasonEl = document.getElementById('reason');
  const btnBreak = document.getElementById('btnBreak');
  const btnBack = document.getElementById('btnBack');

  iconEl.textContent = cfg.emoji;
  titleEl.textContent = t(cfg.titleKey);
  document.title = t(cfg.titleKey);
  btnBreak.hidden = !cfg.showBreak;

  if (cfg.bodyKey === 'blockedReasonLimit' && domain) {
    HE.storage.load().then((data) => {
      const timeMs = (data.domains[domain] && data.domains[domain].timeMs) || 0;
      reasonEl.textContent = t(cfg.bodyKey, [domain, fmt(timeMs)]);
    });
  } else if (domain) {
    reasonEl.textContent = t(cfg.bodyKey, [domain]);
  } else {
    reasonEl.textContent = t('blockedReasonGeneric');
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
