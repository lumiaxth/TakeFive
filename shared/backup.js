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
 * backup.js — 备份/恢复工具（options 与 dashboard 共用）。
 * 备份格式 v1：{ kind: 'takefive-backup', version, exportedAt, settings?, data? }；
 * settings 与 data 至少其一存在（options 全量导出两者，dashboard 仅导出 data）。
 * data 含 domains/notifications/usage/pomodoroToday/blocksToday/grace/history/date，
 * 不含运行态（pomodoroState/tracking）。文件名带日期与时刻便于区分。
 */

(function () {
  const HE = (globalThis.HE = globalThis.HE || {});

  const BACKUP_KIND = 'takefive-backup';
  const BACKUP_VERSION = 1;
  // data 分组包含的字段（不含 pomodoroState/tracking 等运行态）
  const DATA_FIELDS = ['date', 'domains', 'notifications', 'usage', 'pomodoroToday', 'blocksToday', 'grace', 'history'];

  function pad(n) {
    return n < 10 ? '0' + n : String(n);
  }

  function stamp() {
    const d = new Date();
    return (
      d.getFullYear() +
      pad(d.getMonth() + 1) +
      pad(d.getDate()) +
      '-' +
      pad(d.getHours()) +
      pad(d.getMinutes())
    );
  }

  function schemaOk(v) {
    return v === undefined || typeof v === 'object';
  }

  // mode: 'full'（设置 + 数据）| 'data'（仅数据）
  function buildExport(data, mode) {
    const payload = {
      kind: BACKUP_KIND,
      version: BACKUP_VERSION,
      exportedAt: new Date().toISOString()
    };
    if (mode !== 'data') {
      payload.settings = data.settings;
    }
    payload.data = {};
    DATA_FIELDS.forEach(function (k) {
      payload.data[k] = data[k];
    });
    return payload;
  }

  function exportFilename(prefix) {
    return 'takefive-' + (prefix || 'backup') + '-' + stamp() + '.json';
  }

  function exportFile(payload, filename) {
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    const href = URL.createObjectURL(blob);
    a.href = href;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () {
      URL.revokeObjectURL(href);
    }, 1000);
  }

  function readBackupFile(file) {
    return new Promise(function (resolve, reject) {
      const reader = new FileReader();
      reader.onload = function () {
        try {
          resolve(JSON.parse(String(reader.result)));
        } catch (e) {
          reject(new Error('parseError'));
        }
      };
      reader.onerror = function () {
        reject(new Error('readError'));
      };
      reader.readAsText(file, 'utf-8');
    });
  }

  // 校验：kind/version；settings 与 data 至少其一存在；data（可选）字段仅允许白名单且形状正确
  function validateBackup(payload) {
    if (!payload || typeof payload !== 'object' || payload.kind !== BACKUP_KIND) return false;
    if (!(payload.version >= 1)) return false;
    const hasSettings = !!payload.settings && typeof payload.settings === 'object';
    const hasData = !!payload.data && typeof payload.data === 'object';
    if (!hasSettings && !hasData) return false;
    if (hasData) {
      for (const k of DATA_FIELDS) {
        if (k === 'date') continue; // date 为字符串，走专用检查
        if (!schemaOk(payload.data[k])) return false;
      }
      if (payload.data.date !== undefined && typeof payload.data.date !== 'string') return false;
      if (payload.data.history !== undefined && !Array.isArray(payload.data.history)) return false;
    }
    return true;
  }

  HE.backup = {
    BACKUP_KIND: BACKUP_KIND,
    BACKUP_VERSION: BACKUP_VERSION,
    buildExport: buildExport,
    exportFilename: exportFilename,
    exportFile: exportFile,
    readBackupFile: readBackupFile,
    validateBackup: validateBackup
  };
})();
