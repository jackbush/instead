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

const shared = import("./extension/shared.js"); // shuffle, parseLines, plainText

// "Instead, find a leaf and draw it." from a line of suggestions.txt with its
// links as plain text: the first letter drops to lower case.
function sentence(line) {
  const text = line.replace(/[.!]$/, "");
  return `Instead, ${text[0].toLowerCase()}${text.slice(1)}.`;
}

const hero = document.getElementById("hero-title");
const was = document.getElementById("was");

const pause = document.querySelector(".pause");
const fading = new Set(); // swaps between fading out and back in

// Swaps an element's text with a short blur and fade.
function swap(element, update) {
  if (reducedMotion) return update();
  element.classList.add("out");
  const timer = setTimeout(() => { fading.delete(timer); update(); element.classList.remove("out"); }, 280);
  fading.add(timer);
}

// Cancels a swap that is mid-fade; the old text comes back at full strength.
function settle() {
  for (const timer of fading) clearTimeout(timer);
  fading.clear();
  hero.classList.remove("out");
  was.classList.remove("out");
}

function showSite(i) {
  swap(was, () => { was.querySelector("b").textContent = SITES[i % SITES.length]; });
}

Promise.all([shared, fetch("suggestions.txt").then((r) => r.text())]).then(([{ parseLines, plainText }, text]) => {
  const lines = parseLines(text).map(plainText);
  let i = Math.floor(Math.random() * lines.length);
  hero.textContent = sentence(lines[i]);
  if (reducedMotion) return; // one sentence, nothing to pause
  let site = 0;
  let timer = 0;
  const advance = () => {
    if (document.hidden) return;
    i = (i + 1) % lines.length;
    swap(hero, () => { hero.textContent = sentence(lines[i]); });
    showSite(++site);
  };
  const run = () => { timer = setInterval(advance, CYCLE_MS); };
  run();
  pause.hidden = false;
  pause.addEventListener("click", () => {
    const resuming = !timer;
    if (resuming) run();
    else { clearInterval(timer); timer = 0; settle(); }
    // The label carries the state, so there is no aria-pressed to contradict it.
    pause.querySelector("span").textContent = resuming ? "Pause suggestions" : "Play suggestions";
    // SVG elements have no `hidden` property, only the attribute.
    pause.querySelector('[data-icon="pause"]').toggleAttribute("hidden", !resuming);
    pause.querySelector('[data-icon="play"]').toggleAttribute("hidden", resuming);
  });
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
// fade as covers it. Safari tints its bars from the fixed blocks behind the
// canvas and its overscroll from the root background; other browsers read
// theme-color.
const background = paintBackground(document.getElementById("bg"));
const ground = document.getElementById("ground");
const themeColor = document.querySelector('meta[name="theme-color"]');
const [topEdge, bottomEdge] = ["top", "bottom"].map((e) => document.querySelector(`[data-edge="${e}"]`));
const startHue = params.h;
let frame = 0;
function turn() {
  frame = 0;
  params.h = Math.round(startHue + Math.min(1, scrollY / ground.offsetTop) * 360) % 360;
  applyColours();
  background?.draw();
  // Without WebGL the page is flat primary.
  const { primary } = colours();
  const edges = background?.edges() ?? { top: primary, bottom: primary };
  const fade = parseFloat(getComputedStyle(ground).getPropertyValue("--fade"));
  const groundTop = ground.getBoundingClientRect().top;
  const at = (lab, y) => mixHex(oklabHex(lab), PAPER, Math.min(1, Math.max(0, (y - groundTop) / fade)));
  const top = at(edges.top, 0);
  topEdge.style.backgroundColor = top;
  bottomEdge.style.backgroundColor = at(edges.bottom, innerHeight);
  document.documentElement.style.backgroundColor = top;
  themeColor.content = top;
}
turn();
addEventListener("scroll", () => { frame ||= requestAnimationFrame(turn); }, { passive: true });
addEventListener("resize", turn);
