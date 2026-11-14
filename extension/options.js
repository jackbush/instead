import {
  ext, DEFAULT_SITES, defaultSuggestions, getLists, saveLists,
  normaliseSite, normaliseException, parseLines, sitesWithAccess, requestAccess,
} from "./settings.js";

// storage.sync allows about 8 KB per item: the key plus its JSON.
const QUOTA_BYTES_PER_ITEM = 8192;
// Typing saves once it pauses for this long.
const SAVE_DELAY_MS = 400;

const $ = (id) => document.getElementById(id);
const resetButton = $("reset"), status = $("status"), access = $("access");
const allowMessages = $("allow-messages");

// One entry per textarea. `normalise` gives the saved form of a line, or null
// if it isn't valid.
const fields = {
  sites: { el: $("sites"), note: $("sites-note"), normalise: normaliseSite, what: "a site" },
  exceptions: { el: $("exceptions"), note: $("exceptions-note"), normalise: normaliseException, what: "a web address" },
  suggestions: { el: $("suggestions"), note: $("suggestions-note"), normalise: (line) => line, extraLine: true },
};

let saved = {};            // what's in storage
let granted = new Set();   // saved sites the extension has host access to
let saveTimer = 0;         // set while typing hasn't been saved yet
let failure = "";         // why the last save didn't go through, if it didn't
let clearStatus = 0;

// Background and colours, as on the Instead page (background.js). The hue is
// the first random number drawn.
const { min: HUE_MIN, max: HUE_MAX } = PARAMS.find((p) => p.key === "h");
params.h = HUE_MIN + Math.floor(Math.random() * (HUE_MAX - HUE_MIN + 1));
const background = createBackground($("bg"));
applyColours();
background?.draw();
addEventListener("resize", () => { background?.draw(); fitAll(); });
cutOut($("preview"));

// Size a textarea to its text; the suggestions get one extra line.
function fit({ el, extraLine }) {
  el.style.height = "auto";
  const frame = el.offsetHeight - el.clientHeight;
  const line = extraLine ? parseFloat(getComputedStyle(el).lineHeight) : 0;
  el.style.height = `${el.scrollHeight + frame + line}px`;
}
const fitAll = () => Object.values(fields).forEach(fit);

const bytes = (key, list) => new TextEncoder().encode(key + JSON.stringify(list)).length;

// A line's saved form; invalid lines are kept as typed. Duplicates collapse.
function tidy(key, text) {
  const seen = new Set();
  const out = [], invalid = [];
  for (const line of parseLines(text)) {
    const clean = fields[key].normalise(line);
    if (clean === null) { out.push(line); invalid.push(line); }
    else if (!seen.has(clean)) { seen.add(clean); out.push(clean); }
  }
  return { text: out.join("\n"), valid: [...seen], invalid };
}

function setNotes(key, messages) {
  const { el, note } = fields[key];
  note.replaceChildren(...messages.map((m) => {
    const li = document.createElement("li");
    li.append(...m);
    return li;
  }));
  note.hidden = !messages.length;
  el.setAttribute("aria-invalid", messages.length ? "true" : "false");
}

const code = (text) => Object.assign(document.createElement("code"), { textContent: text });

// The pill in the corner says whether everything is saved: "saving",
// "saved" or "error" (until the next save goes through). A "message" shows
// for a few seconds, then the pill goes back to the save state.
function setStatus(state, message) {
  clearTimeout(clearStatus);
  status.textContent = { saving: "Saving…", saved: "Saved" }[state] ?? message;
  status.dataset.state = state;
  status.hidden = false;
  if (state === "message") {
    clearStatus = setTimeout(() => (failure ? setStatus("error", failure) : setStatus("saved")), 4000);
  }
}

function setFailure(message) {
  failure = message;
  setStatus("error", message);
}

function render(lists) {
  saved = lists;
  for (const [key, field] of Object.entries(fields)) {
    field.el.value = lists[key].join("\n");
    setNotes(key, []);
  }
  allowMessages.checked = lists.allowMessages;
  fitAll();
}

