// OKHSL -> OKLab, after Björn Ottosson's reference implementation
// (https://bottosson.github.io/posts/colorpicker/). OKHSL is OKLab reshaped so
// saturation 100% always means the edge of the sRGB gamut for that hue and
// lightness, and lightness steps look even.

function oklabToLinearSrgb(L, a, b) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

function toeInv(x) {
  const k1 = 0.206, k2 = 0.03, k3 = (1 + k1) / (1 + k2);
  return (x * x + k1 * x) / (k3 * (x + k2));
}

// Max saturation (C/L) inside sRGB for a hue direction (a, b), one Halley step.
function maxSaturation(a, b) {
  let k0, k1, k2, k3, k4, wl, wm, ws;
  if (-1.88170328 * a - 0.80936493 * b > 1) {
    [k0, k1, k2, k3, k4] = [1.19086277, 1.76576728, 0.59662641, 0.75515197, 0.56771245];
    [wl, wm, ws] = [4.0767416621, -3.3077115913, 0.2309699292];
  } else if (1.81444104 * a - 1.19445276 * b > 1) {
    [k0, k1, k2, k3, k4] = [0.73956515, -0.45954404, 0.08285427, 0.1254107, 0.14503204];
    [wl, wm, ws] = [-1.2684380046, 2.6097574011, -0.3413193965];
  } else {
    [k0, k1, k2, k3, k4] = [1.35733652, -0.00915799, -1.1513021, -0.50559606, 0.00692167];
    [wl, wm, ws] = [-0.0041960863, -0.7034186147, 1.707614701];
  }
  let S = k0 + k1 * a + k2 * b + k3 * a * a + k4 * a * b;
  const kl = 0.3963377774 * a + 0.2158037573 * b;
  const km = -0.1055613458 * a - 0.0638541728 * b;
  const ks = -0.0894841775 * a - 1.291485548 * b;
  const l_ = 1 + S * kl, m_ = 1 + S * km, s_ = 1 + S * ks;
  const f = wl * l_ ** 3 + wm * m_ ** 3 + ws * s_ ** 3;
  const f1 = 3 * (wl * kl * l_ * l_ + wm * km * m_ * m_ + ws * ks * s_ * s_);
  const f2 = 6 * (wl * kl * kl * l_ + wm * km * km * m_ + ws * ks * ks * s_);
  return S - (f * f1) / (f1 * f1 - 0.5 * f * f2);
}

function findCusp(a, b) {
  const S = maxSaturation(a, b);
  const rgb = oklabToLinearSrgb(1, S * a, S * b);
  const L = Math.cbrt(1 / Math.max(...rgb));
  return [L, L * S];
}

// How far along the line from (L0, 0) towards (L1, C1) the sRGB gamut edge is.
function gamutIntersection(a, b, L1, C1, L0, cusp) {
  const [Lc, Cc] = cusp;
  if ((L1 - L0) * Cc - (Lc - L0) * C1 <= 0) {
    return (Cc * L0) / (C1 * Lc + Cc * (L0 - L1));
  }
  let t = (Cc * (L0 - 1)) / (C1 * (Lc - 1) + Cc * (L0 - L1));
  const dL = L1 - L0, dC = C1;
  const kl = 0.3963377774 * a + 0.2158037573 * b;
  const km = -0.1055613458 * a - 0.0638541728 * b;
  const ks = -0.0894841775 * a - 1.291485548 * b;
  const ldt = dL + dC * kl, mdt = dL + dC * km, sdt = dL + dC * ks;
  const L = L0 * (1 - t) + t * L1, C = t * C1;
  const l_ = L + C * kl, m_ = L + C * km, s_ = L + C * ks;
  const l = l_ ** 3, m = m_ ** 3, s = s_ ** 3;
  const l1 = 3 * ldt * l_ * l_, m1 = 3 * mdt * m_ * m_, s1 = 3 * sdt * s_ * s_;
  const l2 = 6 * ldt * ldt * l_, m2 = 6 * mdt * mdt * m_, s2 = 6 * sdt * sdt * s_;
  const step = (w) => {
    const f = w[0] * l + w[1] * m + w[2] * s - 1;
    const f1 = w[0] * l1 + w[1] * m1 + w[2] * s1;
    const f2 = w[0] * l2 + w[1] * m2 + w[2] * s2;
    const u = f1 / (f1 * f1 - 0.5 * f * f2);
    return u >= 0 ? -f * u : Infinity;
  };
  return t + Math.min(
    step([4.0767416621, -3.3077115913, 0.2309699292]),
    step([-1.2684380046, 2.6097574011, -0.3413193965]),
    step([-0.0041960863, -0.7034186147, 1.707614701]),
  );
}

function chromaStops(L, a, b) {
  const cusp = findCusp(a, b);
  const Cmax = gamutIntersection(a, b, L, 1, L, cusp);
  const [Lc, Cc] = cusp;
  const k = Cmax / Math.min(L * (Cc / Lc), (1 - L) * (Cc / (1 - Lc)));
  const Smid = 0.11516993 + 1 / (7.4477897 + 4.1590124 * b + a * (-2.19557347 + 1.75198401 * b
    + a * (-2.13704948 - 10.02301043 * b + a * (-4.24894561 + 5.38770819 * b + 4.69891013 * a))));
  const Tmid = 0.11239642 + 1 / (1.6132032 - 0.68124379 * b + a * (0.40370612 + 0.90148123 * b
    + a * (-0.27087943 + 0.6122399 * b + a * (0.00299215 - 0.45399568 * b - 0.14661872 * a))));
  const Ca = L * Smid, Cb = (1 - L) * Tmid;
  const Cmid = 0.9 * k * Math.sqrt(Math.sqrt(1 / (1 / Ca ** 4 + 1 / Cb ** 4)));
  const C0a = L * 0.4, C0b = (1 - L) * 0.8;
  const C0 = Math.sqrt(1 / (1 / C0a ** 2 + 1 / C0b ** 2));
  return [C0, Cmid, Cmax];
}

// h in degrees, s and l in 0–1. Returns [L, a, b].
function okhslToOklab(h, s, l) {
  if (l >= 1) return [1, 0, 0];
  if (l <= 0) return [0, 0, 0];
  const a = Math.cos((h / 180) * Math.PI), b = Math.sin((h / 180) * Math.PI);
  const L = toeInv(l);
  if (s <= 0) return [L, 0, 0];
  const [C0, Cmid, Cmax] = chromaStops(L, a, b);
  let C;
  if (s < 0.8) {
    const t = 1.25 * s, k1 = 0.8 * C0, k2 = 1 - k1 / Cmid;
    C = (t * k1) / (1 - k2 * t);
  } else {
    const t = 5 * (s - 0.8), k1 = (0.2 * Cmid * Cmid * 1.25 * 1.25) / C0, k2 = 1 - k1 / (Cmax - Cmid);
    C = Cmid + (t * k1) / (1 - k2 * t);
  }
  return [L, C * a, C * b];
}

function oklabCss([L, a, b]) {
  return `oklab(${L.toFixed(4)} ${a.toFixed(4)} ${b.toFixed(4)})`;
}

// "#rrggbb", clipped to sRGB, for places that want plain hex (theme-color).
function oklabHex(lab) {
  const gamma = (x) => (x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055);
  return "#" + oklabToLinearSrgb(...lab)
    .map((x) => Math.round(Math.min(1, Math.max(0, gamma(x))) * 255).toString(16).padStart(2, "0"))
    .join("");
}
