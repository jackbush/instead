const suggestion = document.getElementById("suggestion");
const actions = document.getElementById("actions");
const next = document.getElementById("next");
let suggestions = [];
let current = -1;

// In the browser extension, `ext` is its API object; on the website it is undefined.
const ext = [globalThis.browser, globalThis.chrome].find((api) => api?.runtime?.id);

// The extension's saved list if it has one, otherwise the bundled file.
async function loadSuggestions() {
  const saved = (await ext?.storage.sync.get("suggestions"))?.suggestions;
  if (saved?.length) return saved;
  const text = await (await fetch("suggestions.txt")).text();
  return text.split("\n").map((l) => l.trim()).filter(Boolean);
}

// The line as text and links: [text](url) becomes a link when the url is
// http or https, and stays as plain text otherwise. As in Markdown, the url
// may hold balanced parentheses, like Wikipedia's. With `glue`, the last two
// words are joined so a wrap never leaves one word alone on the bottom line.
function render(line, glue) {
  const glued = glue ? line.replace(/ +(\S+)$/, "\u00a0$1") : line;
  const nodes = [];
  let from = 0;
  for (const m of glued.matchAll(/\[([^\]]+)\]\(((?:[^()\s]|\([^()\s]*\))+)\)/g)) {
    nodes.push(glued.slice(from, m.index));
    nodes.push(/^https?:\/\//i.test(m[2])
      ? Object.assign(document.createElement("a"), { href: m[2], textContent: m[1] })
      : m[1]);
    from = m.index + m[0].length;
  }
  nodes.push(glued.slice(from));
  return nodes;
}

function show() {
  let i;
  do i = Math.floor(Math.random() * suggestions.length);
  while (suggestions.length > 1 && i === current);
  current = i;
  paint();
}

// Phones turn the glue off (index.html sets --glue to 0): two long words
// together can be wider than the screen. Repaint when that changes.
let glued;
const glues = () => getComputedStyle(suggestion).getPropertyValue("--glue").trim() !== "0";
function paint() {
  glued = glues();
  suggestion.replaceChildren(...render(suggestions[current], glued));
}
addEventListener("resize", () => { if (current >= 0 && glues() !== glued) paint(); });

cutOut(next);

// Every suggestion (page load or button) gets a new primary hue from the
// hue slider's range. A button press also moves at least 30° round the
// wheel from the current hue, either way.
const MIN_HUE_STEP = 30;
const { min: HUE_MIN, max: HUE_MAX } = PARAMS.find((p) => p.key === "h");
const HUES = Array.from({ length: HUE_MAX - HUE_MIN + 1 }, (_, i) => HUE_MIN + i);
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const randomHue = () => pick(HUES);
const nextHue = (h) => pick(HUES.filter((x) => {
  const d = Math.abs(x - h);
  return Math.min(d, 360 - d) >= MIN_HUE_STEP;
}));

next.addEventListener("click", () => {
  show();
  const hue = document.querySelector('#params [name="h"]');
  hue.value = nextHue(params.h);
  hue.dispatchEvent(new Event("input")); // updates params, readout and colours
});

// Names whose capitals aren't just the first letter.
const BRAND_NAMES = { tiktok: "TikTok", youtube: "YouTube", linkedin: "LinkedIn" };

// The extension adds ?from=<the page it redirected>. Five seconds later a
// second button offers to go there after all.
function offerOriginal(from) {
  const host = new URL(from).hostname.replace(/\.$/, "").split(".");
  // Registrable domain's first label: www.reddit.com -> reddit, news.bbc.co.uk -> bbc.
  const second = host.length > 2 && host.at(-1).length === 2 && host.at(-2).length <= 3 ? 3 : 2;
  const name = host.at(-second) ?? host[0];
  const button = document.createElement("button");
  button.id = "from";
  button.className = "btn";
  button.type = "button";
  button.innerHTML = '<span></span><svg class="icon" aria-hidden="true" viewBox="0 0 256 256"><path d="M224.49,136.49l-72,72a12,12,0,0,1-17-17L187,140H40a12,12,0,0,1,0-24H187L135.51,64.48a12,12,0,0,1,17-17l72,72A12,12,0,0,1,224.49,136.49Z"/></svg>';
  button.firstChild.textContent = `Take me to ${BRAND_NAMES[name] ?? name[0].toUpperCase() + name.slice(1)}`;
  button.addEventListener("click", () => {
    if (ext) ext.runtime.sendMessage({ type: "bypass", url: from });
    else location.href = from;
  });
  actions.append(button);
  button.getBoundingClientRect(); // start the fade from opacity 0
  button.classList.add("visible");
}

// The original URL follows "?from=" unencoded (a redirect rule can't encode
// it), so the rest of the query is taken as is. Its #fragment, if it had one,
// is carried over onto this page's URL.
const from = location.search.startsWith("?from=") && location.search.slice(6) + location.hash;
if (from && /^https?:\/\//i.test(from) && URL.canParse(from)) {
  setTimeout(offerOriginal, 5000, from);
}

// Background and its params sidebar (background.js).
const background = createBackground(document.getElementById("bg"));
let frame = 0;
const redraw = () => {
  if (!background || frame) return;
  frame = requestAnimationFrame(() => { frame = 0; background.draw(); });
};
const panel = document.getElementById("params");
params.h = randomHue();
buildSidebar(panel, () => { applyColours(); redraw(); });
if (background) {
  const newCurve = document.createElement("button");
  newCurve.type = "button";
  newCurve.textContent = "New curve";
  newCurve.addEventListener("click", background.newArc);
  panel.querySelector('[name="guide"]').closest("label").after(newCurve);
}
applyColours();
redraw();
addEventListener("resize", redraw);

// \ shows and hides the settings.
addEventListener("keydown", (e) => {
  if (e.key === "\\" && !e.repeat) panel.hidden = !panel.hidden;
});

loadSuggestions().then((list) => {
  suggestions = list;
  show();
});
