/* jellytable :: formats.js -- read and write table files, all in the browser.
   No libraries: ZIP via (De)CompressionStream, XML via DOMParser.
   Reads:  CSV/TSV/TXT, XLSX/XLSM, ODS, Excel 2003 XML (SpreadsheetML)
   Writes: XLSX, ODS, CSV, TSV, Excel 2003 XML, JSON
   A table is always string[][] (rows of cells). */
(function () {
"use strict";
const F = {};
const enc = new TextEncoder();

/* ---------- ZIP ---------- */
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(u8) { let c = 0xffffffff; for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
async function deflateRaw(u8) {
  if (typeof CompressionStream === "undefined") return null;
  try { return new Uint8Array(await new Response(new Blob([u8]).stream().pipeThrough(new CompressionStream("deflate-raw"))).arrayBuffer()); }
  catch (e) { return null; }
}
async function inflateRaw(u8) {
  if (typeof DecompressionStream === "undefined") throw F.err("nodecomp");
  return new Uint8Array(await new Response(new Blob([u8]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).arrayBuffer());
}
F.zip = async function (entries) {           // entries: [{name, data: string|Uint8Array, store?: bool}]
  const parts = [], central = [];
  let off = 0;
  const d = new Date(), dosTime = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), dosDate = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  for (const e of entries) {
    const raw = typeof e.data === "string" ? enc.encode(e.data) : e.data, name = enc.encode(e.name), crc = crc32(raw);
    let data = raw, method = 0;
    if (!e.store && raw.length > 64) { const z = await deflateRaw(raw); if (z && z.length < raw.length) { data = z; method = 8; } }
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, method, true);
    lh.setUint16(10, dosTime, true); lh.setUint16(12, dosDate, true); lh.setUint32(14, crc, true); lh.setUint32(18, data.length, true);
    lh.setUint32(22, raw.length, true); lh.setUint16(26, name.length, true); lh.setUint16(28, 0, true);
    parts.push(new Uint8Array(lh.buffer), name, data);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, method, true);
    ch.setUint16(12, dosTime, true); ch.setUint16(14, dosDate, true); ch.setUint32(16, crc, true); ch.setUint32(20, data.length, true);
    ch.setUint32(24, raw.length, true); ch.setUint16(28, name.length, true); ch.setUint32(42, off, true);
    central.push(new Uint8Array(ch.buffer), name);
    off += 30 + name.length + data.length;
  }
  const cdSize = central.reduce((a, p) => a + p.length, 0);
  const eo = new DataView(new ArrayBuffer(22));
  eo.setUint32(0, 0x06054b50, true); eo.setUint16(8, entries.length, true); eo.setUint16(10, entries.length, true);
  eo.setUint32(12, cdSize, true); eo.setUint32(16, off, true);
  return new Blob(parts.concat(central, [new Uint8Array(eo.buffer)]));
};
F.unzip = function (buf) {
  const u8 = new Uint8Array(buf), dv = new DataView(buf);
  let eocd = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw F.err("notzip");
  const n = dv.getUint16(eocd + 10, true);
  let off = dv.getUint32(eocd + 16, true);
  if (off === 0xffffffff) throw F.err("zip64");
  const files = new Map(), dec = new TextDecoder();
  for (let k = 0; k < n; k++) {
    if (dv.getUint32(off, true) !== 0x02014b50) throw F.err("notzip");
    const method = dv.getUint16(off + 10, true), csize = dv.getUint32(off + 20, true), nlen = dv.getUint16(off + 28, true);
    const elen = dv.getUint16(off + 30, true), clen = dv.getUint16(off + 32, true), lho = dv.getUint32(off + 42, true);
    const name = dec.decode(u8.subarray(off + 46, off + 46 + nlen));
    off += 46 + nlen + elen + clen;
    const start = lho + 30 + dv.getUint16(lho + 26, true) + dv.getUint16(lho + 28, true);
    files.set(name.replace(/^\/+/, ""), { method, data: u8.subarray(start, start + csize) });
  }
  return {
    has: (p) => files.has(p),
    names: () => Array.from(files.keys()),
    bytes: async (p) => { const e = files.get(p); if (!e) return null; if (e.method === 0) return e.data; if (e.method === 8) return inflateRaw(e.data); throw F.err("method"); },
    text: async function (p) { const b = await this.bytes(p); return b ? new TextDecoder().decode(b) : null; }
  };
};

/* ---------- Helfer ---------- */
F.err = (code) => { const e = new Error(code); e.code = code; return e; };
const xmlDoc = (s) => { const d = new DOMParser().parseFromString(s, "application/xml"); if (d.getElementsByTagName("parsererror").length) throw F.err("xml"); return d; };
const kids = (el, name) => el ? Array.from(el.children).filter((c) => c.localName === name) : [];
const xesc = (s) => String(s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const NUM = /^-?(0|[1-9]\d{0,14})(\.\d{1,15})?([eE][-+]?\d{1,3})?$/;
F.isNumber = (s) => NUM.test(s) && isFinite(+s);
const fmtNum = (v) => { const n = +v; if (!isFinite(n)) return String(v); return String(parseFloat(n.toPrecision(15))); };
F.rectangular = function (rows) {  // ragged -> rectangular, trailing empty rows/cols removed
  let w = 0, h = 0;
  rows.forEach((r, i) => { for (let j = r.length - 1; j >= 0; j--) if (r[j] !== "" && r[j] != null) { w = Math.max(w, j + 1); h = i + 1; break; } });
  return rows.slice(0, h).map((r) => { const o = new Array(w); for (let j = 0; j < w; j++) o[j] = r[j] == null ? "" : String(r[j]); return o; });
};

/* ---------- Text / CSV ---------- */
F.decode = function (bytes) {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return { text: new TextDecoder("utf-8").decode(bytes.subarray(3)), encoding: "UTF-8 (BOM)" };
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return { text: new TextDecoder("utf-16le").decode(bytes.subarray(2)), encoding: "UTF-16 LE" };
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return { text: new TextDecoder("utf-16be").decode(bytes.subarray(2)), encoding: "UTF-16 BE" };
  try { return { text: new TextDecoder("utf-8", { fatal: true }).decode(bytes), encoding: "UTF-8" }; }
  catch (e) { return { text: new TextDecoder("windows-1252").decode(bytes), encoding: "Windows-1252" }; }
};
F.detectDelimiter = function (text) {
  const cands = [",", ";", "\t", "|"], lines = [];
  let cur = "", q = false;
  for (let i = 0; i < text.length && lines.length < 30; i++) {
    const c = text[i];
    if (c === '"') q = !q;
    if (!q && (c === "\n" || c === "\r")) { if (cur) lines.push(cur); cur = ""; if (c === "\r" && text[i + 1] === "\n") i++; continue; }
    cur += c;
  }
  if (cur && lines.length < 30) lines.push(cur);
  let best = ",", bestScore = -1;
  for (const d of cands) {
    const counts = lines.map((l) => { let n = 0, inq = false; for (const c of l) { if (c === '"') inq = !inq; else if (c === d && !inq) n++; } return n; });
    if (!counts.length || Math.max(...counts) === 0) continue;
    const mode = counts.sort((a, b) => counts.filter((x) => x === b).length - counts.filter((x) => x === a).length)[0];
    const score = counts.filter((x) => x === mode).length * 10 + mode;
    if (mode > 0 && score > bestScore) { bestScore = score; best = d; }
  }
  return best;
};
F.parseCSV = function (text, delim) {
  const rows = []; let row = [], f = "", i = 0, q = false;
  const n = text.length;
  while (i < n) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { f += '"'; i += 2; continue; } q = false; i++; continue; }
      f += c; i++; continue;
    }
    if (c === '"' && f === "") { q = true; i++; continue; }
    if (c === delim) { row.push(f); f = ""; i++; continue; }
    if (c === "\r" || c === "\n") { row.push(f); rows.push(row); row = []; f = ""; i += c === "\r" && text[i + 1] === "\n" ? 2 : 1; continue; }
    f += c; i++;
  }
  if (f !== "" || row.length) { row.push(f); rows.push(row); }
  return rows;
};
F.toCSV = function (rows, delim, bom) {
  const esc = (v) => { v = v == null ? "" : String(v); return /["\r\n]/.test(v) || v.includes(delim) || /^\s|\s$/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
  return (bom ? "﻿" : "") + rows.map((r) => r.map(esc).join(delim)).join("\r\n") + "\r\n";
};

/* ---------- XLSX lesen ---------- */
const colIndex = (ref) => { let n = 0; for (const ch of ref) { const c = ch.charCodeAt(0); if (c < 65 || c > 90) break; n = n * 26 + (c - 64); } return n - 1; };
F.colName = (i) => { let s = ""; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
function excelDate(serial, d1904) {
  const ms = Math.round((serial - (d1904 ? -1462 : 0) - 25569) * 86400000);
  const d = new Date(ms), p = (x) => String(x).padStart(2, "0");
  const date = d.getUTCFullYear() + "-" + p(d.getUTCMonth() + 1) + "-" + p(d.getUTCDate());
  if (Number.isInteger(serial)) return date;
  const t = p(d.getUTCHours()) + ":" + p(d.getUTCMinutes()) + (d.getUTCSeconds() ? ":" + p(d.getUTCSeconds()) : "");
  return serial < 1 ? t : date + " " + t;
}
const relTarget = (base, target) => {
  if (target.startsWith("/")) return target.slice(1);
  const parts = base.split("/").slice(0, -1);
  for (const seg of target.split("/")) { if (seg === "..") parts.pop(); else if (seg !== ".") parts.push(seg); }
  return parts.join("/");
};
F.readXLSX = async function (buf) {
  const z = F.unzip(buf);
  let wbPath = "xl/workbook.xml";
  const rootRels = await z.text("_rels/.rels");
  if (rootRels) { const r = Array.from(xmlDoc(rootRels).getElementsByTagNameNS("*", "Relationship")).find((x) => /officeDocument$/.test(x.getAttribute("Type"))); if (r) wbPath = relTarget("", r.getAttribute("Target")); }
  const wbXml = await z.text(wbPath);
  if (!wbXml) throw F.err("noworkbook");
  const wb = xmlDoc(wbXml);
  const relsXml = await z.text(wbPath.replace(/[^/]+$/, "_rels/$&.rels"));
  const rels = new Map(relsXml ? Array.from(xmlDoc(relsXml).getElementsByTagNameNS("*", "Relationship")).map((r) => [r.getAttribute("Id"), relTarget(wbPath, r.getAttribute("Target"))]) : []);
  const wbPr = wb.getElementsByTagNameNS("*", "workbookPr")[0];
  const d1904 = !!wbPr && /^(1|true)$/.test(wbPr.getAttribute("date1904") || "");
  const sheets = Array.from(wb.getElementsByTagNameNS("*", "sheet")).map((s, i) => {
    const rid = s.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id") || s.getAttribute("r:id");
    return { name: s.getAttribute("name") || "Sheet" + (i + 1), path: rels.get(rid) || "xl/worksheets/sheet" + (i + 1) + ".xml" };
  });
  // shared strings (ohne phonetische Hilfen rPh)
  const shared = [];
  const ssPath = Array.from(rels.values()).find((p) => /sharedStrings\.xml$/i.test(p)) || "xl/sharedStrings.xml";
  const ssXml = await z.text(ssPath);
  if (ssXml) for (const si of xmlDoc(ssXml).getElementsByTagNameNS("*", "si")) {
    let s = ""; for (const t of si.getElementsByTagNameNS("*", "t")) if (t.parentNode.localName !== "rPh") s += t.textContent;
    shared.push(s);
  }
  // Datumsformate
  const dateXf = [];
  const stPath = Array.from(rels.values()).find((p) => /styles\.xml$/i.test(p)) || "xl/styles.xml";
  const stXml = await z.text(stPath);
  if (stXml) {
    const st = xmlDoc(stXml), custom = new Map();
    for (const nf of st.getElementsByTagNameNS("*", "numFmt")) custom.set(+nf.getAttribute("numFmtId"), nf.getAttribute("formatCode") || "");
    const isDateFmt = (id) => {
      if ((id >= 14 && id <= 22) || (id >= 45 && id <= 47)) return true;
      const code = custom.get(id); if (!code) return false;
      const c = code.replace(/"[^"]*"|\[[^\]]*\]|\\./g, "");
      return /[dmyhs]/i.test(c) && !/^general$/i.test(c);
    };
    const xfs = st.getElementsByTagNameNS("*", "cellXfs")[0];
    kids(xfs, "xf").forEach((xf, i) => { dateXf[i] = isDateFmt(+xf.getAttribute("numFmtId")); });
  }
  return {
    sheets: sheets.map((s) => s.name),
    load: async (idx) => {
      const xml = await z.text(sheets[idx].path);
      if (!xml) return [];
      const doc = xmlDoc(xml), rows = [];
      let rNext = 0;
      for (const row of doc.getElementsByTagNameNS("*", "row")) {
        const ri = row.hasAttribute("r") ? +row.getAttribute("r") - 1 : rNext;
        rNext = ri + 1;
        const out = rows[ri] = rows[ri] || [];
        let cNext = 0;
        for (const c of kids(row, "c")) {
          const ci = c.hasAttribute("r") ? colIndex(c.getAttribute("r")) : cNext;
          cNext = ci + 1;
          const t = c.getAttribute("t"), vEl = kids(c, "v")[0], v = vEl ? vEl.textContent : null;
          let val = "";
          if (t === "s") val = v != null ? shared[+v] ?? "" : "";
          else if (t === "inlineStr") { const is = kids(c, "is")[0]; val = is ? Array.from(is.getElementsByTagNameNS("*", "t")).filter((x) => x.parentNode.localName !== "rPh").map((x) => x.textContent).join("") : ""; }
          else if (t === "str" || t === "e") val = v ?? "";
          else if (t === "b") val = v === "1" ? "TRUE" : v === "0" ? "FALSE" : "";
          else if (t === "d") val = (v || "").replace("T", " ").replace(/(\.\d+)?Z?$/, "");
          else if (v != null && v !== "") { const s = +c.getAttribute("s") || 0; val = dateXf[s] ? excelDate(+v, d1904) : fmtNum(v); }
          out[ci] = val;
        }
      }
      for (let i = 0; i < rows.length; i++) if (!rows[i]) rows[i] = [];
      return rows;
    }
  };
};

/* ---------- ODS lesen ---------- */
const NS_T = "urn:oasis:names:tc:opendocument:xmlns:table:1.0", NS_O = "urn:oasis:names:tc:opendocument:xmlns:office:1.0", NS_X = "urn:oasis:names:tc:opendocument:xmlns:text:1.0";
function odsText(el) {
  let s = "";
  for (const n of el.childNodes) {
    if (n.nodeType === 3) s += n.nodeValue;
    else if (n.nodeType === 1) {
      if (n.localName === "s") s += " ".repeat(+(n.getAttributeNS(NS_X, "c") || 1));
      else if (n.localName === "tab") s += "\t";
      else if (n.localName === "line-break") s += "\n";
      else if (n.localName === "annotation") continue;
      else s += odsText(n);
    }
  }
  return s;
}
F.readODS = async function (buf) {
  const z = F.unzip(buf);
  const xml = await z.text("content.xml");
  if (!xml) throw F.err("noworkbook");
  const doc = xmlDoc(xml);
  const tables = Array.from(doc.getElementsByTagNameNS(NS_T, "table")).filter((t) => t.parentNode.localName === "spreadsheet");
  return {
    sheets: tables.map((t, i) => t.getAttributeNS(NS_T, "name") || "Sheet" + (i + 1)),
    load: async (idx) => {
      const rows = [];
      const walk = (el) => {
        for (const ch of el.children) {
          if (ch.localName === "table-row") {
            const rrep = Math.min(+(ch.getAttributeNS(NS_T, "number-rows-repeated") || 1), 100000);
            const cells = [];
            let pendingEmpty = 0;
            for (const c of ch.children) {
              if (c.localName !== "table-cell" && c.localName !== "covered-table-cell") continue;
              const rep = Math.min(+(c.getAttributeNS(NS_T, "number-columns-repeated") || 1), 16384);
              const type = c.getAttributeNS(NS_O, "value-type");
              let v = "";
              if (type === "float" || type === "percentage" || type === "currency") v = fmtNum(c.getAttributeNS(NS_O, "value"));
              else if (type === "date") v = (c.getAttributeNS(NS_O, "date-value") || "").replace("T", " ").replace(/(\.\d+)?$/, "").replace(/ 00:00:00$/, "").replace(/( \d\d:\d\d):00$/, "$1");
              else if (type === "time") { const m = /PT(\d+)H(\d+)M(\d+)/.exec(c.getAttributeNS(NS_O, "time-value") || ""); v = m ? m[1].padStart(2, "0") + ":" + m[2] + (m[3] !== "00" ? ":" + m[3] : "") : ""; }
              else if (type === "boolean") v = c.getAttributeNS(NS_O, "boolean-value") === "true" ? "TRUE" : "FALSE";
              else v = kids(c, "p").map(odsText).join("\n");
              if (v === "") { pendingEmpty += rep; continue; }
              for (let k = 0; k < pendingEmpty; k++) cells.push("");
              pendingEmpty = 0;
              for (let k = 0; k < rep; k++) cells.push(v);
            }
            for (let k = 0; k < rrep; k++) rows.push(cells.slice());
          } else if (/^table-(header-rows|row-group|rows)$/.test(ch.localName)) walk(ch);
        }
      };
      walk(tables[idx]);
      return rows;
    }
  };
};

/* ---------- Excel 2003 XML lesen ---------- */
F.readXML2003 = async function (text) {
  const doc = xmlDoc(text);
  const ws = Array.from(doc.getElementsByTagNameNS("*", "Worksheet"));
  if (!ws.length) throw F.err("unknown");
  const A = (el, a) => el.getAttributeNS("urn:schemas-microsoft-com:office:spreadsheet", a) || el.getAttribute("ss:" + a);
  return {
    sheets: ws.map((w, i) => A(w, "Name") || "Sheet" + (i + 1)),
    load: async (idx) => {
      const rows = [], table = kids(ws[idx], "Table")[0];
      let r = 0;
      for (const row of kids(table, "Row")) {
        if (A(row, "Index")) r = +A(row, "Index") - 1;
        const out = rows[r] = [];
        let c = 0;
        for (const cell of kids(row, "Cell")) {
          if (A(cell, "Index")) c = +A(cell, "Index") - 1;
          const data = kids(cell, "Data")[0];
          let v = data ? data.textContent : "";
          if (data && A(data, "Type") === "DateTime") v = v.replace("T", " ").replace(/(\.\d+)?$/, "").replace(/ 00:00:00$/, "").replace(/( \d\d:\d\d):00$/, "$1");
          if (data && A(data, "Type") === "Number") v = fmtNum(v);
          if (data && A(data, "Type") === "Boolean") v = v === "1" ? "TRUE" : "FALSE";
          out[c] = v; c += 1 + (+A(cell, "MergeAcross") || 0);
        }
        r++;
      }
      for (let i = 0; i < rows.length; i++) if (!rows[i]) rows[i] = [];
      return rows;
    }
  };
};

/* ---------- Datei öffnen (Typ erkennen) ---------- */
F.open = async function (file) {
  const name = file.name, ext = (name.split(".").pop() || "").toLowerCase();
  const buf = await file.arrayBuffer(), u8 = new Uint8Array(buf);
  const isZip = u8[0] === 0x50 && u8[1] === 0x4b;
  const isOle = u8[0] === 0xd0 && u8[1] === 0xcf && u8[2] === 0x11 && u8[3] === 0xe0;
  if (isOle) throw F.err("xls");
  if (isZip) {
    const z = F.unzip(buf);
    if (z.has("content.xml") && (z.has("mimetype") || ext === "ods")) return Object.assign(await F.readODS(buf), { type: "ods" });
    if (z.names().some((n) => /^xl\//.test(n))) return Object.assign(await F.readXLSX(buf), { type: "xlsx" });
    throw F.err("unknown");
  }
  const { text, encoding } = F.decode(u8);
  if (/^\s*<\?xml/.test(text) && /urn:schemas-microsoft-com:office:spreadsheet/.test(text.slice(0, 3000))) return Object.assign(await F.readXML2003(text), { type: "xml2003" });
  if (/^\s*<(!doctype html|html|table)/i.test(text)) throw F.err("html");
  const delim = ext === "tsv" || ext === "tab" ? "\t" : F.detectDelimiter(text);
  const rows = F.parseCSV(text, delim);
  return { type: delim === "\t" ? "tsv" : "csv", delim, encoding, sheets: [name.replace(/\.[^.]+$/, "")], load: async () => rows };
};

/* ---------- Schreiben ---------- */
const sheetName = (s) => (String(s || "Sheet1").replace(/[\[\]:*?/\\]/g, "-").slice(0, 31).trim() || "Sheet1");
F.writeXLSX = async function (rows, name, opt) {
  opt = opt || {};
  const cell = (v, r, c) => {
    const ref = F.colName(c) + (r + 1), st = (opt.boldRow != null && opt.boldRow >= 0 && r === opt.boldRow) || (opt.boldCol != null && opt.boldCol >= 0 && c === opt.boldCol) ? ' s="1"' : "";
    if (v === "" || v == null) return st ? '<c r="' + ref + '"' + st + "/>" : "";
    if (F.isNumber(v)) return '<c r="' + ref + '"' + st + "><v>" + v + "</v></c>";
    return '<c r="' + ref + '"' + st + ' t="inlineStr"><is><t xml:space="preserve">' + xesc(v) + "</t></is></c>";
  };
  const pane = opt.freezeRows > 0 ? '<sheetViews><sheetView workbookViewId="0"><pane ySplit="' + opt.freezeRows + '" topLeftCell="A' + (opt.freezeRows + 1) + '" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'
    : opt.freezeCols > 0 ? '<sheetViews><sheetView workbookViewId="0"><pane xSplit="' + opt.freezeCols + '" topLeftCell="' + F.colName(opt.freezeCols) + '1" activePane="topRight" state="frozen"/></sheetView></sheetViews>' : "";
  const w = rows.reduce((m, r) => Math.max(m, r.length), 0);
  const dim = rows.length && w ? '<dimension ref="A1:' + F.colName(w - 1) + rows.length + '"/>' : "";
  const data = rows.map((r, i) => '<row r="' + (i + 1) + '">' + r.map((v, j) => cell(v, i, j)).join("") + "</row>").join("");
  const sheet = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' + dim + pane + "<sheetData>" + data + "</sheetData></worksheet>";
  return F.zip([
    { name: "[Content_Types].xml", data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>' },
    { name: "_rels/.rels", data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>' },
    { name: "docProps/app.xml", data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>jellytable</Application></Properties>' },
    { name: "xl/workbook.xml", data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="' + xesc(sheetName(name)) + '" sheetId="1" r:id="rId1"/></sheets></workbook>' },
    { name: "xl/_rels/workbook.xml.rels", data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>' },
    { name: "xl/styles.xml", data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/><family val="2"/></font><font><b/><sz val="11"/><name val="Calibri"/><family val="2"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>' },
    { name: "xl/worksheets/sheet1.xml", data: sheet }
  ]);
};
F.writeODS = async function (rows, name) {
  const cell = (v) => {
    if (v === "" || v == null) return "<table:table-cell/>";
    if (F.isNumber(v)) return '<table:table-cell office:value-type="float" office:value="' + v + '"><text:p>' + v + "</text:p></table:table-cell>";
    return '<table:table-cell office:value-type="string">' + String(v).split("\n").map((l) => "<text:p>" + xesc(l) + "</text:p>").join("") + "</table:table-cell>";
  };
  const width = rows.reduce((a, r) => Math.max(a, r.length), 0) || 1;
  const content = '<?xml version="1.0" encoding="UTF-8"?>\n<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" office:version="1.2"><office:body><office:spreadsheet><table:table table:name="' + xesc(sheetName(name)) + '"><table:table-column table:number-columns-repeated="' + width + '"/>' +
    rows.map((r) => "<table:table-row>" + r.map(cell).join("") + "</table:table-row>").join("") + "</table:table></office:spreadsheet></office:body></office:document-content>";
  return F.zip([
    { name: "mimetype", data: "application/vnd.oasis.opendocument.spreadsheet", store: true },
    { name: "META-INF/manifest.xml", data: '<?xml version="1.0" encoding="UTF-8"?>\n<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.2"><manifest:file-entry manifest:full-path="/" manifest:version="1.2" manifest:media-type="application/vnd.oasis.opendocument.spreadsheet"/><manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/></manifest:manifest>' },
    { name: "content.xml", data: content }
  ]);
};
F.writeXML2003 = function (rows, name) {
  const cell = (v) => v === "" || v == null ? "<Cell/>" : F.isNumber(v) ? '<Cell><Data ss:Type="Number">' + v + "</Data></Cell>" : '<Cell><Data ss:Type="String">' + xesc(v).replace(/\n/g, "&#10;") + "</Data></Cell>";
  return '<?xml version="1.0" encoding="UTF-8"?>\n<?mso-application progid="Excel.Sheet"?>\n<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="' + xesc(sheetName(name)) + '"><Table>' +
    rows.map((r) => "<Row>" + r.map(cell).join("") + "</Row>").join("") + "</Table></Worksheet></Workbook>\n";
};

window.JTFormats = F;
})();
