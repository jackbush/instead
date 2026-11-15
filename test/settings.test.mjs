// Tests for the pure list and URL logic in src/shared/settings.js. Run with `node --test`.
// Node has no `chrome`/`browser` global, so `ext` is undefined; only the pure exports are used here,
// plus saveLists/getLists against a stub storage (loaded as a separate module instance).
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  PRESETS, DEFAULT_SITES, presetSites, redirectedSites, allowedPages, normaliseSite, normaliseException,
  originFor, siteFor, isException, exceptionFilter,
} from "../src/shared/settings.js";

// Chrome's documented urlFilter semantics, for the `||` and `^` tokens only:
// https://developer.chrome.com/docs/extensions/reference/api/declarativeNetRequest#type-RuleCondition
//   ||  domain anchor: the pattern must start at the beginning of the hostname or of any subdomain label.
//   ^   separator: any character except a letter, digit, or one of _ - . %, or the end of the URL.
// Matching is case-insensitive (isUrlFilterCaseSensitive defaults to false). The text matched is the URL
// without scheme, user-info and fragment, i.e. host[:port] + path + query.
function referenceMatch(filter, url) {
  const m = /^\|\|(.*)\^$/.exec(filter);
  assert.ok(m, `not a ||...^ filter: ${filter}`);
  const body = m[1].toLowerCase();
  let u;
  try { u = new URL(url); } catch { return false; }
  if (!/^https?:$/.test(u.protocol)) return false;
  const text = (u.host + u.pathname + u.search).toLowerCase();
  for (let i = 0; i < u.host.length; i++) {
    if (i > 0 && text[i - 1] !== ".") continue;
    if (!text.startsWith(body, i)) continue;
    const next = text[i + body.length];
    if (next === undefined || !/[A-Za-z0-9_.%-]/.test(next)) return true;
  }
  return false;
}

describe("normaliseSite", () => {
  const cases = [
    // [input, expected]
    ["reddit.com", "reddit.com"],
    ["https://reddit.com", "reddit.com"],
    ["HTTP://Reddit.COM/", "reddit.com"],
    ["ftp://reddit.com", "reddit.com"],
    ["www.reddit.com", "reddit.com"],
    ["https://www.reddit.com/r/x?y#z", "reddit.com"],
    ["  reddit.com  ", "reddit.com"],
    ["*.reddit.com", "reddit.com"],
    ["old.reddit.com", "old.reddit.com"],
    ["www.www.reddit.com", "reddit.com"], // every leading www. goes
    ["reddit.com.", "reddit.com"],
    ["reddit.com/", "reddit.com"],
    ["reddit.com:8080", "reddit.com"],
    ["reddit.com:8080/path", "reddit.com"],
    ["bücher.de", "xn--bcher-kva.de"],
    ["BÜCHER.DE/Ü", "xn--bcher-kva.de"],
    ["xn--bcher-kva.de", "xn--bcher-kva.de"],
    ["re%64dit.com", "reddit.com"], // percent-escapes in the host are decoded
  ];
  for (const [input, want] of cases) {
    test(JSON.stringify(input), () => assert.equal(normaliseSite(input), want));
  }

  for (const input of ["", "   ", "/r/x", "?a=1", "#a", "https://", "user@reddit.com", "http://u:p@reddit.com",
    "reddit.com@evil.com", "*reddit.com", "red*dit.com", "a b.com", "[::1]", ".reddit.com", "a..b.com", "a|b.com", "a^b.com"]) {
    test(`rejects ${JSON.stringify(input)}`, () => assert.equal(normaliseSite(input), null));
  }

  test("is idempotent", () => {
    for (const [input] of cases) {
      const once = normaliseSite(input);
      assert.equal(normaliseSite(once), once);
    }
  });
  test("is idempotent for www.www.", () => {
    const once = normaliseSite("www.www.reddit.com");
    assert.equal(normaliseSite(once), once);
  });

  // A browser reads these as IPv4 addresses (or they have no dot), so they are never what was meant.
  test("IP-like and dotless input is rejected", () => {
    for (const input of ["123", "1.2.3", "0x7f.1", "2130706433", "0x7f.0.0.1", "01.2.3.4", "1.2.3.4.5", "256.1.1.1", "reddit", "localhost", "com", "www.1.2.3.4", "reddit.123"]) {
      assert.equal(normaliseSite(input), null, input);
    }
  });
  test("a dotted quad typed in full is accepted", () => {
    assert.equal(normaliseSite("1.2.3.4"), "1.2.3.4");
    assert.equal(normaliseSite("http://192.168.0.1:8080/x"), "192.168.0.1");
    assert.equal(normaliseSite("0.0.0.0"), "0.0.0.0");
  });
  test("www.com stays: the last www. is only stripped when a dot remains", () => {
    assert.equal(normaliseSite("www.com"), "www.com");
    assert.equal(normaliseSite("www.www.com"), "www.com");
  });

  test("only ONE trailing dot is stripped", () => {
    assert.equal(normaliseSite("reddit.com.."), null);
  });
  test("\"www.\" alone is not a site", () => {
    assert.equal(normaliseSite("www."), null);
  });
});

