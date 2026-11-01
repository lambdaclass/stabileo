// PRO Report Generator — HTML-based report with KaTeX math rendering
// Generates the structural analysis report; the design is reported by the memoria
// (`lib/report/memoria`).
// Uses window.print() for PDF output (browser native)

import { provenanceBlockHtml, type ResultProvenance as ProvenanceRecord, type ProvenanceLabels } from '../provenance/result-provenance';
import { memberSectionLabel } from '../section/variable';
import { plainNumber } from '../utils/units';
import katex from 'katex';
import katexCss from 'katex/dist/katex.min.css?raw';
import type { Node, Material, Section, Element, Support, Quad } from '../store/model.svelte';
import type { AnalysisResults3D } from './types-3d';
import { formatPDeltaFactor } from './pdelta-result';
import type { ProjectQuantities } from './quantities';
import { quantitiesSectionHtml } from './report/quantities-section';
import {
  projectCoverHtml, envelopeSectionHtml, staticsSectionHtml, deflectionSectionHtml, figuresSectionHtml,
  type DeflectionReportRow, type ReportFigure,
} from './report/project-sections';
import type { Source } from './result-tables';
import type { StaticsRows } from '../store/statics-rows';
import type { ProjectInfo } from '../model/project-info';
import type { SolverDiagnostic } from './types';
import { principalStresses } from './shell-stress';

/** Translation function type — accepts key, returns translated string */
type TFunc = (key: string) => string;

