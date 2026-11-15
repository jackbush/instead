# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

People who reflexively open social feeds (Facebook, Instagram, Reddit, TikTok) on a laptop or desktop browser and want a gentler nudge than a blocker.

## Product Purpose

Instead is a Chrome and Firefox extension. Opening a site on the user's list lands them on a page with one large suggestion of something fun, free and fulfilling to do instead. "I'm on it" closes the tab, another suggestion is a click away, and after five seconds a "Take me to …" link lets that tab through for 15 minutes. Success is the user choosing the suggestion more often than the feed.

## Positioning

Blockers say no. Instead suggests something better and leaves the choice with you. Free, open source, no data collected.

## Operating Context

- The suggestion page (`demo.html`) is shared by the extension and the website, where it runs as a live demo.
- Settings open from the toolbar button: sites to redirect (one-click presets, plus Custom for any others), always-allowed pages (direct messages, plus specific pages), and suggestions (packs, plus Custom for the user's own), each extra field behind its own checkbox, saved as you go. The first install opens them with a welcome.
- The website is a static GitHub Pages site at jackbush.github.io/instead/.

## Capabilities and Constraints

- Redirects happen inside the browser before the site loads; host access only for listed sites.
- No server, no analytics, no data collected; settings live in browser storage and sync only through the browser's own sync.
- Store listings: Firefox Add-ons (addons.mozilla.org/en-GB/firefox/addon/instead-do-this/) and Chrome Web Store (ID pjlabllieiaoigjcolbkjafijbgomeoh), in review.
- MIT licensed; source on GitHub at jackbush/instead.

## Brand Commitments

- Name: Instead. Tagline: "Fun, free and fulfilling activities to do instead of falling into a screen."
- Suggestions follow [SUGGESTIONS.md](SUGGESTIONS.md): a short, free, finite thing to do now, starting with a verb ("Find a leaf and draw it").
- Every load and every new suggestion brings a new hue; the change of colour is part of the product.
- Icon: Phosphor hand-palm, black with a white outline.

## Evidence on Hand

- The product itself, live (`demo.html`), and its renders from `scripts/capture-images.mjs`.
- No user counts, reviews, testimonials or research results exist; none may be invented.

## Product Principles

- Offer, don't forbid: the way through is always one click away.
- One thing at a time: one suggestion, large, nothing else competing.
- Nothing leaves the browser.
- Change is the point: no two visits look the same.
