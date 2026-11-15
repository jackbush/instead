// The marketing site: install buttons, the cycling hero sentence, shuffled
// screenshots, and a hue that turns as you scroll through the opening before
// the page fades to paper.

const SITES = ["reddit.com", "instagram.com", "tiktok.com", "facebook.com"];
const CYCLE_MS = 4200;
const PAPER = getComputedStyle(document.documentElement).getPropertyValue("--paper").trim();
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

// The visitor's browser goes first as the cut-out button; the other is outlined.
const firefox = /firefox/i.test(navigator.userAgent);
for (const group of document.querySelectorAll("[data-install]")) {
  const [chrome, fox] = ["chrome", "firefox"].map((s) => group.querySelector(`[data-store="${s}"]`));
  const [first, second] = firefox ? [fox, chrome] : [chrome, fox];
  group.prepend(first, second);
  first.classList.add("cut-out");
  second.classList.add("outline");
  cutOut(first);
}

// Fisher–Yates, in place.
function shuffle(list) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

// "Instead, find a leaf and draw it." from a line of suggestions.txt: links
// become their text, and the first letter drops to lower case.
function sentence(line) {
  const text = line.replace(/\[([^\]]+)\]\([^)]*(?:\([^)]*\)[^)]*)*\)/g, "$1").replace(/[.!]$/, "");
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

fetch("suggestions.txt").then((r) => r.text()).then((text) => {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  let i = Math.floor(Math.random() * lines.length);
  hero.textContent = sentence(lines[i]);
  if (reducedMotion) return;
  let site = 0;
  setInterval(() => {
    if (document.hidden) return;
    i = (i + 1) % lines.length;
    swap(hero, () => { hero.textContent = sentence(lines[i]); });
    showSite(++site);
  }, CYCLE_MS);
});

// Screenshots in a different order each visit.
for (const list of document.querySelectorAll("[data-shuffle]")) list.append(...shuffle([...list.children]));

// The hue starts somewhere random and turns a full circle between the top of
// the page and the start of the paper. The browser's bars (theme-color, and
// the root background Safari samples) take the hue while the gradient is on
// screen, then the paper.
const background = paintBackground(document.getElementById("bg"));
const ground = document.getElementById("ground");
const themeColor = document.querySelector('meta[name="theme-color"]');
const startHue = params.h;
let frame = 0;
function turn() {
  frame = 0;
  const top = ground.offsetTop;
  params.h = Math.round(startHue + Math.min(1, scrollY / top) * 360) % 360;
  applyColours();
  background?.draw();
  const bar = scrollY < top ? oklabHex(colours().primary) : PAPER;
  document.documentElement.style.backgroundColor = bar;
  themeColor.content = bar;
}
turn();
addEventListener("scroll", () => { frame ||= requestAnimationFrame(turn); }, { passive: true });
addEventListener("resize", turn);
