/**
 * Basic Structural Calc-Book Report Generator
 *
 * Generates a printable HTML report covering model data, loads, and analysis results.
 * Works for both 2D and 3D Basic mode analysis.
 * Uses Blob URL + browser print for PDF output (same pattern as pro-report.ts).
 */

import type { Node, Material, Section, Element, Support } from '../store/model.svelte';
import type { AnalysisResults } from './types';
import type { AnalysisResults3D } from './types-3d';
import { releaseLabel } from '../export/excel';
import { t, tp, i18n } from '../i18n';
import { modelFigureSvg } from './report/model-figure';
import { formatValue, toDisplay, unitLabel, type Quantity, type UnitSystem } from '../utils/units';
import { extraDecimals, smallDisplacement } from '../utils/unit-format';

// ─── Types ───────────────────────────────────────────────────────

export interface CalcReportConfig {
  projectName: string;
  engineerName: string;
  companyName: string;
  date: string;
  notes: string;
}

export type ResultProvenance =
  | { kind: 'single'; caseName?: string }
  | { kind: 'combo'; comboName: string }
  | { kind: 'envelope' };

export type AnalysisModeLabel = '2D' | '3D' | 'PRO';

export interface CalcReportData {
  config: CalcReportConfig;
  is3D: boolean;
  /** A flat 2D model the 3D view shows upright: the figure stands it up the same way. */
  project2DToXZ?: boolean;
  analysisMode: AnalysisModeLabel;
  provenance: ResultProvenance;
  hasDesignChecks: boolean;
  /** The units the report is written in, as chosen in Settings; SI when not given. */
  unitSystem?: UnitSystem;
  // Model
  nodes: Node[];
  elements: Element[];
  materials: Material[];
  sections: Section[];
  supports: Support[];
  loads: Array<{ type: string; description: string; caseLabel?: string }>;
  loadCases: Array<{ id: number; type: string; name: string }>;
  combinations: Array<{ id: number; name: string; factors: Array<{ caseName: string; factor: number }> }>;
  // Results (exactly one of these should be present)
  results2D?: AnalysisResults;
  results3D?: AnalysisResults3D;
}

// ─── Formatting utilities ────────────────────────────────────────

function fmt(n: number, dec = 2): string {
  if (Math.abs(n) < 1e-10) return '0';
  if (Math.abs(n) < 0.001 && Math.abs(n) > 1e-10) return n.toExponential(2);
  return n.toFixed(dec);
}

/**
 * The report's units. Values are stored in SI and converted only here; the
 * decimals are those of the SI report and grow in a larger unit (`extraDecimals`),
 * so a reaction read to 0.01 kN reads to 0.001 tf.
 */
