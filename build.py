#!/usr/bin/env python3
"""Builds jellytable into ONE self-contained file: index.html.

    python3 build.py

src/shell.html   page skeleton
src/style.css    look (jellyqda style, light/dark)
src/formats.js   reading/writing CSV, XLSX, ODS, XML
src/i18n.js      German and English texts
src/app.js       the app
"""
from pathlib import Path
from urllib.parse import quote

ROOT = Path(__file__).resolve().parent
read = lambda p: (ROOT / p).read_text(encoding="utf-8")
js = "\n".join(read(f"src/{n}") for n in ("formats.js", "i18n.js", "app.js"))
favicon = quote(read("assets/jellytable-logo.svg").strip(), safe="")
html = (read("src/shell.html").replace("/*@CSS@*/", read("src/style.css"))
        .replace("/*@JS@*/", js).replace("@FAVICON@", favicon))
(ROOT / "index.html").write_text(html, encoding="utf-8")
print(f"index.html: {len(html.encode()) // 1024} KB")
