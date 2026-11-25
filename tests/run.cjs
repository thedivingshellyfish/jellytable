#!/usr/bin/env node
/* jellytable :: automatic tests in real browsers (Chromium and Firefox) via Playwright.

     npm install            (once: installs playwright)
     npx playwright install chromium firefox
     npm test               (= node tests/run.cjs chromium,firefox)

   The app is opened as a local file (file://), exactly like users do offline.
   Fixtures in tests/fixtures/ are fictitious. */
"use strict";
const { chromium, firefox } = require("playwright");
const path = require("path"), fs = require("fs"), os = require("os");

const ROOT = path.resolve(__dirname, ".."), APP = "file://" + path.join(ROOT, "index.html");
const FIX = path.join(__dirname, "fixtures"), TMP = fs.mkdtempSync(path.join(os.tmpdir(), "jellytable-"));
const BROWSERS = (process.argv[2] || "chromium,firefox").split(",").filter(Boolean);

/* ---------- helpers ---------- */
const eq = (got, want, msg) => { const g = JSON.stringify(got), w = JSON.stringify(want); if (g !== w) throw new Error((msg ? msg + ": " : "") + "expected " + w + " but got " + g); };
const ok = (cond, msg) => { if (!cond) throw new Error(msg); };
const fixture = (f) => path.isAbsolute(f) ? f : path.join(FIX, f);
async function openFile(page, file, { orient, sheet = 0 } = {}) {
  if (!page.url().startsWith(APP)) await page.goto(APP);
  if (orient) await page.click(`[data-act=orient][data-k=${orient}]`);
  await page.setInputFiles("#file", fixture(file));
  await Promise.race([page.waitForSelector("#su-names"), page.waitForSelector("#dlg[open] .sheets button"), page.waitForSelector("#loaderr:not([hidden])")]);
  if (await page.$("#dlg[open] .sheets")) { await page.click(`#dlg .sheets button[data-i="${sheet}"]`); await page.waitForSelector("#su-names"); }
}
async function load(page, file, opts) { await openFile(page, file, opts); await page.click("[data-act=su-apply]"); await page.waitForSelector("#items"); }
const items = (page) => page.evaluate(() => window.__jt.S.items.map((i) => [i.name, ...i.values]));
const state = (page, expr) => page.evaluate(expr);
async function exportAs(page, fmt, { orient } = {}) {
  await page.click(".bar [data-act=export]");
  await page.check(`#dlg input[value=${fmt}]`);
  if (orient) await page.selectOption("#dlg select[name=orient]", orient);
  const [dl] = await Promise.all([page.waitForEvent("download"), page.click("#dlg button[value=ok]")]);
  const p = path.join(TMP, Date.now() + "-" + Math.random().toString(36).slice(2, 6) + "-" + dl.suggestedFilename());
  await dl.saveAs(p);
  return p;
}
const pick = async (page, i) => { await page.click(`.it[data-i="${i}"]`); await page.waitForFunction((n) => window.__jt.S.cur === n, i); };
const blurAll = (page) => page.evaluate(() => document.activeElement && document.activeElement.blur());

const UMFRAGE_TEXT = ["Offene Antwort", 'Sagt "ja", aber;\nmit Zeilenumbruch', "Ümläute & <Sonderzeichen>", "  führendes Leerzeichen", "🪼 emoji", ""];

