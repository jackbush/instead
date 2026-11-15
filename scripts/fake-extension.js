// A stand-in for the extension API, so the extension's pages run as plain
// web pages: storage.sync lives in this origin's localStorage, every
// permission is granted, and the tab actions do nothing. Used by
// scripts/preview.mjs and scripts/capture-images.mjs.
(() => {
  const KEY = "instead-fake-sync";
  const read = () => {
    try { return JSON.parse(localStorage.getItem(KEY)) ?? {}; } catch { return {}; }
  };
  const listeners = { addListener() {} };
  globalThis.browser = {
    runtime: { id: "fake", getURL: (path) => `/${path}`, sendMessage: async () => {}, onMessage: listeners },
    storage: { sync: {
      get: async (keys) => {
        const saved = read();
        return Object.fromEntries([keys].flat().filter((k) => k in saved).map((k) => [k, saved[k]]));
      },
      set: async (items) => localStorage.setItem(KEY, JSON.stringify({ ...read(), ...items })),
      remove: async (keys) => {
        const saved = read();
        for (const k of [keys].flat()) delete saved[k];
        localStorage.setItem(KEY, JSON.stringify(saved));
      },
    } },
    permissions: { contains: async () => true, request: async () => true, onAdded: listeners, onRemoved: listeners },
    tabs: { getCurrent: async () => ({ id: 0 }), remove: async () => {} },
  };
})();
