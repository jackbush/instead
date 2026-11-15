---
name: Instead
description: Fun, free and fulfilling activities to do instead of falling into a screen.
colors:
  # Every colour is computed at runtime from one primary hue (random per load).
  # Values below are the reference sample at hue 249; the derivation is normative.
  primary: "#cde6ff"
  secondary: "#ffd7dc"
  ink: "#050b00"
  field: "#ffffff"
  paper: "#f1f2f3"
typography:
  display:
    fontFamily: "Gloock, Georgia, serif"
    fontSize: "clamp(3rem, 8.4vw, 8.5rem)"
    fontWeight: 400
    lineHeight: 1.04
    letterSpacing: "-0.02em"
  display-suggestion:
    fontFamily: "Gloock, Georgia, serif"
    fontSize: "clamp(2.75rem, 9.9vw, 9rem)"
    fontWeight: 400
    lineHeight: 1.04
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "Gloock, Georgia, serif"
    fontSize: "clamp(2.5rem, 6vw, 5.5rem)"
    fontWeight: 400
    lineHeight: 1.04
    letterSpacing: "-0.02em"
  page-title:
    fontFamily: "Gloock, Georgia, serif"
    fontSize: "clamp(3.15rem, 9.9vw, 6.5rem)"
    fontWeight: 400
    lineHeight: 1.04
    letterSpacing: "-0.02em"
  title:
    fontFamily: "Gloock, Georgia, serif"
    fontSize: "clamp(1.75rem, 3.2vw, 2.75rem)"
    fontWeight: 400
    lineHeight: 1.04
    letterSpacing: "-0.02em"
  title-small:
    fontFamily: "Gloock, Georgia, serif"
    fontSize: "clamp(1.9rem, 4vw, 2.5rem)"
    fontWeight: 400
    lineHeight: 1.04
    letterSpacing: "-0.02em"
  body:
    fontFamily: "Hanken Grotesk, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 500
    lineHeight: 1.6
  body-compact:
    fontFamily: "Hanken Grotesk, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 500
    lineHeight: 1.5
  label:
    fontFamily: "Hanken Grotesk, system-ui, sans-serif"
    fontSize: "clamp(1rem, 1.6vw, 1.25rem)"
    fontWeight: 600
    lineHeight: 1.2
  strong:
    fontFamily: "Hanken Grotesk, system-ui, sans-serif"
    fontWeight: 800
rounded:
  check: "0.45rem"
  shot: "clamp(10px, 1.2vw, 16px)"
  field: "1.1rem"
  pill: "999px"
spacing:
  page: "clamp(1.5rem, 6vw, 6rem)"
  stack: "clamp(2rem, 5vw, 3.5rem)"
  field-section: "clamp(2.25rem, 5vw, 3.25rem)"
  section: "clamp(5rem, 12vw, 10rem)"
components:
  button-cut-out:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.primary}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "0.7em 1.5em"
  button-outline:
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "0.7em 1.5em"
  button-link:
    textColor: "{colors.ink}"
    typography: "{typography.label}"
  text-field:
    backgroundColor: "{colors.field}"
    textColor: "{colors.ink}"
    typography: "{typography.body-compact}"
    rounded: "{rounded.field}"
    padding: "0.85rem 1.1rem"
  checkbox:
    backgroundColor: "{colors.field}"
    rounded: "{rounded.check}"
    size: "1.5rem"
  checkbox-checked:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.primary}"
  status-pill:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.primary}"
    rounded: "{rounded.pill}"
    padding: "0.5rem 1rem"
---

# Design System: Instead

## Overview

**Creative North Star: "A New Sky Each Time"**

Instead speaks in one large sentence on a soft gradient whose colour you have never quite seen before. Every load picks a new primary hue, every new suggestion turns it at least 30° round the wheel, and on the marketing site the hue turns a full circle between the top of the page and the bottom. Nothing in the palette is fixed: the ground, the second gradient stop and the ink are all derived from that one hue, so the system is a set of relationships rather than a set of swatches.