/* ---------- tests ---------- */
const TESTS = [
  ["CSV (Komma, UTF-8): Anführungszeichen, Zeilenumbruch, Emoji", async (p) => {
    await load(p, "komma.csv");
    const it = await items(p);
    eq(it[0], ["ID", "P01", "P02", "P03", "P04", "P05"]); eq(it[4], UMFRAGE_TEXT);
    eq(await state(p, () => window.__jt.S.delim), ",");
  }],
  ["CSV (Semikolon, Windows-1252): Umlaute", async (p) => {
    await load(p, "semikolon-ansi.csv");
    eq((await items(p))[4][2], "Ümläute & <Sonderzeichen>");
    eq(await state(p, () => [window.__jt.S.delim, window.__jt.S.encoding]), [";", "Windows-1252"]);
  }],
  ["TSV", async (p) => { await load(p, "tab.tsv"); eq((await items(p))[4], UMFRAGE_TEXT); }],
  ["XLSX mit zwei Blättern: Datum, Wahrheitswerte, Zahlen", async (p) => {
    await load(p, "umfrage.xlsx");
    const it = await items(p);
    eq(it[1], ["Alter", "23", "31.5", "", "0.1", "1234567"]);
    eq(it[2], ["Datum", "2026-03-01", "2026-03-02 14:30", "", "1999-12-31", ""]);
    eq(it[3], ["Zustimmung", "TRUE", "FALSE", "", "TRUE", ""]);
    eq(await state(p, () => window.__jt.S.sheets.map((s) => s.name)), ["Antworten", "Codebuch"]);
  }],
  ["ODS", async (p) => { await load(p, "umfrage.ods"); const it = await items(p); eq(it[2], ["Datum", "2026-03-01", "2026-03-02 14:30", "", "1999-12-31", ""]); eq(it[4], UMFRAGE_TEXT); }],
  ["Excel 2003 XML mit Lücken", async (p) => { await load(p, "umfrage-2003.xml"); eq(await items(p), [["ID", "P01", "", "P03"], ["Alter", "23", "", "0.3"], ["", "", "", ""], ["Datum", "2026-03-01", "", ""]]); }],
  ["Items als Zeilen", async (p) => { await load(p, "zeilen.xlsx", { orient: "rows" }); eq(await items(p), [["Frage 1", "a", "b", "c", ""], ["Frage 2", "1", "2", "", ""], ["Frage 3", "", "x", "", "y"]]); }],
  ["Altes .xls wird mit Hinweis abgelehnt", async (p) => { await openFile(p, "umfrage.xls"); ok(/\.xls/.test(await p.textContent("#loaderr")), "no .xls hint"); }],
  ["Schritt 3 erkennt Qualtrics (3 Kopfzeilen, ID als Bezeichnung)", async (p) => {
    await openFile(p, "qualtrics.csv");
    eq([await p.inputValue("#su-names"), await p.inputValue("#su-data"), await p.inputValue("#su-lab")], ["0", "3", "0"]);
  }],
  ["Schritt 3 erkennt Tabelle ohne Kopfzeile", async (p) => { await openFile(p, "ohnekopf.csv"); eq(await p.inputValue("#su-names"), "-1"); }],
  ["Qualtrics: Export ist identisch mit dem Original", async (p) => {
    await load(p, "qualtrics.csv");
    const out = await exportAs(p, "csv");
    const norm = (f) => fs.readFileSync(f, "utf8").replace(/\r\n/g, "\n");
    eq(norm(out), norm(fixture("qualtrics.csv")));
  }],
  ["Mehrere Blätter: XLSX-, ODS- und XML-Export behalten das zweite Blatt", async (p) => {
    await load(p, "umfrage.xlsx");
    for (const fmt of ["xlsx", "ods", "xml"]) {
      const out = await exportAs(p, fmt);
      const q = await p.context().newPage();
      await openFile(q, out, { sheet: 1 });
      await q.click("[data-act=su-apply]"); await q.waitForSelector("#items");
      eq(await items(q), [["Item", "Alter"], ["Bedeutung", "in Jahren"]], fmt);
      await q.close();
    }
  }],
  ["Mehrere Blätter: CSV-Export warnt", async (p) => {
    await load(p, "umfrage.xlsx");
    await p.click(".bar [data-act=export]"); await p.check("#dlg input[value=csv]");
    ok(await p.$eval("#sheetnote", (n) => n.classList.contains("warn")), "no warning for csv");
    await p.check("#dlg input[value=xlsx]");
    ok(!(await p.$eval("#sheetnote", (n) => n.classList.contains("warn"))), "warning for xlsx");
  }],
  ["＋/− ganze Zeile hält alle Items zusammen, Rückgängig", async (p) => {
    await load(p, "komma.csv"); await pick(p, 4);
    await p.click('.gap .add[data-k="1"]');
    let it = await items(p);
    ok(it.every((r) => r.length === 7 && r[2] === ""), "row not inserted in all items");
    await blurAll(p); await p.keyboard.press("Control+z");
    eq((await items(p))[0], ["ID", "P01", "P02", "P03", "P04", "P05"]);
    await p.click('.del[data-k="0"]');
    it = await items(p);
    eq([it[0][1], it[4][1]], ["P02", "Ümläute & <Sonderzeichen>"]);
  }],
  ["＋/− nur dieses Item", async (p) => {
    await load(p, "komma.csv"); await pick(p, 4);
    await p.click('[data-act=scope][data-k="0"]');
    await p.click('.gap .add[data-k="1"]');
    const it = await items(p);
    eq([it[0].length, it[4].length], [6, 7]);
  }],
  ["Bearbeiten: Markierung und Änderungsprotokoll mit CSV", async (p) => {
    await load(p, "komma.csv"); await pick(p, 4);
    await p.fill('textarea[data-k="2"]', "Bearbeitet ✓"); await blurAll(p);
    eq((await items(p))[4][3], "Bearbeitet ✓");
    eq(await p.$$eval(".entry.chg", (l) => l.length), 1, "changed marks");
    await p.click(".bar [data-act=log]");
    ok((await p.$$eval(".loglist li", (l) => l.length)) >= 2, "log entries");
    const [dl] = await Promise.all([p.waitForEvent("download"), p.click("[data-act=logcsv]")]);
    const f = path.join(TMP, "log.csv"); await dl.saveAs(f);
    const csv = fs.readFileSync(f, "utf8");
    ok(/^﻿?Zeit;Aktion;Item;Eintrag/.test(csv) && csv.includes("Bearbeitet ✓"), "log csv content");
  }],
  ["Bezeichnung über dem Eintrag bearbeiten", async (p) => {
    await load(p, "komma.csv"); await pick(p, 4);
    eq(await p.inputValue('input.lab[data-lk="1"]'), "P02");
    await p.fill('input.lab[data-lk="1"]', "P02-neu"); await blurAll(p);
    eq((await items(p))[0][2], "P02-neu");
    eq(await state(p, () => window.__jt.S.cur), 4, "stays on item");
  }],
  ["Rückgängig und Wiederholen", async (p) => {
    await load(p, "komma.csv"); await pick(p, 1);
    await p.fill('textarea[data-k="0"]', "99"); await blurAll(p);
    await p.keyboard.press("Control+z"); eq((await items(p))[1][1], "23");
    await p.keyboard.press("Control+y"); eq((await items(p))[1][1], "99");
  }],
  ["Ansicht: Leere ausblenden, Sortieren, Gehe zu", async (p) => {
    await load(p, "komma.csv"); await pick(p, 4);
    await p.check("#hideempty");
    eq(await p.$$eval(".entry textarea", (t) => t.length), 4, "hide empty");
    await p.selectOption("#sortsel", "az");
    eq(await p.$$eval(".entry textarea", (t) => t.map((x) => +x.dataset.k)), [2, 3, 0, 1], "sorted (leading spaces first, then emoji, then letters)");
    ok(!(await p.$(".gap .add")), "no insert in sorted view");
    await p.fill("#goto", "5"); await p.press("#goto", "Enter");
    ok(await p.$("#e4"), "goto entry 5");
    eq(await p.isChecked("#hideempty"), false, "goto resets view");
  }],
  ["Strg+Enter springt zum nächsten Eintrag", async (p) => {
    await load(p, "komma.csv"); await pick(p, 4);
    await p.focus('textarea[data-k="0"]'); await p.keyboard.press("Control+Enter");
    eq(await state(p, () => document.activeElement.dataset.k), "1");
  }],
  ["Einrichten-Knopf öffnet Schritt 3 erneut, mit Rückgängig", async (p) => {
    await load(p, "komma.csv");
    await p.click(".bar [data-act=reorient]"); await p.waitForSelector("#su-names");
    await p.click("[data-act=su-orient][data-k=rows]"); await p.click("[data-act=su-apply]"); await p.waitForSelector("#items");
    eq(await state(p, () => window.__jt.S.orient), "rows");
    await blurAll(p); await p.keyboard.press("Control+z");
    eq(await state(p, () => window.__jt.S.orient), "cols");
    await p.click(".chip.where"); await p.waitForSelector("#su-names");
  }],
  ["Speichern (Strg+S) im ursprünglichen Format", async (p) => {
    await load(p, "semikolon-ansi.csv");
    const [dl] = await Promise.all([p.waitForEvent("download"), p.keyboard.press("Control+s")]);
    eq(dl.suggestedFilename(), "semikolon-ansi.csv");
    const f = path.join(TMP, "q.csv"); await dl.saveAs(f);
    ok(fs.readFileSync(f, "utf8").split("\n")[0].includes(";"), "semicolon kept");
  }],
  ["Item-Liste in der Breite ziehen", async (p) => {
    await load(p, "komma.csv");
    const b = await (await p.$("#resizer")).boundingBox();
    await p.mouse.move(b.x + 5, b.y + 200); await p.mouse.down(); await p.mouse.move(b.x + 125, b.y + 200, { steps: 4 }); await p.mouse.up();
    const w = await state(p, () => window.__jt.P.sideW);
    ok(w > 380 && w < 460, "width " + w);
  }],
  ["Große Tabelle (3000 × 40) lädt zügig", async (p) => {
    const rows = [["ID"].concat(Array.from({ length: 39 }, (_, i) => "F" + (i + 1)))];
    for (let r = 0; r < 3000; r++) rows.push(["P" + r].concat(Array.from({ length: 39 }, (_, i) => i % 5 ? String((r * i) % 5 + 1) : "Freitext Antwort Nummer " + r)));
    const f = path.join(TMP, "gross.csv"); fs.writeFileSync(f, rows.map((r) => r.join(",")).join("\n"));
    const t = Date.now(); await load(p, f);
    ok(Date.now() - t < 8000, "took " + (Date.now() - t) + " ms");
    eq(await state(p, () => [window.__jt.S.items.length, window.__jt.S.items[0].values.length]), [40, 3000]);
  }],
  ["Speichern an gewählten Ort (Chrome/Edge-Weg, simuliert): einmal fragen, dann direkt", async (p) => {
    // simulierter Speicherdialog der File System Access API
    await p.goto(APP);
    await p.evaluate(() => {
      window.__jtNoPicker = false; window.__picks = 0; window.__written = [];
      window.showSaveFilePicker = async (o) => { window.__picks++; return { name: o.suggestedName, createWritable: async () => ({ write: async (b) => window.__written.push(await b.text()), close: async () => {} }) }; };
    });
    await load(p, "komma.csv"); await pick(p, 1);
    await p.keyboard.press("Control+s"); await p.waitForFunction(() => window.__written.length === 1);
    await p.fill('textarea[data-k="0"]', "24"); await blurAll(p);
    await p.keyboard.press("Control+s"); await p.waitForFunction(() => window.__written.length === 2);
    eq(await state(p, () => window.__picks), 1, "picker asked only once");
    ok((await state(p, () => window.__written[1])).includes("P01,24"), "second save has the edit");
    eq(await state(p, () => window.__jt.S.dirty), false, "not dirty after save");
  }]
];

/* ---------- runner ---------- */
(async () => {
  let passed = 0, failed = 0;
  for (const name of BROWSERS) {
    const type = { chromium, firefox }[name];
    if (!type) { console.log("unknown browser: " + name); process.exit(2); }
    const browser = await type.launch();
    console.log("\n" + name + " " + browser.version());
    for (const [title, fn] of TESTS) {
      const ctx = await browser.newContext({ acceptDownloads: true, locale: "de-DE", viewport: { width: 1280, height: 900 } });
      await ctx.addInitScript(() => { window.__jtNoPicker = true; });   // Speichern als Download, auch in Chromium
      const page = await ctx.newPage(), errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      page.on("dialog", (d) => d.accept());
      try {
        await fn(page);
        if (errors.length) throw new Error("page error: " + errors[0]);
        passed++; console.log("  ✓ " + title);
      } catch (e) { failed++; console.log("  ✗ " + title + "\n      " + String(e.message).split("\n")[0]); }
      await ctx.close();
    }
    await browser.close();
  }
  console.log("\n" + passed + " passed, " + failed + " failed");
  process.exit(failed ? 1 : 0);
})();
