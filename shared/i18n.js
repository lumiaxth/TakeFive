(function () {
  const HE = (globalThis.HE = globalThis.HE || {});
  const t = (key, subs) => chrome.i18n.getMessage(key, subs);

  function apply(root) {
    root = root || document;
    root.querySelectorAll('[data-i18n]').forEach((el) => {
      el.textContent = t(el.getAttribute('data-i18n'));
    });
    root.querySelectorAll('[data-i18n-title]').forEach((el) => {
      el.title = t(el.getAttribute('data-i18n-title'));
    });
    root.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
      el.placeholder = t(el.getAttribute('data-i18n-placeholder'));
    });
  }

  HE.i18n = { t, apply };
})();
