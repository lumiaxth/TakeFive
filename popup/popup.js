(function () {
  HE.i18n.apply();
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
      const rem = HE.storage.minutesRemaining(data);
      pausedBanner.hidden = false;
      pausedBanner.textContent = t('pausedFor', [String(rem)]);
    } else {
      pausedBanner.hidden = true;
    }

    if (activeHost) {
      activeHostEl.hidden = false;
      activeHostEl.textContent = activeHost;
    } else {
      activeHostEl.hidden = true;
    }

    const domains = HE.storage.sortedDomains(data.domains);
    emptyEl.hidden = domains.length > 0;
    list.textContent = '';
    domains.forEach((d) => list.appendChild(renderDomain(d.host, d.timeMs)));
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
    const actions = `
      <div class="domain-actions">
        <button class="btn small" data-action="edit" data-host="${esc(host)}">${t(hasLimit ? 'edit' : 'setLimit')}</button>
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
    const minutes = data.settings.breakMinutes || 10;
    await send({ type: 'PAUSE', minutes });
    await refresh();
  });

  $('btnResume').addEventListener('click', async () => {
    await send({ type: 'RESUME' });
    await refresh();
  });

  $('linkSettings').addEventListener('click', (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });

  refresh();
  setInterval(refresh, 30000);
})();
