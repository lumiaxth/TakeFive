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
 * theme.js — 主题解析与应用。
 * settings.theme（system/light/dark）→ <html data-theme>；system 跟随
 * prefers-color-scheme，并监听存储变化跨页面实时生效。
 */


(function () {
  const HE = (globalThis.HE = globalThis.HE || {});
  let mql = null;
  let currentTheme = 'system';

  function resolve(theme) {
    if (theme === 'dark') return 'dark';
    if (theme === 'light') return 'light';
    if (mql && mql.matches) return 'dark';
    return 'light';
  }

  function apply(theme) {
    currentTheme = theme || currentTheme;
    if (!document || !document.documentElement) return;
    document.documentElement.dataset.theme = resolve(currentTheme);
    if (currentTheme === 'system' && typeof window !== 'undefined' && window.matchMedia && !mql) {
      try {
        mql = window.matchMedia('(prefers-color-scheme: dark)');
        mql.addEventListener('change', () => apply('system'));
      } catch (e) {
        /* older engines */
      }
    }
  }

  function init() {
    apply('system');
    try {
      chrome.storage.local.get('settings').then((s) => {
        const theme = (s.settings && s.settings.theme) || 'system';
        apply(theme);
      });
    } catch (e) {
      /* ignore */
    }
    try {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local' && changes.settings) {
          const theme = (changes.settings.newValue && changes.settings.newValue.theme) || 'system';
          apply(theme);
        }
      });
    } catch (e) {
      /* ignore */
    }
  }

  HE.theme = { apply, resolve, init };
})();
