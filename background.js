// Background: a circular arc from a random height on the left edge to a random
// height on the right edge guides a vertical gradient — lighter secondary above,
// darker primary below. Colours are set in OKHSL from the params sidebar.

const PARAMS = [
  { group: "Primary (bottom)" },
  { key: "h", label: "Hue", min: 0, max: 360, value: 249 },
  { key: "s", label: "Saturation", min: 0, max: 100, value: 100 },
  { key: "l", label: "Lightness", min: 0, max: 100, value: 90 },
  { group: "Secondary (top), offset from primary" },
  { key: "dh", label: "Hue", min: -180, max: 180, value: 120 },
  { key: "ds", label: "Saturation", min: -100, max: 100, value: 0 },
  { key: "dl", label: "Lightness", min: -100, max: 100, value: 0 },
  { group: "Gradient" },
  { key: "width", label: "Width (% of height)", min: 10, max: 400, value: 200 },
  { key: "guide", label: "Show guide line", type: "checkbox", value: false },
  { group: "Text and button" },
  { key: "th", label: "Hue offset", min: -180, max: 180, value: -120 },
  { key: "ts", label: "Saturation", min: 0, max: 100, value: 100 },
  { key: "tl", label: "Lightness", min: 0, max: 100, value: 12 },
];

const params = Object.fromEntries(PARAMS.filter((p) => p.key).map((p) => [p.key, p.value]));

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const wrapHue = (h) => ((h % 360) + 360) % 360;

function colours() {
  const { h, s, l, dh, ds, dl, th, ts, tl } = params;
  return {
    primary: okhslToOklab(h, s / 100, l / 100),
    secondary: okhslToOklab(wrapHue(h + dh), clamp01((s + ds) / 100), clamp01((l + dl) / 100)),
    text: okhslToOklab(wrapHue(h + th), ts / 100, tl / 100),
    // Opposite of the primary: the complementary hue at the inverted lightness.
    guide: okhslToOklab(wrapHue(h + 180), s / 100, 1 - l / 100),
  };
}

// The arc's shape is random per load and kept as fractions so it survives resizes.
function randomArc() {
  return {
    left: Math.random(), // height on the left edge, 0 = top
    right: Math.random(),
    bend: 1 + Math.random() * 2, // radius as a multiple of half the chord
    side: Math.random() < 0.5 ? 1 : -1, // centre below (arc humps up) or above
  };
}

// Circle through (0, yL) and (w, yR). Both ends must sit on the same half of
// the circle so the arc spans the full width as one curve; grow the radius
// until they do.
function arcGeometry(arc, w, h) {
  const yL = arc.left * h, yR = arc.right * h;
  const dx = w, dy = yR - yL;
  const chord = Math.hypot(dx, dy);
  const nx = -dy / chord, ny = dx / chord; // unit normal, pointing down-ish
  let r = (arc.bend * chord) / 2;
  for (;;) {
    const off = arc.side * Math.sqrt(r * r - (chord / 2) ** 2);
    const cx = dx / 2 + nx * off, cy = (yL + yR) / 2 + ny * off;
    const ok = arc.side > 0 ? cy > Math.max(yL, yR) : cy < Math.min(yL, yR);
    // branch: which half of the circle the arc is on (-1 upper, +1 lower)
    if (ok) return { cx, cy, r, branch: -arc.side };
    r *= 1.1;
  }
}

const VERTEX = `
attribute vec2 pos;
void main() { gl_Position = vec4(pos, 0.0, 1.0); }`;

