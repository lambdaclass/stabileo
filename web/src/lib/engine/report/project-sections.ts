/**
 * The report's project-scale sections: the job on the cover, the summary and the envelope across
 * the result sets (whatever the number of members), the statics check, the deflection check, and
 * the figures the user chose. Each reads the same function its on-screen table does, so the
 * document and the panels print one set of numbers.
 */
import { summaryRows, envelopeRows, columnsOf, whereOf, type Source, type TableKind } from '../result-tables';
import type { StaticsRows } from '../../store/statics-rows';
import type { ProjectInfo } from '../../model/project-info';
import { currentRevision } from '../../model/project-info';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const num = (v: number, d = 3) => (Number.isFinite(v) ? (Math.abs(v) < 1e-9 ? '0' : Math.abs(v) >= 1e5 || Math.abs(v) < 1e-3 ? v.toExponential(3) : v.toFixed(d)) : '—');

type Tr = (k: string) => string;

/** The job's block on the cover: client, job, site, current revision, and the signatures. */
export function projectCoverHtml(info: ProjectInfo | undefined, tr: Tr): string[] {
  if (!info) return [];
  const out: string[] = [];
  const line = (label: string, v?: string) => (v ? `<tr><td>${esc(label)}</td><td><strong>${esc(v)}</strong></td></tr>` : '');
  const rev = currentRevision(info);
  out.push(`<table class="cover-info" style="margin:18px auto;min-width:320px;text-align:left">`);
  out.push(line(tr('projectInfo.client'), info.client), line(tr('projectInfo.job'), info.job), line(tr('projectInfo.jobNumber'), info.jobNumber), line(tr('projectInfo.site'), info.site));
  if (rev) out.push(line(tr('projectInfo.revisionCode'), `${rev.code} · ${rev.date}${rev.note ? ` · ${rev.note}` : ''}`));
  out.push(`</table>`);
  const people = (['designer', 'checker', 'approver'] as const).filter((r) => info[r]);
  if (people.length) {
    out.push(`<table class="cover-signatures" style="margin:8px auto;border-collapse:collapse"><thead><tr><th></th><th>${esc(tr('projectInfo.name'))}</th><th>${esc(tr('projectInfo.date'))}</th></tr></thead><tbody>`);
    for (const r of people) out.push(`<tr><td>${esc(tr(`projectInfo.role.${r}`))}</td><td>${esc(info[r]!.name)}</td><td>${esc(info[r]!.date ?? '')}</td></tr>`);
    out.push(`</tbody></table>`);
  }
  if ((info.revisions?.length ?? 0) > 1) {
    out.push(`<table style="margin:8px auto;font-size:10px"><thead><tr><th>${esc(tr('projectInfo.revisionCode'))}</th><th>${esc(tr('projectInfo.date'))}</th><th>${esc(tr('projectInfo.revisionNote'))}</th></tr></thead><tbody>`);
    for (const r of info.revisions!) out.push(`<tr><td>${esc(r.code)}</td><td>${esc(r.date)}</td><td>${esc(r.note ?? '')}</td></tr>`);
    out.push(`</tbody></table>`);
  }
  return out;
}

/**
 * Across the result sets: for each table, the extreme of every column with where and under
 * which set, then the envelope of every node or member end. Complete, however many members.
 */
export function envelopeSectionHtml(sources: readonly Source[], tr: Tr, heading: string): string[] {
  if (sources.length === 0) return [];
  const out: string[] = [`<h2 id="sec-envelope">${esc(heading)}</h2>`];
  out.push(`<p class="note">${esc(tr('report.env.basis').replace('{n}', String(sources.length)))}: ${sources.map((s) => esc(s.name)).join(', ')}</p>`);
  const kinds: Array<[TableKind, string]> = [['reactions', tr('report.reactions')], ['forces', tr('report.forces')], ['displacements', tr('report.displacements')]];
  for (const [kind, title] of kinds) {
    const cols = columnsOf(kind, { resultant: true });
    const summ = summaryRows(kind, sources, { resultant: true });
    out.push(`<h3>${esc(title)}: ${esc(tr('report.env.summary'))}</h3>`);
    out.push(`<table><thead><tr><th></th><th>${esc(tr('tables.max'))}</th><th>${esc(tr('report.env.where'))}</th><th>${esc(tr('tables.source'))}</th><th>${esc(tr('tables.min'))}</th><th>${esc(tr('report.env.where'))}</th><th>${esc(tr('tables.source'))}</th></tr></thead><tbody>`);
    for (const s of summ) {
      out.push(`<tr><td>${esc(s.column.label)} (${esc(s.column.unit)})</td>`
        + (s.max ? `<td class="num">${num(s.max.value)}</td><td>${esc(whereOf(s.max))}</td><td>${esc(s.max.source.name)}</td>` : '<td colspan="3">—</td>')
        + (s.min ? `<td class="num">${num(s.min.value)}</td><td>${esc(whereOf(s.min))}</td><td>${esc(s.min.source.name)}</td>` : '<td colspan="3">—</td>')
        + `</tr>`);
    }
    out.push(`</tbody></table>`);
    const env = envelopeRows(kind, sources, { resultant: true });
    out.push(`<h3>${esc(title)}: ${esc(tr('report.env.envelope'))} (${env.length})</h3>`);
    out.push(`<table class="env"><thead><tr><th>${kind === 'forces' ? esc(tr('report.env.memberEnd')) : esc(tr('report.nodes'))}</th><th></th>${cols.map((c) => `<th>${esc(c.label)} (${esc(c.unit)})</th>`).join('')}</tr></thead><tbody>`);
    for (const r of env) {
      out.push(`<tr><td rowspan="2">${esc(whereOf(r))}</td><td>${esc(tr('tables.max'))}</td>${r.max.map((m) => `<td class="num">${num(m.value)}</td>`).join('')}</tr>`);
      out.push(`<tr><td>${esc(tr('tables.min'))}</td>${r.min.map((m) => `<td class="num">${num(m.value)}</td>`).join('')}</tr>`);
    }
    out.push(`</tbody></table>`);
  }
  return out;
}

