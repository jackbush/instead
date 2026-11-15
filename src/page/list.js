// list.html: every bundled suggestion, under its pack's name.

import { parsePacks, parseLinks } from "./shared.js";

paintBackground(document.getElementById("bg"));

const el = (tag, props) => Object.assign(document.createElement(tag), props);

const text = await (await fetch("suggestions.txt")).text();
document.getElementById("packs").replaceChildren(...parsePacks(text).map(({ name, items }) => {
  const section = el("section");
  const list = el("ul");
  list.append(...items.map((line) => {
    const li = el("li");
    li.append(...parseLinks(line).map((s) => typeof s === "string" ? s : el("a", { href: s.href, textContent: s.text })));
    return li;
  }));
  section.append(el("h2", { textContent: name }), list);
  return section;
}));
