# Todo

The store listings are in review: do not change manifest permissions or the version until that ends.

- [ ] **Turn on the Pages workflow.** Settings → Pages → Source: "GitHub Actions", after `.github/workflows/pages.yml` is on main.
- [ ] **Block framing in the manifest once the store review ends.** `frame-ancestors 'none'` in `content_security_policy.extension_pages` was tested in Chrome 157 and Firefox 160: it blocks framed copies and the redirect still works. `use_dynamic_url` breaks the redirect as the rules are built today, so leave it off.
- [ ] **Regenerate `.impeccable/design.json`**, which is older than DESIGN.md.
- [ ] **Group the files into `src/shared`, `src/page`, `src/extension` and `website/`**, with one build producing dist/chrome, dist/firefox and dist/site, and Pages uploading dist/site. This removes the explicit Pages file list and the `./shared.js` vs `./extension/shared.js` path switch in app.js.
