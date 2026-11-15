// Small helpers the website, the suggestion page and the settings share. A
// module so Node can test it; the pages load it with import().

// Fisher–Yates, in place.
export function shuffle(list) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

// The non-blank lines of a text file, trimmed.
export const parseLines = (text) => text.split("\n").map((l) => l.trim()).filter(Boolean);

// suggestions.txt as [{ name, items }]: each pack starts with a "# Name" line
// and holds the lines under it. Lines before the first heading belong to no pack.
export function parsePacks(text) {
  const packs = [];
  for (const line of parseLines(text)) {
    const heading = /^#\s+(.+)/.exec(line);
    if (heading) packs.push({ name: heading[1], items: [] });
    else packs.at(-1)?.items.push(line);
  }
  return packs;
}

// The suggestions to show: the packs that aren't turned off, then the user's
// own if they're on. With nothing left, every pack.
export function suggestionsFor(packs, { packsOff = [], customOn = false, custom = [] } = {}) {
  const list = [...packs.filter((p) => !packsOff.includes(p.name)).flatMap((p) => p.items), ...(customOn ? custom : [])];
  return list.length ? list : packs.flatMap((p) => p.items);
}

// [text](url). As in Markdown, the url may hold balanced parentheses, like
// Wikipedia's, but no spaces. The text holds no brackets, so
// "[a [b](url)" links "b".
const LINK = /\[([^\[\]]+)\]\(((?:[^()\s]|\([^()\s]*\))+)\)/g;

// A line as an array of plain strings and { text, href } links. A link only
// counts when its url is http or https; otherwise it stays as its text.
export function parseLinks(line) {
  const segments = [];
  const add = (part) => {
    if (typeof part === "string" && typeof segments.at(-1) === "string") segments[segments.length - 1] += part;
    else if (part !== "") segments.push(part);
  };
  let from = 0;
  for (const m of line.matchAll(LINK)) {
    add(line.slice(from, m.index));
    add(/^https?:\/\//i.test(m[2]) ? { text: m[1], href: m[2] } : m[1]);
    from = m.index + m[0].length;
  }
  add(line.slice(from));
  return segments;
}

// The line with each link as its text.
export const plainText = (line) => parseLinks(line).map((s) => s.text ?? s).join("");
