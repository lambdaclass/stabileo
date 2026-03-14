// PRO Report Generator — HTML-based report with KaTeX math rendering
// Generates a complete structural analysis + verification report
// Uses window.print() for PDF output (browser native)
// Groups identical element designs to reduce report length

import katex from 'katex';
import type { Node, Material, Section, Element, Support, Quad } from '../store/model.svelte';
import type { AnalysisResults3D, Reaction3D, ElementForces3D, Displacement3D } from './types-3d';
import type { ElementVerification } from './codes/argentina/cirsoc201';
import { generateCrossSectionSvg, generateBeamElevationSvg, generateColumnElevationSvg, generateJointDetailSvg, generateSlabReinforcementSvg, designSlabReinforcement } from './reinforcement-svg';
import { generateInteractionDiagram, generateInteractionSvg } from './codes/argentina/interaction-diagram';
import type { QuantitySummary } from './quantity-takeoff';
import type { SolverDiagnostic } from './types';

/** Translation function type — accepts key, returns translated string */
type TFunc = (key: string) => string;

/** Simple interpolation: replaces {name} placeholders in a translated string */
function interp(tpl: string, vars: Record<string, string | number>): string {
  return tpl.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`));
}

/** Report configuration — project/company info + section selection */
export interface ReportConfig {
  companyName: string;
  companyLogo: string | null;
  projectAddress: string;
  engineerName: string;
  revision: string;
  sections: {
    modelData: boolean;
    results: boolean;
    verification: boolean;
    advancedAnalysis: boolean;
    storyDrift: boolean;
    diagnostics: boolean;
    quantities: boolean;
    loads: boolean;
  };
}

export interface ReportData {
  projectName: string;
  date: string;
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
  // Verification
  verifications: ElementVerification[];
  // Quantities
  quantities?: QuantitySummary;
  // Element lengths for elevation drawings
  elementLengths?: Map<number, number>;
  // Advanced analysis results (modal, spectral, P-Delta, buckling)
  advancedResults?: {
    pdelta?: { converged: boolean; iterations: number; b2Factor?: number };
    modal?: { modes: Array<{ frequency: number; period: number; participationX?: number; participationY?: number; participationZ?: number }>; totalMass?: number };
    buckling?: { factors: number[] };
    spectral?: { baseShearX?: number; baseShearY?: number; baseShearZ?: number };
  };
  // Story drift results
  storyDrifts?: Array<{
    level: number; height: number;
    driftX: number; driftZ: number;
    ratioX: number; ratioZ: number;
    status: 'ok' | 'warn' | 'fail';
  }>;
  // Diagnostics
  diagnostics?: SolverDiagnostic[];
  // Viewport screenshot (data URL)
  screenshot?: string;
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
    return katex.renderToString(expr, { displayMode: display, throwOnError: false, output: 'html' });
  } catch {
    return `<code>${escHtml(expr)}</code>`;
  }
}

/** Convert a plain-text calculation step to KaTeX-rendered HTML.
 *  Steps follow the pattern: "LHS = formula = value unit"
 *  e.g. "d = 60 - 4 - 1 - 0.5 = 54.5 cm"
 *  e.g. "Vc = 0.17·√f'c·bw·d = 123.45 kN"
 */
function renderStep(step: string): string {
  let tex = step;

  // ── Named substitutions (do these BEFORE symbol replacements) ──
  tex = tex.replace(/As,req/g, 'A_{s,req}');
  tex = tex.replace(/As,min/g, 'A_{s,min}');
  tex = tex.replace(/As,max/g, 'A_{s,max}');
  tex = tex.replace(/As,prov/g, 'A_{s,prov}');
  tex = tex.replace(/Av\/s,req/g, 'A_{v}/s_{req}');
  tex = tex.replace(/Av\/s/g, 'A_{v}/s');
  tex = tex.replace(/Vs,req/g, 'V_{s,req}');
  tex = tex.replace(/Vs,max/g, 'V_{s,max}');
  tex = tex.replace(/At\/s,req/g, 'A_{t}/s_{req}');
  tex = tex.replace(/At\/s/g, 'A_{t}/s');
  tex = tex.replace(/Al,req/g, 'A_{l,req}');
  tex = tex.replace(/Acp/g, 'A_{cp}');
  tex = tex.replace(/pcp/g, 'p_{cp}');
  tex = tex.replace(/Aoh/g, 'A_{oh}');
  tex = tex.replace(/Ao(?=[·\s=)])/g, 'A_{o}');
  tex = tex.replace(/Al /g, 'A_{l} ');
  tex = tex.replace(/ph /g, 'p_{h} ');
  tex = tex.replace(/Nu/g, 'N_{u}');
  tex = tex.replace(/Mu/g, 'M_{u}');
  tex = tex.replace(/Vu/g, 'V_{u}');
  tex = tex.replace(/Tu/g, 'T_{u}');
  tex = tex.replace(/Rn/g, 'R_{n}');
  tex = tex.replace(/Ag/g, 'A_{g}');
  tex = tex.replace(/Vc(?=[·\s=)])/g, 'V_{c}');
  tex = tex.replace(/Vs(?=[·\s=,)])/g, 'V_{s}');
  tex = tex.replace(/Tcr/g, 'T_{cr}');
  tex = tex.replace(/Mc /g, 'M_{c} ');
  tex = tex.replace(/Pn0/g, 'P_{n0}');
  tex = tex.replace(/Pnx/g, 'P_{nx}');
  tex = tex.replace(/Pny/g, 'P_{ny}');
  tex = tex.replace(/Pn(?=[·\s=)])/g, 'P_{n}');
  tex = tex.replace(/Lu/g, 'L_{u}');
  tex = tex.replace(/δns/g, '\\delta_{ns}');
  tex = tex.replace(/f'c/g, "f'_{c}");
  tex = tex.replace(/bw/g, 'b_{w}');
  tex = tex.replace(/ρ_min/g, '\\rho_{min}');
  tex = tex.replace(/ρ_max/g, '\\rho_{max}');
  tex = tex.replace(/ρ_b/g, '\\rho_{b}');

  // ── √ handling: match √ followed by a "token" (letters/digits/'/_ until · or space or = or )) ──
  // e.g. "√f'c" → "\sqrt{f'_{c}}", "√(d² - X)" → "\sqrt{(d² - X)}"
  tex = tex.replace(/√\(([^)]+)\)/g, '\\sqrt{($1)}');       // √(expr) → \sqrt{(expr)}
  tex = tex.replace(/√([A-Za-z0-9'_{}\\.]+)/g, '\\sqrt{$1}'); // √token → \sqrt{token}

  // ── Unicode symbol replacements ──
  tex = tex.replace(/·/g, ' \\cdot ');
  tex = tex.replace(/φ/g, '\\phi ');
  tex = tex.replace(/ρ/g, '\\rho ');
  tex = tex.replace(/θ/g, '\\theta ');
  tex = tex.replace(/²/g, '^{2}');
  tex = tex.replace(/³/g, '^{3}');
  tex = tex.replace(/⁴/g, '^{4}');
  tex = tex.replace(/≥/g, '\\geq ');
  tex = tex.replace(/≤/g, '\\leq ');
  tex = tex.replace(/→/g, '\\rightarrow ');
  tex = tex.replace(/⚠/g, '\\triangle\\!');
  tex = tex.replace(/×/g, '\\times ');
  tex = tex.replace(/Ø/g, '\\varnothing');

  // ── Units at end of expression → \text{} ──
  // Unit patterns (after · → \cdot replacement, ² → ^{2})
  tex = tex.replace(/\s+kN\s*\\cdot\s*m\s*$/, ' \\text{ kN·m}');
  tex = tex.replace(/\s+cm\^{2}\/m\s*$/, ' \\text{ cm²/m}');
  tex = tex.replace(/\s+m\^{2}\/m\s*$/, ' \\text{ m²/m}');
  tex = tex.replace(/\s+cm\^{2}\s*$/, ' \\text{ cm²}');
  tex = tex.replace(/\s+m\^{2}\s*$/, ' \\text{ m²}');
  tex = tex.replace(/\s+(kN|MPa|cm|mm|m|rad)\s*$/, ' \\text{ $1}');
  tex = tex.replace(/\s+(%)\s*$/, ' \\text{$1}');

  // ── Wrap text fragments (Armadura propuesta:, Estribos:, etc.) ──
  // Detect lines that are descriptive text, not equations (no "=" sign, or start with ⚠/Armadura/Estribos/etc.)
  const isTextLine = /^⚠/.test(step) || /^(Armadura|Estribos|Momento|Sección|Columna|No se)/.test(step);
  if (isTextLine) {
    tex = `\\text{${escHtml(step).replace(/Ø/g, 'ø')}}`;
  }

  return `<div class="memo-step">${km(tex)}</div>`;
}

// ─── Verification grouping ───────────────────────────────────────

interface VerifGroup {
  /** Representative verification (used for steps, SVG, etc.) */
  representative: ElementVerification;
  /** All element IDs in this group */
  elementIds: number[];
  /** Stirrup variants: map from stirrup description to element IDs */
  stirrupVariants: Map<string, number[]>;
}

function groupVerifications(verifications: ElementVerification[]): VerifGroup[] {
  const groupMap = new Map<string, VerifGroup>();

  for (const v of verifications) {
    const bars = v.column ? v.column.bars : v.flexure.bars;
    const secKey = `${v.elementType}_${(v.b * 100).toFixed(0)}x${(v.h * 100).toFixed(0)}`;
    const key = `${secKey}_${bars}`;
    const stirrupDesc = `eØ${v.shear.stirrupDia} c/${(v.shear.spacing * 100).toFixed(0)}`;

    let group = groupMap.get(key);
    if (!group) {
      group = {
        representative: v,
        elementIds: [],
        stirrupVariants: new Map(),
      };
      groupMap.set(key, group);
    }

    group.elementIds.push(v.elementId);

    const existing = group.stirrupVariants.get(stirrupDesc);
    if (existing) {
      existing.push(v.elementId);
    } else {
      group.stirrupVariants.set(stirrupDesc, [v.elementId]);
    }
  }

  return [...groupMap.values()];
}

function typeLabel(type: string, tr: TFunc): string {
  return type === 'beam' ? tr('report.typeBeam') : type === 'wall' ? tr('report.typeWall') : tr('report.typeColumn');
}

function typeLabelShort(type: string, tr: TFunc): string {
  return type === 'beam' ? tr('report.typeBeamShort') : type === 'wall' ? tr('report.typeWallShort') : tr('report.typeColumnShort');
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
  const { projectName, date, nodes, elements, materials, sections, supports, loadCount, results, verifications, quantities, screenshot } = data;
  // Use provided translation function or fallback to identity (returns key)
  const tr: TFunc = data.t ?? ((k: string) => k);

  const html: string[] = [];

  // Detect lang code from translation output for html lang attribute
  const langCode = tr('report.printBtn') === 'Imprimir / PDF' ? 'es'
    : tr('report.printBtn') === 'Print / PDF' ? 'en'
    : 'en';

  // Get KaTeX CSS URL from the installed package
  const katexCssUrl = 'https://cdn.jsdelivr.net/npm/katex@0.16.28/dist/katex.min.css';

  html.push(`<!DOCTYPE html>
<html lang="${langCode}">
<head>
<meta charset="UTF-8">
<title>${escHtml(interp(tr('report.docTitle'), { name: projectName }))}</title>
<link rel="stylesheet" href="${katexCssUrl}">
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
  if (cfg?.companyName) {
    html.push(`<div style="font-size:14px;color:#555;letter-spacing:2px;text-transform:uppercase;margin-bottom:30px">${escHtml(cfg.companyName)}</div>`);
  }
  html.push(`<h1>${escHtml(projectName)}</h1>`);
  html.push(`<div class="subtitle">${escHtml(tr('report.coverSubtitle'))}</div>`);
  html.push(`<div class="subtitle">${escHtml(tr('report.coverCode'))}</div>`);
  if (cfg?.projectAddress) {
    html.push(`<div style="font-size:12px;color:#666;margin-top:12px">${escHtml(cfg.projectAddress)}</div>`);
  }
  html.push(`<div class="date">${escHtml(date)}</div>`);
  const coverFooterParts: string[] = [];
  if (cfg?.engineerName) coverFooterParts.push(`${escHtml(tr('report.engineer'))}: ${escHtml(cfg.engineerName)}`);
  if (cfg?.revision) coverFooterParts.push(`${escHtml(tr('report.revisionLabel'))}: ${escHtml(cfg.revision)}`);
  if (coverFooterParts.length > 0) {
    html.push(`<div style="font-size:11px;color:#888;margin-top:16px">${coverFooterParts.join(' &mdash; ')}</div>`);
  }
  html.push(`<div class="logo">${escHtml(tr('report.coverFooter'))}</div>`);
  html.push(`</div>`);

  const showSection = (key: keyof NonNullable<ReportConfig['sections']>) => !cfg?.sections || cfg.sections[key];

  // ─── Table of Contents ──────────────────────────────────
  html.push(`<div class="page-break"></div>`);
  html.push(`<div class="toc"><h2>${escHtml(tr('report.toc') || 'Table of Contents')}</h2>`);
  const tocEntries: { label: string; anchor: string }[] = [];
  if (showSection('modelData')) tocEntries.push({ label: '1. ' + tr('report.modelData'), anchor: 'sec-model-data' });
  if (showSection('results')) tocEntries.push({ label: '2. ' + tr('report.results'), anchor: 'sec-results' });
  if (showSection('verification') && verifications.length > 0) tocEntries.push({ label: '3. ' + tr('report.verification'), anchor: 'sec-verification' });
  if (showSection('advancedAnalysis') && data.advancedResults) tocEntries.push({ label: '4. ' + (tr('report.advancedAnalysis') || 'Advanced Analysis'), anchor: 'sec-advanced' });
  if (showSection('storyDrift') && data.storyDrifts && data.storyDrifts.length > 0) tocEntries.push({ label: '5. ' + (tr('report.storyDrift') || 'Story Drift'), anchor: 'sec-drift' });
  if (showSection('diagnostics') && data.diagnostics && data.diagnostics.length > 0) tocEntries.push({ label: '6. ' + (tr('report.diagnostics') || 'Diagnostics'), anchor: 'sec-diagnostics' });
  if (showSection('quantities') && quantities) tocEntries.push({ label: '7. ' + (tr('report.quantities') || 'Quantities'), anchor: 'sec-quantities' });
  for (const entry of tocEntries) {
    html.push(`<div class="toc-entry"><a href="#${entry.anchor}">${escHtml(entry.label)}</a><span class="toc-dots"></span></div>`);
  }
  html.push(`</div>`);

  // ─── Model Data ─────────────────────────────────────────
  if (showSection('modelData')) {
  html.push(`<div class="page-break"></div>`);
  html.push(`<h1 id="sec-model-data">${escHtml(tr('report.modelData'))}</h1>`);

  if (screenshot) {
    html.push(`<h2>${escHtml(tr('report.view3d'))}</h2>`);
    html.push(`<img class="screenshot" src="${screenshot}" alt="${escHtml(tr('report.viewAlt'))}" />`);
  }

  // Nodes table
  html.push(`<h2>1.1 ${escHtml(tr('report.nodes'))} (${nodes.length})</h2>`);
  if (nodes.length > 80) {
    html.push(`<p>${escHtml(interp(tr('report.nodesOmitted'), { n: nodes.length }))}</p>`);
  } else {
    html.push(`<table><thead><tr><th>ID</th><th>${km('X')} (m)</th><th>${km('Y')} (m)</th><th>${km('Z')} (m)</th></tr></thead><tbody>`);
    for (const n of nodes) {
      html.push(`<tr><td>${n.id}</td><td class="num">${fmtNum(n.x, 3)}</td><td class="num">${fmtNum(n.y, 3)}</td><td class="num">${fmtNum(n.z ?? 0, 3)}</td></tr>`);
    }
    html.push(`</tbody></table>`);
  }

  // Materials table
  html.push(`<h2>1.2 ${escHtml(tr('report.materials'))} (${materials.length})</h2>`);
  html.push(`<table><thead><tr><th>ID</th><th>${escHtml(tr('report.name'))}</th><th>${km('E')} (MPa)</th><th>${km('\\nu')}</th><th>${km('\\gamma')} (kN/m³)</th><th>${km("f'_c / f_y")} (MPa)</th></tr></thead><tbody>`);
  for (const m of materials) {
    html.push(`<tr><td>${m.id}</td><td>${escHtml(m.name)}</td><td class="num">${m.e.toLocaleString()}</td><td class="num">${m.nu}</td><td class="num">${m.rho}</td><td class="num">${m.fy ?? '—'}</td></tr>`);
  }
  html.push(`</tbody></table>`);

  // Sections table
  html.push(`<h2>1.3 ${escHtml(tr('report.sections'))} (${sections.length})</h2>`);
  html.push(`<table><thead><tr><th>ID</th><th>${escHtml(tr('report.name'))}</th><th>${km('A')} (m²)</th><th>${km('I_z')} (m⁴)</th><th>${km('b')} (m)</th><th>${km('h')} (m)</th></tr></thead><tbody>`);
  for (const s of sections) {
    html.push(`<tr><td>${s.id}</td><td>${escHtml(s.name)}</td><td class="num">${fmtNum(s.a, 6)}</td><td class="num">${fmtNum(s.iz, 8)}</td><td class="num">${s.b ? fmtNum(s.b, 3) : '—'}</td><td class="num">${s.h ? fmtNum(s.h, 3) : '—'}</td></tr>`);
  }
  html.push(`</tbody></table>`);

  // Elements table
  html.push(`<h2>1.4 ${escHtml(tr('report.elements'))} (${elements.length})</h2>`);
  if (elements.length > 100) {
    html.push(`<p>${escHtml(interp(tr('report.elementsOmitted'), { n: elements.length }))}</p>`);
  } else {
    html.push(`<table><thead><tr><th>ID</th><th>${escHtml(tr('report.nodeI'))}</th><th>${escHtml(tr('report.nodeJ'))}</th><th>${escHtml(tr('report.material'))}</th><th>${escHtml(tr('report.sections'))}</th></tr></thead><tbody>`);
    for (const e of elements) {
      const matName = materials.find(m => m.id === e.materialId)?.name ?? String(e.materialId);
      const secName = sections.find(s => s.id === e.sectionId)?.name ?? String(e.sectionId);
      html.push(`<tr><td>${e.id}</td><td>${e.nodeI}</td><td>${e.nodeJ}</td><td>${escHtml(matName)}</td><td>${escHtml(secName)}</td></tr>`);
    }
    html.push(`</tbody></table>`);
  }

  // Supports
  html.push(`<h2>1.5 ${escHtml(tr('report.supports'))} (${supports.length})</h2>`);
  html.push(`<table><thead><tr><th>ID</th><th>${escHtml(tr('report.nodes'))}</th><th>${escHtml(tr('report.type'))}</th></tr></thead><tbody>`);
  for (const s of supports) {
    html.push(`<tr><td>${s.id}</td><td>${s.nodeId}</td><td>${s.type}</td></tr>`);
  }
  html.push(`</tbody></table>`);

  html.push(`<p>${escHtml(interp(tr('report.loadsCount'), { n: loadCount }))}</p>`);

  // Loads detail table
  if (showSection('loads') && data.loads && data.loads.length > 0) {
    html.push(`<h2>1.7 ${escHtml(tr('report.loadsDetail'))} (${data.loads.length})</h2>`);
    html.push(`<table><thead><tr><th>#</th><th>${escHtml(tr('report.type'))}</th><th>${escHtml(tr('report.target'))}</th><th>${escHtml(tr('report.values'))}</th></tr></thead><tbody>`);
    for (let i = 0; i < data.loads.length; i++) {
      const ld = data.loads[i];
      html.push(`<tr><td>${i + 1}</td><td>${escHtml(ld.type)}</td><td>${escHtml(ld.target)}</td><td>${escHtml(ld.values)}</td></tr>`);
    }
    html.push(`</tbody></table>`);
  }

  // Quads (losas y tabiques)
  if (data.quads && data.quads.length > 0) {
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

    html.push(`<h2>1.6 ${escHtml(tr('report.slabsAndWalls'))} (${data.quads.length} ${escHtml(tr('report.shellElements'))})</h2>`);

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
  } // end showSection('modelData')

  // ─── Results ────────────────────────────────────────────
  if (showSection('results')) {
  html.push(`<div class="page-break"></div>`);
  html.push(`<h1 id="sec-results">${escHtml(tr('report.results'))}</h1>`);

  // Reactions
  html.push(`<h2>2.1 ${escHtml(tr('report.reactions'))}</h2>`);
  html.push(`<table><thead><tr><th>Nodo</th><th>${km('F_x')} (kN)</th><th>${km('F_y')} (kN)</th><th>${km('F_z')} (kN)</th><th>${km('M_x')} (kN·m)</th><th>${km('M_y')} (kN·m)</th><th>${km('M_z')} (kN·m)</th></tr></thead><tbody>`);
  for (const r of results.reactions) {
    html.push(`<tr><td>${r.nodeId}</td><td class="num">${fmtNum(r.fx)}</td><td class="num">${fmtNum(r.fy)}</td><td class="num">${fmtNum(r.fz)}</td><td class="num">${fmtNum(r.mx)}</td><td class="num">${fmtNum(r.my)}</td><td class="num">${fmtNum(r.mz)}</td></tr>`);
  }
  html.push(`</tbody></table>`);

  // Element forces
  html.push(`<h2>2.2 ${escHtml(tr('report.forces'))}</h2>`);
  if (results.elementForces.length > 100) {
    html.push(`<p>${escHtml(interp(tr('report.forcesOmitted'), { n: results.elementForces.length }))}</p>`);
  } else {
    html.push(`<table><thead><tr><th>Elem</th><th>${escHtml(tr('report.ext'))}</th><th>${km('N')} (kN)</th><th>${km('V_y')} (kN)</th><th>${km('V_z')} (kN)</th><th>${km('M_x')} (kN·m)</th><th>${km('M_y')} (kN·m)</th><th>${km('M_z')} (kN·m)</th></tr></thead><tbody>`);
    for (const ef of results.elementForces) {
      html.push(`<tr><td rowspan="2">${ef.elementId}</td><td>i</td><td class="num">${fmtNum(ef.nStart)}</td><td class="num">${fmtNum(ef.vyStart)}</td><td class="num">${fmtNum(ef.vzStart)}</td><td class="num">${fmtNum(ef.mxStart)}</td><td class="num">${fmtNum(ef.myStart)}</td><td class="num">${fmtNum(ef.mzStart)}</td></tr>`);
      html.push(`<tr><td>j</td><td class="num">${fmtNum(ef.nEnd)}</td><td class="num">${fmtNum(ef.vyEnd)}</td><td class="num">${fmtNum(ef.vzEnd)}</td><td class="num">${fmtNum(ef.mxEnd)}</td><td class="num">${fmtNum(ef.myEnd)}</td><td class="num">${fmtNum(ef.mzEnd)}</td></tr>`);
    }
    html.push(`</tbody></table>`);
  }

  // Displacements
  html.push(`<h2>2.3 ${escHtml(tr('report.displacements'))}</h2>`);
  if (results.displacements.length > 80) {
    html.push(`<p>${escHtml(interp(tr('report.displacementsOmitted'), { n: results.displacements.length }))}</p>`);
  } else {
    html.push(`<table><thead><tr><th>Nodo</th><th>${km('u_x')} (m)</th><th>${km('u_y')} (m)</th><th>${km('u_z')} (m)</th><th>${km('\\theta_x')} (rad)</th><th>${km('\\theta_y')} (rad)</th><th>${km('\\theta_z')} (rad)</th></tr></thead><tbody>`);
    for (const d of results.displacements) {
      html.push(`<tr><td>${d.nodeId}</td><td class="num">${fmtNum(d.ux, 6)}</td><td class="num">${fmtNum(d.uy, 6)}</td><td class="num">${fmtNum(d.uz, 6)}</td><td class="num">${fmtNum(d.rx, 6)}</td><td class="num">${fmtNum(d.ry, 6)}</td><td class="num">${fmtNum(d.rz, 6)}</td></tr>`);
    }
    html.push(`</tbody></table>`);
  }

  } // end showSection('results')

  // ─── Verification ───────────────────────────────────────
  if (showSection('verification') && verifications.length > 0) {
    html.push(`<div class="page-break"></div>`);
    html.push(`<h1 id="sec-verification">${escHtml(tr('report.verification'))}</h1>`);

    const ok = verifications.filter(v => v.overallStatus === 'ok').length;
    const fail = verifications.filter(v => v.overallStatus === 'fail').length;
    const warn = verifications.filter(v => v.overallStatus === 'warn').length;
    html.push(`<p><span class="status-ok">${escHtml(interp(tr('report.statusOk'), { n: ok }))}</span> · <span class="status-warn">${escHtml(interp(tr('report.statusWarn'), { n: warn }))}</span> · <span class="status-fail">${escHtml(interp(tr('report.statusFail'), { n: fail }))}</span></p>`);

    // Summary table
    html.push(`<h2>3.1 ${escHtml(tr('report.summary'))}</h2>`);
    html.push(`<table><thead><tr><th>Elem</th><th>${escHtml(tr('report.type'))}</th><th>${km('M_u')} (kN·m)</th><th>${km('V_u')} (kN)</th><th>${km('N_u')} (kN)</th><th>${km('A_{s,req}')} (cm²)</th><th>${km('A_{s,prov}')} (cm²)</th><th>${escHtml(tr('report.reinforcement'))}</th><th>${escHtml(tr('report.stirrups'))}</th><th>${escHtml(tr('report.status'))}</th></tr></thead><tbody>`);
    for (const v of verifications) {
      const statusCls = v.overallStatus === 'ok' ? 'status-ok' : v.overallStatus === 'fail' ? 'status-fail' : 'status-warn';
      const statusTxt = v.overallStatus === 'ok' ? '✓' : v.overallStatus === 'fail' ? '✗' : '⚠';
      const asReq = v.column ? v.column.AsTotal : v.flexure.AsReq;
      const asProv = v.column ? v.column.AsProv : v.flexure.AsProv;
      const bars = v.column ? v.column.bars : v.flexure.bars;
      // Show compression steel indicator for doubly reinforced beams
      const compNote = (!v.column && v.flexure.isDoublyReinforced && v.flexure.barsComp)
        ? ` + ${v.flexure.barsComp} (A's)`
        : '';
      html.push(`<tr><td>${v.elementId}</td><td>${typeLabel(v.elementType, tr)}</td><td class="num">${fmtNum(v.Mu)}</td><td class="num">${fmtNum(v.Vu)}</td><td class="num">${fmtNum(v.Nu)}</td><td class="num">${asReq.toFixed(1)}</td><td class="num">${asProv.toFixed(1)}</td><td>${bars}${compNote}</td><td>eØ${v.shear.stirrupDia} c/${(v.shear.spacing * 100).toFixed(0)}</td><td class="${statusCls}">${statusTxt}</td></tr>`);
    }
    html.push(`</tbody></table>`);

    // ─── Grouped detail ──────────────────────────────────
    html.push(`<h2>3.2 ${escHtml(tr('report.detailByType'))}</h2>`);

    const groups = groupVerifications(verifications);

    for (const group of groups) {
      const v = group.representative;
      const lbl = typeLabel(v.elementType, tr);
      const secStr = `${(v.b * 100).toFixed(0)}×${(v.h * 100).toFixed(0)}`;
      const bars = v.column ? v.column.bars : v.flexure.bars;
      const elemList = group.elementIds.join(', ');

      html.push(`<div class="group-header">`);
      html.push(`<h3 style="margin:0">${lbl} ${secStr} cm — ${bars} — ${km("f'_c = " + v.fc + " \\text{ MPa}")}</h3>`);
      html.push(`<div class="group-elems">${escHtml(tr('report.elementsLabel'))}: ${elemList} (${group.elementIds.length})</div>`);

      // Stirrup variants
      if (group.stirrupVariants.size === 1) {
        const [desc] = [...group.stirrupVariants.keys()];
        html.push(`<div class="group-elems">${escHtml(tr('report.stirrups'))}: ${desc}</div>`);
      } else {
        html.push(`<div class="group-elems">${escHtml(tr('report.stirrups'))}:`);
        for (const [desc, ids] of group.stirrupVariants) {
          html.push(`<span class="stirrup-note">${desc} → elem. ${ids.join(', ')}</span>`);
        }
        html.push(`</div>`);
      }
      html.push(`</div>`);

      // Cross section SVG
      const svgStr = generateCrossSectionSvg({
        b: v.b,
        h: v.h,
        cover: v.cover,
        flexure: v.flexure,
        shear: v.shear,
        column: v.column,
        isColumn: v.elementType === 'column' || v.elementType === 'wall',
      });
      html.push(`<div class="svg-container">${svgStr}</div>`);

      // Calculation steps with KaTeX
      html.push(`<h4>${escHtml(tr('report.flexureCheck'))} <span class="code-ref">CIRSOC 201 §10.2</span></h4>`);
      html.push(`<div class="step-block">`);
      for (const step of v.flexure.steps) {
        html.push(renderStep(step));
      }
      html.push(`</div>`);

      html.push(`<h4>${escHtml(tr('report.shearCheck'))} <span class="code-ref">CIRSOC 201 §11.1</span></h4>`);
      html.push(`<div class="step-block">`);
      for (const step of v.shear.steps) {
        html.push(renderStep(step));
      }
      html.push(`</div>`);

      if (v.column) {
        html.push(`<h4>${escHtml(tr('report.compressionCheck'))} <span class="code-ref">CIRSOC 201 §10.3.6</span></h4>`);
        html.push(`<div class="step-block">`);
        for (const step of v.column.steps) {
          html.push(renderStep(step));
        }
        html.push(`</div>`);

        // Interaction diagram for columns
        try {
          if (v.b && v.h && v.column.AsProv > 0) {
            const diagram = generateInteractionDiagram({
              b: v.b,
              h: v.h,
              fc: v.fc,
              fy: v.fy,
              cover: v.cover,
              AsProv: v.column.AsProv,
              barCount: v.column.barCount,
              barDia: v.column.barDia,
            });
            if (diagram) {
              const svgDiag = generateInteractionSvg(diagram, { Nu: v.Nu, Mu: v.Mu });
              html.push(`<h4>${escHtml(tr('report.interactionDiagram') || 'Diagrama de Interacción P-M')}</h4>`);
              html.push(`<div class="interaction-container">${svgDiag}</div>`);
            }
          }
        } catch { /* diagram generation is optional */ }
      }

      if (v.torsion) {
        html.push(`<h4>${escHtml(tr('report.torsionCheck'))} <span class="code-ref">CIRSOC 201 §11.5</span>${v.torsion.neglect ? ` (${escHtml(tr('report.torsionNeglect'))})` : ''}</h4>`);
        html.push(`<div class="step-block">`);
        for (const step of v.torsion.steps) {
          html.push(renderStep(step));
        }
        html.push(`</div>`);
      }

      if (v.biaxial) {
        html.push(`<h4>${escHtml(tr('report.biaxialCheck'))} <span class="code-ref">CIRSOC 201 §10.3.6 (Bresler)</span></h4>`);
        html.push(`<div class="step-block">`);
        for (const step of v.biaxial.steps) {
          html.push(renderStep(step));
        }
        html.push(`</div>`);
      }

      if (v.slender) {
        html.push(`<h4>${escHtml(tr('report.slenderCheck'))}${v.slender.isSlender ? ` (${escHtml(tr('report.slenderColumn'))})` : ` (${escHtml(tr('report.shortColumn'))})`}</h4>`);
        html.push(`<div class="step-block">`);
        for (const step of v.slender.steps) {
          html.push(renderStep(step));
        }
        html.push(`</div>`);
      }
    }

    // ─── Elevation views (longitudinal sections) ─────────────
    html.push(`<div class="page-break"></div>`);
    html.push(`<h2>3.3 ${escHtml(tr('report.longitudinalSections'))}</h2>`);

    const drawnGroupKeys = new Set<string>();
    for (const group of groups) {
      const v = group.representative;
      const lbl = typeLabel(v.elementType, tr);
      const secStr = `${(v.b * 100).toFixed(0)}×${(v.h * 100).toFixed(0)}`;
      const groupKey = `${v.elementType}_${secStr}`;
      if (drawnGroupKeys.has(groupKey)) continue;
      drawnGroupKeys.add(groupKey);

      // Get element length (from the first element in the group)
      const elemLen = data.elementLengths?.get(v.elementId) ?? 3.0;

      // Determine support types for beam elevation
      const elem = elements.find(e => e.id === v.elementId);
      const supI = elem ? supports.find(s => s.nodeId === elem.nodeI) : undefined;
      const supJ = elem ? supports.find(s => s.nodeId === elem.nodeJ) : undefined;
      const supTypeI = supI ? (supI.type === 'fixed' ? 'fixed' as const : 'pinned' as const) : 'free' as const;
      const supTypeJ = supJ ? (supJ.type === 'fixed' ? 'fixed' as const : 'pinned' as const) : 'free' as const;

      if (v.elementType === 'beam' || v.elementType === 'wall') {
        html.push(`<h3>${lbl} ${secStr} cm — ${escHtml(tr('report.longitudinalView'))}</h3>`);
        const elevSvg = generateBeamElevationSvg({
          length: elemLen,
          h: v.h,
          cover: v.cover,
          flexure: v.flexure,
          shear: v.shear,
          supportI: supTypeI,
          supportJ: supTypeJ,
        });
        html.push(`<div class="svg-container">${elevSvg}</div>`);
      } else if (v.elementType === 'column' && v.column) {
        html.push(`<h3>${lbl} ${secStr} cm — ${escHtml(tr('report.longitudinalView'))}</h3>`);
        const colElevSvg = generateColumnElevationSvg({
          height: elemLen,
          b: v.b,
          h: v.h,
          cover: v.cover,
          column: v.column,
          shear: v.shear,
        });
        html.push(`<div class="svg-container">${colElevSvg}</div>`);
      }
    }

    // ─── Joint details ──────────────────────────────────────
    // Find beam-column connections and generate joint details
    const beamGroup = groups.find(g => g.representative.elementType === 'beam');
    const colGroup = groups.find(g => g.representative.elementType === 'column');
    if (beamGroup && colGroup) {
      html.push(`<h2>3.4 ${escHtml(tr('report.jointDetails'))}</h2>`);
      const bv = beamGroup.representative;
      const cv = colGroup.representative;
      const jointSvg = generateJointDetailSvg({
        beamB: bv.b,
        beamH: bv.h,
        colB: cv.b,
        colH: cv.h,
        cover: bv.cover,
        beamBars: bv.flexure.bars,
        colBars: cv.column?.bars ?? cv.flexure.bars,
        stirrupDia: cv.shear.stirrupDia,
        stirrupSpacing: cv.shear.spacing,
      });
      html.push(`<div class="svg-container">${jointSvg}</div>`);
    }

    // ─── Slab reinforcement ─────────────────────────────────
    if (data.quads && data.quads.length > 0) {
      const nodeMap = new Map(nodes.map(n => [n.id, n]));
      const matMap = new Map(materials.map(m => [m.id, m]));

      // Find horizontal quads (losas) and compute typical spans
      const losasFound: Array<{ spanX: number; spanZ: number; thickness: number; fc: number; fy: number }> = [];
      const seenThicknesses = new Set<number>();

      for (const q of data.quads) {
        const ns = q.nodes.map(nid => nodeMap.get(nid));
        if (ns.some(n => !n)) continue;
        const [p0, p1, , p3] = ns as NonNullable<typeof ns[number]>[];
        const ax = p1.x - p0.x, ay = p1.y - p0.y, az = (p1.z ?? 0) - (p0.z ?? 0);
        const bx = p3.x - p0.x, by = p3.y - p0.y, bz = (p3.z ?? 0) - (p0.z ?? 0);
        const nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
        const nLen = Math.sqrt(nx * nx + ny * ny + nz * nz);
        const yFrac = nLen > 1e-10 ? Math.abs(ny) / nLen : 0;
        if (yFrac <= 0.7) continue; // skip tabiques

        if (!seenThicknesses.has(q.thickness)) {
          seenThicknesses.add(q.thickness);
          const spanA = Math.sqrt(ax * ax + ay * ay + az * az);
          const spanB = Math.sqrt(bx * bx + by * by + bz * bz);
          const mat = matMap.get(q.materialId);
          const fc = mat?.fy ? 25 : 25; // default f'c
          const fy = 420;
          losasFound.push({ spanX: spanA, spanZ: spanB, thickness: q.thickness, fc, fy });
        }
      }

      if (losasFound.length > 0) {
        html.push(`<div class="page-break"></div>`);
        html.push(`<h2>3.${colGroup ? '5' : '4'} ${escHtml(tr('report.slabReinforcement'))}</h2>`);

        for (const losa of losasFound) {
          const ratio = Math.max(losa.spanX, losa.spanZ) / Math.min(losa.spanX, losa.spanZ);
          const isUnidirectional = ratio > 2;

          html.push(`<h3>${escHtml(tr('report.slabLabel'))} e=${(losa.thickness * 100).toFixed(0)} cm — ${isUnidirectional ? escHtml(tr('report.unidirectional')) : escHtml(tr('report.bidirectional'))} (${losa.spanX.toFixed(2)}×${losa.spanZ.toFixed(2)} m)</h3>`);

          // Simple moment estimate for slab strips (qL²/8 or qL²/10 depending on continuity)
          const q_design = 10; // kN/m² approx (1.2D + 1.6L for typical slab)
          const shortSpan = Math.min(losa.spanX, losa.spanZ);
          const Mu_short = q_design * shortSpan * shortSpan / 10; // kN·m/m (interior span)

          const designX = designSlabReinforcement(Mu_short, losa.thickness, losa.fc, losa.fy, 0.025, 'X');
          const designZ = isUnidirectional
            ? designSlabReinforcement(0, losa.thickness, losa.fc, losa.fy, 0.025, 'Z') // min reinforcement only
            : designSlabReinforcement(Mu_short * 0.8, losa.thickness, losa.fc, losa.fy, 0.025, 'Z');

          html.push(`<div class="step-block">`);
          html.push(renderStep(`d = ${(losa.thickness * 100).toFixed(0)} - ${(0.025 * 100).toFixed(1)} - 0.5 = ${(designX.d * 100).toFixed(1)} cm`));
          html.push(renderStep(`As,min = 0.0018·b·h = 0.0018·100·${(losa.thickness * 100).toFixed(0)} = ${designX.AsMin.toFixed(2)} cm²/m`));
          html.push(renderStep(`Dir. X: As,req = ${designX.AsReq.toFixed(2)} cm²/m → ${designX.bars}`));
          html.push(renderStep(`Dir. Z: As,req = ${designZ.AsReq.toFixed(2)} cm²/m → ${designZ.bars}`));
          html.push(`</div>`);

          // Slab plan SVG
          const slabSvg = generateSlabReinforcementSvg({
            spanX: losa.spanX,
            spanZ: losa.spanZ,
            thickness: losa.thickness,
            mxDesign: Mu_short,
            mzDesign: isUnidirectional ? 0 : Mu_short * 0.8,
            barsX: designX.bars,
            barsZ: designZ.bars,
            asxProv: designX.AsProv,
            aszProv: designZ.AsProv,
          });
          html.push(`<div class="svg-container">${slabSvg}</div>`);
        }
      }
    }

    // Rebar schedule (grouped)
    html.push(`<div class="page-break"></div>`);
    html.push(`<h2>3.${data.quads && data.quads.length > 0 ? '6' : colGroup ? '5' : '4'} ${escHtml(tr('report.rebarSchedule'))}</h2>`);
    html.push(`<table><thead><tr><th>${escHtml(tr('report.elementsLabel'))}</th><th>${escHtml(tr('report.type'))}</th><th>${escHtml(tr('report.sections'))}</th><th>${escHtml(tr('report.longBottom'))}</th><th>${escHtml(tr('report.longTop'))}</th><th>${escHtml(tr('report.stirrups'))}</th></tr></thead><tbody>`);
    for (const group of groups) {
      const v = group.representative;
      const secStr = `${(v.b * 100).toFixed(0)}×${(v.h * 100).toFixed(0)}`;
      const longBars = v.column ? v.column.bars : v.flexure.bars;
      const topBars = v.column ? tr('report.symmetric') : `2 Ø10 ${tr('report.minRebar')}`;
      const elemList = group.elementIds.join(', ');

      if (group.stirrupVariants.size === 1) {
        const [desc] = [...group.stirrupVariants.keys()];
        html.push(`<tr><td>${elemList}</td><td>${typeLabelShort(v.elementType, tr)}</td><td>${secStr}</td><td>${longBars}</td><td>${topBars}</td><td>${desc}</td></tr>`);
      } else {
        // Multiple stirrup patterns
        const variants = [...group.stirrupVariants.entries()].map(([desc, ids]) => `${desc} (${ids.join(', ')})`).join('<br>');
        html.push(`<tr><td>${elemList}</td><td>${typeLabelShort(v.elementType, tr)}</td><td>${secStr}</td><td>${longBars}</td><td>${topBars}</td><td>${variants}</td></tr>`);
      }
    }
    html.push(`</tbody></table>`);

    // Quantities section
    if (quantities) {
      html.push(`<h2>3.4 ${escHtml(tr('report.quantities'))}</h2>`);
      html.push(`<table><thead><tr><th>${escHtml(tr('report.concept'))}</th><th>${escHtml(tr('report.quantity'))}</th><th>${escHtml(tr('report.unit'))}</th></tr></thead><tbody>`);
      html.push(`<tr><td>${escHtml(tr('report.concrete'))}</td><td class="num">${quantities.totalConcreteVolume.toFixed(2)}</td><td>m³</td></tr>`);
      html.push(`<tr><td>${escHtml(tr('report.rebarLong'))}</td><td class="num">${quantities.totalRebarWeight.toFixed(0)}</td><td>kg</td></tr>`);
      html.push(`<tr><td>${escHtml(tr('report.rebarStirrups'))}</td><td class="num">${quantities.totalStirrupWeight.toFixed(0)}</td><td>kg</td></tr>`);
      html.push(`<tr><td><strong>${escHtml(tr('report.steelTotal'))}</strong></td><td class="num"><strong>${quantities.totalSteelWeight.toFixed(0)}</strong></td><td>kg</td></tr>`);
      html.push(`<tr><td>${escHtml(tr('report.steelRatio'))}</td><td class="num">${quantities.steelRatio.toFixed(0)}</td><td>kg/m³</td></tr>`);
      html.push(`</tbody></table>`);

      html.push(`<h3>${escHtml(tr('report.detailByElement'))}</h3>`);
      html.push(`<table><thead><tr><th>Elem</th><th>${escHtml(tr('report.type'))}</th><th>${km('L')} (m)</th><th>H° (m³)</th><th>Long. (kg)</th><th>${escHtml(tr('report.stirrups'))} (kg)</th><th>Total (kg)</th></tr></thead><tbody>`);
      for (const eq of quantities.elements) {
        html.push(`<tr><td>${eq.elementId}</td><td>${typeLabelShort(eq.elementType, tr)}</td><td class="num">${eq.length.toFixed(2)}</td><td class="num">${eq.concreteVolume.toFixed(3)}</td><td class="num">${eq.rebarWeight.toFixed(1)}</td><td class="num">${eq.stirrupWeight.toFixed(1)}</td><td class="num">${eq.totalSteelWeight.toFixed(1)}</td></tr>`);
      }
      html.push(`</tbody></table>`);
    }
  }

  // ─── Advanced Analysis Summary ──────────────────────────
  const adv = data.advancedResults;
  if (showSection('advancedAnalysis') && adv && (adv.pdelta || adv.modal || adv.buckling || adv.spectral)) {
    html.push(`<div class="page-break"></div>`);
    html.push(`<h2>${escHtml(tr('report.advancedAnalysis'))}</h2>`);

    if (adv.pdelta) {
      html.push(`<h3>${escHtml(tr('report.pdeltaTitle'))}</h3>`);
      html.push(`<table><tbody>`);
      html.push(`<tr><td>${escHtml(tr('report.convergence'))}</td><td class="num">${adv.pdelta.converged ? escHtml(tr('report.yes')) : escHtml(tr('report.no'))}</td></tr>`);
      html.push(`<tr><td>${escHtml(tr('report.iterations'))}</td><td class="num">${adv.pdelta.iterations}</td></tr>`);
      if (adv.pdelta.b2Factor != null) {
        html.push(`<tr><td>${escHtml(tr('report.b2Factor'))}</td><td class="num">${fmtNum(adv.pdelta.b2Factor, 3)}</td></tr>`);
      }
      html.push(`</tbody></table>`);
    }

    if (adv.modal && adv.modal.modes.length > 0) {
      html.push(`<h3>${escHtml(tr('report.modalTitle'))}</h3>`);
      if (adv.modal.totalMass != null) {
        html.push(`<p>${escHtml(tr('report.totalMass'))}: ${fmtNum(adv.modal.totalMass, 0)} kg</p>`);
      }
      html.push(`<table><thead><tr><th>${escHtml(tr('report.mode'))}</th><th>f (Hz)</th><th>T (s)</th><th>Part. X</th><th>Part. Y</th><th>Part. Z</th></tr></thead><tbody>`);
      for (let i = 0; i < adv.modal.modes.length; i++) {
        const m = adv.modal.modes[i];
        html.push(`<tr><td class="num">${i + 1}</td><td class="num">${fmtNum(m.frequency, 3)}</td><td class="num">${fmtNum(m.period, 3)}</td><td class="num">${m.participationX != null ? fmtNum(m.participationX, 3) : '—'}</td><td class="num">${m.participationY != null ? fmtNum(m.participationY, 3) : '—'}</td><td class="num">${m.participationZ != null ? fmtNum(m.participationZ, 3) : '—'}</td></tr>`);
      }
      html.push(`</tbody></table>`);
    }

    if (adv.buckling && adv.buckling.factors.length > 0) {
      html.push(`<h3>${escHtml(tr('report.bucklingTitle'))}</h3>`);
      html.push(`<table><thead><tr><th>${escHtml(tr('report.mode'))}</th><th>${escHtml(tr('report.criticalFactor'))}</th></tr></thead><tbody>`);
      for (let i = 0; i < adv.buckling.factors.length; i++) {
        html.push(`<tr><td class="num">${i + 1}</td><td class="num">${fmtNum(adv.buckling.factors[i], 3)}</td></tr>`);
      }
      html.push(`</tbody></table>`);
    }

    if (adv.spectral) {
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
    html.push(`<p>${escHtml(tr('report.driftLimit'))}</p>`);
    html.push(`<table><thead><tr><th>${escHtml(tr('report.level'))} (m)</th><th>h (m)</th><th>Δx (mm)</th><th>Δz (mm)</th><th>Δx/h</th><th>Δz/h</th><th>${escHtml(tr('report.status'))}</th></tr></thead><tbody>`);
    for (const d of data.storyDrifts) {
      const statusStr = d.status === 'ok' ? '✓ OK' : d.status === 'fail' ? `✗ ${tr('report.fail')}` : `⚠ ${tr('report.attention')}`;
      const cls = d.status === 'fail' ? ' style="color:#e94560;font-weight:bold"' : d.status === 'warn' ? ' style="color:#f0a500"' : '';
      html.push(`<tr${cls}><td class="num">${d.level.toFixed(2)}</td><td class="num">${d.height.toFixed(2)}</td><td class="num">${(d.driftX * 1000).toFixed(2)}</td><td class="num">${(d.driftZ * 1000).toFixed(2)}</td><td class="num">${d.ratioX.toFixed(4)}</td><td class="num">${d.ratioZ.toFixed(4)}</td><td>${statusStr}</td></tr>`);
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

  html.push(`</body></html>`);
  return html.join('\n');
}

/** Open the report in a new window for printing */
export function openReport(data: ReportData): void {
  const htmlContent = generateReportHtml(data);
  const win = window.open('', '_blank');
  if (!win) return;
  win.document.write(htmlContent);
  win.document.close();
}
