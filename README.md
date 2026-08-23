# 健康上网助手 (Healthy Explorer)

一款基于 Manifest V3 的浏览器插件（Chrome / Edge），帮助你统计每日各网站的使用时长，为域名设置时间限制、提醒，以及屏蔽干扰网站。

## 功能

- **时长统计**：自动记录每个注册级域名今日累计使用时长（如 `mail.google.com`、`www.google.com` 统一计为 `google.com`），按天归档并保留最近 7 天。
- **时间限制**：为单个域名设置每日限额与提醒阈值。接近限额时推送桌面通知，达到限额后禁止继续访问（包括已打开的页面，会被重定向到阻断页）。
- **访问屏蔽**：将域名加入黑名单后，访问即被重定向到阻断页，且不受"休息"暂停影响；新增黑名单/限额会立即作用于已打开的标签页。
- **暂停机制**：手动开关——暂停计时后，插件图标显示红色底纹 + 白色横杠角标，期间不计时、不限额（黑名单除外），随时可恢复。
- **图标角标**：插件图标实时显示时长（格式 `h:mm`）。自动模式下，普通网页显示当前域名时长，空白/系统标签页显示今日总时长，番茄钟运行时显示剩余时长；也可在设置中选择固定显示类型。
- **连续使用提醒**：连续使用浏览器达到设定时长（默认 45 分钟）时，桌面通知 + 页面横幅提醒；离开浏览器超过 2 分钟视为中断，重新计时。
- **番茄钟**：开启后工具栏图标变为番茄 🍅，按"专注 / 休息"周期倒计时（默认 25 / 5 分钟）。专注阶段将禁止访问白名单以外的网页（仅当前活动标签页被拦截）；白名单支持手动添加或一键导入当前已打开的网页。
- **提醒形式**：桌面通知 + 页面顶部横幅（内容脚本实现，自动隐藏）。
- **多语言**：根据浏览器系统语言自动切换中文 / English。

## 安装（开发模式加载）

1. 打开浏览器扩展管理页：Chrome 访问 `chrome://extensions`，Edge 访问 `edge://extensions`。
2. 打开右上角「开发者模式」。
3. 点击「加载已解压的扩展程序」，选择本仓库目录（含 `manifest.json` 的根目录）。
4. 工具栏出现图标后即可使用。

> 每次代码更新后，回到扩展管理页点击「重新加载」即可生效。

## 使用方法

- **查看统计**：点击工具栏图标，弹窗展示今日总时长与各域名使用时长，每行可加入黑名单、为未设限额的域名设置限额；弹窗内可快捷开关番茄钟并查看倒计时。
- **设置限制与黑名单**：右键图标「选项」（或设置页入口），管理限额规则、黑名单、图标角标显示类型、连续使用提醒、番茄钟（时长与白名单，白名单可一键导入当前打开的网页）。
- **被阻断时**：达到限额的域名会跳转到阻断页，可点击「暂停并继续访问」暂停计时后继续；黑名单与番茄钟（专注阶段）的阻断页不提供放行入口，番茄钟白名单外的阻断需在弹窗暂停或调整白名单。

## 项目结构

```
healthy_explorer/
├── manifest.json          # MV3 配置（权限、入口、默认语言、内容脚本）
├── background.js          # Service Worker：计时、限额/提醒/阻断、暂停、连续使用提醒、番茄钟
├── content/banner.js      # 页面顶部横幅内容脚本（Shadow DOM 隔离）
├── popup/                 # 工具栏弹窗：今日概览 + 快捷操作 + 番茄钟开关
├── options/               # 设置页：限额 / 黑名单 / 数据 / 休息 / 提醒 / 番茄钟
├── blocked/               # 阻断落地页
├── shared/
│   ├── storage.js         # 数据读写、每日重置、限额判断
│   ├── hostname.js        # 注册级域名解析（基于 tldts）
│   ├── i18n.js            # 界面多语言辅助
│   └── tldts.min.js       # 公共后缀列表解析库（第三方，UMD 单文件）
├── _locales/              # 多语言文案（en / zh_CN）
└── icons/                 # 插件图标
```

## 权限说明

| 权限 | 用途 |
|---|---|
| `tabs` | 读取活动标签页 URL，识别当前域名 |
| `storage` | 保存统计数据与设置（仅本地） |
| `alarms` | 定时提交计时数据，保证准确 |
| `notifications` | 限额接近/达成的桌面提醒 |
| `webNavigation` | 监听导航并重定向到阻断页 |
| `windows` | 感知窗口聚焦，仅在前台时计时 |
| `host_permissions: <all_urls>` | 允许 `webNavigation` 观察到任意站点的导航（用于屏蔽） |

## 计时说明

- 仅当 **浏览器窗口在前台 + 目标标签页为活动页 + 未暂停** 时计时，不依赖鼠标键盘操作。
- 数据每 30 秒落盘一次；Service Worker 被系统回收后重启，会从存储锚点续算，避免漏计。
- **电脑锁屏或睡眠时不计时**：通过系统 idle 状态检测锁屏，并拒绝跨度超过 3 分钟的单次提交（睡眠/挂起期间不计入）；仅锁屏/睡眠停止，熄屏但电脑仍唤醒时继续按前台停留计时。
- 浏览器关闭超过 2 分钟视为离开，不计入时长。
- 「连续使用提醒」与「番茄钟」均随前台计时推进；离开浏览器超过 2 分钟会重置连续使用计时。
- 所有数据存储在 `chrome.storage.local`，卸载扩展即清除。

## 数据存储结构

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
    "pomodoro": { "enabled": false, "focusMinutes": 25, "breakMinutes": 5, "whitelist": ["work.com"] }
  },
  "history": [ { "date": "2026-08-20", "domains": { "google.com": { "timeMs": 999000 } } } ]
}
```

## 开发与自测

本项目的共享层与后台逻辑可在 Node.js 下用 mock 的 `chrome` API 进行单元自测：

```bash
# 共享层（域名解析 / 存储 / 每日重置 / 暂停）
node D:/Data/Temp/opencode/test_shared.js

# 后台逻辑（消息流转 / 限额 / 提醒 / 阻断 / 暂停 / 图标角标）
node D:/Data/Temp/opencode/test_background.js

# 计时准确度（暂停不计时 / SW 重启续算 / GET_DATA 补记）
node D:/Data/Temp/opencode/test_timing.js

# 界面多语言渲染（jsdom）
node D:/Data/Temp/opencode/test_i18n_dom.js
```

> 测试脚本位于 `D:/Data/Temp/opencode/`，仅为开发辅助，未纳入本仓库。

## License

MIT
