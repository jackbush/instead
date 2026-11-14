// Renders the project's images from the Chrome build in headless Chrome:
//   og-image.jpg                 link-preview image, button without its label
//   .github/cover.jpg            README and website cover
//   store/main.png, settings.png store screenshots
//   store/tile.png               Chrome Web Store small promo tile
//   store/marquee-tile.png       Chrome Web Store marquee promo tile
// Every image shows the same moment: hue 200 and one fixed gradient curve. Each is drawn at 3x and scaled down for crisp type. Chrome's
// software rendering can differ by a shade between runs, so an image is only
// replaced when the new one visibly differs from it.
//
//   node scripts/capture-images.mjs
//
// Needs Node 22+, ffmpeg and Chrome (set CHROME to use another binary).

import { execFileSync, spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:http";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { extname, join, normalize } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const SITE = join(ROOT, "dist/chrome");
const CHROME = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const SUGGESTION = "Draw something that makes you feel joy";
const HUE = 200;
const CURVE_SEED = 89;
const SUPERSAMPLE = 3;

const IMAGES = [
  { out: "og-image.jpg", page: "index.html", width: 1200, height: 630, scale: 2, hideLabel: true },
  { out: ".github/cover.jpg", page: "index.html", width: 1200, height: 800, scale: 2 },
  { out: "store/main.png", page: "index.html", width: 1280, height: 800, scale: 1 },
  { out: "store/settings.png", page: "options.html", width: 1280, height: 800, scale: 1 },
  {
    out: "store/tile.png", page: "index.html", width: 440, height: 280, scale: 1,
    tile: { text: "Find a leaf and draw it", textSize: 56, nameSize: 76, pad: 32, gap: 10 },
  },
  {
    out: "store/marquee-tile.png", page: "index.html", width: 1400, height: 560, scale: 1,
    tile: { text: SUGGESTION, textSize: 112, nameSize: 44, pad: 80, gap: 20 },
  },
];

// Math.random as a fixed sequence: the hue first (settings picks it with the
// first random number), then the gradient curve.
const SEEDED_RANDOM = `(() => {
  let s = ${CURVE_SEED}, first = true;
  Math.random = () => {
    if (first) { first = false; return (${HUE} + 0.5) / 360; }
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
})();`;

// The settings page outside the extension: an API that hands back the
// defaults and grants every permission.
const FAKE_EXTENSION = `globalThis.browser = {
  runtime: { id: "capture", getURL: (path) => "/" + path },
  storage: { sync: { get: async () => ({}), set: async () => {}, remove: async () => {} } },
  permissions: {
    contains: async () => true, request: async () => true,
    onAdded: { addListener() {} }, onRemoved: { addListener() {} },
  },
};`;

// The promo tiles: the Instead page with the hand and name above a
// suggestion, in place of the button. Sizes are in CSS pixels.
const tileCss = ({ textSize, nameSize, pad, gap }) => `
  body { display: flex; flex-direction: column; justify-content: center; gap: ${gap}px; padding: 0 ${pad}px; }
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
const SET_UP_MAIN = ({ hideLabel, tile }) => `(async () => {
  while (suggestions.length < 2) await new Promise((r) => setTimeout(r, 50));
  ${tile ? `
  document.head.append(Object.assign(document.createElement("style"), { textContent: ${JSON.stringify(tileCss(tile))} }));
  const name = Object.assign(document.createElement("p"), { className: "tile-name" });
  name.append(Object.assign(document.createElement("img"), { src: "icons/favicon.svg", alt: "" }), "Instead");
  document.body.prepend(name);
  await name.querySelector("img").decode();` : ""}
  suggestions.splice(0, suggestions.length, ${JSON.stringify(tile?.text ?? SUGGESTION)});
  current = -1;
  show();
  const hue = document.querySelector('#params [name="h"]');
  hue.value = ${HUE};
  hue.dispatchEvent(new Event("input"));
  ${SEEDED_RANDOM}
  Math.random(); // the hue's turn; the page's hue comes from the slider
  background.newArc();
  ${hideLabel ? `document.querySelectorAll("#next mask text, #next mask path").forEach((e) => e.remove());` : ""}
})()`;

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
      const body = readFileSync(join(SITE, path || "index.html"));
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
  const scripts = page === "options.html" ? [FAKE_EXTENSION, SEEDED_RANDOM] : [];
  const added = [];
  for (const source of scripts) added.push((await send("Page.addScriptToEvaluateOnNewDocument", { source })).identifier);
  const loaded = next("Page.loadEventFired");
  await send("Page.navigate", { url: `${origin}/${page}` });
  await loaded;
  for (const identifier of added) await send("Page.removeScriptToEvaluateOnNewDocument", { identifier });

  const setUp = page === "options.html" ? SET_UP_SETTINGS : SET_UP_MAIN(image);
  const result = await send("Runtime.evaluate", { expression: setUp, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(`${image.out}: ${result.exceptionDetails.exception?.description}`);
  await send("Runtime.evaluate", {
    expression: "document.fonts.ready.then(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))",
    awaitPromise: true,
  });
  await sleep(300); // the cut-out button places its label after layout settles

  const { data } = await send("Page.captureScreenshot", { format: "png" });
  return Buffer.from(data, "base64");
}

// Above this, two images look the same (PSNR in dB; identical is infinite).
const SAME_PSNR = 60;

// Scales the supersampled capture down to the image's size (`scale` times its
// page size) and saves it, unless it looks the same as the saved one.
// Resolves to whether the file changed.
function save(png, { out, width, height, scale }) {
  const file = join(ROOT, out);
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

execFileSync("sh", [join(ROOT, "scripts/build-extension.sh")], { stdio: "ignore" });
const server = await serve();
const origin = `http://127.0.0.1:${server.address().port}`;
const chrome = await openChrome();
try {
  await chrome.send("Page.enable");
  await chrome.send("Runtime.enable");
  for (const image of IMAGES) {
    const png = await capture(chrome, origin, image);
    console.log(`${save(png, image) ? "Updated" : "Unchanged"} ${image.out}`);
  }
} finally {
  await chrome.close();
  server.close();
}
