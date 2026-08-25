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

  let todayExpanded = false;
  let detailExpanded = false;

  function render() {
    renderToday();
    buildDays();
    renderChart();
  }

  function renderToday() {
    const todayTotal = HE.storage.totalForDomains(data.domains);
    $('todayTotal').textContent = fmt(todayTotal);
    const all = HE.storage.sortedDomains(data.domains);
    const list = todayExpanded ? all : all.slice(0, 5);
    $('todayList').innerHTML =
      list.length > 0
        ? list
            .map((d) =>
              '<div class="day-row"><span class="rhost">' + esc(d.host) + '</span><span class="rtime">' + esc(fmt(d.timeMs)) + '</span></div>'
            )
            .join('')
        : '<div class="day-row"><span class="rhost">' + esc(t('noData')) + '</span></div>';

    const more = $('todayMore');
    if (all.length > 5) {
      more.hidden = false;
      more.textContent = t(todayExpanded ? 'collapse' : 'moreDomains');
    } else {
      more.hidden = true;
      more.textContent = '';
    }
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
    const totals = days.map((d) => d.total);
    const max = Math.max(1, ...totals);
    chartEl.textContent = '';

    const grid = document.createElement('div');
    grid.className = 'chart-grid';
    [25, 50, 75].forEach((p) => {
      const line = document.createElement('div');
      line.className = 'gridline';
      line.style.bottom = p + '%';
      grid.appendChild(line);
    });
    const avg = totals.reduce((a, b) => a + b, 0) / days.length;
    if (max > 0 && avg > 0) {
      const avgLine = document.createElement('div');
      avgLine.className = 'avg-line';
      avgLine.style.bottom = Math.max(2, Math.round((avg / max) * 100)) + '%';
      const lbl = document.createElement('div');
      lbl.className = 'avg-label';
      const title = document.createElement('span');
      title.className = 'avg-title';
      title.textContent = t('chartAvg');
      const timeEl = document.createElement('span');
      timeEl.className = 'avg-time';
      timeEl.textContent = fmt(avg);
      lbl.appendChild(title);
      lbl.appendChild(timeEl);
      avgLine.appendChild(lbl);
      grid.appendChild(avgLine);
    }
    chartEl.appendChild(grid);

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
    if (day) {
      detailExpanded = false;
      renderDayDetail(day);
    }
  }

  function renderDayDetail(day) {
    dayDetailEl.textContent = '';
    if (!day || !day.entry || day.total <= 0) {
      const dateEl = document.createElement('div');
      dateEl.className = 'detail-date';
      dateEl.textContent = day && day.date && day.date === data.date ? t('todayDateLabel') : (day ? day.date : t('todayDateLabel'));
      const empty = document.createElement('div');
      empty.className = 'detail-empty';
      empty.textContent = t('noDataForDay');
      dayDetailEl.appendChild(dateEl);
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

    const all = HE.storage.sortedDomains(day.entry.domains);
    const list = detailExpanded ? all : all.slice(0, 5);
    const rows = document.createElement('div');
    rows.className = 'day-rows';
    list.forEach((d) => {
      const row = document.createElement('div');
      row.className = 'day-row';
      row.innerHTML =
        '<span class="rhost">' + esc(d.host) + '</span><span class="rtime">' + esc(fmt(d.timeMs)) + '</span>';
      rows.appendChild(row);
    });
    dayDetailEl.appendChild(rows);

    if (all.length > 5) {
      const more = document.createElement('div');
      more.className = 'more-link';
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = t(detailExpanded ? 'collapse' : 'moreDomains');
      btn.addEventListener('click', () => {
        detailExpanded = !detailExpanded;
        renderDayDetail(day);
      });
      more.appendChild(btn);
      dayDetailEl.appendChild(more);
    }
  }

  $('btnSettings').addEventListener('click', () => {
    location.href = chrome.runtime.getURL('options/options.html');
  });

  $('todayMore').addEventListener('click', () => {
    todayExpanded = !todayExpanded;
    renderToday();
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
