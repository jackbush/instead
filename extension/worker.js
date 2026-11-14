// Background: keeps the redirect rules and the URL watcher in step with the
// lists, and lets a tab through when the page's "Take me to" is clicked.
// Chrome runs this as a service worker and Firefox as an event page; both
// can stop it at any time, so all state lives in storage and DNR rules.

import {
  ext, DEFAULT_SITES, defaultSuggestions, getLists, allowedPages,
  originFor, siteFor, isException, exceptionFilter, sitesWithAccess,
} from "./settings.js";

const PAGE = ext.runtime.getURL("index.html");
const BYPASS_MS = 15 * 60 * 1000;
const WATCHER = "watch-url";

// Rule priorities: a let-through tab beats an exception beats the redirect.
const REDIRECT = 1;
const EXCEPTION = 2;
const BYPASS = 3;

// The page's address for an original URL. The original goes in unencoded
// because a DNR substitution can't encode it; app.js reads everything after
// "?from=" (and the fragment, which the browser carries over on a redirect).
const pageFor = (url) => `${PAGE}?from=${url}`;

// Rebuilds and expiries read-modify-write storage and rules, so run them one
// at a time.
let last = Promise.resolve();
function serial(task) {
  const run = last.then(task);
  last = run.catch((e) => console.error(e));
  return run;
}

// Redirect rule, exception rules and the URL watcher, for the sites the
// extension has host access to.
async function rebuild() {
  const lists = await getLists();
  const allowed = await sitesWithAccess(lists.sites);

  const rules = allowedPages(lists).map((e, i) => ({
    id: i + 2,
    priority: EXCEPTION,
    action: { type: "allow" },
    condition: { urlFilter: exceptionFilter(e), resourceTypes: ["main_frame"] },
  }));
  if (allowed.length) {
    rules.push({
      id: 1,
      priority: REDIRECT,
      action: { type: "redirect", redirect: { regexSubstitution: pageFor("\\0") } },
      condition: { regexFilter: "^.+$", requestDomains: allowed, resourceTypes: ["main_frame"] },
    });
  }
  const old = await ext.declarativeNetRequest.getDynamicRules();
  await ext.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: old.map((r) => r.id),
    addRules: rules,
  });

  // Single-page apps change URL without a request DNR could see.
  const registered = await ext.scripting.getRegisteredContentScripts({ ids: [WATCHER] });
  if (registered.length) await ext.scripting.unregisterContentScripts({ ids: [WATCHER] });
  if (allowed.length) {
    await ext.scripting.registerContentScripts([{
      id: WATCHER,
      js: ["content.js"],
      matches: allowed.map(originFor),
      runAt: "document_start",
      allFrames: false,
    }]);
  }
}

// Let-through tabs: storage.session `bypasses` maps each session rule id to
// { tabId, site, expires }.
async function getBypasses() {
  return (await ext.storage.session.get("bypasses")).bypasses ?? {};
}

async function bypass(tabId, url) {
  const { sites } = await getLists();
  const site = siteFor(url, sites);
  if (!site) return;
  const bypasses = await getBypasses();
  const ids = Object.keys(bypasses).map(Number);
  const id = ids.find((i) => bypasses[i].tabId === tabId && bypasses[i].site === site)
    ?? Math.max(0, ...ids) + 1;
  await ext.declarativeNetRequest.updateSessionRules({
    removeRuleIds: [id],
    addRules: [{
      id,
      priority: BYPASS,
      action: { type: "allow" },
      condition: { tabIds: [tabId], requestDomains: [site], resourceTypes: ["main_frame"] },
    }],
  });
  bypasses[id] = { tabId, site, expires: Date.now() + BYPASS_MS };
  await ext.storage.session.set({ bypasses });
  await armAlarm(bypasses);
  await ext.tabs.update(tabId, { url });
}

// Drops let-throughs that have expired or whose tab closed, along with any
// session rule that has no live let-through, then sets the alarm for the next.
async function expire(closedTabId) {
  const bypasses = await getBypasses();
  const now = Date.now();
  for (const [id, b] of Object.entries(bypasses)) {
    if (b.expires <= now || b.tabId === closedTabId) delete bypasses[id];
  }
  const rules = await ext.declarativeNetRequest.getSessionRules();
  await ext.declarativeNetRequest.updateSessionRules({
    removeRuleIds: rules.map((r) => r.id).filter((id) => !(id in bypasses)),
  });
  await ext.storage.session.set({ bypasses });
  await armAlarm(bypasses);
}

async function armAlarm(bypasses) {
  const times = Object.values(bypasses).map((b) => b.expires);
  if (times.length) await ext.alarms.create("expire", { when: Math.min(...times) });
  else await ext.alarms.clear("expire");
}

// The page to send a tab to, or null to leave it: for the URL watcher.
async function redirectFor(tabId, url) {
  const lists = await getLists();
  const site = siteFor(url, lists.sites);
  if (!site || isException(url, allowedPages(lists))) return null;
  if (!(await sitesWithAccess([site])).length) return null;
  const bypasses = Object.values(await getBypasses());
  const now = Date.now();
  if (bypasses.some((b) => b.tabId === tabId && b.site === site && b.expires > now)) return null;
  return pageFor(url);
}

const isHttp = (url) => typeof url === "string" && /^https?:\/\//i.test(url) && URL.canParse(url);

ext.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const tabId = sender.tab?.id;
  if (sender.id !== ext.runtime.id || tabId === undefined || !isHttp(message?.url)) return;
  if (message.type === "bypass" && sender.url?.startsWith(PAGE)) {
    serial(() => bypass(tabId, message.url));
  } else if (message.type === "check") {
    redirectFor(tabId, message.url).then(sendResponse, () => sendResponse(null));
    return true; // responds asynchronously
  }
});

ext.runtime.onInstalled.addListener(() => serial(async () => {
  const saved = await ext.storage.sync.get(["sites", "suggestions", "activities"]);
  const missing = {};
  if (!saved.sites) missing.sites = DEFAULT_SITES;
  // Older installs keep suggestions under "activities"; move them.
  if (!saved.suggestions) missing.suggestions = saved.activities ?? await defaultSuggestions();
  await ext.storage.sync.set(missing);
  if (saved.activities) await ext.storage.sync.remove("activities");
  await rebuild();
  await expire();
}));

ext.runtime.onStartup.addListener(() => serial(async () => {
  await rebuild();
  await expire();
}));

ext.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && (changes.sites || changes.exceptions || changes.allowMessages)) serial(rebuild);
});
ext.permissions.onAdded.addListener(() => serial(rebuild));
ext.permissions.onRemoved.addListener(() => serial(rebuild));

ext.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "expire") serial(() => expire());
});
ext.tabs.onRemoved.addListener((tabId) => serial(() => expire(tabId)));

ext.action.onClicked.addListener(() => ext.runtime.openOptionsPage());
