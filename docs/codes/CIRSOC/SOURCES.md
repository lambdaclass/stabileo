# Official source documents

The PDFs listed here are the **official published texts** supplied for this work.
They are public documents issued by CIRSOC / INPRES-CIRSOC under the Ministerio de
Economía – Secretaría de Obras Públicas. The PDFs themselves are **not tracked**
(see `.gitignore`) because they total ~56 MB; the structured Markdown conversion
under `markdown/` is tracked and is what the code cites.

Every SHA-256 below identifies the exact file the conversion was produced from.
To re-verify a conversion, place the PDF back in this directory, check its digest,
and re-run the converter.

| Document | Edition | Pages | Bytes | SHA-256 |
|---|---|---|---|---|
| `CIRSOC 101-2025.pdf` | 2025 | 122 | 4,585,231 | `ab1578742dc0c47fc080574d9af39059818686bfa5a44906a06aba419eaf03ec` |
| `CIRSOC 102-2025.pdf` | 2025 | 292 | 17,065,997 | `801edf11ed05a76006cad958a54b231de997e34dc72f665bdbe55c77102c7cd1` |
| `CIRSOC 201-2025.pdf` | 2025 | 657 | 13,885,242 | `ee91d038a177f22e4727082311b162fd167542fba46fa0c8427a05df52355b0b` |
| `CIRSOC 301-2018.pdf` | 2018 | 340 | 8,106,042 | `cbfd04b8802983203247f72ad7cbbd5897987cb090c40659f6fcc7eb9223b321` |
| `INPRES-CIRSOC-103_Parte_I-Reglamento.pdf` | 2018 | 106 | 3,764,650 | `49fe6c5b37c33865580f6333b47469b4107f0ab77153f0fb1238d32630eec0d8` |
| `INPRES-CIRSOC-103_Parte_II-Reglamento.pdf` | 2005 | 110 | 1,001,770 | `488c2b3523112196a5b866af003cfedccea58927a7d334a9136fd23dee43f66b` |
| `INPRES-CIRSOC-103_Parte_III-Reglamento.pdf` | 2018 | 73 | 4,078,821 | `b703b62b63124a110b1fdfccaf886055092fe3cad52f3eb57a21f15c30939870` |
| `INPRES-CIRSOC-103_Parte_IV-Reglamento.pdf` | 2005 | 82 | 803,847 | `e30b2301505da0049d736a093a0a49e8b05db1b0019ac730df308bd7c4f720ff` |
| `INPRES-CIRSOC-103_Parte_V-Reglamento.pdf` | 2018 | 67 | 3,195,936 | `c93e7fe008e473b8ef0b8440abeb9d4c5b21970315ada4991646d24af1c91eb7` |

## Extraction method and quality

All nine documents carry a real embedded text layer — **no OCR was required or used**.
Conversion is `pdftotext -layout -enc UTF-8`, split per page, with:

* running headers/footers and the `IF-YYYY-…-APN-…` expediente stamps removed;
* table-of-contents pages skipped (detected by dot-leader / right-aligned page numbers);
* chapters split into one Markdown file each, with the source PDF page range in the header;
* every numbered clause given an `<a id="cN.N.N">` anchor and a `p.N` source-page marker;
* an inline `<!-- page N -->` marker at each page boundary.

| Document | Chapters | Clauses anchored | Pages OK | Sparse | Empty |
|---|---|---|---|---|---|
| CIRSOC 101 (2025) | 6 | 110 | 116 | 0 | 6 |
| CIRSOC 102 (2025) | 16 | 484 | 281 | 6 | 5 |
| CIRSOC 201 (2025) | 30 | 2151 | 649 | 8 | 0 |
| CIRSOC 301 (2018) | 23 | 118 | 317 | 16 | 7 |
| INPRES-CIRSOC 103 Parte I (2018) | 14 | 326 | 96 | 0 | 10 |
| INPRES-CIRSOC 103 Parte II (2005) | 8 | 293 | 104 | 3 | 3 |
| INPRES-CIRSOC 103 Parte III (2018) | 10 | 143 | 66 | 4 | 3 |
| INPRES-CIRSOC 103 Parte IV (2005) | 16 | 79 | 68 | 12 | 2 |
| INPRES-CIRSOC 103 Parte V (2018) | 6 | 117 | 57 | 4 | 6 |

### Known extraction limitations — read before citing

1. **Two-column layout.** CIRSOC 101/102/201 print the normative text (REGLAMENTO) in
   the left column and the non-normative commentary (COMENTARIO) in the right column of
   the same page. `pdftotext -layout` preserves the horizontal positions, so both columns
   appear on the same Markdown line. **The normative text is the left ~60 characters.**
   Anything to the right of it is commentary and is NOT normative. Every value used in
   code was read from the normative column and is cited by clause number.
2. **Figures are not extracted.** Wind-zone maps, seismic-zone maps, rebar-detail figures
   and pressure-coefficient diagrams exist only as raster images in the PDFs. Numeric data
   that lives *only* in a figure is not available here and is marked unsupported in code
   rather than guessed.
3. **Table cells can wrap.** Long occupancy descriptions in CIRSOC 101 Table 4.1 wrap across
   lines; the numeric column stays aligned. Values transcribed into code were read cell by
   cell and each carries its clause/table reference.
4. **`Preliminares` chapter** holds cover pages, the resolution text and the index that
   precede Chapter 1. It is kept for completeness, not for citation.

## Legal status verified against the supplied texts

| Regulation | Edition supplied | Cover date | Status |
|---|---|---|---|
| CIRSOC 101 | 2025 | *Edición Julio 2025* | In force — Res. 11/2026, BO 21-01-2026, effective 22-01-2026 |
| CIRSOC 102 | 2025 | *Edición Julio 2025* | In force — same resolution |
| CIRSOC 201 | 2025 | *Edición Julio 2025*, expte. IF-2025-136960277-APN-DNGPO#MOP | In force — same resolution |
| CIRSOC 301 | 2018 | *Edición Julio 2018* | Steel; out of scope for this RC work |
| INPRES-CIRSOC 103 Parte I | 2018 | *Edición Julio 2018* | In force |
| INPRES-CIRSOC 103 Parte II | **2005** | *Edición Julio 2005* | See correction below |
| INPRES-CIRSOC 103 Parte III | 2018 | *Edición Julio 2018* | Masonry; out of scope |
| INPRES-CIRSOC 103 Parte IV | 2005 | *Edición Julio 2005* | Steel; out of scope |
| INPRES-CIRSOC 103 Parte V | 2018 | *Edición Julio 2018* | Welding; out of scope |

### Correction to an earlier claim

A previous architecture audit stated that **INPRES-CIRSOC 103 Parte II (2021)** was in
force. The document supplied here is titled **Edición Julio 2005**. This repository
therefore implements Parte II **2005**, the edition actually supplied, and every seismic
detailing rule is stamped `INPRES-CIRSOC 103-II (2005)`. If a 2021 edition exists and is
adopted, it must be supplied and re-converted before any clause is renumbered — no 2021
clause number is used anywhere in this codebase.
