# 商店上架文案（Microsoft Edge 加载项商店）

> 以下内容用于在 Edge 加载项商店（Partner Center）填写。按语言分别提交中/英两种 listing。

## 商店名称

> 商店名称取自扩展包的 manifest（`name`），修改后需重新打包上传。
> 中文界面 manifest 名称为「歇会儿 - 健康上网助手」，英文界面为「TakeFive - Website Time Tracker & Blocker」；浏览器内主页面显示短名「歇会儿 / TakeFive」（`extNameShort`）。

- 中文：歇会儿 - 健康上网助手
- English：TakeFive - Website Time Tracker & Blocker

## 短描述（Short description，~90 字符内）

- 中文：统计各网站使用时长，设置每日限额、屏蔽干扰网站，番茄钟专注，锁屏/睡眠自动暂停。
- English：Track site usage, set daily limits, block distractions, and focus with a pomodoro timer.

## 长描述（Long description）

### 中文

歇会儿（TakeFive）帮助你更科学地使用浏览器，及时休息、专注工作。

主要功能：

- **使用时长统计**：自动记录每个网站今日使用时长（如 mail.google.com 与 www.google.com 会合并为 google.com），并按天归档、保留最近 7 天。
- **每日时间限制**：为单个网站设置每日限额与提醒阈值，接近限额时桌面通知提醒，达到限额后自动拦截，包括已打开的页面。
- **网站屏蔽**：将网站加入黑名单即禁止访问，即使暂停统计也无法绕过。
- **番茄钟**：专注 / 休息周期倒计时（默认 25 / 5 分钟），专注阶段自动拦截白名单以外的网站；白名单可一键导入当前已打开的网页。开启后工具栏图标变为番茄 🍅。
- **连续使用提醒**：连续使用浏览器达到设定时长后提醒休息；离开超过 2 分钟自动重置。
- **图标角标**：工具栏图标实时显示时长，可选今日总量 / 当前网站 / 番茄钟剩余。
- **智能暂停**：手动暂停统计；电脑锁屏或睡眠时自动停止计时，不影响准确性。

数据安全：所有数据仅保存在本地浏览器（chrome.storage.local），不会上传到任何服务器。

### English

TakeFive helps you browse smarter, take breaks, and stay focused.

Key features:

- **Usage tracking** — automatically records today's time per site (e.g. mail.google.com and www.google.com merge into google.com), archived daily with the last 7 days.
- **Daily limits** — set a per-site daily limit and a reminder threshold; get notified as you approach it, and have the site automatically blocked once reached, including already-open pages.
- **Site blocking** — blacklist any site to prevent access entirely, even when tracking is paused.
- **Pomodoro** — focus/break cycles (default 25/5 minutes) that automatically block non-whitelisted sites during focus; import currently open tabs into the whitelist with one click. The toolbar icon turns into a tomato 🍅 while running.
- **Continuous-use reminder** — reminds you to take a break after browsing continuously; resets after being away for more than 2 minutes.
- **Icon badge** — the toolbar icon shows live time: today's total, current site, or pomodoro remaining.
- **Smart pause** — pause tracking manually; it also pauses automatically when you lock your PC or it sleeps, keeping stats accurate.

Privacy: all data stays in your browser locally (chrome.storage.local) and is never uploaded anywhere.

## 建议类别 / 标签

- Category：Productivity
- Tags：time tracking、pomodoro、focus、site blocker、website blocker、限制网站、番茄钟、时间管理、屏蔽、专注

## 权限用途说明（供审核/描述使用）

| 权限 | 用途 |
|---|---|
| `tabs` | 读取当前活动标签页 URL，识别正在浏览的网站 |
| `storage` | 在浏览器本地保存统计与设置 |
| `alarms` | 定时提交计时数据，保证统计准确 |
| `notifications` | 限额、连续使用、番茄钟的桌面提醒 |
| `webNavigation` + `<all_urls>` | 拦截/重定向被限制或屏蔽的网站 |
| `windows` | 感知浏览器窗口聚焦，仅在前台计时 |
| `idle` | 检测锁屏/睡眠，自动停止计时 |
| `scripting` | 动态注入浮动倒计时内容脚本到已打开的网页 |

> 不收集、不传输任何个人数据；所有数据仅保存在本地。

## 其他

- 最低版本：Chromium 110+（Manifest V3）
- 图标：128×128（见 `icons/icon128.png`）

## 1.3 版本更新日志

### 中文
- 新增深色模式（跟随系统 / 浅色 / 深色，Edge 风格配色）。
- 新增浮动倒计时：网页侧边实时显示番茄钟与站点剩余时间，含设置页/数据页/阻断页。
- 新增浮动时钟：显示当前时间（HH:MM），可独立开关。
- 番茄钟改为自然时间倒计时，离开或关闭浏览器时自动停止并提醒。
- 番茄钟倒计时精确到秒。
- 修复番茄钟阶段切换与通知、网页浮动倒计时显示等若干问题。

### English
- Added dark mode (follow system / light / dark, Edge-inspired palette).
- Added a floating countdown showing Pomodoro and site-limit remaining time, including on Settings, Dashboard and block pages.
- Added a floating clock (HH:MM) with an independent toggle.
- Pomodoro now counts by wall-clock time and auto-stops when you leave or close the browser.
- Pomodoro countdown is now shown to the second.
- Fixed Pomodoro phase/notification issues and the floating countdown on web pages.