describe("normaliseException", () => {
  const cases = [
    ["reddit.com", "reddit.com"],
    ["https://www.reddit.com/r/Name/", "reddit.com/r/Name"], // path case kept
    ["https://www.Reddit.com/r/Name", "reddit.com/r/Name"], // host case lowered
    ["reddit.com/r/name//", "reddit.com/r/name"],
    ["reddit.com/", "reddit.com"],
    ["reddit.com/r/x?", "reddit.com/r/x"],
    ["reddit.com/r/x#frag", "reddit.com/r/x"],
    ["reddit.com/r/x?a=1#frag", "reddit.com/r/x?a=1"],
    ["reddit.com?a=1", "reddit.com/?a=1"],
    ["reddit.com/?a=1", "reddit.com/?a=1"],
    ["reddit.com/r/x/?a=1", "reddit.com/r/x/?a=1"], // slash kept before a query
    ["reddit.com:8080/r/x", "reddit.com/r/x"], // port dropped
    ["reddit.com./r/x", "reddit.com/r/x"],
    ["bücher.de/Ü?q=ü", "xn--bcher-kva.de/%C3%9C?q=%C3%BC"],
    ["reddit.com/a/../b", "reddit.com/b"], // dot segments resolved by URL
    ["reddit.com/a b", "reddit.com/a%20b"],
  ];
  for (const [input, want] of cases) {
    test(JSON.stringify(input), () => assert.equal(normaliseException(input), want));
  }

  for (const input of ["", "/r/x", "user@reddit.com/r/x", "http://u:p@reddit.com/r/x", "reddit.com/*", "reddit.com/a|b", "reddit.com/?q=*", "reddit.com/?q=a|b", "*", "a b"]) {
    test(`rejects ${JSON.stringify(input)}`, () => assert.equal(normaliseException(input), null));
  }

  test("* ^ | in the host are rejected too", () => {
    for (const c of ["*", "^", "|"]) assert.equal(normaliseException(`re${c}ddit.com/x`), null);
  });
  test("* ^ | in a fragment are ignored, not rejected", () => {
    assert.equal(normaliseException("reddit.com/r/x#a*b"), "reddit.com/r/x");
  });
  // Node 24 and some browsers percent-encode ^ in a path; Node 22 and others
  // keep it, and then it's rejected. Either way it never reaches the filter raw.
  test("a literal ^ in the path is encoded or rejected, never kept", () => {
    assert.ok([null, "reddit.com/r/x%5E"].includes(normaliseException("reddit.com/r/x^")));
  });
  test("percent-encoded ^ | stay encoded and are accepted", () => {
    assert.equal(normaliseException("reddit.com/a%5Eb"), "reddit.com/a%5Eb");
  });
  test("IP-like input", () => {
    assert.equal(normaliseException("123/x"), null);
    assert.equal(normaliseException("localhost/x"), null);
    assert.equal(normaliseException("1.2.3.4/x"), "1.2.3.4/x");
  });
  test("is idempotent", () => {
    for (const [input] of cases) {
      const once = normaliseException(input);
      assert.equal(normaliseException(once), once);
    }
  });
  test("trailing-dot host with .. ", () => {
    assert.equal(normaliseException("reddit.com../x"), null);
  });
});

