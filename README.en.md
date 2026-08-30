# TakeFive - Website Time Tracker & Blocker

A Manifest V3 browser extension (Chrome / Edge) that tracks daily website usage, sets time limits and reminders, blocks distracting sites, and helps you stay focused with a Pomodoro timer.

## Features

- **Usage Tracking** — Automatically records today's time per registered domain (e.g., `mail.google.com` and `www.google.com` are merged into `google.com`), archived daily with the last 7 days retained.
- **Daily Limits** — Set a daily limit and reminder threshold for any domain. Get notified as you approach the limit, and have the site automatically blocked once reached (including already-open pages, which are redirected to a block page).
- **Site Blocking** — Add any domain to the blacklist to block access entirely, even when tracking is paused. Newly added blacklist entries and limits take effect immediately on already-open tabs.
- **Pause Mechanism** — Manual toggle: when paused, the extension icon shows a red badge with a white dash, and tracking/limits are suspended (except blacklist). Resume anytime.
- **Icon Badge** — The toolbar icon displays real-time duration (format `h:mm`, compact `10h` above 10 hours). In auto mode, it shows the current site's time on regular pages, today's total on blank/system tabs, and Pomodoro remaining during focus. Fixed display modes are also available in settings.
- **Dark Mode** — Choose **Follow system / Light / Dark** in the Appearance settings, with colors inspired by Edge's dark theme.
- **Floating Countdown** — A live countdown on the page edge (including Settings, Dashboard and block pages) showing the Pomodoro (🍅/☕) and site-limit (⏳) remaining time, with an on/off toggle, 6 positions and 3 sizes.
- **Floating Clock** — Shows the current time (HH:MM) reusing the floating widget style; toggle on/off independently.
- **Continuous-Use Reminder** — Get a desktop notification + page banner after continuous browsing reaches a set duration (default 45 minutes). Leaving the browser for more than 2 minutes resets the timer.
- **Pomodoro** — Enable in Settings (default: on). Once enabled, the Pomodoro module appears at the bottom of the popup. Click "Start Focus" to begin the countdown (default 25/5 min focus/break cycles), shown to the second. The Pomodoro runs by **wall-clock time** (it keeps counting while away, unfocused or paused); if a break ends while you are away it stops the round and notifies, and if the browser is closed it auto-stops and notifies on the next open. During focus, non-whitelisted sites are blocked (only the active tab is intercepted). The whitelist supports manual addition or one-click import of currently open tabs.
- **Notifications** — Desktop notifications + page-top banners (via content script, auto-hide).
- **Multi-language** — Automatically switches between Chinese and English based on browser system language.

## Changelog

### 1.3.0
#### New Features
1. **Dark mode** — Follow system / Light / Dark themes; the Appearance module unifies theme and icon badge settings; dark palette inspired by Edge.
2. **Floating countdown** — Live Pomodoro (🍅/☕) and site-limit (⏳) countdown on the page edge, with on/off toggle, 6 positions and 3 sizes; shown on **all pages** (Settings, Dashboard, block pages too).
3. **Floating clock** — Shows the current time (HH:MM) reusing the floating widget style; toggle on/off (default on).
4. **Scen­ario-based block pages** — Four sets of emoji icons and titles for limit / blacklist / Pomodoro / generic.

#### Improvements & Fixes
1. Pomodoro now counts by **wall-clock time** (keeps running while away, unfocused or paused); if a break ends while away it stops the round and notifies "round over"; if the browser was closed it stops and notifies on the next open.
2. Pomodoro countdown shown **to the second** (`mm:ss`) in the popup and settings.
3. Fixed: break occasionally not returning to focus, swapped break/focus notifications, and the countdown incorrectly restarting.
4. Fixed: floating clock/countdown not showing on normal web pages (restored targeted delivery + broadcast).

### 1.2.0
#### New Features
1. **Dashboard** — Standalone page, separate from Settings. Quick jump buttons between both pages (top‑right corner).
2. **7-day usage bar chart** — Light gray grid lines, a dashed average line showing both the daily average and total time. Tap any bar to see that day's total time and the top 5 most-used sites (with "More / Less" toggle). Days with no data display: "No usage recorded on this day".

#### Improvements & Fixes
1. Fixed IP address tracking — now records the full IP for both IPv4 and IPv6 (previously only stored the last two segments for IPv4 and similar for IPv6).
2. Fixed an issue where the block page received incorrect domain parameters (now derived from the actual address to avoid garbled domain names).
3. Popup domain list now shows only the top 10, with a "More" link to the Dashboard. Settings entry moved to the top‑right corner of the popup.
4. Optimized the badge icon display for times over 10 hours.
5. Store listing names updated: `歇会儿 - 健康上网助手` / `TakeFive - Website Time Tracker & Blocker`. The popup header now displays the short name `歇会儿 / TakeFive`.

## Installation

