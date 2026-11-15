# Todo

## Audit, 15 November 2026

From the scheduled repo audit. Small findings were fixed in the working tree at the same time and are not listed. Line numbers are as of that working tree. The store listings are in review: do not change manifest permissions or the version until that ends.

How to check things: `sh scripts/build-extension.sh` builds `dist/`; `python3 -m http.server` at the repo root serves the site; `scripts/capture-images.mjs` shows how to drive headless Chrome over CDP and how to fake the extension API for `options.html`.

### 1. Code review

- [ ] **"Take me to …" names the wrong thing for short domains** (medium, S)
  - What: `offerOriginal()` in `app.js:108-111` guesses the registrable domain by label length ("two-letter TLD and a second label of three letters or fewer means a three-part suffix"). `https://www.nu.nl/` and `https://www.dr.dk/` give "Take me to Www"; so will www.svt.se, www.nrk.no, www.orf.at. A numeric host gives "Take me to 0".
  - Why: the button is the product's one way through, and it reads as broken for sites users add themselves.
  - Done when: the label is right for www.nu.nl, www.dr.dk, www.bbc.co.uk, news.com.au, old.reddit.com, x.com and the BRAND_NAMES entries. Either use a short set of known second-level labels (co, com, org, net, gov, ac, edu) in place of the length test, or in the extension take the name from the listed site the URL matched. Verify by opening `demo.html?from=<url>` and waiting five seconds.
  - **Delegate to:** Sonnet 5.5 (claude-sonnet-5-5), a scoped fix with clear cases.

- [ ] **The suggestion page can come up blank when something fails** (medium, S)
  - What: `app.js` has no error handling on its start-up path. `createBackground()` throws if a shader fails to compile (`background.js:138`), and it is called at the top level of `app.js:136`, so nothing after it runs and no suggestion loads. `loadSuggestions()` (`app.js:13-18`, called at `app.js:161`) has no catch: a `storage.sync` error or a failed fetch leaves an empty heading. An empty `suggestions.txt` makes `render(undefined)` throw.
  - Why: a redirected tab with ink text on nothing looks like the extension broke the site.
  - Done when: a failing background falls back to the flat `--primary` canvas (as it already does without WebGL), a failed storage read falls back to the bundled file, and the page always shows a suggestion. Verify by making `getContext` return a context whose `getShaderParameter` is false, and by making `storage.sync.get` reject, using a fake API as in `scripts/capture-images.mjs`.
  - **Delegate to:** Sonnet 5.5 (claude-sonnet-5-5), ordinary error handling in two files.

- [ ] **Direct-message pages are missing for Twitter, and may be stale for X** (low, S)
  - What: `MESSAGE_PAGES` in `extension/settings.js:35-44` has `x.com/messages` but not `twitter.com/messages`, although the Twitter/X preset redirects both domains. A twitter.com messages link is redirected even with "Direct messages" ticked. X has also been moving DMs to a chat address; check what it uses now, signed in.
  - Done when: each preset site with DMs has its current paths listed and `isException()` returns true for them.
  - **Delegate to:** Sonnet 5.5 (claude-sonnet-5-5), needs checking live sites, then a one-line edit.

- [ ] **Clearing every suggestion leaves settings and the page disagreeing** (low, S)
  - What: `saveLists()` (`extension/settings.js:77`) saves an empty array, and `getLists()` returns it, so settings shows an empty box. `loadSuggestions()` (`app.js:15`) treats an empty list as missing and shows the bundled defaults. Nothing tells the user.
  - Done when: one behaviour is chosen and visible: a note under the field saying the defaults are used, or the defaults put back in the box.
  - **Delegate to:** Sonnet 5.5 (claude-sonnet-5-5), small, needs a product choice first.

- [ ] **`expire()` runs in full on every tab close** (low, S)
  - What: `extension/worker.js:176` queues `expire(tabId)` for every tab the browser closes. Each run wakes the worker, reads the session rules, rewrites `storage.session` and touches the alarm, even when there are no let-throughs.
  - Done when: `expire()` returns early when `bypasses` is empty and no session rules exist, with let-through expiry still working.
  - **Delegate to:** Sonnet 5.5 (claude-sonnet-5-5), a small change in state-handling code that has no tests.

- [ ] **The "activities" migration serves no public install** (low, S)
  - What: `extension/worker.js:151-157` moves suggestions from an older `activities` key. 1.0.0 is the first published version, so only development installs ever had that key.
  - Done when: Jack confirms none of his own installs still hold `activities`, then the read, the move and the comment are removed.
  - **Delegate to:** Haiku 5.5 (claude-haiku-5-5), a mechanical deletion once confirmed.

### 2. Security

