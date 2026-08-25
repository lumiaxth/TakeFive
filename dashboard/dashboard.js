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
  const chartEl = $('chart');
  const dayDetailEl = $('dayDetail');

  let data = null;
  let days = [];

  function send(msg) {
    return chrome.runtime.sendMessage(msg);
  }

  async function refresh() {
    const resp = await send({ type: 'GET_DATA' });
    data = resp.data;
    render();
  }

  function render() {
    const todayTotal = HE.storage.totalForDomains(data.domains);
    $('todayTotal').textContent = fmt(todayTotal);
    const todayRows = HE.storage.sortedDomains(data.domains);
    $('todayList').innerHTML =
      todayRows.length > 0
        ? todayRows
            .map((d) =>
              '<div class="day-row"><span class="rhost">' + esc(d.host) + '</span><span class="rtime">' + esc(fmt(d.timeMs)) + '</span></div>'
            )
            .join('')
        : '<div class="day-row"><span class="rhost">' + esc(t('noData')) + '</span></div>';

    buildDays();
    renderChart();
  }

  function buildDays() {
    days = [];
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      const key = HE.storage.getDateStr(d.getTime());
      let entry = null;
      if (key === data.date) {
        entry = { date: key, domains: data.domains };
      } else {
        entry = data.history.find((h) => h.date === key) || null;
      }
      const total = entry ? HE.storage.totalForDomains(entry.domains) : 0;
      days.push({ date: key, entry, total });
    }
  }

  function renderChart() {
    const max = Math.max(1, ...days.map((d) => d.total));
    chartEl.textContent = '';
    days.forEach((day, idx) => {
      const col = document.createElement('div');
      col.className = 'bar-col' + (idx === 6 ? ' selected' : '');
      const bar = document.createElement('div');
      bar.className = 'bar';
      const pct = day.total > 0 ? Math.max(4, Math.round((day.total / max) * 100)) : 0;
      bar.style.height = pct + '%';
      bar.title = day.total > 0 ? fmt(day.total) : t('noData');
      const label = document.createElement('div');
      label.className = 'bar-label';
      label.textContent = day.date.slice(5).replace('-', '/');
      col.appendChild(bar);
      col.appendChild(label);
      col.addEventListener('click', () => selectDay(day.date));
      chartEl.appendChild(col);
    });
    renderDayDetail(days[6]);
  }

  function selectDay(dateKey) {
    const cols = chartEl.querySelectorAll('.bar-col');
    cols.forEach((c) => {
      const label = c.querySelector('.bar-label').textContent;
      c.classList.toggle('selected', label === dateKey.slice(5).replace('-', '/'));
    });
    const day = days.find((d) => d.date === dateKey);
    if (day) renderDayDetail(day);
  }

  function renderDayDetail(day) {
    dayDetailEl.textContent = '';
    if (!day || !day.entry || day.total <= 0) {
      const empty = document.createElement('div');
      empty.className = 'detail-empty';
      empty.textContent = t('noData');
      dayDetailEl.appendChild(empty);
      return;
    }
    const dateEl = document.createElement('div');
    dateEl.className = 'detail-date';
    dateEl.textContent = day.date === data.date ? t('todayDateLabel') : day.date;
    const totalEl = document.createElement('div');
    totalEl.className = 'detail-total';
    totalEl.textContent = t('totalForDay', [fmt(day.total)]);
    dayDetailEl.appendChild(dateEl);
    dayDetailEl.appendChild(totalEl);

    const title = document.createElement('div');
    title.className = 'detail-top-title';
    title.textContent = t('topDomains');
    dayDetailEl.appendChild(title);

    const rows = document.createElement('div');
    rows.className = 'day-rows';
    HE.storage.sortedDomains(day.entry.domains)
      .slice(0, 5)
      .forEach((d) => {
        const row = document.createElement('div');
        row.className = 'day-row';
        row.innerHTML =
          '<span class="rhost">' + esc(d.host) + '</span><span class="rtime">' + esc(fmt(d.timeMs)) + '</span>';
        rows.appendChild(row);
      });
    dayDetailEl.appendChild(rows);
  }

  $('btnSettings').addEventListener('click', () => {
    location.href = chrome.runtime.getURL('options/options.html');
  });

  $('btnClearToday').addEventListener('click', async () => {
    if (confirm(t('clearToday') + '?')) {
      await send({ type: 'CLEAR_TODAY' });
      await refresh();
    }
  });

  $('btnClearAll').addEventListener('click', async () => {
    if (confirm(t('clearAll') + '?')) {
      await send({ type: 'CLEAR_ALL' });
      await refresh();
    }
  });

  refresh();
})();
