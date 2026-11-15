// Checks the built Chrome extension end to end in Chrome for Testing:
//   1. a listed site lands on demo.html?from=<url>, and the site gets no request
//   2. an always-allowed page (a direct-message page, once that setting is on) loads
//   3. a pushState move from that page to a redirected one is caught
//   4. "Take me to …" lets its tab through while another tab is still redirected
//   5. closing the let-through tab removes its rule
// The listed sites resolve to a local server (--host-resolver-rules), so
// nothing reaches the internet while the redirect rules still see the real
// host names. The server uses a throwaway self-signed certificate over HTTPS,
// since reddit.com is on Chrome's HSTS preload list. The extension is built
// from a copy of the repo in a temp dir.
//
//   CHROME_FOR_TESTING=/path/to/chrome node scripts/e2e-extension.mjs
//
// Needs Node 22+, openssl and Chrome for Testing (branded Chrome won't load unpacked
// extensions from the command line or over CDP).

import { execFileSync, spawn } from "node:child_process";
import { once } from "node:events";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:https";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const CHROME = process.env.CHROME_FOR_TESTING;
const PORT = 8706;
const SITE = "www.reddit.com"; // on the default list, with host access from the manifest
const ALLOWED = `https://${SITE}/chat`; // a direct-message page, allowed by the allowMessages setting
const LISTED = `https://${SITE}/r/popular`;

if (!CHROME || !existsSync(CHROME)) {
  console.error(`Set CHROME_FOR_TESTING to a Chrome for Testing binary${CHROME ? ` (nothing at ${CHROME})` : ""}.
Install one with:
  npx @puppeteer/browsers install chrome@stable --path ~/.cache/chrome-for-testing`);
  process.exit(2);
}

// Builds dist/chrome inside a copy of the repo, so the repo's own dist/ is left alone.
function build(dir) {
  const skip = new Set([".git", "dist", "node_modules"]);
  cpSync(ROOT, dir, { recursive: true, filter: (src) => !skip.has(basename(src)) });
  execFileSync("sh", [join(dir, "scripts/build.sh")], { stdio: "ignore" });
  return join(dir, "dist/chrome");
}

// Stands in for every listed site: a plain page, and a log of what was asked for.
function serve(dir) {
  const [key, cert] = [join(dir, "key.pem"), join(dir, "cert.pem")];
  execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1",
    "-subj", `/CN=${SITE}`, "-keyout", key, "-out", cert], { stdio: "ignore" });
  const requests = [];
  const server = createServer({ key: readFileSync(key), cert: readFileSync(cert) }, (req, res) => {
    if (req.url === "/favicon.ico") return res.writeHead(404).end();
    requests.push(`https://${req.headers.host}${req.url}`);
    res.writeHead(200, { "content-type": "text/html" });
    res.end(`<!doctype html><title>stub</title><p id="stub">${req.url}</p>`);
  });
  return new Promise((resolve) => server.listen(PORT, "127.0.0.1", () => resolve({ server, requests })));
}

// Chrome over its debugging pipe (fd 3 in, fd 4 out, NUL-separated JSON),
// which Extensions.loadUnpacked needs. Sessions are flat: one connection,
// each message tagged with its target's sessionId.
async function openChrome(profile) {
  const chrome = spawn(CHROME, [
    "--headless=new", "--remote-debugging-pipe", "--enable-unsafe-extension-debugging",
    `--user-data-dir=${profile}`, "--no-first-run", "--no-default-browser-check",
    "--disable-background-networking", "--disable-component-update", "--disable-sync",
    // Accept the stand-in's certificate, and keep everything else offline.
    "--ignore-certificate-errors",
    `--host-resolver-rules=MAP reddit.com 127.0.0.1:${PORT}, MAP *.reddit.com 127.0.0.1:${PORT}, MAP * ~NOTFOUND, EXCLUDE 127.0.0.1`,
    "about:blank",
  ], { stdio: ["ignore", "ignore", "ignore", "pipe", "pipe"] });
  const exited = once(chrome, "exit");
  const [input, output] = [chrome.stdio[3], chrome.stdio[4]];
  output.setEncoding("utf8");

  let id = 0;
  const pending = new Map();
  let buffer = "";
  output.on("data", (chunk) => {
    buffer += chunk;
    let end;
    while ((end = buffer.indexOf("\0")) >= 0) {
      const message = JSON.parse(buffer.slice(0, end));
      buffer = buffer.slice(end + 1);
      pending.get(message.id)?.(message);
      pending.delete(message.id);
    }
  });
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    pending.set(++id, (m) => (m.error ? reject(new Error(`${method}: ${m.error.message}`)) : resolve(m.result)));
    input.write(`${JSON.stringify({ id, method, params, sessionId })}\0`);
  });
  const close = async () => {
    send("Browser.close").catch(() => {});
    const timer = setTimeout(() => chrome.kill("SIGKILL"), 5000);
    await exited; // Chrome writes to its profile until it exits
    clearTimeout(timer);
  };
  return { send, close };
}

