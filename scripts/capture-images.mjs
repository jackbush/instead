// Renders the project's images from the Chrome build in headless Chrome:
//   website/og-image.jpg         link-preview image, one button without its label
//   .github/cover.jpg            README and website cover
//   store/main.png, settings.png store screenshots
//   store/tile.png               Chrome Web Store small promo tile
//   store/marquee-tile.png       Chrome Web Store marquee promo tile
//   website/shots/*.jpg          website screenshots, each in its own colour
//   instead.mp4 and .jpg         cover video and poster for jackbush.github.io
// Each image fixes its suggestion, hue and gradient curve (hue 200 and one
// curve unless it says otherwise). Each is drawn at 3x and scaled down for
// crisp type. Chrome's software rendering can differ by a shade between runs,
// so an image is only replaced when the new one visibly differs from it.
//
// Every image is the same two pages, so the images marked `probe` (between
// them they show the page, its "Take me to" link and the settings page) are
// rendered first. If they all look the same as before, so would the rest, and
// the saved images are kept. Pass --all to render every image regardless, as
// the pre-commit hook does when this script changes.
//
//   node scripts/capture-images.mjs [--all]
//
// Needs Node 22+, ffmpeg and Chrome (set CHROME to use another binary).

import { execFileSync, spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:http";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { extname, join, normalize, resolve } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const SITE = join(ROOT, "dist/chrome");
const CHROME = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const SUGGESTION = "Draw something that makes you feel joy";
const HUE = 200;
const CURVE_SEED = 89;

// The website's screenshots: the product in a different colour each time.
const SITE_SHOTS = [
  ["Find a leaf and draw it", 145, 7],
  ["Go for a run", 25, 31],
  ["Tell a friend why you love them", 300, 89],
  ["Drink a cup of tea in silence", 70, 12],
  ["Ride your bike", 235, 54],
  ["Practise a loving kindness meditation", 340, 3],
].map(([suggestion, hue, seed], i) => ({
  out: `website/shots/demo-${i + 1}.jpg`, page: "demo.html", width: 1280, height: 800, scale: 1, suggestion, hue, seed,
}));
const SUPERSAMPLE = 3;

const IMAGES = [
  { out: "website/og-image.jpg", page: "demo.html", width: 1200, height: 630, scale: 2, hideLabel: true },
  { out: ".github/cover.jpg", page: "demo.html", width: 1200, height: 800, scale: 2 },
  { out: "store/main.png", page: "demo.html", width: 1280, height: 800, scale: 1 },
  { out: "store/settings.png", page: "options.html", width: 1280, height: 800, scale: 1 },
  {
    out: "store/tile.png", page: "demo.html", width: 440, height: 280, scale: 1,
    tile: { text: "Find a leaf and draw it", textSize: 56, nameSize: 76, pad: 32, gap: 10 },
  },
  {
    out: "store/marquee-tile.png", page: "demo.html", width: 1400, height: 560, scale: 1,
    tile: { text: SUGGESTION, textSize: 112, nameSize: 44, pad: 80, gap: 20 },
  },
  ...SITE_SHOTS,
  { out: "website/shots/settings.jpg", page: "options.html", width: 1480, height: 1110, scale: 1, hue: 150, seed: 63, probe: true },
  // The page as the extension shows it after a redirect: "Take me to Reddit"
  // fades in five seconds after load.
  {
    out: "website/shots/take-me-to.jpg", page: "demo.html?from=https://www.reddit.com/", width: 1280, height: 800, scale: 1,
    suggestion: "Look at a tree, from leaf to root", hue: 330, seed: 44, waitMs: 5800, probe: true,
  },
];

// The cover video on jackbush.github.io's projects list: the website's
// screenshots bar the bike one, each with a "Take me to" link to a different
// site, fading from one to the next and looping. It's saved in that repo,
// next to this one unless HOMEPAGE says where, with its first frame as the
// poster.
const HOMEPAGE = process.env.HOMEPAGE ?? join(ROOT, "../jackbush.github.io");
const VIDEO = {
  out: "src/assets/covers/instead.mp4",
  poster: "src/assets/covers/instead.jpg",
  width: 1200, height: 800, scale: 1.5, fps: 30,
  // Seconds: how long each one shows, then the change to the next. The text
  // and buttons fade out, the colours move, then they fade back in, each
  // overlapping the next a little.
  hold: 2.6, textOut: [0, 0.5], colours: [0.3, 1.5], textIn: [1.3, 1.8],
  scenes: SITE_SHOTS.filter(({ suggestion }) => suggestion !== "Ride your bike").map((shot, i) => ({
    ...shot,
    from: ["https://www.reddit.com/", "https://www.facebook.com/", "https://www.youtube.com/", "https://x.com/", "https://www.instagram.com/"][i],
  })),
};

// Math.random as a fixed sequence: the hue first (settings picks it with the
// first random number), then the gradient curve.
const seededRandom = ({ hue = HUE, seed = CURVE_SEED }) => `(() => {
  let s = ${seed}, first = true;
  Math.random = () => {
    if (first) { first = false; return (${hue} + 0.5) / 360; }
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
})();`;

// The settings page outside the extension. The capture's profile is new
// each run, so the stand-in's storage starts empty: the defaults.
const FAKE_EXTENSION = readFileSync(join(ROOT, "scripts/fake-extension.js"), "utf8");

// The promo tiles: the Instead page with the hand and name above a
// suggestion, in place of the button. Sizes are in CSS pixels.
const tileCss = ({ textSize, nameSize, pad, gap }) => `
  body { display: flex; flex-direction: column; justify-content: center; gap: ${gap}px; padding: 0 ${pad}px; }
  main { display: contents; }
  #actions { display: none; }
  #suggestion { align-self: auto; max-width: none; font-size: ${textSize}px; }
  .tile-name {
    display: flex; align-items: center; gap: 0.08em; margin: 0;
    font: 400 ${nameSize}px/1.04 Gloock, Georgia, serif; letter-spacing: -0.02em;
  }
  .tile-name img { height: 0.95em; }
`;

// The Instead page: the suggestion, the hue (through its slider, as a visitor
// would set it) and the curve. A tile also gets the tile layout.
const setUpMain = (image) => { const { hideLabel, tile, suggestion = SUGGESTION, hue = HUE } = image; return `(async () => {
  while (suggestions.length < 2) await new Promise((r) => setTimeout(r, 50));
  ${tile ? `
  document.head.append(Object.assign(document.createElement("style"), { textContent: ${JSON.stringify(tileCss(tile))} }));
  const name = Object.assign(document.createElement("p"), { className: "tile-name" });
  name.append(Object.assign(document.createElement("img"), { src: "icons/favicon.svg", alt: "" }), "Instead");
  document.body.prepend(name);
  await name.querySelector("img").decode();` : ""}
  suggestions.splice(0, suggestions.length, ${JSON.stringify(tile?.text ?? suggestion)});
  deck = [];
  current = -1;
  show();
  const hue = document.querySelector('#params [name="h"]');
  hue.value = ${hue};
  hue.dispatchEvent(new Event("input"));
  ${seededRandom(image)}
  Math.random(); // the hue's turn; the page's hue comes from the slider
  background.newArc();
  ${hideLabel ? `document.querySelectorAll("#done mask text, #done mask path, #next").forEach((e) => e.remove());` : ""}
})()`; };

const SET_UP_SETTINGS = `(async () => {
  while (document.getElementById("sites").disabled) await new Promise((r) => setTimeout(r, 50));
})()`;

const TYPES = {
  ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".txt": "text/plain", ".png": "image/png", ".woff2": "font/woff2", ".svg": "image/svg+xml",
};

function serve() {
  const server = createServer((req, res) => {
    const path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^\/+/, "");
    try {
      const body = readFileSync(join(SITE, path || "demo.html"));
      res.writeHead(200, { "content-type": TYPES[extname(path)] ?? "application/octet-stream" });
      res.end(body);
    } catch {
      res.writeHead(404).end();
    }
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function openChrome() {
  const profile = mkdtempSync(join(tmpdir(), "instead-capture-"));
  const chrome = spawn(CHROME, [
    "--headless=new", "--use-angle=swiftshader", "--enable-unsafe-swiftshader",
    "--hide-scrollbars", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "about:blank",
  ], { stdio: ["ignore", "ignore", "pipe"] });
  const port = await new Promise((resolve, reject) => {
    chrome.stderr.on("data", (d) => {
      const m = /DevTools listening on ws:\/\/[^:]+:(\d+)/.exec(d);
      if (m) resolve(m[1]);
    });
    chrome.on("exit", () => reject(new Error(`Chrome exited; is it at ${CHROME}?`)));
  });
  const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
  const ws = new WebSocket(targets.find((t) => t.type === "page").webSocketDebuggerUrl);
  await new Promise((r) => { ws.onopen = r; });
  let id = 0;
  const pending = new Map();
  const waiting = new Map(); // event name -> resolve
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); }
    else if (waiting.has(d.method)) { waiting.get(d.method)(); waiting.delete(d.method); }
  };
  const next = (event) => new Promise((r) => waiting.set(event, r));
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    pending.set(++id, (d) => (d.error ? reject(new Error(`${method}: ${d.error.message}`)) : resolve(d.result)));
    ws.send(JSON.stringify({ id, method, params }));
  });
  const close = async () => {
    ws.close();
    const exited = once(chrome, "exit");
    chrome.kill();
    await exited; // Chrome writes to its profile until it exits
    rmSync(profile, { recursive: true, force: true });
  };
  return { send, next, close };
}

