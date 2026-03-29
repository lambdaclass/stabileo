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

// ─── Types ───────────────────────────────────────────────────────

export interface CalcReportConfig {
  projectName: string;
  engineerName: string;
  companyName: string;
  date: string;
  notes: string;
}

export interface CalcReportData {
  config: CalcReportConfig;
  is3D: boolean;
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

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ─── CSS ─────────────────────────────────────────────────────────

const CALC_REPORT_CSS = `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Segoe UI', system-ui, -apple-system, sans-serif; font-size: 10pt; color: #222; line-height: 1.5; padding: 0; }

  /* Print controls */
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

  /* TOC */
  .toc a { color: #1a4a7a; text-decoration: none; }
  .toc a:hover { text-decoration: underline; }
  .toc-entry { padding: 3px 0; font-size: 10pt; }

  /* Equilibrium */
  .eq-check { display: inline-block; padding: 2px 8px; border-radius: 3px; font-size: 8pt; font-weight: 600; }
  .eq-ok { background: #e6f9e6; color: #2a7a2a; }
  .eq-warn { background: #fff3cd; color: #856404; }
`;

// ─── Table of Contents ───────────────────────────────────────────

function buildTOC(sections: Array<{ num: string; title: string; anchor: string }>): string {
  const h: string[] = ['<div class="page"><h1>Table of Contents</h1>'];
  for (const s of sections) {
    h.push(`<div class="toc-entry"><a href="#${s.anchor}">${esc(s.num)}. ${esc(s.title)}</a></div>`);
  }
  h.push('</div><div class="page-break"></div>');
  return h.join('\n');
}

// ─── Section: Cover ──────────────────────────────────────────────

function buildCover(cfg: CalcReportConfig, is3D: boolean, nodeCount: number, elemCount: number): string {
  const h: string[] = ['<div class="page cover">'];
  if (cfg.companyName) h.push(`<div style="font-size:11pt;color:#555;letter-spacing:2px;text-transform:uppercase;margin-bottom:24px">${esc(cfg.companyName)}</div>`);
  h.push(`<h1 style="border:none;font-size:24pt">${esc(cfg.projectName || 'Structural Analysis')}</h1>`);
  h.push(`<div class="subtitle">Structural Calculation Report</div>`);
  h.push(`<div class="subtitle">${is3D ? '3D' : '2D'} Analysis &mdash; ${nodeCount} nodes, ${elemCount} elements</div>`);
  h.push('<div class="meta">');
  if (cfg.engineerName) h.push(`<div>Engineer: ${esc(cfg.engineerName)}</div>`);
  h.push(`<div>Date: ${esc(cfg.date)}</div>`);
  h.push('</div>');
  h.push('<div class="footer">Generated by Stabileo &mdash; stabileo.com</div>');
  h.push('</div><div class="page-break"></div>');
  return h.join('\n');
}

// ─── Section: Model Data ─────────────────────────────────────────

function buildModelSection(data: CalcReportData): string {
  const h: string[] = ['<div class="page">'];
  h.push('<h1 id="sec-model">1. Model Data</h1>');

  // 1.1 Materials
  h.push(`<h2>1.1 Materials (${data.materials.length})</h2>`);
  h.push('<table><tr><th>ID</th><th>Name</th><th>E (MPa)</th><th>&nu;</th><th>&rho; (kN/m³)</th><th>fy (MPa)</th></tr>');
  for (const m of data.materials) {
    h.push(`<tr><td>${m.id}</td><td>${esc(m.name)}</td><td class="num">${fmt(m.e, 0)}</td><td class="num">${fmt(m.nu ?? 0.3, 2)}</td><td class="num">${fmt(m.rho ?? 0, 1)}</td><td class="num">${fmt(m.fy ?? 0, 0)}</td></tr>`);
  }
  h.push('</table>');

  // 1.2 Sections
  h.push(`<h2>1.2 Sections (${data.sections.length})</h2>`);
  h.push('<table><tr><th>ID</th><th>Name</th><th>A (m²)</th><th>Iy (m⁴)</th><th>Iz (m⁴)</th><th>J (m⁴)</th></tr>');
  for (const s of data.sections) {
    h.push(`<tr><td>${s.id}</td><td>${esc(s.name)}</td><td class="num">${fmt(s.a, 5)}</td><td class="num">${fmt(s.iy ?? 0, 8)}</td><td class="num">${fmt(s.iz ?? s.iy ?? 0, 8)}</td><td class="num">${fmt(s.j ?? 0, 8)}</td></tr>`);
  }
  h.push('</table>');

  // 1.3 Nodes
  const nodeCount = data.nodes.length;
  const condensed = nodeCount > 50;
  h.push(`<h2>1.3 Nodes (${nodeCount})</h2>`);
  if (data.is3D) {
    h.push('<table><tr><th>ID</th><th>X (m)</th><th>Y (m)</th><th>Z (m)</th></tr>');
  } else {
    h.push('<table><tr><th>ID</th><th>X (m)</th><th>Y (m)</th></tr>');
  }
  const showNodes = condensed ? [...data.nodes.slice(0, 20), null, ...data.nodes.slice(-5)] : data.nodes;
  for (const n of showNodes) {
    if (!n) { h.push(`<tr><td colspan="${data.is3D ? 4 : 3}" style="text-align:center;color:#888">... ${nodeCount - 25} more nodes ...</td></tr>`); continue; }
    if (data.is3D) {
      h.push(`<tr><td>${n.id}</td><td class="num">${fmt(n.x, 3)}</td><td class="num">${fmt(n.y, 3)}</td><td class="num">${fmt(n.z ?? 0, 3)}</td></tr>`);
    } else {
      h.push(`<tr><td>${n.id}</td><td class="num">${fmt(n.x, 3)}</td><td class="num">${fmt(n.y, 3)}</td></tr>`);
    }
  }
  h.push('</table>');
  if (condensed) h.push(`<p class="table-note">Showing 25 of ${nodeCount} nodes. Full data available in Excel export.</p>`);

  // 1.4 Elements
  const elemCount = data.elements.length;
  const elemCondensed = elemCount > 50;
  h.push(`<h2>1.4 Elements (${elemCount})</h2>`);
  h.push('<table><tr><th>ID</th><th>Type</th><th>Node I</th><th>Node J</th><th>Material</th><th>Section</th><th>Hinges</th></tr>');
  const showElems = elemCondensed ? [...data.elements.slice(0, 20), null, ...data.elements.slice(-5)] : data.elements;
  for (const e of showElems) {
    if (!e) { h.push(`<tr><td colspan="7" style="text-align:center;color:#888">... ${elemCount - 25} more elements ...</td></tr>`); continue; }
    const hinges = (e.hingeStart ? 'I' : '') + (e.hingeEnd ? 'J' : '') || '—';
    h.push(`<tr><td>${e.id}</td><td>${e.type}</td><td>${e.nodeI}</td><td>${e.nodeJ}</td><td>${e.materialId}</td><td>${e.sectionId}</td><td>${hinges}</td></tr>`);
  }
  h.push('</table>');
  if (elemCondensed) h.push(`<p class="table-note">Showing 25 of ${elemCount} elements.</p>`);

  // 1.5 Supports
  h.push(`<h2>1.5 Supports (${data.supports.length})</h2>`);
  h.push('<table><tr><th>ID</th><th>Node</th><th>Type</th></tr>');
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
  h.push('<h1 id="sec-loads">2. Loads</h1>');

  // 2.1 Load Cases
  if (data.loadCases.length > 0) {
    h.push(`<h2>2.1 Load Cases (${data.loadCases.length})</h2>`);
    h.push('<table><tr><th>ID</th><th>Type</th><th>Name</th></tr>');
    for (const lc of data.loadCases) {
      h.push(`<tr><td>${lc.id}</td><td>${esc(lc.type)}</td><td>${esc(lc.name)}</td></tr>`);
    }
    h.push('</table>');
  }

  // 2.2 Combinations
  if (data.combinations.length > 0) {
    h.push(`<h2>2.2 Load Combinations (${data.combinations.length})</h2>`);
    h.push('<table><tr><th>ID</th><th>Name</th><th>Factors</th></tr>');
    for (const c of data.combinations) {
      const factors = c.factors.map(f => `${fmt(f.factor, 2)}×${esc(f.caseName)}`).join(' + ');
      h.push(`<tr><td>${c.id}</td><td>${esc(c.name)}</td><td>${factors}</td></tr>`);
    }
    h.push('</table>');
  }

  // 2.3 Applied loads
  h.push(`<h2>2.3 Applied Loads (${data.loads.length})</h2>`);
  if (data.loads.length > 0) {
    h.push('<table><tr><th>#</th><th>Type</th><th>Description</th><th>Case</th></tr>');
    const showLoads = data.loads.length > 40 ? [...data.loads.slice(0, 30), null, ...data.loads.slice(-5)] : data.loads;
    let idx = 0;
    for (const l of showLoads) {
      idx++;
      if (!l) { h.push(`<tr><td colspan="4" style="text-align:center;color:#888">... ${data.loads.length - 35} more loads ...</td></tr>`); continue; }
      h.push(`<tr><td>${idx}</td><td>${esc(l.type)}</td><td>${esc(l.description)}</td><td>${esc(l.caseLabel ?? '—')}</td></tr>`);
    }
    h.push('</table>');
  } else {
    h.push('<p>No applied loads.</p>');
  }

  h.push('</div><div class="page-break"></div>');
  return h.join('\n');
}

// ─── Section: Reactions ──────────────────────────────────────────

function buildReactionsSection(data: CalcReportData): string {
  const h: string[] = ['<div class="page">'];
  h.push('<h1 id="sec-reactions">3. Support Reactions</h1>');

  if (data.is3D && data.results3D) {
    const reactions = data.results3D.reactions;
    h.push('<table><tr><th>Node</th><th>Fx (kN)</th><th>Fy (kN)</th><th>Fz (kN)</th><th>Mx (kN·m)</th><th>My (kN·m)</th><th>Mz (kN·m)</th></tr>');
    let sumFx = 0, sumFy = 0, sumFz = 0;
    for (const r of reactions) {
      h.push(`<tr><td>${r.nodeId}</td><td class="num">${fmt(r.fx)}</td><td class="num">${fmt(r.fy)}</td><td class="num">${fmt(r.fz)}</td><td class="num">${fmt(r.mx)}</td><td class="num">${fmt(r.my)}</td><td class="num">${fmt(r.mz)}</td></tr>`);
      sumFx += r.fx; sumFy += r.fy; sumFz += r.fz;
    }
    h.push(`<tr style="font-weight:700;border-top:2px solid #333"><td>ΣF</td><td class="num">${fmt(sumFx)}</td><td class="num">${fmt(sumFy)}</td><td class="num">${fmt(sumFz)}</td><td colspan="3"></td></tr>`);
    h.push('</table>');
    const eqOk = Math.abs(sumFx) < 0.1 && Math.abs(sumFy) < 0.1 && Math.abs(sumFz) < 0.1;
    h.push(`<p>Equilibrium check: <span class="eq-check ${eqOk ? 'eq-ok' : 'eq-warn'}">${eqOk ? '✓ OK' : '⚠ Review'}</span></p>`);
  } else if (data.results2D) {
    const reactions = data.results2D.reactions;
    h.push('<table><tr><th>Node</th><th>Rx (kN)</th><th>Rz (kN)</th><th>My (kN·m)</th></tr>');
    let sumRx = 0, sumRz = 0;
    for (const r of reactions) {
      h.push(`<tr><td>${r.nodeId}</td><td class="num">${fmt(r.rx)}</td><td class="num">${fmt(r.rz)}</td><td class="num">${fmt(r.my)}</td></tr>`);
      sumRx += r.rx; sumRz += r.rz;
    }
    h.push(`<tr style="font-weight:700;border-top:2px solid #333"><td>ΣR</td><td class="num">${fmt(sumRx)}</td><td class="num">${fmt(sumRz)}</td><td></td></tr>`);
    h.push('</table>');
    const eqOk = Math.abs(sumRx) < 0.1 && Math.abs(sumRz) < 0.1;
    h.push(`<p>Equilibrium check: <span class="eq-check ${eqOk ? 'eq-ok' : 'eq-warn'}">${eqOk ? '✓ OK' : '⚠ Review'}</span></p>`);
  }

  h.push('</div><div class="page-break"></div>');
  return h.join('\n');
}

// ─── Section: Displacements ──────────────────────────────────────

function buildDisplacementsSection(data: CalcReportData): string {
  const h: string[] = ['<div class="page">'];
  h.push('<h1 id="sec-displacements">4. Displacements</h1>');

  if (data.is3D && data.results3D) {
    const disps = data.results3D.displacements;
    // Summary
    let maxMag = 0, maxNodeId = 0;
    for (const d of disps) {
      const mag = Math.sqrt(d.ux ** 2 + d.uy ** 2 + d.uz ** 2);
      if (mag > maxMag) { maxMag = mag; maxNodeId = d.nodeId; }
    }
    h.push(`<div class="summary-box"><div class="label">Maximum displacement</div><div class="value">${fmt(maxMag * 1000, 3)} mm</div><div class="label">at node ${maxNodeId}</div></div>`);

    h.push('<table><tr><th>Node</th><th>ux (mm)</th><th>uy (mm)</th><th>uz (mm)</th><th>|u| (mm)</th></tr>');
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
      h.push(`<tr${isMax ? ' class="governing"' : ''}><td>${d.nodeId}</td><td class="num">${fmt(d.ux * 1000, 3)}</td><td class="num">${fmt(d.uy * 1000, 3)}</td><td class="num">${fmt(d.uz * 1000, 3)}</td><td class="num">${fmt(mag * 1000, 3)}</td></tr>`);
    }
    h.push('</table>');
    if (condensed) h.push(`<p class="table-note">Showing top 20 of ${disps.length} nodes by displacement magnitude.</p>`);
  } else if (data.results2D) {
    const disps = data.results2D.displacements;
    let maxMag = 0, maxNodeId = 0;
    for (const d of disps) {
      const mag = Math.sqrt(d.ux ** 2 + (d.uz ?? d.uy ?? 0) ** 2);
      if (mag > maxMag) { maxMag = mag; maxNodeId = d.nodeId; }
    }
    h.push(`<div class="summary-box"><div class="label">Maximum displacement</div><div class="value">${fmt(maxMag * 1000, 3)} mm</div><div class="label">at node ${maxNodeId}</div></div>`);

    h.push('<table><tr><th>Node</th><th>ux (mm)</th><th>uz (mm)</th><th>θy (rad)</th><th>|u| (mm)</th></tr>');
    for (const d of disps) {
      const uz = d.uz ?? d.uy ?? 0;
      const mag = Math.sqrt(d.ux ** 2 + uz ** 2);
      const isMax = d.nodeId === maxNodeId;
      h.push(`<tr${isMax ? ' class="governing"' : ''}><td>${d.nodeId}</td><td class="num">${fmt(d.ux * 1000, 3)}</td><td class="num">${fmt(uz * 1000, 3)}</td><td class="num">${fmt(d.ry ?? d.rz ?? 0, 6)}</td><td class="num">${fmt(mag * 1000, 3)}</td></tr>`);
    }
    h.push('</table>');
  }

