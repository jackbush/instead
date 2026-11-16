![“Draw something that makes you feel joy” in large serif type on a soft lilac-to-cyan gradient, above “I’m on it” and “Suggest something else” buttons.](.github/cover.jpg)

# Instead

Fun, free and fulfilling activities to do instead of falling into a screen.

Instead is a browser extension for Chrome and Firefox. Open a site on your list and you land on a page suggesting something better to do. Its website, with a live demo, is served from this repo on GitHub Pages.

Instead has no server and collects nothing. Its settings live in your browser, which syncs them between your devices if you've turned on syncing. The [privacy page](https://jackbush.github.io/instead/privacy.html) (`privacy.html`) has the details.

## What the extension does

- **Redirects** the sites on your list, before the browser sends anything to them. Facebook, Instagram, Reddit, TikTok, YouTube, Twitter/X and LinkedIn are on the list by default, subdomains included.
- **Suggests something else to do.** "I'm on it" closes the tab; "Suggest something else" deals the next suggestion from a shuffled deck, so every one shows before any repeats.
- **Offers a way through.** After five seconds a "Take me to …" link appears. It lets that tab onto the site for 15 minutes, or until the tab closes.
- **Watches in-page navigation.** These sites change pages without reloading, so a small script on them catches moves from an allowed page to a redirected one.

The first install opens the settings, with a welcome; after that the toolbar button opens them. They save as you go:

- **Sites to redirect:** one-click checkboxes for Facebook, Instagram, Reddit, TikTok, YouTube, Twitter/X and LinkedIn (on by default), and a group of news sites, then Custom, which shows a field for any other sites, one per line. Ticking a site that isn't on by default asks the browser for access to it.
- **Always allowed:** a checkbox for direct messages on redirected sites, and Allow specific pages, which shows a field for pages as the start of an address, such as `reddit.com/r/name`.
- **Suggestions:** a checkbox for each pack (all on by default), and Custom, which shows a field for your own, one per line.

Each field sits behind its checkbox, off until it has something in it. Unticking one keeps its lines but stops using them.

## Suggestions

The suggestions are in `src/shared/suggestions.txt`, one per line, in packs: each pack starts with a `# Name` line. [SUGGESTIONS.md](SUGGESTIONS.md) is the guide to writing them. A line can include Markdown links: `Listen to [Dharmapunx](https://www.dharmapunxnyc.com/)`.

