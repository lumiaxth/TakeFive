# 歇会儿 - 健康上网助手
## TakeFive - Website Time Tracker & Blocker

A Manifest V3 browser extension (Chrome / Edge) that tracks daily website usage, sets time limits and reminders, blocks distracting sites, and helps you stay focused with a Pomodoro timer.

## Features

- **Usage Tracking** — Automatically records today's time per registered domain (e.g., `mail.google.com` and `www.google.com` are merged into `google.com`), archived daily with the last 7 days retained.
- **Daily Limits** — Set a daily limit and reminder threshold for any domain. Get notified as you approach the limit, and have the site automatically blocked once reached (including already-open pages, which are redirected to a block page).
- **Site Blocking** — Add any domain to the blacklist to block access entirely, even when tracking is paused. Newly added blacklist entries and limits take effect immediately on already-open tabs.
- **Pause Mechanism** — Manual toggle: when paused, the extension icon shows a red badge with a white dash, and tracking/limits are suspended (except blacklist). Resume anytime.
- **Icon Badge** — The toolbar icon displays real-time duration (format `h:mm`). In auto mode, it shows the current site's time on regular pages, today's total on blank/system tabs, and Pomodoro remaining during focus. Fixed display modes are also available in settings.
- **Continuous-Use Reminder** — Get a desktop notification + page banner after continuous browsing reaches a set duration (default 45 minutes). Leaving the browser for more than 2 minutes resets the timer.
- **Pomodoro** — Enable in Settings (default: on). Once enabled, the Pomodoro module appears at the bottom of the popup. Click "Start Focus" to begin the countdown (default 25/5 min focus/break cycles). During focus, non-whitelisted sites are blocked (only the active tab is intercepted). The whitelist supports manual addition or one-click import of currently open tabs.
- **Notifications** — Desktop notifications + page-top banners (via content script, auto-hide).
- **Multi-language** — Automatically switches between Chinese and English based on browser system language.

## What's New in 1.2.0

### New Features
1. **Dashboard** — Standalone page, separate from Settings. Quick jump buttons between both pages (top‑right corner).
2. **7-day usage bar chart** — Light gray grid lines, a dashed average line showing both the daily average and total time. Tap any bar to see that day's total time and the top 5 most-used sites (with "More / Less" toggle). Days with no data display: "No usage recorded on this day".

### Improvements & Fixes
1. Fixed IP address tracking — now records the full IP for both IPv4 and IPv6 (previously only stored the last two segments for IPv4 and similar for IPv6).
2. Fixed an issue where the block page received incorrect domain parameters (now derived from the actual address to avoid garbled domain names).
3. Popup domain list now shows only the top 10, with a "More" link to the Dashboard. Settings entry moved to the top‑right corner of the popup.
4. Optimized the badge icon display for times over 10 hours.
5. Store listing names updated: `歇会儿 - 健康上网助手` / `TakeFive - Website Time Tracker & Blocker`. The popup header now displays the short name `歇会儿 / TakeFive`.

## Installation (Developer Mode)

1. Open the browser's extension management page: Chrome — `chrome://extensions`, Edge — `edge://extensions`.
2. Enable **Developer mode** (top‑right corner).
3. Click **Load unpacked** and select this repository's root directory (the one containing `manifest.json`).
4. The extension icon should appear in the toolbar, ready to use.

> After each code update, go back to the extension management page and click **Reload** to apply changes.

## How to Use

- **View Stats** — Click the toolbar icon to open the popup, showing today's total time and time per domain. Each domain row supports adding to blacklist or setting a limit (if not yet set). If Pomodoro is enabled, the Pomodoro module appears at the bottom — click "Start Focus" / "End Focus" to control it. The top‑right icons provide access to Settings and Dashboard.
- **Dashboard** — Shows today's total time, domain breakdown, and a 7‑day bar chart. Tap any bar to view that day's total and the top 5 domains. Supports resetting today's data or clearing all data.
- **Settings & Rules** — Right‑click the extension icon → "Options" (or via the Settings page). Manage daily limits, blacklist, badge display modes, continuous-use reminder, and Pomodoro (duration & whitelist; the whitelist supports one‑click import of currently open tabs).
- **When Blocked** — Domains that hit their daily limit are redirected to a block page, where you can click "Pause Tracking & Continue" to bypass. Blacklist and Pomodoro (focus phase) block pages do not provide a bypass option; for Pomodoro whitelist blocks, you need to pause or adjust the whitelist via the popup.

## Project Structure

```
healthy_explorer/
├── manifest.json       # MV3 config (permissions, entries, default language, content scripts)
├── background.js       # Service Worker: timing, limits/reminders/blocking, pause, continuous-use reminder, Pomodoro
├── content/banner.js   # Page-top banner content script (Shadow DOM isolated)
├── popup/              # Toolbar popup: today's overview + quick actions + Pomodoro
├── options/            # Settings page: limits / blacklist / badge / reminder / Pomodoro
├── dashboard/          # Dashboard page: today's overview + 7-day bar chart + details
├── blocked/            # Block page
├── shared/
│ ├── storage.js        # Data read/write, daily reset, limit evaluation
│ ├── hostname.js       # Registered domain parsing (based on tldts)
│ ├── i18n.js           # UI multi-language helper
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
| `idle` | Detect lock/sleep to auto-pause tracking |
| `host_permissions: <all_urls>` | Allow `webNavigation` to observe navigation on any site (for blocking) |

## Tracking Notes

- Tracking occurs **only when** — the browser window is in the foreground, the target tab is active, and tracking is not paused. Does not depend on mouse/keyboard activity.
- Data is persisted every 30 seconds; if the Service Worker is reclaimed by the system and restarted, it resumes from the stored checkpoint to avoid missing time.
- **No tracking during lock/sleep** — idle detection identifies lock states, and commits with spans exceeding 3 minutes are rejected (time during sleep/suspend is not counted). Screen-off while the system remains awake continues tracking.
- Closing the browser for more than 2 minutes counts as away, and no time is recorded.
- The continuous-use reminder and Pomodoro both advance with foreground tracking; being away for more than 2 minutes resets the continuous-use timer.
- All data is stored in `chrome.storage.local` and is cleared when the extension is uninstalled.

## Data Storage Structure

```json
{
  "date": "2026-08-21",
  "domains": { "google.com": { "timeMs": 1234000 } },
  "notifications": { "youtube.com": { "near": true, "reached": true } },
  "tracking": { "host": "google.com", "since": 1787232000000 },
  "usage": { "accumulatedMs": 2400000, "lastStopAt": 1787232000000 },
  "pomodoroState": { "phase": "focus", "remainingMs": 900000 },
  "settings": {
    "limits": { "youtube.com": { "dailyMs": 3600000, "remindAtMs": 3000000 } },
    "blacklist": ["bad.com"],
    "paused": false,
    "badgeMode": "auto",
    "usageReminder": { "enabled": true, "minutes": 45 },
    "pomodoro": { "enabled": true, "focusMinutes": 25, "breakMinutes": 5, "whitelist": ["work.com"] }
  },
  "history": [ { "date": "2026-08-20", "domains": { "google.com": { "timeMs": 999000 } } } ]
}
```