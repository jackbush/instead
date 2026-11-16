// The marketing site: install buttons, the cycling hero sentence, shuffled
// screenshots, and a hue that turns as you scroll through the opening before
// the page fades to paper.

const SITES = ["reddit.com", "instagram.com", "tiktok.com", "facebook.com"];
const CYCLE_MS = 4200;
const PAPER = getComputedStyle(document.documentElement).getPropertyValue("--paper").trim();
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

// Chrome is the cut-out button. (The Firefox button returns with its listing.)
for (const group of document.querySelectorAll("[data-install]")) {
  const chrome = group.querySelector('[data-store="chrome"]');
  chrome.classList.add("cut-out");
  cutOut(chrome);
}

const shared = import("./shared.js"); // shuffle, parsePacks, suggestionsFor, plainText

// "Instead, find a leaf and draw it." from a suggestion in suggestions.txt with its
// links as plain text: the first letter drops to lower case.
function sentence(line) {
  const text = line.replace(/[.!]$/, "");
  return `Instead, ${text[0].toLowerCase()}${text.slice(1)}.`;
}

const hero = document.getElementById("hero-title");
const was = document.getElementById("was");

// Swaps an element's text with a short blur and fade.
function swap(element, update) {
  if (reducedMotion) return update();
  element.classList.add("out");
  setTimeout(() => { update(); element.classList.remove("out"); }, 280);
}

function showSite(i) {
  swap(was, () => { was.querySelector("b").textContent = SITES[i % SITES.length]; });
}

// The hero leaves out the Exercise pack.
Promise.all([shared, fetch("suggestions.txt").then((r) => r.text())]).then(([{ parsePacks, suggestionsFor, shuffle, plainText }, text]) => {
  const lines = shuffle(suggestionsFor(parsePacks(text), { packsOff: ["Exercise"] }).map(plainText));
  // Shuffled, so the sentences don't run through one pack at a time.
  let i = 0;
  hero.textContent = sentence(lines[i]);
  if (reducedMotion) return; // one sentence that stays
  let site = 0;
  setInterval(() => {
    if (document.hidden) return;
    i = (i + 1) % lines.length;
    swap(hero, () => { hero.textContent = sentence(lines[i]); });
    showSite(++site);
  }, CYCLE_MS);
});

// Screenshots in a different order each visit.
shared.then(({ shuffle }) => {
  for (const list of document.querySelectorAll("[data-shuffle]")) list.append(...shuffle([...list.children]));
});

// "#rrggbb" a fraction t of the way from a to b, mixed in sRGB as the
// browser composites the paper's fade over the canvas.
function mixHex(a, b, t) {
  const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const [x, y] = [rgb(a), rgb(b)];
  return "#" + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, "0")).join("");
}

// The hue starts somewhere random and turns a full circle between the top of
// the page and the start of the paper. The browser's bars follow whatever is
// on screen at each edge: the gradient there, with as much of the paper's
// fade as covers it. Safari tints its bars from the edge strips over the
// canvas and its overscroll from the root background; other browsers read
// theme-color.
const background = paintBackground(document.getElementById("bg"));
const ground = document.getElementById("ground");
const footer = document.querySelector("footer");
const themeColor = document.querySelector('meta[name="theme-color"]');
let [topEdge, bottomEdge] = ["top", "bottom"].map((e) => document.querySelector(`[data-edge="${e}"]`));
const startHue = params.h;
let frame = 0;

// Safari reads a strip's colour once, when the strip is added, so a new
// colour needs a new strip. Returns the strip now in the page.
function tint(strip, colour) {
  if (strip.dataset.colour === colour) return strip;
  const fresh = strip.cloneNode();
  fresh.dataset.colour = colour;
  fresh.style.backgroundColor = colour;
  strip.replaceWith(fresh);
  return fresh;
}

function turn() {
  frame = 0;
  params.h = Math.round(startHue + Math.min(1, scrollY / ground.offsetTop) * 360) % 360;
  applyColours();
  background?.draw();
  // Without WebGL the page is flat primary.
  const { primary, text } = colours();
  const edges = background?.edges() ?? { top: primary, bottom: primary };
  const fade = parseFloat(getComputedStyle(ground).getPropertyValue("--fade"));
  const groundTop = ground.getBoundingClientRect().top;
  const at = (lab, y) => mixHex(oklabHex(lab), PAPER, Math.min(1, Math.max(0, (y - groundTop) / fade)));
  const top = at(edges.top, 0);
  topEdge = tint(topEdge, top);
  // The footer is ink, so the bottom bar turns ink once the footer reaches it.
  const footerOnEdge = footer.getBoundingClientRect().top < innerHeight;
  bottomEdge = tint(bottomEdge, footerOnEdge ? oklabHex(text) : at(edges.bottom, innerHeight));
  document.documentElement.style.backgroundColor = top;
  themeColor.content = top;
}
turn();
addEventListener("scroll", () => { frame ||= requestAnimationFrame(turn); }, { passive: true });
addEventListener("resize", turn);
