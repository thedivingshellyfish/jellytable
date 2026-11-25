/* jellytable :: app.js -- state, rendering and interaction.
   Model: items = [{ name, label, values: string[] }] (label = original column letter / row number). */
(function () {
"use strict";
const F = window.JTFormats, TEXT = window.JTText;
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const PAGE = 100;

/* ---------- Einstellungen (nur Einstellungen, keine Daten) ---------- */
const PKEY = "jellytable-prefs";
let P = { theme: null, lang: null, orient: "cols", autosave: false, lastFmt: null, sideW: 300, fit: true, rowMode: true };
try { Object.assign(P, JSON.parse(localStorage.getItem(PKEY) || "{}")); } catch (e) {}
const savePrefs = () => { try { localStorage.setItem(PKEY, JSON.stringify(P)); } catch (e) {} };
if (!P.lang) P.lang = /^de/i.test(navigator.language || "") ? "de" : "en";
let T = TEXT[P.lang];

/* ---------- Zustand ---------- */
const S = { items: [], orient: "cols", h: 0, d: 1, setup: null, sheets: null, log: [], hideEmpty: false, sort: "file", saveHandle: null, saveFmt: null, fileName: "", srcType: "", delim: ",", encoding: "", sheet: "", cur: 0, page: 0, idItem: -1, filter: "", itemFilter: "", dirty: false, loaded: false, sideOpen: false, renaming: -1 };
const U = { undo: [], redo: [] };

/* ---------- Icons & Logo ---------- */
const I = (p) => '<svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + p + "</svg>";
const ICON = {
  open: I('<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v1H3z"/><path d="M3 10h18l-2 9H5z"/>'),
  save: I('<path d="M5 3h11l3 3v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M7 3v5h8V3M7 21v-7h10v7"/>'),
  export: I('<path d="M12 3v12M7 10l5 5 5-5"/><path d="M5 21h14"/>'),
  undo: I('<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>'), redo: I('<path d="m15 14 5-5-5-5"/><path d="M20 9H10a6 6 0 0 0 0 12h3"/>'),
  sun: I('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
  moon: I('<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>'), more: I('<circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>'),
  search: I('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'), pen: I('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>'),
  trash: I('<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/>'), plus: I('<path d="M12 5v14M5 12h14"/>'), minus: I('<path d="M5 12h14"/>'),
  list: I('<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>'), flip: I('<path d="M7 3v18M17 3v18M3 7h18M3 17h18"/>'),
  key: I('<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M7 10h.01M11 10h.01M15 10h.01M7 14h10"/>'),
  table: I('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M9 4v16"/>'), history: I('<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>'), info: I('<circle cx="12" cy="12" r="9"/><path d="M12 8h.01M11 12h1v5h1"/>'),
  up: I('<path d="m18 15-6-6-6 6"/>'), down: I('<path d="m6 9 6 6 6-6"/>'), lock: I('<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>')
};
// Die Qualle mit Tabellen-Schirm: jellyqda goes table
const LOGO = '<svg viewBox="0 0 64 64" aria-hidden="true"><defs><linearGradient id="jtg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#a78bfa"/><stop offset="1" stop-color="#38bdf8"/></linearGradient><linearGradient id="jtl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".45"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/></linearGradient><clipPath id="jtb"><path d="M14 31c0-10 8-17 18-17s18 7 18 17c0 2-1.5 3.5-3.5 3.5h-29C15.5 34.5 14 33 14 31z"/></clipPath></defs>' +
  '<rect width="64" height="64" rx="18" fill="url(#jtg)"/><rect width="64" height="64" rx="18" fill="url(#jtl)"/>' +
  '<path d="M14 31c0-10 8-17 18-17s18 7 18 17c0 2-1.5 3.5-3.5 3.5h-29C15.5 34.5 14 33 14 31z" fill="#fff"/>' +
  '<g clip-path="url(#jtb)" stroke="#a78bfa" stroke-width="1.4" opacity=".55"><path d="M14 22h36M14 28.5h36M26 14v21M38 14v21"/></g>' +
  '<path d="M20 37c0 6-3 8-3 12M27 37c0 6 2 8 0 13M37 37c0 6-2 8 0 13M44 37c0 6 3 8 3 12" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round"/>' +
  '<circle cx="27.5" cy="25.5" r="2.3" fill="#4c3fb0"/><circle cx="36.5" cy="25.5" r="2.3" fill="#4c3fb0"/><path d="M29.5 29.5q2.5 2 5 0" stroke="#4c3fb0" stroke-width="1.6" fill="none" stroke-linecap="round"/></svg>';
const ORIENT_SVG = (rows) => '<svg viewBox="0 0 110 72" aria-hidden="true">' + Array.from({ length: 4 }, (_, r) => Array.from({ length: 5 }, (_, c) => {
  const hl = rows ? r === 1 : c === 1, head = rows ? c === 0 : r === 0;
  return '<rect x="' + (4 + c * 21) + '" y="' + (4 + r * 16) + '" width="19" height="14" rx="3" fill="' + (hl ? "var(--accent)" : head ? "var(--line2)" : "var(--card2)") + '" stroke="var(--line2)" stroke-width=".8" opacity="' + (hl ? 1 : .9) + '"/>';
}).join("")).join("") + "</svg>";

/* ---------- Hilfsfunktionen ---------- */
const itemName = (it, i) => it.name !== "" ? it.name : (S.orient === "cols" ? T.col : T.row) + " " + (it.label || i + 1);
const maxLen = () => S.items.reduce((a, it) => Math.max(a, it.values.length), 0);
function toast(msg) { const t = $("toast"); t.textContent = msg; t.classList.add("show"); clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove("show"), 1900); }
function setDirty(v) { S.dirty = v; renderBarState(); if (v) autosaveSoon(); }
const transpose = (g) => {
  const w = g.reduce((a, r) => Math.max(a, r.length), 0), out = [];
  for (let j = 0; j < w; j++) { const r = new Array(g.length); for (let i = 0; i < g.length; i++) r[i] = g[i][j] ?? ""; out.push(r); }
  return out;
};
// Jedes Item ist eine "Linie" der Tabelle (Spalte bei Items als Spalten, Zeile bei Items als Zeilen).
// h = Position der Item-Namen in der Linie (-1 = keine), d = Beginn der Einträge;
// alle Positionen vor d außer h sind Item-Details (meta) und bleiben beim Export erhalten.
function fromGrid(grid, orient, h, d) {
  const lines = orient === "rows" ? grid : transpose(grid);
  return lines.map((ln, i) => ({
    name: h >= 0 ? String(ln[h] ?? "") : "", meta: ln.slice(0, d).filter((_, k) => k !== h).map((v) => v ?? ""),
    label: orient === "cols" ? F.colName(i) : String(i + 1), values: ln.slice(d).map((v) => v ?? "")
  }));
}
function itemLines(withHead) {
  const n = maxLen();
  return S.items.map((it) => {
    const head = [];
    if (withHead) { let m = 0; for (let k = 0; k < S.d; k++) head.push(k === S.h ? it.name : ((it.meta || [])[m++] ?? "")); }
    const v = it.values.slice(); while (v.length < n) v.push("");
    return head.concat(v);
  });
}
const toGrid = (orient, withHead) => { const L = itemLines(withHead); return orient === "rows" ? L : transpose(L); };
const metaText = (it) => (it.meta || []).filter((v) => v !== "").join(" · ");

/* ---------- Änderungsprotokoll (4) ---------- */
// Jede Aktion landet mit Zeitstempel im Protokoll; geänderte Einträge werden markiert.
function logAct(a, x) { S.log.push(Object.assign({ at: new Date().toISOString(), a }, x || {})); const b = $("logcount"); if (b) { b.textContent = S.log.length; b.hidden = !S.log.length; } return S.log[S.log.length - 1]; }
const labelOf = (k) => S.idItem >= 0 && S.items[S.idItem] ? (S.items[S.idItem].values[k] ?? "") : "";
function mark(i, k) { const it = S.items[i]; if (!it) return; (it.changed || (it.changed = new Set())).add(k); }
function shiftMarks(it, k, delta) {
  if (!it.changed || !it.changed.size) return;
  const n = new Set();
  it.changed.forEach((x) => { if (x < k) n.add(x); else if (delta > 0) n.add(x + delta); else if (x > k) n.add(x - 1); });
  it.changed = n;
}

/* ---------- Undo ---------- */
function pushUndo(op, entry) { if (entry) op.log = entry; U.undo.push(op); if (U.undo.length > 500) U.undo.shift(); U.redo = []; renderBarState(); }
const snapItem = (i) => ({ kind: "item", i, name: S.items[i].name, values: S.items[i].values.slice() });
const snapAll = () => ({ kind: "all", items: S.items.map((it) => ({ name: it.name, label: it.label, meta: it.meta, values: it.values })), cur: S.cur, orient: S.orient, h: S.h, d: S.d, idItem: S.idItem });
function applyOp(op) { const inv = applyOp0(op); inv.log = op.log; return inv; }
function applyOp0(op) {   // gibt die Gegen-Operation zurück
  if (op.kind === "delrow") { const vals = S.items.map((it) => { shiftMarks(it, op.k, -1); return it.values.length > op.k ? it.values.splice(op.k, 1)[0] : ""; }); return { kind: "insrow", k: op.k, vals }; }
  if (op.kind === "insrow") { S.items.forEach((it, i) => { while (it.values.length < op.k) it.values.push(""); it.values.splice(op.k, 0, op.vals ? op.vals[i] ?? "" : ""); shiftMarks(it, op.k, 1); }); return { kind: "delrow", k: op.k }; }
  if (op.kind === "cell") { const inv = { kind: "cell", i: op.i, k: op.k, v: S.items[op.i].values[op.k] ?? "", keep: op.keep }; S.items[op.i].values[op.k] = op.v; if (!op.keep) S.cur = op.i; return inv; }
  if (op.kind === "item") { const inv = snapItem(op.i); S.items[op.i].name = op.name; S.items[op.i].values = op.values; S.cur = op.i; return inv; }
  const inv = snapAll(); S.items = op.items.map((it) => ({ name: it.name, label: it.label, meta: it.meta, values: it.values })); S.cur = Math.min(op.cur, S.items.length - 1);
  S.orient = op.orient; S.h = op.h; S.d = op.d; S.idItem = op.idItem; return inv;
}
function undo(redo) {
  const from = redo ? U.redo : U.undo, to = redo ? U.undo : U.redo;
  if (!from.length) { toast(T.nothing); return; }
  const op = from.pop(); to.push(applyOp(op));
  if (op.kind === "cell") mark(op.i, op.k);
  logAct(redo ? "redo" : "undo", { ref: op.log ? descr(op.log) : "" });
  setDirty(true); if (op.kind === "all") renderBrowser(); else { renderSide(); renderMain(); } toast(redo ? T.redone : T.undone);
}

/* ---------- Laden ---------- */
async function loadFile(file) {
  if ($("loaderr")) { $("loaderr").hidden = true; $("busy").hidden = false; }
  try {
    const book = await F.open(file);
    let idx = 0;
    if (book.sheets.length > 1) { idx = await chooseSheet(book.sheets); if (idx == null) return; }
    const rows = F.rectangular(await book.load(idx));
    if (!rows.length) throw F.err("empty");
    S.sheets = null;
    if (book.sheets.length > 1) {   // die anderen Blätter unverändert mitnehmen
      S.sheets = [];
      for (let i = 0; i < book.sheets.length; i++) S.sheets.push(i === idx ? { name: book.sheets[i], cur: true } : { name: book.sheets[i], rows: F.rectangular(await book.load(i)) });
    }
    S.fileName = file.name.replace(/\.[^.]+$/, ""); S.srcType = book.type; S.delim = book.delim || ","; S.encoding = book.encoding || ""; S.sheet = book.sheets.length > 1 ? book.sheets[idx] : "";
    openSetup(rows, P.orient, null, false);
  } catch (e) {
    console.error(e);
    if (S.loaded) { S.loaded = false; render(); }
    $("loaderr").textContent = (e.code && T.err[e.code]) || (T.err.unknown + " (" + e.message + ")");
    $("loaderr").hidden = false;
  } finally { const b = $("busy"); if (b) b.hidden = true; }
}
function afterLoad(idItem, keepLog) {
  S.loaded = true; S.setup = null; S.cur = 0; S.page = 0; S.idItem = idItem ?? -1; S.filter = ""; S.itemFilter = ""; S.hideEmpty = false; S.sort = "file"; U.undo = []; U.redo = [];
  S.saveHandle = null; S.saveFmt = null;
  if (!keepLog) { S.log = []; logAct("load", { file: S.fileName, sheet: S.sheet, items: S.items.length, entries: maxLen() }); }
  S.dirty = false; render(); toast(T.loaded(S.items.length, maxLen()));
}
function chooseSheet(names) {
  return new Promise((res) => {
    const d = $("dlg");
    d.innerHTML = '<div class="dh"><h2>' + T.sheetT + '</h2></div><div class="db"><p class="muted small" style="margin-top:0">' + T.sheetD + '</p><div class="sheets">' +
      names.map((n, i) => '<button class="btn" data-i="' + i + '">' + esc(n) + "</button>").join("") + '</div></div><div class="df"><button class="btn ghost" data-c="1">' + T.cancel + "</button></div>";
    d.onchange = null; d.onclose = null;
    d.onclick = (e) => { const b = e.target.closest("button"); if (!b) return; d.close(); res(b.dataset.c ? null : +b.dataset.i); };
    d.showModal();
  });
}
function sampleCSV() {
  const de = P.lang === "de";
  const head = de ? ["ID", "Alter", "Studiengang", "Zufriedenheit (1–5)", "Was gefällt dir am Studium?", "Was sollte sich ändern?"] : ["ID", "Age", "Programme", "Satisfaction (1–5)", "What do you like about your studies?", "What should change?"];
  const rows = de ? [
    ["P01", "23", "Soziologie", "4", "Die Seminare sind klein, man kann viel diskutieren.", "Mehr Lernräume in der Prüfungszeit."],
    ["P02", "27", "Psychologie", "3", "Methodenkurse; ich mag die Statistik inzwischen sogar.", ""],
    ["P03", "21", "Soziologie", "5", "Die Leute! Und dass Forschung so nah dran ist.", "Nichts, wirklich."],
    ["P04", "", "Erziehungswissenschaft", "2", "", "Die Anmeldung zu Kursen ist chaotisch, oft schon nach Minuten voll."],
    ["P05", "24", "Psychologie", "4", "Praktikum im 5. Semester war super.", "Bessere Betreuung bei der Abschlussarbeit."],
    ["P06", "30", "Soziologie", "3", "Flexible Zeiten, ich arbeite nebenbei.", "Mehr Online-Angebote,\nvor allem abends."],
    ["P07", "22", "Erziehungswissenschaft", "4", "Projektseminar mit einer Schule.", ""],
    ["P08", "26", "Psychologie", "1", "", "Zu viel Druck, zu wenig Rückmeldung."],
    ["P09", "25", "Soziologie", "5", "Die qualitative Forschungswerkstatt 🪼", "Mehr davon!"],
    ["P10", "28", "Erziehungswissenschaft", "3", "Bibliothek, ruhig und gut ausgestattet.", "Mensa: mehr vegane Gerichte."]
  ] : [
    ["P01", "23", "Sociology", "4", "Small seminars, lots of room for discussion.", "More study spaces during exams."],
    ["P02", "27", "Psychology", "3", "Methods courses; I even like statistics now.", ""],
    ["P03", "21", "Sociology", "5", "The people! And how close research is.", "Nothing, really."],
    ["P04", "", "Education", "2", "", "Course registration is chaotic, often full within minutes."],
    ["P05", "24", "Psychology", "4", "The internship in semester 5 was great.", "Better supervision for the thesis."],
    ["P06", "30", "Sociology", "3", "Flexible hours, I work on the side.", "More online options,\nespecially in the evening."],
    ["P07", "22", "Education", "4", "Project seminar with a school.", ""],
    ["P08", "26", "Psychology", "1", "", "Too much pressure, too little feedback."],
    ["P09", "25", "Sociology", "5", "The qualitative research workshop 🪼", "More of that!"],
    ["P10", "28", "Education", "3", "The library, quiet and well equipped.", "Canteen: more vegan dishes."]
  ];
  return F.toCSV([head].concat(rows), ";", false);
}

/* ---------- Schritt 3: Bezeichnungen festlegen ---------- */
function guessSetup(grid, orient) {
  const L = orient === "rows" ? grid : transpose(grid), len = L.reduce((a, l) => Math.max(a, l.length), 0), at = (k) => L.map((l) => l[k] ?? "");
  let h = 0;
  const first = at(0).filter((v) => v !== "");
  if (!first.length || first.filter((v) => F.isNumber(v)).length > first.length * 0.6) h = -1;
  let d = h + 1;
  for (let k = d; k < Math.min(8, len); k++) if (at(k).some((v) => /^\{"ImportId"/.test(v))) d = k + 1;   // Qualtrics: 3 Kopfzeilen
  let lab = -1;
  if (h >= 0) lab = at(h).findIndex((n) => /^(id|ids|response ?id|respondent ?id|participant ?id|case ?id|lfdn|fall(nummer)?|nr\.?|code|teilnehmer(-?id)?|person(en)?-?id|serial)$/i.test(String(n).trim()));
  if (lab < 0 && L.length > 1) { const v = (L[0] || []).slice(d); if (v.length > 1 && v.every((x) => x !== "") && new Set(v).size === v.length) lab = 0; }
  return { h, d: Math.max(0, Math.min(d, len - 1)), lab };
}
function openSetup(grid, orient, cfg, reconf) {
  const g = cfg || guessSetup(grid, orient);
  S.setup = { grid, orient, h: g.h, d: g.d, lab: g.lab, reconf, L: orient === "rows" ? grid : transpose(grid) };
  if (S.setup.d <= S.setup.h) S.setup.d = S.setup.h + 1;
  render(); window.scrollTo(0, 0);
}
function setupOrient(o) {
  const u = S.setup; if (u.orient === o) return;
  const g = guessSetup(u.grid, o);
  Object.assign(u, { orient: o, h: g.h, d: g.d, lab: g.lab, L: o === "rows" ? u.grid : transpose(u.grid) });
  renderSetup();
}
function renderSetup() {
  const u = S.setup, rows = u.orient === "rows", L = u.L, len = L.reduce((a, l) => Math.max(a, l.length), 0);
  const posName = (k) => rows ? T.colN(F.colName(k)) : T.rowN(k + 1);
  const itemPos = (i) => rows ? T.rowN(i + 1) : T.colN(F.colName(i));
  const peek = (k) => { const v = L.map((l) => l[k] ?? "").filter((x) => x !== "").slice(0, 3).join(", "); return v.length > 46 ? v.slice(0, 45) + "…" : v; };
  const opt = (v, txt, sel) => '<option value="' + v + '"' + (sel ? " selected" : "") + ">" + esc(txt) + "</option>";
  let names = opt(-1, T.none, u.h === -1);
  for (let k = 0; k < Math.min(len, 25); k++) names += opt(k, posName(k) + (peek(k) ? " – " + peek(k) : ""), u.h === k);
  let data = "";
  for (let k = u.h + 1; k < Math.min(len, u.h + 31); k++) data += opt(k, posName(k) + (peek(k) ? " – " + peek(k) : ""), u.d === k);
  let lab = opt(-1, T.none, u.lab === -1);
  for (let i = 0; i < Math.min(L.length, 300); i++) { const n = u.h >= 0 ? String(L[i][u.h] ?? "") : ""; lab += opt(i, itemPos(i) + (n ? " – " + n : ""), u.lab === i); }
  // Vorschau
  const R = Math.min(u.grid.length, 14), C = Math.min(u.grid.reduce((a, r) => Math.max(a, r.length), 0), 10);
  let tb = "<tr><th></th>" + Array.from({ length: C }, (_, c) => "<th>" + F.colName(c) + "</th>").join("") + "</tr>";
  for (let r = 0; r < R; r++) {
    tb += "<tr><th>" + (r + 1) + "</th>";
    for (let c = 0; c < C; c++) {
      const p = rows ? c : r, i = rows ? r : c, v = String(u.grid[r][c] ?? "");
      const cls = (p === u.h ? "nm" : p < u.d ? "mt" : "dt") + (i === u.lab ? " lb" : "");
      tb += '<td class="' + cls + '" title="' + esc(v) + '">' + esc(v.length > 40 ? v.slice(0, 39) + "…" : v) + "</td>";
    }
    tb += "</tr>";
  }
  const metaN = u.d - (u.h >= 0 && u.h < u.d ? 1 : 0);
  $("view").innerHTML = '<div class="start">' +
    '<section class="panel step"><div class="sn">3</div><div><h2>' + T.s3 + '</h2><p class="muted" style="margin:-4px 0 14px">' + T.s3D + "</p>" +
    '<div class="sugrid">' +
      '<div class="field span2" style="margin:0">' + T.orientT + '<div class="orients compact">' +
        '<button class="orient' + (!rows ? " on" : "") + '" data-act="su-orient" data-k="cols" aria-pressed="' + !rows + '">' + ORIENT_SVG(false) + "<span><b>" + T.colsT + "</b><small>" + T.colsD + "</small></span>" + (!rows ? '<span class="tick">✓</span>' : "") + "</button>" +
        '<button class="orient' + (rows ? " on" : "") + '" data-act="su-orient" data-k="rows" aria-pressed="' + rows + '">' + ORIENT_SVG(true) + "<span><b>" + T.rowsT + "</b><small>" + T.rowsD + "</small></span>" + (rows ? '<span class="tick">✓</span>' : "") + "</button></div></div>" +
      '<label class="field" style="margin:0"><span><i class="lg nm"></i>' + T.namesAt + '</span><select id="su-names">' + names + "</select></label>" +
      '<label class="field" style="margin:0"><span><i class="lg dt"></i>' + T.dataAt + '</span><select id="su-data">' + data + "</select></label>" +
      '<label class="field" style="margin:0"><span><i class="lg lb"></i>' + T.labelAt + '</span><select id="su-lab">' + lab + "</select></label>" +
    "</div>" +
    '<div class="legend"><span><i class="lg nm"></i>' + T.legName + '</span><span><i class="lg mt"></i>' + T.legMeta + '</span><span><i class="lg dt"></i>' + T.legData + '</span><span><i class="lg lb"></i>' + T.legLabel + "</span></div>" +
    '<div class="prevwrap"><table class="prev">' + tb + "</table></div>" +
    '<p class="small muted">' + T.previewNote(R, C, u.grid.length, u.grid.reduce((a, r) => Math.max(a, r.length), 0)) + "</p>" +
    '<div class="sum">→ ' + T.sum(L.length, Math.max(0, len - u.d), rows) + (metaN > 0 ? "<br>" + T.sumMeta(metaN, rows) : "") + "</div>" +
    '<div class="btnrow2"><button class="btn ghost" data-act="su-cancel">' + T.back + '</button><button class="btn primary" data-act="su-apply">' + T.apply + "</button></div>" +
    "</div></section></div>";
}
function applySetup() {
  const u = S.setup;
  if (u.reconf) pushUndo(snapAll(), logAct("setup", { orient: u.orient }));
  S.items = fromGrid(u.grid, u.orient, u.h, u.d); S.orient = u.orient; S.h = u.h; S.d = u.d;
  if (u.reconf) { S.setup = null; S.idItem = u.lab; S.cur = Math.min(S.cur, S.items.length - 1); S.page = 0; setDirty(true); render(); }
  else { P.orient = u.orient; savePrefs(); afterLoad(u.lab); }
}

/* ---------- Speichern / Export ---------- */
const FMT = {
  xlsx: { ext: "xlsx", mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
  ods: { ext: "ods", mime: "application/vnd.oasis.opendocument.spreadsheet" },
  csv: { ext: "csv", mime: "text/csv" }, csvx: { ext: "csv", mime: "text/csv" }, tsv: { ext: "tsv", mime: "text/tab-separated-values" },
  xml: { ext: "xml", mime: "application/xml" }, json: { ext: "json", mime: "application/json" }
};
const defaultFmt = () => P.lastFmt || ({ xlsx: "xlsx", ods: "ods", tsv: "tsv", xml2003: "xml", csv: S.delim === ";" ? "csvx" : "csv" }[S.srcType] || "xlsx");
async function buildFile(fmt, orient, names) {
  const grid = toGrid(orient, names), sheet = S.sheet || S.fileName || "jellytable";
  const hd = names ? S.d : 0, hn = names ? S.h : -1;
  const bold = orient === "cols" ? { boldRow: hn, freezeRows: hd } : { boldCol: hn, freezeCols: hd };
  // weitere Tabellenblätter der Originaldatei unverändert mitschreiben (nur Werte)
  const all = S.sheets ? S.sheets.map((x) => x.cur ? { name: x.name, rows: grid, opt: bold } : { name: x.name, rows: x.rows, opt: {} }) : [{ name: sheet, rows: grid, opt: bold }];
  if (fmt === "xlsx") return F.writeXLSX(all);
  if (fmt === "ods") return F.writeODS(all);
  if (fmt === "csv") return new Blob([F.toCSV(grid, ",", false)]);
  if (fmt === "csvx") return new Blob([F.toCSV(grid, ";", true)]);
  if (fmt === "tsv") return new Blob([F.toCSV(grid, "\t", false)]);
  if (fmt === "xml") return new Blob([F.writeXML2003(all)]);
  return new Blob([JSON.stringify({ file: S.fileName, layout: orient, items: S.items.map((it, i) => ({ name: itemName(it, i), details: it.meta || [], values: it.values })) }, null, 2)]);
}
// Speichern: Chrome/Edge fragen beim ersten Mal nach dem Speicherort und schreiben danach direkt dorthin
// (File System Access API). Firefox/Safari: Download. Die Originaldatei wird nie automatisch überschrieben.
const canPick = () => typeof window.showSaveFilePicker === "function" && !window.__jtNoPicker;
async function saveBlob(blob, name, fmt, ask) {
  if (canPick()) {
    try {
      let h = !ask && S.saveHandle && S.saveFmt === fmt ? S.saveHandle : null;
      if (!h) h = await window.showSaveFilePicker({ suggestedName: name, types: [{ description: T.fmts[fmt] ? T.fmts[fmt][0] : name, accept: { [FMT[fmt].mime]: ["." + FMT[fmt].ext] } }] });
      const w = await h.createWritable(); await w.write(blob); await w.close();
      S.saveHandle = h; S.saveFmt = fmt; return h.name;
    } catch (e) { if (e && e.name === "AbortError") return null; console.warn("save picker", e); }
  }
  const url = URL.createObjectURL(blob), a = document.createElement("a");
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return name;
}
async function download(fmt, orient, names, base, ask) {
  const blob = new Blob([await buildFile(fmt, orient, names)], { type: FMT[fmt].mime });
  const name = (base || S.fileName || "jellytable").replace(/[\\/:*?"<>|]+/g, "-") + "." + FMT[fmt].ext;
  const saved = await saveBlob(blob, name, fmt, ask);
  if (!saved) return;
  P.lastFmt = fmt; savePrefs(); setDirty(false); logAct("save", { file: saved }); toast(T.saved + "  " + saved);
}
const quickSave = () => S.loaded && download(defaultFmt(), S.orient, true, null, false);
const ONE_SHEET = { csv: 1, csvx: 1, tsv: 1, json: 1 };
function exportDialog() {
  if (!S.loaded) return;
  const d = $("dlg"), cur = defaultFmt();
  d.innerHTML = '<form method="dialog"><div class="dh"><h2>' + T.expT + '</h2></div><div class="db"><div class="muted small" style="margin-bottom:6px">' + T.fmtT + '</div><div class="fmts">' +
    Object.keys(FMT).map((k) => '<label class="fmt"><input type="radio" name="fmt" value="' + k + '"' + (k === cur ? " checked" : "") + "><span><b>" + T.fmts[k][0] + "</b><small>" + T.fmts[k][1] + "</small></span></label>").join("") + "</div>" +
    '<label class="field">' + T.orientT + '<select name="orient"><option value="cols"' + (S.orient === "cols" ? " selected" : "") + ">" + T.colsT + '</option><option value="rows"' + (S.orient === "rows" ? " selected" : "") + ">" + T.rowsT + "</option></select></label>" +
    '<label class="check"><input type="checkbox" name="names" checked>' + T.namesT + "</label>" +
    '<label class="field">' + T.fileT + '<input name="base" value="' + esc(S.fileName || "jellytable") + '" spellcheck="false"></label>' +
    (S.sheets ? '<p class="note" id="sheetnote"></p>' : "") + '<p class="small muted" style="margin:10px 0 0">' + (canPick() ? T.saveWhereChrome : T.saveWhereOther) + "</p></div>" +
    '<div class="df"><button class="btn ghost" value="cancel">' + T.cancel + '</button><button class="btn primary" value="ok">' + ICON.export + " " + T.doExport + "</button></div></form>";
  d.onclick = null;
  const note = () => { const n = $("sheetnote"); if (!n) return; const f = d.querySelector("form").fmt.value; n.textContent = ONE_SHEET[f] ? T.sheetOne(S.sheets.length - 1) : T.sheetAll(S.sheets.length - 1); n.classList.toggle("warn", !!ONE_SHEET[f]); };
  d.onchange = note; note();
  d.onclose = () => {
    if (d.returnValue !== "ok") return;
    const f = d.querySelector("form");
    download(f.fmt.value, f.orient.value, f.names.checked, f.base.value.trim(), true);
  };
  d.returnValue = ""; d.showModal();
}

/* ---------- Arbeitsstand im Browser (nur wenn eingeschaltet) ---------- */
const DB = {
  open: () => new Promise((res, rej) => { const r = indexedDB.open("jellytable", 1); r.onupgradeneeded = () => r.result.createObjectStore("s"); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }),
  async put(v) { const db = await this.open(); return new Promise((res) => { const t = db.transaction("s", "readwrite"); t.objectStore("s").put(v, "session"); t.oncomplete = res; t.onerror = res; }); },
  async get() { const db = await this.open(); return new Promise((res) => { const r = db.transaction("s").objectStore("s").get("session"); r.onsuccess = () => res(r.result); r.onerror = () => res(null); }); },
  async clear() { try { const db = await this.open(); db.transaction("s", "readwrite").objectStore("s").clear(); } catch (e) {} }
};
function autosaveSoon() {
  if (!P.autosave || !S.loaded) return;
  clearTimeout(autosaveSoon.h);
  autosaveSoon.h = setTimeout(() => DB.put({ items: S.items, orient: S.orient, h: S.h, d: S.d, idItem: S.idItem, sheets: S.sheets, log: S.log, fileName: S.fileName, srcType: S.srcType, delim: S.delim, sheet: S.sheet, at: new Date().toISOString() }).catch(() => {}), 800);
}

/* ---------- Rendern: Menüzeile ---------- */
function renderBar() {
  const th = document.documentElement.getAttribute("data-theme");
  $("bar").innerHTML =
    '<a class="brand" href="#" data-act="home" title="jellytable">' + LOGO + "<span><b>jellytable</b><small>" + T.tagline + "</small></span></a>" +
    '<div class="fileinfo">' + (S.loaded ? '<button class="ib sidetoggle" data-act="side" title="' + T.showItems + '">' + ICON.list + '</button><input class="fname" id="fname" value="' + esc(S.fileName) + '" title="' + T.fileNameTitle + '" spellcheck="false">' +
      '<span class="pill" id="fmtpill">' + esc([S.srcType.toUpperCase(), S.sheet + (S.sheets ? " (" + S.sheets.length + " " + T.sheetsWord + ")" : ""), S.srcType === "csv" ? (S.delim === "\t" ? "TAB" : S.delim) : "", S.encoding].filter(Boolean).join(" · ")) + '</span><span class="pill dirty" id="dirtypill" hidden>● ' + T.unsaved + "</span>" : "") + "</div>" +
    '<div class="tools">' +
      '<button class="ib w" data-act="open" title="' + T.open + ' (Ctrl+O)">' + ICON.open + '<span class="lbl">' + T.open + "</span></button>" +
      (S.loaded ? '<button class="ib w" data-act="reorient" title="' + T.reorientD + '">' + ICON.table + '<span class="lbl">' + T.setupBtn + '</span></button><button class="ib w" data-act="log" title="' + T.logT + '">' + ICON.history + '<span class="lbl">' + T.logBtn + '</span><span class="cnt" id="logcount"' + (S.log.length ? "" : " hidden") + ">" + S.log.length + '</span></button><span class="sep"></span>' : "") +
      (S.loaded ? '<button class="ib primary" data-act="save" title="' + T.save + ' (Ctrl+S)">' + ICON.save + '<span class="lbl">' + T.save + '</span></button><button class="ib w" data-act="export" title="' + T.export + ' (Ctrl+E)">' + ICON.export + '<span class="lbl">' + T.export + "</span></button>" +
        '<span class="sep"></span><button class="ib w" id="bundo" data-act="undo" title="' + T.undo + ' (Ctrl+Z)">' + ICON.undo + '</button><button class="ib w" id="bredo" data-act="redo" title="' + T.redo + ' (Ctrl+Y)">' + ICON.redo + "</button>" : "") +
      '<span class="sep"></span><button class="ib w" data-act="lang" title="' + T.langTitle + '" lang="' + (P.lang === "de" ? "en" : "de") + '">' + T.langBtn + "</button>" +
      '<button class="ib w" data-act="theme" title="' + T.theme + '" aria-label="' + T.theme + '">' + (th === "light" ? ICON.moon : ICON.sun) + "</button>" +
      '<button class="ib" data-act="menu" title="' + T.more + '" aria-label="' + T.more + '">' + ICON.more + "</button>" +
    "</div>";
  renderBarState();
}
function renderBarState() {
  const dp = $("dirtypill"); if (dp) dp.hidden = !S.dirty;
  const bu = $("bundo"), br = $("bredo"); if (bu) bu.disabled = !U.undo.length; if (br) br.disabled = !U.redo.length;
  document.title = (S.loaded ? (S.dirty ? "● " : "") + (S.fileName || "jellytable") + " – " : "") + "jellytable";
}
function toggleMenu() {
  let m = $("menu");
  if (m) { m.remove(); return; }
  m = document.createElement("div"); m.className = "menu"; m.id = "menu";
  const th = document.documentElement.getAttribute("data-theme");
  m.innerHTML = '<div class="nw"><button data-act="open">' + ICON.open + "<span>" + T.open + "</span></button>" +
    (S.loaded ? '<button data-act="log">' + ICON.history + "<span>" + T.logT + '</span></button><button data-act="export">' + ICON.export + "<span>" + T.export + '</span></button><button data-act="undo"' + (U.undo.length ? "" : " disabled") + ">" + ICON.undo + "<span>" + T.undo + '</span></button><button data-act="redo"' + (U.redo.length ? "" : " disabled") + ">" + ICON.redo + "<span>" + T.redo + "</span></button>" : "") +
    '<button data-act="lang"><span class="kbd">' + T.langBtn + "</span><span>" + T.langTitle + '</span></button><button data-act="theme">' + (th === "light" ? ICON.moon : ICON.sun) + "<span>" + T.theme + "</span></button><hr></div>" +
    (S.loaded ? '<button data-act="reorient">' + ICON.table + "<span>" + T.reorient + "<small>" + T.reorientD + "</small></span></button>" : "") +
    '<label><input type="checkbox" data-act="autosave"' + (P.autosave ? " checked" : "") + "><span>" + T.autosave + "<small>" + T.autosaveD + "</small></span></label>" +
    '<button data-act="forget">' + ICON.trash + "<span>" + T.forget + "<small>" + T.forgetD + "</small></span></button><hr>" +
    '<button data-act="shortcuts">' + ICON.key + "<span>" + T.shortcuts + '</span></button><button data-act="about">' + ICON.info + "<span>" + T.about + "</span></button>";
  document.body.appendChild(m);
}

/* ---------- Rendern: Startseite ---------- */
async function renderStart() {
  $("view").innerHTML = '<div class="start">' +
    '<div class="hero"><div class="row"><svg class="big" viewBox="0 0 64 64">' + LOGO.slice(LOGO.indexOf(">") + 1) + '<div><div class="joke">' + T.joke + "</div><h1>" + T.heroT + "</h1><p>" + T.heroD + "</p></div></div></div>" +
    '<div class="privacy">' + ICON.lock + "<div><b>" + T.privT + "</b>" + T.privD + "</div></div>" +
    '<div id="restore"></div>' +
    '<section class="panel step"><div class="sn">1</div><div><h2>' + T.s1 + '</h2><div class="orients">' +
      '<button class="orient' + (P.orient === "cols" ? " on" : "") + '" data-act="orient" data-k="cols">' + ORIENT_SVG(false) + "<span><b>" + T.colsT + "</b><small>" + T.colsD + "</small></span></button>" +
      '<button class="orient' + (P.orient === "rows" ? " on" : "") + '" data-act="orient" data-k="rows">' + ORIENT_SVG(true) + "<span><b>" + T.rowsT + "</b><small>" + T.rowsD + "</small></span></button></div>" +
      "</div></section>" +
    '<section class="panel step"><div class="sn">2</div><div><h2>' + T.s2 + "</h2>" +
      '<label class="drop" id="drop"><span class="dic">🪼</span><b>' + T.drop + '</b><span class="small muted">' + T.or + '</span><span class="btn small primary">' + T.pick + "</span>" +
      '<span class="formats"><span>.csv</span><span>.tsv</span><span>.txt</span><span>.xlsx</span><span>.xlsm</span><span>.ods</span><span>Excel 2003 .xml</span></span></label>' +
      '<div style="text-align:center;margin-top:10px"><button class="btn small ghost" data-act="sample">' + T.sample + "</button></div>" +
      '<div id="busy" class="small muted" style="text-align:center;margin-top:8px" hidden>' + T.loading + '</div><div id="loaderr" class="err" hidden></div></div></section>' +
    '<div class="feat">' + [T.f1, T.f2, T.f3, T.f4].map((f) => "<div><b>" + f[0] + "</b>" + f[1] + "</div>").join("") + "</div>" +
    '<div class="foot">' + T.foot + "</div></div>";
  const dz = $("drop");
  dz.addEventListener("click", (e) => { e.preventDefault(); $("file").click(); });
  dz.addEventListener("dragover", (e) => { e.preventDefault(); dz.classList.add("over"); });
  dz.addEventListener("dragleave", () => dz.classList.remove("over"));
  dz.addEventListener("drop", (e) => { e.preventDefault(); dz.classList.remove("over"); if (e.dataTransfer.files[0]) loadFile(e.dataTransfer.files[0]); });
  if (P.autosave) {
    try {
      const s = await DB.get();
      if (s && s.items && $("restore")) $("restore").innerHTML = '<div class="panel" style="margin-bottom:14px;display:flex;gap:12px;align-items:center;flex-wrap:wrap"><div style="flex:1;min-width:200px"><b>' + T.restoreT + "</b><div class=\"small muted\">" +
        T.restoreD(esc(s.fileName || "jellytable"), new Date(s.at).toLocaleString(P.lang)) + '</div></div><button class="btn small primary" data-act="restore">' + T.restore + '</button><button class="btn small" data-act="discard">' + T.discard + "</button></div>";
    } catch (e) {}
  }
}

/* ---------- Rendern: Browser ---------- */
function renderBrowser() {
  $("view").innerHTML = '<div class="browser' + (S.sideOpen ? " sideopen" : "") + '" id="browser" style="--sidew:' + P.sideW + 'px"><aside class="side"><div class="head"><div class="t"><span>' + T.itemsT + '</span><span id="icount"></span></div>' +
    '<div class="search">' + ICON.search + '<input type="search" id="isearch" placeholder="' + T.itemSearch + '" value="' + esc(S.itemFilter) + '"></div></div>' +
    '<ul class="items" id="items"></ul><div class="foot2"><button class="btn small" data-act="additem">' + ICON.plus + " " + T.addItem + '</button></div><div class="resizer" id="resizer" role="separator" aria-orientation="vertical" aria-label="' + T.resize + '" title="' + T.resize + '" tabindex="0"></div></aside>' +
    '<main class="main" id="main"></main></div>';
  renderSide(); renderMain();
}
function renderSide() {
  const ul = $("items"); if (!ul) return;
  const q = S.itemFilter.trim().toLowerCase(), n = maxLen() || 1;
  const list = S.items.map((it, i) => [it, i]).filter(([it, i]) => !q || (itemName(it, i) + " " + metaText(it)).toLowerCase().includes(q));
  $("icount").textContent = S.items.length;
  ul.innerHTML = list.length ? list.map(([it, i]) => {
    const filled = it.values.filter((v) => v !== "").length;
    const nm = S.renaming === i ? '<input class="rn" id="rn" value="' + esc(it.name) + '">' : '<span class="nm' + (it.name === "" ? " ph" : "") + '">' + esc(itemName(it, i)) + "</span>";
    return '<li class="it' + (i === S.cur ? " on" : "") + '" data-act="pick" data-i="' + i + '" title="' + esc(itemName(it, i) + (metaText(it) ? "\n" + metaText(it) : "")) + '"><span class="num">' + esc(it.label || i + 1) + "</span>" + nm +
      '<span class="fill" title="' + filled + "/" + it.values.length + " " + T.filled + '"><i style="width:' + Math.round(100 * filled / n) + '%"></i></span>' +
      '<span class="acts"><button data-act="rename" data-i="' + i + '" title="' + T.rename + '">' + ICON.pen + '</button><button data-act="delitem" data-i="' + i + '" title="' + T.delItem + '">' + ICON.trash + "</button></span></li>";
  }).join("") : '<li class="it muted">' + T.noItems + "</li>";
  const rn = $("rn"); if (rn) { rn.focus(); rn.select(); }
  const on = ul.querySelector(".it.on"); if (on && !rn) on.scrollIntoView({ block: "nearest" });
}
// Ansicht: Suche, leere ausblenden, Sortierung -> Liste von Positionen (null = Datei-Reihenfolge, alles)
function matches() {
  const it = S.items[S.cur], q = S.filter.trim().toLowerCase();
  if (!q && !S.hideEmpty && S.sort === "file") return null;
  let out = [];
  it.values.forEach((v, k) => { if ((!q || v.toLowerCase().includes(q)) && (!S.hideEmpty || v !== "")) out.push(k); });
  const V = it.values, cmp = (a, b) => (V[a] === "") - (V[b] === "") || V[a].localeCompare(V[b], undefined, { numeric: true, sensitivity: "base" }) || a - b;
  if (S.sort === "az") out.sort(cmp);
  if (S.sort === "za") out.sort((a, b) => (V[a] === "") - (V[b] === "") || -cmp(a, b) || a - b);
  if (S.sort === "freq") { const c = new Map(); out.forEach((k) => c.set(V[k], (c.get(V[k]) || 0) + 1)); out.sort((a, b) => (V[a] === "") - (V[b] === "") || c.get(V[b]) - c.get(V[a]) || cmp(a, b)); }
  return out;
}
function renderMain() {
  const main = $("main"); if (!main) return;
  if (!S.items.length) { main.innerHTML = '<p class="muted">' + T.noItems + "</p>"; return; }
  S.cur = Math.max(0, Math.min(S.cur, S.items.length - 1));
  const it = S.items[S.cur], vals = it.values, n = vals.length;
  const filled = vals.filter((v) => v !== "").length;
  const counts = new Map(); vals.forEach((v) => { if (v !== "") counts.set(v, (counts.get(v) || 0) + 1); });
  const distinct = counts.size;
  let h = '<div class="ihead">' + (S.renaming === -2 ? '<input class="rn" id="rnh" value="' + esc(it.name) + '">' : '<h1 data-act="renamehead" title="' + T.rename + '">' + (it.name === "" ? '<span class="ph">' + esc(itemName(it, S.cur)) + "</span>" : esc(it.name)) + "</h1>") +
    '<button class="mini" data-act="move" data-k="-1" title="' + T.up + '">' + ICON.up + '</button><button class="mini" data-act="move" data-k="1" title="' + T.down + '">' + ICON.down + "</button></div>";
  if (metaText(it)) h += '<p class="imeta">' + esc(metaText(it)) + "</p>";
  const posLbl = it.label && it.label !== "+" ? (S.orient === "cols" ? T.colN(it.label) : T.rowN(it.label)) : T.newItem;
  h += '<div class="stats"><button class="chip where" data-act="reorient" title="' + T.reorientD + '">' + ORIENT_SVG(S.orient === "rows") + "<b>" + esc(posLbl) + "</b> · " + (S.orient === "cols" ? T.colsT : T.rowsT) + " " + ICON.pen + '</button><span class="chip"><b>' + n + "</b> " + T.entries + '</span><span class="chip"><b>' + filled + "</b> " + T.filled + '</span><span class="chip"><b>' + (n - filled) + "</b> " + T.empty + '</span><span class="chip"><b>' + distinct + "</b> " + T.distinct + "</span></div>";
  if (distinct > 0 && distinct <= 12 && filled > distinct) {
    const top = Array.from(counts.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], undefined, { numeric: true })), mx = top[0][1];
    h += '<div class="dist">' + top.map(([v, c]) => '<div class="row"><span title="' + esc(v) + '">' + esc(v) + '</span><i style="width:' + Math.max(3, Math.round(100 * c / mx)) + '%"></i><em>' + c + "</em></div>").join("") + "</div>";
  }
  h += '<div class="etools"><label>' + T.labelAt + ' <select id="idsel"><option value="-1">' + T.none + "</option>" + S.items.map((x, i) => i === S.cur ? "" : '<option value="' + i + '"' + (i === S.idItem ? " selected" : "") + ">" + esc(itemName(x, i)) + "</option>").join("") + "</select></label>" +
    '<span class="fitsel">' + T.fitT + ' <span class="seg2 small"><button class="' + (P.fit ? "on" : "") + '" data-act="fit" data-k="1">' + T.fitOn + '</button><button class="' + (!P.fit ? "on" : "") + '" data-act="fit" data-k="0">' + T.fitOff + "</button></span></span>" +
    '<span class="grow"></span><div class="search" style="min-width:200px">' + ICON.search + '<input type="search" id="esearch" placeholder="' + T.filter + '" value="' + esc(S.filter) + '"></div>' +
    '<div class="erow">' +
      '<span class="fitsel">' + T.scopeT + ' <span class="seg2 small"><button class="' + (P.rowMode ? "on" : "") + '" data-act="scope" data-k="1" title="' + T.scopeAllD + '">' + (S.orient === "cols" ? T.scopeRow : T.scopeCol) + '</button><button class="' + (!P.rowMode ? "on" : "") + '" data-act="scope" data-k="0" title="' + T.scopeOneD + '">' + T.scopeOne + "</button></span></span>" +
      '<label class="check" style="margin:0"><input type="checkbox" id="hideempty"' + (S.hideEmpty ? " checked" : "") + ">" + T.hideEmpty + "</label>" +
      '<label>' + T.sortT + ' <select id="sortsel">' + [["file", T.sortFile], ["az", T.sortAZ], ["za", T.sortZA], ["freq", T.sortFreq]].map((o) => '<option value="' + o[0] + '"' + (S.sort === o[0] ? " selected" : "") + ">" + o[1] + "</option>").join("") + "</select></label>" +
      '<label>' + T.gotoT + ' <input type="number" id="goto" min="1" max="' + Math.max(1, n) + '" placeholder="1–' + n + '"></label>' +
    "</div></div>";
  const m = matches();
  h += m ? '<p class="hint">' + (S.filter.trim() ? T.hits(m.length) + " · " : "") + T.viewNote + "</p>" : '<p class="hint">' + (P.rowMode ? (S.orient === "cols" ? T.hintRow : T.hintCol) : T.hint) + "</p>";
  let idx;
  if (m) idx = m.slice(S.page * PAGE, S.page * PAGE + PAGE);
  else { const a = S.page * PAGE; idx = []; for (let k = a; k < Math.min(n, a + PAGE); k++) idx.push(k); }
  const total = m ? m.length : n, pages = Math.max(1, Math.ceil(total / PAGE));
  if (S.page >= pages) { S.page = pages - 1; return renderMain(); }
  const idVals = S.idItem >= 0 && S.idItem !== S.cur && S.items[S.idItem] ? S.items[S.idItem].values : null;
  let list = "";
  if (!m) list += S.page === 0 ? '<li class="gap edge"><button class="add" data-act="ins" data-k="0">' + ICON.plus + T.addFirst + "</button></li>" : '<li class="gap"><button class="add" data-act="ins" data-k="' + idx[0] + '" title="' + T.insertHere + '">' + ICON.plus + "</button></li>";
  idx.forEach((k, j) => {
    if (j > 0 && !m) list += '<li class="gap"><button class="add" data-act="ins" data-k="' + k + '" title="' + T.insertHere + '" aria-label="' + T.insertHere + '">' + ICON.plus + "</button></li>";
    const v = vals[k];
    const lab = idVals ? '<input class="lab" data-lk="' + k + '" value="' + esc(idVals[k] ?? "") + '" placeholder="' + T.noLabel + '" spellcheck="false" aria-label="' + esc(T.labelAt) + " " + (k + 1) + '">'
      : '<span class="pos" title="' + esc(T.labHint) + '">' + esc(S.orient === "cols" ? T.rowN(k + S.d + 1) : T.colN(F.colName(k + S.d))) + "</span>";
    const chg = it.changed && it.changed.has(k);
    list += '<li class="entry' + (chg ? " chg" : "") + '" id="e' + k + '"><span class="no">' + (k + 1) + '</span><div class="ebox"><div class="elab">' + lab + (chg ? '<span class="chgmark" title="' + T.changedT + '">' + T.changed + "</span>" : "") + '</div><textarea rows="1" data-k="' + k + '" class="' + (v === "" ? "empty" : "") + '" spellcheck="false" aria-label="' + esc(itemName(it, S.cur)) + " " + (k + 1) + '">' + esc(v) + '</textarea></div><button class="del" data-act="del" data-k="' + k + '" title="' + T.delEntry + '" aria-label="' + T.delEntry + '">' + ICON.minus + "</button></li>";
  });
  if (!m && S.page === pages - 1) list += '<li class="gap edge"><button class="add" data-act="ins" data-k="' + n + '">' + ICON.plus + T.addLast + "</button></li>";
  h += '<ul class="entries" id="entries">' + list + "</ul>";
  if (pages > 1) h += '<div class="pager"><button class="btn small" data-act="page" data-k="-1"' + (S.page === 0 ? " disabled" : "") + ">‹ " + T.prev + "</button><span>" + T.page(S.page * PAGE + 1, Math.min(total, S.page * PAGE + PAGE), total) + '</span><button class="btn small" data-act="page" data-k="1"' + (S.page >= pages - 1 ? " disabled" : "") + ">" + T.next + " ›</button></div>";
  main.innerHTML = h;
  main.querySelectorAll("textarea").forEach(fit);
  main.querySelectorAll("input.lab").forEach(fitLab);
  const rnh = $("rnh"); if (rnh) { rnh.focus(); rnh.select(); }
}
function fitLab(el) { el.style.width = Math.max(8, Array.from(el.value || el.placeholder).length + 3) + "ch"; }
function fit(ta) {   // Breite wächst mit dem Inhalt (längste Zeile), Höhe mit der Zeilenzahl
  if (P.fit) { const w = ta.value.split("\n").reduce((a, l) => Math.max(a, Array.from(l).length), 0); ta.style.width = "min(100%, " + Math.max(14, w + 4) + "ch)"; }
  else ta.style.width = "100%";
  ta.style.height = "auto"; ta.style.height = Math.max(40, ta.scrollHeight + 2) + "px";
}
function render() {
  renderBar();
  if (S.setup) renderSetup(); else if (S.loaded) renderBrowser(); else renderStart();
  const m = $("menu"); if (m) m.remove();
}

/* ---------- Bearbeiten ---------- */
function insertEntry(k) {
  if (P.rowMode) { const inv = applyOp0({ kind: "insrow", k }); pushUndo(inv, logAct("insrow", { k, item: itemName(S.items[S.cur], S.cur) })); }
  else { const it = S.items[S.cur]; pushUndo(snapItem(S.cur), logAct("insert", { item: itemName(it, S.cur), k, label: labelOf(k) })); it.values.splice(k, 0, ""); shiftMarks(it, k, 1); }
  setDirty(true); renderSide(); renderMain(); toast(P.rowMode ? T.insertedRow : T.inserted);
  const ta = document.querySelector('textarea[data-k="' + k + '"]'); if (ta) ta.focus();
}
function deleteEntry(k) {
  const it = S.items[S.cur];
  if (P.rowMode) { const lab = labelOf(k), from = it.values[k] ?? ""; const inv = applyOp0({ kind: "delrow", k }); pushUndo(inv, logAct("delrow", { k, label: lab, item: itemName(it, S.cur), from })); }
  else { pushUndo(snapItem(S.cur), logAct("delete", { item: itemName(it, S.cur), k, label: labelOf(k), from: it.values[k] ?? "" })); it.values.splice(k, 1); shiftMarks(it, k, -1); }
  setDirty(true); renderSide(); renderMain(); toast(P.rowMode ? T.removedRow : T.removed);
}
function renameItem(i, name) { if (S.items[i].name === name) return; pushUndo(snapItem(i), logAct("rename", { from: itemName(S.items[i], i), to: name })); S.items[i].name = name; setDirty(true); }
function addItem() {
  pushUndo(snapAll(), logAct("additem", {}));
  S.items.splice(S.cur + 1, 0, { name: T.newItem, label: "+", meta: new Array(Math.max(0, S.d - (S.h >= 0 ? 1 : 0))).fill(""), values: new Array(maxLen()).fill("") });
  if (S.h < 0) { S.h = 0; S.d += 1; S.items.forEach((x) => { if (x.name === undefined) x.name = ""; }); }
  S.cur++; S.renaming = -2; S.page = 0; setDirty(true); renderSide(); renderMain();
}
function deleteItem(i) {
  if (!confirm(T.delItemQ(itemName(S.items[i], i)))) return;
  pushUndo(snapAll(), logAct("delitem", { item: itemName(S.items[i], i) })); S.items.splice(i, 1);
  if (S.idItem === i) S.idItem = -1; else if (S.idItem > i) S.idItem--;
  if (S.cur >= S.items.length) S.cur = S.items.length - 1;
  setDirty(true); renderSide(); renderMain();
}
function moveItem(d) {
  const i = S.cur, j = i + d; if (j < 0 || j >= S.items.length) return;
  pushUndo(snapAll(), logAct("move", { item: itemName(S.items[i], i), dir: d })); const t = S.items[i]; S.items[i] = S.items[j]; S.items[j] = t;
  if (S.idItem === i) S.idItem = j; else if (S.idItem === j) S.idItem = i;
  S.cur = j; setDirty(true); renderSide(); renderMain();
}
function pick(i) { if (i === S.cur) return; S.cur = i; S.page = 0; S.filter = ""; S.hideEmpty = false; S.sort = "file"; S.renaming = -1; S.sideOpen = false; const b = $("browser"); if (b) b.classList.remove("sideopen"); renderSide(); renderMain(); $("main").scrollTop = 0; }
/* ---------- Ereignisse ---------- */
document.addEventListener("click", async (e) => {
  const menu = $("menu");
  if (menu && !e.target.closest("#menu") && !e.target.closest('[data-act="menu"]')) menu.remove();
  const el = e.target.closest("[data-act]"); if (!el) return;
  if (el.closest("#menu") && el.tagName === "BUTTON") $("menu")?.remove();
  const a = el.dataset.act, k = el.dataset.k, i = +el.dataset.i;
  if (a === "home") { e.preventDefault(); window.scrollTo(0, 0); const m = $("main"); if (m) m.scrollTop = 0; }
  else if (a === "open") $("file").click();
  else if (a === "save") quickSave();
  else if (a === "export") exportDialog();
  else if (a === "undo") undo(false);
  else if (a === "redo") undo(true);
  else if (a === "lang") { P.lang = P.lang === "de" ? "en" : "de"; T = TEXT[P.lang]; document.documentElement.lang = P.lang; savePrefs(); render(); }
  else if (a === "theme") { P.theme = document.documentElement.getAttribute("data-theme") === "light" ? "dark" : "light"; savePrefs(); applyTheme(); renderBar(); }
  else if (a === "menu") toggleMenu();
  else if (a === "orient") { P.orient = k; savePrefs(); renderStart(); }
  else if (a === "sample") { const f = new File([sampleCSV()], T.sampleName + ".csv", { type: "text/csv" }); P.orient = "cols"; savePrefs(); loadFile(f); }
  else if (a === "restore") { const s = await DB.get(); if (s) { Object.assign(S, { items: s.items, orient: s.orient, h: s.h ?? 0, d: s.d ?? 1, fileName: s.fileName, srcType: s.srcType, delim: s.delim, sheet: s.sheet, sheets: s.sheets || null, log: s.log || [], encoding: "" }); afterLoad(s.idItem, true); S.dirty = true; renderBarState(); } }
  else if (a === "discard") { await DB.clear(); $("restore").innerHTML = ""; }
  else if (a === "side") { S.sideOpen = !S.sideOpen; $("browser").classList.toggle("sideopen", S.sideOpen); }
  else if (a === "pick" && !e.target.closest(".acts") && !e.target.closest("input")) pick(i);
  else if (a === "rename") { S.renaming = i; if (i !== S.cur) { S.cur = i; renderMain(); } renderSide(); }
  else if (a === "renamehead") { S.renaming = -2; renderMain(); }
  else if (a === "delitem") deleteItem(i);
  else if (a === "additem") addItem();
  else if (a === "move") moveItem(+k);
  else if (a === "ins") insertEntry(+k);
  else if (a === "del") deleteEntry(+k);
  else if (a === "page") { S.page += +k; renderMain(); $("main").scrollTop = 0; }
  else if (a === "reorient") { $("menu")?.remove(); openSetup(toGrid(S.orient, true), S.orient, { h: S.h, d: S.d, lab: S.idItem }, true); }
  else if (a === "su-orient") setupOrient(k);
  else if (a === "su-apply") applySetup();
  else if (a === "su-cancel") { const re = S.setup && S.setup.reconf; S.setup = null; if (!re) S.loaded = false; render(); }
  else if (a === "fit") { P.fit = k === "1"; savePrefs(); renderMain(); }
  else if (a === "scope") { P.rowMode = k === "1"; savePrefs(); renderMain(); }
  else if (a === "log") { $("menu")?.remove(); logDialog(); }
  else if (a === "logcsv") { const b = new Blob([F.toCSV(logRows(), ";", true)], { type: "text/csv" }); const nm = await saveBlob(b, (S.fileName || "jellytable") + "-" + T.logFile + ".csv", "csvx", true); if (nm) toast(T.saved + "  " + nm); }
  else if (a === "forget") { $("menu")?.remove(); await DB.clear(); try { localStorage.removeItem(PKEY); } catch (er) {} P.autosave = false; toast(T.forgotten); }
  else if (a === "shortcuts" || a === "about") { $("menu")?.remove(); info(a); }
});
document.addEventListener("change", (e) => {
  const t = e.target;
  if (t.dataset && t.dataset.act === "autosave") { P.autosave = t.checked; savePrefs(); if (P.autosave) autosaveSoon(); else DB.clear(); }
  if (t.id === "idsel") { S.idItem = +t.value; renderMain(); }
  if (t.id === "hideempty") { S.hideEmpty = t.checked; S.page = 0; renderMain(); }
  if (t.id === "sortsel") { S.sort = t.value; S.page = 0; renderMain(); }
  if (t.id === "goto") gotoEntry(+t.value - 1);
  if (t.id === "su-names") { const u = S.setup; u.h = +t.value; if (u.d <= u.h) u.d = u.h + 1; renderSetup(); }
  if (t.id === "su-data") { S.setup.d = +t.value; renderSetup(); }
  if (t.id === "su-lab") { S.setup.lab = +t.value; renderSetup(); }
  if (t.id === "fname") { S.fileName = t.value.trim() || "jellytable"; renderBarState(); autosaveSoon(); }
  if (t.classList.contains("lab") && S.idItem >= 0) {
    const k = +t.dataset.lk, before = t.dataset.before;
    if (before != null && before !== t.value) { pushUndo({ kind: "cell", i: S.idItem, k, v: before, keep: true }, logAct("label", { item: itemName(S.items[S.idItem], S.idItem), k, from: before, to: t.value })); mark(S.idItem, k); }
    t.dataset.before = t.value;
  }
  if (t.tagName === "TEXTAREA" && t.dataset.k != null) {
    const k = +t.dataset.k, before = t.dataset.before;
    if (before != null && before !== t.value) { pushUndo({ kind: "cell", i: S.cur, k, v: before }, logAct("edit", { item: itemName(S.items[S.cur], S.cur), k, label: labelOf(k), from: before, to: t.value })); mark(S.cur, k); renderSide(); const li = t.closest(".entry"); if (li && !li.classList.contains("chg")) { li.classList.add("chg"); const el = li.querySelector(".elab"); if (el) el.insertAdjacentHTML("beforeend", '<span class="chgmark" title="' + T.changedT + '">' + T.changed + "</span>"); } }
    t.dataset.before = t.value;
  }
});
document.addEventListener("focusin", (e) => {
  const t = e.target;
  if (t.tagName === "TEXTAREA" && t.dataset.k != null) t.dataset.before = S.items[S.cur].values[+t.dataset.k] ?? "";
  if (t.classList && t.classList.contains("lab")) t.dataset.before = S.items[S.idItem].values[+t.dataset.lk] ?? "";
});
document.addEventListener("input", (e) => {
  const t = e.target;
  if (t.tagName === "TEXTAREA" && t.dataset.k != null) { S.items[S.cur].values[+t.dataset.k] = t.value; t.classList.toggle("empty", t.value === ""); t.classList.add("changed"); fit(t); if (!S.dirty) setDirty(true); else autosaveSoon(); }
  if (t.classList.contains("lab") && S.idItem >= 0) { const vals = S.items[S.idItem].values, k = +t.dataset.lk; while (vals.length < k) vals.push(""); vals[k] = t.value; fitLab(t); if (!S.dirty) setDirty(true); else autosaveSoon(); }
  if (t.id === "isearch") { S.itemFilter = t.value; renderSide(); }
  if (t.id === "esearch") { S.filter = t.value; S.page = 0; clearTimeout(t._h); t._h = setTimeout(() => { const pos = t.selectionStart; renderMain(); const n = $("esearch"); n.focus(); n.setSelectionRange(pos, pos); }, 200); }
});
document.addEventListener("keydown", (e) => {
  const t = e.target, mod = e.ctrlKey || e.metaKey, typing = t.tagName === "TEXTAREA" || t.tagName === "INPUT";
  if ((t.id === "rn" || t.id === "rnh") && (e.key === "Enter" || e.key === "Escape")) {
    e.preventDefault();
    if (e.key === "Enter") renameItem(S.renaming === -2 ? S.cur : S.renaming, t.value.trim());
    S.renaming = -1; renderSide(); renderMain(); return;
  }
  if (mod && e.key.toLowerCase() === "s") { e.preventDefault(); quickSave(); return; }
  if (mod && e.key.toLowerCase() === "o") { e.preventDefault(); $("file").click(); return; }
  if (mod && e.key.toLowerCase() === "e") { e.preventDefault(); exportDialog(); return; }
  if (!typing && mod && e.key.toLowerCase() === "z") { e.preventDefault(); undo(e.shiftKey); return; }
  if (!typing && mod && e.key.toLowerCase() === "y") { e.preventDefault(); undo(true); return; }
  // Strg+Enter: nächster Eintrag, Strg+Umschalt+Enter: vorheriger (6)
  if (mod && e.key === "Enter" && t.tagName === "TEXTAREA" && t.dataset.k != null) { e.preventDefault(); stepEntry(t, e.shiftKey ? -1 : 1); return; }
  if (t.id === "goto" && e.key === "Enter") { e.preventDefault(); gotoEntry(+t.value - 1); return; }
  if (e.altKey && (e.key === "ArrowDown" || e.key === "ArrowUp") && S.loaded) { e.preventDefault(); const j = S.cur + (e.key === "ArrowDown" ? 1 : -1); if (j >= 0 && j < S.items.length) pick(j); }
});
document.addEventListener("focusout", (e) => {
  const t = e.target;
  if ((t.id === "rn" || t.id === "rnh") && S.renaming !== -1) { renameItem(S.renaming === -2 ? S.cur : S.renaming, t.value.trim()); S.renaming = -1; setTimeout(() => { renderSide(); renderMain(); }, 0); }
});
window.addEventListener("beforeunload", (e) => { if (S.dirty && !P.autosave) { e.preventDefault(); e.returnValue = T.leave; } });
document.addEventListener("dragover", (e) => e.preventDefault());
document.addEventListener("drop", (e) => { if (e.target.closest && e.target.closest("#drop")) return; e.preventDefault(); const f = e.dataTransfer && e.dataTransfer.files[0]; if (f && (!S.dirty || confirm(T.leave))) { if (!S.loaded) loadFile(f); else { S.loaded = false; render(); loadFile(f); } } });
// Breite der Item-Liste: ziehen, Pfeiltasten, Doppelklick = zurücksetzen
const clampW = (w) => Math.max(180, Math.min(w, Math.max(240, window.innerWidth - 360)));
function setSideW(w, persist) { P.sideW = Math.round(clampW(w)); const b = $("browser"); if (b) b.style.setProperty("--sidew", P.sideW + "px"); if (persist) savePrefs(); }
document.addEventListener("pointerdown", (e) => {
  const r = e.target.closest && e.target.closest("#resizer"); if (!r) return;
  e.preventDefault(); r.setPointerCapture(e.pointerId); r.classList.add("drag"); document.body.classList.add("resizing");
  const x0 = e.clientX, w0 = P.sideW;
  const mv = (ev) => setSideW(w0 + ev.clientX - x0, false);
  const up = () => { r.removeEventListener("pointermove", mv); r.classList.remove("drag"); document.body.classList.remove("resizing"); savePrefs(); };
  r.addEventListener("pointermove", mv); r.addEventListener("pointerup", up, { once: true }); r.addEventListener("pointercancel", up, { once: true });
});
document.addEventListener("dblclick", (e) => { if (e.target.closest && e.target.closest("#resizer")) setSideW(300, true); });
document.addEventListener("keydown", (e) => { if (e.target.id === "resizer" && (e.key === "ArrowLeft" || e.key === "ArrowRight")) { e.preventDefault(); setSideW(P.sideW + (e.key === "ArrowRight" ? 20 : -20), true); } });
// ---------- Navigation (6) ----------
function stepEntry(t, dir) {
  const tas = Array.from(document.querySelectorAll(".entry textarea")), i = tas.indexOf(t), n = tas[i + dir];
  t.dispatchEvent(new Event("change", { bubbles: true }));
  if (n) { n.focus(); n.scrollIntoView({ block: "nearest" }); return; }
  const m = matches(), total = m ? m.length : S.items[S.cur].values.length, pages = Math.ceil(total / PAGE);
  const np = S.page + dir; if (np < 0 || np >= pages) return;
  S.page = np; renderMain();
  const list = document.querySelectorAll(".entry textarea"), f = dir > 0 ? list[0] : list[list.length - 1];
  if (f) { f.focus(); f.scrollIntoView({ block: "nearest" }); }
}
function gotoEntry(k) {
  const n = S.items[S.cur].values.length;
  if (!(k >= 0 && k < n)) { toast(T.gotoBad(n)); return; }
  S.filter = ""; S.hideEmpty = false; S.sort = "file"; S.page = Math.floor(k / PAGE); renderMain();
  const li = $("e" + k);
  if (li) { li.scrollIntoView({ block: "center" }); li.classList.add("flash"); setTimeout(() => li.classList.remove("flash"), 1400); const ta = li.querySelector("textarea"); if (ta) ta.focus({ preventScroll: true }); }
}
// ---------- Änderungsprotokoll: Dialog + CSV (4) ----------
function descr(x) {
  const L = (k) => "#" + (k + 1) + (x.label ? " (" + x.label + ")" : "");
  switch (x.a) {
    case "load": return T.lg.load(x.file, x.items, x.entries);
    case "edit": return T.lg.edit(x.item, L(x.k));
    case "label": return T.lg.label(x.item, "#" + (x.k + 1));
    case "insert": return T.lg.insert(x.item, "#" + (x.k + 1));
    case "delete": return T.lg.del(x.item, L(x.k));
    case "insrow": return T.lg.insrow("#" + (x.k + 1));
    case "delrow": return T.lg.delrow(L(x.k));
    case "rename": return T.lg.rename(x.from, x.to);
    case "additem": return T.lg.additem;
    case "delitem": return T.lg.delitem(x.item);
    case "move": return T.lg.move(x.item);
    case "setup": return T.lg.setup;
    case "save": return T.lg.save(x.file);
    case "undo": return T.lg.undo(x.ref);
    case "redo": return T.lg.redo(x.ref);
  }
  return x.a;
}
function logRows() {
  return [T.logHead].concat(S.log.map((x) => [new Date(x.at).toLocaleString(P.lang), descr(x), x.item || "", x.k != null ? String(x.k + 1) : "", x.label || "", x.from ?? "", x.to ?? ""]));
}
function logDialog() {
  const d = $("dlg"), fmtT = (iso) => new Date(iso).toLocaleTimeString(P.lang, { hour: "2-digit", minute: "2-digit" });
  const rows = S.log.slice().reverse().map((x) => '<li><time>' + fmtT(x.at) + "</time><div><b>" + esc(descr(x)) + "</b>" +
    (x.from != null || x.to != null ? '<div class="chg2">' + (x.from != null ? "<del>" + esc(x.from || "∅") + "</del>" : "") + (x.to != null ? " → <ins>" + esc(x.to || "∅") + "</ins>" : "") + "</div>" : "") + "</div></li>").join("");
  d.innerHTML = '<div class="dh"><h2>' + T.logT + '</h2><span class="muted small">' + T.logCount(S.log.length) + '</span></div><div class="db"><p class="small muted" style="margin-top:0">' + T.logD + '</p><ul class="loglist">' + rows + "</ul></div>" +
    '<div class="df"><button class="btn" data-act="logcsv">' + ICON.export + " " + T.logCsv + '</button><button class="btn primary" data-c="1">' + T.close + "</button></div>";
  d.onclick = (e) => { if (e.target.closest("[data-c]")) d.close(); }; d.onclose = null; d.onchange = null; d.showModal();
}
function info(kind) {
  const d = $("dlg");
  d.innerHTML = '<div class="dh"><h2>' + (kind === "about" ? T.about : T.shortcuts) + '</h2></div><div class="db">' +
    (kind === "about" ? T.aboutD : '<div class="shortcuts">' + T.sc.map((s) => '<span class="kbd">' + s[0] + "</span><span>" + s[1] + "</span>").join("") + "</div>") +
    '</div><div class="df"><button class="btn" data-c="1">' + T.close + "</button></div>";
  d.onclick = (e) => { if (e.target.closest("[data-c]")) d.close(); }; d.onclose = null; d.onchange = null; d.showModal();
}
$("file").addEventListener("change", async (e) => {
  const f = e.target.files[0]; e.target.value = "";
  if (!f) return;
  if (S.loaded && S.dirty && !confirm(T.leave)) return;
  if (S.loaded) { S.loaded = false; render(); }
  loadFile(f);
});

/* ---------- Start ---------- */
function applyTheme() {
  const th = P.theme || (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
  document.documentElement.setAttribute("data-theme", th);
  document.querySelector('meta[name="theme-color"]').setAttribute("content", th === "light" ? "#f5f6fb" : "#0b1020");
}
document.documentElement.lang = P.lang;
applyTheme(); render();
matchMedia("(prefers-color-scheme: light)").addEventListener("change", () => { if (!P.theme) { applyTheme(); renderBar(); } });
window.__jt = { S, P, F, toGrid, fromGrid };   // für Tests
})();
