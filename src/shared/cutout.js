// Cut-out buttons: the label and icon are masked out of an ink pill, so the
// page's background shows through them. The button keeps its real label
// (a <span>) and icon (an <svg class="icon"> holding one <path>), which give
// it its size and accessible name; cutOut() draws the pill over them and
// keeps the cut-outs lined up with them. Styles are in brand.css.

let cutOuts = 0;

function svgElement(name, attributes) {
  const element = document.createElementNS("http://www.w3.org/2000/svg", name);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
  return element;
}

function cutOut(button) {
  const label = button.querySelector("span");
  const icon = button.querySelector(".icon");
  const id = `cut-out-${++cutOuts}`;
  const svg = svgElement("svg", { class: "cut", "aria-hidden": "true" });
  const mask = svgElement("mask", { id });
  const text = svgElement("text", { "dominant-baseline": "central" });
  const path = svgElement("path", { d: icon.querySelector("path").getAttribute("d") });
  text.textContent = label.textContent;
  mask.append(svgElement("rect", { width: "100%", height: "100%", fill: "#fff" }), text, path);
  svg.append(mask, svgElement("rect", { class: "pill", width: "100%", height: "100%", mask: `url(#${id})` }));
  button.append(svg);

  function place() {
    const box = button.getBoundingClientRect();
    const l = label.getBoundingClientRect();
    const i = icon.getBoundingClientRect();
    text.setAttribute("x", l.left - box.left);
    text.setAttribute("y", l.top - box.top + l.height / 2);
    path.setAttribute(
      "transform",
      `translate(${i.left - box.left} ${i.top - box.top}) scale(${i.width / 256})`,
    );
  }
  new ResizeObserver(place).observe(button);
  // A font arriving moves the label without resizing the button. fonts.ready
  // alone can settle before loading starts (in an iframe, say).
  document.fonts.ready.then(place);
  document.fonts.addEventListener("loadingdone", place);
}
