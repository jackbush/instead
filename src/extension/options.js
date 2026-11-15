import {
  ext, PRESETS, DEFAULT_LISTS, loadPacks, getLists, saveLists, redirectedSites,
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

// The first install opens this page to welcome the user.
if (new URLSearchParams(location.search).has("welcome")) {
  $("title").textContent = document.title = "Welcome to Instead";
  $("welcome").hidden = false;
}

// A checkbox like the direct-messages one, added to `group`.
function checkbox(group, name) {
  const label = Object.assign(document.createElement("label"), { className: "check" });
  const box = Object.assign(document.createElement("input"), { type: "checkbox", disabled: true });
  const text = Object.assign(document.createElement("span"), { textContent: name });
  label.append(box, allowMessages.nextElementSibling.cloneNode(true), text);
  group.append(label);
  return box;
}

// A ticked preset puts its sites on the list; the textarea holds the rest.
const presets = PRESETS.map((preset) => ({ preset, box: checkbox($("presets"), preset.name) }));

// A ticked pack's suggestions are shown; the ones unticked are saved as
// packsOff. The packs come from suggestions.txt as the page loads, and go
// before the Custom box.
let packs = [];
function addPacks(list) {
  packs = list.map((pack) => ({ pack, box: checkbox($("packs"), pack.name) }));
  for (const { box } of packs) box.addEventListener("change", () => settle("custom"));
  $("packs").append(fields.custom.toggle.closest("label"));
}
const packsOff = () => packs.filter(({ box }) => !box.checked).map(({ pack }) => pack.name);

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
// if it isn't valid. Each sits in `wrap` behind the checkbox `toggle`, saved
// as `on`: ticked shows the field and turns its lines on; unticked hides it
// and keeps the lines, turned off.
const toggled = (toggle, on, wrap) => {
  toggle.setAttribute("aria-controls", wrap);
  return { toggle, on, wrap: $(wrap) };
};
const fields = {
  sites: {
    el: $("sites"), note: $("sites-note"), normalise: normaliseSite, what: "a site",
    ...toggled(checkbox($("presets"), "Custom"), "otherSitesOn", "sites-field"),
  },
  exceptions: {
    el: $("exceptions"), note: $("exceptions-note"), normalise: normaliseException, what: "a web address",
    ...toggled($("exceptions-on"), "exceptionsOn", "exceptions-field"),
  },
  custom: {
    el: $("custom"), note: $("custom-note"), normalise: (line) => line, extraLine: true,
    ...toggled(checkbox($("packs"), "Custom"), "customOn", "custom-field"),
  },
};

function showField(field) {
  field.wrap.hidden = !field.toggle.checked;
  fit(field);
}

let saved = {};            // what's in storage
let granted = new Set();   // saved sites the extension has host access to
let saveTimer = 0;         // set while typing hasn't been saved yet
let failure = "";         // why the last save didn't go through, if it didn't
let clearStatus = 0;

paintBackground($("bg"));
addEventListener("resize", () => fitAll());
cutOut($("preview"));

// Size a textarea to its text; the user's own suggestions get one extra line.
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

// With every pack off and none of their own, the page shows every pack
// (suggestionsFor), so say so.
const noSuggestions = (custom) => packsOff().length === packs.length && !(fields.custom.toggle.checked && custom.length)
  ? [["With every kind turned off and none of your own, you’ll get all of them."]] : [];

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
  for (const { pack, box } of packs) box.checked = !lists.packsOff.includes(pack.name);
  for (const [key, field] of Object.entries(fields)) {
    field.toggle.checked = lists[field.on];
    field.wrap.hidden = !lists[field.on];
    field.el.value = lists[key].filter((line) => key !== "sites" || !covered.has(line)).join("\n");
    setNotes(key, key === "custom" ? noSuggestions(lists[key]) : [], { problems: false });
  }
  allowMessages.checked = lists.allowMessages;
  fitAll();
}

// A note under the sites, only when some redirected sites can't be
// because the browser hasn't given the extension access to them.
async function refreshAccess() {
  const sites = redirectedSites(saved);
  granted = new Set(await sitesWithAccess(sites));
  const missing = sites.filter((s) => !granted.has(s));
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
  const request = requestAccess(redirectedSites(saved).filter((s) => !granted.has(s)));
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
  lists.packsOff = packsOff();
  for (const field of Object.values(fields)) lists[field.on] = field.toggle.checked;

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
    if (key === "custom") setNotes(key, noSuggestions(result[key].valid), { problems: false });
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
  // Ticking Custom under the sites asks for access to them at once (Firefox
  // only shows the prompt before the first await).
  field.toggle.addEventListener("change", () => {
    if (key === "sites" && field.toggle.checked) {
      const missing = saved.sites.filter((s) => !granted.has(s));
      if (missing.length) requestAccess(missing).catch(() => {});
    }
    showField(field);
    if (field.toggle.checked && !field.el.value) field.el.focus();
    settle(key);
  });
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
  if (!confirm("Reset the sites, always-allowed pages and suggestions to their defaults? Your own suggestions will be deleted.")) return;
  try {
    render(await saveLists(DEFAULT_LISTS));
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
  addPacks(await loadPacks());
  render(await getLists());
  for (const { el, toggle } of Object.values(fields)) el.disabled = toggle.disabled = false;
  allowMessages.disabled = false;
  for (const { box } of [...presets, ...packs]) box.disabled = false;
  resetButton.disabled = false;
  document.fonts.ready.then(fitAll);
  await refreshAccess();
} catch (error) {
  setStatus("error", `Couldn’t load your settings: ${error.message}`);
}
