importScripts('shared/tldts.min.js', 'shared/hostname.js', 'shared/storage.js');

const RESUME_TOLERANCE_MS = 2 * 60 * 1000;

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

function blockedReasonFor(data, host) {
  if (data.settings.blacklist.indexOf(host) !== -1) return 'blacklist';
  if (HE.storage.isPaused(data)) return null;
  const limit = data.settings.limits[host];
  if (limit && limit.dailyMs > 0) {
    const t = (data.domains[host] && data.domains[host].timeMs) || 0;
    if (t >= limit.dailyMs) return 'limit';
  }
  return null;
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
    await HE.storage.save(data);
    await checkLimits(data, host);
  } catch (e) {
    console.error('[Healthy Explorer] commitTime error', e);
  }
}

async function checkLimits(data, host) {
  const limit = data.settings.limits[host];
  if (!limit) return;
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
  if (limit.dailyMs > 0 && timeMs >= limit.dailyMs && !notified.reached) {
    notified.reached = true;
    changed = true;
    chrome.notifications.create('he-reached-' + host, {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icons/icon48.png'),
      title: chrome.i18n.getMessage('notifyLimitReachedTitle', [host]),
      message: chrome.i18n.getMessage('notifyLimitReachedBody')
    });
  }
  if (changed) await HE.storage.save(data);
}

async function startSession(host) {
  if (state.activeHost === host && state.counting) return;
  await commitTime();
  state.activeHost = host;
  const data = await HE.storage.load();
  const paused = HE.storage.isPaused(data);
  state.counting = !paused;
  let since = Date.now();
  if (!paused) {
    const tr = data.tracking;
    if (tr && tr.host === host && Date.now() - tr.since <= RESUME_TOLERANCE_MS) {
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
  await chrome.storage.local.set({ tracking: { host: null, since: 0 } });
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
    if (host) await startSession(host);
    else await stopSession();
  } catch (e) {
    /* window closed mid-query */
  }
}

async function pauseTemporarily(minutes) {
  await commitTime();
  state.counting = false;
  const data = await HE.storage.load();
  data.settings.pauseUntil = Date.now() + minutes * 60000;
  data.tracking = { host: state.activeHost, since: 0 };
  await HE.storage.save(data);
}

async function resumeTracking() {
  await commitTime();
  const data = await HE.storage.load();
  data.settings.pauseUntil = 0;
  state.counting = !!state.activeHost;
  state.sessionStart = Date.now();
  data.tracking = { host: state.activeHost, since: state.sessionStart };
  await HE.storage.save(data);
}

async function onTick() {
  await commitTime();
  const data = await HE.storage.load();
  const paused = data.settings.pauseUntil > 0;
  if (paused && data.settings.pauseUntil <= Date.now()) {
    data.settings.pauseUntil = 0;
    state.counting = !!state.activeHost;
    state.sessionStart = Date.now();
    data.tracking = { host: state.activeHost, since: state.sessionStart };
    await HE.storage.save(data);
  }
  await syncActiveTab();
}

async function handleMessage(msg) {
  switch (msg && msg.type) {
    case 'GET_DATA': {
      await syncActiveTab();
      await commitTime();
      const data = await HE.storage.load();
      return { data, activeHost: state.activeHost, counting: state.counting };
    }
    case 'PAUSE': {
      const minutes = Math.max(1, Math.floor(Number(msg.minutes) || 0));
      await pauseTemporarily(minutes);
      return {};
    }
    case 'RESUME':
      await resumeTracking();
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
    case 'SET_BREAK_MINUTES': {
      const minutes = Math.max(1, Math.floor(Number(msg.minutes) || 0));
      const data = await HE.storage.load();
      data.settings.breakMinutes = minutes;
      await HE.storage.save(data);
      return {};
    }
    case 'CLEAR_TODAY': {
      const data = await HE.storage.load();
      data.domains = {};
      data.notifications = {};
      await HE.storage.save(data);
      return {};
    }
    case 'CLEAR_ALL': {
      await chrome.storage.local.clear();
      await HE.storage.load();
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
      if (host) await startSession(host);
      else await stopSession();
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
      const url =
        chrome.runtime.getURL('blocked/blocked.html') +
        '?reason=' +
        encodeURIComponent(reason) +
        '&domain=' +
        encodeURIComponent(host) +
        '&url=' +
        encodeURIComponent(details.url);
      await chrome.tabs.update(details.tabId, { url });
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
  });
}

chrome.runtime.onInstalled.addListener(init);
init();
