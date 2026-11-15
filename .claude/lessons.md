# Lessons

## Browser chrome tinting (Safari 26, iOS)
- Check bar tinting in iOS Simulator Safari, not Chrome. Headless Chrome can prove the colours are right but says nothing about what Safari's bars read. A probe page with loud colours (red/blue strips, yellow root, magenta theme-color) shows which source each bar uses.
- What Safari reads, as measured: the topmost fixed element at each edge with a solid `background-color`, at least ~8px tall and fully on screen. Elements behind the canvas or content, thinner ones, part off-screen ones and ones with a `background-image` are skipped, and it falls back to the root background for both bars. It ignores `theme-color`.
- It reads that colour once, when the element is added. Changing its colour or height does nothing, so a new colour needs a new element (`replaceWith` a clone).
