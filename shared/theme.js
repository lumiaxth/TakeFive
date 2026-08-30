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
