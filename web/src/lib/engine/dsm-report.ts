// DSM Step-by-Step Report Generator — HTML-based report with KaTeX math rendering
// Generates a complete "memoria de cálculo" showing all 9 steps of the Direct Stiffness Method
// Uses window.print() for PDF output (browser native)
// Pattern mirrors pro-report.ts

import katex from 'katex';
import type { DSMStepData } from './solver-detailed';

type TFunc = (key: string) => string;

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function km(expr: string, display = false): string {
  try {
    return katex.renderToString(expr, { displayMode: display, throwOnError: false, output: 'html' });
  } catch {
    return `<code>${escHtml(expr)}</code>`;
  }
}

function fmtNum(n: number, dec = 4): string {
  if (Math.abs(n) < 1e-10) return '0';
  if (Math.abs(n) >= 1e6 || (Math.abs(n) < 0.001 && Math.abs(n) > 0)) {
    return n.toExponential(dec - 1);
  }
  return n.toFixed(dec);
}

function fmtTex(n: number, dec = 4): string {
  if (Math.abs(n) < 1e-10) return '0';
  if (Math.abs(n) >= 1e6 || (Math.abs(n) < 0.001 && Math.abs(n) > 0)) {
    const exp = Math.floor(Math.log10(Math.abs(n)));
    const mantissa = n / Math.pow(10, exp);
    return `${mantissa.toFixed(dec - 1)} \\times 10^{${exp}}`;
  }
  return n.toFixed(dec);
}

// ─── CSS ──────────────────────────────────────────────────────────

const DSM_REPORT_CSS = `
  @page {
    size: A4 landscape;
    margin: 12mm;
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
    margin: 10mm auto;
    padding: 0 12mm;
    line-height: 1.5;
  }
  h1 { font-size: 22px; color: #0a3060; border-bottom: 2px solid #0a3060; padding-bottom: 4px; margin-top: 30px; }
  h2 { font-size: 16px; color: #1a5090; margin-top: 20px; border-bottom: 1px solid #ccc; padding-bottom: 2px; }
  h3 { font-size: 13px; color: #333; margin-top: 14px; }
  table { border-collapse: collapse; margin: 8px 0; font-size: 10px; }
  th, td { padding: 3px 6px; border: 1px solid #ddd; text-align: right; }
  th { background: #f4f7fb; font-weight: 600; font-size: 9px; border-bottom: 2px solid #0a3060; }
  td.label-cell { text-align: left; font-weight: 600; background: #f4f7fb; color: #555; }
  .cover-page { text-align: center; padding: 80px 0 40px; }
  .cover-page h1 { font-size: 28px; border: none; color: #0a3060; }
  .cover-page .subtitle { font-size: 14px; color: #555; margin: 6px 0; }
  .cover-page .date { font-size: 12px; color: #888; margin-top: 30px; }
  .cover-page .logo { font-size: 11px; color: #aaa; margin-top: 60px; letter-spacing: 3px; text-transform: uppercase; }
  .step-block {
    background: #f8f9fc;
    border-left: 3px solid #1a5090;
    padding: 8px 14px;
    margin: 8px 0;
    border-radius: 0 4px 4px 0;
  }
  .step-eq { margin: 10px 0; }
  .mat-container { overflow-x: auto; margin: 8px 0; }
  .mat-table td { font-family: 'Courier New', monospace; font-size: 9px; min-width: 55px; white-space: nowrap; }
  .mat-table td.pos { color: #0a6060; }
  .mat-table td.neg { color: #a02020; }
  .mat-table td.zero { color: #999; }
  .mat-table th { font-size: 8px; min-width: 55px; text-align: center; }
  .vec-inline { display: inline-block; vertical-align: middle; margin: 0 4px; }
  .summary-cards { display: flex; gap: 12px; margin: 10px 0; flex-wrap: wrap; }
  .summary-card { background: #f4f7fb; border: 1px solid #d0dae8; border-radius: 4px; padding: 6px 14px; text-align: center; }
  .summary-card .val { font-size: 18px; font-weight: 700; color: #0a3060; }
  .summary-card .lbl { font-size: 9px; color: #888; }
  .toc { margin: 20px 0 40px; }
  .toc h2 { border: none; color: #0a3060; }
  .toc-entry { display: flex; align-items: baseline; margin: 3px 0; font-size: 12px; }
  .toc-entry a { color: #1a5090; text-decoration: none; }
  .toc-entry a:hover { text-decoration: underline; }
  .toc-dots { flex: 1; border-bottom: 1px dotted #bbb; margin: 0 6px; min-width: 30px; }
  .print-btn { position: fixed; top: 10px; right: 10px; padding: 10px 24px; background: #1a5090; color: #fff; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; z-index: 999; box-shadow: 0 2px 8px rgba(0,0,0,0.2); }
  .print-btn:hover { background: #2a6ab0; }
  .hl { background: rgba(78,205,196,0.12); }
  .badge-free { display: inline-block; padding: 1px 6px; border-radius: 3px; font-size: 8px; background: rgba(78,205,196,0.15); color: #0a6060; }
  .badge-restr { display: inline-block; padding: 1px 6px; border-radius: 3px; font-size: 8px; background: rgba(233,69,96,0.12); color: #a02020; }
  .elem-header { background: #eef3f9; padding: 6px 12px; border-radius: 4px; margin-top: 14px; border: 1px solid #d0dae8; font-weight: 600; color: #1a5090; }
`;

