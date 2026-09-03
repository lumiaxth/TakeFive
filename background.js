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
/*
 * background.js — Service Worker 核心调度。
 * 职责：前台计时结算与每日归档、限额/黑名单/番茄钟阻断、番茄钟墙钟推进、
 *       浮动倒计时与时钟推送、深浅主题角标渲染、扩展消息路由。
 * 架构与消息协议详见 TECHNICAL.md。
 */


importScripts('shared/tldts.min.js', 'shared/hostname.js', 'shared/storage.js');

const RESUME_TOLERANCE_MS = 2 * 60 * 1000;
const USAGE_RESET_AFTER_MS = 2 * 60 * 1000;
const MAX_COMMIT_DELTA_MS = 3 * 60 * 1000;
const POMODORO_CLOSED_THRESHOLD_MS = 2 * 60 * 1000;
const IDLE_DETECT_SECONDS = 60;
const PAUSED_BADGE_CHAR = '\u2014';

async function queryIdleState() {
  try {
    return await chrome.idle.queryState(IDLE_DETECT_SECONDS);
  } catch (e) {
    return 'active';
  }
}

const DEFAULT_ICONS = { 16: 'icons/icon16.png', 32: 'icons/icon32.png', 48: 'icons/icon48.png', 128: 'icons/icon128.png' };
const TOMATO_ICONS = { 16: 'icons/tomato16.png', 32: 'icons/tomato32.png', 48: 'icons/tomato48.png', 128: 'icons/tomato128.png' };

// 创建 30s 周期闹钟（旧内核回退 60s），驱动计时结算与状态推进
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
// 串行队列：所有涉及存储读写的异步任务依次执行，避免并发交错
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

// 该域名今日是否已达每日限额
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

// 今日拦截计数 +1（跨天自动重置）
async function countBlock() {
  try {
    const data = await HE.storage.load();
    const today = HE.storage.getTodayKey();
    if (data.blocksToday.date !== today) {
      data.blocksToday = { date: today, count: 0 };
    }
    data.blocksToday.count += 1;
    await HE.storage.save(data);
  } catch (e) {
    /* ignore */
  }
}

// 重定向标签页到阻断页并累计拦截数
async function redirectTab(tabId, reason, host, url) {
  try {
    await chrome.tabs.update(tabId, { url: blockedUrl(reason, host, url) });
    await countBlock();
  } catch (e) {
    /* tab closed concurrently */
  }
}

// 阻断扫描：活动标签页按全原因，后台标签页仅黑名单/限额
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

// 向活动标签页投递页面顶部横幅
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

let soundDocCreating = false;
// 确保 offscreen 音频页存在（幂等）
async function ensureSoundDocument() {
  try {
    const contexts = await chrome.runtime.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT']
    });
    if (contexts && contexts.length > 0) return true;
    if (soundDocCreating) return false;
    soundDocCreating = true;
    try {
      await chrome.offscreen.createDocument({
        url: 'offscreen/sound.html',
        reasons: ['AUDIO_PLAYBACK'],
        justification: 'Play pomodoro timer notification sounds'
      });
      return true;
    } finally {
      soundDocCreating = false;
    }
  } catch (e) {
    return false;
  }
}

// 触发 offscreen 提示音播放
async function playSound(pattern) {
  try {
    const ok = await ensureSoundDocument();
    if (!ok) return;
    const p = chrome.runtime.sendMessage({ type: 'PLAY_SOUND', pattern });
    if (p && p.catch) p.catch(() => {});
  } catch (e) {
    /* ignore */
  }
}