// A tab, attached for evaluating and clicking in it.
async function openTab(send, url = "about:blank") {
  const { targetId } = await send("Target.createTarget", { url });
  const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
  const evaluate = async (expression) => {
    const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }, sessionId);
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result.value;
  };
  return {
    targetId,
    evaluate,
    url: async () => (await send("Target.getTargetInfo", { targetId })).targetInfo.url,
    navigate: (to) => send("Page.navigate", { url: to }, sessionId),
    // A real mouse click in the middle of the element.
    click: async (selector) => {
      const { x, y } = await evaluate(`(() => {
        const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      })()`);
      for (const type of ["mousePressed", "mouseReleased"]) {
        await send("Input.dispatchMouseEvent", { type, x, y, button: "left", clickCount: 1 }, sessionId);
      }
    },
    close: () => send("Target.closeTarget", { targetId }),
  };
}

// Resolves to check()'s first truthy result, polling; a check that throws
// (a page mid-navigation, say) counts as not yet.
async function waitFor(what, check, timeout = 10000) {
  const until = Date.now() + timeout;
  let last;
  for (;;) {
    try {
      last = await check();
      if (last) return last;
    } catch (e) {
      last = e.message;
    }
    if (Date.now() > until) throw new Error(`Timed out waiting for ${what} (last: ${JSON.stringify(last)})`);
    await new Promise((r) => setTimeout(r, 50));
  }
}

function pass(what) {
  console.log(`ok - ${what}`);
}

const work = mkdtempSync(join(tmpdir(), "instead-test-"));
let server, chrome;
let cleaning;
const cleanUp = () => (cleaning ??= (async () => {
  await chrome?.close();
  server?.close();
  rmSync(work, { recursive: true, force: true });
})());
// Ctrl-C stops Chrome and removes the temp dir too.
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => cleanUp().then(() => process.exit(130)));
}
try {
  let requests;
  ({ server, requests } = await serve(work));
  chrome = await openChrome(join(work, "profile"));
  const { send } = chrome;
  const { id } = await send("Extensions.loadUnpacked", { path: build(join(work, "repo")) });
  const page = `chrome-extension://${id}/demo.html`;
  const pageFor = (url) => `${page}?from=${url}`;

  // An extension page for reading and changing the extension's state.
  const control = await openTab(send, page);
  await waitFor("the install to set up the redirect rule and the watcher", () => control.evaluate(`(async () => {
    const rules = await chrome.declarativeNetRequest.getDynamicRules();
    const scripts = await chrome.scripting.getRegisteredContentScripts();
    return rules.some((r) => r.action.type === "redirect") && scripts.some((s) => s.id === "watch-url");
  })()`));

  const tabA = await openTab(send);
  await tabA.navigate(LISTED);
  await waitFor(`${LISTED} to land on the suggestion page`, async () => (await tabA.url()) === pageFor(LISTED));
  if (requests.includes(LISTED)) throw new Error(`${LISTED} was requested before the redirect`);
  pass("a listed site lands on demo.html?from=<url> without being requested");

  await control.evaluate(`chrome.storage.sync.set({ allowMessages: true })`);
  await waitFor("the direct-message exception rules", () => control.evaluate(`(async () =>
    (await chrome.declarativeNetRequest.getDynamicRules()).some((r) => r.condition.urlFilter === "||reddit.com/chat^"))()`));
  const tabB = await openTab(send);
  await tabB.navigate(ALLOWED);
  await waitFor(`${ALLOWED} to load`, () => tabB.evaluate(`document.getElementById("stub")?.textContent === "/chat"`));
  pass("an always-allowed page loads");

  await tabB.evaluate(`history.pushState(null, "", "/r/popular")`);
  await waitFor("the watcher to catch the pushState move", async () => (await tabB.url()) === pageFor(LISTED));
  if (requests.includes(LISTED)) throw new Error(`${LISTED} was requested after the pushState move`);
  pass("a pushState move from an allowed page to a redirected one is caught");

  await waitFor('"Take me to Reddit" to appear', () => tabA.evaluate(
    `document.querySelector("#from.visible")?.textContent === "Take me to Reddit"`), 15000);
  await tabA.click("#from");
  await waitFor(`tab A to go through to ${LISTED}`, async () => (await tabA.url()) === LISTED
    && (await tabA.evaluate(`document.getElementById("stub")?.textContent === "/r/popular"`)));
  const tabC = await openTab(send);
  await tabC.navigate(LISTED);
  await waitFor(`another tab to ${LISTED} to be redirected`, async () => (await tabC.url()) === pageFor(LISTED));
  if (requests.filter((r) => r === LISTED).length !== 1) throw new Error(`${LISTED} was requested other than once`);
  pass('"Take me to …" lets its tab through while another tab is still redirected');

  await tabA.close();
  await waitFor("the let-through rule to go with its tab", () => control.evaluate(`(async () =>
    !(await chrome.declarativeNetRequest.getSessionRules()).length
    && !Object.keys((await chrome.storage.session.get("bypasses")).bypasses ?? {}).length)()`));
  pass("closing the let-through tab removes its rule");
} finally {
  await cleanUp();
}
