# 歇会儿 - TakeFive 技术文档

> 面向后续开发与维护的技术说明。功能与安装说明见 [README.zh.md](./README.zh.md) / [README.en.md](./README.en.md)。

## 1. 项目概览

基于 Manifest V3 的浏览器扩展（Chromium 110+：Chrome / Edge），核心能力：

| 能力 | 说明 |
|---|---|
| 使用时长统计 | 按注册级域名统计每日前台停留时长，按天归档（保留 7 天） |
| 每日限额 / 网站屏蔽 | 单站点每日限额与提醒阈值；黑名单硬屏蔽；触达后重定向到阻断页 |
| 番茄钟 | 自然时间（墙钟）倒计时，专注/休息周期循环；专注期拦截白名单外网站 |
| 浮动倒计时 / 浮动时钟 | 注入到网页与插件内页面的侧边实时浮窗（Shadow DOM） |
| 深色模式 | 跟随系统 / 浅色 / 深色三档主题 |
| 连续使用提醒 | 连续浏览达到阈值提醒；离开浏览器超时自动重置 |

## 2. 总体架构

```
┌────────────────────────┐
│  background.js (SW)    │  唯一的「大脑」：状态机 + 存储 + 消息路由 + 推送
└────────────────────────┘
  │  ↑ runtime.sendMessage / tabs.sendMessage / runtime.broadcast
  │
  ├── popup/popup.js            工具栏弹窗（UI，短生命周期）
  ├── options/options.js        设置页（UI）
  ├── dashboard/dashboard.js    数据页（UI）
  ├── blocked/blocked.js        阻断落地页（UI）
  ├── content/banner.js         网页横幅内容脚本（页面注入）
  └── content/countdown.js      浮动倒计时/时钟内容脚本（页面注入 + 插件页加载）
      offscreen/sound.js        屏幕外音频播放页（offscreen document）
```

- **Service Worker（background.js）** 是唯一的持久状态持有者与写入方。所有 UI 页面通过消息读取状态，不直接改存储。
- **内容脚本**只负责两件事：网页顶部横幅、浮动倒计时/时钟的渲染。它们不写业务数据。
- **页面（popup/options/dashboard/blocked）** 在加载时引入同一套 `shared/*` 脚本，保证工具函数与存储模型一致。

## 3. 目录与模块职责

```
manifest.json           MV3 清单：权限、入口、默认语言
background.js           Service Worker（核心，见 §4）
content/banner.js       横幅内容脚本：HE_BANNER 消息 → 页面顶部横幅（Shadow DOM）
content/countdown.js    浮动倒计时/时钟内容脚本：HE_COUNTDOWN/HIDE 消息 → 浮窗（Shadow DOM）
offscreen/sound.html/js 屏幕外音频页：PLAY_SOUND 消息 → WebAudio 合成提示音
popup/                  弹窗：今日概览、域名列表（前 10）、番茄钟模块、主题/设置/数据入口
options/                设置页：外观（主题+角标）、浮动倒计时、提醒、番茄钟、限额、黑名单
dashboard/              数据页：今日概览、近 7 天柱状图、当日详情（前五/更多）、清空数据
blocked/                阻断落地页：按 reason 展示四套图标/标题/说明
shared/storage.js       存储模型：DEFAULTS、mergeDefaults、rollover、读写、统计工具
shared/hostname.js      域名解析：URL → 注册级域名（tldts）+ IPv4/IPv6 完整保留
shared/i18n.js          UI 多语言：data-i18n / data-i18n-title / data-i18n-placeholder 批量应用
shared/theme.js         主题：解析 system/light/dark → <html data-theme>，监听存储变化实时生效
shared/tldts.min.js     第三方公共后缀列表库（勿改动、勿加版权头）
_locales/               chrome.i18n 文案（zh_CN / en）
icons/                  工具栏/商店图标 + 番茄钟运行态图标（tomato*.png）
```

## 4. background.js 内部结构（按代码顺序）