  h.push('</div><div class="page-break"></div>');
  return h.join('\n');
}

// ─── Section: Internal Forces ────────────────────────────────────

function buildForcesSection(data: CalcReportData): string {
  const h: string[] = ['<div class="page">'];
  h.push('<h1 id="sec-forces">5. Internal Forces</h1>');

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

    h.push('<h2>5.1 Force Summary</h2>');
    h.push('<table><tr><th>Quantity</th><th>Max |Value|</th><th>Unit</th></tr>');
    h.push(`<tr><td>Axial (N)</td><td class="num">${fmt(maxN)}</td><td>kN</td></tr>`);
    h.push(`<tr><td>Shear Y (Vy)</td><td class="num">${fmt(maxVy)}</td><td>kN</td></tr>`);
    h.push(`<tr><td>Shear Z (Vz)</td><td class="num">${fmt(maxVz)}</td><td>kN</td></tr>`);
    h.push(`<tr><td>Torsion (Mx)</td><td class="num">${fmt(maxMx)}</td><td>kN·m</td></tr>`);
    h.push(`<tr><td>Moment Y (My)</td><td class="num">${fmt(maxMy)}</td><td>kN·m</td></tr>`);
    h.push(`<tr><td>Moment Z (Mz)</td><td class="num">${fmt(maxMz)}</td><td>kN·m</td></tr>`);
    h.push('</table>');

    // Per-element table
    h.push('<h2>5.2 Element End Forces</h2>');
    const condensed = forces.length > 40;
    h.push('<table style="font-size:7.5pt"><tr><th>Elem</th><th>End</th><th>N (kN)</th><th>Vy (kN)</th><th>Vz (kN)</th><th>Mx (kN·m)</th><th>My (kN·m)</th><th>Mz (kN·m)</th></tr>');
    const showForces = condensed ? forces.slice(0, 30) : forces;
    for (const ef of showForces) {
      h.push(`<tr><td rowspan="2">${ef.elementId}</td><td>I</td><td class="num">${fmt(ef.nStart)}</td><td class="num">${fmt(ef.vyStart)}</td><td class="num">${fmt(ef.vzStart)}</td><td class="num">${fmt(ef.mxStart)}</td><td class="num">${fmt(ef.myStart)}</td><td class="num">${fmt(ef.mzStart)}</td></tr>`);
      h.push(`<tr><td>J</td><td class="num">${fmt(ef.nEnd)}</td><td class="num">${fmt(ef.vyEnd)}</td><td class="num">${fmt(ef.vzEnd)}</td><td class="num">${fmt(ef.mxEnd)}</td><td class="num">${fmt(ef.myEnd)}</td><td class="num">${fmt(ef.mzEnd)}</td></tr>`);
    }
    h.push('</table>');
    if (condensed) h.push(`<p class="table-note">Showing 30 of ${forces.length} elements. Full data available in Excel export.</p>`);
  } else if (data.results2D) {
    const forces = data.results2D.elementForces;
    let maxN = 0, maxV = 0, maxM = 0;
    for (const ef of forces) {
      maxN = Math.max(maxN, Math.abs(ef.nStart), Math.abs(ef.nEnd));
      maxV = Math.max(maxV, Math.abs(ef.vStart), Math.abs(ef.vEnd));
      maxM = Math.max(maxM, Math.abs(ef.mStart), Math.abs(ef.mEnd));
    }

    h.push('<h2>5.1 Force Summary</h2>');
    h.push('<table><tr><th>Quantity</th><th>Max |Value|</th><th>Unit</th></tr>');
    h.push(`<tr><td>Axial (N)</td><td class="num">${fmt(maxN)}</td><td>kN</td></tr>`);
    h.push(`<tr><td>Shear (V)</td><td class="num">${fmt(maxV)}</td><td>kN</td></tr>`);
    h.push(`<tr><td>Moment (M)</td><td class="num">${fmt(maxM)}</td><td>kN·m</td></tr>`);
    h.push('</table>');

    h.push('<h2>5.2 Element End Forces</h2>');
    h.push('<table><tr><th>Elem</th><th>End</th><th>N (kN)</th><th>V (kN)</th><th>M (kN·m)</th></tr>');
    for (const ef of forces) {
      h.push(`<tr><td rowspan="2">${ef.elementId}</td><td>I</td><td class="num">${fmt(ef.nStart)}</td><td class="num">${fmt(ef.vStart)}</td><td class="num">${fmt(ef.mStart)}</td></tr>`);
      h.push(`<tr><td>J</td><td class="num">${fmt(ef.nEnd)}</td><td class="num">${fmt(ef.vEnd)}</td><td class="num">${fmt(ef.mEnd)}</td></tr>`);
    }
    h.push('</table>');
  }

  h.push('</div>');
  return h.join('\n');
}

// ─── Main generator ──────────────────────────────────────────────

export function generateCalcReportHtml(data: CalcReportData): string {
  const sections = [
    { num: '1', title: 'Model Data', anchor: 'sec-model' },
    { num: '2', title: 'Loads', anchor: 'sec-loads' },
    { num: '3', title: 'Support Reactions', anchor: 'sec-reactions' },
    { num: '4', title: 'Displacements', anchor: 'sec-displacements' },
    { num: '5', title: 'Internal Forces', anchor: 'sec-forces' },
  ];

  const html: string[] = [];
  html.push(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${esc(data.config.projectName || 'Structural Calculation Report')} — Stabileo</title>
<style>${CALC_REPORT_CSS}</style>
</head>
<body>
<button class="print-btn no-print" onclick="window.print()">Print / PDF</button>
`);

  html.push(buildCover(data.config, data.is3D, data.nodes.length, data.elements.length));
  html.push(buildTOC(sections));
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