describe("originFor / exceptionFilter", () => {
  test("originFor", () => assert.equal(originFor("reddit.com"), "*://*.reddit.com/*"));
  test("exceptionFilter", () => assert.equal(exceptionFilter("reddit.com/r/x"), "||reddit.com/r/x^"));
});

describe("siteFor", () => {
  const sites = ["reddit.com", "x.com", "news.google.com", "xn--bcher-kva.de"];
  const cases = [
    ["https://reddit.com/", "reddit.com"],
    ["https://www.reddit.com/r/x", "reddit.com"],
    ["https://old.reddit.com", "reddit.com"],
    ["http://a.b.reddit.com:8080/x?y#z", "reddit.com"],
    ["https://REDDIT.COM/", "reddit.com"],
    ["https://reddit.com./", null], // DNR's ||reddit.com^ doesn't match a trailing-dot host
    ["https://user:pw@reddit.com/", "reddit.com"],
    ["https://news.google.com/", "news.google.com"],
    ["https://bücher.de/", "xn--bcher-kva.de"],
    ["https://shop.bücher.de/", "xn--bcher-kva.de"],
    ["https://notreddit.com/", null],
    ["https://reddit.com.evil.com/", null],
    ["https://evil.com/reddit.com", null],
    ["https://evil.com/?u=reddit.com", null],
    ["https://google.com/", null],
    ["https://max.com/", null], // "x.com" must not match "max.com"
    ["ftp://reddit.com/", null],
    ["chrome://reddit.com/", null],
    ["about:blank", null],
    ["not a url", null],
    ["", null],
  ];
  for (const [url, want] of cases) {
    test(`${JSON.stringify(url)} -> ${want}`, () => assert.equal(siteFor(url, sites), want));
  }
  test("empty list", () => assert.equal(siteFor("https://reddit.com", []), null));
  test("returns the first match", () => assert.equal(siteFor("https://old.reddit.com", ["old.reddit.com", "reddit.com"]), "old.reddit.com"));
});

