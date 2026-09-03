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
 * welcome.js — 首次安装欢迎页逻辑：跳转设置页或直接开始使用。
 */

(function () {
  HE.i18n.apply();
  HE.theme.init();

  document.getElementById('btnOpenSettings').addEventListener('click', () => {
    try {
      chrome.tabs.create({ url: chrome.runtime.getURL('options/options.html') });
    } catch (e) {
      location.href = chrome.runtime.getURL('options/options.html');
      return;
    }
    window.close();
  });

  document.getElementById('btnStart').addEventListener('click', () => {
    // 新标签页打开（首次安装）时直接关闭；从设置页导航进来时返回上一页
    if (history.length > 1) {
      history.back();
    } else {
      window.close();
    }
  });
})();