| 函数/对象 | 职责 |
|---|---|
| 常量 | `RESUME_TOLERANCE_MS`(2min) 会话恢复容差、`USAGE_RESET_AFTER_MS`(2min) 连续使用中断判定、`MAX_COMMIT_DELTA_MS`(3min) 单次提交上限、`POMODORO_CLOSED_THRESHOLD_MS`(2min) 浏览器关闭判定、`PAUSED_BADGE_CHAR` 暂停角标字符、`DEFAULT_ICONS/TOMATO_ICONS` 图标集 |
| `createTickAlarm` | 每 30s（旧版回退 60s）闹钟，驱动提交/推进/推送 |
| `state` | SW 内存态：activeHost、sessionStart、activeTabId/WindowId、counting。SW 可被回收，重启后从存储锚点恢复 |
| `limitReached` / `blockedReasonFor` | 阻断原因判定：`blacklist` > 暂停放行 > `limit` > `pomodoro`（专注期白名单外） |
| `enforceBlocks` | 阻断执行：活动标签页按全原因拦截；后台标签页仅黑名单/限额 |
| `redirectTab` | 重定向到 blocked 页并调用 `countBlock()` 计数 |
| `computeCountdown` | 计算浮窗 chips：番茄钟（墙钟剩余，恒 ticking）+ 站点限额（剩余 ≤ 阈值，ticking=counting&&!paused） |
| `sendCountdown` | 双路投递：`tabs.sendMessage(activeTabId)`（定向网页）+ `runtime.sendMessage`（广播给插件页面）；Promise rejection 静默 |
| `pushCountdown` | 推送总入口：推进番茄钟 → 计算 chips/info → 广播 |
| `buildWidgetInfo` | 组装悬停面板 `info` 对象（今日总量/当前站点/连续使用/轮次/拦截/榜首） |
| `playSound` / `ensureSoundDocument` | offscreen 音频页管理 + PLAY_SOUND 发送 |
| `fmtHm` | 角标时长格式：`h:mm`，≥10h 紧凑 `10h`（角标仅约 4 字符宽） |
| `currentHost` | 活动标签页域名（优先实时查询，回退内存态） |
| `updateBadge` | 角标渲染：暂停=红底白横杠；否则按 badgeMode 显示时长/番茄剩余；番茄运行时切换番茄图标 |
| `commitTime` | 计时结算：把 `now-sessionStart` 记入当前域名；推进连续使用/番茄钟；限额检查；保存 |
| `checkLimits` | 限额通知（接近/达成，每站点每日一次）+ 返回「首次达成」标记 |
| `advancePomodoro` | 番茄钟墙钟推进（见 §6） |
| `handleClosedPomodoro` | 浏览器关闭检测（锚点超过 2 分钟）→ 停止 + 取消通知 |
| `startSession` / `stopSession` | 计时会话生命周期（含锁屏拒绝、连续使用重置、锚点清理） |
| `syncActiveTab` | 同步活动标签页 → 会话；失焦/无域名时停止 |
| `setPaused` | 手动暂停/恢复 |
| `onTick` | 闹钟主循环：提交 → 锁屏检查 → 同步 → 阻断 → 角标 |
| `handleMessage` | 消息路由（见 §7） |
| 事件监听 | tabs（activated/updated/removed）、windows（focusChanged/removed）、idle（locked）、webNavigation（beforeNavigate）、runtime.onInstalled、notifications.onClicked |
| `init` | 安装/启动/每次 SW 唤醒：闹钟、注册内容脚本、关闭检测、同步、推送 |

## 5. 消息协议

### 5.1 UI → Background（`runtime.sendMessage`，`handleMessage` 路由）

| type | 参数 | 说明 |
|---|---|---|
| `GET_DATA` | — | 同步活动页 → 结算 → 返回完整 `data` + activeHost + counting |
| `PAUSE` / `RESUME` | — | 暂停/恢复统计（番茄钟不受影响，见 §8） |
| `SET_LIMIT` / `REMOVE_LIMIT` | host, dailyMs, remindAtMs | 设置/移除限额；变更后立即 enforceBlocks |
| `ADD_BLACKLIST` / `REMOVE_BLACKLIST` | host | 黑名单增删；增后立即 enforceBlocks |
| `SET_USAGE_REMINDER` | enabled, minutes | 连续使用提醒设置 |
| `SET_POMODORO` | enabled, focusMinutes, breakMinutes, rounds, sound | 功能开关/时长/轮次/提示音；运行中调整时长会按新时长重置当前阶段 |
| `START_POMODORO` / `STOP_POMODORO` | — | 开始专注（重置轮次计数）/ 结束（回 idle） |
| `ADD_POMODORO_WHITELIST` / `REMOVE_POMODORO_WHITELIST` | host | 番茄钟白名单增删 |
| `IMPORT_TABS_TO_POMODORO_WHITELIST` | — | 将当前打开网页一键导入白名单，返回 `{added}` |
| `SET_BADGE_MODE` | mode | auto/total/domain/pomodoro |
| `SET_THEME` | theme | system/light/dark |
| `SET_COUNTDOWN` | enabled, thresholdMin, position, size, clock | 浮动倒计时/时钟设置 |
| `COUNTDOWN_REQUEST` | — | 内容脚本可见/注入时主动拉取（经 `sender` 广播回执） |
| `GET_POMODORO` | — | 先推进番茄钟，返回 `{phase, remainingMs, paused, counting}`（弹窗每秒轮询） |
| `CLEAR_TODAY` / `CLEAR_ALL` | — | 数据清理（清空后 updateBadge） |