describe("isException", () => {
  const yes = (url, ex) => assert.equal(isException(url, [ex]), true, `${url} should match ${ex}`);
  const no = (url, ex) => assert.equal(isException(url, [ex]), false, `${url} should not match ${ex}`);

  test("host-only exception covers the host and subdomains", () => {
    yes("https://reddit.com", "reddit.com");
    yes("https://reddit.com/anything?x=1#y", "reddit.com");
    yes("https://www.reddit.com/", "reddit.com");
    yes("https://old.reddit.com/r/x", "reddit.com");
    no("https://notreddit.com/", "reddit.com");
    no("https://reddit.com.evil.com/", "reddit.com");
    no("https://evil.com/reddit.com", "reddit.com");
  });
  test("subdomain exception does not cover its parent", () => {
    yes("https://chat.reddit.com/", "chat.reddit.com");
    yes("https://a.chat.reddit.com/", "chat.reddit.com");
    no("https://reddit.com/", "chat.reddit.com");
    no("https://www.reddit.com/", "chat.reddit.com");
  });
  test("prefix boundary", () => {
    const ex = "reddit.com/r/name";
    yes("https://reddit.com/r/name", ex);
    yes("https://reddit.com/r/name/", ex);
    yes("https://reddit.com/r/name/x", ex);
    yes("https://reddit.com/r/name?x=1", ex);
    yes("https://reddit.com/r/name#top", ex);
    yes("https://www.reddit.com/r/name/comments/1", ex);
    no("https://reddit.com/r/names", ex);
    no("https://reddit.com/r/name1", ex);
    no("https://reddit.com/r/name_x", ex);
    no("https://reddit.com/r/name-x", ex);
    no("https://reddit.com/r/name.x", ex);
    no("https://reddit.com/r/name%20x", ex);
    no("https://reddit.com/r/nam", ex);
    no("https://reddit.com/", ex);
    no("https://reddit.com/x/r/name", ex);
  });
  test("case is ignored in host and path", () => {
    yes("https://REDDIT.com/R/NAME/x", "reddit.com/r/name");
    yes("https://reddit.com/r/name", "reddit.com/r/Name");
    yes("https://reddit.com/r/NAME", "reddit.com/r/Name");
  });
  test("queries", () => {
    yes("https://reddit.com/?a=1", "reddit.com/?a=1");
    yes("https://reddit.com/?a=1&b=2", "reddit.com/?a=1");
    yes("https://reddit.com/?a=1#x", "reddit.com/?a=1");
    no("https://reddit.com/?a=10", "reddit.com/?a=1");
    no("https://reddit.com/?b=2&a=1", "reddit.com/?a=1");
    no("https://reddit.com/", "reddit.com/?a=1");
  });
  test("an explicit port only blocks path exceptions; user-info and fragments do not matter", () => {
    no("https://reddit.com:8443/r/x", "reddit.com/r/x"); // the DNR filter has no port in its pattern
    yes("https://reddit.com:8443/r/x", "reddit.com");
    yes("https://u:p@reddit.com/r/x", "reddit.com/r/x");
    yes("http://reddit.com/r/x", "reddit.com/r/x");
  });
  test("IDN", () => {
    yes("https://bücher.de/Ü", normaliseException("bücher.de/Ü"));
    yes("https://shop.xn--bcher-kva.de/", "xn--bcher-kva.de");
  });
  test("any of several exceptions", () => {
    assert.equal(isException("https://b.com/x", ["a.com", "b.com/x"]), true);
    assert.equal(isException("https://b.com/y", ["a.com", "b.com/x"]), false);
    assert.equal(isException("https://b.com/y", []), false);
  });
  test("non-web and invalid URLs are never exceptions", () => {
    for (const url of ["ftp://reddit.com/", "chrome://reddit.com/", "about:blank", "not a url", ""]) no(url, "reddit.com");
  });
  test("dot segments are resolved before matching", () => {
    no("https://reddit.com/r/name/../other", "reddit.com/r/name");
    yes("https://reddit.com/x/../r/name", "reddit.com/r/name");
  });
  test("trailing-dot host", () => {
    assert.equal(isException("https://reddit.com./r/x", ["reddit.com/r/x"]), referenceMatch(exceptionFilter("reddit.com/r/x"), "https://reddit.com./r/x"));
  });
});