Against that moving ground the type and controls stay deliberately few. A tall, high-contrast serif (Gloock) carries anything meant to be read from across the room; a warm grotesque (Hanken Grotesk) carries everything else. Controls are ink pills. The primary action is a pill with its label and icon cut out, so the gradient shows through the letters; the secondary is the same pill drawn as a 1.5px ink outline; a rare tertiary action is an underlined link. Density is low: one idea per viewport, generous page padding, no cards, no chrome.

The same system runs on the marketing site, the suggestion page the extension opens, settings and the privacy page. They differ only in density (settings tightens body to 16px and adds white fields), never in palette, type or form.

**Key Characteristics:**
- One random hue per load drives every colour; chroma capped at 0.13 so all hues feel equally soft.
- Full-viewport WebGL arc gradient in OKLab, dithered, behind everything.
- Near-black ink tinted from the hue, used for all text, outlines and filled controls.
- Gloock display at jumbo scale, line-height 1.04, -0.02em tracking.
- Cut-out ink pills for the primary action; outlined pills for the rest; underlined links for a tertiary way out.
- Flat: depth only from soft ink-tinted shadows on screenshots and the save status.

## Colors

A soft, low-chroma two-stop gradient and a near-black ink, all spun from one hue that is different every time.

### Primary
- **Ground** (`primary`; OKHSL hue h, saturation 100, lightness 90, chroma capped): the lower stop of the arc gradient and the fallback fill of the canvas when WebGL is unavailable. Also the colour of text set on ink (selection, the save status, the tick in a checked box, the warning icon in the error status).

### Secondary
- **Upper Ground** (`secondary`; hue h + 120°, same saturation and lightness, same cap): the upper stop of the arc gradient. It never appears as a flat fill on its own.

### Neutral
- **Ink** (`ink`; hue h − 120°, saturation 100, lightness 5, capped): all text, link underlines, outlines, filled pills, focus rings, field borders. It is also the page's own background colour behind the canvas, and is written to `theme-color`, so browser bars match the text.
- **Field White** (`field`): the fill of text fields and unchecked checkboxes on settings. Not derived from the hue, so editable areas read as paper on any ground.
- **Paper** (`paper`): the marketing home page only. Below its opening the gradient fades to this cool off-white, so the screenshots and product colours above it stand out. On the home page the browser's bars take the colour at each edge of the window instead (the gradient there, mixed with as much of the paper's fade as covers it), carried by thin fixed strips over the canvas, the root background and `theme-color`. It is not derived from the hue.

Translucent ink tints (via `color-mix` in OKLab) do the remaining work: 10–12% for outline-button hover, 25% for the footer rule, 60% for placeholders, 40% for screenshot shadows, 60% for the status shadow.

### Named Rules
**The One Hue Rule.** Every colour except Field White and Paper is computed from the primary hue by fixed offsets (secondary +120°, ink −120° at lightness 5). Never hard-code a brand hex; a surface that wants colour reads `--primary` and `--ink`.

**The Chroma Cap Rule.** OKLab chroma is capped at 0.13 for every derived colour, so a yellow-green and a blue land at the same softness. Raising it makes some hues loud and others not.

**The Ink Behind Rule.** The page background is ink and the canvas sits fixed above it with a primary fallback. Overscroll and browser bars show ink, never white. The home page is the exception: below its opening they follow Paper.

## Typography

**Display Font:** Gloock (with Georgia, serif), weight 400 only.
**Body Font:** Hanken Grotesk (with system-ui, sans-serif), variable 500–800.

**Character:** A sharp, high-contrast display serif set tight and huge, paired with a friendly grotesque at a slightly heavy regular (500). The serif makes the suggestion feel like a sentence worth reading; the grotesque keeps everything around it quiet.

Both are self-hosted (`src/shared/fonts/fonts.css`), Latin subset. Gloock loads with `font-display: block` so the display never flashes in Georgia; Hanken uses `swap`.

