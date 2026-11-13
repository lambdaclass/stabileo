import { knownIssueResultDisposition, type knownIssueDisposition } from './known-issues';
import { standingPlane } from '../axes/node-coords';
import { ContainmentExportError } from './containment-error';
import { finiteSpectrumWarning } from './finite-spectrum-warning';
// PRO Report Generator — HTML-based report with KaTeX math rendering
// Generates the structural analysis report; the design is reported by the memoria
// (`lib/report/memoria`).
// Uses window.print() for PDF output (browser native)

import { provenanceBlockHtml, withPrintedManifest, type ResultProvenance as ProvenanceRecord, type ProvenanceLabels } from '../provenance/result-provenance';
import { reportConfigScript, printedManifest, printedTables } from './report/printed-values';
import { memberSectionLabel } from '../section/variable';
import { plainNumber } from '../utils/units';
import katex from 'katex';
import katexCss from 'katex/dist/katex.min.css?raw';
import type { Node, Material, Section, Element, Support, Quad } from '../store/model.svelte';
import type { AnalysisResults3D, ShellEnvelope } from './types-3d';
import { formatPDeltaFactor } from './pdelta-result';
import { selfCheckWarningText } from '../i18n/engine-text';
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
import { membranePrincipals } from './shell-stress';
import { DEFAULT_AXES, makeFrame, pseudoToUser, supportTypeIn, toUser, userAxisAlong, type AxesChoice } from '../axes/frame';
import { axesStatement } from '../axes/statement';

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
  /** The result set the tables and figures are of (`pro/export-results.ts`); the screen's when absent. */
  resultSetKey?: string;
  /** The axes global coordinates and results are printed in; the model's own when absent. */
  axes?: AxesChoice;
  /** A plane model printed standing in X–Z, as the view showed it when the report was made; the current view's when absent. */
  uprightPlane?: boolean;
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
  /** The model with the loads of each case, under the loads' table, and how many cases were left without one. */
  loads?: ReportFigure[];
  loadsOmitted?: number;
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
    pdelta?: { disposition?: ReturnType<typeof knownIssueDisposition>; converged: boolean; iterations: number; b2Factor?: number; isStable?: boolean };
    modal?: { disposition?: ReturnType<typeof knownIssueDisposition>; modes: Array<{ frequency: number; period: number; participationX?: number; participationY?: number; participationZ?: number; massRatioX?: number; massRatioY?: number }>; totalMass?: number; finiteSpectrumDiagnostic?: string; ratiosWithheld?: boolean; structuredDiagnostics?: import('./types').StructuredDiagnostic[] };
    buckling?: { disposition?: ReturnType<typeof knownIssueDisposition>; factors: number[] };
    spectral?: { disposition?: ReturnType<typeof knownIssueDisposition>; baseShearX?: number; baseShearY?: number; baseShearZ?: number };
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
  containment?: ReturnType<typeof knownIssueDisposition>;
  diagnostics?: SolverDiagnostic[];
  // Viewport screenshot (data URL)
  screenshot?: string;
  /** Figures drawn from the model, placed in their sections. */
  resultFigures?: ReportResultFigures;
  // Translation function (defaults to identity)
  t?: TFunc;
  // Report configuration (project info + section toggles)
  config?: ReportConfig;
  /** The language the report is written in. */
  locale?: string;
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
  const axes = data.config?.axes ?? DEFAULT_AXES;
  const frame = makeFrame(axes);
  const vec = (x: number, y: number, z: number) => toUser(frame, [x, y, z]).map((v) => v + 0);
  const rot = (x: number, y: number, z: number) => pseudoToUser(frame, [x, y, z]).map((v) => v + 0);
  const alongName = (k: 0 | 1 | 2) => userAxisAlong(frame, k).name;

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
  html.push(`<div class="disclaimer" style="font-size:10px;color:#777;margin:16px auto 0;max-width:520px">${escHtml(tr('disclaimer.report'))}</div>`);
