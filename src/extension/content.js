// Runs on the redirected sites. Most of them, the defaults included, change URL
// with history.pushState, which redirect rules never see, so this asks the
// worker about each new URL and goes to Instead's page if it says so. It also
// asks once at load, which catches pages DNR didn't redirect (restored from
// the back-forward cache, say).
(() => {
  const ext = globalThis.browser ?? globalThis.chrome;
  let checked;

  function check() {
    const url = location.href;
    if (url === checked) return;
    checked = url;
    try {
      ext.runtime.sendMessage({ type: "check", url }).then((page) => {
        if (page && location.href === url) location.replace(page);
      }, () => {});
    } catch {
      // The extension was reloaded or removed; this copy is orphaned.
    }
  }

  check();
  addEventListener("pageshow", (e) => {
    if (e.persisted) { checked = undefined; check(); }
  });
  if (globalThis.navigation) {
    navigation.addEventListener("currententrychange", check);
  } else {
    // No Navigation API: popstate covers back and forward, and a cheap
    // string comparison once a second covers pushState and replaceState.
    addEventListener("popstate", check);
    setInterval(check, 1000);
  }
})();
