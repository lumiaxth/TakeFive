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
 * support.js — 赞助与商店好评入口（popup / options / welcome 共用）。
 * 赞助链接按界面语言选择（zh → 爱发电，其余 → Ko-fi）；
 * 好评链接按浏览器 UA 选择（Firefox → AMO，其余 → Edge 商店详情页）。
 */

(function () {
  const HE = (globalThis.HE = globalThis.HE || {});

  const SPONSOR_ZH = 'https://ifdian.net/a/lumiaxth';
  const SPONSOR_KOFI = 'https://ko-fi.com/lumiaxth';
  const STORE_EDGE =
    'https://microsoftedge.microsoft.com/addons/detail/ioobdmlggonpicbhbkfaclhmjhicpknb';
  const STORE_FIREFOX = 'https://addons.mozilla.org/firefox/addon/takefive/';

  function uiIsZh() {
    try {
      return (chrome.i18n.getUILanguage() || '').indexOf('zh') === 0;
    } catch (e) {
      return false;
    }
  }

  // 赞助链接：按界面语言选择平台
  function sponsorUrl() {
    return uiIsZh() ? SPONSOR_ZH : SPONSOR_KOFI;
  }

  // 好评链接：按浏览器 UA 选择对应商店；Chrome（尚未上架）等未知环境回退 Edge 商店页
  function storeUrl() {
    const ua = (typeof navigator !== 'undefined' && navigator.userAgent) || '';
    if (ua.indexOf('Firefox') !== -1) return STORE_FIREFOX;
    return STORE_EDGE;
  }

  // 打开外部链接：popup 上下文用 tabs.create（弹窗自动关闭），其余导航当前页
  function open(url) {
    try {
      if (chrome.tabs && chrome.tabs.create) {
        chrome.tabs.create({ url: url });
        return;
      }
    } catch (e) {
      /* fall through to navigation */
    }
    location.href = url;
  }

  HE.support = {
    sponsorUrl: sponsorUrl,
    storeUrl: storeUrl,
    open: open
  };
})();