### 5.2 Background → 各上下文

| 消息 | 目标 | 载荷 |
|---|---|---|
| `HE_COUNTDOWN` | 定向活动标签页（tabs.sendMessage）+ 广播（插件页面） | `{chips[{id,emoji,remainingMs,ticking}], theme, paused, ticking, clock, position, size, info}` |
| `HE_COUNTDOWN_HIDE` | 同上 | 无 chips 且时钟关闭时隐藏全部 |
| `HE_BANNER` | 活动标签页 | `{text}` 页面顶部横幅 |
| `PLAY_SOUND` | offscreen 音频页 | `{pattern: 'focus'\|'break'\|'complete'}` |

> 双路投递的原因：`tabs.sendMessage` 保证网页内容脚本可靠收到；`runtime.sendMessage` 覆盖插件内页面（options/dashboard/blocked）。重复接收同一状态是幂等的。

## 6. 计时与状态机制

### 6.1 前台停留计时（时长统计）
- 计时条件：浏览器窗口前台 + 标签页活动 + 未暂停 + 域名可统计（http/https）。
- 提交模型：`commitTime()` 把 `now - sessionStart` 累加到域名与连续使用计数，随后 `sessionStart = now`。
- **SW 回收恢复**：内存态丢失后，`startSession` 依据存储锚点 `tracking.since` 恢复，容差 `RESUME_TOLERANCE_MS`(2min)。正常运行时闹钟每 30s 刷新锚点，故不会超容差。
- **异常防御**：单次提交 `delta > MAX_COMMIT_DELTA_MS`(3min) 直接丢弃（睡眠/挂起不计入）；`init` 时若锚点超 2 分钟旧则视为浏览器关闭，不恢复。
- **锁屏**：`idle.onStateChanged('locked')` / tick 轮询 `queryState` → `stopSession`。
- **每日归档**：`rolloverIfNeeded` 日期变化时把当日域名压入 `history`（保留 7 天）、重置今日/通知。

### 6.2 番茄钟（墙钟倒计时）
- 模型：`pomodoroState = { phase, remainingMs, anchorAt, completedRounds }`。当前剩余 = `remainingMs - (now - anchorAt)`，**纯自然时间**，与前台/暂停/失焦无关。
- `advancePomodoro(data)`：按 `now - anchorAt` 推进，`while` 循环处理一次跨越多个阶段；每个专注完成时 `completedRounds++` 并累计 `pomodoroToday`；跨阶段依据 `isUserActive()`（系统 idle 60s）分支：
  - 专注→休息：用户在场则通知「专注结束」+ 提示音 `focus`；离开则静默。
  - 休息→专注：用户在场则进入下一轮 + 通知「休息结束」+ 提示音 `break`；**离开则停止本轮**（phase=idle）+ 通知「本轮番茄钟已结束」。
  - 休息→专注且已完成的轮次 ≥ 设定轮次 → 停止 + 通知「全部轮次已完成」+ 提示音 `complete`。
- **浏览器关闭**：SW 不运行，锚点不更新；重开时 `handleClosedPomodoro`（锚点 > 2min）→ 置 idle + 通知「未完成，已关闭」。不追平关闭期间的时间。
- 弹窗每秒 `GET_POMODORO` 拉取墙钟剩余（mm:ss 实时显示）。

### 6.3 浮动倒计时 / 时钟
- 数据：后台在提交/切页/阶段切换/暂停等时机调用 `pushCountdown()`；内容脚本注入与重新可见时发 `COUNTDOWN_REQUEST` 拉取。
- chips：`pomodoro`（ticking 恒 true，墙钟）、`site`（ticking = counting && !paused，按实际使用）。
- 投递：`tabs.sendMessage(activeTabId)` + `runtime.sendMessage` 广播；**渲染由各上下文按 `document.hidden` 自行决定**——仅聚焦窗口的活动上下文显示。
- 插件内页面（options/dashboard/blocked）过滤 site chip，只显示番茄钟/时钟。
- 悬停时钟 chip：三行信息面板（今日总量 / 当前站点 / 动态行——暂停 > 连续使用过半 > 今日轮次 > 拦截次数 > 榜首 > 兜底问候），数据来自 `info`。

