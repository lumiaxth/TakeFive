(function () {
  const HE = (globalThis.HE = globalThis.HE || {});
  const HISTORY_DAYS = 7;

  const DEFAULTS = {
    date: '',
    domains: {},
    notifications: {},
    tracking: { host: null, since: 0 },
    settings: {
      limits: {},
      blacklist: [],
      pauseUntil: 0,
      breakMinutes: 10
    },
    history: []
  };

  function pad(n) {
    return n < 10 ? '0' + n : String(n);
  }

  function getDateStr(ts) {
    const d = ts ? new Date(ts) : new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function getTodayKey() {
    return getDateStr();
  }

  function getTimestamp(dateStr) {
    return new Date(dateStr + 'T00:00:00').getTime();
  }

  function mergeDefaults(data) {
    if (!data || typeof data !== 'object') data = {};
    const base = JSON.parse(JSON.stringify(DEFAULTS));
    data.domains = data.domains || {};
    data.notifications = data.notifications || {};
    data.tracking = data.tracking && typeof data.tracking === 'object' ? data.tracking : { host: null, since: 0 };
    data.settings = Object.assign({}, base.settings, data.settings || {});
    data.settings.limits = data.settings.limits || {};
    data.settings.blacklist = Array.isArray(data.settings.blacklist) ? data.settings.blacklist : [];
    data.history = Array.isArray(data.history) ? data.history : [];
    return data;
  }

  function normalizeLimitEntry(entry) {
    const n = entry && typeof entry === 'object' ? entry : {};
    return {
      dailyMs: Number(n.dailyMs) || 0,
      remindAtMs: Number(n.remindAtMs) >= 0 ? Number(n.remindAtMs) : 0
    };
  }

  async function load() {
    let data = await chrome.storage.local.get(null);
    data = mergeDefaults(data);
    const rolled = rolloverIfNeeded(data);
    if (rolled) await save(data);
    return data;
  }

  function save(data) {
    return chrome.storage.local.set(data);
  }

  function rolloverIfNeeded(data) {
    const today = getTodayKey();
    if (data.date === today) return false;
    const prevDate = data.date;
    const hasData = prevDate && Object.keys(data.domains).length > 0;
    if (hasData) {
      data.history.push({ date: prevDate, domains: data.domains });
      data.history.sort((a, b) => (a.date < b.date ? 1 : -1));
      if (data.history.length > HISTORY_DAYS) {
        data.history = data.history.slice(0, HISTORY_DAYS);
      }
    }
    data.date = today;
    data.domains = {};
    data.notifications = {};
    return true;
  }

  function totalForDomains(domains) {
    let total = 0;
    for (const host in domains) {
      if (Object.prototype.hasOwnProperty.call(domains, host)) {
        total += domains[host].timeMs || 0;
      }
    }
    return total;
  }

  function sortedDomains(domains) {
    return Object.keys(domains)
      .map((host) => ({ host, timeMs: domains[host].timeMs || 0 }))
      .filter((d) => d.timeMs > 0)
      .sort((a, b) => b.timeMs - a.timeMs);
  }

  function formatDuration(ms, units) {
    units = units || { h: 'h', m: 'm', s: 's' };
    ms = Math.max(0, Math.floor(ms));
    const s = Math.floor(ms / 1000);
    if (s < 60) return s + units.s;
    const m = Math.floor(s / 60);
    if (m < 60) return m + units.m;
    const h = Math.floor(m / 60);
    const rm = m % 60;
    return rm > 0 ? h + units.h + ' ' + rm + units.m : h + units.h;
  }

  function isPaused(data) {
    return !!(data.settings.pauseUntil && data.settings.pauseUntil > Date.now());
  }

  function minutesRemaining(data) {
    const rem = Math.ceil((data.settings.pauseUntil - Date.now()) / 60000);
    return rem > 0 ? rem : 0;
  }

  HE.storage = {
    HISTORY_DAYS,
    DEFAULTS,
    getDateStr,
    getTodayKey,
    getTimestamp,
    load,
    save,
    rolloverIfNeeded,
    totalForDomains,
    sortedDomains,
    formatDuration,
    normalizeLimitEntry,
    isPaused,
    minutesRemaining
  };
})();
