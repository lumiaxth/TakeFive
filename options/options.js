(function () {
  HE.i18n.apply();
  const t = (key, subs) => chrome.i18n.getMessage(key, subs);
  const units = { h: t('hoursShort'), m: t('minutesUnit'), s: 's' };
  const fmt = (ms) => HE.storage.formatDuration(ms, units);
  const esc = (s) =>
    String(s).replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
    );

  const $ = (id) => document.getElementById(id);
  const limitList = $('limitList');
  const blacklistList = $('blacklistList');
  const pomodoroWhitelistList = $('pomodoroWhitelistList');
  const pomodoroStatus = $('pomodoroStatus');

  let data = null;

  function send(msg) {
    return chrome.runtime.sendMessage(msg);
  }

  async function refresh() {
    const resp = await send({ type: 'GET_DATA' });
    data = resp.data;
    render();
  }

  function render() {
    renderBadge();
    renderUsageReminder();
    renderPomodoro();
    renderLimits();
    renderBlacklist();
  }

  function renderBadge() {
    $('badgeMode').value = data.settings.badgeMode || 'auto';
  }

  function renderUsageReminder() {
    const ur = data.settings.usageReminder;
    $('usageReminderEnabled').checked = !!ur.enabled;
    $('usageReminderMinutes').value = ur.minutes || 45;
  }

  function renderPomodoro() {
    const p = data.settings.pomodoro;
    $('pomodoroEnabled').checked = !!p.enabled;
    $('pomodoroFocusMinutes').value = p.focusMinutes || 25;
    $('pomodoroBreakMinutes').value = p.breakMinutes || 5;

    const st = data.pomodoroState;
    if (p.enabled) {
      if (st.phase === 'idle') {
        pomodoroStatus.textContent = t('pomodoroStatusLabel') + ': ' + esc(t('pomodoroPhaseIdle'));
      } else {
        const phaseText =
          st.phase === 'break'
            ? esc(t('pomodoroPhaseBreak'))
            : esc(t('pomodoroPhaseFocus'));
        const rem = Math.max(0, Math.ceil(st.remainingMs / 60000));
        pomodoroStatus.textContent =
          t('pomodoroStatusLabel') + ': ' + phaseText + ' · ' + t('pomodoroRemaining', [String(rem)]);
      }
    } else {
      pomodoroStatus.textContent = t('pomodoroIdle');
    }

    const wl = p.whitelist;
    $('noPomodoroWhitelist').hidden = wl.length > 0;
    pomodoroWhitelistList.textContent = '';
    wl.forEach((host) => {
      const row = document.createElement('div');
      row.className = 'rule';
      row.innerHTML =
        '<span class="rule-host">' + esc(host) + '</span>' +
        '<span class="rule-actions">' +
        '<button class="btn small danger" type="button">' + esc(t('delete')) + '</button>' +
        '</span>';
      pomodoroWhitelistList.appendChild(row);
      row.querySelector('button').addEventListener('click', async () => {
        await send({ type: 'REMOVE_POMODORO_WHITELIST', host });
        await refresh();
      });
    });
  }

  function renderLimits() {
    const limits = data.settings.limits;
    const hosts = Object.keys(limits).sort();
    $('noLimits').hidden = hosts.length > 0;
    limitList.textContent = '';

    hosts.forEach((host) => {
      const lim = limits[host];
      const row = document.createElement('div');
      row.className = 'rule';
      row.innerHTML =
        '<span class="rule-host">' + esc(host) + '</span>' +
        '<span class="rule-meta">' +
        esc(t('limitDaily')) + ': ' + esc(String(Math.round(lim.dailyMs / 60000))) + ' ' + esc(t('minutesUnit')) +
        (lim.remindAtMs > 0
          ? ' · ' + esc(t('remindAt')) + ': ' + esc(String(Math.round(lim.remindAtMs / 60000))) + ' ' + esc(t('minutesUnit'))
          : '') +
        '</span>' +
        '<span class="rule-actions">' +
        '<button class="btn small" data-edit="' + esc(host) + '" type="button">' + esc(t('edit')) + '</button>' +
        '<button class="btn small danger" data-del="' + esc(host) + '" type="button">' + esc(t('delete')) + '</button>' +
        '</span>';
      limitList.appendChild(row);

      row.querySelector('[data-del]').addEventListener('click', async () => {
        await send({ type: 'REMOVE_LIMIT', host });
        await refresh();
      });

      row.querySelector('[data-edit]').addEventListener('click', () => {
        editLimitRow(row, host, lim);
      });
    });
  }

  function editLimitRow(row, host, lim) {
    const limitMin = Math.round(lim.dailyMs / 60000);
    const remindMin = lim.remindAtMs > 0 ? Math.round(lim.remindAtMs / 60000) : '';
    const saved = row.innerHTML;
    row.innerHTML =
      '<span class="rule-host">' + esc(host) + '</span>' +
      '<span class="add-form">' +
      '<label>' + esc(t('limitDaily')) + ' <input class="edit-daily" type="number" min="1" value="' + esc(String(limitMin)) + '" /></label>' +
      '<label>' + esc(t('remindAt')) + ' <input class="edit-remind" type="number" min="0" value="' + esc(String(remindMin)) + '" /></label>' +
      '<button class="btn small primary" data-save type="button">' + esc(t('save')) + '</button>' +
      '<button class="btn small" data-cancel type="button">' + esc(t('cancel')) + '</button>' +
      '</span>';

    row.querySelector('[data-cancel]').addEventListener('click', () => {
      row.innerHTML = saved;
      row.querySelector('[data-del]').addEventListener('click', async () => {
        await send({ type: 'REMOVE_LIMIT', host });
        await refresh();
      });
      row.querySelector('[data-edit]').addEventListener('click', () => {
        editLimitRow(row, host, lim);
      });
    });

    row.querySelector('[data-save]').addEventListener('click', async () => {
      const daily = Number(row.querySelector('.edit-daily').value);
      const remind = Number(row.querySelector('.edit-remind').value);
      if (!daily || daily < 1 || remind < 0 || isNaN(daily) || isNaN(remind)) {
        alert(t('invalidNumber'));
        return;
      }
      await send({ type: 'SET_LIMIT', host, dailyMs: daily * 60000, remindAtMs: remind * 60000 });
      await refresh();
    });
  }

  function renderBlacklist() {
    const blacklist = data.settings.blacklist;
    $('noBlacklist').hidden = blacklist.length > 0;
    blacklistList.textContent = '';
    blacklist.forEach((host) => {
      const row = document.createElement('div');
      row.className = 'rule';
      row.innerHTML =
        '<span class="rule-host">' + esc(host) + '</span>' +
        '<span class="rule-actions">' +
        '<button class="btn small danger" type="button">' + esc(t('unblockDomain')) + '</button>' +
        '</span>';
      blacklistList.appendChild(row);
      row.querySelector('button').addEventListener('click', async () => {
        await send({ type: 'REMOVE_BLACKLIST', host });
        await refresh();
      });
    });
  }

  $('btnDashboard').addEventListener('click', () => {
    location.href = chrome.runtime.getURL('dashboard/dashboard.html');
  });

  $('limitForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const host = HE.hostname.normalizeDomain($('limitDomain').value);
    if (!host) {
      alert(t('invalidDomain'));
      return;
    }
    const daily = Number($('limitDaily').value);
    const remind = Number($('limitRemind').value);
    if (!daily || daily < 1 || remind < 0 || isNaN(daily) || isNaN(remind)) {
      alert(t('invalidNumber'));
      return;
    }
    await send({ type: 'SET_LIMIT', host, dailyMs: daily * 60000, remindAtMs: remind * 60000 });
    $('limitDomain').value = '';
    $('limitDaily').value = '';
    $('limitRemind').value = '';
    await refresh();
  });

  $('blacklistForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const host = HE.hostname.normalizeDomain($('blacklistDomain').value);
    if (!host) {
      alert(t('invalidDomain'));
      return;
    }
    await send({ type: 'ADD_BLACKLIST', host });
    $('blacklistDomain').value = '';
    await refresh();
  });

  $('btnSaveBadgeMode').addEventListener('click', async () => {
    await send({ type: 'SET_BADGE_MODE', mode: $('badgeMode').value });
    await refresh();
  });

  $('btnSaveUsageReminder').addEventListener('click', async () => {
    const minutes = Number($('usageReminderMinutes').value);
    if (!minutes || minutes < 1) {
      alert(t('invalidNumber'));
      return;
    }
    await send({ type: 'SET_USAGE_REMINDER', enabled: $('usageReminderEnabled').checked, minutes });
    await refresh();
  });

  $('btnSavePomodoro').addEventListener('click', async () => {
    const focus = Number($('pomodoroFocusMinutes').value);
    const brk = Number($('pomodoroBreakMinutes').value);
    if (!focus || focus < 1 || !brk || brk < 1) {
      alert(t('invalidNumber'));
      return;
    }
    await send({
      type: 'SET_POMODORO',
      enabled: $('pomodoroEnabled').checked,
      focusMinutes: focus,
      breakMinutes: brk
    });
    await refresh();
  });

  $('pomodoroWhitelistForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const host = HE.hostname.normalizeDomain($('pomodoroWhitelistDomain').value);
    if (!host) {
      alert(t('invalidDomain'));
      return;
    }
    await send({ type: 'ADD_POMODORO_WHITELIST', host });
    $('pomodoroWhitelistDomain').value = '';
    await refresh();
  });

  $('btnImportWhitelist').addEventListener('click', async () => {
    const resp = await send({ type: 'IMPORT_TABS_TO_POMODORO_WHITELIST' });
    if (resp && resp.ok) {
      alert(t('importedCount', [String(resp.added || 0)]));
    }
    await refresh();
  });

  refresh();
})();
