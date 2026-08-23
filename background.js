importScripts('shared/tldts.min.js', 'shared/hostname.js', 'shared/storage.js');

const RESUME_TOLERANCE_MS = 2 * 60 * 1000;
const USAGE_RESET_AFTER_MS = 2 * 60 * 1000;
const PAUSED_BADGE_CHAR = '\u2014';

const DEFAULT_ICONS = { 16: 'icons/icon16.png', 32: 'icons/icon32.png', 48: 'icons/icon48.png', 128: 'icons/icon128.png' };
const TOMATO_ICONS = { 16: 'icons/tomato16.png', 32: 'icons/tomato32.png', 48: 'icons/tomato48.png', 128: 'icons/tomato128.png' };

function createTickAlarm() {
  try {
    chrome.alarms.create('he-tick', { periodInMinutes: 0.5 });
    if (chrome.runtime.lastError) {
      chrome.alarms.create('he-tick', { periodInMinutes: 1 });
      chrome.runtime.lastError;
    }
  } catch (e) {
    chrome.alarms.create('he-tick', { periodInMinutes: 1 });
  }
}

let commitChain = Promise.resolve();
function serialized(fn) {
  const p = commitChain.then(fn, fn);
  commitChain = p.catch(() => {});
  return p;
}

let state = {
  activeHost: null,
  sessionStart: 0,
  activeTabId: -1,
  activeWindowId: -1,
  counting: false
};

function i18nUnits() {
  return {
    h: chrome.i18n.getMessage('hoursShort'),
    m: chrome.i18n.getMessage('minutesUnit'),
    s: 's'
  };
}

function limitReached(data, host) {
  const limit = data.settings.limits[host];
  if (!limit || !limit.dailyMs) return false;
  const t = (data.domains[host] && data.domains[host].timeMs) || 0;
  return t >= limit.dailyMs;
}

function pomodoroBlockReason(data, host) {
  const pomodoro = data.settings.pomodoro;
  if (!pomodoro.enabled || data.pomodoroState.phase !== 'focus') return null;
  if (HE.storage.isPaused(data)) return null;
  if (pomodoro.whitelist.indexOf(host) !== -1) return null;
  return 'pomodoro';
}

function blockedReasonFor(data, host) {
  if (data.settings.blacklist.indexOf(host) !== -1) return 'blacklist';
  if (HE.storage.isPaused(data)) return null;
  if (limitReached(data, host)) return 'limit';
  return pomodoroBlockReason(data, host);
}

function blockedUrl(reason, host, url) {
  return (
    chrome.runtime.getURL('blocked/blocked.html') +
    '?reason=' +
    encodeURIComponent(reason) +
    '&domain=' +
    encodeURIComponent(host) +
    '&url=' +
    encodeURIComponent(url || '')
  );
}

async function redirectTab(tabId, reason, host, url) {
  try {
    await chrome.tabs.update(tabId, { url: blockedUrl(reason, host, url) });
  } catch (e) {
    /* tab closed concurrently */
  }
}

async function enforceBlocks(data) {
  data = data || (await HE.storage.load());
  const paused = HE.storage.isPaused(data);
  const extPrefix = chrome.runtime.getURL('');
  const blockAllReason = (host) => {
    if (data.settings.blacklist.indexOf(host) !== -1) return 'blacklist';
    if (!paused && limitReached(data, host)) return 'limit';
    return null;
  };

  let activeTab = null;
  let tabs;
  try {
    const q = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    activeTab = q && q[0];
    tabs = await chrome.tabs.query({});
  } catch (e) {
    return;
  }

  for (const tab of tabs) {
    if (!tab.id || !tab.url) continue;
    if (tab.url.indexOf(extPrefix) === 0) continue;
    const host = HE.hostname.getRegistrableDomain(tab.url);
    if (!host) continue;
    if (activeTab && tab.id === activeTab.id) {
      const reason = blockedReasonFor(data, host);
      if (reason) await redirectTab(tab.id, reason, host, tab.url);
    } else {
      const reason = blockAllReason(host);
      if (reason) await redirectTab(tab.id, reason, host, tab.url);
    }
  }
}

async function showBanner(text) {
  if (!text || !state.activeTabId) return;
  try {
    await chrome.tabs.sendMessage(state.activeTabId, { type: 'HE_BANNER', text });
  } catch (e) {
    /* no content script on that tab (e.g. chrome://) */
  }
}