// ─── Matrix/Vector HTML rendering ─────────────────────────────────

function renderMatrix(mat: number[][], labels?: string[], title?: string, highlightIndices?: Set<number>): string {
  const h: string[] = [];
  if (title) h.push(`<h4>${escHtml(title)}</h4>`);
  h.push('<div class="mat-container"><table class="mat-table">');
  // Column headers
  if (labels && labels.length > 0) {
    h.push('<tr><th></th>');
    for (let j = 0; j < mat[0].length; j++) {
      h.push(`<th>${escHtml(labels[j] ?? '')}</th>`);
    }
    h.push('</tr>');
  }
  for (let i = 0; i < mat.length; i++) {
    const rowHl = highlightIndices?.has(i) ? ' class="hl"' : '';
    h.push(`<tr${rowHl}>`);
    if (labels && labels.length > 0) {
      h.push(`<td class="label-cell">${escHtml(labels[i] ?? '')}</td>`);
    }
    for (let j = 0; j < mat[i].length; j++) {
      const v = mat[i][j];
      const cls = Math.abs(v) < 1e-10 ? 'zero' : v > 0 ? 'pos' : 'neg';
      h.push(`<td class="${cls}">${fmtNum(v)}</td>`);
    }
    h.push('</tr>');
  }
  h.push('</table></div>');
  return h.join('\n');
}

function renderVector(vec: number[], labels?: string[], title?: string, precision = 4, highlightIndices?: Set<number>): string {
  const h: string[] = [];
  if (title) h.push(`<h4>${escHtml(title)}</h4>`);
  h.push('<div class="mat-container"><table class="mat-table">');
  for (let i = 0; i < vec.length; i++) {
    const rowHl = highlightIndices?.has(i) ? ' class="hl"' : '';
    h.push(`<tr${rowHl}>`);
    if (labels && labels.length > 0) {
      h.push(`<td class="label-cell">${escHtml(labels[i] ?? '')}</td>`);
    }
    const v = vec[i];
    const cls = Math.abs(v) < 1e-10 ? 'zero' : v > 0 ? 'pos' : 'neg';
    h.push(`<td class="${cls}">${fmtNum(v, precision)}</td>`);
    h.push('</tr>');
  }
  h.push('</table></div>');
  return h.join('\n');
}

// ─── Matrix to LaTeX (for display equations) ──────────────────────

