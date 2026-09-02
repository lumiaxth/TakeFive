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
  HE.i18n.apply();
  HE.theme.init();
  const t = (key, subs) => chrome.i18n.getMessage(key, subs);
  const units = { h: t('hoursShort'), m: t('minutesUnit'), s: 's' };
  const fmt = (ms) => HE.storage.formatDuration(ms, units);

  const $ = (id) => document.getElementById(id);
  const list = $('domainList');
  const emptyEl = $('empty');
  const totalValue = $('totalValue');
  const pausedBanner = $('pausedBanner');
  const activeHostEl = $('activeHost');

  let data = null;
  let activeHost = null;
  let editingHost = null;

  function send(msg) {
    return chrome.runtime.sendMessage(msg);
  }

  function statusFor(host) {
    const limit = data.settings.limits[host];
    const timeMs = (data.domains[host] && data.domains[host].timeMs) || 0;
    if (data.settings.blacklist.indexOf(host) !== -1) return { kind: 'blocked' };
    if (limit && limit.dailyMs > 0) {
      if (timeMs >= limit.dailyMs) return { kind: 'reached', limit, timeMs };
      if (limit.remindAtMs > 0 && timeMs >= limit.remindAtMs)
        return { kind: 'near', limit, timeMs };
      if (limit.dailyMs > 0) return { kind: 'limit', limit, timeMs };
    }
    return { kind: 'none' };
  }

  function render() {
    const paused = HE.storage.isPaused(data);
    const total = HE.storage.totalForDomains(data.domains);
    totalValue.textContent = fmt(total);

    $('btnPause').hidden = paused;
    $('btnResume').hidden = !paused;
    if (paused) {
      pausedBanner.hidden = false;
      pausedBanner.textContent = t('paused');
    } else {
      pausedBanner.hidden = true;
    }

    if (activeHost) {
      activeHostEl.hidden = false;
      activeHostEl.textContent = activeHost;
    } else {
      activeHostEl.hidden = true;
    }

    renderPomodoro();

    const MAX_DOMAINS = 10;
    const domains = HE.storage.sortedDomains(data.domains);
    emptyEl.hidden = domains.length > 0;
    list.textContent = '';
    domains.slice(0, MAX_DOMAINS).forEach((d) => list.appendChild(renderDomain(d.host, d.timeMs)));
    if (domains.length > MAX_DOMAINS) {
      const row = document.createElement('div');
      row.className = 'more-link';
      const link = document.createElement('a');
      link.href = '#';
      link.textContent = t('moreDomains');
      link.addEventListener('click', (e) => {
        e.preventDefault();
        chrome.tabs.create({ url: chrome.runtime.getURL('dashboard/dashboard.html') });
      });
      row.appendChild(link);
      list.appendChild(row);
    }
  }

  function fmtCountdown(ms) {
    const totalSec = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    const mm = m < 10 ? '0' + m : String(m);
    const ss = s < 10 ? '0' + s : String(s);
    return h > 0 ? h + ':' + mm + ':' + ss : mm + ':' + ss;
  }

  function renderPomodoro() {
    const bar = $('pomodoroBar');
    const info = $('pomodoroInfo');
    const btn = $('btnPomodoro');
    const p = data.settings.pomodoro;
    const st = data.pomodoroState;
    $('pomoFocusMin').value = p.focusMinutes || 25;
    $('pomoRounds').value = p.rounds === undefined ? 4 : p.rounds;
    if (p.enabled) {
      if (st.phase === 'idle') {
        info.textContent = '\uD83C\uDF45 ' + t('pomodoroReady');
        btn.textContent = t('pomodoroStartFocus');
        bar.classList.remove('break');
      } else {
        const phase = st.phase === 'break' ? t('pomodoroPhaseBreak') : t('pomodoroPhaseFocus');
        info.textContent = '\uD83C\uDF45 ' + phase + ' \u00B7 ' + t('pomodoroRemaining', [fmtCountdown(st.remainingMs)]);
        btn.textContent = t('pomodoroEndFocus');
        bar.classList.toggle('break', st.phase === 'break');
      }
      bar.hidden = false;
      document.body.classList.add('has-pomodoro');
    } else {
      bar.hidden = true;
      document.body.classList.remove('has-pomodoro');
    }
  }

  function renderDomain(host, timeMs) {
    const item = document.createElement('div');
    item.className = 'domain-item';
    const st = statusFor(host);

    let badge = '';
    if (st.kind === 'blocked') badge = `<span class="badge blocked">${t('blockDomain')}</span>`;
    else if (st.kind === 'reached') badge = `<span class="badge reached">${t('limitReached')}</span>`;
    else if (st.kind === 'near') badge = `<span class="badge near">${t('remindNear')}</span>`;

    let progress = '';
    let progressClass = '';
    if (st.kind === 'limit' || st.kind === 'near' || st.kind === 'reached') {
      const pct = Math.min(100, Math.round((timeMs / st.limit.dailyMs) * 100));
      progressClass = st.kind === 'reached' ? 'reached' : st.kind === 'near' ? 'near' : '';
      progress = `<div class="progress ${progressClass}"><span style="width:${pct}%"></span></div>`;
    }

    const hasLimit = !!data.settings.limits[host];
    const isBlocked = st.kind === 'blocked';
    const limitBtn = hasLimit
      ? ''
      : `<button class="btn small" data-action="edit" data-host="${esc(host)}">${t('setLimit')}</button>`;
    const actions = `
      <div class="domain-actions">
        ${limitBtn}
        <button class="btn small" data-action="block" data-host="${esc(host)}">${t(isBlocked ? 'unblockDomain' : 'blockDomain')}</button>
      </div>`;

    item.innerHTML = `
      <div class="domain-top">
        <span class="domain-host" title="${esc(host)}">${esc(host)}</span>
        ${badge}
        <span class="domain-time">${fmt(timeMs)}</span>
      </div>
      ${progress}
      ${actions}`;

    item.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const h = btn.dataset.host;
      if (btn.dataset.action === 'edit') toggleEdit(item, h);
      else if (btn.dataset.action === 'block') toggleBlock(item, h, btn);
    });

    return item;
  }

  function toggleEdit(item, host) {
    render();
    editingHost = host;
    const items = [...list.children];
    const target = items.find((el) => el.querySelector('.domain-host')?.textContent === host);
    if (!target) return;

    const limit = data.settings.limits[host];
    const limitMin = limit ? Math.round(limit.dailyMs / 60000) : '';
    const remindMin = limit && limit.remindAtMs > 0 ? Math.round(limit.remindAtMs / 60000) : '';

    const form = document.createElement('div');
    form.className = 'edit-form';
    form.innerHTML = `
      <div class="edit-row">
        <label>${t('limitDaily')}</label>
        <input type="number" min="1" value="${limitMin}" placeholder="${t('limitDaily')}" />
      </div>
      <div class="edit-row">
        <label>${t('remindAt')}</label>
        <input type="number" min="0" value="${remindMin}" placeholder="${t('remindAt')}" />
      </div>
      <div class="edit-buttons">
        <button class="btn small primary" type="button" data-save>${t('save')}</button>
        ${hasLimit(host) ? `<button class="btn small danger" type="button" data-remove>${t('removeLimit')}</button>` : ''}
        <button class="btn small" type="button" data-cancel>${t('cancel')}</button>
      </div>`;

    const progressRow = target.querySelector('.progress');
    if (progressRow) progressRow.remove();

    target.appendChild(form);
    editingHost = host;

    form.querySelector('[data-cancel]').addEventListener('click', () => {
      editingHost = null;
      render();
    });

    form.querySelector('[data-save]').addEventListener('click', async () => {
      const inputs = form.querySelectorAll('input');
      const daily = Number(inputs[0].value);
      const remind = Number(inputs[1].value);
      if (!daily || daily < 1 || remind < 0 || isNaN(daily) || isNaN(remind)) {
        alert(t('invalidNumber'));
        return;
      }
      await send({
        type: 'SET_LIMIT',
        host,
        dailyMs: daily * 60000,
        remindAtMs: remind * 60000
      });
      editingHost = null;
      await refresh();
    });

    const rmBtn = form.querySelector('[data-remove]');
    if (rmBtn) {
      rmBtn.addEventListener('click', async () => {
        await send({ type: 'REMOVE_LIMIT', host });
        editingHost = null;
        await refresh();
      });
    }
  }

  function hasLimit(host) {
    return !!data.settings.limits[host];
  }

  async function toggleBlock(item, host, btn) {
    const isBlocked = data.settings.blacklist.indexOf(host) !== -1;
    await send({ type: isBlocked ? 'REMOVE_BLACKLIST' : 'ADD_BLACKLIST', host });
    await refresh();
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
    );
  }

  async function refresh() {
    const resp = await send({ type: 'GET_DATA' });
    data = resp.data;
    activeHost = resp.activeHost;
    render();
  }

  $('btnPause').addEventListener('click', async () => {
    await send({ type: 'PAUSE' });
    await refresh();
  });

  $('btnResume').addEventListener('click', async () => {
    await send({ type: 'RESUME' });
    await refresh();
  });

  $('btnPomodoro').addEventListener('click', async () => {
    const st = data.pomodoroState;
    if (st.phase === 'idle') {
      await send({ type: 'START_POMODORO' });
    } else {
      await send({ type: 'STOP_POMODORO' });
    }
    await refresh();
  });

  // inline pomodoro settings (focus minutes + round count), applied immediately
  async function applyPomodoroSettings() {
    if (!data) return;
    const focus = Math.max(1, Math.min(180, Math.floor(Number($('pomoFocusMin').value) || 25)));
    const rounds = Math.max(0, Math.min(99, Math.floor(Number($('pomoRounds').value) || 0)));
    $('pomoFocusMin').value = focus;
    $('pomoRounds').value = rounds;
    await send({
      type: 'SET_POMODORO',
      enabled: true,
      focusMinutes: focus,
      breakMinutes: (data.settings.pomodoro && data.settings.pomodoro.breakMinutes) || 5,
      rounds
    });
  }

  $('pomoFocusMin').addEventListener('change', () => {
    applyPomodoroSettings().then(() => refresh());
  });

  $('pomoRounds').addEventListener('change', () => {
    applyPomodoroSettings().then(() => refresh());
  });

  $('btnSettings').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  $('btnDashboard').addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('dashboard/dashboard.html') });
  });

  refresh();
  setInterval(refresh, 30000);

  // keep the pomodoro countdown precise to seconds while the popup is open
  setInterval(async () => {
    if (!data || !data.settings.pomodoro.enabled) return;
    try {
      const resp = await send({ type: 'GET_POMODORO' });
      if (resp && resp.ok) {
        data.pomodoroState.phase = resp.phase;
        data.pomodoroState.remainingMs = resp.remainingMs;
        renderPomodoro();
      }
    } catch (e) {
      /* ignore */
    }
  }, 1000);
})();
