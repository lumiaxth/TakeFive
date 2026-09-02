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
  const HE = (globalThis.HE = globalThis.HE || {});
  const HISTORY_DAYS = 7;

  const DEFAULTS = {
    date: '',
    domains: {},
    notifications: {},
    tracking: { host: null, since: 0 },
    usage: { accumulatedMs: 0, lastStopAt: 0 },
    pomodoroState: { phase: 'idle', remainingMs: 0, anchorAt: 0, completedRounds: 0 },
    pomodoroToday: { date: '', rounds: 0, focusMs: 0 },
    blocksToday: { date: '', count: 0 },
    settings: {
      limits: {},
      blacklist: [],
      paused: false,
      badgeMode: 'auto',
      theme: 'system',
      countdown: {
        enabled: true,
        thresholdMin: 15,
        position: 'middle-right',
        size: 'medium',
        clock: true
      },
      usageReminder: { enabled: false, minutes: 45 },
      pomodoro: { enabled: true, focusMinutes: 25, breakMinutes: 5, rounds: 4, sound: true, whitelist: [] }
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
    data.usage = data.usage && typeof data.usage === 'object' ? data.usage : { accumulatedMs: 0, lastStopAt: 0 };
    data.pomodoroState = data.pomodoroState && typeof data.pomodoroState === 'object'
      ? data.pomodoroState
      : { phase: 'idle', remainingMs: 0, anchorAt: 0, completedRounds: 0 };
    data.pomodoroState.anchorAt = typeof data.pomodoroState.anchorAt === 'number' ? data.pomodoroState.anchorAt : 0;
    data.pomodoroState.completedRounds = typeof data.pomodoroState.completedRounds === 'number' ? data.pomodoroState.completedRounds : 0;
    data.pomodoroToday = data.pomodoroToday && typeof data.pomodoroToday === 'object'
      ? data.pomodoroToday
      : { date: '', rounds: 0, focusMs: 0 };
    data.blocksToday = data.blocksToday && typeof data.blocksToday === 'object'
      ? data.blocksToday
      : { date: '', count: 0 };
    data.settings = Object.assign({}, base.settings, data.settings || {});
    const legacyPaused =
      typeof data.settings.pauseUntil === 'number' && data.settings.pauseUntil > Date.now();
    data.settings.paused = !!data.settings.paused || legacyPaused;
    delete data.settings.pauseUntil;
    delete data.settings.breakMinutes;
    data.settings.usageReminder = Object.assign({ enabled: false, minutes: 45 }, data.settings.usageReminder || {});
    data.settings.countdown = Object.assign(
      { enabled: true, thresholdMin: 15, position: 'middle-right', size: 'medium', clock: true },
      data.settings.countdown || {}
    );
    data.settings.pomodoro = Object.assign(
      { enabled: true, focusMinutes: 25, breakMinutes: 5, rounds: 4, sound: true, whitelist: [] },
      data.settings.pomodoro || {}
    );
    data.settings.pomodoro.whitelist = Array.isArray(data.settings.pomodoro.whitelist)
      ? data.settings.pomodoro.whitelist
      : [];
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
    data.pomodoroToday = { date: today, rounds: 0, focusMs: 0 };
    data.blocksToday = { date: today, count: 0 };
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
    return !!data.settings.paused;
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
    isPaused
  };
})();