- [ ] **Any website can frame or probe the suggestion page** (medium, M)
  - What: `extension/manifest.json:45-50` makes `demo.html` web-accessible to `*://*/*`. That is needed for the redirect, but it also means any page can (a) detect that Instead is installed in Chrome, where the extension ID is fixed, and (b) put `demo.html?from=https://www.reddit.com/…` in an iframe and overlay it. A click on "Take me to …" inside the frame is accepted by the worker (`extension/worker.js:141-143` checks only that `sender.url` starts with the page's address), which adds a 15-minute let-through and navigates the top tab; a click on "I'm on it" closes the embedding tab (`app.js:73-76`).
  - Why: the harm is small (it defeats the user's own nudge, or closes a tab), but it is a page outside the extension driving extension actions.
  - Done when: a framed copy of the page cannot trigger either action. No manifest change is needed for the first step: have the worker require `sender.frameId === 0`, and have `app.js` skip `offerOriginal` and the tab close when `top !== self`. After the store review, consider `content_security_policy.extension_pages` with `frame-ancestors 'none'`, and whether `use_dynamic_url` still allows the DNR redirect in Chrome. Verify in both browsers with the real extension loaded and a local page that frames the extension URL.
  - **Delegate to:** Opus 5.5 (claude-opus-5-5), cross-browser extension behaviour that has to be tested for real.

- [ ] **The website's demo page is an open redirect** (low, S)
  - What: on the website, `demo.html?from=<any http(s) URL>` shows "Take me to <name>" after five seconds and the button sets `location.href` to that URL (`app.js:119-120`, `130-132`). The label shows one label of the host, not the whole host.
  - Why: a link on jackbush.github.io can be used to dress up a link to somewhere else.
  - Done when: outside the extension, `from` is honoured only for the default sites (enough for `site/take-me-to.jpg` in `scripts/capture-images.mjs:62`), or is ignored. The extension's behaviour is unchanged.
  - **Delegate to:** Sonnet 5.5 (claude-sonnet-5-5), a scoped change with one consumer to keep working.

- [ ] **The site pages have no content security policy** (low, S)
  - What: `index.html`, `demo.html` and `privacy.html` set none, and GitHub Pages cannot send headers. Everything is same-origin already; `privacy.html:84` has one inline script and the pages use inline `<style>`.
  - Done when: each page has a `<meta http-equiv="Content-Security-Policy">` limiting scripts, fonts, images and connections to `'self'` (styles need `'unsafe-inline'` or moving to files), the inline script in `privacy.html` is moved to a file, and all three pages load with no console CSP errors. Check that the meta tag in `demo.html` does not conflict with the extension's own policy.
  - **Delegate to:** Sonnet 5.5 (claude-sonnet-5-5), mechanical but must be checked in the browser and the extension.

### 3. Accessibility

- [ ] **The hero text changes every 4.2 seconds and cannot be paused** (high, M)
  - What: `site.js:51-63` swaps the hero sentence and the "You were about to open …" line (`index.html:242-243`) on a timer for as long as the page is open. It stops only under `prefers-reduced-motion`.
  - Why: WCAG 2.2.2 Pause, Stop, Hide (level A): content that updates automatically, starts by itself and runs beside other content needs a way to pause, stop or hide it. A system setting does not count as that mechanism. The `<h1>` also names the hero section (`aria-labelledby`), so the section's name keeps changing.
  - Done when: a visitor can stop the cycling with the keyboard and a pointer (a visible pause control, or the cycle ending after a few sentences), the control has an accessible name and state, and reduced motion still shows a single sentence. This needs a design decision; see DESIGN.md "Cycling Text".
  - **Delegate to:** Sonnet 5.5 (claude-sonnet-5-5), small implementation once the design is chosen.

- [ ] **Validation notes in settings are not announced** (medium, S)
  - What: `setNotes()` (`extension/options.js:78-87`) fills the `<ul class="note">` lists (`extension/options.html:37-38`, `50`, `57`) when a field is left, after focus has moved on. The lists are not live regions, so a screen-reader user is not told a line was left out or that a list is too long to save. The corner pill is a live region but says only "Saved".
  - Why: WCAG 3.3.1 Error Identification (A) and 4.1.3 Status Messages (AA).
  - Done when: a dropped line or an over-long list is announced when it happens, without moving focus, and the "Allow" access note likewise. Keep the lists in the DOM and change their contents rather than toggling `hidden` on the live region itself. Verify with VoiceOver in Chrome and Firefox.
  - **Delegate to:** Sonnet 5.5 (claude-sonnet-5-5), a scoped change that needs a screen-reader check.

- [ ] **A single-key shortcut is always on, on the suggestion page** (low, S)
  - What: `app.js:157-159` toggles the colour panel on a bare `\` anywhere on the page, in the extension as well as on the website.
  - Why: WCAG 2.1.4 Character Key Shortcuts (A): a one-character shortcut must be remappable, switchable off, or active only on focus.
  - Done when: the panel needs a modifier (and README.md:57 says so), or is only reachable outside the extension build.
  - **Delegate to:** Haiku 5.5 (claude-haiku-5-5), a one-line change plus the README line, once the key is chosen.

- [ ] **The suggestion page has no main landmark, and a second `<h1>`** (low, S)
  - What: in `demo.html:122-131` the heading and buttons sit directly in `<body>`, which is the layout grid, and the hidden colour panel has its own `<h1>`.
  - Why: WCAG 1.3.1 Info and Relationships (A), as a best practice: one main landmark, one top-level heading.
  - Done when: the suggestion and its actions are inside `<main>` with the layout unchanged at every width (move the grid onto `<main>`; compare screenshots before and after, and re-run `scripts/capture-images.mjs` to confirm no image changes), and the panel's heading is an `<h2>`.
  - **Delegate to:** Sonnet 5.5 (claude-sonnet-5-5), a layout-sensitive markup change with a clear pixel check.

### 4. Repository structure

- [ ] **GitHub Pages publishes the whole repository** (low, S to M)
  - What: the site is served from the repo root, so README.md, PRODUCT.md, DESIGN.md, `scripts/`, `store/` and the extension source are all public pages under jackbush.github.io/instead/, and with no `.nojekyll` file Pages runs Jekyll over them on every push. Nothing private is exposed, since the repo is public anyway.
  - Done when: at least a `.nojekyll` file is added and the live site still loads fonts, images and `suggestions.txt`. A fuller fix is a Pages workflow that uploads only the site files.
  - **Delegate to:** Sonnet 5.5 (claude-sonnet-5-5), a small deploy change that must be checked on the live site.

- [ ] **DESIGN.md describes a screenshot outline the page does not have** (low, S)
  - What: `DESIGN.md:147` and `DESIGN.md:197` say screenshots carry a shadow of ink at 55% and a 1px inset outline of ink at 14%. `.shot` in `index.html:136-143` has a single `rgb(17 18 20 / 0.4)` shadow and no outline, which also breaks the document's own One Hue Rule (no hard-coded colours).
  - Done when: Jack says which is intended, and the other is changed to match.
  - **Delegate to:** Haiku 5.5 (claude-haiku-5-5), a two-line edit once decided.

### 5. Quality

- [ ] **The URL and list logic has no tests** (high, M)
  - What: there are no tests anywhere. The riskiest code is pure and easy to test: `parse`, `normaliseSite`, `normaliseException`, `siteFor`, `isException` and `exceptionFilter` in `extension/settings.js:84-146`, where `isException()` must agree with what the DNR filter `||<exception>^` matches; and `render()` in `app.js:24-37`, which turns user text into links.
  - Why: a mistake here redirects pages that should be allowed, or lets through ones that should not, and nothing would catch it.
  - Done when: `node --test` runs a suite with no dependencies (settings.js imports cleanly in Node; `ext` is just undefined) covering: scheme and `www.` stripping, trailing dots and slashes, punycode, user-info and ports, IP-like input such as `123` (which now saves as `0.0.0.123`), `* ^ |` rejection, subdomain matching, the prefix boundary (`/r/name` allows `/r/name/x` and not `/r/names`), case, and queries. `render()` needs moving somewhere importable, or a small DOM stub.
  - **Delegate to:** Sonnet 5.5 (claude-sonnet-5-5), well-specified tests for pure functions.

- [ ] **Nothing checks the real extension end to end** (medium, L)
  - What: `scripts/capture-images.mjs:80-87` renders the pages with a fake extension API, and current branded Chrome ignores `--load-extension`, so the worker's redirect rule, let-through, expiry and the in-page watcher are only ever tested by hand.
  - Done when: one script loads `dist/chrome` in Chrome for Testing (or `dist/firefox` through `web-ext run`), opens a listed site, and asserts: it lands on `demo.html?from=…`; an always-allowed page loads; "Take me to …" lets that tab through and another tab is still redirected; a pushState move from an allowed page to a redirected one is caught.
  - **Delegate to:** Opus 5.5 (claude-opus-5-5), browser automation of an MV3 extension is fiddly to get reliable.

- [ ] **No CI** (medium, S)
  - What: `.github/` has no workflows; the build and Mozilla's linter run only by hand.
  - Done when: a workflow on push and pull request runs the tests from the first task, `sh scripts/build-extension.sh`, and `web-ext lint` on `dist/firefox` under Node 22 (README.md:45 notes it crashes on Node 24). Give it `permissions: contents: read` and pin every action to a commit SHA.
  - **Delegate to:** Sonnet 5.5 (claude-sonnet-5-5), a standard workflow with stated constraints.

- [ ] **The same helpers are written two and three times** (low, S)
  - What: Fisher–Yates `shuffle` is in `app.js:51-58` and `site.js:22-28`. Splitting `suggestions.txt` into lines is in `app.js:17`, `site.js:52` and `extension/settings.js:56`. The Markdown-link pattern is in `app.js:28` and, in a different form, `site.js:33`, so the two can disagree about what a link is.
  - Done when: one small shared script holds them, both pages load it, `scripts/build-extension.sh:16` copies it and `.githooks/pre-commit:11` watches it, and the images from `scripts/capture-images.mjs` are unchanged.
  - **Delegate to:** Sonnet 5.5 (claude-sonnet-5-5), a small refactor across the site, build and hook.