// A note under the sites, only when some saved sites can't be redirected
// because the browser hasn't given the extension access to them.
async function refreshAccess() {
  granted = new Set(await sitesWithAccess(saved.sites));
  const missing = saved.sites.filter((s) => !granted.has(s));
  access.hidden = !missing.length;
  if (!missing.length) return access.replaceChildren();
  const button = document.createElement("button");
  button.type = "button";
  button.className = "btn";
  button.textContent = "Allow";
  const li = document.createElement("li");
  li.append("Recent changes to this field need your permission to take effect. ", button);
  access.replaceChildren(li);
}

// requestAccess comes first: Firefox only shows the prompt before the first await.
access.addEventListener("click", async (e) => {
  if (!e.target.closest("button")) return;
  const request = requestAccess(saved.sites.filter((s) => !granted.has(s)));
  try {
    if (!(await request)) setStatus("message", "Access wasn’t granted");
  } catch (error) {
    setStatus("message", `Couldn’t ask for access: ${error.message}`);
  }
  await refreshAccess();
});

// Saves every field as it stands. The storage write starts before the first
// await, so a save started while the page closes still reaches the browser.
async function save() {
  clearTimeout(saveTimer);
  saveTimer = 0;
  const result = Object.fromEntries(Object.keys(fields).map((k) => [k, tidy(k, fields[k].el.value)]));
  const lists = Object.fromEntries(Object.entries(result).map(([k, r]) => [k, r.valid]));
  lists.allowMessages = allowMessages.checked;

  const tooLong = Object.keys(fields).find((k) => bytes(k, lists[k]) > QUOTA_BYTES_PER_ITEM);
  if (tooLong) return fail(tooLong);
  try {
    await saveLists(lists);
  } catch (error) {
    if (/quota/i.test(error.message)) return fail(Object.keys(fields).sort((a, b) => bytes(b, lists[b]) - bytes(a, lists[a]))[0]);
    return setFailure(`Not saved: ${error.message}`);
  }
  saved = lists;
  failure = "";
  if (!saveTimer) setStatus("saved");
  return result;
}

function fail(key) {
  setNotes(key, [[`This list is too long to sync: browsers allow about ${QUOTA_BYTES_PER_ITEM / 1024} KB per list. Remove some lines to save it.`]]);
  setFailure("Not saved: a list is too long");
}

// Leaving a field (or the checkbox changing) saves at once and tidies what
// was typed: lines are cleaned up, invalid ones flagged.
async function settle(key) {
  const result = await save();
  if (!result) return;
  if (key) {
    const { el } = fields[key];
    if (el.value !== result[key].text) { el.value = result[key].text; fit(fields[key]); }
    setNotes(key, result[key].invalid.map((line) => [code(line), ` isn’t ${fields[key].what}, so it’s left out.`]));
  }
  await refreshAccess();
}

for (const [key, field] of Object.entries(fields)) {
  field.el.addEventListener("input", () => {
    fit(field);
    setNotes(key, []);
    setStatus("saving");
    clearTimeout(saveTimer);
    saveTimer = setTimeout(save, SAVE_DELAY_MS);
  });
  field.el.addEventListener("change", () => settle(key));
}
allowMessages.addEventListener("change", () => settle());

resetButton.addEventListener("click", async () => {
  if (!confirm("Reset the sites, always-allowed pages and suggestions to their defaults? Your changes will be lost.")) return;
  const defaults = { sites: DEFAULT_SITES, exceptions: [], allowMessages: false, suggestions: await defaultSuggestions() };
  try {
    render(await saveLists(defaults));
    failure = "";
    await refreshAccess();
    setStatus("message", "Reset to defaults");
  } catch (error) {
    setStatus("message", `Couldn’t reset: ${error.message}`);
  }
});

// Typing that hasn't paused yet is saved as the page hides or closes. The
// browser only asks before leaving when a change couldn't be saved.
addEventListener("visibilitychange", () => { if (document.hidden && saveTimer) save(); });
addEventListener("beforeunload", (e) => {
  if (saveTimer) save();
  if (failure) e.preventDefault();
});

ext.permissions.onAdded?.addListener(() => refreshAccess());
ext.permissions.onRemoved?.addListener(() => refreshAccess());

try {
  render(await getLists());
  for (const { el } of Object.values(fields)) el.disabled = false;
  allowMessages.disabled = false;
  resetButton.disabled = false;
  document.fonts.ready.then(fitAll);
  await refreshAccess();
} catch (error) {
  setStatus("error", `Couldn’t load your settings: ${error.message}`);
}
