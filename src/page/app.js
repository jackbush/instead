const suggestion = document.getElementById("suggestion");
const actions = document.getElementById("actions");
const done = document.getElementById("done");
const next = document.getElementById("next");
let suggestions = [];
let deck = [];     // indexes into suggestions still to show this round
let current = -1;  // index of the one showing

// In the browser extension, `ext` is its API object; on the website it is undefined.
const ext = [globalThis.browser, globalThis.chrome].find((api) => api?.runtime?.id);

// Any website can put this page in an iframe (the extension must let sites
// load it for the redirect), so a framed copy offers nothing that acts on the
// tab. Comparing the two windows is allowed across origins.
const framed = top !== self;

// The shared helpers (src/shared/shared.js).
let shuffle, parsePacks, suggestionsFor, parseLinks;
const shared = import("./shared.js")
  .then((m) => ({ shuffle, parsePacks, suggestionsFor, parseLinks } = m));

// The bundled packs less the ones the extension's settings turn off, plus the
// user's own; on the website, every pack. One line of its own if that fails:
// the page always has a suggestion.
async function loadSuggestions() {
  let choices = {};
  try {
    choices = await ext?.storage.sync.get(["packsOff", "customOn", "custom"]) ?? {};
  } catch {}
  let packs = [];
  try {
    const response = await fetch("suggestions.txt");
    if (response.ok) packs = parsePacks(await response.text());
  } catch {}
  const lines = suggestionsFor(packs, choices);
  return lines.length ? lines : ["Go for a run"];
}

// The line as text and links (see parseLinks). With `glue`, the last two words
// are joined so a wrap never leaves one word alone on the bottom line.
function render(line, glue) {
  const glued = glue ? line.replace(/ +(\S+)$/, "\u00a0$1") : line;
  return parseLinks(glued).map((s) => typeof s === "string" ? s
    : Object.assign(document.createElement("a"), { href: s.href, textContent: s.text }));
}

// Deals the suggestions in a shuffled order, so each one shows before any
// repeats. Each round is shuffled anew and doesn't start with the last one shown.
function show() {
  if (!deck.length) {
    deck = shuffle(suggestions.map((_, i) => i));
    if (deck.length > 1 && deck[0] === current) deck.push(deck.shift());
  }
  current = deck.shift();
  paint();
}

// Phones turn the glue off (demo.html sets --glue to 0): two long words
// together can be wider than the screen. Repaint when that changes.
let glued;
const glues = () => getComputedStyle(suggestion).getPropertyValue("--glue").trim() !== "0";
function paint() {
  glued = glues();
  suggestion.replaceChildren(...render(suggestions[current], glued));
}
addEventListener("resize", () => { if (current >= 0 && glues() !== glued) paint(); });

cutOut(done);

// "I'm on it" closes the tab. Pages can only close tabs a script opened, so the
// extension closes it through its API (but not from a frame, where that tab is
// the embedding site's); the website goes to its home page.
done.addEventListener("click", async () => {
  if (!ext) location.href = "./";
  else if (!framed) ext.tabs.remove((await ext.tabs.getCurrent()).id);
});

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
const BRAND_NAMES = {
  tiktok: "TikTok", youtube: "YouTube", linkedin: "LinkedIn", bbc: "BBC", cnn: "CNN",
  foxnews: "Fox News", nytimes: "The New York Times", washingtonpost: "The Washington Post",
  theguardian: "The Guardian", dailymail: "the Daily Mail", apnews: "AP News",
};

// Second-level labels under a country code, as in bbc.co.uk and news.com.au.
const SECOND_LEVEL = new Set(["co", "com", "org", "net", "gov", "ac", "edu"]);

// The extension adds ?from=<the page it redirected>. Five seconds later a
// link offers to go there after all.
function offerOriginal(from) {
  const hostname = new URL(from).hostname.replace(/\.$/, "");
  const labels = hostname.split(".");
  // Registrable domain's first label: www.reddit.com -> reddit, news.bbc.co.uk -> bbc.
  // An address (1.2.3.4, [::1]) has none, so it is named whole.
  const isAddress = hostname.includes(":") || /^\d+$/.test(labels.at(-1));
  const second = labels.at(-1).length === 2 && SECOND_LEVEL.has(labels.at(-2)) ? 3 : 2;
  const name = isAddress ? hostname : labels.at(-second) ?? labels[0];
  const button = document.createElement("button");
  button.id = "from";
  button.className = "btn link";
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
// On the website only the extension's default sites are offered, so a link to
// the demo can't send anyone elsewhere. A framed copy offers none.
const from = !framed && location.search.startsWith("?from=") && location.search.slice(6) + location.hash;
if (from && /^https?:\/\//i.test(from) && URL.canParse(from)) {
  const allowed = ext || import("./settings.js")
    .then(({ DEFAULT_SITES, siteFor }) => siteFor(from, DEFAULT_SITES))
    .catch(() => false);
  Promise.resolve(allowed).then((ok) => { if (ok) setTimeout(offerOriginal, 5000, from); });
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

// On the website, \ shows and hides the settings. A bare key would be a
// single-character shortcut that can't be turned off, so the extension has none.
if (!ext) {
  addEventListener("keydown", (e) => {
    if (e.key === "\\" && !e.repeat) panel.hidden = !panel.hidden;
  });
}

shared.then(loadSuggestions).then((list) => {
  suggestions = list;
  show();
});