describe("isException agrees with the DNR filter ||<exception>^", () => {
  const exceptions = [
    "reddit.com", "reddit.com/r/name", "reddit.com/r/Name", "reddit.com/r/name/sub", "chat.reddit.com",
    "reddit.com/?a=1", "reddit.com/r/x?a=1", "x.com/i/chat", "xn--bcher-kva.de/%C3%9C", "a.b.co.uk/p",
    "reddit.com/a%20b", "1.2.3.4/x",
  ];
  const urls = [
    "https://reddit.com", "https://reddit.com/", "https://www.reddit.com/r/name", "https://www.reddit.com/r/name/",
    "https://reddit.com/r/name/x", "https://reddit.com/r/names", "https://reddit.com/r/name1", "https://reddit.com/r/name_",
    "https://reddit.com/r/name-", "https://reddit.com/r/name.", "https://reddit.com/r/name.json", "https://reddit.com/r/name%2F",
    "https://reddit.com/r/name?a=1", "https://reddit.com/r/name#x", "https://REDDIT.COM/R/NAME", "https://reddit.com/r/NAMES",
    "https://reddit.com/r/name/sub", "https://reddit.com/r/name/subs", "https://reddit.com/r/name/sub/x",
    "https://old.reddit.com/r/name", "https://a.b.reddit.com/", "https://notreddit.com/", "https://notreddit.com/r/name",
    "https://reddit.com.evil.com/", "https://evil.com/reddit.com", "https://evil.com/?u=reddit.com/r/name",
    "https://evil.com/#reddit.com", "https://chat.reddit.com/", "https://x.chat.reddit.com/y", "https://xchat.reddit.com/",
    "https://reddit.com/?a=1", "https://reddit.com/?a=1&b=2", "https://reddit.com/?a=10", "https://reddit.com/?b=2&a=1",
    "https://reddit.com/?a=1#z", "https://reddit.com/r/x?a=1", "https://reddit.com/r/x?a=1&b", "https://reddit.com/r/x?a=12",
    "https://reddit.com/r/x/?a=1", "https://reddit.com:8080/r/name", "https://reddit.com:8080", "http://u:p@reddit.com/r/name",
    "https://u@reddit.com/", "https://reddit.com/a%20b", "https://reddit.com/a%20bc", "https://reddit.com/a b",
    "https://reddit.com/r/name/../x", "https://reddit.com/x/../r/name", "https://reddit.com//r/name",
    "https://x.com/i/chat", "https://x.com/i/chat/abc", "https://x.com/i/chats", "https://twitter.com/i/chat",
    "https://bücher.de/Ü", "https://bücher.de/Ü/x", "https://shop.bücher.de/Üx", "https://xn--bcher-kva.de/%c3%9c",
    "https://a.b.co.uk/p", "https://b.co.uk/p", "https://x.a.b.co.uk/p/q", "https://a.b.co.uk/pp",
    "https://123/x", "https://1.2.3.4/x/y", "https://1.2.3.4:8080/x", "https://1.2.3.4.5/x",
    "ftp://reddit.com/", "chrome://reddit.com/", "about:blank", "not a url",
  ];
  for (const ex of exceptions) {
    for (const url of urls) {
      test(`${ex}  vs  ${url}`, () => {
        assert.equal(isException(url, [ex]), referenceMatch(exceptionFilter(ex), url));
      });
    }
  }
  test("the reference matcher itself", () => {
    assert.equal(referenceMatch("||a.com^", "https://a.com"), true);
    assert.equal(referenceMatch("||a.com^", "https://b.a.com/"), true);
    assert.equal(referenceMatch("||a.com^", "https://ba.com/"), false);
    assert.equal(referenceMatch("||a.com^", "https://a.com.b/"), false);
    assert.equal(referenceMatch("||a.com^", "https://a.com:81/"), true);
    assert.equal(referenceMatch("||a.com/x^", "https://a.com/xy"), false);
    assert.equal(referenceMatch("||a.com/x^", "https://a.com/x?q"), true);
    assert.equal(referenceMatch("||a.com/x^", "https://evil.com/a.com/x"), false);
  });
});

describe("presets and message pages", () => {
  test("every preset site is already normalised and unique", () => {
    const all = PRESETS.flatMap((p) => p.sites);
    for (const s of all) assert.equal(normaliseSite(s), s);
    assert.equal(new Set(all).size, all.length);
  });
  test("DEFAULT_SITES is the default presets' sites", () => {
    assert.deepEqual(DEFAULT_SITES, PRESETS.filter((p) => p.default).flatMap((p) => p.sites));
    assert.ok(DEFAULT_SITES.includes("reddit.com"));
    assert.ok(!DEFAULT_SITES.includes("bbc.com"));
  });
  test("allowedPages without messages is the exceptions", () => {
    assert.deepEqual(allowedPages({ exceptions: ["a.com/x"], exceptionsOn: true, allowMessages: false }), ["a.com/x"]);
  });
  test("allowedPages leaves out the exceptions while they're off", () => {
    assert.deepEqual(allowedPages({ exceptions: ["a.com/x"], exceptionsOn: false, allowMessages: false }), []);
    const pages = allowedPages({ exceptions: ["a.com/x"], exceptionsOn: false, allowMessages: true });
    assert.ok(!pages.includes("a.com/x"));
    assert.ok(pages.includes("facebook.com/messages"));
  });
  test("allowedPages with messages adds normalised pages, without duplicates", () => {
    const pages = allowedPages({ exceptions: ["reddit.com/message", "a.com"], exceptionsOn: true, allowMessages: true });
    assert.equal(new Set(pages).size, pages.length);
    assert.equal(pages[0], "reddit.com/message");
    assert.equal(pages[1], "a.com");
    assert.ok(pages.includes("facebook.com/messages"));
    for (const p of pages) assert.equal(normaliseException(p), p);
  });
  test("presetSites is the sites of presets that are all on the list", () => {
    assert.deepEqual(presetSites(["reddit.com", "x.com", "bbc.com", "a.com"]), ["reddit.com"]);
    assert.deepEqual(presetSites(["x.com", "twitter.com"]), ["x.com", "twitter.com"]);
  });
  test("redirectedSites leaves out other sites while they're off", () => {
    const sites = ["reddit.com", "x.com", "a.com"];
    assert.deepEqual(redirectedSites({ sites, otherSitesOn: true }), sites);
    assert.deepEqual(redirectedSites({ sites, otherSitesOn: false }), ["reddit.com"]);
  });
  test("message pages allow the message URLs but not the rest of the site", () => {
    const pages = allowedPages({ exceptions: [], allowMessages: true });
    assert.equal(isException("https://www.facebook.com/messages/t/123", pages), true);
    assert.equal(isException("https://www.facebook.com/messagesfoo", pages), false);
    assert.equal(isException("https://www.facebook.com/", pages), false);
    assert.equal(isException("https://chat.reddit.com/room", pages), true);
    assert.equal(isException("https://www.reddit.com/r/x", pages), false);
    assert.equal(isException("https://x.com/i/chat", pages), true);
  });
  test("each message page's host belongs to a preset site, except bsky.app", () => {
    const sites = PRESETS.flatMap((p) => p.sites);
    for (const p of allowedPages({ exceptions: [], allowMessages: true })) {
      if (p.startsWith("bsky.app")) continue;
      assert.notEqual(siteFor(`https://${p}`, sites), null, p);
    }
  });
});

