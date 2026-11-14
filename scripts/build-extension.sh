#!/bin/sh
# Builds the browser extension for Chrome and Firefox, in dist/chrome and
# dist/firefox, each zipped beside it (dist/instead-chrome.zip and
# dist/instead-firefox.zip). The page files come from the repo root, which is
# also the website; everything in extension/ is added beside them. Each build
# keeps only its browser's manifest keys.
set -eu

root=$(cd "$(dirname "$0")/.." && pwd)
cd "$root"
rm -rf dist/chrome dist/firefox dist/instead-chrome.zip dist/instead-firefox.zip

for browser in chrome firefox; do
  out="dist/$browser"
  mkdir -p "$out"
  cp index.html app.js background.js okhsl.js cutout.js cutout.css suggestions.txt "$out/"
  cp -R fonts icons "$out/"
  cp -R extension/. "$out/"
  find "$out" -name .DS_Store -delete

  node -e '
    const fs = require("fs");
    const [file, browser] = process.argv.slice(1);
    const m = JSON.parse(fs.readFileSync(file, "utf8"));
    if (browser === "chrome") {
      delete m.background.scripts;
      delete m.browser_specific_settings;
    } else {
      delete m.background.service_worker;
      delete m.minimum_chrome_version;
    }
    fs.writeFileSync(file, JSON.stringify(m, null, 2) + "\n");
  ' "$out/manifest.json" "$browser"

  (cd "$out" && zip -q -r -X "../instead-$browser.zip" .)
done
echo "Built dist/chrome and dist/firefox, zipped as dist/instead-chrome.zip and dist/instead-firefox.zip"
