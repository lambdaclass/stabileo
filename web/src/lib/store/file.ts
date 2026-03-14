// File operations: save/load projects, export results, autosave

import { modelStore } from './model.svelte';
import { resultsStore } from './results.svelte';
import { historyStore } from './history.svelte';
import { uiStore } from './ui.svelte';
import type { ModelSnapshot } from './history.svelte';
import { exportToExcel } from '../export/excel';
import { tabManager } from './tabs.svelte';
import type { TabState } from './tabs.svelte';
import { t } from '../i18n';

// ─── File Format ────────────────────────────────────────────────

export interface DedalFile {
  version: '1.0';
  name: string;
  timestamp: string;
  snapshot: ModelSnapshot;
}

export interface DedalSessionFile {
  version: '1.0';
  type: 'session';
  timestamp: string;
  activeTabId: string;
  tabs: TabState[];
}

// ─── Download Helpers ───────────────────────────────────────────

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function downloadText(content: string, filename: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  downloadBlob(blob, filename);
}

// ─── Serialize / Deserialize ────────────────────────────────────

export function serializeProject(): string {
  const data: DedalFile = {
    version: '1.0',
    name: modelStore.model.name,
    timestamp: new Date().toISOString(),
    snapshot: modelStore.snapshot(),
  };
  return JSON.stringify(data, null, 2);
}

function validateDedalFile(data: unknown): data is DedalFile {
  if (!data || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;

  if (typeof d.version !== 'string') return false;
  if (typeof d.name !== 'string') return false;

  const s = d.snapshot as Record<string, unknown> | undefined;
  if (!s) return false;
  if (!Array.isArray(s.nodes)) return false;
  if (!Array.isArray(s.elements)) return false;
  if (!Array.isArray(s.materials)) return false;
  if (!Array.isArray(s.sections)) return false;
  if (!Array.isArray(s.supports)) return false;
  if (!Array.isArray(s.loads)) return false;

  const nextId = s.nextId as Record<string, unknown> | undefined;
  if (!nextId || typeof nextId.node !== 'number') return false;

  // Verify referential integrity: element nodes exist
  const nodeIds = new Set((s.nodes as Array<[number, unknown]>).map(([id]) => id));
  for (const [, elem] of s.elements as Array<[number, { nodeI: number; nodeJ: number }]>) {
    if (!nodeIds.has(elem.nodeI) || !nodeIds.has(elem.nodeJ)) {
      return false;
    }
  }

  return true;
}

// ─── Save / Load ────────────────────────────────────────────────

export function saveProject(): void {
  const json = serializeProject();
  const safeName = modelStore.model.name.replace(/[^a-zA-Z0-9áéíóúñÁÉÍÓÚÑ _-]/g, '').trim() || t('file.defaultProject');
  downloadText(json, `${safeName}.ded`, 'application/json');
}

export async function loadProject(file: File): Promise<void> {
  const text = await file.text();
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(t('file.invalidJson'));
  }

  if (!validateDedalFile(data)) {
    throw new Error(t('file.invalidFormat'));
  }

  historyStore.pushState();
  modelStore.restore(data.snapshot);
  modelStore.model.name = data.name;
  resultsStore.clear();
}

// ─── Session Save / Load (all tabs) ─────────────────────────────

export function saveSession(): void {
  // Ensure the active tab is up-to-date before serializing
  tabManager.syncCurrentTab();
  const session: DedalSessionFile = {
    version: '1.0',
    type: 'session',
    timestamp: new Date().toISOString(),
    activeTabId: tabManager.activeTabId ?? '',
    tabs: $state.snapshot(tabManager.tabs),
  };
  const json = JSON.stringify(session, null, 2);
  const tabCount = session.tabs.length;
  downloadText(json, `${t('file.session')}-${tabCount}-${t('file.tabs')}.ded`, 'application/json');
}

function isSessionFile(data: unknown): data is DedalSessionFile {
  if (!data || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;
  return d.type === 'session' && Array.isArray(d.tabs);
}

/** Load a .ded file — auto-detects single tab vs full session */
export async function loadFile(file: File): Promise<{ type: 'tab' | 'session'; count: number }> {
  const text = await file.text();
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(t('file.invalidJson'));
  }

  if (isSessionFile(data)) {
    // Session file: restore all tabs
    tabManager.restoreSession(data.tabs, data.activeTabId);
    return { type: 'session', count: data.tabs.length };
  } else if (validateDedalFile(data)) {
    // Single tab file: load into current tab
    historyStore.pushState();
    modelStore.restore(data.snapshot);
    modelStore.model.name = data.name;
    resultsStore.clear();
    return { type: 'tab', count: 1 };
  } else {
    throw new Error(t('file.invalidFormat'));
  }
}