function matToLatex(mat: number[][], dec = 3): string {
  const rows = mat.map(row => row.map(v => fmtTex(v, dec)).join(' & '));
  return `\\begin{bmatrix} ${rows.join(' \\\\ ')} \\end{bmatrix}`;
}

function vecToLatex(vec: number[], dec = 4): string {
  const entries = vec.map(v => fmtTex(v, dec)).join(' \\\\ ');
  return `\\begin{Bmatrix} ${entries} \\end{Bmatrix}`;
}

// ─── Report generation ────────────────────────────────────────────

export function generateDsmReportHtml(data: DSMStepData, tr: TFunc): string {
  const html: string[] = [];
  const { dofNumbering, elements, K, F, Kff, Kfr, Krf, Krr, Ff, Fr, uPrescribed, FfMod, uFree, uAll, reactionsRaw, elementForces, dofLabels, freeDofLabels, restrDofLabels, loadContributions } = data;
  const { nFree, nTotal, dofsPerNode } = dofNumbering;
  const nRestr = nTotal - nFree;
  const is3D = dofsPerNode > 3;

  const katexCssUrl = 'https://cdn.jsdelivr.net/npm/katex@0.16.28/dist/katex.min.css';

  const stepNames: string[] = [];
  for (let i = 1; i <= 9; i++) {
    stepNames.push(tr(`dsm.step${i}Name`));
  }

  // ─── HTML head ──────────────────────────────────────────
  html.push(`<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>${escHtml(tr('dsm.reportTitle'))}</title>
<link rel="stylesheet" href="${katexCssUrl}">
<style>${DSM_REPORT_CSS}</style>
</head>
<body>
<button class="print-btn no-print" onclick="window.print()">${escHtml(tr('dsm.reportPrint'))}</button>
`);

  // ─── Cover ──────────────────────────────────────────────
  html.push(`<div class="cover-page">
    <h1>${escHtml(tr('dsm.reportTitle'))}</h1>
    <div class="subtitle">${escHtml(tr('dsm.reportSubtitle'))}</div>
    <div class="date">${new Date().toLocaleDateString()}</div>
    <div class="logo">Stabileo</div>
  </div>`);

  // ─── Table of Contents ──────────────────────────────────
  html.push('<div class="page-break"></div>');
  html.push(`<div class="toc"><h2>${escHtml(tr('dsm.reportToc'))}</h2>`);
  for (let i = 0; i < 9; i++) {
    html.push(`<div class="toc-entry"><a href="#step${i + 1}">${i + 1}. ${escHtml(stepNames[i])}</a><span class="toc-dots"></span></div>`);
  }
  html.push('</div>');

  // ─── Step 1: DOF Numbering ──────────────────────────────
  html.push('<div class="page-break"></div>');
  html.push(`<h1 id="step1">1. ${escHtml(stepNames[0])}</h1>`);
  html.push(`<div class="step-block"><p>${escHtml(tr('dsm.step1.explanation'))}</p></div>`);

  // DOF equation
  const dofExpr = is3D
    ? (dofsPerNode === 6 ? '\\text{' + tr('dsm.step1.eachNodeHas') + '} \\; u_x, \\; u_y, \\; u_z, \\; \\theta_x, \\; \\theta_y, \\; \\theta_z' : '\\text{' + tr('dsm.step1.eachNodeHas') + '} \\; u_x, \\; u_y, \\; u_z')
    : (dofsPerNode === 3 ? '\\text{' + tr('dsm.step1.eachNodeHas') + '} \\; u_x, \\; u_y, \\; \\theta_z' : '\\text{' + tr('dsm.step1.eachNodeHas') + '} \\; u_x, \\; u_y');
  html.push(`<div class="step-eq">${km(dofExpr, true)}</div>`);

  // Summary cards
  html.push('<div class="summary-cards">');
  html.push(`<div class="summary-card"><div class="val">${dofsPerNode}</div><div class="lbl">${escHtml(tr('dsm.step1.dofPerNode'))}</div></div>`);
  html.push(`<div class="summary-card"><div class="val" style="color:#0a6060">${nFree}</div><div class="lbl">${escHtml(tr('dsm.step1.freeDof'))}</div></div>`);
  html.push(`<div class="summary-card"><div class="val" style="color:#a02020">${nRestr}</div><div class="lbl">${escHtml(tr('dsm.step1.restrainedDof'))}</div></div>`);
  html.push(`<div class="summary-card"><div class="val">${nTotal}</div><div class="lbl">${escHtml(tr('dsm.step1.totalDof'))}</div></div>`);
  html.push('</div>');

  // DOF table
  html.push('<table style="width:auto"><tr>');
  html.push(`<th>${escHtml(tr('dsm.step1.nodeHeader'))}</th><th>${escHtml(tr('dsm.step1.localDof'))}</th><th>${escHtml(tr('dsm.step1.globalIndex'))}</th><th>Label</th><th>${escHtml(tr('dsm.step1.state'))}</th>`);
  html.push('</tr>');
  for (const dof of dofNumbering.dofs) {
    const badge = dof.isFree
      ? `<span class="badge-free">${escHtml(tr('dsm.step1.free'))}</span>`
      : `<span class="badge-restr">${escHtml(tr('dsm.step1.restrained'))}</span>`;
    html.push(`<tr><td>${dof.nodeId}</td><td>${dof.localDof}</td><td>${dof.globalIndex + 1}</td><td>${escHtml(dof.label)}</td><td>${badge}</td></tr>`);
  }
  html.push('</table>');

  // ─── Step 2: Local Matrices ─────────────────────────────
  html.push('<div class="page-break"></div>');
  html.push(`<h1 id="step2">2. ${escHtml(stepNames[1])}</h1>`);
  html.push(`<div class="step-block"><p>${escHtml(tr('dsm.step2.explanation'))}</p></div>`);

  for (const elem of elements) {
    html.push(`<div class="elem-header">${escHtml(tr('dsm.step2.element'))} E${elem.elementId} (N${elem.nodeI} → N${elem.nodeJ}) — ${elem.type}</div>`);
    html.push(`<p style="font-size:10px;color:#555">L = ${elem.length.toFixed(4)} m, E = ${fmtNum(elem.E, 0)} kN/m², A = ${fmtNum(elem.A, 6)} m², I<sub>z</sub> = ${fmtNum(elem.Iz, 8)} m⁴</p>`);
    html.push(renderMatrix(elem.kLocal, undefined, `[k]<sub>local</sub> — ${elem.kLocal.length}×${elem.kLocal[0].length}`));
  }

  // ─── Step 3: Transformation ─────────────────────────────
  html.push('<div class="page-break"></div>');
  html.push(`<h1 id="step3">3. ${escHtml(stepNames[2])}</h1>`);
  html.push(`<div class="step-block"><p>${escHtml(tr('dsm.step3.explanation'))}</p></div>`);
  html.push(`<div class="step-eq">${km('[K]_e = [T]^T \\cdot [k] \\cdot [T]', true)}</div>`);

  for (const elem of elements) {
    html.push(`<div class="elem-header">${escHtml(tr('dsm.step3.element'))} E${elem.elementId}</div>`);
    const angleStr = `${(elem.angle * 180 / Math.PI).toFixed(2)}°`;
    html.push(`<p style="font-size:10px;color:#555">α = ${angleStr}, cos α = ${Math.cos(elem.angle).toFixed(6)}, sin α = ${Math.sin(elem.angle).toFixed(6)}</p>`);
    html.push(renderMatrix(elem.T, undefined, `[T] — ${escHtml(tr('dsm.step3.transformation'))}`));
    html.push(renderMatrix(elem.kGlobal, elem.dofLabels, `[K]<sub>e</sub> — ${escHtml(tr('dsm.step3.globalStiffness'))}`));
    html.push(`<p style="font-size:9px;color:#888">${escHtml(tr('dsm.step3.dofMapping'))}: ${elem.dofLabels.join(', ')}</p>`);
  }

  // ─── Step 4: Assembly ───────────────────────────────────
  html.push('<div class="page-break"></div>');
  html.push(`<h1 id="step4">4. ${escHtml(stepNames[3])}</h1>`);
  html.push(`<div class="step-block"><p>${escHtml(tr('dsm.step4.explanation'))}</p></div>`);

  const sizeInfo = tr('dsm.step4.sizeInfo').replace('{n}', String(nTotal)).replace('{nxn}', `${nTotal}×${nTotal}`);
  html.push(`<p style="font-size:10px;color:#555">${escHtml(sizeInfo)}</p>`);

  // Only show full K if it's reasonable size (≤ 20x20)
  if (nTotal <= 20) {
    html.push(renderMatrix(K, dofLabels, '[K] — Global Stiffness Matrix'));
  } else {
    html.push(`<p style="font-style:italic;color:#888">${escHtml(tr('dsm.reportMatrixTooLarge')).replace('{n}', String(nTotal))}</p>`);
  }

  // ─── Step 5: Load Vector ────────────────────────────────
  html.push('<div class="page-break"></div>');
  html.push(`<h1 id="step5">5. ${escHtml(stepNames[4])}</h1>`);
  html.push(`<div class="step-block"><p>${escHtml(tr('dsm.step5.explanation'))}</p></div>`);

  html.push(renderVector(F, dofLabels, `{F} — ${escHtml(tr('dsm.step5.globalVector'))}`, 4));

  // Load contributions
  if (loadContributions.length > 0) {
    html.push(`<h3>${escHtml(tr('dsm.step5.contributions'))}</h3>`);
    html.push('<table style="width:auto"><tr>');
    html.push(`<th>${escHtml(tr('dsm.step5.dof'))}</th><th>Label</th><th>${escHtml(tr('dsm.step5.value'))}</th><th>${escHtml(tr('dsm.step5.source'))}</th>`);
    html.push('</tr>');
    for (const lc of loadContributions) {
      html.push(`<tr><td>${lc.dofIndex + 1}</td><td>${escHtml(lc.dofLabel)}</td><td class="num">${fmtNum(lc.value)}</td><td style="text-align:left">${escHtml(lc.source)}</td></tr>`);
    }
    html.push('</table>');
  }

  // ─── Step 6: Partitioning ───────────────────────────────
  html.push('<div class="page-break"></div>');
  html.push(`<h1 id="step6">6. ${escHtml(stepNames[5])}</h1>`);
  html.push(`<div class="step-block"><p>${escHtml(tr('dsm.step6.explanation'))}</p></div>`);
  html.push(`<div class="step-eq">${km('[K_{ff}] \\cdot \\{u_f\\} = \\{F_f\\} - [K_{fr}] \\cdot \\{u_r\\}', true)}</div>`);

  html.push(`<p style="font-size:10px"><strong>${escHtml(tr('dsm.step6.freeDof'))}:</strong> ${freeDofLabels.join(', ')} (${nFree})</p>`);
  html.push(`<p style="font-size:10px"><strong>${escHtml(tr('dsm.step6.restrainedDof'))}:</strong> ${restrDofLabels.join(', ')} (${nRestr})</p>`);

  if (nFree <= 20) {
    html.push(renderMatrix(Kff, freeDofLabels, `[K<sub>ff</sub>] — ${nFree}×${nFree}`));
  }
  if (nFree <= 20 && nRestr <= 20) {
    html.push(renderMatrix(Kfr, undefined, `[K<sub>fr</sub>] — ${nFree}×${nRestr}`));
  }

  // Prescribed displacements
  const hasPrescribed = uPrescribed.some(v => Math.abs(v) > 1e-10);
  if (hasPrescribed) {
    html.push(renderVector(uPrescribed, restrDofLabels, `{u<sub>r</sub>} — ${escHtml(tr('dsm.step6.prescribedDisp'))}`, 6));
  }

  html.push(renderVector(FfMod, freeDofLabels, `{F<sub>mod</sub>} — ${escHtml(tr('dsm.step6.loadVectorToSolve'))}`, 4));

  // ─── Step 7: Solution ───────────────────────────────────
  html.push('<div class="page-break"></div>');
  html.push(`<h1 id="step7">7. ${escHtml(stepNames[6])}</h1>`);
  html.push(`<div class="step-block"><p>${escHtml(tr('dsm.step7.explanation'))}</p></div>`);
  html.push(`<div class="step-eq">${km('\\{u_f\\} = [K_{ff}]^{-1} \\cdot \\{F_{mod}\\}', true)}</div>`);

  html.push(renderVector(uFree, freeDofLabels, `{u<sub>f</sub>} — ${escHtml(tr('dsm.step7.freeDisp')).replace('{n}', String(nFree))}`, 6));

  // Full displacement vector with max highlighted
  let maxDispIdx = 0;
  let maxDispVal = 0;
  for (let i = 0; i < uAll.length; i++) {
    if (Math.abs(uAll[i]) > maxDispVal) { maxDispVal = Math.abs(uAll[i]); maxDispIdx = i; }
  }
  html.push(renderVector(uAll, dofLabels, `{u} — ${escHtml(tr('dsm.step7.fullDisp')).replace('{n}', String(nTotal))}`, 6, new Set([maxDispIdx])));

  // ─── Step 8: Reactions ──────────────────────────────────
  html.push('<div class="page-break"></div>');
  html.push(`<h1 id="step8">8. ${escHtml(stepNames[7])}</h1>`);
  html.push(`<div class="step-block"><p>${escHtml(tr('dsm.step8.explanation'))}</p></div>`);
  html.push(`<div class="step-eq">${km('\\{R\\} = [K_{rf}] \\cdot \\{u_f\\} + [K_{rr}] \\cdot \\{u_r\\} - \\{F_r\\}', true)}</div>`);

  // Reaction vector
  const nonZeroReactions = new Set<number>();
  for (let i = 0; i < reactionsRaw.length; i++) {
    if (Math.abs(reactionsRaw[i]) > 1e-10) nonZeroReactions.add(i);
  }
  html.push(renderVector(reactionsRaw, restrDofLabels, `{R} — ${escHtml(tr('dsm.step8.reactions'))}`, 4, nonZeroReactions));

  // Reaction table
  html.push('<table style="width:auto"><tr>');
  html.push(`<th>DOF</th><th>Label</th><th>${escHtml(tr('dsm.step8.reaction'))}</th>`);
  html.push('</tr>');
  for (let i = 0; i < reactionsRaw.length; i++) {
    const v = reactionsRaw[i];
    const color = Math.abs(v) < 1e-10 ? '#999' : v > 0 ? '#0a6060' : '#a02020';
    html.push(`<tr><td>${nFree + i + 1}</td><td>${escHtml(restrDofLabels[i] ?? '')}</td><td style="color:${color}">${fmtNum(v)}</td></tr>`);
  }
  html.push('</table>');

  // ─── Step 9: Internal Forces ────────────────────────────
  html.push('<div class="page-break"></div>');
  html.push(`<h1 id="step9">9. ${escHtml(stepNames[8])}</h1>`);
  html.push(`<div class="step-block"><p>${escHtml(tr('dsm.step9.explanation'))}</p></div>`);
  html.push(`<div class="step-eq">${km('\\{f\\} = [k] \\cdot [T] \\cdot \\{u_e\\} - \\{f_{FE}\\}', true)}</div>`);

  for (const ef of elementForces) {
    const elem = elements.find(e => e.elementId === ef.elementId);
    if (!elem) continue;

    html.push(`<div class="elem-header">${escHtml(tr('dsm.step9.element'))} E${ef.elementId} (N${elem.nodeI} → N${elem.nodeJ})</div>`);

    // Force labels
    let forceLabels: string[];
    if (is3D) {
      forceLabels = elem.type === 'frame'
        ? ['N_i', 'Vy_i', 'Vz_i', 'Mx_i', 'My_i', 'Mz_i', 'N_j', 'Vy_j', 'Vz_j', 'Mx_j', 'My_j', 'Mz_j']
        : ['N_i', 'Vy_i', 'Vz_i', 'N_j', 'Vy_j', 'Vz_j'];
    } else {
      forceLabels = elem.type === 'frame'
        ? ['N_i', 'V_i', 'M_i', 'N_j', 'V_j', 'M_j']
        : ['N_i', 'V_i', 'N_j', 'V_j'];
    }

    html.push(renderVector(ef.uGlobal, elem.dofLabels, `{u<sub>e</sub>} — ${escHtml(tr('dsm.step9.globalDisp'))}`, 6));
    html.push(renderVector(ef.uLocal, undefined, `{u<sub>local</sub>} — ${escHtml(tr('dsm.step9.localDisp'))}`, 6));
    html.push(renderVector(ef.fLocalRaw, forceLabels, `[k]·[T]·{u<sub>e</sub>} — ${escHtml(tr('dsm.step9.forcesBeforeFEF'))}`, 4));

    if (ef.fixedEndForces.some(v => Math.abs(v) > 1e-10)) {
      html.push(renderVector(ef.fixedEndForces, forceLabels, `{f<sub>FE</sub>} — ${escHtml(tr('dsm.step9.fixedEndForces'))}`, 4));
    }

    html.push(renderVector(ef.fLocalFinal, forceLabels, `{f} — ${escHtml(tr('dsm.step9.finalForces'))}`, 4));

    // Summary table for final forces
    html.push('<table style="width:auto"><tr>');
    html.push(`<th>${escHtml(tr('dsm.step9.force'))}</th><th>${escHtml(tr('dsm.step9.nodeI'))}</th><th>${escHtml(tr('dsm.step9.nodeJ'))}</th>`);
    html.push('</tr>');
    const half = forceLabels.length / 2;
    const forceNames = is3D
      ? (elem.type === 'frame' ? ['N', 'Vy', 'Vz', 'Mx', 'My', 'Mz'] : ['N', 'Vy', 'Vz'])
      : (elem.type === 'frame' ? ['N', 'V', 'M'] : ['N', 'V']);
    for (let k = 0; k < half; k++) {
      const vi = ef.fLocalFinal[k];
      const vj = ef.fLocalFinal[k + half];
      const ci = Math.abs(vi) < 1e-10 ? '#999' : vi > 0 ? '#0a6060' : '#a02020';
      const cj = Math.abs(vj) < 1e-10 ? '#999' : vj > 0 ? '#0a6060' : '#a02020';
      html.push(`<tr><td class="label-cell">${forceNames[k]}</td><td style="color:${ci}">${fmtNum(vi)}</td><td style="color:${cj}">${fmtNum(vj)}</td></tr>`);
    }
    html.push('</table>');
  }

  // ─── Footer ─────────────────────────────────────────────
  html.push(`<div style="margin-top:40px;text-align:center;color:#aaa;font-size:10px">
    ${escHtml(tr('dsm.reportFooter'))}
  </div>`);

  html.push('</body></html>');
  return html.join('\n');
}

export function openDsmReport(data: DSMStepData, tr: TFunc): void {
  const htmlContent = generateDsmReportHtml(data, tr);
  const win = window.open('', '_blank');
  if (!win) return;
  win.document.write(htmlContent);
  win.document.close();
}