const FRAGMENT = `
precision highp float;
uniform vec2 res;        // device pixels
uniform vec2 center;     // arc circle centre, device pixels, y down
uniform float radius;
uniform float branch;
uniform float width;     // gradient width, device pixels
uniform float dpr;
uniform vec3 top, bottom, guideColor; // OKLab
uniform bool guide;

vec3 oklabToLinear(vec3 c) {
  float l = c.x + 0.3963377774 * c.y + 0.2158037573 * c.z;
  float m = c.x - 0.1055613458 * c.y - 0.0638541728 * c.z;
  float s = c.x - 0.0894841775 * c.y - 1.2914855480 * c.z;
  l = l * l * l; m = m * m * m; s = s * s * s;
  return vec3(
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s);
}

vec3 toSrgb(vec3 lab) {
  vec3 x = clamp(oklabToLinear(lab), 0.0, 1.0);
  return mix(12.92 * x, 1.055 * pow(x, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, x));
}

float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

void main() {
  vec2 p = vec2(gl_FragCoord.x, res.y - gl_FragCoord.y);
  float dx = p.x - center.x;
  float arcY = center.y + branch * sqrt(max(radius * radius - dx * dx, 0.0));
  // 0 at the top edge of the gradient band, 1 at the bottom; the arc is the middle.
  float t = clamp(0.5 + (p.y - arcY) / width, 0.0, 1.0);
  vec3 rgb = toSrgb(mix(top, bottom, t)); // mixed in OKLab

  if (guide) {
    float dist = abs(length(p - center) - radius);
    float onArc = step(0.0, (p.y - center.y) * branch);
    rgb = mix(rgb, toSrgb(guideColor), clamp(dpr * 0.5 + 0.5 - dist, 0.0, 1.0) * onArc);
  }

  rgb += (hash(p) - 0.5) / 255.0; // dither so long, soft gradients don't band
  gl_FragColor = vec4(rgb, 1.0);
}`;

function createBackground(canvas) {
  const gl = canvas.getContext("webgl");
  if (!gl) return null;

  const shader = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  };
  const program = gl.createProgram();
  gl.attachShader(program, shader(gl.VERTEX_SHADER, VERTEX));
  gl.attachShader(program, shader(gl.FRAGMENT_SHADER, FRAGMENT));
  gl.linkProgram(program);
  gl.useProgram(program);

  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const pos = gl.getAttribLocation(program, "pos");
  gl.enableVertexAttribArray(pos);
  gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);

  const u = (name) => gl.getUniformLocation(program, name);
  let arc = randomArc();

  function draw() {
    const dpr = devicePixelRatio || 1;
    const w = innerWidth, h = innerHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    gl.viewport(0, 0, canvas.width, canvas.height);

    const g = arcGeometry(arc, w, h);
    const c = colours();
    gl.uniform2f(u("res"), canvas.width, canvas.height);
    gl.uniform2f(u("center"), g.cx * dpr, g.cy * dpr);
    gl.uniform1f(u("radius"), g.r * dpr);
    gl.uniform1f(u("branch"), g.branch);
    gl.uniform1f(u("width"), (params.width / 100) * h * dpr);
    gl.uniform1f(u("dpr"), dpr);
    gl.uniform3fv(u("top"), c.secondary);
    gl.uniform3fv(u("bottom"), c.primary);
    gl.uniform3fv(u("guideColor"), c.guide);
    gl.uniform1i(u("guide"), params.guide);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  return {
    draw,
    newArc() { arc = randomArc(); draw(); },
  };
}

function applyColours() {
  const c = colours();
  const root = document.documentElement.style;
  root.setProperty("--primary", oklabCss(c.primary));
  root.setProperty("--ink", oklabCss(c.text));
}

function buildSidebar(panel, onChange) {
  const form = panel.querySelector("form");
  for (const p of PARAMS) {
    if (p.group) {
      const h = document.createElement("h2");
      h.textContent = p.group;
      form.append(h);
      continue;
    }
    const row = document.createElement("label");
    if (p.type === "checkbox") {
      row.className = "check";
      row.innerHTML = `<input type="checkbox" name="${p.key}"> <span>${p.label}</span>`;
      const input = row.querySelector("input");
      input.checked = params[p.key];
      input.addEventListener("input", () => { params[p.key] = input.checked; onChange(); });
    } else {
      row.innerHTML = `<span>${p.label}</span><output></output>
        <input type="range" name="${p.key}" min="${p.min}" max="${p.max}" step="1" value="${params[p.key]}">`;
      const input = row.querySelector("input"), out = row.querySelector("output");
      out.textContent = params[p.key];
      input.addEventListener("input", () => {
        params[p.key] = Number(input.value);
        out.textContent = input.value;
        onChange();
      });
    }
    form.append(row);
  }
}