// ─── Export Results CSV ─────────────────────────────────────────

export function exportResultsCSV(): string {
  const is3D = uiStore.analysisMode === '3d';
  const r3d = resultsStore.results3D;
  const r2d = resultsStore.results;

  if (!r3d && !r2d) return '';

  const lines: string[] = [];
  lines.push(`# Dedaliano — ${t('file.csvResults')} ${is3D ? '3D' : '2D'}`);
  lines.push(`# ${t('file.csvProject')}: ${modelStore.model.name}`);
  lines.push(`# ${t('file.csvDate')}: ${new Date().toLocaleString()}`);
  lines.push('');

  if (is3D && r3d) {
    // 3D Displacements
    lines.push(`# ${t('file.displacements')}`);
    lines.push(`${t('file.node')},ux (m),uy (m),uz (m),rx (rad),ry (rad),rz (rad)`);
    for (const d of r3d.displacements) {
      lines.push(`${d.nodeId},${d.ux.toExponential(6)},${d.uy.toExponential(6)},${d.uz.toExponential(6)},${d.rx.toExponential(6)},${d.ry.toExponential(6)},${d.rz.toExponential(6)}`);
    }
    lines.push('');

    // 3D Reactions
    lines.push(`# ${t('file.reactions')}`);
    lines.push(`${t('file.node')},Fx (kN),Fy (kN),Fz (kN),Mx (kN·m),My (kN·m),Mz (kN·m)`);
    for (const r of r3d.reactions) {
      lines.push(`${r.nodeId},${r.fx.toFixed(4)},${r.fy.toFixed(4)},${r.fz.toFixed(4)},${(-r.mx).toFixed(4)},${(-r.my).toFixed(4)},${(-r.mz).toFixed(4)}`);
    }
    lines.push('');

    // 3D Element forces
    lines.push(`# ${t('file.internalForces')}`);
    lines.push(`${t('file.element')},L (m),Ni,Nj,Vyi,Vyj,Vzi,Vzj,Mxi,Mxj,Myi,Myj,Mzi,Mzj`);
    for (const f of r3d.elementForces) {
      lines.push(`${f.elementId},${f.length.toFixed(4)},${f.nStart.toFixed(4)},${f.nEnd.toFixed(4)},${f.vyStart.toFixed(4)},${f.vyEnd.toFixed(4)},${f.vzStart.toFixed(4)},${f.vzEnd.toFixed(4)},${(-f.mxStart).toFixed(4)},${(-f.mxEnd).toFixed(4)},${(-f.myStart).toFixed(4)},${(-f.myEnd).toFixed(4)},${(-f.mzStart).toFixed(4)},${(-f.mzEnd).toFixed(4)}`);
    }
  } else if (r2d) {
    // 2D Displacements
    lines.push(`# ${t('file.displacements')}`);
    lines.push(`${t('file.node')},ux (m),uy (m),rz (rad)`);
    for (const d of r2d.displacements) {
      lines.push(`${d.nodeId},${d.ux.toExponential(6)},${d.uy.toExponential(6)},${d.rz.toExponential(6)}`);
    }
    lines.push('');

    // 2D Reactions
    lines.push(`# ${t('file.reactions')}`);
    lines.push(`${t('file.node')},Rx (kN),Ry (kN),Mz (kN·m)`);
    for (const r of r2d.reactions) {
      lines.push(`${r.nodeId},${r.rx.toFixed(4)},${r.ry.toFixed(4)},${(-r.mz).toFixed(4)}`);
    }
    lines.push('');

    // 2D Element forces
    lines.push(`# ${t('file.internalForces')}`);
    lines.push(`${t('file.element')},N_i (kN),N_j (kN),V_i (kN),V_j (kN),M_i (kN·m),M_j (kN·m),L (m),qI (kN/m),qJ (kN/m)`);
    for (const f of r2d.elementForces) {
      lines.push(`${f.elementId},${f.nStart.toFixed(4)},${f.nEnd.toFixed(4)},${f.vStart.toFixed(4)},${f.vEnd.toFixed(4)},${(-f.mStart).toFixed(4)},${(-f.mEnd).toFixed(4)},${f.length.toFixed(4)},${f.qI.toFixed(4)},${f.qJ.toFixed(4)}`);
    }
  }

  return lines.join('\n');
}