async function capture({ send, next }, origin, image) {
  const { page, width, height, scale } = image;
  await send("Emulation.setDeviceMetricsOverride", {
    width, height, deviceScaleFactor: scale * SUPERSAMPLE, mobile: false,
  });
  const scripts = page === "options.html" ? [FAKE_EXTENSION, seededRandom(image)] : [];
  const added = [];
  for (const source of scripts) added.push((await send("Page.addScriptToEvaluateOnNewDocument", { source })).identifier);
  const loaded = next("Page.loadEventFired");
  await send("Page.navigate", { url: `${origin}/${page}` });
  await loaded;
  for (const identifier of added) await send("Page.removeScriptToEvaluateOnNewDocument", { identifier });

  const setUp = page === "options.html" ? SET_UP_SETTINGS : setUpMain(image);
  const result = await send("Runtime.evaluate", { expression: setUp, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(`${image.out}: ${result.exceptionDetails.exception?.description}`);
  await send("Runtime.evaluate", {
    expression: "document.fonts.ready.then(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))",
    awaitPromise: true,
  });
  await sleep(image.waitMs ?? 300); // the cut-out button places its label after layout settles

  const { data } = await send("Page.captureScreenshot", { format: "png" });
  return Buffer.from(data, "base64");
}

// Above this, two images look the same (PSNR in dB; identical is infinite).
const SAME_PSNR = 60;

// Scales the supersampled capture down to the image's size (`scale` times its
// page size) and saves it to `out` (from the root of this repo, or absolute),
// unless it looks the same as the saved one. Resolves to whether the file changed.
function save(png, { out, width, height, scale }) {
  const file = resolve(ROOT, out);
  const fresh = file.replace(/(\.\w+)$/, ".new$1");
  const args = ["-loglevel", "error", "-y", "-f", "png_pipe", "-i", "-",
    "-vf", `scale=${width * scale}:${height * scale}:flags=lanczos`];
  if (out.endsWith(".jpg")) args.push("-pix_fmt", "yuvj444p", "-q:v", "2");
  else args.push("-pix_fmt", "rgb24");
  mkdirSync(join(file, ".."), { recursive: true });
  execFileSync("ffmpeg", [...args, fresh], { input: png });
  if (existsSync(file) && psnr(file, fresh) >= SAME_PSNR) {
    rmSync(fresh);
    return false;
  }
  renameSync(fresh, file);
  return true;
}

function psnr(a, b) {
  const { stderr } = spawnSync("ffmpeg", ["-i", a, "-i", b, "-lavfi", "psnr", "-f", "null", "-"], { encoding: "utf8" });
  const m = /average:(inf|[\d.]+)/.exec(stderr);
  return !m ? 0 : m[1] === "inf" ? Infinity : Number(m[1]);
}

// The arc a seed gives (as background.js's randomArc draws it after the hue),
// with its bend and side as one signed curvature so two arcs can be blended:
// halfway between a hump and a dip is a straight line.
function arcFor(seed) {
  const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const [left, right, bend, side] = [random(), random(), 1 + random() * 2, random() < 0.5 ? 1 : -1];
  return { left, right, curve: side / bend };
}

// Draws one frame of the video: the colours (hue and arc), and the text and
// buttons with their opacity. Math.random is swapped for the arc's values while newArc
// draws it.
const SET_FRAME = `(({ hue, arc, text, from, opacity }) => {
  if (suggestions[current] !== text) {
    suggestions.splice(0, suggestions.length, text);
    deck = [];
    current = -1;
    show();
    document.getElementById("from")?.remove();
    offerOriginal(from);
  }
  params.h = hue;
  applyColours();
  const k = Math.abs(arc.curve) < 1e-4 ? 1e-4 : arc.curve;
  const values = [arc.left, arc.right, (1 / Math.abs(k) - 1) / 2, k > 0 ? 0 : 1];
  const random = Math.random;
  Math.random = () => values.shift();
  background.newArc();
  Math.random = random;
  for (const id of ["suggestion", "actions"]) document.getElementById(id).style.opacity = opacity;
})`;

const ease = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const progress = (t, [start, end]) => ease((t - start) / (end - start));
const mixHue = (a, b, t) => ((a + ((((b - a) % 360) + 540) % 360 - 180) * t) % 360 + 360) % 360;

// Renders the cover video to HOMEPAGE and saves its first frame as the poster.
// Frames are screenshots at twice the video's size, scaled down by ffmpeg.
async function renderVideo({ send, next }, origin) {
  const { width, height, scale, fps, hold, scenes } = VIDEO;
  await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: scale * 2, mobile: false });
  const loaded = next("Page.loadEventFired");
  await send("Page.navigate", { url: `${origin}/demo.html` });
  await loaded;
  await send("Runtime.evaluate", {
    expression: `(async () => {
      while (suggestions.length < 2) await new Promise((r) => setTimeout(r, 50));
      // The buttons are a size up, as the card shows the video small.
      const size = parseFloat(getComputedStyle(document.getElementById("done")).fontSize) + 2;
      document.head.append(Object.assign(document.createElement("style"), {
        textContent: \`#from { transition: none; } #actions .btn { font-size: \${size}px; }\`,
      }));
      await document.fonts.ready;
    })()`,
    awaitPromise: true,
  });
  const frame = async (state) => {
    const result = await send("Runtime.evaluate", { expression: `${SET_FRAME}(${JSON.stringify(state)})` });
    if (result.exceptionDetails) throw new Error(`${VIDEO.out}: ${result.exceptionDetails.exception?.description}`);
    await send("Runtime.evaluate", { expression: "new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))", awaitPromise: true });
    return Buffer.from((await send("Page.captureScreenshot", { format: "png" })).data, "base64");
  };

  const file = join(HOMEPAGE, VIDEO.out);
  const ffmpeg = spawn("ffmpeg", [
    "-loglevel", "error", "-y", "-f", "image2pipe", "-c:v", "png", "-framerate", String(fps), "-i", "-",
    "-vf", `scale=${width * scale}:${height * scale}:flags=lanczos,format=yuv420p`,
    "-c:v", "libx264", "-preset", "slow", "-crf", "20", "-movflags", "+faststart", "-an", file,
  ], { stdio: ["pipe", "inherit", "inherit"] });
  const encoded = once(ffmpeg, "exit");
  const write = async (png, times = 1) => {
    for (let i = 0; i < times; i++) if (!ffmpeg.stdin.write(png)) await once(ffmpeg.stdin, "drain");
  };

  const change = VIDEO.textIn[1];
  for (const [i, scene] of scenes.entries()) {
    const nextScene = scenes[(i + 1) % scenes.length];
    const [a, b] = [arcFor(scene.seed), arcFor(nextScene.seed)];
    const shown = { hue: scene.hue, arc: a, text: scene.suggestion, from: scene.from, opacity: 1 };
    const still = await frame(shown);
    if (i === 0) save(still, { out: join(HOMEPAGE, VIDEO.poster), width, height, scale });
    await write(still, Math.round(hold * fps));
    for (let f = 0; f < Math.round(change * fps); f++) {
      const t = f / fps;
      const c = progress(t, VIDEO.colours);
      const incoming = t >= VIDEO.textOut[1];
      await write(await frame({
        hue: mixHue(scene.hue, nextScene.hue, c),
        arc: Object.fromEntries(Object.keys(a).map((key) => [key, a[key] + (b[key] - a[key]) * c])),
        text: incoming ? nextScene.suggestion : scene.suggestion,
        from: incoming ? nextScene.from : scene.from,
        opacity: incoming ? progress(t, VIDEO.textIn) : 1 - progress(t, VIDEO.textOut),
      }));
    }
  }
  ffmpeg.stdin.end();
  const [code] = await encoded;
  if (code !== 0) throw new Error(`ffmpeg exited with ${code}`);
  console.log(`Updated ${file} and its poster; commit them in that repo`);
}

execFileSync("sh", [join(ROOT, "scripts/build.sh")], { stdio: "ignore" });
const server = await serve();
const origin = `http://127.0.0.1:${server.address().port}`;
const chrome = await openChrome();
try {
  await chrome.send("Page.enable");
  await chrome.send("Runtime.enable");
  const render = async (image) => {
    const changed = save(await capture(chrome, origin, image), image);
    console.log(`${changed ? "Updated" : "Unchanged"} ${image.out}`);
    return changed;
  };
  const probes = IMAGES.filter((image) => image.probe);
  const rest = IMAGES.filter((image) => !image.probe);
  let changed = false;
  for (const image of probes) changed = (await render(image)) || changed;
  if (changed || process.argv.includes("--all") || rest.some(({ out }) => !existsSync(join(ROOT, out)))) {
    for (const image of rest) await render(image);
    if (existsSync(HOMEPAGE)) await renderVideo(chrome, origin);
    else console.log(`Skipped the cover video: no ${HOMEPAGE} (set HOMEPAGE)`);
  } else {
    console.log(`Kept the other ${rest.length} images and the cover video`);
  }
} finally {
  await chrome.close();
  server.close();
}