### Hierarchy
- **Display** (400, clamp(3rem, 8.4vw, 8.5rem), 1.04): the marketing hero sentence, max 15ch, balanced wrap.
- **Display Suggestion** (400, clamp(2.75rem, 9.9vw, 9rem), 1.04): the suggestion page, max 14ch, `text-wrap: pretty`; the last two words are glued on wide screens so no word sits alone, unglued below 600px.
- **Page Title** (400, clamp(3.15rem, 9.9vw, 6.5rem), 1.04): the H1 of settings and privacy.
- **Headline** (400, clamp(2.5rem, 6vw, 5.5rem), 1.04): marketing section headings.
- **Title** (400, clamp(1.75rem, 3.2vw, 2.75rem), 1.04): marketing step headings.
- **Title Small** (400, clamp(1.9rem, 4vw, 2.5rem), 1.04): section headings on settings and privacy.
- **Body** (500, 1.125rem, 1.6): marketing and privacy copy, held to 34–38rem. Ledes step up (1.375rem/1.45 on privacy).
- **Body Compact** (500, 1rem, 1.5): settings.
- **Label** (600, clamp(1rem, 1.6vw, 1.25rem), 1.2): buttons, nav links, status.
- **Strong** (800): every bold run in body copy. The marketing hero's site name uses it too.

Links inherit ink, underline at 0.08em thickness with 0.2em offset (0.06em / 0.1em inside display text).

### Named Rules
**The Two Voices Rule.** Gloock at 400 for anything display-sized and for the wordmark, Hanken Grotesk for everything else. No third family, no Gloock body text, no Hanken headlines.