export function downloadResultsCSV(): void {
  const csv = exportResultsCSV();
  if (!csv) return;
  const safeName = modelStore.model.name.replace(/[^a-zA-Z0-9áéíóúñÁÉÍÓÚÑ _-]/g, '').trim() || t('file.defaultResults');
  downloadText(csv, `${safeName}_${t('file.defaultResults')}.csv`, 'text/csv');
}

// ─── Export PNG ─────────────────────────────────────────────────

export function downloadCanvasPNG(canvas: HTMLCanvasElement): void {
  canvas.toBlob((blob) => {
    if (!blob) return;
    const safeName = modelStore.model.name.replace(/[^a-zA-Z0-9áéíóúñÁÉÍÓÚÑ _-]/g, '').trim() || t('file.defaultStructure');
    downloadBlob(blob, `${safeName}.png`);
  }, 'image/png');
}

// ─── Export DXF ─────────────────────────────────────────────────

import { exportDxfWithResults } from '../dxf/writer';

export function exportDXF(): string {
  return exportDxfWithResults({
    includeResults: !!resultsStore.results,
    diagramScale: resultsStore.diagramScale,
    deformedScale: resultsStore.deformedScale,
    includeValues: true,
    includeSummary: true,
  });
}

export function downloadDXF(): void {
  const dxf = exportDXF();
  const safeName = modelStore.model.name.replace(/[^a-zA-Z0-9áéíóúñÁÉÍÓÚÑ _-]/g, '').trim() || t('file.defaultStructure');
  downloadText(dxf, `${safeName}.dxf`, 'application/dxf');
}

// ─── Export SVG ─────────────────────────────────────────────────

