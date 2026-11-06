### Changed
#### The calculation report in Word carries its figures, cover, header and page numbers (2026-10-28)

The Word version of PRO's calculation report is written from the same HTML as the PDF, with the
same choices of the report dialog. It used to keep only headings, paragraphs and tables. It now
also carries every figure as an image drawn at 300 dpi of its printed size, the logo and the
letterhead on a cover page without header or footer, the page breaks, the notes and the warnings
(stale or incomplete results among them) as styled paragraphs, a header with the program and
version, and a footer with the report, its date and "page n of m". Symbols and expressions keep
their meaning as text in headings, paragraphs and every table cell: sub- and superscripts at any
depth, fractions as num/den with parentheses around compound parts (and around the fraction
itself when a factor follows it or a division precedes it: (1/2)qL², x/(a/b)), roots as √(…); a
construct with no unambiguous plain form (an accent, a matrix) is written as its TeX. They are
text, not editable equations. Number columns are right-aligned and narrow tables take only the width they need. The provenance table is no longer
written twice. The same improvements reach every report exported to Word through the shared
writer (the design report and the detailing report when design is on). The calculation report's
cover no longer says "Verification per CIRSOC 201": it carries no code check.