describe("saveLists / getLists with a stub storage", () => {
  async function load() {
    const store = {};
    globalThis.chrome = { storage: { sync: {
      get: async (keys) => Object.fromEntries(keys.filter((k) => k in store).map((k) => [k, store[k]])),
      set: async (o) => Object.assign(store, o),
    } } };
    const mod = await import(`../src/shared/settings.js?stub=${Math.random()}`);
    delete globalThis.chrome;
    return { store, ...mod };
  }
  test("normalises, drops invalid entries and duplicates", async () => {
    const { store, saveLists } = await load();
    const saved = await saveLists({
      sites: ["https://www.Reddit.com/r/x", "reddit.com", "", "a b", "x.com"],
      exceptions: ["reddit.com/r/x/", "https://reddit.com/r/x", "reddit.com/*"],
      allowMessages: 1,
      packsOff: ["Exercise", "Exercise", ""],
      customOn: 1,
      custom: [" go outside ", "go outside", ""],
    });
    assert.deepEqual(saved, {
      sites: ["reddit.com", "x.com"], exceptions: ["reddit.com/r/x"], allowMessages: true,
      packsOff: ["Exercise"], customOn: true, custom: ["go outside"],
    });
    assert.deepEqual(store, saved);
  });
  test("saves only what is given", async () => {
    const { store, saveLists } = await load();
    await saveLists({ allowMessages: false });
    assert.deepEqual(store, { allowMessages: false });
  });
  test("getLists falls back to the defaults", async () => {
    const { getLists, DEFAULT_LISTS } = await load();
    assert.deepEqual(await getLists(), DEFAULT_LISTS);
    assert.deepEqual(DEFAULT_LISTS, {
      sites: DEFAULT_SITES, otherSitesOn: false, exceptions: [], exceptionsOn: false, allowMessages: false,
      packsOff: [], customOn: false, custom: [],
    });
  });
  test("a switch never saved is on when its list has lines", async () => {
    const { getLists, saveLists } = await load();
    await saveLists({ sites: [...DEFAULT_SITES, "a.com"], exceptions: ["a.com/x"], custom: ["a"] });
    const lists = await getLists();
    assert.equal(lists.otherSitesOn, true);
    assert.equal(lists.exceptionsOn, true);
    assert.equal(lists.customOn, true);
  });
  test("a switch saved off stays off", async () => {
    const { getLists, saveLists } = await load();
    await saveLists({ sites: ["a.com"], otherSitesOn: false, exceptions: ["a.com/x"], exceptionsOn: false, custom: ["a"], customOn: false });
    const lists = await getLists();
    assert.equal(lists.otherSitesOn, false);
    assert.equal(lists.exceptionsOn, false);
    assert.equal(lists.customOn, false);
  });
});