export function exportSVG(): string {
  // Compute bounding box
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [, node] of modelStore.nodes) {
    if (node.x < minX) minX = node.x;
    if (node.x > maxX) maxX = node.x;
    if (node.y < minY) minY = node.y;
    if (node.y > maxY) maxY = node.y;
  }
  if (!isFinite(minX)) return '';

  const pad = 1; // 1m padding
  minX -= pad; maxX += pad; minY -= pad; maxY += pad;
  const worldW = maxX - minX;
  const worldH = maxY - minY;
  const scale = 100; // px per meter
  const svgW = worldW * scale;
  const svgH = worldH * scale;

  // Transform: world → SVG (flip Y)
  const tx = (wx: number) => (wx - minX) * scale;
  const ty = (wy: number) => (maxY - wy) * scale;

  const parts: string[] = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${svgW.toFixed(0)}" height="${svgH.toFixed(0)}" viewBox="0 0 ${svgW.toFixed(0)} ${svgH.toFixed(0)}">`);
  parts.push(`<rect width="100%" height="100%" fill="white"/>`);

  // Elements
  parts.push(`<g stroke="#333" stroke-width="2" fill="none">`);
  for (const [, elem] of modelStore.elements) {
    const ni = modelStore.getNode(elem.nodeI);
    const nj = modelStore.getNode(elem.nodeJ);
    if (!ni || !nj) continue;
    const dashAttr = elem.type === 'truss' ? ' stroke-dasharray="8,4"' : '';
    parts.push(`  <line x1="${tx(ni.x).toFixed(1)}" y1="${ty(ni.y).toFixed(1)}" x2="${tx(nj.x).toFixed(1)}" y2="${ty(nj.y).toFixed(1)}"${dashAttr}/>`);
  }
  parts.push('</g>');

  // Nodes
  parts.push(`<g fill="#4ecdc4" stroke="none">`);
  for (const [, node] of modelStore.nodes) {
    parts.push(`  <circle cx="${tx(node.x).toFixed(1)}" cy="${ty(node.y).toFixed(1)}" r="4"/>`);
  }
  parts.push('</g>');

  // Node labels
  parts.push(`<g fill="#666" font-size="11" font-family="sans-serif" text-anchor="start">`);
  for (const [, node] of modelStore.nodes) {
    parts.push(`  <text x="${(tx(node.x) + 6).toFixed(1)}" y="${(ty(node.y) - 6).toFixed(1)}">${node.id}</text>`);
  }
  parts.push('</g>');

  // Supports
  const supSize = 12;
  parts.push(`<g stroke="#ff8800" stroke-width="2" fill="none">`);
  for (const [, sup] of modelStore.supports) {
    const node = modelStore.getNode(sup.nodeId);
    if (!node) continue;
    const sx = tx(node.x);
    const sy = ty(node.y);
    if (sup.type === 'fixed') {
      parts.push(`  <rect x="${(sx - supSize).toFixed(1)}" y="${sy.toFixed(1)}" width="${(supSize * 2).toFixed(0)}" height="${(supSize / 2).toFixed(0)}" fill="#ff8800" opacity="0.3"/>`);
      for (let i = -supSize; i <= supSize; i += 6) {
        parts.push(`  <line x1="${(sx + i).toFixed(1)}" y1="${(sy + supSize / 2).toFixed(1)}" x2="${(sx + i - 5).toFixed(1)}" y2="${(sy + supSize).toFixed(1)}"/>`);
      }
    } else if (sup.type === 'pinned') {
      parts.push(`  <polygon points="${sx.toFixed(1)},${sy.toFixed(1)} ${(sx - supSize).toFixed(1)},${(sy + supSize).toFixed(1)} ${(sx + supSize).toFixed(1)},${(sy + supSize).toFixed(1)}"/>`);
    } else if (sup.type === 'rollerX' || sup.type === 'rollerY') {
      // Compute visual angle
      const baseAngleDeg = sup.type === 'rollerX' ? 0 : 90;
      let angleDeg = baseAngleDeg;
      if (sup.isGlobal === false) {
        const elemAngle = modelStore.getElementAngleAtNode(sup.nodeId);
        angleDeg = (elemAngle * 180 / Math.PI) + baseAngleDeg;
      }
      angleDeg += (sup.angle ?? 0);
      // Draw rotated roller with 2 circles
      const s2 = supSize * 0.5;
      const triH = supSize * 0.7;
      const cr = 3;
      const cy2 = triH + cr + 1;
      const groundY = cy2 + cr + 1;
      parts.push(`  <g transform="translate(${sx.toFixed(1)},${sy.toFixed(1)}) rotate(${angleDeg.toFixed(1)})">`);
      parts.push(`    <polygon points="0,0 ${(-s2).toFixed(1)},${triH.toFixed(1)} ${s2.toFixed(1)},${triH.toFixed(1)}"/>`);
      parts.push(`    <circle cx="-4" cy="${cy2.toFixed(1)}" r="${cr}"/>`);
      parts.push(`    <circle cx="4" cy="${cy2.toFixed(1)}" r="${cr}"/>`);
      parts.push(`    <line x1="${(-supSize).toFixed(1)}" y1="${groundY.toFixed(1)}" x2="${supSize.toFixed(1)}" y2="${groundY.toFixed(1)}"/>`);
      parts.push(`  </g>`);
    } else if (sup.type === 'spring') {
      // Simple zigzag
      let path = `M${sx.toFixed(1)},${sy.toFixed(1)}`;
      const h = supSize * 1.5;
      const w = supSize * 0.6;
      const nCoils = 4;
      for (let i = 0; i < nCoils; i++) {
        const y1 = sy + 3 + (i + 0.25) / nCoils * h;
        const y2 = sy + 3 + (i + 0.75) / nCoils * h;
        path += ` L${(sx + w).toFixed(1)},${y1.toFixed(1)} L${(sx - w).toFixed(1)},${y2.toFixed(1)}`;
      }
      path += ` L${sx.toFixed(1)},${(sy + 3 + h).toFixed(1)}`;
      parts.push(`  <path d="${path}" stroke="#44bb88"/>`);
      parts.push(`  <line x1="${(sx - supSize).toFixed(1)}" y1="${(sy + 3 + h + 3).toFixed(1)}" x2="${(sx + supSize).toFixed(1)}" y2="${(sy + 3 + h + 3).toFixed(1)}" stroke="#44bb88"/>`);
    }
  }
  parts.push('</g>');

  // Title
  parts.push(`<text x="10" y="20" fill="#333" font-size="14" font-family="sans-serif">${escapeXml(modelStore.model.name)}</text>`);

  parts.push('</svg>');
  return parts.join('\n');
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function downloadSVG(): void {
  const svg = exportSVG();
  if (!svg) return;
  const safeName = modelStore.model.name.replace(/[^a-zA-Z0-9áéíóúñÁÉÍÓÚÑ _-]/g, '').trim() || t('file.defaultStructure');
  downloadText(svg, `${safeName}.svg`, 'image/svg+xml');
}

