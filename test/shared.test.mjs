// Tests for extension/shared.js. Run with `node --test`.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { shuffle, parseLines, parseLinks, plainText } from "../extension/shared.js";

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