function unitsOf(data: CalcReportData) {
  const us = data.unitSystem ?? 'SI';
  const disp = smallDisplacement(us);
  return {
    /** A value of quantity `q`, with `dec` decimals in SI. */
    q: (v: number, q: Quantity, dec = 2) => fmt(toDisplay(v, q, us), dec + extraDecimals(q, us)),
    /** The unit of quantity `q`. */
    u: (q: Quantity) => unitLabel(q, us),
    /** A section property at the section's own scale (cm², cm⁴ or in², in⁴). */
    sec: (v: number, q: Quantity) => formatValue(v, q, us),
    /** A displacement given in metres, with `dec` decimals in millimetres. */
    d: (v: number, dec = 3) => fmt(v * disp.factor, dec + disp.extra),
    /** The unit displacements are written in: mm in SI, cm in MKS, in in imperial. */
    du: disp.unit,
  };
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ─── CSS ─────────────────────────────────────────────────────────

const CALC_REPORT_CSS = `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Segoe UI', system-ui, -apple-system, sans-serif; font-size: 10pt; color: #222; line-height: 1.5; padding: 0; }

  /* Print controls */
  .model-fig { margin: 8px 0 18px; text-align: center; break-inside: avoid; }
  .model-fig svg { max-width: 100%; height: auto; border: 1px solid #ccd; }
  .model-fig figcaption { font-size: 9pt; color: #555; margin-top: 4px; }
  .print-btn { position: fixed; top: 12px; right: 12px; z-index: 999; padding: 8px 20px; background: #1a4a7a; color: white; border: none; border-radius: 5px; cursor: pointer; font-size: 11pt; font-weight: 600; }
  .print-btn:hover { background: #0f3460; }
  @media print { .no-print { display: none !important; } }

  /* Pages */
  .page { max-width: 210mm; margin: 0 auto; padding: 15mm 20mm; }
  .page-break { page-break-after: always; break-after: page; }
  @media print { .page { max-width: none; margin: 0; padding: 10mm 15mm; } }

  /* Cover */
  .cover { text-align: center; padding-top: 80px; min-height: 90vh; display: flex; flex-direction: column; align-items: center; justify-content: center; }
  .cover h1 { font-size: 22pt; color: #1a4a7a; margin-bottom: 12px; }
  .cover .subtitle { font-size: 12pt; color: #555; margin-bottom: 4px; }
  .cover .meta { font-size: 9pt; color: #888; margin-top: 30px; }
  .cover .meta div { margin: 3px 0; }
  .cover .footer { margin-top: 40px; font-size: 8pt; color: #aaa; }

  /* Headings */
  h1 { font-size: 16pt; color: #1a4a7a; border-bottom: 2px solid #1a4a7a; padding-bottom: 4px; margin: 24px 0 12px; }
  h2 { font-size: 12pt; color: #333; margin: 16px 0 8px; }
  h3 { font-size: 10pt; color: #555; margin: 10px 0 6px; }

  /* Tables */
  table { width: 100%; border-collapse: collapse; margin: 8px 0 16px; font-size: 8.5pt; }
  th { background: #f0f4f8; color: #333; font-weight: 600; text-align: left; padding: 5px 8px; border: 1px solid #ccc; white-space: nowrap; }
  td { padding: 4px 8px; border: 1px solid #ddd; }
  tr:nth-child(even) { background: #fafafa; }
  td.num { text-align: right; font-variant-numeric: tabular-nums; }
  .table-note { font-size: 8pt; color: #888; margin-top: -10px; margin-bottom: 12px; }

  /* Summary boxes */
  .summary-box { background: #f0f7ff; border: 1px solid #c0d8f0; border-radius: 6px; padding: 12px 16px; margin: 10px 0; }
  .summary-box .label { font-size: 8pt; color: #666; text-transform: uppercase; letter-spacing: 0.05em; }
  .summary-box .value { font-size: 14pt; font-weight: 700; color: #1a4a7a; }

  /* Governing highlight */
  .governing { background: #fff8e0; font-weight: 600; }

  /* Report metadata block */
  .report-meta { border: 1px solid #c0cdd8; border-radius: 6px; margin: 0 0 16px; overflow: hidden; }
  .report-meta table { margin: 0; border: none; font-size: 9pt; }
  .report-meta th { background: #f0f4f8; border: none; border-bottom: 1px solid #ddd; width: 140px; font-size: 8pt; text-transform: uppercase; letter-spacing: 0.04em; color: #666; vertical-align: top; padding: 6px 12px; }
  .report-meta td { border: none; border-bottom: 1px solid #eee; padding: 6px 12px; color: #222; }
  .report-meta tr:last-child th, .report-meta tr:last-child td { border-bottom: none; }
  .report-meta .meta-note { font-size: 7.5pt; color: #888; margin-top: 2px; }
  .report-meta .meta-warn { font-size: 7.5pt; color: #a05020; font-weight: 600; margin-top: 2px; }

  /* TOC */
  .toc a { color: #1a4a7a; text-decoration: none; }
  .toc a:hover { text-decoration: underline; }
  .toc-entry { padding: 3px 0; font-size: 10pt; }

  /* Equilibrium */
`;

// ─── Report Metadata Block ────────────────────────────────────────

function buildReportMetadata(data: CalcReportData): string {
  // Result basis
  let basisLabel: string;
  let basisNote: string;
  const prov = data.provenance;
  if (prov.kind === 'envelope') {
    basisLabel = t('calcReport.basisEnvelope');
    basisNote = t('calcReport.basisEnvelopeNote');
  } else if (prov.kind === 'combo') {
    basisLabel = esc(prov.comboName);
    basisNote = t('calcReport.basisComboNote');
  } else {
    basisLabel = prov.caseName ? esc(prov.caseName) : t('calcReport.basisSingle');
    basisNote = t('calcReport.basisSingleNote');
  }

  // Report type — always "Analysis Only" until design-check tables are
  // actually rendered in the report body.  hasDesignChecks is kept in the
  // data interface so this gate can flip once that section exists.
  const reportType = t('calcReport.typeAnalysisOnly');
  const typeNote = t('calcReport.typeAnalysisOnlyNote');
  const typeNoteClass = 'meta-warn';

  const h: string[] = ['<div class="report-meta"><table>'];
  h.push(`<tr><th>${t('calcReport.reportType')}</th><td>${reportType}<div class="${typeNoteClass}">${typeNote}</div></td></tr>`);
  h.push(`<tr><th>${t('calcReport.resultBasis')}</th><td>${basisLabel}<div class="meta-note">${basisNote}</div></td></tr>`);
  h.push('</table></div>');
  return h.join('\n');
}

// ─── Table of Contents ───────────────────────────────────────────

function buildTOC(sections: Array<{ num: string; title: string; anchor: string }>): string {
  const h: string[] = [`<div class="page"><h1>${t('calcReport.toc')}</h1>`];
  for (const s of sections) {
    h.push(`<div class="toc-entry"><a href="#${s.anchor}">${esc(s.num)}. ${esc(s.title)}</a></div>`);
  }
  h.push('</div><div class="page-break"></div>');
  return h.join('\n');
}

// ─── Section: Cover ──────────────────────────────────────────────

function buildCover(cfg: CalcReportConfig, modeLabel: AnalysisModeLabel, nodeCount: number, elemCount: number): string {
  const h: string[] = ['<div class="page cover">'];
  if (cfg.companyName) h.push(`<div style="font-size:11pt;color:#555;letter-spacing:2px;text-transform:uppercase;margin-bottom:24px">${esc(cfg.companyName)}</div>`);
  h.push(`<h1 style="border:none;font-size:24pt">${esc(cfg.projectName || t('calcReport.defaultProject'))}</h1>`);
  h.push(`<div class="subtitle">${t('report.coverSubtitle')}</div>`);
  h.push(`<div class="subtitle">${esc(tp('calcReport.coverMode', { mode: modeLabel, nodes: nodeCount, elements: elemCount }))}</div>`);
  h.push('<div class="meta">');
  if (cfg.engineerName) h.push(`<div>${t('calcReport.engineerName')}: ${esc(cfg.engineerName)}</div>`);
  h.push(`<div>${t('file.csvDate')}: ${esc(cfg.date)}</div>`);
  h.push('</div>');
  h.push(`<div class="footer">${esc(t('calcReport.generatedBy'))}</div>`);
  h.push('</div><div class="page-break"></div>');
  return h.join('\n');
}

// ─── Section: Model Data ─────────────────────────────────────────

function buildModelSection(data: CalcReportData): string {
  const h: string[] = ['<div class="page">'];
  h.push(`<h1 id="sec-model">1. ${t('app.modelData')}</h1>`);

  // The numbered model the tables below refer to.
  const figure = modelFigureSvg({ nodes: data.nodes, elements: data.elements, supports: data.supports, is3D: data.is3D, project2DToXZ: data.project2DToXZ });
  if (figure) {
    h.push(`<figure class="model-fig">${figure}<figcaption>${t('calcReport.modelFigure')}</figcaption></figure>`);
  }

  const U = unitsOf(data);

  // 1.1 Materials
  h.push(`<h2>1.1 ${t('report.materials')} (${data.materials.length})</h2>`);
  h.push(`<table><tr><th>ID</th><th>${t('report.name')}</th><th>E (${U.u('stress')})</th><th>&nu;</th><th>&rho; (${U.u('density')})</th><th>fy (${U.u('stress')})</th></tr>`);
  for (const m of data.materials) {
    h.push(`<tr><td>${m.id}</td><td>${esc(m.name)}</td><td class="num">${U.q(m.e, 'stress', 0)}</td><td class="num">${fmt(m.nu ?? 0.3, 2)}</td><td class="num">${U.q(m.rho ?? 0, 'density', 1)}</td><td class="num">${U.q(m.fy ?? 0, 'stress', 0)}</td></tr>`);
  }
  h.push('</table>');

  // 1.2 Sections, at the section's own scale: cm² and cm⁴ read as numbers, m⁴ as 0.0000836.
  h.push(`<h2>1.2 ${t('report.sections')} (${data.sections.length})</h2>`);
  const ua = U.u('sectionArea'), ui = U.u('sectionInertia');
  h.push(`<table><tr><th>ID</th><th>${t('report.name')}</th><th>A (${ua})</th><th>Iy (${ui})</th><th>Iz (${ui})</th><th>J (${ui})</th></tr>`);
  for (const s of data.sections) {
    h.push(`<tr><td>${s.id}</td><td>${esc(s.name)}</td><td class="num">${U.sec(s.a, 'sectionArea')}</td><td class="num">${U.sec(s.iy ?? 0, 'sectionInertia')}</td><td class="num">${U.sec(s.iz ?? s.iy ?? 0, 'sectionInertia')}</td><td class="num">${U.sec(s.j ?? 0, 'sectionInertia')}</td></tr>`);
  }
  h.push('</table>');

  // 1.3 Nodes
  const nodeCount = data.nodes.length;
  const condensed = nodeCount > 50;
  h.push(`<h2>1.3 ${t('report.nodes')} (${nodeCount})</h2>`);
  const ul = U.u('length');
  if (data.is3D) {
    h.push(`<table><tr><th>ID</th><th>X (${ul})</th><th>Y (${ul})</th><th>Z (${ul})</th></tr>`);
  } else {
    h.push(`<table><tr><th>ID</th><th>X (${ul})</th><th>Y (${ul})</th></tr>`);
  }
  const showNodes = condensed ? [...data.nodes.slice(0, 20), null, ...data.nodes.slice(-5)] : data.nodes;
  for (const n of showNodes) {
    if (!n) { h.push(`<tr><td colspan="${data.is3D ? 4 : 3}" style="text-align:center;color:#888">${esc(tp('calcReport.moreNodes', { n: nodeCount - 25 }))}</td></tr>`); continue; }
    if (data.is3D) {
      h.push(`<tr><td>${n.id}</td><td class="num">${U.q(n.x, 'length', 3)}</td><td class="num">${U.q(n.y, 'length', 3)}</td><td class="num">${U.q(n.z ?? 0, 'length', 3)}</td></tr>`);
    } else {
      h.push(`<tr><td>${n.id}</td><td class="num">${U.q(n.x, 'length', 3)}</td><td class="num">${U.q(n.y, 'length', 3)}</td></tr>`);
    }
  }
  h.push('</table>');
  if (condensed) h.push(`<p class="table-note">${esc(tp('calcReport.showingNodes', { n: nodeCount }))}</p>`);

  // 1.4 Elements
  const elemCount = data.elements.length;
  const elemCondensed = elemCount > 50;
  h.push(`<h2>1.4 ${t('report.elements')} (${elemCount})</h2>`);
  h.push(`<table><tr><th>ID</th><th>${t('report.type')}</th><th>${t('calcReport.nodeI')}</th><th>${t('calcReport.nodeJ')}</th><th>${t('report.material')}</th><th>${t('table.sectionHeader')}</th><th>${t('prop.hinges')}</th></tr>`);
  const showElems = elemCondensed ? [...data.elements.slice(0, 20), null, ...data.elements.slice(-5)] : data.elements;
  for (const e of showElems) {
    if (!e) { h.push(`<tr><td colspan="7" style="text-align:center;color:#888">${esc(tp('calcReport.moreElements', { n: elemCount - 25 }))}</td></tr>`); continue; }
    const iLabel = releaseLabel(e.releaseI);
    const jLabel = releaseLabel(e.releaseJ);
    const hinges = iLabel || jLabel ? `I: ${iLabel || '—'} · J: ${jLabel || '—'}` : '—';
    h.push(`<tr><td>${e.id}</td><td>${e.type}</td><td>${e.nodeI}</td><td>${e.nodeJ}</td><td>${e.materialId}</td><td>${e.sectionId}</td><td>${hinges}</td></tr>`);
  }
  h.push('</table>');
  if (elemCondensed) h.push(`<p class="table-note">${esc(tp('calcReport.showingElements', { n: elemCount }))}</p>`);

  // 1.5 Supports
  h.push(`<h2>1.5 ${t('report.supports')} (${data.supports.length})</h2>`);
  h.push(`<table><tr><th>ID</th><th>${t('table.nodeLabel')}</th><th>${t('report.type')}</th></tr>`);
  for (const s of data.supports) {
    h.push(`<tr><td>${s.id}</td><td>${s.nodeId}</td><td>${esc(s.type)}</td></tr>`);
  }
  h.push('</table>');

  h.push('</div><div class="page-break"></div>');
  return h.join('\n');
}

// ─── Section: Loads ──────────────────────────────────────────────

function buildLoadsSection(data: CalcReportData): string {
  const h: string[] = ['<div class="page">'];
  h.push(`<h1 id="sec-loads">2. ${t('file.loads')}</h1>`);

  // 2.1 Load Cases
  if (data.loadCases.length > 0) {
    h.push(`<h2>2.1 ${t('combos.loadCases')} (${data.loadCases.length})</h2>`);
    h.push(`<table><tr><th>ID</th><th>${t('report.type')}</th><th>${t('report.name')}</th></tr>`);
    for (const lc of data.loadCases) {
      h.push(`<tr><td>${lc.id}</td><td>${esc(lc.type)}</td><td>${esc(lc.name)}</td></tr>`);
    }
    h.push('</table>');
  }

  // 2.2 Combinations
  if (data.combinations.length > 0) {
    h.push(`<h2>2.2 ${t('calcReport.loadCombinations')} (${data.combinations.length})</h2>`);
    h.push(`<table><tr><th>ID</th><th>${t('report.name')}</th><th>${t('table.factors')}</th></tr>`);
    for (const c of data.combinations) {
      const factors = c.factors.map(f => `${fmt(f.factor, 2)}×${esc(f.caseName)}`).join(' + ');
      h.push(`<tr><td>${c.id}</td><td>${esc(c.name)}</td><td>${factors}</td></tr>`);
    }
    h.push('</table>');
  }

  // 2.3 Applied loads
  h.push(`<h2>2.3 ${t('calcReport.appliedLoads')} (${data.loads.length})</h2>`);
  if (data.loads.length > 0) {
    h.push(`<table><tr><th>#</th><th>${t('report.type')}</th><th>${t('pro.thDescription')}</th><th>${t('table.case')}</th></tr>`);
    // Condensed view keeps each row numbered by its true position in the
    // full load list (the tail rows are loads N-4…N, not 32…36).
    const numbered = data.loads.map((l, i) => ({ l, n: i + 1 }));
    const showLoads = data.loads.length > 40
      ? [...numbered.slice(0, 30), null, ...numbered.slice(-5)]
      : numbered;
    for (const row of showLoads) {
      if (!row) { h.push(`<tr><td colspan="4" style="text-align:center;color:#888">${esc(tp('calcReport.moreLoads', { n: data.loads.length - 35 }))}</td></tr>`); continue; }
      const { l, n } = row;
      h.push(`<tr><td>${n}</td><td>${esc(l.type)}</td><td>${esc(l.description)}</td><td>${esc(l.caseLabel ?? '—')}</td></tr>`);
    }
    h.push('</table>');
  } else {
    h.push(`<p>${esc(t('calcReport.noLoads'))}</p>`);
  }

  h.push('</div><div class="page-break"></div>');
  return h.join('\n');
}

// ─── Section: Reactions ──────────────────────────────────────────

function buildReactionsSection(data: CalcReportData): string {
  const h: string[] = ['<div class="page">'];
  h.push(`<h1 id="sec-reactions">3. ${t('calcReport.supportReactions')}</h1>`);
  const U = unitsOf(data);
  const uf = U.u('force'), um = U.u('moment');
  const F = (v: number) => U.q(v, 'force'), M = (v: number) => U.q(v, 'moment');

  if (data.is3D && data.results3D) {
    const reactions = data.results3D.reactions;
    h.push(`<table><tr><th>${t('table.nodeLabel')}</th><th>Fx (${uf})</th><th>Fy (${uf})</th><th>Fz (${uf})</th><th>Mx (${um})</th><th>My (${um})</th><th>Mz (${um})</th></tr>`);
    let sumFx = 0, sumFy = 0, sumFz = 0;
    for (const r of reactions) {
      h.push(`<tr><td>${r.nodeId}</td><td class="num">${F(r.fx)}</td><td class="num">${F(r.fy)}</td><td class="num">${F(r.fz)}</td><td class="num">${M(r.mx)}</td><td class="num">${M(r.my)}</td><td class="num">${M(r.mz)}</td></tr>`);
      sumFx += r.fx; sumFy += r.fy; sumFz += r.fz;
    }
    h.push(`<tr style="font-weight:700;border-top:2px solid #333"><td>ΣF</td><td class="num">${F(sumFx)}</td><td class="num">${F(sumFy)}</td><td class="num">${F(sumFz)}</td><td colspan="3"></td></tr>`);
    h.push('</table>');
    h.push(buildReactionSumNote(data));
  } else if (data.results2D) {
    const reactions = data.results2D.reactions;
    h.push(`<table><tr><th>${t('table.nodeLabel')}</th><th>Rx (${uf})</th><th>Rz (${uf})</th><th>My (${um})</th></tr>`);
    let sumRx = 0, sumRz = 0;
    for (const r of reactions) {
      h.push(`<tr><td>${r.nodeId}</td><td class="num">${F(r.rx)}</td><td class="num">${F(r.rz)}</td><td class="num">${M(r.my)}</td></tr>`);
      sumRx += r.rx; sumRz += r.rz;
    }
    h.push(`<tr style="font-weight:700;border-top:2px solid #333"><td>ΣR</td><td class="num">${F(sumRx)}</td><td class="num">${F(sumRz)}</td><td></td></tr>`);
    h.push('</table>');
    h.push(buildReactionSumNote(data));
  }

  h.push('</div><div class="page-break"></div>');
  return h.join('\n');
}

/** Note accompanying the reaction-sum row. The solver reports reactions that
 *  balance the applied loads (Σreactions = −Σapplied), so the sum is only ≈ 0
 *  for unloaded or self-equilibrated models — it must NOT be tested against
 *  zero as an "equilibrium check". For envelope results the per-node values
 *  come from different combinations, so the sum has no physical meaning. */
function buildReactionSumNote(data: CalcReportData): string {
  if (data.provenance.kind === 'envelope') {
    return `<p>${esc(t('calcReport.envelopeSumNote'))}</p>`;
  }
  return `<p>${esc(t('calcReport.reactionBalanceNote'))}</p>`;
}

// ─── Section: Displacements ──────────────────────────────────────

function buildDisplacementsSection(data: CalcReportData): string {
  const h: string[] = ['<div class="page">'];
  h.push(`<h1 id="sec-displacements">4. ${t('report.displacements')}</h1>`);
  const U = unitsOf(data);
  const du = U.du;

  if (data.is3D && data.results3D) {
    const disps = data.results3D.displacements;
    // Summary
    let maxMag = 0, maxNodeId = 0;
    for (const d of disps) {
      const mag = Math.sqrt(d.ux ** 2 + d.uy ** 2 + d.uz ** 2);
      if (mag > maxMag) { maxMag = mag; maxNodeId = d.nodeId; }
    }
    h.push(`<div class="summary-box"><div class="label">${t('excel.maxDisplacement')}</div><div class="value">${U.d(maxMag)} ${du}</div><div class="label">${esc(tp('calcReport.atNode', { n: maxNodeId }))}</div></div>`);

    h.push(`<table><tr><th>${t('table.nodeLabel')}</th><th>ux (${du})</th><th>uy (${du})</th><th>uz (${du})</th><th>|u| (${du})</th></tr>`);
    const condensed = disps.length > 30;
    const sorted = [...disps].sort((a, b) => {
      const ma = Math.sqrt(a.ux ** 2 + a.uy ** 2 + a.uz ** 2);
      const mb = Math.sqrt(b.ux ** 2 + b.uy ** 2 + b.uz ** 2);
      return mb - ma;
    });
    const show = condensed ? sorted.slice(0, 20) : sorted;
    for (const d of show) {
      const mag = Math.sqrt(d.ux ** 2 + d.uy ** 2 + d.uz ** 2);
      const isMax = d.nodeId === maxNodeId;
      h.push(`<tr${isMax ? ' class="governing"' : ''}><td>${d.nodeId}</td><td class="num">${U.d(d.ux)}</td><td class="num">${U.d(d.uy)}</td><td class="num">${U.d(d.uz)}</td><td class="num">${U.d(mag)}</td></tr>`);
    }
    h.push('</table>');
    if (condensed) h.push(`<p class="table-note">${esc(tp('calcReport.showingTopDisp', { n: disps.length }))}</p>`);
  } else if (data.results2D) {
    const disps = data.results2D.displacements;
    let maxMag = 0, maxNodeId = 0;
    for (const d of disps) {
      const mag = Math.sqrt(d.ux ** 2 + (d.uz ?? 0) ** 2);
      if (mag > maxMag) { maxMag = mag; maxNodeId = d.nodeId; }
    }
    h.push(`<div class="summary-box"><div class="label">${t('excel.maxDisplacement')}</div><div class="value">${U.d(maxMag)} ${du}</div><div class="label">${esc(tp('calcReport.atNode', { n: maxNodeId }))}</div></div>`);

    h.push(`<table><tr><th>${t('table.nodeLabel')}</th><th>ux (${du})</th><th>uz (${du})</th><th>θy (rad)</th><th>|u| (${du})</th></tr>`);
    for (const d of disps) {
      const uz = d.uz ?? 0;
      const mag = Math.sqrt(d.ux ** 2 + uz ** 2);
      const isMax = d.nodeId === maxNodeId;
      h.push(`<tr${isMax ? ' class="governing"' : ''}><td>${d.nodeId}</td><td class="num">${U.d(d.ux)}</td><td class="num">${U.d(uz)}</td><td class="num">${fmt(d.ry ?? 0, 6)}</td><td class="num">${U.d(mag)}</td></tr>`);
    }
    h.push('</table>');
  }

  h.push('</div><div class="page-break"></div>');
  return h.join('\n');
}

// ─── Section: Internal Forces ────────────────────────────────────

function buildForcesSection(data: CalcReportData): string {
  const h: string[] = ['<div class="page">'];
  h.push(`<h1 id="sec-forces">5. ${t('report.forces')}</h1>`);
  const U = unitsOf(data);
  const uf = U.u('force'), um = U.u('moment');
  const F = (v: number) => U.q(v, 'force'), M = (v: number) => U.q(v, 'moment');

  if (data.is3D && data.results3D) {
    const forces = data.results3D.elementForces;
    // Summary
    let maxN = 0, maxVy = 0, maxVz = 0, maxMy = 0, maxMz = 0, maxMx = 0;
    for (const ef of forces) {
      maxN = Math.max(maxN, Math.abs(ef.nStart), Math.abs(ef.nEnd));
      maxVy = Math.max(maxVy, Math.abs(ef.vyStart), Math.abs(ef.vyEnd));
      maxVz = Math.max(maxVz, Math.abs(ef.vzStart), Math.abs(ef.vzEnd));
      maxMx = Math.max(maxMx, Math.abs(ef.mxStart), Math.abs(ef.mxEnd));
      maxMy = Math.max(maxMy, Math.abs(ef.myStart), Math.abs(ef.myEnd));
      maxMz = Math.max(maxMz, Math.abs(ef.mzStart), Math.abs(ef.mzEnd));
    }

    h.push(`<h2>5.1 ${t('calcReport.forceSummary')}</h2>`);
    h.push(`<table><tr><th>${t('report.quantity')}</th><th>${t('calcReport.maxAbsValue')}</th><th>${t('report.unit')}</th></tr>`);
    h.push(`<tr><td>${t('tooltip.diagAxial.title')}</td><td class="num">${F(maxN)}</td><td>${uf}</td></tr>`);
    h.push(`<tr><td>${t('calcReport.shearY')}</td><td class="num">${F(maxVy)}</td><td>${uf}</td></tr>`);
    h.push(`<tr><td>${t('calcReport.shearZ')}</td><td class="num">${F(maxVz)}</td><td>${uf}</td></tr>`);
    h.push(`<tr><td>${t('calcReport.torsionMx')}</td><td class="num">${M(maxMx)}</td><td>${um}</td></tr>`);
    h.push(`<tr><td>${t('calcReport.momentY')}</td><td class="num">${M(maxMy)}</td><td>${um}</td></tr>`);
    h.push(`<tr><td>${t('calcReport.momentZ')}</td><td class="num">${M(maxMz)}</td><td>${um}</td></tr>`);
    h.push('</table>');

    // Per-element table
    h.push(`<h2>5.2 ${t('calcReport.endForces')}</h2>`);
    const condensed = forces.length > 40;
    h.push(`<table style="font-size:7.5pt"><tr><th>${t('table.elemLabel')}</th><th>${t('tables.end')}</th><th>N (${uf})</th><th>Vy (${uf})</th><th>Vz (${uf})</th><th>Mx (${um})</th><th>My (${um})</th><th>Mz (${um})</th></tr>`);
    const showForces = condensed ? forces.slice(0, 30) : forces;
    for (const ef of showForces) {
      h.push(`<tr><td rowspan="2">${ef.elementId}</td><td>I</td><td class="num">${F(ef.nStart)}</td><td class="num">${F(ef.vyStart)}</td><td class="num">${F(ef.vzStart)}</td><td class="num">${M(ef.mxStart)}</td><td class="num">${M(ef.myStart)}</td><td class="num">${M(ef.mzStart)}</td></tr>`);
      h.push(`<tr><td>J</td><td class="num">${F(ef.nEnd)}</td><td class="num">${F(ef.vyEnd)}</td><td class="num">${F(ef.vzEnd)}</td><td class="num">${M(ef.mxEnd)}</td><td class="num">${M(ef.myEnd)}</td><td class="num">${M(ef.mzEnd)}</td></tr>`);
    }
    h.push('</table>');
    if (condensed) h.push(`<p class="table-note">${esc(tp('calcReport.showingForces', { n: forces.length }))}</p>`);
  } else if (data.results2D) {
    const forces = data.results2D.elementForces;
    let maxN = 0, maxV = 0, maxM = 0;
    for (const ef of forces) {
      maxN = Math.max(maxN, Math.abs(ef.nStart), Math.abs(ef.nEnd));
      maxV = Math.max(maxV, Math.abs(ef.vStart), Math.abs(ef.vEnd));
      maxM = Math.max(maxM, Math.abs(ef.mStart), Math.abs(ef.mEnd));
    }

    h.push(`<h2>5.1 ${t('calcReport.forceSummary')}</h2>`);
    h.push(`<table><tr><th>${t('report.quantity')}</th><th>${t('calcReport.maxAbsValue')}</th><th>${t('report.unit')}</th></tr>`);
    h.push(`<tr><td>${t('tooltip.diagAxial.title')}</td><td class="num">${F(maxN)}</td><td>${uf}</td></tr>`);
    h.push(`<tr><td>${t('dsm.step9.shearV')}</td><td class="num">${F(maxV)}</td><td>${uf}</td></tr>`);
    h.push(`<tr><td>${t('dsm.step9.momentM')}</td><td class="num">${M(maxM)}</td><td>${um}</td></tr>`);
    h.push('</table>');

    h.push(`<h2>5.2 ${t('calcReport.endForces')}</h2>`);
    h.push(`<table><tr><th>${t('table.elemLabel')}</th><th>${t('tables.end')}</th><th>N (${uf})</th><th>V (${uf})</th><th>M (${um})</th></tr>`);
    for (const ef of forces) {
      h.push(`<tr><td rowspan="2">${ef.elementId}</td><td>I</td><td class="num">${F(ef.nStart)}</td><td class="num">${F(ef.vStart)}</td><td class="num">${M(ef.mStart)}</td></tr>`);
      h.push(`<tr><td>J</td><td class="num">${F(ef.nEnd)}</td><td class="num">${F(ef.vEnd)}</td><td class="num">${M(ef.mEnd)}</td></tr>`);
    }
    h.push('</table>');
  }

  h.push('</div>');
  return h.join('\n');
}

// ─── Main generator ──────────────────────────────────────────────

export function generateCalcReportHtml(data: CalcReportData): string {
  const sections = [
    { num: '1', title: t('app.modelData'), anchor: 'sec-model' },
    { num: '2', title: t('file.loads'), anchor: 'sec-loads' },
    { num: '3', title: t('calcReport.supportReactions'), anchor: 'sec-reactions' },
    { num: '4', title: t('report.displacements'), anchor: 'sec-displacements' },
    { num: '5', title: t('report.forces'), anchor: 'sec-forces' },
  ];

  const html: string[] = [];
  html.push(`<!DOCTYPE html>
<html lang="${i18n.locale}">
<head>
<meta charset="UTF-8">
<title>${esc(data.config.projectName || t('report.coverSubtitle'))} — Stabileo</title>
<style>${CALC_REPORT_CSS}</style>
</head>
<body>
<button class="print-btn no-print" onclick="window.print()">${t('report.printBtn')}</button>
`);

  html.push(buildCover(data.config, data.analysisMode, data.nodes.length, data.elements.length));
  html.push(buildTOC(sections));
  html.push('<div class="page">');
  html.push(buildReportMetadata(data));
  html.push('</div>');
  html.push(buildModelSection(data));
  html.push(buildLoadsSection(data));
  html.push(buildReactionsSection(data));
  html.push(buildDisplacementsSection(data));
  html.push(buildForcesSection(data));

  html.push('</body></html>');
  return html.join('\n');
}

/** Open the calc-book report in a new browser tab for printing. */
export function openCalcReport(data: CalcReportData): void {
  const htmlContent = generateCalcReportHtml(data);
  const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const win = window.open(url, '_blank');
  if (win) setTimeout(() => URL.revokeObjectURL(url), 120_000);
  else URL.revokeObjectURL(url);
}