/** Simple interpolation: replaces {name} placeholders in a translated string */
function interp(tpl: string, vars: Record<string, string | number>): string {
  return tpl.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`));
}

/**
 * Report configuration: the office's letterhead, what to include, and the figures chosen.
 *
 * The job's own data (client, job, revisions, signatures) is the project's, `ReportData.projectInfo`;
 * `projectAddress`, `engineerName` and `revision` are what the letterhead carried before that and
 * are printed only when the project states none.
 */
export interface ReportConfig {
  companyName: string;
  companyLogo: string | null;
  projectAddress?: string;
  engineerName?: string;
  revision?: string;
  /** Figures the user added from the viewport, in order. */
  figures?: ReportFigure[];
  /** False when the letterhead was left blank — no project block is printed. */
  hasProjectInfo?: boolean;
  /** Which advanced analyses to print, by result key. Absent means all of them. */
  advancedPicked?: Record<string, boolean>;
  sections: {
    modelData: boolean;
    results: boolean;
    advancedAnalysis: boolean;
    storyDrift: boolean;
    diagnostics: boolean;
    quantities: boolean;
    loads: boolean;
    /** Summary and envelope across the result sets. */
    envelope?: boolean;
    statics?: boolean;
    deflections?: boolean;
    figures?: boolean;
    /** The model data's tables, each printed unless false. */
    parts?: Partial<Record<ReportPart, boolean>>;
  };
  /** Per result, whether it is printed as its table, its figures or both (`both` when absent). */
  resultModes?: Partial<Record<ReportResult, ResultMode>>;
}

/** The model data's tables the report can leave out. */
export type ReportPart = 'nodes' | 'materials' | 'sections' | 'members' | 'supports' | 'shells' | 'combinations';
/** The results printed as a table, figures, or both. */
export type ReportResult = 'reactions' | 'displacements' | 'forces' | 'shells';
export type ResultMode = 'table' | 'figure' | 'both';

/** The figures drawn for the report, by where they go (`pro/report-export.ts`). */
export interface ReportResultFigures {
  /** The model with its numbering: the report's first figure, in place of a screen capture. */
  model?: ReportFigure;
  /** The model with its loads, under the loads' table. */
  loads?: ReportFigure;
  reactions?: ReportFigure[];
  displacements?: ReportFigure[];
  forces?: ReportFigure[];
  shells?: ReportFigure[];
}

export interface ReportData {
  /** Which build produced the results from which model and settings (`provenance/result-provenance.ts`). */
  resultProvenance?: { record: ProvenanceRecord; labels: ProvenanceLabels };
  /** The job's data, for the cover. */
  projectInfo?: ProjectInfo;
  /** The result sets the envelope reads (the active combinations, else the cases). */
  resultSets?: Source[];
  /** Which result set the per-result tables are of. */
  resultSetName?: string;
  statics?: StaticsRows | null;
  deflections?: DeflectionReportRow[];
  projectName: string;
  date: string;
  /** CAD-derived draft provenance — when present and unreviewed, the report
   *  carries a prominent draft banner plus the assumption list. */
  provenance?: import('../model/provenance').ModelProvenance;
  // Model
  nodes: Node[];
  elements: Element[];
  materials: Material[];
  sections: Section[];
  supports: Support[];
  quads?: Quad[];
  loadCount: number;
  loads?: Array<{ type: string; target: string; values: string; caseLabel?: string }>;
  // Results
  results: AnalysisResults3D;
  // Quantities
  quantities?: ProjectQuantities;
  // Advanced analysis results (modal, spectral, P-Delta, buckling)
  advancedResults?: {
    pdelta?: { converged: boolean; iterations: number; b2Factor?: number; isStable?: boolean };
    modal?: { modes: Array<{ frequency: number; period: number; participationX?: number; participationY?: number; participationZ?: number; massRatioX?: number; massRatioY?: number }>; totalMass?: number; ratiosWithheld?: boolean };
    buckling?: { factors: number[] };
    spectral?: { baseShearX?: number; baseShearY?: number; baseShearZ?: number };
  };
  // Story drift results
  storyDrifts?: Array<{
    level: number; height: number;
    driftX: number; driftY: number;
    ratioX: number; ratioY: number;
    status: 'ok' | 'warn' | 'fail';
  }>;
  /** What the story drift was checked against: C_d, the group, Tabla 6.4's limit, the cases. */
  storyDriftBasis?: { cd: number; group: string; limit: number; cases: string[] };
  // Load combination definitions (for reference table + governing combo column)
  combinations?: Array<{ id: number; name: string; factors: Array<{ caseName: string; factor: number }> }>;
  // Diagnostics
  diagnostics?: SolverDiagnostic[];
  // Viewport screenshot (data URL)
  screenshot?: string;
  /** Figures drawn from the model, placed in their sections. */
  resultFigures?: ReportResultFigures;
  // Translation function (defaults to identity)
  t?: TFunc;
  // Report configuration (project info + section toggles)
  config?: ReportConfig;
}

function fmtNum(n: number, dec: number = 2): string {
  if (Math.abs(n) < 1e-10) return '0';
  if (Math.abs(n) < 0.001) return n.toExponential(2);
  return n.toFixed(dec);
}

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ─── KaTeX math rendering ────────────────────────────────────────

/** Render a KaTeX expression to HTML string */
function km(expr: string, display = false): string {
  try {
    return katex.renderToString(expr, { displayMode: display, throwOnError: false, output: 'htmlAndMathml' });
  } catch {
    return `<code>${escHtml(expr)}</code>`;
  }
}

// ─── CSS for report ──────────────────────────────────────────────

const REPORT_CSS = `
  @page {
    size: A4;
    margin: 15mm 15mm 20mm 15mm;
    @bottom-right { content: counter(page) " / " counter(pages); font-size: 9px; color: #888; }
  }
  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .page-break { page-break-before: always; }
    .no-print { display: none; }
  }
  body {
    font-family: 'Latin Modern Roman', 'Computer Modern', 'Cambria', 'Georgia', serif;
    font-size: 11px;
    color: #222;
    max-width: 210mm;
    margin: 10mm auto;
    padding: 0 15mm;
    line-height: 1.5;
  }
  h1 { font-size: 22px; color: #0a3060; border-bottom: 2px solid #0a3060; padding-bottom: 4px; margin-top: 30px; }
  h2 { font-size: 16px; color: #1a5090; margin-top: 20px; border-bottom: 1px solid #ccc; padding-bottom: 2px; }
  h3 { font-size: 13px; color: #333; margin-top: 14px; }
  h4 { font-size: 11px; color: #555; margin: 10px 0 4px; }
  table { border-collapse: collapse; width: 100%; margin: 8px 0; font-size: 10px; }
  th, td { padding: 4px 6px; border-bottom: 1px solid #ddd; text-align: left; }
  th { background: #f4f7fb; font-weight: 600; font-size: 9px; text-transform: uppercase; border-bottom: 2px solid #0a3060; }
  td.num { text-align: right; font-variant-numeric: tabular-nums; }
  .cover-page { text-align: center; padding: 80px 0 40px; }
  .cover-page h1 { font-size: 32px; border: none; color: #0a3060; }
  .cover-page .subtitle { font-size: 16px; color: #555; margin: 8px 0; font-style: italic; }
  .cover-page .date { font-size: 13px; color: #888; margin-top: 40px; }
  .cover-page .logo { font-size: 11px; color: #aaa; margin-top: 80px; letter-spacing: 3px; text-transform: uppercase; }
  .screenshot { max-width: 100%; border: 1px solid #ddd; margin: 10px 0; }
  .summary-status-bar { display: flex; gap: 24px; margin: 16px 0 20px; padding: 12px 16px; background: #f4f7fb; border-radius: 6px; border: 1px solid #e0e8f0; }
  .summary-stat { display: flex; align-items: baseline; gap: 6px; font-size: 14px; }
  .summary-stat span:first-child { font-size: 22px; font-weight: 700; }
  .summary-stat-label { font-size: 11px; color: #666; text-transform: uppercase; letter-spacing: 0.03em; }
  .design-code-ref { font-size: 11px; color: #555; margin: 8px 0 16px; }
  .status-ok { color: #0a7a0a; font-weight: 700; }
  .status-fail { color: #c00; font-weight: 700; }
  .status-warn { color: #b86e00; font-weight: 700; }
  .memo-step {
    font-size: 10px;
    color: #333;
    line-height: 2.0;
    padding: 1px 0;
  }
  .memo-step .katex { font-size: 0.95em; }
  .step-block {
    background: #f8f9fc;
    border-left: 3px solid #1a5090;
    padding: 6px 12px;
    margin: 6px 0;
    border-radius: 0 4px 4px 0;
  }
  .svg-container { margin: 8px 0; background: #f8f8f8; padding: 10px; border: 1px solid #ddd; border-radius: 4px; display: inline-block; }
  .svg-container svg { max-width: 100%; height: auto; }
  .svg-container svg text { fill: #333 !important; }
  .svg-container svg rect[fill="#1a2a40"] { fill: #f0f0f0 !important; }
  .svg-container svg line[stroke="#4ecdc4"], .svg-container svg rect[stroke="#4ecdc4"] { stroke: #1a5090 !important; }
  .svg-container svg circle[fill="#e94560"] { fill: #333 !important; stroke: #000 !important; }
  .svg-container svg rect[stroke="#f0a500"], .svg-container svg line[stroke="#f0a500"] { stroke: #666 !important; }
  .print-btn { position: fixed; top: 10px; right: 10px; padding: 10px 24px; background: #1a5090; color: #fff; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; z-index: 999; box-shadow: 0 2px 8px rgba(0,0,0,0.2); }
  .print-btn:hover { background: #2a6ab0; }
  .group-header { background: #eef3f9; padding: 8px 12px; border-radius: 4px; margin-top: 16px; border: 1px solid #d0dae8; }
  .group-elems { font-size: 10px; color: #666; margin: 2px 0; }
  .stirrup-note { font-size: 9px; color: #888; margin-left: 8px; }
  .diag-error { color: #c00; }
  .diag-warn { color: #b86e00; }
  .diag-info { color: #1a5090; }
  .toc { margin: 20px 0 40px; }
  .toc h2 { border: none; color: #0a3060; }
  .toc-entry { display: flex; align-items: baseline; margin: 4px 0; font-size: 12px; }
  .toc-entry a { color: #1a5090; text-decoration: none; }
  .toc-entry a:hover { text-decoration: underline; }
  .toc-dots { flex: 1; border-bottom: 1px dotted #bbb; margin: 0 6px; min-width: 30px; }
  .code-ref { color: #1a5090; background: #eef3f9; padding: 1px 4px; border-radius: 2px; font-size: 9px; font-weight: 600; }
  .interaction-container { margin: 8px 0; }
  .interaction-container svg { max-width: 280px; height: auto; }
`;

// ─── Report HTML generation ──────────────────────────────────────

export function generateReportHtml(data: ReportData): string {
  const { projectName, date, nodes, elements, materials, sections, supports, loadCount, results, quantities, screenshot } = data;
  // Use provided translation function or fallback to identity (returns key)
  const tr: TFunc = data.t ?? ((k: string) => k);

  const html: string[] = [];

  // Detect lang code from translation output for html lang attribute
  const langCode = tr('report.printBtn') === 'Imprimir / PDF' ? 'es'
    : tr('report.printBtn') === 'Print / PDF' ? 'en'
    : 'en';

  html.push(`<!DOCTYPE html>
<html lang="${langCode}">
<head>
<meta charset="UTF-8">
<title>${escHtml(interp(tr('report.docTitle'), { name: projectName }))}</title>
<style>${katexCss.replace(/url\(fonts\//g, 'url(https://cdn.jsdelivr.net/npm/katex@0.16.28/dist/fonts/')}</style>
<style>${REPORT_CSS}</style>
</head>
<body>
<button class="print-btn no-print" onclick="window.print()">${escHtml(tr('report.printBtn'))}</button>
`);

  // ─── Cover Page ─────────────────────────────────────────
  const cfg = data.config;
  html.push(`<div class="cover-page">`);
  if (cfg?.companyLogo) {
    html.push(`<img src="${cfg.companyLogo}" alt="Logo" style="max-height:80px;max-width:250px;margin-bottom:20px" />`);
  }
  /* An untouched letterhead prints nothing — see `hasProjectInfo`. */
  if (cfg?.companyName && cfg.hasProjectInfo !== false) {
    html.push(`<div style="font-size:14px;color:#555;letter-spacing:2px;text-transform:uppercase;margin-bottom:30px">${escHtml(cfg.companyName)}</div>`);
  }
  html.push(`<h1>${escHtml(projectName)}</h1>`);
  html.push(`<div class="subtitle">${escHtml(tr('report.coverSubtitle'))}</div>`);
  if (data.provenance?.status === 'cad-draft-unreviewed') {
    html.push(`<div style="margin:16px auto;max-width:520px;border:2px solid #b8860b;background:#fdf6e3;color:#7a5a00;padding:10px 14px;border-radius:6px;font-size:13px;font-weight:600">${escHtml(tr('report.cadDraftBanner'))}</div>`);
  }
  if (data.projectInfo) {
    html.push(...projectCoverHtml(data.projectInfo, tr));
  } else if (cfg?.projectAddress) {
    html.push(`<div style="font-size:12px;color:#666;margin-top:12px">${escHtml(cfg.projectAddress)}</div>`);
  }
  html.push(`<div class="date">${escHtml(date)}</div>`);
  const coverFooterParts: string[] = [];
  if (!data.projectInfo && cfg?.engineerName) coverFooterParts.push(`${escHtml(tr('report.engineer'))}: ${escHtml(cfg.engineerName)}`);
  if (!data.projectInfo && cfg?.revision) coverFooterParts.push(`${escHtml(tr('report.revisionLabel'))}: ${escHtml(cfg.revision)}`);
  if (coverFooterParts.length > 0) {
    html.push(`<div style="font-size:11px;color:#888;margin-top:16px">${coverFooterParts.join(' &mdash; ')}</div>`);
  }
  // Informational only (not a global-axis switch): state the canonical solver frame.
  html.push(`<div style="font-size:10px;color:#aaa;margin-top:8px">${escHtml(tr('report.solverCoordsNote'))}</div>`);
  html.push(`<div class="logo">${escHtml(tr('report.coverFooter'))}</div>`);
  html.push(`</div>`);

  const showSection = (key: keyof NonNullable<ReportConfig['sections']>) => !cfg?.sections || cfg.sections[key];
  const showPart = (key: ReportPart) => cfg?.sections?.parts?.[key] !== false;
  const modeOf = (key: ReportResult): ResultMode => cfg?.resultModes?.[key] ?? 'both';
  const showTable = (key: ReportResult) => modeOf(key) !== 'figure';
  const rf = data.resultFigures ?? {};
  // Figures are numbered in the order they appear, wherever they are.
  let figureNo = 0;
  const figureHtml = (f: ReportFigure) => `<figure style="margin:12px 0;page-break-inside:avoid"><img class="screenshot" src="${f.dataUrl}" alt="${escHtml(f.caption)}" /><figcaption style="font-size:11px;color:#444">${escHtml(tr('report.figure'))} ${++figureNo}. ${escHtml(f.caption)}</figcaption></figure>`;
  const figuresOf = (key: ReportResult) => (modeOf(key) === 'table' ? [] : (rf[key] ?? [])).map(figureHtml);

  // Sub-section numbers in the order the sections appear: written by hand, they came out as
  // 1.5, 1.7, 1.6 and repeated 3.4 and 3.6 when optional sections were present.
  const subCount = new Map<number, number>();
  const subNo = (major: number) => { const n = (subCount.get(major) ?? 0) + 1; subCount.set(major, n); return `${major}.${n}`; };

  // ─── Table of Contents ──────────────────────────────────
  html.push(`<div class="page-break"></div>`);
  html.push(`<div class="toc"><h2>${escHtml(tr('report.toc') || 'Table of Contents')}</h2>`);
  const tocEntries: { label: string; anchor: string }[] = [];
  if (showSection('modelData')) tocEntries.push({ label: tr('report.modelData'), anchor: 'sec-model-data' });
  if (showSection('results')) tocEntries.push({ label: tr('report.results'), anchor: 'sec-results' });
  if (showSection('advancedAnalysis') && data.advancedResults) tocEntries.push({ label: (tr('report.advancedAnalysis') || 'Advanced Analysis'), anchor: 'sec-advanced' });
  if (showSection('storyDrift') && data.storyDrifts && data.storyDrifts.length > 0) tocEntries.push({ label: (tr('report.storyDrift') || 'Story Drift'), anchor: 'sec-drift' });
  if (showSection('diagnostics') && data.diagnostics && data.diagnostics.length > 0) tocEntries.push({ label: (tr('report.diagnostics') || 'Diagnostics'), anchor: 'sec-diagnostics' });
  if (showSection('quantities') && quantities) tocEntries.push({ label: (tr('report.quantities') || 'Quantities'), anchor: 'sec-quantities' });
  if (showSection('figures') && cfg?.figures?.length) tocEntries.push({ label: tr('report.figures'), anchor: 'sec-figures' });
  // Numbered as printed: leaving a section out renumbers the rest.
  // Some titles carry their own number («1. Model Data»): it is dropped and written again in order.
  tocEntries.forEach((e, i) => { e.label = `${i + 1}. ${e.label.replace(/^\d+\.\s*/, '')}`; });
  for (const entry of tocEntries) {
    html.push(`<div class="toc-entry"><a href="#${entry.anchor}">${escHtml(entry.label)}</a><span class="toc-dots"></span></div>`);
  }
  html.push(`</div>`);

  // ─── CAD draft provenance: source + the assumptions baked into the model ───
  if (data.provenance) {
    html.push(`<h2>${escHtml(tr('report.cadAssumptionsTitle'))}</h2>`);
    html.push(`<p style="font-size:11px;color:#666">${escHtml(data.provenance.fileName)} — ${escHtml(data.provenance.importedAtIso.slice(0, 10))}</p>`);
    html.push('<ul style="font-size:12px">');
    for (const a of data.provenance.assumptions) {
      html.push(`<li>${escHtml(a)}</li>`);
    }
    html.push('</ul>');
  }

  // ─── Model Data ─────────────────────────────────────────
  if (showSection('modelData')) {
  html.push(`<div class="page-break"></div>`);
  html.push(`<h1 id="sec-model-data">${escHtml(tr('report.modelData'))}</h1>`);

  if (rf.model || screenshot) {
    html.push(`<h2>${escHtml(tr('report.view3d'))}</h2>`);
    // The model with its node and member numbers, as Figure 1: drawn from the model, or captured.
    html.push(figureHtml(rf.model ?? { dataUrl: screenshot!, caption: tr('report.modelFigureCaption') }));
  }

  // Nodes table
  if (showPart('nodes')) {
  html.push(`<h2>${subNo(1)} ${escHtml(tr('report.nodes'))} (${nodes.length})</h2>`);
    // The name column only when some node has one.
    const named = nodes.some((n) => n.name);
    html.push(`<table><thead><tr><th>ID</th>${named ? `<th>${escHtml(tr('pro.thName'))}</th>` : ''}<th>${km('X')} (m)</th><th>${km('Y')} (m)</th><th>${km('Z')} (m)</th></tr></thead><tbody>`);
    for (const n of nodes) {
      html.push(`<tr><td>${n.id}</td>${named ? `<td>${escHtml(n.name ?? '')}</td>` : ''}<td class="num">${fmtNum(n.x, 3)}</td><td class="num">${fmtNum(n.y, 3)}</td><td class="num">${fmtNum(n.z ?? 0, 3)}</td></tr>`);
    }
    html.push(`</tbody></table>`);
  }

  // Materials table
  if (showPart('materials')) {
  html.push(`<h2>${subNo(1)} ${escHtml(tr('report.materials'))} (${materials.length})</h2>`);
  html.push(`<table><thead><tr><th>ID</th><th>${escHtml(tr('report.name'))}</th><th>${km('E')} (MPa)</th><th>${km('\\nu')}</th><th>${km('\\gamma')} (kN/m³)</th><th>${km("f'_c / f_y")} (MPa)</th></tr></thead><tbody>`);
  for (const m of materials) {
    html.push(`<tr><td>${m.id}</td><td>${escHtml(m.name)}</td><td class="num">${plainNumber(m.e, 0)}</td><td class="num">${m.nu}</td><td class="num">${m.rho}</td><td class="num">${m.fy ?? '—'}</td></tr>`);
  }
  html.push(`</tbody></table>`);
  }

  // Sections table
  if (showPart('sections')) {
  html.push(`<h2>${subNo(1)} ${escHtml(tr('report.sections'))} (${sections.length})</h2>`);
  html.push(`<table><thead><tr><th>ID</th><th>${escHtml(tr('report.name'))}</th><th>${km('A')} (m²)</th><th>${km('I_y')} (m⁴)</th><th>${km('I_z')} (m⁴)</th><th>${km('J')} (m⁴)</th><th>${km('A_{s,y}')} / ${km('A_{s,z}')}</th><th>${km('b')} (m)</th><th>${km('h')} (m)</th></tr></thead><tbody>`);
  for (const s of sections) {
    const sa = (s as { shearAreas?: { basis: string; asY?: number; asZ?: number } }).shearAreas;
    const shear = !sa ? '—' : sa.basis === 'declared' ? `${fmtNum(sa.asY ?? 0, 6)} / ${fmtNum(sa.asZ ?? 0, 6)}` : escHtml(tr('report.shearFromGeometry'));
    html.push(`<tr><td>${s.id}</td><td>${escHtml(s.name)}</td><td class="num">${fmtNum(s.a, 6)}</td><td class="num">${s.iy !== undefined ? fmtNum(s.iy, 8) : '—'}</td><td class="num">${fmtNum(s.iz, 8)}</td><td class="num">${s.j !== undefined ? fmtNum(s.j, 8) : '—'}</td><td class="num">${shear}</td><td class="num">${s.b ? fmtNum(s.b, 3) : '—'}</td><td class="num">${s.h ? fmtNum(s.h, 3) : '—'}</td></tr>`);
  }
  html.push(`</tbody></table>`);
  }

  // Elements table
  if (showPart('members')) {
  html.push(`<h2>${subNo(1)} ${escHtml(tr('report.elements'))} (${elements.length})</h2>`);
    const named = elements.some((e) => e.name);
    html.push(`<table><thead><tr><th>ID</th>${named ? `<th>${escHtml(tr('pro.thName'))}</th>` : ''}<th>${escHtml(tr('report.nodeI'))}</th><th>${escHtml(tr('report.nodeJ'))}</th><th>${escHtml(tr('report.material'))}</th><th>${escHtml(tr('report.sections'))}</th></tr></thead><tbody>`);
    for (const e of elements) {
      const matName = materials.find(m => m.id === e.materialId)?.name ?? String(e.materialId);
      const secName = memberSectionLabel(sections, e as never);
      html.push(`<tr><td>${e.id}</td>${named ? `<td>${escHtml(e.name ?? '')}</td>` : ''}<td>${e.nodeI}</td><td>${e.nodeJ}</td><td>${escHtml(matName)}</td><td>${escHtml(secName)}</td></tr>`);
    }
    html.push(`</tbody></table>`);
  }

  // Supports
  if (showPart('supports')) {
  html.push(`<h2>${subNo(1)} ${escHtml(tr('report.supports'))} (${supports.length})</h2>`);
  html.push(`<table><thead><tr><th>ID</th><th>${escHtml(tr('report.nodes'))}</th><th>${escHtml(tr('report.type'))}</th></tr></thead><tbody>`);
  for (const s of supports) {
    html.push(`<tr><td>${s.id}</td><td>${s.nodeId}</td><td>${s.type}</td></tr>`);
  }
  html.push(`</tbody></table>`);
  }

  html.push(`<p>${escHtml(interp(tr('report.loadsCount'), { n: loadCount }))}</p>`);

  // Loads detail table
  if (showSection('loads') && data.loads && data.loads.length > 0) {
    html.push(`<h2>${subNo(1)} ${escHtml(tr('report.loadsDetail'))} (${data.loads.length})</h2>`);
    html.push(`<table><thead><tr><th>#</th><th>${escHtml(tr('report.type'))}</th><th>${escHtml(tr('report.target'))}</th><th>${escHtml(tr('report.values'))}</th></tr></thead><tbody>`);
    for (let i = 0; i < data.loads.length; i++) {
      const ld = data.loads[i];
      html.push(`<tr><td>${i + 1}</td><td>${escHtml(ld.type)}</td><td>${escHtml(ld.target)}</td><td>${escHtml(ld.values)}</td></tr>`);
    }
    html.push(`</tbody></table>`);
    if (rf.loads) html.push(figureHtml(rf.loads));
  }

  // Quads (losas y tabiques)
  if (showPart('shells') && data.quads && data.quads.length > 0) {
    const nodeMap = new Map(nodes.map(n => [n.id, n]));
    const matMap = new Map(materials.map(m => [m.id, m]));

    // Classify quads: compute normal vector, if mostly vertical → tabique, else losa
    interface QuadInfo {
      quad: typeof data.quads extends (infer T)[] | undefined ? NonNullable<T> : never;
      type: 'losa' | 'tabique';
      area: number;
      matName: string;
    }

    const quadInfos: QuadInfo[] = [];
    for (const q of data.quads) {
      const ns = q.nodes.map(nid => nodeMap.get(nid));
      if (ns.some(n => !n)) continue;
      const [p0, p1, , p3] = ns as NonNullable<typeof ns[number]>[];
      // Two edge vectors
      const ax = p1.x - p0.x, ay = p1.y - p0.y, az = (p1.z ?? 0) - (p0.z ?? 0);
      const bx = p3.x - p0.x, by = p3.y - p0.y, bz = (p3.z ?? 0) - (p0.z ?? 0);
      // Normal = cross product
      const nx = ay * bz - az * by;
      const ny = az * bx - ax * bz;
      const nz = ax * by - ay * bx;
      const nLen = Math.sqrt(nx * nx + ny * ny + nz * nz);
      const area = nLen / 2; // approximate (2 triangles)
      // If normal is mostly horizontal (Y component dominates) → losa; else tabique
      const yFrac = nLen > 1e-10 ? Math.abs(ny) / nLen : 0;
      const type = yFrac > 0.7 ? 'losa' : 'tabique';
      const matName = matMap.get(q.materialId)?.name ?? String(q.materialId);
      quadInfos.push({ quad: q, type, area, matName });
    }

    // Group by type + thickness + material
    interface QuadGroup {
      type: 'losa' | 'tabique';
      thickness: number;
      matName: string;
      ids: number[];
      totalArea: number;
    }

    const quadGroupMap = new Map<string, QuadGroup>();
    for (const qi of quadInfos) {
      const key = `${qi.type}_${qi.quad.thickness}_${qi.matName}`;
      let g = quadGroupMap.get(key);
      if (!g) {
        g = { type: qi.type, thickness: qi.quad.thickness, matName: qi.matName, ids: [], totalArea: 0 };
        quadGroupMap.set(key, g);
      }
      g.ids.push(qi.quad.id);
      g.totalArea += qi.area;
    }

    const losas = [...quadGroupMap.values()].filter(g => g.type === 'losa');
    const tabiques = [...quadGroupMap.values()].filter(g => g.type === 'tabique');

    html.push(`<h2>${subNo(1)} ${escHtml(tr('report.slabsAndWalls'))} (${data.quads.length} ${escHtml(tr('report.shellElements'))})</h2>`);

    if (losas.length > 0) {
      html.push(`<h3>${escHtml(tr('report.slabs'))}</h3>`);
      html.push(`<table><thead><tr><th>IDs</th><th>${escHtml(tr('report.count'))}</th><th>${escHtml(tr('report.thickness'))}</th><th>${escHtml(tr('report.material'))}</th><th>${escHtml(tr('report.totalAreaM2'))}</th></tr></thead><tbody>`);
      for (const g of losas) {
        const idList = g.ids.length <= 10 ? g.ids.join(', ') : `${g.ids.slice(0, 8).join(', ')}… (${g.ids.length})`;
        html.push(`<tr><td>${idList}</td><td>${g.ids.length}</td><td class="num">${g.thickness.toFixed(2)}</td><td>${escHtml(g.matName)}</td><td class="num">${g.totalArea.toFixed(1)}</td></tr>`);
      }
      html.push(`</tbody></table>`);
    }

    if (tabiques.length > 0) {
      html.push(`<h3>${escHtml(tr('report.walls'))}</h3>`);
      html.push(`<table><thead><tr><th>IDs</th><th>${escHtml(tr('report.count'))}</th><th>${escHtml(tr('report.thickness'))}</th><th>${escHtml(tr('report.material'))}</th><th>${escHtml(tr('report.totalAreaM2'))}</th></tr></thead><tbody>`);
      for (const g of tabiques) {
        const idList = g.ids.length <= 10 ? g.ids.join(', ') : `${g.ids.slice(0, 8).join(', ')}… (${g.ids.length})`;
        html.push(`<tr><td>${idList}</td><td>${g.ids.length}</td><td class="num">${g.thickness.toFixed(2)}</td><td>${escHtml(g.matName)}</td><td class="num">${g.totalArea.toFixed(1)}</td></tr>`);
      }
      html.push(`</tbody></table>`);
    }

    // Summary
    const totalLosaArea = losas.reduce((s, g) => s + g.totalArea, 0);
    const totalTabArea = tabiques.reduce((s, g) => s + g.totalArea, 0);
    const totalLosaVol = losas.reduce((s, g) => s + g.totalArea * g.thickness, 0);
    const totalTabVol = tabiques.reduce((s, g) => s + g.totalArea * g.thickness, 0);
    html.push(`<p>${escHtml(interp(tr('report.slabTotalArea'), { area: totalLosaArea.toFixed(1), vol: totalLosaVol.toFixed(2) }))}</p>`);
    html.push(`<p>${escHtml(interp(tr('report.wallTotalArea'), { area: totalTabArea.toFixed(1), vol: totalTabVol.toFixed(2) }))}</p>`);
  }
  // Load combinations reference table (inside modelData section)
  if (showSection('modelData') && showPart('combinations') && data.combinations && data.combinations.length > 0) {
    html.push(`<h2>${subNo(1)} ${escHtml(tr('report.loadCombinations') || 'Load Combinations')} (${data.combinations.length})</h2>`);
    html.push(`<table><thead><tr><th>#</th><th>${escHtml(tr('report.name') || 'Name')}</th><th>${escHtml(tr('report.factors') || 'Factors')}</th></tr></thead><tbody>`);
    for (const c of data.combinations) {
      const factorStr = c.factors
        .filter(f => f.factor !== 0)
        .map(f => `${f.factor !== 1 ? `${+f.factor.toFixed(4)} ` : ''}${f.caseName}`)
        .join(' + ') || '—';
      html.push(`<tr><td>${c.id}</td><td>${escHtml(c.name)}</td><td>${escHtml(factorStr)}</td></tr>`);
    }
    html.push(`</tbody></table>`);
  }

  } // end showSection('modelData')

  // ─── Results ────────────────────────────────────────────
  if (showSection('results')) {
  html.push(`<div class="page-break"></div>`);
  html.push(`<h1 id="sec-results">${escHtml(tr('report.results'))}</h1>`);

  // Model size — nodes, elements, and free (unconstrained) DOF count.
  // nFree comes from the solver timings/meta; omitted gracefully if absent.
  {
    const nFree = results.timings?.nFree;
    const dofLine = nFree !== undefined ? `, ${nFree} ${escHtml(tr('report.freeDof') || 'free DOF')}` : '';
    html.push(`<p class="model-size">${nodes.length} ${escHtml(tr('report.nodes'))}, ${elements.length} ${escHtml(tr('report.elements'))}${dofLine}.</p>`);
    if (data.resultSetName) html.push(`<p class="note">${escHtml(interp(tr('report.resultSetShown'), { name: data.resultSetName }))}</p>`);
  }

  // Reactions
  html.push(`<h2>${subNo(2)} ${escHtml(tr('report.reactions'))}</h2>`);
  if (showTable('reactions')) {
  html.push(`<table><thead><tr><th>Nodo</th><th>${km('F_x')} (kN)</th><th>${km('F_y')} (kN)</th><th>${km('F_z')} (kN)</th><th>${km('M_x')} (kN·m)</th><th>${km('M_y')} (kN·m)</th><th>${km('M_z')} (kN·m)</th></tr></thead><tbody>`);
  for (const r of results.reactions) {
    html.push(`<tr><td>${r.nodeId}</td><td class="num">${fmtNum(r.fx)}</td><td class="num">${fmtNum(r.fy)}</td><td class="num">${fmtNum(r.fz)}</td><td class="num">${fmtNum(r.mx)}</td><td class="num">${fmtNum(r.my)}</td><td class="num">${fmtNum(r.mz)}</td></tr>`);
  }
  html.push(`</tbody></table>`);
  }
  html.push(...figuresOf('reactions'));

  // Element forces
  html.push(`<h2>${subNo(2)} ${escHtml(tr('report.forces'))}</h2>`);
  if (showTable('forces')) {
    html.push(`<table><thead><tr><th>Elem</th><th>${escHtml(tr('report.ext'))}</th><th>${km('N')} (kN)</th><th>${km('V_y')} (kN)</th><th>${km('V_z')} (kN)</th><th>${km('M_x')} (kN·m)</th><th>${km('M_y')} (kN·m)</th><th>${km('M_z')} (kN·m)</th></tr></thead><tbody>`);
    for (const ef of results.elementForces) {
      html.push(`<tr><td rowspan="2">${ef.elementId}</td><td>i</td><td class="num">${fmtNum(ef.nStart)}</td><td class="num">${fmtNum(ef.vyStart)}</td><td class="num">${fmtNum(ef.vzStart)}</td><td class="num">${fmtNum(ef.mxStart)}</td><td class="num">${fmtNum(ef.myStart)}</td><td class="num">${fmtNum(ef.mzStart)}</td></tr>`);
      html.push(`<tr><td>j</td><td class="num">${fmtNum(ef.nEnd)}</td><td class="num">${fmtNum(ef.vyEnd)}</td><td class="num">${fmtNum(ef.vzEnd)}</td><td class="num">${fmtNum(ef.mxEnd)}</td><td class="num">${fmtNum(ef.myEnd)}</td><td class="num">${fmtNum(ef.mzEnd)}</td></tr>`);
    }
    html.push(`</tbody></table>`);
  }
  html.push(...figuresOf('forces'));

  // Displacements
  html.push(`<h2>${subNo(2)} ${escHtml(tr('report.displacements'))}</h2>`);
  if (showTable('displacements')) {
    html.push(`<table><thead><tr><th>Nodo</th><th>${km('u_x')} (m)</th><th>${km('u_y')} (m)</th><th>${km('u_z')} (m)</th><th>${km('\\theta_x')} (rad)</th><th>${km('\\theta_y')} (rad)</th><th>${km('\\theta_z')} (rad)</th></tr></thead><tbody>`);
    for (const d of results.displacements) {
      html.push(`<tr><td>${d.nodeId}</td><td class="num">${fmtNum(d.ux, 6)}</td><td class="num">${fmtNum(d.uy, 6)}</td><td class="num">${fmtNum(d.uz, 6)}</td><td class="num">${fmtNum(d.rx, 6)}</td><td class="num">${fmtNum(d.ry, 6)}</td><td class="num">${fmtNum(d.rz, 6)}</td></tr>`);
    }
    html.push(`</tbody></table>`);
  }
  html.push(...figuresOf('displacements'));

  // 2.4 Shell results (slabs/walls) — built from plate/quad stresses
  {
    const psList = results.plateStresses ?? [];
    const qsList = results.quadStresses ?? [];
    if (psList.length || qsList.length) {
      html.push(`<h2>${subNo(2)} ${escHtml(tr('report.shellResults'))} (${psList.length + qsList.length})</h2>`);
      html.push(...figuresOf('shells'));
      html.push(`<p class="assumption">${escHtml(tr('report.shellResultsAssumptions'))}</p>`);

      interface ShellRow {
        kind: string; id: number;
        sxx: number; syy: number; txy: number;
        s1: number; s2: number; mx: number; my: number; mxy: number; vm: number;
      }
      const rows: ShellRow[] = [];
      const addRow = (kind: string, s: { elementId: number; sigmaXx: number; sigmaYy: number; tauXy: number; mx: number; my: number; mxy: number; vonMises: number }) => {
        const pr = principalStresses(s.sigmaXx, s.sigmaYy, s.tauXy);
        rows.push({ kind, id: s.elementId, sxx: s.sigmaXx, syy: s.sigmaYy, txy: s.tauXy, s1: pr.sigma1, s2: pr.sigma2, mx: s.mx, my: s.my, mxy: s.mxy, vm: s.vonMises });
      };
      for (const s of psList) addRow('Plate', s);
      for (const s of qsList) addRow('Quad', s);

      // Governing values (provenance for the engineer)
      const gv = rows.reduce((a, b) => (b.vm > a.vm ? b : a), rows[0]);
      const g1 = rows.reduce((a, b) => (Math.abs(b.s1) > Math.abs(a.s1) ? b : a), rows[0]);
      html.push(`<p>${escHtml(interp(tr('report.shellGoverning'), {
        vm: fmtNum(gv.vm), vmEl: `${gv.kind} ${gv.id}`,
        s1: fmtNum(g1.s1), s1El: `${g1.kind} ${g1.id}`,
      }))}</p>`);

      const shown = showTable('shells') ? rows : [];

      if (shown.length) html.push(`<table><thead><tr><th>Elem</th>`
        + `<th>${km('\\sigma_{xx}')}</th><th>${km('\\sigma_{yy}')}</th><th>${km('\\tau_{xy}')}</th>`
        + `<th>${km('\\sigma_{1}')}</th><th>${km('\\sigma_{2}')}</th>`
        + `<th>${km('m_x')}</th><th>${km('m_y')}</th><th>${km('m_{xy}')}</th>`
        + `<th>${km('\\sigma_{vM}')}</th></tr></thead><tbody>`);
      for (const r of shown) {
        html.push(`<tr><td>${escHtml(r.kind)} ${r.id}</td>`
          + `<td class="num">${fmtNum(r.sxx)}</td><td class="num">${fmtNum(r.syy)}</td><td class="num">${fmtNum(r.txy)}</td>`
          + `<td class="num">${fmtNum(r.s1)}</td><td class="num">${fmtNum(r.s2)}</td>`
          + `<td class="num">${fmtNum(r.mx)}</td><td class="num">${fmtNum(r.my)}</td><td class="num">${fmtNum(r.mxy)}</td>`
          + `<td class="num">${fmtNum(r.vm)}</td></tr>`);
      }
      if (shown.length) html.push(`</tbody></table>`);
      html.push(`<p class="note">${escHtml(tr('report.shellUnitsNote'))}</p>`);
    }
  }

  if (showSection('envelope') && data.resultSets?.length) html.push(...envelopeSectionHtml(data.resultSets, tr, `2.5 ${tr('report.env.title')}`));
  if (showSection('statics') && data.statics) html.push(...staticsSectionHtml(data.statics, tr, `2.6 ${tr('pro.statics.title')}`));
  if (showSection('deflections') && data.deflections?.length) html.push(...deflectionSectionHtml(data.deflections, tr, `2.7 ${tr('defl.title')}`));

  } // end showSection('results')

  // ─── Figures ────────────────────────────────────────────
  if (showSection('figures') && cfg?.figures?.length) html.push(...figuresSectionHtml(cfg.figures, tr, tr('report.figures'), figureNo + 1));

  // ─── Quantities ─────────────────────────────────────────
  if (showSection('quantities') && quantities) {
    html.push(...quantitiesSectionHtml(quantities, tr, tr('report.quantities')));
  }

  // ─── Advanced Analysis Summary ──────────────────────────
  const adv = data.advancedResults;
  /*
   * ── Only what RAN, and only what was asked for ────────────────────
   *
   * "Advanced analysis" was one checkbox over as many as six studies, so a
   * report carried all of them or none — and a reader could not tell an
   * analysis that was never asked for from one that was asked for and found
   * nothing. `advancedPicked` carries the reader's choice; a key that is
   * absent from it was never run, and the report says nothing about it rather
   * than printing an empty heading.
   */
  const wants = (key: string): boolean => {
    const picked = cfg?.advancedPicked;
    return !picked || picked[key] !== false;
  };
  const anyAdvanced = !!adv && (
    (!!adv.pdelta && wants('pdelta')) || (!!adv.modal && wants('modal'))
    || (!!adv.buckling && wants('buckling')) || (!!adv.spectral && wants('spectral'))
  );
  if (showSection('advancedAnalysis') && adv && anyAdvanced) {
    html.push(`<div class="page-break"></div>`);
    html.push(`<h2>${escHtml(tr('report.advancedAnalysis'))}</h2>`);

    if (adv.pdelta && wants('pdelta')) {
      html.push(`<h3>${escHtml(tr('report.pdeltaTitle'))}</h3>`);
      if (adv.pdelta.isStable !== undefined) {
        html.push(`<p>${escHtml(tr(adv.pdelta.isStable ? 'advanced.stable' : 'advanced.unstable'))}</p>`);
      }
      html.push(`<table><tbody>`);
      html.push(`<tr><td>${escHtml(tr('report.convergence'))}</td><td class="num">${adv.pdelta.converged ? escHtml(tr('report.yes')) : escHtml(tr('report.no'))}</td></tr>`);
      html.push(`<tr><td>${escHtml(tr('report.iterations'))}</td><td class="num">${adv.pdelta.iterations}</td></tr>`);
      if (adv.pdelta.b2Factor !== undefined) {
        html.push(`<tr><td>${escHtml(tr('report.b2Factor'))}</td><td class="num">${formatPDeltaFactor(adv.pdelta.b2Factor)}</td></tr>`);
      }
      html.push(`</tbody></table>`);
    }

    if (adv.modal && wants('modal') && adv.modal.modes.length > 0) {
      html.push(`<h3>${escHtml(tr('report.modalTitle'))}</h3>`);
      if (adv.modal.totalMass != null) {
        // The engine reports mass in tonnes (kN·s²/m). The label said kg.
        html.push(`<p>${escHtml(tr('report.totalMass'))}: ${fmtNum(adv.modal.totalMass, 1)} t</p>`);
      }
      if (adv.modal.ratiosWithheld) html.push(`<p>${escHtml(tr('pro.modalConstrained'))}</p>`);
      html.push(`<table><thead><tr><th>${escHtml(tr('report.mode'))}</th><th>f (Hz)</th><th>T (s)</th><th>Part. X</th><th>Part. Y</th><th>Part. Z</th><th>ΣM X</th><th>ΣM Y</th></tr></thead><tbody>`);
      let cx = 0, cy = 0;
      const pct = (v?: number) => (v != null ? `${(v * 100).toFixed(1)} %` : '—');
      for (let i = 0; i < adv.modal.modes.length; i++) {
        const m = adv.modal.modes[i];
        cx += m.massRatioX ?? 0; cy += m.massRatioY ?? 0;
        const has = m.massRatioX != null;
        html.push(`<tr><td class="num">${i + 1}</td><td class="num">${fmtNum(m.frequency, 3)}</td><td class="num">${fmtNum(m.period, 3)}</td><td class="num">${m.participationX != null ? fmtNum(m.participationX, 3) : '—'}</td><td class="num">${m.participationY != null ? fmtNum(m.participationY, 3) : '—'}</td><td class="num">${m.participationZ != null ? fmtNum(m.participationZ, 3) : '—'}</td><td class="num">${has ? pct(cx) : '—'}</td><td class="num">${has ? pct(cy) : '—'}</td></tr>`);
      }
      html.push(`</tbody></table>`);
    }

    if (adv.buckling && wants('buckling') && adv.buckling.factors.length > 0) {
      html.push(`<h3>${escHtml(tr('report.bucklingTitle'))}</h3>`);
      html.push(`<table><thead><tr><th>${escHtml(tr('report.mode'))}</th><th>${escHtml(tr('report.criticalFactor'))}</th></tr></thead><tbody>`);
      for (let i = 0; i < adv.buckling.factors.length; i++) {
        html.push(`<tr><td class="num">${i + 1}</td><td class="num">${fmtNum(adv.buckling.factors[i], 3)}</td></tr>`);
      }
      html.push(`</tbody></table>`);
    }

    if (adv.spectral && wants('spectral')) {
      html.push(`<h3>${escHtml(tr('report.spectralTitle'))}</h3>`);
      html.push(`<table><tbody>`);
      if (adv.spectral.baseShearX != null) html.push(`<tr><td>${escHtml(tr('report.baseShear'))} X</td><td class="num">${fmtNum(adv.spectral.baseShearX)} kN</td></tr>`);
      if (adv.spectral.baseShearY != null) html.push(`<tr><td>${escHtml(tr('report.baseShear'))} Y</td><td class="num">${fmtNum(adv.spectral.baseShearY)} kN</td></tr>`);
      if (adv.spectral.baseShearZ != null) html.push(`<tr><td>${escHtml(tr('report.baseShear'))} Z</td><td class="num">${fmtNum(adv.spectral.baseShearZ)} kN</td></tr>`);
      html.push(`</tbody></table>`);
    }
  }

  // ─── Story Drift ──────────────────────────────────────
  if (showSection('storyDrift') && data.storyDrifts && data.storyDrifts.length > 0) {
    html.push(`<div class="page-break"></div>`);
    html.push(`<h2>${escHtml(tr('report.driftTitle'))}</h2>`);
    const b = data.storyDriftBasis;
    html.push(`<p>${escHtml(b
      ? (tr('report.driftBasis') || '')
          .replace('{cd}', String(b.cd)).replace('{group}', b.group)
          .replace('{limit}', (b.limit * 100).toFixed(2)).replace('{cases}', b.cases.join(', '))
      : tr('report.driftLimit'))}</p>`);
    html.push(`<table><thead><tr><th>${escHtml(tr('report.level'))} (m)</th><th>h (m)</th><th>Δx (mm)</th><th>Δy (mm)</th><th>Δx/h</th><th>Δy/h</th><th>${escHtml(tr('report.status'))}</th></tr></thead><tbody>`);
    for (const d of data.storyDrifts) {
      const statusStr = d.status === 'ok' ? '✓ OK' : d.status === 'fail' ? `✗ ${tr('report.fail')}` : `⚠ ${tr('report.attention')}`;
      const cls = d.status === 'fail' ? ' style="color:#e94560;font-weight:bold"' : d.status === 'warn' ? ' style="color:#f0a500"' : '';
      html.push(`<tr${cls}><td class="num">${d.level.toFixed(2)}</td><td class="num">${d.height.toFixed(2)}</td><td class="num">${(d.driftX * 1000).toFixed(2)}</td><td class="num">${(d.driftY * 1000).toFixed(2)}</td><td class="num">${d.ratioX.toFixed(4)}</td><td class="num">${d.ratioY.toFixed(4)}</td><td>${statusStr}</td></tr>`);
    }
    html.push(`</tbody></table>`);
  }

  // ─── Diagnostics ──────────────────────────────────────
  if (showSection('diagnostics') && data.diagnostics && data.diagnostics.length > 0) {
    html.push(`<div class="page-break"></div>`);
    html.push(`<h2>${escHtml(tr('report.diagnostics'))}</h2>`);
    const errors = data.diagnostics.filter(d => d.severity === 'error');
    const warnings = data.diagnostics.filter(d => d.severity === 'warning');
    const infos = data.diagnostics.filter(d => d.severity === 'info');

    if (errors.length > 0) {
      html.push(`<h3 class="diag-error">${escHtml(tr('report.errors'))} (${errors.length})</h3><ul>`);
      for (const d of errors) {
        html.push(`<li><strong>[${escHtml(d.code)}]</strong> ${escHtml(d.message)}${d.elementIds ? ` — ${escHtml(tr('report.elementsLabel'))}: ${d.elementIds.join(', ')}` : ''}</li>`);
      }
      html.push(`</ul>`);
    }
    if (warnings.length > 0) {
      html.push(`<h3 class="diag-warn">${escHtml(tr('report.warnings'))} (${warnings.length})</h3><ul>`);
      for (const d of warnings) {
        html.push(`<li><strong>[${escHtml(d.code)}]</strong> ${escHtml(d.message)}${d.elementIds ? ` — ${escHtml(tr('report.elementsLabel'))}: ${d.elementIds.join(', ')}` : ''}</li>`);
      }
      html.push(`</ul>`);
    }
    if (infos.length > 0) {
      html.push(`<h3 class="diag-info">${escHtml(tr('report.info'))} (${infos.length})</h3><ul>`);
      for (const d of infos) {
        html.push(`<li><strong>[${escHtml(d.code)}]</strong> ${escHtml(d.message)}</li>`);
      }
      html.push(`</ul>`);
    }
  }

  if (data.resultProvenance) html.push(provenanceBlockHtml(data.resultProvenance.record, data.resultProvenance.labels));
  html.push(`</body></html>`);
  return html.join('\n');
}

/** Open the report in a new window for printing.
 *  Uses a Blob URL instead of document.write() to avoid all browser-specific
 *  document lifecycle timing issues that caused first-run blank reports. */
export function openReport(data: ReportData): void {
  const htmlContent = generateReportHtml(data);
  const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const win = window.open(url, '_blank');
  if (win) setTimeout(() => URL.revokeObjectURL(url), 120_000);
  else URL.revokeObjectURL(url);
}
