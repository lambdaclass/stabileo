/**
 * The raw forces report as a printable page.
 *
 * ── Why its own renderer ───────────────────────────────────────────
 *
 * `document-render.ts` renders the DETAILING document — readiness badges, certificates, bar
 * schedules, drawing coverage. Reusing it here is precisely what §5 forbids: raw solver results
 * arriving inside the chrome of a reinforcement document is how a reader stops being able to tell
 * a demand from a capacity. So this file renders tables and says, at the top, what the tables are
 * not.
 *
 * It renders the SAME `sheets` the workbook is built from — see `forces-report.ts`. There is no
 * second traversal of the results here; this file only decides what the rows look like.
 *
 * ── The print path ─────────────────────────────────────────────────
 *
 * The same one `DocumentsSection` uses: HTML into a new window, then `print()`, so the browser
 * typesets it and the user picks the paper. There is no bundled PDF writer in this tree, which
 * `rc-forces-report.ts` audited rather than assumed. When a popup is blocked the caller falls
 * back to downloading this same HTML — the fallback is a real file, not a downgrade.
 */

import type { ForcesReportDocument } from './forces-report';

export interface ForcesRenderOptions {
  /** The project's own name, or the generic word when it has none. */
  projectName: string;
  /** BCP-47 tag, only used to format the timestamp. */
  locale: string;
  /** ISO instant. Passed in, never read from a clock here — the same rule the stores keep. */
  at: string;
  /** Heading for the document as a whole. */
  title: string;
  /** Label for the scope line, the station line and the limitation list. */
  labels: { scope: string; stations: string; isNot: string; generated: string; empty: string };
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!
  ));
}

const cell = (v: string | number) =>
  typeof v === 'number' ? `<td class="num">${v}</td>` : `<td>${esc(v)}</td>`;

/**
 * One table per sheet, with its note.
 *
 * A sheet whose only row is the header prints its note and the word for "nothing to report"
 * rather than an empty `<tbody>`: a table with a header and no rows reads as a rendering failure,
 * and this document is frequently correct when a section is empty.
 */
function sheetHtml(sheet: ForcesReportDocument['sheets'][number], emptyWord: string): string {
  const [head, ...body] = sheet.aoa;
  const headHtml = head ? `<tr>${head.map((h) => `<th>${esc(String(h))}</th>`).join('')}</tr>` : '';
  const bodyHtml = body.length === 0
    ? `<tr><td class="empty" colspan="${head?.length ?? 1}">${esc(emptyWord)}</td></tr>`
    : body.map((r) => `<tr>${r.map(cell).join('')}</tr>`).join('');
  return `
    <section class="sheet">
      <h2>${esc(sheet.name)}</h2>
      <p class="note">${esc(sheet.note)}</p>
      <table><thead>${headHtml}</thead><tbody>${bodyHtml}</tbody></table>
    </section>`;
}

export function renderForcesReportHtml(
  doc: ForcesReportDocument, opts: ForcesRenderOptions,
): string {
  let when = opts.at;
  try { when = new Date(opts.at).toLocaleString(opts.locale); } catch { /* keep the ISO string */ }

  // The limitations are a list and not a sentence, and they are above the tables rather than in
  // a footer. A qualification a reader reaches after forty pages of moments has already failed.
  const limitations = doc.limitations.map((l) => `<li>${esc(l)}</li>`).join('');

  return `<!doctype html>
<html><head><meta charset="utf-8">
<title>${esc(opts.title)} — ${esc(opts.projectName)}</title>
<style>
  :root { color-scheme: light; }
  body { font: 11px/1.4 system-ui, sans-serif; color: #111; margin: 18px; }
  h1 { font-size: 15px; margin: 0 0 2px; }
  h2 { font-size: 12px; margin: 0 0 2px; }
  .project { font-size: 12px; color: #333; margin: 0 0 8px; }
  .meta { margin: 0 0 2px; color: #333; }
  .banner { border: 1px solid #999; border-left: 3px solid #444; padding: 6px 8px; margin: 8px 0 12px; }
  .banner strong { display: block; margin-bottom: 2px; }
  .banner ul { margin: 0; padding-left: 16px; }
  .note { color: #444; margin: 0 0 4px; }
  .sheet { margin: 0 0 14px; break-inside: auto; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid #bbb; padding: 1px 4px; text-align: left; }
  th { background: #eee; font-weight: 600; }
  td.num { text-align: right; font-variant-numeric: tabular-nums; }
  td.empty { color: #555; font-style: italic; text-align: left; }
  thead { display: table-header-group; }
  tr { break-inside: avoid; }
  @page { margin: 12mm; }
</style></head>
<body>
  <h1>${esc(opts.title)}</h1>
  <p class="project">${esc(opts.projectName)}</p>
  <p class="meta">${esc(opts.labels.generated)}: ${esc(when)}</p>
  <p class="meta">${esc(opts.labels.scope)}: ${esc(doc.scopeLine)}</p>
  <p class="meta">${esc(opts.labels.stations)}: ${esc(doc.stationNote)}</p>
  <div class="banner">
    <strong>${esc(opts.labels.isNot)}</strong>
    <ul>${limitations}</ul>
  </div>
  ${doc.sheets.map((s) => sheetHtml(s, opts.labels.empty)).join('')}
</body></html>`;
}
