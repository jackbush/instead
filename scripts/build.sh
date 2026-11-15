#!/bin/sh
# Builds everything into dist/, each output flat so its pages load their files
# by bare name:
#   dist/chrome, dist/firefox  the extension: src/shared, src/page and
#                              src/extension, each manifest keeping only its
#                              browser's keys, zipped as dist/instead-<browser>.zip
#   dist/site                  the website: src/shared, src/page and website
set -eu

root=$(cd "$(dirname "$0")/.." && pwd)
cd "$root"
rm -rf dist/chrome dist/firefox dist/site dist/instead-chrome.zip dist/instead-firefox.zip

# assemble <out> <dir>...: copies each dir's contents into <out>.
assemble() {
  out=$1
  shift
  mkdir -p "$out"
  for dir in "$@"; do cp -R "$dir/." "$out/"; done
  find "$out" -name .DS_Store -delete
}

for browser in chrome firefox; do
  out="dist/$browser"
  assemble "$out" src/shared src/page src/extension

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

assemble dist/site src/shared src/page website

echo "Built dist/chrome and dist/firefox (zipped beside them) and dist/site"