### Option 1 — CRX from GitHub Releases (Chrome)
1. Go to the [GitHub Releases](https://github.com/lumiaxth/TakeFive/releases) page and download the latest `.crx` file.
2. Open Chrome's extensions page: `chrome://extensions`.
3. Enable **Developer mode** (top‑right).
4. **Drag and drop** the downloaded `.crx` file onto the extensions page, then confirm the install prompt.
   > If Chrome blocks it with "Apps, extensions, and user scripts cannot be added from this website", use Option 2 (Load unpacked), or extract the CRX and use **Load unpacked** on the extracted folder.
5. The 🌿 toolbar icon appears when installation completes.

### Option 2 — Developer Mode (Load Unpacked)
1. Open the extensions page: Chrome — `chrome://extensions`, Edge — `edge://extensions`.
2. Enable **Developer mode** (top‑right corner).
3. Click **Load unpacked** and select this repository's root directory (the one containing `manifest.json`).
4. The extension icon should appear in the toolbar, ready to use.

> After each code update, go back to the extensions page and click **Reload** to apply changes.

## How to Use

- **View Stats** — Click the toolbar icon to open the popup, showing today's total time and time per domain. Each domain row supports adding to blacklist or setting a limit (if not yet set). If Pomodoro is enabled, the Pomodoro module appears at the bottom — click "Start Focus" / "End Focus" to control it. The top‑right icons provide access to Settings and Dashboard.
- **Dashboard** — Shows today's total time, domain breakdown, and a 7‑day bar chart. Tap any bar to view that day's total and the top 5 domains. Supports resetting today's data or clearing all data.
- **Settings & Rules** — Right‑click the extension icon → "Options" (or via the Settings page). Manage daily limits, blacklist, badge display modes, continuous-use reminder, and Pomodoro (duration & whitelist; the whitelist supports one‑click import of currently open tabs).
- **When Blocked** — Domains that hit their daily limit are redirected to a block page, where you can click "Pause Tracking & Continue" to bypass. Blacklist and Pomodoro (focus phase) block pages do not provide a bypass option; for Pomodoro whitelist blocks, you need to pause or adjust the whitelist via the popup.

## Project Structure

```
healthy_explorer/
├── manifest.json       # MV3 config (permissions, entries, default language, content scripts)
├── background.js       # Service Worker: timing, limits/reminders/blocking, pause, reminders, Pomodoro, countdown/clock push
├── content/
│   ├── banner.js       # Page-top banner content script (Shadow DOM isolated)
│   └── countdown.js    # Floating countdown/clock content script (Shadow DOM, injected into web pages & extension pages)
├── popup/              # Toolbar popup: today's overview + quick actions + Pomodoro
├── options/            # Settings page: Appearance (theme/badge) / countdown / limits / blacklist / reminders / Pomodoro
├── dashboard/          # Dashboard page: today's overview + 7-day bar chart + details
├── blocked/            # Block page
├── shared/
│ ├── storage.js        # Data read/write, daily reset, limit evaluation
│ ├── hostname.js       # Registered domain parsing (based on tldts)
│ ├── i18n.js           # UI multi-language helper
│ ├── theme.js          # Theme (follow system / light / dark) resolution and application
│ └── tldts.min.js      # Public suffix list parsing library (third-party, UMD single file)
├── _locales/           # Multi-language strings (en / zh_CN)
└── icons/              # Extension icons
```


## Permissions

| Permission | Purpose |
|------------|---------|
| `tabs` | Read active tab URL to identify current domain |
| `storage` | Save statistics and settings (local only) |
| `alarms` | Schedule periodic commits for accurate tracking |
| `notifications` | Desktop notifications for limit approaching/reached |
| `webNavigation` | Listen to navigation events and redirect to block page |
| `windows` | Detect window focus — track only when in foreground |
| `idle` | Detect lock/sleep to auto-pause tracking; detect Pomodoro "away" state |
| `scripting` | Dynamically inject the floating countdown/clock content script into open pages |
| `host_permissions: <all_urls>` | Allow `webNavigation` to observe navigation on any site (for blocking) |

## Tracking Notes

- Tracking occurs **only when** — the browser window is in the foreground, the target tab is active, and tracking is not paused. Does not depend on mouse/keyboard activity.
- Data is persisted every 30 seconds; if the Service Worker is reclaimed by the system and restarted, it resumes from the stored checkpoint to avoid missing time.
- **No tracking during lock/sleep** — idle detection identifies lock states, and commits with spans exceeding 3 minutes are rejected (time during sleep/suspend is not counted). Screen-off while the system remains awake continues tracking.
- Closing the browser for more than 2 minutes counts as away, and no time is recorded.
- The continuous-use reminder advances with foreground tracking; being away for more than 2 minutes resets the continuous-use timer. **The Pomodoro counts by wall-clock time** (it keeps running while away, unfocused or paused).
- All data is stored in `chrome.storage.local` and is cleared when the extension is uninstalled.

## Data Storage Structure

```json
{
  "date": "2026-08-21",
  "domains": { "google.com": { "timeMs": 1234000 } },
  "notifications": { "youtube.com": { "near": true, "reached": true } },
  "tracking": { "host": "google.com", "since": 1787232000000 },
  "usage": { "accumulatedMs": 2400000, "lastStopAt": 1787232000000 },
  "pomodoroState": { "phase": "focus", "remainingMs": 900000, "anchorAt": 1787232000000 },
  "settings": {
    "limits": { "youtube.com": { "dailyMs": 3600000, "remindAtMs": 3000000 } },
    "blacklist": ["bad.com"],
    "paused": false,
    "badgeMode": "auto",
    "theme": "system",
    "countdown": { "enabled": true, "thresholdMin": 15, "position": "middle-right", "size": "medium", "clock": true },
    "usageReminder": { "enabled": true, "minutes": 45 },
    "pomodoro": { "enabled": true, "focusMinutes": 25, "breakMinutes": 5, "whitelist": ["work.com"] }
  },
  "history": [ { "date": "2026-08-20", "domains": { "google.com": { "timeMs": 999000 } } } ]
}
```
