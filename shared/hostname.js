(function () {
  const HE = (globalThis.HE = globalThis.HE || {});
  const tldts = globalThis.tldts;

  function getHostname(url) {
    try {
      const u = new URL(url);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
      return u.hostname.toLowerCase();
    } catch (e) {
      return null;
    }
  }

  function getRegistrableDomain(url) {
    const host = getHostname(url);
    if (!host) return null;
    if (tldts) {
      const d = tldts.getDomain(host);
      if (d) return d;
    }
    let h = host;
    if (h.startsWith('www.')) h = h.slice(4);
    const parts = h.split('.');
    if (parts.length >= 2) {
      return parts.slice(-2).join('.');
    }
    return h;
  }

  function normalizeDomain(input) {
    if (!input) return null;
    let s = String(input).trim().toLowerCase();
    if (!s) return null;
    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) s = 'http://' + s;
    try {
      const u = new URL(s);
      return getRegistrableDomain(u.href) || u.hostname;
    } catch (e) {
      let h = s.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '');
      h = h.split('/')[0].split('?')[0].split('#')[0].split(':')[0];
      const parts = h.split('.');
      if (parts.length >= 2 && /[a-z0-9]/.test(parts[parts.length - 1])) {
        return getRegistrableDomain('http://' + h) || h;
      }
      return null;
    }
  }

  HE.hostname = { getHostname, getRegistrableDomain, normalizeDomain };
})();
