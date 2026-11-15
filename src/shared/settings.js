// Lists, defaults and host access, shared by the worker and the options page.
//
// storage.sync holds:
//   sites          redirected domains, subdomains included ("reddit.com")
//   exceptions     always-allowed URL prefixes without the scheme ("reddit.com/r/name")
//   allowMessages  whether MESSAGE_PAGES are allowed too
//   suggestions    one suggestion per line, Markdown links allowed

import { parseLines } from "./shared.js";

export const ext = globalThis.browser ?? globalThis.chrome;

// One-click groups of sites for the settings page. The default ones are on
// the list from install, and manifest.json grants host access to their sites
// up front; the others ask for access when they're ticked.
export const PRESETS = [
  { name: "Facebook", sites: ["facebook.com"], default: true },
  { name: "Instagram", sites: ["instagram.com"], default: true },
  { name: "Reddit", sites: ["reddit.com"], default: true },
  { name: "TikTok", sites: ["tiktok.com"], default: true },
  { name: "YouTube", sites: ["youtube.com"], default: true },
  { name: "Twitter/X", sites: ["x.com", "twitter.com"], default: true },
  { name: "LinkedIn", sites: ["linkedin.com"], default: true },
  {
    name: "News sites",
    sites: [
      "bbc.co.uk", "bbc.com", "cnn.com", "foxnews.com", "nytimes.com", "washingtonpost.com",
      "theguardian.com", "dailymail.co.uk", "reuters.com", "apnews.com", "news.google.com", "news.yahoo.com",
    ],
  },
];

export const DEFAULT_SITES = PRESETS.filter((p) => p.default).flatMap((p) => p.sites);

// Direct-message pages on sites people commonly redirect, in the same form as
// exceptions. They only matter for sites on the list. X's encrypted Chat lives
// under /i/chat; its address on the web is only documented for group invite links.
const MESSAGE_PAGES = [
  "facebook.com/messages",
  "instagram.com/direct",
  "chat.reddit.com",
  "reddit.com/chat",
  "tiktok.com/messages",
  "x.com/messages",
  "x.com/i/chat",
  "twitter.com/messages",
  "twitter.com/i/chat",
  "reddit.com/message",
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
// Null unless the host has a dot and isn't a number: "123" and "0x7f.1" are
// IP addresses to a browser, so only a dotted quad typed in full is accepted.
function parse(input) {
  const text = input.trim().replace(/^[a-z][a-z0-9+.-]*:\/\//i, "").replace(/^\*\./, "");
  if (!text || /^[/?#]/.test(text)) return null;
  let url;
  try { url = new URL(`https://${text}`); } catch { return null; }
  if (url.username || url.password || !/^[a-z0-9.-]+$/.test(url.hostname)) return null;
  // One trailing dot goes; "www." goes repeatedly while a dot remains, so "www.com" stays.
  const host = url.hostname.replace(/\.$/, "").replace(/^(?:www\.)+(?=[^.]+\.)/, "");
  const labels = host.split(".");
  const quad = /^\d+\.\d+\.\d+\.\d+$/.test(host) && text.toLowerCase().startsWith(host);
  if (labels.length < 2 || labels.includes("") || (/^\d+$/.test(labels.at(-1)) && !quad)) return null;
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
// (Some URL parsers percent-encode ^ and | in a path and some don't, so either
// way none reaches the filter raw.)
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

// The host of a web URL. A trailing dot is kept: "reddit.com." is not
// "reddit.com" to a DNR filter ("." isn't a separator), so it matches nothing.
function hostOf(url) {
  try {
    const u = new URL(url);
    return /^https?:$/.test(u.protocol) ? u.hostname : null;
  } catch {
    return null;
  }
}

// Whether a URL starts with one of the exceptions. A prefix ends at a URL
// separator, so "reddit.com/r/name" allows /r/name and /r/name/comments but
// not /r/names. This is what the DNR filter `||<exception>^` matches, and
// exceptionFilter() builds exactly that: a path follows the host directly, so
// a URL with an explicit port never matches a path exception.
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
    return !u.port && rest.startsWith(eRest) && !/[\w.%-]/.test(rest[eRest.length] ?? "/");
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

// Asks for host access to the given sites. Browsers only show the prompt
// during a user gesture, and Firefox ends the gesture at the first await, so
// call this synchronously at the top of a click handler, before awaiting
// anything. Resolves to whether access was granted. The worker rebuilds the
// rules when permissions change.
export function requestAccess(sites) {
  return ext.permissions.request({ origins: sites.map(originFor) });
}