### 6.4 阻断
- 原因优先级：`blacklist`（最高，暂停也不放行）→ 限额（暂停放行）→ 番茄钟专注期白名单外（暂停放行）。
- 执行：`webNavigation.onBeforeNavigate`（新导航）+ `enforceBlocks`（扫描已开标签页：活动页全原因、后台页仅黑名单/限额）。
- 触发点：导航、切页、限额首次达成、设置变更、启用番茄钟、每 30s 兜底。
- 计数：每次重定向 `countBlock()` 累计 `blocksToday`。

## 7. 存储模型（chrome.storage.local）

```json
{
  "date": "YYYY-MM-DD",
  "domains": { "<域名>": { "timeMs": 0 } },
  "notifications": { "<域名>": { "near": true, "reached": true } },
  "tracking": { "host": null, "since": 0 },
  "usage": { "accumulatedMs": 0, "lastStopAt": 0 },
  "pomodoroToday": { "date": "YYYY-MM-DD", "rounds": 0, "focusMs": 0 },
  "blocksToday": { "date": "YYYY-MM-DD", "count": 0 },
  "pomodoroState": { "phase": "idle|focus|break", "remainingMs": 0, "anchorAt": 0, "completedRounds": 0 },
  "history": [ { "date": "YYYY-MM-DD", "domains": {} } ],
  "settings": {
    "limits": {}, "blacklist": [], "paused": false, "badgeMode": "auto",
    "theme": "system",
    "countdown": { "enabled": true, "thresholdMin": 15, "position": "middle-right", "size": "medium", "clock": true },
    "usageReminder": { "enabled": false, "minutes": 45 },
    "pomodoro": { "enabled": true, "focusMinutes": 25, "breakMinutes": 5, "rounds": 4, "sound": true, "whitelist": [] }
  }
}
```

- `mergeDefaults` 负责旧数据迁移与字段兜底；`rolloverIfNeeded` 跨天归档并重置今日/通知/番茄轮次计数。
- 设置读取一律走 `load()`（含迁移），写入走 `save()`（整对象）。

## 8. 主题系统

- `shared/theme.js`：`init()` 读取 `settings.theme` → `apply()` 解析 system（matchMedia）/light/dark → `<html data-theme>`；监听 `storage.onChanged` 跨页面实时生效。
- 各页面 CSS 以变量组织颜色，`[data-theme="dark"]` 覆盖变量（Edge 风格配色）；少量硬编码色有针对性覆盖。
- 内容脚本浮窗/横幅在渲染时读取 `settings.theme`（或 system 时 matchMedia）选择深浅样式。

## 9. 提示音（offscreen）

- MV3 的 Service Worker 无法播放音频，采用 offscreen document：
  1. `ensureSoundDocument()`：`runtime.getContexts` 检查 → 不存在则 `offscreen.createDocument({reasons:['AUDIO_PLAYBACK']})`。
  2. `runtime.sendMessage({type:'PLAY_SOUND', pattern})` → `offscreen/sound.js` 用 WebAudio 合成短音（focus=上行双音 / break=下行双音 / complete=三连音）。
- 开关：`settings.pomodoro.sound`（默认开）。

## 10. 开发与测试

- 加载：`chrome://extensions` / `edge://extensions` 开发者模式 → 加载已解压目录。
- 专项测试（Node + mock chrome API，位于 `D:/Data/Temp/opencode/`，未入库）：
  - `test_shared.js` 存储模型/迁移/域名解析
  - `test_background.js` 消息路由/限额/阻断/角标/设置往返
  - `test_timing.js` SW 重启续算/暂停不计时/大增量丢弃
  - `test_i18n_dom.js` jsdom 页面渲染与 i18n
  - `test_pomodoro.js` 番茄钟墙钟/轮次/提示音
  - `test_countdown.js` 浮窗数据推送
  - `test_panel.js` 悬停面板三行规则
  - `test_badge.js` 角标格式
  - `test_options.js` / `test_theme.js` 设置页与主题渲染
- 打包上架：剔除 `.git`、`*.md` 文档、测试文件后压缩（`manifest.json` 必须在 zip 根）。

## 11. 已知约定与注意点

- `shared/tldts.min.js` 为第三方库，**不要**添加版权头或格式化。
- `manifest.json` 不支持注释，版权信息以源文件头为准。
- 角标文本约 4 字符可见宽度，超长会被浏览器裁剪（已做紧凑格式）。
- 阻断计数 `blocksToday` 按「重定向次数」统计，同一站点多标签页会分别计数。
- 悬停面板的数据每 ~30s 与后台同步一次，为近似实时。
