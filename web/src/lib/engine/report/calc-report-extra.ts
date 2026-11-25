import { envelopeJumpCuts } from '../diagram-cut';
/**
 * The calculation report's chosen parts: what goes in, the figures, the kinematic analysis and a
 * table per internal force.
 *
 * The report used to be one fixed document of tables. The reader now picks each result as a
 * table, a diagram or both, and whether the kinematic analysis and the equilibrated free body
 * go in. The figures are drawn by the exports (`lib/export/view-figure.ts`) before the report is
 * written and arrive here as SVG (2D) or PNG (3D), so this stays a pure HTML writer.
 */
import { t, tp } from '../../i18n';
import type { KinematicReport } from '../kinematic-report';
import type { AnalysisResults, ElementEnvelopeDiagram, FullEnvelope } from '../types';
import type { AnalysisResults3D, FullEnvelope3D } from '../types-3d';
import { computeDiagramValueAt, computePlanarDiagramExtrema } from '../diagrams';
import { computeSpatialDiagramExtrema, type Diagram3DKind } from '../diagrams-3d';
import { isInwardEndpointFace, type DiagramOrdinate } from '../member-diagram';
import type { FigureContent } from '../../export/view-figure';

/** A result the reader can have as a table, a diagram, or both. */
export type ResultRow = 'reactions' | 'displacements' | 'moment' | 'shear' | 'axial';
export const RESULT_ROWS: readonly ResultRow[] = ['reactions', 'displacements', 'moment', 'shear', 'axial'];

export interface CalcReportContent {
  /** Materials, sections, nodes, members and supports, with the numbered model figure. */
  modelData: boolean;
  /** Load cases, combinations and the applied loads. */
  loads: boolean;
  /** Degree of indeterminacy, how it is counted, and whether it is a mechanism. */
  kinematics: boolean;
  /** The equilibrated free body of every member and node (the despiece). */
  despiece: boolean;
  rows: Record<ResultRow, { table: boolean; diagram: boolean }>;
}

export const DEFAULT_REPORT_CONTENT: CalcReportContent = {
  modelData: true,
  loads: true,
  kinematics: true,
  despiece: true,
  rows: {
    reactions: { table: true, diagram: false },
    displacements: { table: true, diagram: true },
    moment: { table: true, diagram: true },
    shear: { table: true, diagram: true },
    axial: { table: true, diagram: true },
  },
};

/** The figure a row's diagram is. */
export const ROW_FIGURE: Record<ResultRow, FigureContent> = {
  reactions: 'reactions', displacements: 'deformed', moment: 'moment', shear: 'shear', axial: 'axial',
};

/** The figures a content asks for, in report order. */
export function figuresWanted(c: CalcReportContent): FigureContent[] {
  const out: FigureContent[] = [];
  if (c.loads) out.push('model');
  if (c.rows.reactions.diagram) out.push('reactions');
  if (c.despiece) out.push('despiece');
  if (c.rows.displacements.diagram) out.push('deformed');
  for (const r of ['moment', 'shear', 'axial'] as const) if (c.rows[r].diagram) out.push(ROW_FIGURE[r]);
  return out;
}