// ─── Export Excel ────────────────────────────────────────────────

export function downloadExcel(): void {
  const safeName = modelStore.model.name.replace(/[^a-zA-Z0-9áéíóúñÁÉÍÓÚÑ _-]/g, '').trim() || t('file.defaultAnalysis');
  exportToExcel({ filename: `${safeName}.xlsx` });
}

// ─── PDF Report ─────────────────────────────────────────────────

function fmtNum(v: number, dec = 4): string {
  if (Math.abs(v) < 1e-10) return '0';
  if (Math.abs(v) >= 1000 || Math.abs(v) < 0.01) return v.toExponential(3);
  return v.toFixed(dec);
}

function supportLabel(type: string): string {
  switch (type) {
    case 'fixed': return t('file.supportFixed');
    case 'pinned': return t('file.supportPinned');
    case 'rollerX': return t('file.supportRollerX');
    case 'rollerY': return t('file.supportRollerY');
    case 'spring': return t('file.supportSpring');
    default: return type;
  }
}

export function generateReportHTML(): string {
  const m = modelStore;
  const r = resultsStore.results;
  const name = escapeXml(m.model.name);
  const date = new Date().toLocaleString();

  // Get SVG of the structure
  const svg = exportSVG();

  let html = `<!DOCTYPE html>
<html lang="${t('file.htmlLang')}">
<head>
<meta charset="UTF-8">
<title>${t('file.report')} — ${name}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; font-size: 11px; color: #222; padding: 20mm 15mm; }
  h1 { font-size: 20px; margin-bottom: 4px; color: #1a1a2e; }
  h2 { font-size: 14px; margin: 16px 0 6px; color: #1a1a2e; border-bottom: 2px solid #e94560; padding-bottom: 2px; }
  h3 { font-size: 12px; margin: 10px 0 4px; color: #333; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px; }
  .header-info { color: #666; font-size: 10px; text-align: right; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 8px; font-size: 10px; }
  th, td { border: 1px solid #ccc; padding: 3px 6px; text-align: right; }
  th { background: #f0f0f0; font-weight: 600; text-align: center; }
  td:first-child { text-align: center; font-weight: 600; }
  .svg-container { text-align: center; margin: 10px 0; page-break-inside: avoid; }
  .svg-container svg { max-width: 100%; height: auto; max-height: 300px; }
  .summary-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 12px; }
  .summary-card { border: 1px solid #ddd; border-radius: 4px; padding: 8px; text-align: center; }
  .summary-card .num { font-size: 20px; font-weight: 700; color: #e94560; }
  .summary-card .lbl { font-size: 9px; color: #666; text-transform: uppercase; }
  .no-results { color: #999; font-style: italic; margin: 8px 0; }
  @media print {
    body { padding: 10mm; }
    h2 { page-break-after: avoid; }
    table { page-break-inside: auto; }
    tr { page-break-inside: avoid; }
  }
</style>
</head>
<body>
<div class="header">
  <div>
    <h1>${name}</h1>
    <div style="color:#666;font-size:10px">${t('file.structuralAnalysisReport')}</div>
  </div>
  <div class="header-info">
    <div>Dedaliano</div>
    <div>${escapeXml(date)}</div>
  </div>
</div>`;

  // Summary cards
  html += `
<div class="summary-grid">
  <div class="summary-card"><div class="num">${m.nodes.size}</div><div class="lbl">${t('file.nodes')}</div></div>
  <div class="summary-card"><div class="num">${m.elements.size}</div><div class="lbl">${t('file.elements')}</div></div>
  <div class="summary-card"><div class="num">${m.supports.size}</div><div class="lbl">${t('file.supports')}</div></div>
  <div class="summary-card"><div class="num">${m.model.loads.length}</div><div class="lbl">${t('file.loads')}</div></div>
</div>`;

  // Structure SVG
  if (svg) {
    html += `<div class="svg-container">${svg}</div>`;
  }

  // Nodes table
  const is3D = uiStore.analysisMode === '3d';
  html += `<h2>${t('file.geometry')}</h2>`;
  if (is3D) {
    html += `<h3>${t('file.nodes')}</h3>
<table><thead><tr><th>ID</th><th>X (m)</th><th>Y (m)</th><th>Z (m)</th></tr></thead><tbody>`;
    for (const [, node] of m.nodes) {
      html += `<tr><td>${node.id}</td><td>${fmtNum(node.x, 3)}</td><td>${fmtNum(node.y, 3)}</td><td>${fmtNum(node.z ?? 0, 3)}</td></tr>`;
    }
    html += `</tbody></table>`;
  } else {
    html += `<h3>${t('file.nodes')}</h3>
<table><thead><tr><th>ID</th><th>X (m)</th><th>Y (m)</th></tr></thead><tbody>`;
    for (const [, node] of m.nodes) {
      html += `<tr><td>${node.id}</td><td>${fmtNum(node.x, 3)}</td><td>${fmtNum(node.y, 3)}</td></tr>`;
    }
    html += `</tbody></table>`;
  }

  // Elements table
  html += `<h3>${t('file.elements')}</h3>
<table><thead><tr><th>ID</th><th>${t('file.type')}</th><th>${t('file.nodeI')}</th><th>${t('file.nodeJ')}</th><th>${t('file.material')}</th><th>${t('file.section')}</th><th>${t('file.hingeI')}</th><th>${t('file.hingeJ')}</th></tr></thead><tbody>`;
  for (const [, elem] of m.elements) {
    const mat = m.materials.get(elem.materialId);
    const sec = m.sections.get(elem.sectionId);
    html += `<tr><td>${elem.id}</td><td>${elem.type}</td><td>${elem.nodeI}</td><td>${elem.nodeJ}</td><td>${mat ? escapeXml(mat.name) : elem.materialId}</td><td>${sec ? escapeXml(sec.name) : elem.sectionId}</td><td>${elem.hingeStart ? t('file.yes') : '-'}</td><td>${elem.hingeEnd ? t('file.yes') : '-'}</td></tr>`;
  }
  html += `</tbody></table>`;

  // Materials
  html += `<h3>${t('file.materials')}</h3>
<table><thead><tr><th>ID</th><th>${t('file.name')}</th><th>E (MPa)</th><th>ν</th><th>ρ (kN/m³)</th></tr></thead><tbody>`;
  for (const [, mat] of m.materials) {
    html += `<tr><td>${mat.id}</td><td style="text-align:left">${escapeXml(mat.name)}</td><td>${fmtNum(mat.e, 0)}</td><td>${fmtNum(mat.nu, 2)}</td><td>${fmtNum(mat.rho, 1)}</td></tr>`;
  }
  html += `</tbody></table>`;

  // Sections
  html += `<h3>${t('file.sections')}</h3>
<table><thead><tr><th>ID</th><th>${t('file.name')}</th><th>A (m²)</th><th>Iy (m⁴)</th><th>Iz (m⁴)</th></tr></thead><tbody>`;
  for (const [, sec] of m.sections) {
    html += `<tr><td>${sec.id}</td><td style="text-align:left">${escapeXml(sec.name)}</td><td>${fmtNum(sec.a)}</td><td>${fmtNum(sec.iy ?? sec.iz)}</td><td>${fmtNum(sec.iz)}</td></tr>`;
  }
  html += `</tbody></table>`;

  // Supports
  html += `<h2>${t('file.boundaryConditions')}</h2>`;
  html += `<h3>${t('file.supports')}</h3>
<table><thead><tr><th>ID</th><th>${t('file.node')}</th><th>${t('file.type')}</th><th>${t('file.details')}</th></tr></thead><tbody>`;
  for (const [, sup] of m.supports) {
    let details = '';
    if (sup.type === 'spring') {
      const parts: string[] = [];
      if (sup.kx) parts.push(`kx=${sup.kx}`);
      if (sup.ky) parts.push(`ky=${sup.ky}`);
      if (sup.kz) parts.push(`kz=${sup.kz}`);
      details = parts.join(', ') + ' kN/m';
    } else {
      const parts: string[] = [];
      if (sup.dx) parts.push(`dx=${fmtNum(sup.dx)} m`);
      if (sup.dy) parts.push(`dy=${fmtNum(sup.dy)} m`);
      if (sup.drz) parts.push(`dθ=${fmtNum(sup.drz)} rad`);
      details = parts.length > 0 ? parts.join(', ') : '-';
    }
    html += `<tr><td>${sup.id}</td><td>${sup.nodeId}</td><td>${supportLabel(sup.type)}</td><td style="text-align:left">${details}</td></tr>`;
  }
  html += `</tbody></table>`;

  // Loads
  html += `<h3>${t('file.loads')}</h3>
<table><thead><tr><th>#</th><th>${t('file.type')}</th><th>${t('file.target')}</th><th>${t('file.values')}</th></tr></thead><tbody>`;
  for (let i = 0; i < m.model.loads.length; i++) {
    const load = m.model.loads[i];
    let tipo = '', destino = '', valores = '';
    switch (load.type) {
      case 'nodal': {
        const d = load.data;
        tipo = t('file.loadNodal');
        destino = `${t('file.node')} ${d.nodeId}`;
        valores = `Fx=${fmtNum(d.fx)} kN, Fy=${fmtNum(d.fy)} kN, Mz=${fmtNum(d.mz)} kN·m`;
        break;
      }
      case 'distributed': {
        const d = load.data;
        tipo = t('file.loadDistributed');
        destino = `Elem ${d.elementId}`;
        valores = d.qI === d.qJ ? `q=${fmtNum(d.qI)} kN/m` : `qI=${fmtNum(d.qI)}, qJ=${fmtNum(d.qJ)} kN/m`;
        break;
      }
      case 'pointOnElement': {
        const d = load.data;
        tipo = t('file.loadPointOnElement');
        destino = `Elem ${d.elementId}`;
        valores = `P=${fmtNum(d.p)} kN, a=${fmtNum(d.a)} m`;
        break;
      }
      case 'thermal': {
        const d = load.data;
        tipo = t('file.loadThermal');
        destino = `Elem ${d.elementId}`;
        valores = `ΔT=${fmtNum(d.dtUniform)} °C, ΔTg=${fmtNum(d.dtGradient)} °C`;
        break;
      }
    }
    html += `<tr><td>${i + 1}</td><td>${tipo}</td><td>${destino}</td><td style="text-align:left">${valores}</td></tr>`;
  }
  html += `</tbody></table>`;

  // Results
  const r3D = resultsStore.results3D;
  if (is3D && r3D) {
    html += `<h2>${t('file.results')} 3D</h2>`;

    // 3D Displacements
    html += `<h3>${t('file.displacements')}</h3>
<table><thead><tr><th>${t('file.node')}</th><th>ux (m)</th><th>uy (m)</th><th>uz (m)</th><th>θx (rad)</th><th>θy (rad)</th><th>θz (rad)</th></tr></thead><tbody>`;
    for (const d of r3D.displacements) {
      html += `<tr><td>${d.nodeId}</td><td>${fmtNum(d.ux)}</td><td>${fmtNum(d.uy)}</td><td>${fmtNum(d.uz)}</td><td>${fmtNum(d.rx)}</td><td>${fmtNum(d.ry)}</td><td>${fmtNum(d.rz)}</td></tr>`;
    }
    html += `</tbody></table>`;

    // 3D Reactions
    html += `<h3>${t('file.reactions')}</h3>
<table><thead><tr><th>${t('file.node')}</th><th>Fx (kN)</th><th>Fy (kN)</th><th>Fz (kN)</th><th>Mx (kN·m)</th><th>My (kN·m)</th><th>Mz (kN·m)</th></tr></thead><tbody>`;
    for (const rx of r3D.reactions) {
      html += `<tr><td>${rx.nodeId}</td><td>${fmtNum(rx.fx)}</td><td>${fmtNum(rx.fy)}</td><td>${fmtNum(rx.fz)}</td><td>${fmtNum(-rx.mx)}</td><td>${fmtNum(-rx.my)}</td><td>${fmtNum(-rx.mz)}</td></tr>`;
    }
    html += `</tbody></table>`;

    // 3D Internal forces
    html += `<h3>${t('file.internalForces')}</h3>
<table style="font-size:9px"><thead><tr><th>Elem</th><th>L (m)</th><th>N_i</th><th>N_j</th><th>Vy_i</th><th>Vy_j</th><th>Vz_i</th><th>Vz_j</th><th>Mx_i</th><th>Mx_j</th><th>My_i</th><th>My_j</th><th>Mz_i</th><th>Mz_j</th></tr></thead><tbody>`;
    for (const f of r3D.elementForces) {
      html += `<tr><td>${f.elementId}</td><td>${fmtNum(f.length, 3)}</td><td>${fmtNum(f.nStart)}</td><td>${fmtNum(f.nEnd)}</td><td>${fmtNum(f.vyStart)}</td><td>${fmtNum(f.vyEnd)}</td><td>${fmtNum(f.vzStart)}</td><td>${fmtNum(f.vzEnd)}</td><td>${fmtNum(-f.mxStart)}</td><td>${fmtNum(-f.mxEnd)}</td><td>${fmtNum(-f.myStart)}</td><td>${fmtNum(-f.myEnd)}</td><td>${fmtNum(-f.mzStart)}</td><td>${fmtNum(-f.mzEnd)}</td></tr>`;
    }
    html += `</tbody></table>`;
  } else if (r) {
    html += `<h2>${t('file.results')}</h2>`;

    // Displacements
    html += `<h3>${t('file.displacements')}</h3>
<table><thead><tr><th>${t('file.node')}</th><th>ux (m)</th><th>uy (m)</th><th>θz (rad)</th></tr></thead><tbody>`;
    for (const d of r.displacements) {
      html += `<tr><td>${d.nodeId}</td><td>${fmtNum(d.ux)}</td><td>${fmtNum(d.uy)}</td><td>${fmtNum(d.rz)}</td></tr>`;
    }
    html += `</tbody></table>`;

    // Reactions
    html += `<h3>${t('file.reactions')}</h3>
<table><thead><tr><th>${t('file.node')}</th><th>Rx (kN)</th><th>Ry (kN)</th><th>Mz (kN·m)</th></tr></thead><tbody>`;
    for (const rx of r.reactions) {
      html += `<tr><td>${rx.nodeId}</td><td>${fmtNum(rx.rx)}</td><td>${fmtNum(rx.ry)}</td><td>${fmtNum(-rx.mz)}</td></tr>`;
    }
    html += `</tbody></table>`;

    // Internal forces
    html += `<h3>${t('file.internalForces')}</h3>
<table><thead><tr><th>Elem</th><th>L (m)</th><th>N_i (kN)</th><th>N_j (kN)</th><th>V_i (kN)</th><th>V_j (kN)</th><th>M_i (kN·m)</th><th>M_j (kN·m)</th></tr></thead><tbody>`;
    for (const f of r.elementForces) {
      html += `<tr><td>${f.elementId}</td><td>${fmtNum(f.length, 3)}</td><td>${fmtNum(f.nStart)}</td><td>${fmtNum(f.nEnd)}</td><td>${fmtNum(f.vStart)}</td><td>${fmtNum(f.vEnd)}</td><td>${fmtNum(-f.mStart)}</td><td>${fmtNum(-f.mEnd)}</td></tr>`;
    }
    html += `</tbody></table>`;
  } else {
    html += `<h2>${t('file.results')}</h2><p class="no-results">${t('file.noResultsMsg')}</p>`;
  }

  html += `
<div style="margin-top:20px;padding-top:8px;border-top:1px solid #ddd;color:#999;font-size:9px;text-align:center">
  ${t('file.generatedWith')} ${is3D ? '3D' : '2D'}
</div>
</body></html>`;

  return html;
}