function notifyAndBanner(id, title, message, bannerText) {
  chrome.notifications.create(id, {
    type: 'basic',
    iconUrl: chrome.runtime.getURL('icons/icon48.png'),
    title: title,
    message: message
  });
  if (bannerText) showBanner(bannerText);
}

function fmtHm(ms) {
  const totalMin = Math.max(0, Math.floor((ms || 0) / 60000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h + ':' + (m < 10 ? '0' + m : m);
}

async function currentHost() {
  try {
    const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (tabs && tabs.length && tabs[0].url) {
      return HE.hostname.getRegistrableDomain(tabs[0].url);
    }
  } catch (e) {
    /* ignore */
  }
  return state.activeHost || null;
}

async function updateBadge() {
  try {
    const data = await HE.storage.load();
    const pomodoroActive = data.settings.pomodoro.enabled && data.pomodoroState.phase !== 'idle';
    chrome.action.setIcon({ path: pomodoroActive ? TOMATO_ICONS : DEFAULT_ICONS });
    if (HE.storage.isPaused(data)) {
      chrome.action.setBadgeBackgroundColor({ color: '#dc2626' });
      chrome.action.setBadgeText({ text: PAUSED_BADGE_CHAR });
      return;
    }
    const mode = data.settings.badgeMode || 'auto';
    const total = HE.storage.totalForDomains(data.domains);
    let text;
    if (mode === 'total') {
      text = fmtHm(total);
    } else if (mode === 'domain') {
      const host = await currentHost();
      text = host
        ? fmtHm((data.domains[host] && data.domains[host].timeMs) || 0)
        : fmtHm(total);
    } else if (mode === 'pomodoro') {
      text = pomodoroActive ? fmtHm(Math.max(0, data.pomodoroState.remainingMs)) : fmtHm(total);
    } else {
      // auto: pomodoro > current domain > total
      if (pomodoroActive) {
        text = fmtHm(Math.max(0, data.pomodoroState.remainingMs));
      } else {
        const host = await currentHost();
        text = host
          ? fmtHm((data.domains[host] && data.domains[host].timeMs) || 0)
          : fmtHm(total);
      }
    }
    chrome.action.setBadgeBackgroundColor({ color: '#16a34a' });
    chrome.action.setBadgeText({ text });
  } catch (e) {
    /* ignore */
  }
}

async function commitTime() {
  if (!state.activeHost || !state.counting) {
    state.sessionStart = Date.now();
    return;
  }
  const now = Date.now();
  const delta = now - state.sessionStart;
  state.sessionStart = now;
  if (delta < 1000) return;
  const host = state.activeHost;
  try {
    const data = await HE.storage.load();
    data.domains[host] = data.domains[host] || { timeMs: 0 };
    data.domains[host].timeMs += delta;
    data.tracking = { host, since: now };

    const ur = data.settings.usageReminder;
    if (ur.enabled && ur.minutes > 0) data.usage.accumulatedMs += delta;

    let pomodoroCrossed = false;
    const pomodoro = data.settings.pomodoro;
    if (pomodoro.enabled && data.pomodoroState.phase !== 'idle') {
      data.pomodoroState.remainingMs -= delta;
      if (data.pomodoroState.remainingMs <= 0) pomodoroCrossed = true;
    }

    const reachedFirstTime = await checkLimits(data, host);

    if (ur.enabled && ur.minutes > 0 && data.usage.accumulatedMs >= ur.minutes * 60000) {
      data.usage.accumulatedMs = 0;
      const dur = HE.storage.formatDuration(ur.minutes * 60000, i18nUnits());
      notifyAndBanner(
        'he-usage',
        chrome.i18n.getMessage('notifyUsageTitle'),
        chrome.i18n.getMessage('notifyUsageBody', [String(ur.minutes)]),
        chrome.i18n.getMessage('bannerUsage', [dur])
      );
    }

    await HE.storage.save(data);

    if (pomodoroCrossed) await switchPomodoroPhase(data);
    if (reachedFirstTime) await enforceBlocks(data);
    await updateBadge();
  } catch (e) {
    console.error('[Healthy Explorer] commitTime error', e);
  }
}

async function checkLimits(data, host) {
  const limit = data.settings.limits[host];
  if (!limit) return false;
  const timeMs = (data.domains[host] && data.domains[host].timeMs) || 0;
  const notified = data.notifications[host] || (data.notifications[host] = {});
  let changed = false;
  if (
    limit.remindAtMs > 0 &&
    timeMs >= limit.remindAtMs &&
    timeMs < limit.dailyMs &&
    !notified.near
  ) {
    notified.near = true;
    changed = true;
    chrome.notifications.create('he-near-' + host, {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icons/icon48.png'),
      title: chrome.i18n.getMessage('notifyLimitNear', [host]),
      message: chrome.i18n.getMessage('notifyLimitNearBody', [
        HE.storage.formatDuration(timeMs, i18nUnits()),
        HE.storage.formatDuration(limit.dailyMs, i18nUnits())
      ])
    });
  }
  let reachedFirstTime = false;
  if (limit.dailyMs > 0 && timeMs >= limit.dailyMs && !notified.reached) {
    notified.reached = true;
    changed = true;
    reachedFirstTime = true;
    chrome.notifications.create('he-reached-' + host, {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icons/icon48.png'),
      title: chrome.i18n.getMessage('notifyLimitReachedTitle', [host]),
      message: chrome.i18n.getMessage('notifyLimitReachedBody')
    });
  }
  if (changed) await HE.storage.save(data);
  return reachedFirstTime;
}

async function switchPomodoroPhase(data) {
  const pomodoro = data.settings.pomodoro;
  if (data.pomodoroState.phase === 'focus') {
    data.pomodoroState.phase = 'break';
    data.pomodoroState.remainingMs = pomodoro.breakMinutes * 60000;
    notifyAndBanner(
      'he-pomodoro-break',
      chrome.i18n.getMessage('notifyPomodoroBreakTitle'),
      chrome.i18n.getMessage('notifyPomodoroBreakBody', [String(pomodoro.breakMinutes)]),
      chrome.i18n.getMessage('bannerPomodoroBreak', [String(pomodoro.breakMinutes)])
    );
  } else {
    data.pomodoroState.phase = 'focus';
    data.pomodoroState.remainingMs = pomodoro.focusMinutes * 60000;
    notifyAndBanner(
      'he-pomodoro-focus',
      chrome.i18n.getMessage('notifyPomodoroFocusTitle'),
      chrome.i18n.getMessage('notifyPomodoroFocusBody', [String(pomodoro.focusMinutes)]),
      chrome.i18n.getMessage('bannerPomodoroFocus', [String(pomodoro.focusMinutes)])
    );
  }
  await HE.storage.save(data);
}

async function startSession(host) {
  if (state.activeHost === host && state.counting) return;
  await commitTime();
  state.activeHost = host;
  const data = await HE.storage.load();
  const now = Date.now();
  if (now - data.usage.lastStopAt > USAGE_RESET_AFTER_MS) {
    data.usage.accumulatedMs = 0;
  }
  data.usage.lastStopAt = 0;
  const paused = HE.storage.isPaused(data);
  state.counting = !paused;
  let since = now;
  if (!paused) {
    const tr = data.tracking;
    if (tr && tr.host === host && now - tr.since <= RESUME_TOLERANCE_MS) {
      since = tr.since;
    }
    state.sessionStart = since;
  }
  data.tracking = { host, since: state.counting ? since : 0 };
  await HE.storage.save(data);
}

async function stopSession() {
  if (!state.activeHost) {
    state.counting = false;
    return;
  }
  await commitTime();
  state.activeHost = null;
  state.counting = false;
  const data = await HE.storage.load();
  data.tracking = { host: null, since: 0 };
  data.usage.lastStopAt = Date.now();
  await HE.storage.save(data);
}

async function syncActiveTab() {
  try {
    const win = await chrome.windows.getLastFocused({ populate: false });
    if (!win || !win.focused || win.type === 'devtools') {
      await stopSession();
      state.hasFocus = false;
      return;
    }
    state.hasFocus = true;
    const tabs = await chrome.tabs.query({ active: true, windowId: win.id });
    if (!tabs || !tabs.length) {
      await stopSession();
      return;
    }
    const tab = tabs[0];
    state.activeWindowId = win.id;
    state.activeTabId = tab.id;
    const host = HE.hostname.getRegistrableDomain(tab.url || '');
    if (host) {
      await startSession(host);
    } else {
      await stopSession();
    }
    await enforceBlocks();
    await updateBadge();
  } catch (e) {
    /* window closed mid-query */
  }
}

async function setPaused(paused) {
  await commitTime();
  state.counting = !paused && !!state.activeHost;
  state.sessionStart = Date.now();
  const data = await HE.storage.load();
  data.settings.paused = !!paused;
  data.tracking = { host: state.activeHost, since: paused ? 0 : state.sessionStart };
  await HE.storage.save(data);
  await updateBadge();
}

async function onTick() {
  await commitTime();
  await syncActiveTab();
  await enforceBlocks();
  await updateBadge();
}

async function handleMessage(msg) {
  switch (msg && msg.type) {
    case 'GET_DATA': {
      await syncActiveTab();
      await commitTime();
      const data = await HE.storage.load();
      return { data, activeHost: state.activeHost, counting: state.counting };
    }
    case 'PAUSE':
      await setPaused(true);
      return {};
    case 'RESUME':
      await setPaused(false);
      return {};
    case 'SET_LIMIT': {
      const host = HE.hostname.normalizeDomain(msg.host);
      if (!host) return { error: 'invalidDomain' };
      const data = await HE.storage.load();
      if (msg.dailyMs > 0) {
        data.settings.limits[host] = HE.storage.normalizeLimitEntry({
          dailyMs: msg.dailyMs,
          remindAtMs: msg.remindAtMs
        });
      } else {
        delete data.settings.limits[host];
      }
      delete data.notifications[host];
      await HE.storage.save(data);
      await enforceBlocks(data);
      return {};
    }
    case 'REMOVE_LIMIT': {
      const host = HE.hostname.normalizeDomain(msg.host);
      const data = await HE.storage.load();
      if (host) delete data.settings.limits[host];
      if (host) delete data.notifications[host];
      await HE.storage.save(data);
      return {};
    }
    case 'ADD_BLACKLIST': {
      const host = HE.hostname.normalizeDomain(msg.host);
      if (!host) return { error: 'invalidDomain' };
      const data = await HE.storage.load();
      if (data.settings.blacklist.indexOf(host) === -1) {
        data.settings.blacklist.push(host);
      }
      await HE.storage.save(data);
      await enforceBlocks(data);
      return {};
    }
    case 'REMOVE_BLACKLIST': {
      const host = HE.hostname.normalizeDomain(msg.host);
      const data = await HE.storage.load();
      if (host) {
        data.settings.blacklist = data.settings.blacklist.filter((h) => h !== host);
      }
      await HE.storage.save(data);
      return {};
    }
    case 'SET_USAGE_REMINDER': {
      const data = await HE.storage.load();
      data.settings.usageReminder.enabled = !!msg.enabled;
      data.settings.usageReminder.minutes = Math.max(1, Math.floor(Number(msg.minutes) || 0));
      if (!data.settings.usageReminder.enabled) {
        data.usage.accumulatedMs = 0;
      }
      await HE.storage.save(data);
      return {};
    }
    case 'SET_POMODORO': {
      const data = await HE.storage.load();
      const prevEnabled = data.settings.pomodoro.enabled;
      data.settings.pomodoro.enabled = !!msg.enabled;
      data.settings.pomodoro.focusMinutes = Math.max(1, Math.floor(Number(msg.focusMinutes) || 0));
      data.settings.pomodoro.breakMinutes = Math.max(1, Math.floor(Number(msg.breakMinutes) || 0));
      if (data.settings.pomodoro.enabled) {
        if (!prevEnabled || data.pomodoroState.phase === 'idle') {
          data.pomodoroState.phase = 'focus';
          data.pomodoroState.remainingMs = data.settings.pomodoro.focusMinutes * 60000;
        } else if (data.pomodoroState.phase === 'focus') {
          data.pomodoroState.remainingMs = data.settings.pomodoro.focusMinutes * 60000;
        } else {
          data.pomodoroState.remainingMs = data.settings.pomodoro.breakMinutes * 60000;
        }
      } else {
        data.pomodoroState.phase = 'idle';
        data.pomodoroState.remainingMs = 0;
      }
      await HE.storage.save(data);
      await updateBadge();
      await enforceBlocks(data);
      return {};
    }
    case 'SET_BADGE_MODE': {
      const mode = ['auto', 'total', 'domain', 'pomodoro'].indexOf(msg.mode) !== -1 ? msg.mode : 'auto';
      const data = await HE.storage.load();
      data.settings.badgeMode = mode;
      await HE.storage.save(data);
      await updateBadge();
      return {};
    }
    case 'ADD_POMODORO_WHITELIST': {
      const host = HE.hostname.normalizeDomain(msg.host);
      if (!host) return { error: 'invalidDomain' };
      const data = await HE.storage.load();
      if (data.settings.pomodoro.whitelist.indexOf(host) === -1) {
        data.settings.pomodoro.whitelist.push(host);
      }
      await HE.storage.save(data);
      return {};
    }
    case 'REMOVE_POMODORO_WHITELIST': {
      const host = HE.hostname.normalizeDomain(msg.host);
      const data = await HE.storage.load();
      if (host) {
        data.settings.pomodoro.whitelist = data.settings.pomodoro.whitelist.filter((h) => h !== host);
      }
      await HE.storage.save(data);
      return {};
    }
    case 'IMPORT_TABS_TO_POMODORO_WHITELIST': {
      const data = await HE.storage.load();
      let added = 0;
      try {
        const tabs = await chrome.tabs.query({});
        for (const tab of tabs) {
          if (!tab.url) continue;
          const host = HE.hostname.getRegistrableDomain(tab.url);
          if (!host) continue;
          if (data.settings.pomodoro.whitelist.indexOf(host) === -1) {
            data.settings.pomodoro.whitelist.push(host);
            added++;
          }
        }
      } catch (e) {
        /* ignore */
      }
      await HE.storage.save(data);
      return { added };
    }
    case 'CLEAR_TODAY': {
      const data = await HE.storage.load();
      data.domains = {};
      data.notifications = {};
      await HE.storage.save(data);
      await updateBadge();
      return {};
    }
    case 'CLEAR_ALL': {
      await chrome.storage.local.clear();
      await HE.storage.load();
      await updateBadge();
      return {};
    }
    default:
      return { error: 'unknownMessage' };
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  serialized(async () => {
    try {
      const result = await handleMessage(msg);
      if (result && result.error) sendResponse({ ok: false, error: result.error });
      else sendResponse({ ok: true, ...result });
    } catch (err) {
      sendResponse({ ok: false, error: String(err) });
    }
  });
  return true;
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'he-tick') serialized(onTick);
});

chrome.tabs.onActivated.addListener((info) => {
  serialized(async () => {
    if (info.windowId !== state.activeWindowId) {
      await stopSession();
      state.activeWindowId = info.windowId;
    }
    await commitTime();
    state.activeTabId = info.tabId;
    try {
      const tab = await chrome.tabs.get(info.tabId);
      state.activeWindowId = tab.windowId;
      const host = HE.hostname.getRegistrableDomain(tab.url || '');
      if (host) {
        await startSession(host);
      } else {
        await stopSession();
      }
      await enforceBlocks();
    } catch (e) {
      /* tab closed */
    }
  });
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (tabId !== state.activeTabId) return;
  if (changeInfo.url) {
    serialized(async () => {
      await commitTime();
      const host = HE.hostname.getRegistrableDomain(tab.url || '');
      if (host) await startSession(host);
      else await stopSession();
    });
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabId === state.activeTabId) serialized(stopSession);
});

chrome.windows.onRemoved.addListener((windowId) => {
  if (windowId === state.activeWindowId) serialized(stopSession);
});

chrome.windows.onFocusChanged.addListener((windowId) => {
  serialized(async () => {
    if (windowId === chrome.windows.WINDOW_ID_NONE) {
      await stopSession();
    } else {
      await syncActiveTab();
    }
  });
});

chrome.webNavigation.onBeforeNavigate.addListener((details) => {
  if (details.frameId !== 0) return;
  const host = HE.hostname.getRegistrableDomain(details.url);
  if (!host) return;
  serialized(async () => {
    const data = await HE.storage.load();
    const reason = blockedReasonFor(data, host);
    if (!reason) return;
    try {
      await chrome.tabs.update(details.tabId, { url: blockedUrl(reason, host, details.url) });
    } catch (e) {
      /* tab may already be gone */
    }
  });
});

chrome.notifications.onClicked.addListener((id) => {
  chrome.tabs.create({ url: chrome.runtime.getURL('options/options.html') });
  chrome.notifications.clear(id);
});

function init() {
  createTickAlarm();
  serialized(async () => {
    await HE.storage.load();
    await syncActiveTab();
    await enforceBlocks();
    await updateBadge();
  });
}

chrome.runtime.onInstalled.addListener(init);
init();
