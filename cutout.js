// Cut-out buttons: the label and icon are masked out of an ink pill, so the
// page's background shows through them. The button keeps its real label
// (a <span>) and icon (an <svg class="icon"> holding one <path>), which give
// it its size and accessible name; cutOut() draws the pill over them and
// keeps the cut-outs lined up with them. Styles are in cutout.css.

let cutOuts = 0;

function cutOut(button) {
  const label = button.querySelector("span");
  const icon = button.querySelector(".icon");
  const id = `cut-out-${++cutOuts}`;
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.classList.add("cut");
  svg.setAttribute("aria-hidden", "true");
  svg.innerHTML = `<mask id="${id}"><rect width="100%" height="100%" fill="#fff"/>`
    + `<text dominant-baseline="central"></text><path/></mask>`
    + `<rect class="pill" width="100%" height="100%" mask="url(#${id})"/>`;
  const text = svg.querySelector("text");
  const path = svg.querySelector("mask path");
  text.textContent = label.textContent;
  path.setAttribute("d", icon.querySelector("path").getAttribute("d"));
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
  document.fonts.ready.then(place);
}
