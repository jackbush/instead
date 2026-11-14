// Lists, defaults and host access, shared by the worker and the options page.
//
// storage.sync holds:
//   sites          redirected domains, subdomains included ("reddit.com")
//   exceptions     always-allowed URL prefixes without the scheme ("reddit.com/r/name")
//   allowMessages  whether MESSAGE_PAGES are allowed too
//   suggestions    one suggestion per line, Markdown links allowed

export const ext = globalThis.browser ?? globalThis.chrome;

// manifest.json grants host access to each of these up front.
export const DEFAULT_SITES = ["facebook.com", "instagram.com", "reddit.com", "tiktok.com"];

// Direct-message pages on sites people commonly redirect, in the same form as
// exceptions. They only matter for sites on the list.
const MESSAGE_PAGES = [
  "facebook.com/messages",
  "instagram.com/direct",
  "chat.reddit.com",
  "reddit.com/chat",
  "tiktok.com/messages",
  "x.com/messages",
  "linkedin.com/messaging",
  "bsky.app/messages",
];

// The URL prefixes that are never redirected.
export const allowedPages = ({ exceptions, allowMessages }) =>
  allowMessages ? [...new Set([...exceptions, ...MESSAGE_PAGES])] : exceptions;

// The bundled suggestions.txt is the only copy of the default suggestions.
export async function defaultSuggestions() {
  const text = await (await fetch(ext.runtime.getURL("suggestions.txt"))).text();
  return parseLines(text);
}

export const parseLines = (text) => text.split("\n").map((l) => l.trim()).filter(Boolean);

// The saved settings, with the defaults for any that were never saved.
export async function getLists() {
  const saved = await ext.storage.sync.get(["sites", "exceptions", "allowMessages", "suggestions"]);
  return {
    sites: saved.sites ?? DEFAULT_SITES,
    exceptions: saved.exceptions ?? [],
    allowMessages: saved.allowMessages ?? false,
    suggestions: saved.suggestions ?? await defaultSuggestions(),
  };
}

// Saves whichever of { sites, exceptions, allowMessages, suggestions } are
// given. List entries are normalised; invalid ones and duplicates are dropped.
// Resolves to what was saved.
export async function saveLists(lists) {
  const clean = {};
  if (lists.sites) clean.sites = unique(lists.sites.map(normaliseSite));
  if (lists.exceptions) clean.exceptions = unique(lists.exceptions.map(normaliseException));
  if ("allowMessages" in lists) clean.allowMessages = Boolean(lists.allowMessages);
  if (lists.suggestions) clean.suggestions = unique(lists.suggestions.map((a) => a.trim()));
  await ext.storage.sync.set(clean);
  return clean;
}

const unique = (list) => [...new Set(list.filter(Boolean))];

// Splits "https://www.Reddit.com/r/Name/?x#y" into the parts a browser would
// send: lower-case punycode host without "www.", and the encoded path + query.
// Null if it isn't a host name.
function parse(input) {
  const text = input.trim().replace(/^[a-z][a-z0-9+.-]*:\/\//i, "").replace(/^\*\./, "");
  if (!text || /^[/?#]/.test(text)) return null;
  let url;
  try { url = new URL(`https://${text}`); } catch { return null; }
  if (url.username || url.password || !/^[a-z0-9.-]+$/.test(url.hostname)) return null;
  const host = url.hostname.replace(/\.$/, "").replace(/^www\./, "");
  if (!host || host.startsWith(".") || host.includes("..")) return null;
  // Trailing slashes go, so "reddit.com/r/x/" also allows "reddit.com/r/x".
  const rest = url.search ? url.pathname + url.search : url.pathname.replace(/\/+$/, "");
  return { host, rest };
}

// "https://www.reddit.com/r/x" -> "reddit.com". Null if invalid.
export function normaliseSite(input) {
  return parse(input)?.host ?? null;
}

// "https://www.reddit.com/r/Name/" -> "reddit.com/r/Name". Null if invalid.
// The characters * ^ | mean something in a DNR urlFilter, so they aren't allowed.
export function normaliseException(input) {
  const parts = parse(input);
  if (!parts || /[*^|]/.test(parts.rest)) return null;
  return parts.host + parts.rest;
}

// The match pattern covering a site and its subdomains.
export const originFor = (site) => `*://*.${site}/*`;

// The site in `sites` that a URL is on (subdomains included), or null.
export function siteFor(url, sites) {
  const host = hostOf(url);
  return host === null ? null : sites.find((s) => host === s || host.endsWith(`.${s}`)) ?? null;
}

function hostOf(url) {
  try {
    const u = new URL(url);
    return /^https?:$/.test(u.protocol) ? u.hostname.replace(/\.$/, "") : null;
  } catch {
    return null;
  }
}

// Whether a URL starts with one of the exceptions. A prefix ends at a URL
// separator, so "reddit.com/r/name" allows /r/name and /r/name/comments but
// not /r/names. This is what the DNR filter `||<exception>^` matches, and
// exceptionFilter() builds exactly that.
export function isException(url, exceptions) {
  let u;
  try { u = new URL(url); } catch { return false; }
  const host = hostOf(url);
  if (host === null) return false;
  const rest = (u.pathname + u.search).toLowerCase();
  return exceptions.some((e) => {
    const slash = e.search(/[/?]/);
    const eHost = slash < 0 ? e : e.slice(0, slash);
    const eRest = slash < 0 ? "" : e.slice(slash).toLowerCase();
    if (host !== eHost && !host.endsWith(`.${eHost}`)) return false;
    if (!eRest) return true;
    return rest.startsWith(eRest) && !/[\w.%-]/.test(rest[eRest.length] ?? "/");
  });
}

export const exceptionFilter = (exception) => `||${exception}^`;

// The sites the extension may redirect: the user granted it host access.
export async function sitesWithAccess(sites) {
  const granted = await Promise.all(
    sites.map((s) => ext.permissions.contains({ origins: [originFor(s)] })),
  );
  return sites.filter((_, i) => granted[i]);
}

export async function sitesWithoutAccess(sites) {
  const ok = new Set(await sitesWithAccess(sites));
  return sites.filter((s) => !ok.has(s));
}

// Asks for host access to the given sites. Browsers only show the prompt
// during a user gesture, and Firefox ends the gesture at the first await, so
// call this synchronously at the top of a click handler, before awaiting
// anything. Resolves to whether access was granted. The worker rebuilds the
// rules when permissions change.
export function requestAccess(sites) {
  return ext.permissions.request({ origins: sites.map(originFor) });
}