// 角标时长 h:mm；≥10h 输出紧凑 10h（角标仅约 4 字符可见宽度）
function fmtHm(ms) {
  const totalMin = Math.max(0, Math.floor((ms || 0) / 60000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  // the badge only fits ~4 characters, so compact hours >= 10 as "10h"/"99h"
  if (h >= 10) return h + 'h';
  return h + ':' + (m < 10 ? '0' + m : m);
}

// 当前活动标签页域名：优先实时查询，回退内存态
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

// 角标与图标渲染：暂停角标 / 按 badgeMode 显示时长 / 番茄运行时切换番茄图标
async function updateBadge() {
  try {
    const data = await HE.storage.load();
    const pomodoroActive = data.settings.pomodoro.enabled && data.pomodoroState.phase !== 'idle';
    chrome.action.setIcon({ path: pomodoroActive ? TOMATO_ICONS : DEFAULT_ICONS });
    if (HE.storage.isPaused(data)) {
      chrome.action.setBadgeBackgroundColor({ color: '#dc2626' });
      chrome.action.setBadgeText({ text: PAUSED_BADGE_CHAR });
      chrome.action.setBadgeTextColor({ color: "white" });
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
    chrome.action.setBadgeBackgroundColor({ color: '#008000' });
    chrome.action.setBadgeText({ text });
    chrome.action.setBadgeTextColor({ color: "white" });
  } catch (e) {
    /* ignore */
  }
}

// 组装浮窗 chips：番茄钟（墙钟剩余，恒走秒）+ 站点限额（临近阈值，按实际计数）
function computeCountdown(data, host, counting, paused) {
  const chips = [];
  const pomodoro = data.settings.pomodoro;
  if (pomodoro.enabled && data.pomodoroState.phase !== 'idle') {
    const anchor = data.pomodoroState.anchorAt || Date.now();
    const remaining = Math.max(0, data.pomodoroState.remainingMs - (Date.now() - anchor));
    chips.push({
      id: 'pomodoro',
      emoji: data.pomodoroState.phase === 'break' ? '\u2615' : '\uD83C\uDF45',
      remainingMs: remaining,
      ticking: true
    });
  }
  const cd = data.settings.countdown;
  if (host) {
    const limit = data.settings.limits[host];
    if (limit && limit.dailyMs > 0) {
      const used = (data.domains[host] && data.domains[host].timeMs) || 0;
      const remaining = limit.dailyMs - used;
      if (remaining > 0 && remaining <= cd.thresholdMin * 60000) {
        chips.push({
          id: 'site',
          emoji: '\u23F3',
          remainingMs: remaining,
          ticking: !!counting && !paused
        });
      }
    }
  }
  return chips;
}

// 组装悬停面板 info 对象：今日总量/当前站点/连续使用/轮次/拦截/榜首
function buildWidgetInfo(data, host) {
  const todayKey = HE.storage.getTodayKey();
  const pt = data.pomodoroToday && data.pomodoroToday.date === todayKey
    ? data.pomodoroToday
    : { date: todayKey, rounds: 0, focusMs: 0 };
  const blocks = data.blocksToday && data.blocksToday.date === todayKey ? data.blocksToday.count : 0;
  const sorted = HE.storage.sortedDomains(data.domains);
  const top = sorted.length > 0 ? sorted[0] : null;
  const siteMs = host && data.domains[host] ? data.domains[host].timeMs : 0;
  return {
    totalMs: HE.storage.totalForDomains(data.domains),
    siteHost: host || null,
    siteMs,
    paused: HE.storage.isPaused(data),
    continuousMs: data.usage.accumulatedMs || 0,
    continuousTargetMin: data.settings.usageReminder.minutes || 0,
    pomodoroRounds: pt.rounds,
    pomodoroFocusMin: Math.round(pt.focusMs / 60000),
    blocks,
    topHost: top ? top.host : null,
    topMs: top ? top.timeMs : 0,
    hasAnyData: sorted.length > 0
  };
}

// 双路投递：定向活动标签页（网页内容脚本）+ 广播（插件内页面）
function sendCountdown(tabId, chips, theme, paused, position, size, ticking, clock, info) {
  let msg;
  if ((chips && chips.length) || clock) {
    msg = {
      type: 'HE_COUNTDOWN',
      chips: chips || [],
      theme: theme || 'system',
      paused: !!paused,
      ticking: !!ticking,
      clock: !!clock,
      position: position || 'middle-right',
      size: size || 'medium',
      info: info || null
    };
  } else {
    msg = { type: 'HE_COUNTDOWN_HIDE' };
  }
  // targeted: the active web tab's content script
  if (tabId != null && tabId >= 0) {
    try {
      const p = chrome.tabs.sendMessage(tabId, msg);
      if (p && p.catch) p.catch(() => {});
    } catch (e) { /* no content script on that tab */ }
  }
  // broadcast: extension pages (options / dashboard / blocked)
  try {
    const p = chrome.runtime.sendMessage(msg);
    if (p && p.catch) p.catch(() => {});
  } catch (e) { /* no receivers */ }
}

// 推送总入口：推进番茄钟 → 组装 chips/info → 广播
async function pushCountdown() {
  try {
    const data = await HE.storage.load();
    const crossed = await advancePomodoro(data);
    if (crossed) await HE.storage.save(data);
    const cd = data.settings.countdown;
    const host = state.activeHost || (await currentHost());
    const chips = cd.enabled ? computeCountdown(data, host, state.counting, data.settings.paused) : null;
    const info = buildWidgetInfo(data, host);
    sendCountdown(state.activeTabId, chips, data.settings.theme, data.settings.paused, cd.position, cd.size, state.counting, cd.clock, info);
  } catch (e) {
    /* ignore */
  }
}

// 计时结算：累计前台停留到域名与连续使用，推进番茄钟，检查限额
async function commitTime() {
  if (!state.activeHost || !state.counting) {
    state.sessionStart = Date.now();
    return;
  }
  const now = Date.now();
  const delta = now - state.sessionStart;
  state.sessionStart = now;
  if (delta < 1000) return;
  if (delta > MAX_COMMIT_DELTA_MS) {
    // machine was likely asleep/suspended: don't count the gap
    return;
  }
  const host = state.activeHost;
  try {
    const data = await HE.storage.load();
    data.domains[host] = data.domains[host] || { timeMs: 0 };
    data.domains[host].timeMs += delta;
    data.tracking = { host, since: now };

    const ur = data.settings.usageReminder;
    if (ur.enabled && ur.minutes > 0) data.usage.accumulatedMs += delta;

    const pomodoroCrossed = await advancePomodoro(data);

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

    if (pomodoroCrossed) await pushCountdown();
    if (reachedFirstTime) await enforceBlocks(data);
    await updateBadge();
    await pushCountdown();
  } catch (e) {
    console.error('[TakeFive] commitTime error', e);
  }
}

// 限额通知（接近/达成，每站点每日一次）；返回是否首次达成
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

// 用户是否在场（系统 idle 60s 内有操作）
async function isUserActive() {
  try {
    const state = await chrome.idle.queryState(60);
    return state === 'active';
  } catch (e) {
    return true;
  }
}

// 番茄钟墙钟推进：按锚点推进，循环处理一次跨多阶段；离开时静默或停止本轮
async function advancePomodoro(data) {
  const pomodoro = data.settings.pomodoro;
  const st = data.pomodoroState;
  if (!pomodoro.enabled || st.phase === 'idle') return false;
  const now = Date.now();
  const anchor = st.anchorAt || now;
  let elapsed = Math.max(0, now - anchor);
  if (elapsed <= 0) return false;
  let crossed = false;
  while (elapsed > 0 && st.phase !== 'idle') {
    if (elapsed < st.remainingMs) {
      st.remainingMs -= elapsed;
      elapsed = 0;
    } else {
      elapsed -= st.remainingMs;
      crossed = true;
      if (st.phase === 'focus') {
        // focus ended -> break starts; count the completed round
        st.completedRounds = (st.completedRounds || 0) + 1;
        const todayKey = HE.storage.getTodayKey();
        if (data.pomodoroToday.date !== todayKey) {
          data.pomodoroToday = { date: todayKey, rounds: 0, focusMs: 0 };
        }
        data.pomodoroToday.rounds += 1;
        data.pomodoroToday.focusMs += pomodoro.focusMinutes * 60000;
        st.phase = 'break';
        st.remainingMs = pomodoro.breakMinutes * 60000;
        if (await isUserActive()) {
          playSound('focus');
          notifyAndBanner(
            'he-pomodoro-focus-end',
            chrome.i18n.getMessage('notifyPomodoroFocusTitle'),
            chrome.i18n.getMessage('notifyPomodoroFocusBody', [String(pomodoro.breakMinutes)]),
            chrome.i18n.getMessage('bannerPomodoroFocus', [String(pomodoro.breakMinutes)])
          );
        }
      } else {
        // break ended -> start focus, or stop the round if the user is away
        if (await isUserActive()) {
          const rounds = pomodoro.rounds || 0;
          if (rounds > 0 && st.completedRounds >= rounds) {
            st.phase = 'idle';
            st.remainingMs = 0;
            st.anchorAt = Date.now();
            notifyAndBanner(
              'he-pomodoro-all-done',
              chrome.i18n.getMessage('notifyPomodoroAllDoneTitle'),
              chrome.i18n.getMessage('notifyPomodoroAllDoneBody', [String(st.completedRounds)])
            );
            await HE.storage.save(data);
            playSound('complete');
          } else {
            st.phase = 'focus';
            st.remainingMs = pomodoro.focusMinutes * 60000;
            notifyAndBanner(
              'he-pomodoro-break-end',
              chrome.i18n.getMessage('notifyPomodoroBreakTitle'),
              chrome.i18n.getMessage('notifyPomodoroBreakBody', [String(pomodoro.focusMinutes)]),
              chrome.i18n.getMessage('bannerPomodoroBreak', [String(pomodoro.focusMinutes)])
            );
            playSound('break');
          }
        } else {
          st.phase = 'idle';
          st.remainingMs = 0;
          notifyAndBanner(
            'he-pomodoro-round-over',
            chrome.i18n.getMessage('notifyPomodoroRoundOverTitle'),
            chrome.i18n.getMessage('notifyPomodoroRoundOverBody')
          );
        }
      }
    }
  }
  st.anchorAt = now;
  return crossed;
}

// 浏览器关闭检测：锚点超阈值则停止番茄钟并通知「未完成」
async function handleClosedPomodoro() {
  try {
    const data = await HE.storage.load();
    const st = data.pomodoroState;
    const pomodoro = data.settings.pomodoro;
    if (!pomodoro.enabled || st.phase === 'idle') return;
    if (st.anchorAt && Date.now() - st.anchorAt > POMODORO_CLOSED_THRESHOLD_MS) {
      st.phase = 'idle';
      st.remainingMs = 0;
      st.anchorAt = Date.now();
      await HE.storage.save(data);
      notifyAndBanner(
        'he-pomodoro-cancelled',
        chrome.i18n.getMessage('notifyPomodoroCancelledTitle'),
        chrome.i18n.getMessage('notifyPomodoroCancelledBody')
      );
    }
  } catch (e) {
    /* ignore */
  }
}

// 开始/恢复计时会话：锁屏拒绝、连续使用重置、存储锚点恢复
async function startSession(host) {
  if (state.activeHost === host && state.counting) return;
  if ((await queryIdleState()) === 'locked') {
    state.activeHost = null;
    state.counting = false;
    state.sessionStart = Date.now();
    const data = await HE.storage.load();
    data.tracking = { host: null, since: 0 };
    await HE.storage.save(data);
    return;
  }
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
      let idle = 'active';
      try {
        idle = await queryIdleState();
      } catch (e) {
        /* ignore */
      }
      if (idle !== 'locked') since = tr.since;
    }
    state.sessionStart = since;
  }
  data.tracking = { host, since: state.counting ? since : 0 };
  await HE.storage.save(data);
}

// 结束计时会话：清锚点、记录连续使用中断点
async function stopSession() {
  if (!state.activeHost) {
    state.counting = false;
    await pushCountdown();
    return;
  }
  await commitTime();
  state.activeHost = null;
  state.counting = false;
  const data = await HE.storage.load();
  data.tracking = { host: null, since: 0 };
  data.usage.lastStopAt = Date.now();
  await HE.storage.save(data);
  await pushCountdown();
}

// 将活动标签页同步为当前会话；失焦/不可统计页面时停止
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
    await pushCountdown();
  } catch (e) {
    /* window closed mid-query */
  }
}