export function openPDFReport(): void {
  const html = generateReportHTML();
  const w = window.open('', '_blank');
  if (!w) return;
  w.document.write(html);
  w.document.close();
  // Auto-trigger print dialog after a short delay for rendering
  setTimeout(() => w.print(), 400);
}

// ─── AutoSave (localStorage) ────────────────────────────────────

// Migrate old storage key
if (typeof localStorage !== 'undefined') {
  if (localStorage.getItem('dedaliano-autosave') !== null && localStorage.getItem('stabileo-autosave') === null) {
    localStorage.setItem('stabileo-autosave', localStorage.getItem('dedaliano-autosave')!);
    localStorage.removeItem('dedaliano-autosave');
  }
}

const AUTOSAVE_KEY = 'stabileo-autosave';

export function saveToLocalStorage(): void {
  try {
    const json = serializeProject();
    localStorage.setItem(AUTOSAVE_KEY, json);
  } catch {
    // localStorage might be full or unavailable — silently ignore
  }
}

export function loadFromLocalStorage(): DedalFile | null {
  try {
    const raw = localStorage.getItem(AUTOSAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!validateDedalFile(data)) return null;
    return data;
  } catch {
    return null;
  }
}

export function clearLocalStorage(): void {
  try {
    localStorage.removeItem(AUTOSAVE_KEY);
  } catch {
    // ignore
  }
}