/** ΣF and ΣM of the loads against the reactions, per case and per combination. */
export function staticsSectionHtml(rows: StaticsRows | null, tr: Tr, heading: string): string[] {
  if (!rows) return [];
  const out = [`<h2 id="sec-statics">${esc(heading)}</h2>`];
  out.push(`<table><thead><tr><th>${esc(tr('pro.statics.case'))}</th><th>ΣFx</th><th>ΣFy</th><th>ΣFz</th><th>ΣMx</th><th>ΣMy</th><th>ΣMz</th><th>${esc(tr('pro.statics.relative'))}</th></tr></thead><tbody>`);
  const K = ['fx', 'fy', 'fz', 'mx', 'my', 'mz'] as const;
  for (const r of [...rows.cases, ...rows.combos]) {
    out.push(`<tr><td rowspan="2">${esc(r.caseName || tr('pro.statics.singleSolve'))}</td>${K.map((k) => `<td class="num">${num(r.applied[k], 2)}</td>`).join('')}<td rowspan="2" class="num">${r.worstRelative < 1e-6 ? '✓' : (r.worstRelative * 100).toFixed(2) + ' %'}</td></tr>`);
    out.push(`<tr>${K.map((k) => `<td class="num">${num(r.reactions[k], 2)}</td>`).join('')}</tr>`);
  }
  out.push(`</tbody></table><p class="note">${esc(tr('report.statics.note'))}</p>`);
  return out;
}

export interface DeflectionReportRow { span: string; L: number; delta: number; limit: string; direction: string; ratio: number; status: 'ok' | 'warn' | 'fail'; cantilever: boolean }

export function deflectionSectionHtml(rows: readonly DeflectionReportRow[], tr: Tr, heading: string): string[] {
  if (rows.length === 0) return [];
  const out = [`<h2 id="sec-deflections">${esc(heading)}</h2>`];
  out.push(`<table><thead><tr><th>${esc(tr('pro.elemLabel'))}</th><th>L (m)</th><th>δ (mm)</th><th>${esc(tr('defl.limits.rule'))}</th><th>${esc(tr('defl.limits.direction'))}</th><th>%</th><th></th></tr></thead><tbody>`);
  for (const r of rows) {
    out.push(`<tr><td>${esc(r.span)}${r.cantilever ? ' ⌐' : ''}</td><td class="num">${r.L.toFixed(2)}</td><td class="num">${(r.delta * 1000).toFixed(2)}</td><td>${esc(r.limit)}</td><td>${esc(r.direction)}</td><td class="num">${(r.ratio * 100).toFixed(0)}</td><td class="${r.status === 'ok' ? 'status-ok' : r.status === 'fail' ? 'status-fail' : 'status-warn'}">${r.status === 'ok' ? '✓' : r.status === 'fail' ? '✗' : '⚠'}</td></tr>`);
  }
  out.push(`</tbody></table><p class="note">${esc(tr('defl.checkHint'))}</p>`);
  return out;
}

export interface ReportFigure { dataUrl: string; caption: string }

export function figuresSectionHtml(figures: readonly ReportFigure[], tr: Tr, heading: string): string[] {
  if (figures.length === 0) return [];
  const out = [`<div class="page-break"></div>`, `<h1 id="sec-figures">${esc(heading)}</h1>`];
  figures.forEach((f, i) => {
    out.push(`<figure style="margin:12px 0;page-break-inside:avoid"><img class="screenshot" src="${f.dataUrl}" alt="${esc(f.caption)}" /><figcaption style="font-size:11px;color:#444">${esc(tr('report.figure'))} ${i + 1}. ${esc(f.caption)}</figcaption></figure>`);
  });
  return out;
}