// 手动暂停/恢复统计（番茄钟按墙钟不受影响）
async function setPaused(paused) {
  await commitTime();
  state.counting = !paused && !!state.activeHost;
  state.sessionStart = Date.now();
  const data = await HE.storage.load();
  data.settings.paused = !!paused;
  data.tracking = { host: state.activeHost, since: paused ? 0 : state.sessionStart };
  await HE.storage.save(data);
  await updateBadge();
  await pushCountdown();
}

// 闹钟主循环：结算 → 锁屏检查 → 同步活动页 → 阻断 → 角标
async function onTick() {
  await commitTime();
  if ((await queryIdleState()) === 'locked') {
    await stopSession();
  }
  await syncActiveTab();
  await enforceBlocks();
  await updateBadge();
  await pushCountdown();
}

// 消息路由：处理 UI 与内容脚本的全部消息类型（协议见 TECHNICAL.md §5）
async function handleMessage(msg, sender) {
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
      data.settings.pomodoro.enabled = !!msg.enabled;
      data.settings.pomodoro.focusMinutes = Math.max(1, Math.floor(Number(msg.focusMinutes) || 0));
      data.settings.pomodoro.breakMinutes = Math.max(1, Math.floor(Number(msg.breakMinutes) || 0));
      data.settings.pomodoro.rounds = msg.rounds === undefined
        ? (data.settings.pomodoro.rounds || 0)
        : Math.max(0, Math.min(99, Math.floor(Number(msg.rounds) || 0)));
      data.settings.pomodoro.sound = msg.sound === undefined ? data.settings.pomodoro.sound : !!msg.sound;
      if (!data.settings.pomodoro.enabled) {
        data.pomodoroState.phase = 'idle';
        data.pomodoroState.remainingMs = 0;
        data.pomodoroState.anchorAt = 0;
      } else if (data.pomodoroState.phase !== 'idle') {
        // keep a running timer, apply new durations to the current phase
        if (data.pomodoroState.phase === 'focus') {
          data.pomodoroState.remainingMs = data.settings.pomodoro.focusMinutes * 60000;
        } else {
          data.pomodoroState.remainingMs = data.settings.pomodoro.breakMinutes * 60000;
        }
        data.pomodoroState.anchorAt = Date.now();
      }
      // if enabled and phase is idle, stay idle: the user starts focus from the popup
      await HE.storage.save(data);
      await updateBadge();
      await enforceBlocks(data);
      await pushCountdown();
      return {};
    }
    case 'START_POMODORO': {
      const data = await HE.storage.load();
      if (!data.settings.pomodoro.enabled) return { error: 'pomodoroDisabled' };
      data.pomodoroState.phase = 'focus';
      data.pomodoroState.remainingMs = data.settings.pomodoro.focusMinutes * 60000;
      data.pomodoroState.anchorAt = Date.now();
      data.pomodoroState.completedRounds = 0;
      await HE.storage.save(data);
      await updateBadge();
      await enforceBlocks(data);
      await pushCountdown();
      return {};
    }
    case 'STOP_POMODORO': {
      const data = await HE.storage.load();
      data.pomodoroState.phase = 'idle';
      data.pomodoroState.remainingMs = 0;
      data.pomodoroState.completedRounds = 0;
      data.pomodoroState.anchorAt = 0;
      await HE.storage.save(data);
      await updateBadge();
      await enforceBlocks(data);
      await pushCountdown();
      return {};
    }
    case 'SET_THEME': {
      const theme = ['system', 'light', 'dark'].indexOf(msg.theme) !== -1 ? msg.theme : 'system';
      const data = await HE.storage.load();
      data.settings.theme = theme;
      await HE.storage.save(data);
      return {};
    }
    case 'SET_COUNTDOWN': {
      const data = await HE.storage.load();
      data.settings.countdown.enabled = !!msg.enabled;
      data.settings.countdown.thresholdMin = Math.max(1, Math.min(180, Math.floor(Number(msg.thresholdMin) || 15)));
      const positions = ['top-left', 'top-right', 'middle-left', 'middle-right', 'bottom-left', 'bottom-right'];
      data.settings.countdown.position = positions.indexOf(msg.position) !== -1 ? msg.position : 'middle-right';
      const sizes = ['small', 'medium', 'large'];
      data.settings.countdown.size = sizes.indexOf(msg.size) !== -1 ? msg.size : 'medium';
      data.settings.countdown.clock = !!msg.clock;
      await HE.storage.save(data);
      await pushCountdown();
      return {};
    }
    case 'COUNTDOWN_REQUEST': {
      const data = await HE.storage.load();
      const crossed = await advancePomodoro(data);
      if (crossed) await HE.storage.save(data);
      const cd = data.settings.countdown;
      const host = state.activeHost || (await currentHost());
      const chips = cd.enabled ? computeCountdown(data, host, state.counting, data.settings.paused) : null;
      const info = buildWidgetInfo(data, host);
      sendCountdown(state.activeTabId, chips, data.settings.theme, data.settings.paused, cd.position, cd.size, state.counting, cd.clock, info);
      return {};
    }
    case 'GET_POMODORO': {
      const data = await HE.storage.load();
      const crossed = await advancePomodoro(data);
      if (crossed) await HE.storage.save(data);
      return {
        phase: data.pomodoroState.phase,
        remainingMs: data.pomodoroState.remainingMs,
        paused: data.settings.paused,
        counting: state.counting
      };
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

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  serialized(async () => {
    try {
      const result = await handleMessage(msg, sender);
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

chrome.idle.onStateChanged.addListener((newState) => {
  serialized(async () => {
    if (newState === 'locked') {
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
      await countBlock();
    } catch (e) {
      /* tab may already be gone */
    }
  });
});

chrome.notifications.onClicked.addListener((id) => {
  chrome.tabs.create({ url: chrome.runtime.getURL('options/options.html') });
  chrome.notifications.clear(id);
});

// 注册浮动倒计时内容脚本（覆盖已打开标签页，重复注册忽略）
function registerCountdownScript() {
  try {
    chrome.scripting.registerContentScripts([
      {
        id: 'he-countdown',
        matches: ['http://*/*', 'https://*/*'],
        js: ['content/countdown.js'],
        runAt: 'document_idle',
        persistAcrossSessions: true
      }
    ]).catch(() => {});
  } catch (e) {
    /* already registered or scripting unavailable */
  }
}

// SW 启动初始化：闹钟、内容脚本注册、关闭检测、状态同步与推送
function init() {
  createTickAlarm();
  registerCountdownScript();
  serialized(async () => {
    await HE.storage.load();
    await handleClosedPomodoro();
    await syncActiveTab();
    await enforceBlocks();
    await updateBadge();
    await pushCountdown();
  });
}

chrome.runtime.onInstalled.addListener(init);
init();
