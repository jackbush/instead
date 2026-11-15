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

The toolbar button opens the settings, which save as you go:

- **Sites to redirect:** one-click checkboxes for Facebook, Instagram, Reddit, TikTok, YouTube, Twitter/X and LinkedIn (on by default), and a group of news sites, then any other sites, one per line. Ticking a site that isn't on by default asks the browser for access to it.
- **Always allowed:** a checkbox for direct messages on redirected sites, such as facebook.com/messages, and a list of other pages, as the start of an address, such as `reddit.com/r/name`.
- **Suggestions**, as below.

## Suggestions

The default suggestions are in `suggestions.txt`, one per line. A line can include Markdown links: `Listen to [Dharmapunx](https://www.dharmapunxnyc.com/)`.

The website always reads this file. The extension copies it on install, and from then on uses the list in its settings; Reset to defaults copies it again.

## Build and distribution

Build the extension from the repo root:

```bash
sh scripts/build-extension.sh
```

This makes a build for each browser, `dist/chrome/` and `dist/firefox/`, from the page files at the root and the files in `extension/`, each with only its browser's manifest keys. Their zips, `dist/instead-chrome.zip` and `dist/instead-firefox.zip`, are what you upload to each store.

To install it from the build:

- **Chrome:** open `chrome://extensions`, turn on Developer mode, choose Load unpacked, and pick `dist/chrome`.
- **Firefox:** open `about:debugging#/runtime/this-firefox`, choose Load Temporary Add-on, and pick `dist/firefox/manifest.json`. It's removed when Firefox restarts; to keep it, use Firefox Developer Edition: set `xpinstall.signatures.required` to false in `about:config`, then install `dist/instead-firefox.zip` from `about:addons` with Install Add-on From File. Or have Mozilla sign it for free as an unlisted add-on. If settings ask for permission under the sites, click Allow.

Instead will be available soon on [Firefox Add-ons](https://addons.mozilla.org/en-GB/firefox/addon/instead-do-this/) and the [Chrome Web Store](https://chromewebstore.google.com/detail/pjlabllieiaoigjcolbkjafijbgomeoh). To check or sign the Firefox build with Mozilla's `web-ext` tool, use Node 22; it crashes on Node 24.

## Running locally and editing the page

Serve the repo root:

```bash
python3 -m http.server 8765
```

Then [open localhost:8765](http://localhost:8765).

Press `\` to show or hide the colour settings. The primary hue is random on each load and each new suggestion, and every other colour is derived from it. Defaults for the colours and the gradient are at the top of `background.js`.

Where things live:

- `index.html`, `site.js` and `site/`: the marketing site and its screenshots
- `demo.html` and `app.js`: the suggestion page, which the extension opens and the site shows as a live demo
- `background.js` and `okhsl.js`: the gradient and colour maths
- `brand.css`: shared colour fallbacks, line weight, warning icon and pill buttons
- `cutout.js`: buttons whose label is cut out of the pill
- `extension/`: the manifest, redirect rules, in-page watcher and settings page
- `fonts/` and `icons/`: bundled fonts and the hand icon

Changes to the page show on the website straight away. For the extension, rebuild, then reload it from `chrome://extensions` or `about:debugging`.

## Images

All the images are rendered from the built extension in headless Chrome: the link-preview image (`og-image.jpg`), the cover (`.github/cover.jpg`), the store images (`store/`: two screenshots and the Chrome Web Store's small and marquee promo tiles, all in one colour) and the website's screenshots (`site/`, each in its own colour):

```bash
node scripts/capture-images.mjs
```

It needs Node 22 or later, ffmpeg and Chrome. An image is only replaced when the new render looks different.

A pre-commit hook in `.githooks/` runs it whenever a commit changes the page, settings or suggestions, and adds any images that changed. Turn it on once per clone:

```bash
git config core.hooksPath .githooks
```

## Licence

MIT; see [LICENSE](LICENSE). The bundled fonts are under the SIL Open Font License (see [fonts/README.md](fonts/README.md)).
