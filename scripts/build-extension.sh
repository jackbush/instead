#!/bin/sh
# Assembles the browser extension in dist/extension (load it unpacked in
# Chrome, or as a temporary add-on in Firefox via its manifest.json) and zips
# it to dist/instead.zip. The page files come from the repo root, which is
# also the website; everything in extension/ is added beside them.
set -eu

root=$(cd "$(dirname "$0")/.." && pwd)
out="$root/dist/extension"

rm -rf "$out" "$root/dist/instead.zip"
mkdir -p "$out"
cd "$root"
cp index.html app.js background.js okhsl.js cutout.js cutout.css suggestions.txt "$out/"
cp -R fonts icons "$out/"
cp -R extension/. "$out/"
find "$out" -name .DS_Store -delete

cd "$out"
zip -q -r -X ../instead.zip .
echo "Built $out and $root/dist/instead.zip"
