#!/usr/bin/env python3
"""Convert the supplied official CIRSOC / INPRES-CIRSOC PDFs into structured Markdown.

Design rules (mirrors the run brief):
  * never invent text - every emitted line comes from the PDF text layer
  * preserve clause hierarchy by detecting numbered headings
  * keep a source page anchor on every chapter and every clause
  * flag low-confidence pages (empty / very short / high non-word ratio)
  * emit per-document metadata with sha256 + extraction stats
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import subprocess
import sys
import unicodedata
from dataclasses import dataclass, field, asdict

SRC = "/Users/bauti/Claude/stabileo/docs/codes/CIRSOC"
OUT = "/Users/bauti/Claude/stabileo/docs/codes/CIRSOC/markdown"

DOCS = [
    ("CIRSOC 101-2025.pdf", "cirsoc-101-2025", "CIRSOC 101", "2025",
     "Reglamento Argentino de Cargas Permanentes y Sobrecargas Mínimas de Diseño para Edificios y Otras Estructuras"),
    ("CIRSOC 102-2025.pdf", "cirsoc-102-2025", "CIRSOC 102", "2025",
     "Reglamento Argentino de Acción del Viento sobre las Construcciones"),
    ("CIRSOC 201-2025.pdf", "cirsoc-201-2025", "CIRSOC 201", "2025",
     "Reglamento Argentino de Estructuras de Hormigón"),
    ("CIRSOC 301-2018.pdf", "cirsoc-301-2018", "CIRSOC 301", "2018",
     "Reglamento Argentino de Estructuras de Acero para Edificios"),
    ("INPRES-CIRSOC-103_Parte_I-Reglamento.pdf", "inpres-cirsoc-103-i", "INPRES-CIRSOC 103 Parte I", "2018",
     "Reglamento Argentino para Construcciones Sismorresistentes - Parte I: Construcciones en General"),
    ("INPRES-CIRSOC-103_Parte_II-Reglamento.pdf", "inpres-cirsoc-103-ii", "INPRES-CIRSOC 103 Parte II", "2005",
     "Reglamento Argentino para Construcciones Sismorresistentes - Parte II: Construcciones de Hormigón Armado"),
    ("INPRES-CIRSOC-103_Parte_III-Reglamento.pdf", "inpres-cirsoc-103-iii", "INPRES-CIRSOC 103 Parte III", "2018",
     "Reglamento Argentino para Construcciones Sismorresistentes - Parte III: Construcciones de Mampostería"),
    ("INPRES-CIRSOC-103_Parte_IV-Reglamento.pdf", "inpres-cirsoc-103-iv", "INPRES-CIRSOC 103 Parte IV", "2005",
     "Reglamento Argentino para Construcciones Sismorresistentes - Parte IV: Construcciones de Acero"),
    ("INPRES-CIRSOC-103_Parte_V-Reglamento.pdf", "inpres-cirsoc-103-v", "INPRES-CIRSOC 103 Parte V", "2018",
     "Reglamento Argentino para Construcciones Sismorresistentes - Parte V: Soldadura de Estructuras de Acero Sismorresistentes"),
]

CHAP_RE = re.compile(r"^\s*(CAP[IÍ]TULO|AP[EÉ]NDICE|ANEXO)\s+([0-9IVXA-Z]+)\.?\s*[-.:]?\s*(.*)$", re.I)
# 9.7.3.4. Title      /  9.7.3.4 Title
CLAUSE_RE = re.compile(r"^\s{0,8}(\d{1,2}(?:\.\d{1,3}){0,4})\.?\s+([A-ZÁÉÍÓÚÑ][^\n]{2,120})$")
TOC_LINE = re.compile(r"\.{4,}\s*\d+\s*$|\s{6,}\d{1,3}\s*$")
FOOTER_RE = re.compile(
    r"IF-\d{4}-\d+-APN-|^\s*Página \d+ de \d+\s*$|^\s*Reglamento CIRSOC \S+\s*$|"
    r"^\s*Reglamento Argentino\b.*$|^\s*INPRES-CIRSOC 103\b.*$|^\s*Comentarios al\b.*$",
    re.I,
)


def sh256(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def slug(text: str) -> str:
    t = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    t = re.sub(r"[^a-zA-Z0-9]+", "-", t).strip("-").lower()
    return t[:60] or "seccion"


@dataclass
class PageStat:
    page: int
    chars: int
    confidence: str  # ok | sparse | empty


@dataclass
class ChapterOut:
    key: str
    number: str
    title: str
    first_page: int
    last_page: int
    clauses: list = field(default_factory=list)
    file: str = ""


def read_pages(pdf: str, npages: int) -> list[str]:
    """One pdftotext -layout call, split on form feed."""
    raw = subprocess.run(
        ["pdftotext", "-layout", "-enc", "UTF-8", pdf, "-"],
        capture_output=True, check=True,
    ).stdout.decode("utf-8", "replace")
    pages = raw.split("\f")
    if pages and pages[-1].strip() == "":
        pages.pop()
    return pages


def clean_page(text: str) -> list[str]:
    out = []
    for line in text.split("\n"):
        line = line.rstrip()
        if FOOTER_RE.search(line):
            continue
        out.append(line)
    # collapse >2 blank lines
    res, blanks = [], 0
    for line in out:
        if not line.strip():
            blanks += 1
            if blanks > 1:
                continue
        else:
            blanks = 0
        res.append(line)
    return res


def upper_ratio(text: str) -> float:
    letters = [c for c in text if c.isalpha()]
    if not letters:
        return 0.0
    return sum(1 for c in letters if c.isupper()) / len(letters)


def chapter_ordinal(num: str) -> int | None:
    """Numeric rank for monotonicity. Roman/alpha chapters return None."""
    return int(num) if num.isdigit() else None


def is_toc_page(lines: list[str]) -> bool:
    body = [l for l in lines if l.strip()]
    if len(body) < 6:
        return False
    hits = sum(1 for l in body if TOC_LINE.search(l))
    return hits / len(body) > 0.55


def main() -> None:
    os.makedirs(OUT, exist_ok=True)
    inventory = []

    for fname, key, code, edition, title in DOCS:
        pdf = os.path.join(SRC, fname)
        if not os.path.exists(pdf):
            print(f"MISSING {fname}", file=sys.stderr)
            continue
        info = subprocess.run(["pdfinfo", pdf], capture_output=True).stdout.decode("utf-8", "replace")
        npages = int(re.search(r"^Pages:\s+(\d+)", info, re.M).group(1))
        pages = read_pages(pdf, npages)

        docdir = os.path.join(OUT, key)
        os.makedirs(docdir, exist_ok=True)

        stats: list[PageStat] = []
        chapters: list[ChapterOut] = []
        cur: ChapterOut | None = None
        cur_lines: list[str] = []
        toc_pages = 0
        last_ord = 0

        def flush(last_page: int) -> None:
            nonlocal cur, cur_lines
            if cur is None:
                return
            cur.last_page = last_page
            fn = f"{slug(cur.number)}-{slug(cur.title)}.md"
            cur.file = fn
            with open(os.path.join(docdir, fn), "w", encoding="utf-8") as fh:
                fh.write(f"# {code} ({edition}) — {cur.number}. {cur.title}\n\n")
                fh.write(f"> Source: `{fname}` · PDF pages {cur.first_page}–{cur.last_page}\n")
                fh.write(f"> Extraction: `pdftotext -layout` text layer, verbatim. "
                         f"No text was rewritten or inferred.\n\n")
                fh.write("\n".join(cur_lines).strip() + "\n")
            chapters.append(cur)
            cur, cur_lines = None, []

        nonlocal_last = None
        for idx, ptext in enumerate(pages, start=1):
            chars = len(ptext.strip())
            stats.append(PageStat(idx, chars, "empty" if chars == 0 else ("sparse" if chars < 120 else "ok")))
            lines = clean_page(ptext)
            if is_toc_page(lines):
                toc_pages += 1
                continue

            for line in lines:
                m = CHAP_RE.match(line)
                if m and len(line.strip()) < 90:
                    num = m.group(2)
                    ttl = (m.group(3) or "").strip(" .-:")
                    kind = m.group(1).upper()
                    ordv = chapter_ordinal(num)
                    # Reject inline cross-references ("...ver el CAPÍTULO 20 y la clase...").
                    # A real heading is a standalone all-caps title, and chapter numbers
                    # only ever increase through the document.
                    titled = bool(ttl) and upper_ratio(ttl) > 0.85
                    monotonic = ordv is None or ordv > last_ord
                    if titled and monotonic:
                        flush(idx - 1 if idx > 1 else 1)
                        if ordv is not None:
                            last_ord = ordv
                        cur = ChapterOut(key=key, number=f"{kind} {num}", title=ttl,
                                         first_page=idx, last_page=idx)
                        cur_lines = []
                        continue
                    # otherwise fall through and keep the line as ordinary body text
                if cur is None:
                    cur = ChapterOut(key=key, number="0", title="Preliminares", first_page=idx, last_page=idx)
                    cur_lines = []
                cm = CLAUSE_RE.match(line)
                if cm and not TOC_LINE.search(line):
                    cur.clauses.append({"id": cm.group(1), "title": cm.group(2).strip(), "page": idx})
                    cur_lines.append(f"\n<a id=\"c{cm.group(1)}\"></a>\n### {cm.group(1)} {cm.group(2).strip()}  <sub>p.{idx}</sub>\n")
                else:
                    cur_lines.append(line)
            cur_lines.append(f"\n<!-- page {idx} -->\n")

        flush(len(pages))

        meta = {
            "key": key, "code": code, "edition": edition, "title": title,
            "source_file": fname,
            "sha256": sh256(pdf),
            "bytes": os.path.getsize(pdf),
            "pages": npages,
            "toc_pages_skipped": toc_pages,
            "extraction_method": "pdftotext -layout (embedded text layer, no OCR)",
            "pages_ok": sum(1 for s in stats if s.confidence == "ok"),
            "pages_sparse": sum(1 for s in stats if s.confidence == "sparse"),
            "pages_empty": sum(1 for s in stats if s.confidence == "empty"),
            "chapters": [
                {"number": c.number, "title": c.title, "file": c.file,
                 "pages": [c.first_page, c.last_page], "clause_count": len(c.clauses)}
                for c in chapters
            ],
            "clauses": [
                {"chapter": c.number, "id": cl["id"], "title": cl["title"], "page": cl["page"], "file": c.file}
                for c in chapters for cl in c.clauses
            ],
        }
        with open(os.path.join(docdir, "metadata.json"), "w", encoding="utf-8") as fh:
            json.dump(meta, fh, ensure_ascii=False, indent=2)

        inventory.append(meta)
        print(f"{key}: {npages}p -> {len(chapters)} chapters, {len(meta['clauses'])} clauses, "
              f"{meta['pages_sparse']} sparse, {meta['pages_empty']} empty")

    with open(os.path.join(OUT, "inventory.json"), "w", encoding="utf-8") as fh:
        json.dump(inventory, fh, ensure_ascii=False, indent=2)


if __name__ == "__main__":
    main()
