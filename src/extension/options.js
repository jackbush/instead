import {
  ext, PRESETS, DEFAULT_SITES, defaultSuggestions, getLists, saveLists,
  normaliseSite, normaliseException, sitesWithAccess, requestAccess,
} from "./settings.js";
import { parseLines } from "./shared.js";

// storage.sync allows about 8 KB per item: the key plus its JSON.
const QUOTA_BYTES_PER_ITEM = 8192;
// Typing saves once it pauses for this long.
const SAVE_DELAY_MS = 400;

const $ = (id) => document.getElementById(id);
const resetButton = $("reset"), status = $("status"), access = $("access");
const allowMessages = $("allow-messages");

// A ticked preset puts its sites on the list; the textarea holds the rest.
// Each preset gets a checkbox like the direct-messages one.
const presets = PRESETS.map((preset) => {
  const label = Object.assign(document.createElement("label"), { className: "check" });
  const box = Object.assign(document.createElement("input"), { type: "checkbox", disabled: true });
  const text = Object.assign(document.createElement("span"), { textContent: preset.name });
  label.append(box, allowMessages.nextElementSibling.cloneNode(true), text);
  $("presets").append(label);
  return { preset, box };
});

// Ticks each preset whose sites are all on the list. Returns the sites
// the ticked presets cover, which the textarea leaves out.
function tickPresets(sites) {
  const covered = new Set();
  for (const { preset, box } of presets) {
    box.checked = preset.sites.every((s) => sites.includes(s));
    if (box.checked) preset.sites.forEach((s) => covered.add(s));
  }
  return covered;
}

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

paintBackground($("bg"));
addEventListener("resize", () => fitAll());
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

// Fills a note list. The lists are live regions, so a change is announced
// without moving focus; one that says the same thing as before is left alone
// rather than read out again. `problems` marks the field invalid; the notice
// that an empty list means the defaults is not a problem.
function fillNote(note, messages) {
  const items = messages.map((m) => {
    const li = document.createElement("li");
    li.append(...m);
    return li;
  });
  const same = items.length === note.children.length && items.every((li, i) => li.isEqualNode(note.children[i]));
  if (!same) note.replaceChildren(...items);
}

function setNotes(key, messages, { problems = true } = {}) {
  const { el, note } = fields[key];
  fillNote(note, messages);
  el.setAttribute("aria-invalid", problems && messages.length ? "true" : "false");
}

// An empty suggestions list isn't saved as "no suggestions": the page falls
// back to the bundled ones, so say so.
const emptySuggestions = (list) => list.length ? [] : [["The built-in suggestions are used while this list is empty."]];

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
  const covered = tickPresets(lists.sites);
  for (const [key, field] of Object.entries(fields)) {
    field.el.value = lists[key].filter((line) => key !== "sites" || !covered.has(line)).join("\n");
    setNotes(key, key === "suggestions" ? emptySuggestions(lists[key]) : []);
  }
  allowMessages.checked = lists.allowMessages;
  fitAll();
}

// A note under the sites, only when some saved sites can't be redirected
// because the browser hasn't given the extension access to them.
async function refreshAccess() {
  granted = new Set(await sitesWithAccess(saved.sites));
  const missing = saved.sites.filter((s) => !granted.has(s));
  if (!missing.length) return access.replaceChildren();
  if (access.children.length) return;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "btn outline";
  button.textContent = "Allow";
  const li = document.createElement("li");
  li.append("Some of these sites need your permission before they can be redirected. ", button);
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
  const ticked = presets.filter(({ box }) => box.checked).flatMap(({ preset }) => preset.sites);
  lists.sites = [...new Set([...ticked, ...lists.sites])];
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

// Leaving a field (or a checkbox changing) saves at once and tidies what
// was typed: lines are cleaned up, invalid ones flagged. Typing all of a
// preset's sites ticks it, and they leave the textarea.
async function settle(key) {
  const result = await save();
  if (!result) return;
  if (key) {
    const { el } = fields[key];
    const covered = key === "sites" ? tickPresets(saved.sites) : new Set();
    const text = result[key].text.split("\n").filter((line) => !covered.has(line)).join("\n");
    if (el.value !== text) { el.value = text; fit(fields[key]); }
    if (key === "suggestions") setNotes(key, emptySuggestions(result[key].valid), { problems: false });
    else setNotes(key, result[key].invalid.map((line) => [code(line), ` isn’t ${fields[key].what}, so it’s left out.`]));
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

// Ticking a preset asks for access to its sites at once (Firefox only shows
// the prompt before the first await). Without it they're saved anyway, and
// the access note offers to ask again.
for (const { preset, box } of presets) {
  box.addEventListener("change", async () => {
    const missing = box.checked ? preset.sites.filter((s) => !granted.has(s)) : [];
    if (missing.length) requestAccess(missing).catch(() => {});
    await settle("sites");
  });
}

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
  for (const { box } of presets) box.disabled = false;
  resetButton.disabled = false;
  document.fonts.ready.then(fitAll);
  await refreshAccess();
} catch (error) {
  setStatus("error", `Couldn’t load your settings: ${error.message}`);
}