**The Tight Display Rule.** Every Gloock size sets at line-height 1.04 and −0.02em tracking. 1.04 is the smallest leading that keeps a descender from touching the ascender below (Gloock's extents span 1.012em).

## Layout

One column, left-aligned, held off the edges by a single fluid page padding (clamp(1.5rem, 6vw, 6rem)). Text measures are capped in `ch` for display (14–18ch) and `rem` for body (34–44rem). Pages never centre their content.

- **Suggestion page:** a two-row grid; the suggestion sits at the bottom of the first row and grows upward, the button row stays fixed 20dvh from the bottom whatever the text length. "I'm on it" (cut-out) and "Suggest something else" (outline) sit side by side, stacked full-width under 600px. The "Take me to …" link appears out of flow at the right edge of the row (below them under 600px) so the buttons never move.
- **Marketing:** a full-viewport hero aligned to the bottom (18svh bottom padding), then sections separated by clamp(5rem, 12vw, 10rem). Two-column text/image splits collapse to one column at 720px, where the install pills go full width and the nav hides. Screenshots run in a horizontal scroll-snap strip that bleeds to the viewport edges.
- **Settings and privacy:** a single text column (44rem / 38rem), sections spaced clamp(2.25rem, 5vw, 3.25rem).

## Elevation & Depth

Flat. The only depth is the gradient itself; surfaces do not stack. Two places carry a soft shadow tinted from the ink, never grey or black.

### Shadow Vocabulary
- **Screenshot lift** (`box-shadow: 0 1.5rem 3rem -1.5rem` ink at 40%): a single soft shadow with no outline, on product screenshots on the marketing site.
- **Status lift** (`box-shadow: 0 6px 20px -8px` ink at 60%; 40% plus the 1.5px inset ring when saving): the fixed save status on settings.

### Named Rules
**The Flat Ground Rule.** Controls, fields and text never cast shadows. A shadow belongs only to something that floats over the ground (a screenshot, the status).

## Shapes

Round where you touch, square nowhere. Buttons and the status are full pills (999px). Fields are generously rounded (1.1rem), checkboxes softly (0.45rem), screenshots a fluid 10–16px. Every outline is 1.5px of ink. On pills the outline is an inset box-shadow rather than a border, so an outlined pill is exactly the size of a cut-out one at any pixel ratio; fields and checkboxes use a real 1.5px border. Invalid fields switch the border to dashed.

The logo mark is the Phosphor hand-palm (fill) in black with a white outline; it is the one fixed-colour element and does not take the hue.

## Components

### Buttons
Two pills of the same size, one cut out and one drawn, and a link. All are defined once, in `brand.css`, which every page loads.
- **Shape:** full pill (999px), at least 2.75rem tall, 0.6em × 1.4em padding, label then a Phosphor bold icon at 1.1em, 0.4em apart.
- **Cut-out (primary):** an ink pill with the label and icon masked out, so the live gradient shows through the letters (`cutout.js` draws an SVG mask over the real, invisible label, which keeps the accessible name and size). One per group: the visitor's own browser's install link, "I'm on it", "Preview".
- **Outline (secondary):** transparent, 1.5px inset ink ring, ink label. "Suggest something else", the other browser, "Reset to defaults".
- **Link (tertiary):** no pill or padding, the label underlined at 0.08em with 0.2em offset, then its icon. Hover thickens the underline to 0.16em. "Take me to …".
- **Hover:** the outline fills with a 12% ink tint; the cut-out darkens its pill (`brightness(0.7)`).
- **Focus:** 2px ink outline, 4px offset.
- **Disabled:** 40% opacity.
- **Motion:** the "Take me to …" link fades in over 400ms ease-out five seconds after load; no transition under reduced motion.

### Inputs / Fields
- **Style:** Field White fill, 1.5px solid ink border, 1.1rem radius, 0.85rem × 1.1rem padding, body type at 1.6 leading, auto-growing with no resize handle.
- **Placeholder:** ink at 60%, the lightest that keeps 4.5:1 on Field White at every hue.
- **Focus:** 2px ink outline, 4px offset.
- **Error / Disabled:** dashed border when invalid, with a note list beneath, each note led by a Phosphor warning-circle (fill) icon in ink; 60% opacity when disabled.

### Checkbox
A drawn 1.5rem box matching the fields: Field White with a 1.5px ink border, 0.45rem radius. Checked, it fills with ink and shows a Phosphor bold check in the ground colour. The real input sits invisibly over the box.

### Navigation
Marketing only: brand (hand mark plus "Instead" in Gloock 1.75rem) on the left, three Hanken 600 text links on the right with underline on hover. The nav hides below 720px; the brand stays.

### Save Status
A fixed ink pill in the bottom-right corner, ground-coloured 600 text, with Status lift. While saving it inverts to Field White with an ink ring.

### Cycling Text
The marketing hero swaps its "You were about to open …" line and its suggestion every 4.2s with one transition: blur to 6px and fade out over 280ms ease-out, replace, then reverse. On phones the sentence keeps room for four lines and sits at the bottom of it, so the description and buttons below never move as it changes length. The hero section has a fixed accessible name, so the cycling text never renames it. Under reduced motion the hero shows one sentence that never cycles, and smooth scrolling is off.

## Do's and Don'ts

### Do:
- **Do** derive every colour from `--primary` and `--ink`, set by `applyColours()` from the current hue.
- **Do** keep chroma at or under 0.13 for any new derived colour.
- **Do** set the page background to ink and give the canvas a primary fallback.
- **Do** set display text in Gloock 400 at line-height 1.04 and −0.02em tracking.
- **Do** make exactly one action per group the cut-out pill; the others are 1.5px outlined pills of the same size, or a tertiary underlined link.
- **Do** draw pill outlines as an inset box-shadow so outlined and cut-out pills match exactly.
- **Do** use Phosphor bold icons, inlined as SVG, coloured with `currentColor`.
- **Do** use pure white for editable fields.
- **Do** limit motion to the 280ms blur-and-fade swap and the 400ms fade, and drop both under reduced motion.

### Don't:
- **Don't** hard-code a hue, a brand hex or a grey for text or ground.
- **Don't** put text on the gradient in any colour but ink.
- **Don't** cast shadows from controls, fields or text.
- **Don't** introduce a third typeface, or set body, labels or UI in Gloock.
- **Don't** use square corners on anything interactive.
- **Don't** use text characters or emoji as icons.
