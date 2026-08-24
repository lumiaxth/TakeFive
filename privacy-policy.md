# Privacy Policy

**Effective date:** 2026-08-24

TakeFive (歇会儿) ("the Extension") respects your privacy. This policy explains what data the Extension accesses, how it is used, and how it is stored.

## Data collection

The Extension does not collect, transmit, or sell any personal data. All data is stored locally on your device using the browser's `chrome.storage.local` and is never uploaded to any server. The Extension contains no analytics, advertising, or third-party SDKs.

## What data is processed

To provide its core function—tracking how much time you spend on each website—the Extension reads the domain of the currently active tab and records how long that domain was in the foreground. The following data is kept only on your device:

- Daily per-site usage time and the last 7 days of history (`domains` / `history`)
- Your settings: per-site time limits, blacklist, pomodoro whitelist, and reminder preferences (`settings`)
- Continuous-use tracking and pomodoro timer state (`usage` / `pomodoroState`)

This data is used only to display statistics in the popup and options pages and to enforce the limits, blocks, and reminders you configure. The Extension does not read page content, text, images, or other website content.

## Permissions

| Permission | Purpose | Uploaded? |
|---|---|---|
| `tabs` | Read the active tab URL to identify the current website | No |
| `storage` | Store statistics and settings locally | No |
| `alarms` | Periodically persist elapsed time for accuracy | No |
| `notifications` | Show limit/reminder/pomodoro desktop notifications | No |
| `webNavigation` + `<all_urls>` | Detect and redirect navigation to limited or blocked sites | No |
| `windows` | Detect window focus so time is only counted in the foreground | No |
| `idle` | Detect lock/sleep and pause tracking automatically | No |

All permissions are used only within the browser and never send data to any external service.

## Data deletion

- In the options page, "Data" section, you can click "Reset today's data" or "Clear all data" to delete local statistics at any time.
- Uninstalling the Extension deletes all of its local data.

## Changes

If this policy changes materially, we will update this page and note the change in the release notes.

## Contact

For privacy-related questions, please contact the developer.