export interface ReportFigure {
  content: FigureContent;
  title: string;
  /** A 2D figure, inline. */
  svg?: string;
  /** A 3D figure, a captured picture. */
  png?: string;
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Numbers figures in the order they appear. */
export function figureCounter(start = 1) {
  let n = start;
  return {
    /** The number of a figure drawn elsewhere (the model's), taken in its turn. */
    next(): number { return n++; },
    html(f: ReportFigure | undefined): string {
      if (!f) return '';
      const body = f.svg ? f.svg.replace(/^<\?xml[^>]*>\s*/, '') : f.png ? `<img src="${f.png}" alt="${esc(f.title)}">` : '';
      if (!body) return '';
      const caption = `${esc(tp('calcReport.figureN', { n: n++ }))} ${esc(f.title)}`;
      return `<figure class="result-fig">${body}<figcaption>${caption}</figcaption></figure>`;
    },
  };
}

export const EXTRA_CSS = `
  .result-fig { margin: 10px 0 18px; text-align: center; break-inside: avoid; }
  .result-fig svg, .result-fig img { max-width: 100%; height: auto; border: 1px solid #ccd; }
  .result-fig figcaption { font-size: 9pt; color: #555; margin-top: 4px; }
  .solve-error { border: 1px solid #e0a890; background: #fff4ef; border-radius: 6px; padding: 10px 14px; margin: 10px 0 16px; }
  .solve-error strong { color: #a03a1a; }
  .kin-formula { font-family: 'Cambria Math', 'STIX Two Math', serif; font-size: 12pt; margin: 6px 0; }
  .kin-class { font-weight: 600; margin: 6px 0 12px; }
`;

/** Why the report has no results, where the results would be. */
export function solveErrorHtml(error: string): string {
  return `<div class="solve-error"><strong>${esc(t('excel.solveFailed'))}</strong><div>${esc(error)}</div><div>${esc(t('calcReport.solveFailedHint'))}</div></div>`;
}

// ─── Kinematic analysis ──────────────────────────────────────────

export function kinematicsSectionHtml(num: string, k: KinematicReport | null | undefined): string {
  const h: string[] = ['<div class="page">', `<h1 id="sec-kinematics">${num}. ${esc(t('calcReport.kinematics'))}</h1>`];
  if (!k) {
    h.push(`<p>${esc(t('calcReport.kinematicsUnavailable'))}</p></div><div class="page-break"></div>`);
    return h.join('\n');
  }
  h.push(`<p>${esc(t('calcReport.kinematicsIntro'))}</p>`);
  h.push(`<div class="kin-formula">${esc(k.formula)}</div>`);
  h.push(`<div class="kin-formula">${esc(k.substitution)}</div>`);
  h.push(`<div class="kin-class">${esc(k.classificationText)}</div>`);

  h.push(`<h2>${num}.1 ${esc(t('calcReport.kinSupports'))} (r = ${k.totalR})</h2>`);
  if (k.supportDetails.length) {
    h.push(`<table><tr><th>${t('table.nodeLabel')}</th><th>${t('report.type')}</th><th>${esc(t('calcReport.kinRestrained'))}</th><th>r</th></tr>`);
    for (const s of k.supportDetails) {
      h.push(`<tr><td>${s.nodeId}</td><td>${esc(s.type)}</td><td>${esc(s.restrainedDofs)}</td><td class="num">${s.dofs}</td></tr>`);
    }
    h.push('</table>');
  } else h.push(`<p>${esc(t('calcReport.kinNoSupports'))}</p>`);

  const conditions = [...k.hingeDetails.map((d) => d.explanation), ...k.slideDetails.map((d) => d.explanation)];
  h.push(`<h2>${num}.2 ${esc(t('calcReport.kinConditions'))} (c = ${k.totalC})</h2>`);
  if (conditions.length) {
    h.push('<ul>');
    for (const c of conditions) h.push(`<li>${esc(c)}</li>`);
    h.push('</ul>');
  } else h.push(`<p>${esc(t('calcReport.kinNoConditions'))}</p>`);

  if (k.hasHiddenMechanism || k.mechanismModes > 0 || k.unconstrainedDofs.length > 0) {
    h.push(`<h2>${num}.3 ${esc(t('calcReport.kinMechanism'))}</h2>`);
    if (k.unconstrainedDofs.length) {
      h.push('<ul>');
      for (const u of k.unconstrainedDofs) h.push(`<li>${esc(u.explanation)}</li>`);
      h.push('</ul>');
    }
    if (k.suggestions.length) {
      h.push(`<p>${esc(t('calcReport.kinSuggestions'))}</p><ul>`);
      for (const s of k.suggestions) h.push(`<li>${esc(s)}</li>`);
      h.push('</ul>');
    }
  } else if (!k.rankChecked) {
    h.push(`<p class="table-note">${esc(t('calcReport.kinRankUnchecked'))}</p>`);
  }
  h.push('</div><div class="page-break"></div>');
  return h.join('\n');
}

// ─── One table per internal force ───────────────────────────────

type Fmt = (v: number) => string;

/** The largest value in magnitude along a member, and where it is (x from end I). */
export interface Extreme { value: number; x: number; side?: DiagramOrdinate['side'] }

type LengthFmt = (v: number, atJump?: boolean) => string;

function cutLabel({ x, side }: Extreme, format: LengthFmt): string {
  return format(x, side !== undefined) + (side === 'left' ? '⁻' : side === 'right' ? '⁺' : '');
}

type EnvelopeValue = Extreme & Pick<DiagramOrdinate, 't'>;

function envelopeValues(d: ElementEnvelopeDiagram, length: number, sign = 1): EnvelopeValue[] {
  const faces = new Map<number, Pick<Extreme, 'x' | 'side'>>();
  const addFaces = (index: number, x: number) => {
    faces.set(index, { x, side: 'left' });
    faces.set(index + 1, { x, side: 'right' });
  };
  for (const { index, distance } of envelopeJumpCuts(d, length)) addFaces(index, distance);
  return d.tPositions.map((t, i) => {
    const p = d.posValues[i] ?? 0, n = d.negValues[i] ?? 0;
    return { t, value: sign * (Math.abs(n) > Math.abs(p) ? n : p), x: t * length, ...faces.get(i) };
  });
}

function envelopeExtreme(values: readonly EnvelopeValue[]): Extreme {
  let best: Extreme = { value: 0, x: 0 };
  for (const { t, value, x, side } of values) {
    const right = side === undefined ? undefined : side === 'right';
    if (isInwardEndpointFace(t, right) && Math.abs(value) > Math.abs(best.value)) {
      best = { value, x, ...(t > 0 && t < 1 && side && { side }) };
    }
  }
  return best;
}

/** Under the table of an envelope: what its values are, and that one row mixes combinations. */
function envelopeNote(): string {
  return `<p class="table-note">${esc(t('calcReport.envelopeForcesNote'))}</p>`;
}

/**
 * A 2D internal force along each member, as its diagram gives it: the value at each end and the
 * largest, with where it is. Moments are given as the diagram's tooltip reads them (sagging
 * positive), which is how the drawn diagram is labelled.
 *
 * For the envelope the diagram is the envelope's, and `envelope` has to come with it. Its result
 * set carries, at each end, the largest end force of any combination, and the loads of the
 * first: rebuilt from those, the moment of a simple span under 1.4D and 1.2D + 1.6L read 112 at
 * a support and the shear 0 at the other end. The envelope diagram is what each combination's
 * own diagram gives, station by station.
 */
export function forceTable2D(
  kind: 'moment' | 'shear' | 'axial', r: AnalysisResults, F: Fmt, unit: string, lenFmt: LengthFmt, lenUnit: string,
  envelope?: FullEnvelope,
): string {
  const sym = kind === 'moment' ? 'M' : kind === 'shear' ? 'V' : 'N';
  const sign = kind === 'moment' ? -1 : 1;
  const h: string[] = [`<table><tr><th>${t('table.elemLabel')}</th><th>${sym}<sub>I</sub> (${unit})</th><th>${sym}<sub>J</sub> (${unit})</th><th>${esc(t('calcReport.maxAbs'))} (${unit})</th><th>x (${lenUnit})</th></tr>`];
  const env = envelope ? new Map(envelope[kind].elements.map((e) => [e.elementId, e])) : null;
  for (const ef of r.elementForces) {
    let vI: number, vJ: number, best: Extreme;
    if (env) {
      const e = env.get(ef.elementId);
      if (!e?.tPositions.length) { h.push(`<tr><td>${ef.elementId}</td><td class="num">—</td><td class="num">—</td><td class="num">—</td><td class="num">—</td></tr>`); continue; }
      const vals = envelopeValues(e, ef.length, sign);
      vI = vals[0]!.value; vJ = vals[vals.length - 1]!.value; best = envelopeExtreme(vals);
    } else {
      const at = (x: number) => sign * computeDiagramValueAt(kind, x / ef.length, ef);
      const extrema = computePlanarDiagramExtrema(kind, ef, true);
      vI = at(0);
      vJ = at(ef.length);
      best = { value: sign * extrema.maxAbsValue, x: extrema.maxAbsX, side: extrema.maxAbsSide };
    }
    h.push(`<tr><td>${ef.elementId}</td><td class="num">${F(vI)}</td><td class="num">${F(vJ)}</td><td class="num">${F(best.value)}</td><td class="num">${cutLabel(best, lenFmt)}</td></tr>`);
  }
  h.push('</table>');
  if (env) h.push(envelopeNote());
  return h.join('\n');
}

type Ef3 = AnalysisResults3D['elementForces'][number];
type Col3 = [string, Diagram3DKind, (e: Ef3, end: 'I' | 'J') => number];

/**
 * A 3D internal force along each member, its components side by side: the value at each end,
 * then the largest along the member with where it is. The values are the results tables' (a
 * moment as the solver gives it), which the diagram along the member also is at its ends.
 *
 * The ends alone missed the midspan moment of every beam carrying a span load: a 6 m simple span
 * under qz = 10 read My 0 and 0, and 45 nowhere. For the envelope the largest along is read
 * from the envelope diagram, for the reason `forceTable2D` gives.
 */
export function forceTable3D(
  kind: 'moment' | 'shear' | 'axial', r: AnalysisResults3D, F: Fmt, unit: string, lenFmt: LengthFmt, lenUnit: string,
  envelope?: FullEnvelope3D,
): string {
  const cols: Col3[] =
    kind === 'moment'
      ? [['My', 'momentY', (e, s) => (s === 'I' ? e.myStart : e.myEnd)], ['Mz', 'momentZ', (e, s) => (s === 'I' ? e.mzStart : e.mzEnd)], ['Mx', 'torsion', (e, s) => (s === 'I' ? e.mxStart : e.mxEnd)]]
      : kind === 'shear'
        ? [['Vy', 'shearY', (e, s) => (s === 'I' ? e.vyStart : e.vyEnd)], ['Vz', 'shearZ', (e, s) => (s === 'I' ? e.vzStart : e.vzEnd)]]
        : [['N', 'axial', (e, s) => (s === 'I' ? e.nStart : e.nEnd)]];
  const envOf = new Map(cols.map(([, k]) => [k, envelope ? new Map(envelope[k].elements.map((e) => [e.elementId, e])) : null]));
  const h: string[] = [`<table><tr><th>${t('table.elemLabel')}</th><th>${t('tables.end')}</th>${cols.map(([c]) => `<th>${c} (${unit})</th>`).join('')}</tr>`];
  for (const ef of r.elementForces) {
    for (const end of ['I', 'J'] as const) {
      h.push(`<tr>${end === 'I' ? `<td rowspan="3">${ef.elementId}</td>` : ''}<td>${end}</td>${cols.map(([, , get]) => `<td class="num">${F(get(ef, end))}</td>`).join('')}</tr>`);
    }
    const largest = cols.map(([, k]) => {
      const env = envOf.get(k);
      if (env) {
        const e = env.get(ef.elementId);
        return e?.tPositions.length ? envelopeExtreme(envelopeValues(e, ef.length)) : null;
      }
      const result = computeSpatialDiagramExtrema(ef, k, true);
      return result.extrema ? { value: result.maxAbsValue, x: undefined } : {
        value: result.maxAbsValue, x: result.maxAbsX, side: result.maxAbsSide,
      };
    });
    h.push(`<tr><td>${esc(t('calcReport.maxAbs'))}</td>${largest.map((b) => {
      const value = !b ? '—' : b.x === undefined ? `${esc(t('figures.diagramMagnitudeBound'))} ${F(b.value)}` : `${F(b.value)} (x = ${cutLabel({ ...b, x: b.x }, lenFmt)} ${lenUnit})`;
      return `<td class="num">${value}</td>`;
    }).join('')}</tr>`);
  }
  h.push('</table>');
  if (envelope) h.push(envelopeNote());
  return h.join('\n');
}