The website and the extension both read this file. The extension's settings store only the names of the packs turned off and the user's own suggestions (with whether they're on), so a new or changed suggestion reaches everyone with the next version. `list.html`, unlinked from the website, lists every suggestion by pack.

## Build and distribution

Build everything (it needs only Node 22 or later and `zip`; there are no dependencies to install):

```bash
npm run build
```

This makes three flat builds in `dist/`: one for each browser, `dist/chrome/` and `dist/firefox/`, each with only its browser's manifest keys, and the website, `dist/site/`. Their zips, `dist/instead-chrome.zip` and `dist/instead-firefox.zip`, are what you upload to each store. The website is published from `dist/site/` by `.github/workflows/pages.yml` on every push to main.

To install it from the build:

- **Chrome:** open `chrome://extensions`, turn on Developer mode, choose Load unpacked, and pick `dist/chrome`.
- **Firefox:** open `about:debugging#/runtime/this-firefox`, choose Load Temporary Add-on, and pick `dist/firefox/manifest.json`. It's removed when Firefox restarts; to keep it, use Firefox Developer Edition: set `xpinstall.signatures.required` to false in `about:config`, then install `dist/instead-firefox.zip` from `about:addons` with Install Add-on From File. Or have Mozilla sign it for free as an unlisted add-on. If settings ask for permission under the sites, click Allow.

Instead will be available soon on [Firefox Add-ons](https://addons.mozilla.org/en-GB/firefox/addon/instead-do-this/) and the [Chrome Web Store](https://chromewebstore.google.com/detail/pjlabllieiaoigjcolbkjafijbgomeoh). `npm run lint` builds and checks the Firefox build with Mozilla's `web-ext` tool; like signing with it, that needs Node 22, as it crashes on Node 24.

## Running locally and editing the page

Build and serve the website:

```bash
npm run serve
```

Then [open localhost:8000](http://localhost:8000). Run it again after a change.

To try the extension's settings without installing it, serve its pages with a stand-in for the extension API (`scripts/fake-extension.js`):

```bash
npm run preview
```

Then [open the settings](http://localhost:8001/options.html?welcome). They're kept in the browser's local storage for that address, and the suggestion page at [localhost:8001/demo.html](http://localhost:8001/demo.html) uses them. The pages are served straight from `src/`, so reload to see an edit. Nothing is redirected: that needs the real extension.

On the website, press `\` to show or hide the colour settings (the extension has no such key). The primary hue is random on each load and each new suggestion, and every other colour is derived from it. Defaults for the colours and the gradient are at the top of `src/shared/background.js`.

Where things live:

- `src/page/`: the suggestion page (`demo.html`, `app.js`), which the extension opens and the website shows as a live demo, and the list of every suggestion (`list.html`, `list.js`)
- `src/extension/`: the manifest, redirect rules (`worker.js`), in-page watcher (`content.js`) and settings page
- `src/shared/`: what both need
  - `background.js` and `okhsl.js`: the gradient and colour maths
  - `brand.css`: shared colour fallbacks, line weight, warning icon and pill buttons
  - `cutout.js`: buttons whose label is cut out of the pill
  - `settings.js`: the default sites and the URL and list logic
  - `shared.js`: the shuffle, line and pack parsing, and Markdown-link parsing
  - `suggestions.txt`, `fonts/` and `icons/`
- `website/`: the marketing site, its privacy page, link-preview image and screenshots (`shots/`)
- `test/`: unit tests; `scripts/`: the build, image renders and end-to-end test

Each build copies its folders' contents into one flat folder, so pages load every file by bare name (`brand.css`, `./shared.js`). After a change, rebuild; for the extension, then reload it from `chrome://extensions` or `about:debugging`.

Run the unit tests with `npm test` (no dependencies).

To check the extension end to end (the redirect, an always-allowed page, "Take me to …", and the in-page watcher), run it in [Chrome for Testing](https://developer.chrome.com/blog/chrome-for-testing/), which still loads unpacked extensions. The script builds into a temp dir and points the listed sites at a local server, so it leaves `dist/` alone and stays offline. It needs Node 22 or later and openssl:

```bash
npx @puppeteer/browsers install chrome@stable --path ~/.cache/chrome-for-testing
CHROME_FOR_TESTING="<the path it prints>" npm run e2e
```

## Images

All the images are rendered from the built extension in headless Chrome: the link-preview image (`website/og-image.jpg`), the cover (`.github/cover.jpg`), the store images (`store/`: two screenshots and the Chrome Web Store's small and marquee promo tiles, all in one colour) and the website's screenshots (`website/shots/`, each in its own colour):

```bash
npm run images
```

It needs Node 22 or later, ffmpeg and Chrome. An image is only replaced when the new render looks different. It renders two images first (a page with its "Take me to" link, and the settings page); if neither changed, it keeps the rest as they are. `npm run images -- --all` renders every image regardless.

When the rest are rendered, so is the cover video for [jackbush.github.io](https://jackbush.github.io), which takes a few minutes. It's saved in that repo (`src/assets/covers/instead.mp4`, with its first frame as `instead.jpg`), which it expects next to this one; set `HOMEPAGE` to its path if it's somewhere else. Commit it there yourself, as the hook only adds images in this repo.

A pre-commit hook in `.githooks/` runs it whenever a commit changes the page, settings or suggestions, and adds any images that changed. Turn it on once per clone:

```bash
git config core.hooksPath .githooks
```

## Licence

MIT; see [LICENSE.md](LICENSE.md). The bundled fonts are under the SIL Open Font License (see [src/shared/fonts/README.md](src/shared/fonts/README.md)).
