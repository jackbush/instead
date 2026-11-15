// Tests for src/shared/shared.js. Run with `node --test`.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { shuffle, parseLines, parsePacks, suggestionsFor, parseLinks, plainText } from "../src/shared/shared.js";

describe("shuffle", () => {
  test("returns the same array, a permutation of it", () => {
    const list = Array.from({ length: 50 }, (_, i) => i);
    const out = shuffle(list);
    assert.equal(out, list);
    assert.deepEqual([...out].sort((a, b) => a - b), Array.from({ length: 50 }, (_, i) => i));
  });
  test("handles empty and single lists", () => {
    assert.deepEqual(shuffle([]), []);
    assert.deepEqual(shuffle(["a"]), ["a"]);
  });
  test("reaches every order of three", () => {
    const seen = new Set();
    for (let i = 0; i < 500; i++) seen.add(shuffle([1, 2, 3]).join());
    assert.equal(seen.size, 6);
  });
});

describe("parseLines", () => {
  test("trims and drops blank lines", () => assert.deepEqual(parseLines("  a \n\n b\n   \nc"), ["a", "b", "c"]));
  test("empty file", () => assert.deepEqual(parseLines(""), []));
  test("only whitespace", () => assert.deepEqual(parseLines(" \n\t\n"), []));
  test("CRLF", () => assert.deepEqual(parseLines("a\r\nb\r\n"), ["a", "b"]));
  test("no trailing newline", () => assert.deepEqual(parseLines("a\nb"), ["a", "b"]));
});

describe("parsePacks", () => {
  test("groups lines under their headings", () => assert.deepEqual(
    parsePacks("# One\na\n\n b \n#  Two words\nc\n# Empty\n"),
    [{ name: "One", items: ["a", "b"] }, { name: "Two words", items: ["c"] }, { name: "Empty", items: [] }],
  ));
  test("drops lines before the first heading", () => assert.deepEqual(parsePacks("a\n# One\nb"), [{ name: "One", items: ["b"] }]));
  test("a # without a space is a suggestion", () => assert.deepEqual(parsePacks("# One\n#1 fan"), [{ name: "One", items: ["#1 fan"] }]));
  test("the bundled file has packs, each with suggestions and no repeats", () => {
    const packs = parsePacks(readFileSync(new URL("../src/shared/suggestions.txt", import.meta.url), "utf8"));
    assert.ok(packs.length > 1);
    for (const { name, items } of packs) assert.ok(items.length, name);
    const all = packs.flatMap((p) => p.items);
    assert.equal(new Set(all).size, all.length);
    assert.equal(new Set(packs.map((p) => p.name)).size, packs.length);
  });
  // The mechanical rules in SUGGESTIONS.md.
  test("the bundled suggestions are short, sentence case and unpunctuated", () => {
    const packs = parsePacks(readFileSync(new URL("../src/shared/suggestions.txt", import.meta.url), "utf8"));
    for (const line of packs.flatMap((p) => p.items).map(plainText)) {
      assert.ok(line.length <= 40, `more than 40 characters: ${line}`);
      assert.match(line, /^[A-Z]/, `not capitalised: ${line}`);
      assert.doesNotMatch(line, /[.!]$/, `ends in a full stop: ${line}`);
    }
  });
});

describe("suggestionsFor", () => {
  const packs = [{ name: "A", items: ["a1", "a2"] }, { name: "B", items: ["b1"] }];
  test("every pack by default", () => assert.deepEqual(suggestionsFor(packs), ["a1", "a2", "b1"]));
  test("leaves out packs turned off, adds the user's own", () =>
    assert.deepEqual(suggestionsFor(packs, { packsOff: ["A"], customOn: true, custom: ["mine"] }), ["b1", "mine"]));
  test("leaves out the user's own while they're off", () =>
    assert.deepEqual(suggestionsFor(packs, { packsOff: ["A"], custom: ["mine"] }), ["b1"]));
  test("only the user's own", () =>
    assert.deepEqual(suggestionsFor(packs, { packsOff: ["A", "B"], customOn: true, custom: ["mine"] }), ["mine"]));
  test("every pack off and the user's own off means every pack", () =>
    assert.deepEqual(suggestionsFor(packs, { packsOff: ["A", "B"], custom: ["mine"] }), ["a1", "a2", "b1"]));
  test("nothing left means every pack", () => assert.deepEqual(suggestionsFor(packs, { packsOff: ["A", "B"] }), ["a1", "a2", "b1"]));
});

describe("parseLinks", () => {
  const link = (text, href) => ({ text, href });
  test("text only", () => assert.deepEqual(parseLinks("Go for a run"), ["Go for a run"]));
  test("empty", () => assert.deepEqual(parseLinks(""), []));
  test("one link", () => assert.deepEqual(
    parseLinks("Read [a poem](https://poets.org) today"),
    ["Read ", link("a poem", "https://poets.org"), " today"]));
  test("link alone", () => assert.deepEqual(parseLinks("[a](http://x.y)"), [link("a", "http://x.y")]));
  test("several", () => assert.deepEqual(
    parseLinks("[a](https://a.com) and [b](HTTP://b.com)!"),
    [link("a", "https://a.com"), " and ", link("b", "HTTP://b.com"), "!"]));
  test("balanced parentheses in the url", () => assert.deepEqual(
    parseLinks("[Go](https://en.wikipedia.org/wiki/Go_(game))."),
    [link("Go", "https://en.wikipedia.org/wiki/Go_(game)"), "."]));
  test("non-http(s) urls stay as their text", () => {
    for (const url of ["javascript:alert(1)", "JavaScript:alert(1)", "data:text/html,x", "ftp://x.com", "//x.com", "/path", "mailto:a@b.c"]) {
      assert.deepEqual(parseLinks(`See [it](${url}) now`), ["See it now"], url);
    }
  });
  test("javascript: url hidden behind whitespace is not a link", () =>
    assert.deepEqual(parseLinks("[x]( javascript:alert(1))"), ["[x]( javascript:alert(1))"]));
  test("brackets without a url", () => {
    assert.deepEqual(parseLinks("a [b] c"), ["a [b] c"]);
    assert.deepEqual(parseLinks("[b] (https://x.com)"), ["[b] (https://x.com)"]);
    assert.deepEqual(parseLinks("[b]()"), ["[b]()"]);
    assert.deepEqual(parseLinks("[](https://x.com)"), ["[](https://x.com)"]);
  });
  test("unbalanced brackets and parentheses", () => {
    assert.deepEqual(parseLinks("[a](https://x.com"), ["[a](https://x.com"]);
    assert.deepEqual(parseLinks("[a [b](https://x.com)"), ["[a ", link("b", "https://x.com")]);
    assert.deepEqual(parseLinks("a](https://x.com)"), ["a](https://x.com)"]);
  });
  test("nested brackets: the inner pair is the link text", () =>
    assert.deepEqual(parseLinks("[[a]](https://x.com)"), ["[[a]](https://x.com)"]));
  test("link text is never markup", () =>
    assert.deepEqual(parseLinks("[<b>x</b>](https://x.com)"), [link("<b>x</b>", "https://x.com")]));
});

describe("plainText", () => {
  test("links become their text", () => assert.equal(
    plainText("Read [a poem](https://poets.org) or [this](javascript:x) now."), "Read a poem or this now."));
  test("no links", () => assert.equal(plainText("Go for a run"), "Go for a run"));
});
