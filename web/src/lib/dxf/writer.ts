// Generate DXF output with optional analysis result diagrams
// Format: AutoCAD R12 (AC1009) — universally readable

import { modelStore, resultsStore } from '../store';
import type { DxfExportOptions } from './types';
import { DXF_COLORS } from './types';
import type { ElementForces } from '../engine/types';
import { computeDeformedShape } from '../engine/diagrams';

// ─── Low-level DXF helpers (R12 AC1009 compatible) ────────────

function str(n: number): string {
  return n.toFixed(6);
}

function dxfHeader(): string[] {
  return ['0', 'SECTION', '2', 'HEADER', '9', '$ACADVER', '1', 'AC1009', '0', 'ENDSEC'];
}

function dxfLayerTable(layers: Array<{ name: string; color: number }>): string[] {
  const out: string[] = ['0', 'SECTION', '2', 'TABLES'];
  out.push('0', 'TABLE', '2', 'LAYER', '70', layers.length.toString());
  for (const l of layers) {
    out.push('0', 'LAYER', '2', l.name, '70', '0', '62', l.color.toString(), '6', 'CONTINUOUS');
  }
  out.push('0', 'ENDTAB', '0', 'ENDSEC');
  return out;
}

function dxfLine(layer: string, x1: number, y1: number, x2: number, y2: number, z1 = 0, z2 = 0): string[] {
  return [
    '0', 'LINE', '8', layer,
    '10', str(x1), '20', str(y1), '30', str(z1),
    '11', str(x2), '21', str(y2), '31', str(z2),
  ];
}

function dxfText(layer: string, x: number, y: number, height: number, text: string, z = 0): string[] {
  return [
    '0', 'TEXT', '8', layer,
    '10', str(x), '20', str(y), '30', str(z),
    '40', str(height),
    '1', text,
  ];
}

/** R12-compatible polyline using POLYLINE + VERTEX + SEQEND.
 *  Supports 3D coordinates. LWPOLYLINE does NOT exist in AC1009. */
function dxfPolyline(layer: string, points: Array<{ x: number; y: number; z?: number }>, closed = false): string[] {
  if (points.length < 2) return [];
  const out: string[] = [
    '0', 'POLYLINE',
    '8', layer,
    '66', '1',          // vertices-follow flag
    '70', closed ? '1' : '0',
  ];
  for (const p of points) {
    out.push(
      '0', 'VERTEX',
      '8', layer,
      '10', str(p.x), '20', str(p.y), '30', str(p.z ?? 0),
    );
  }
  out.push('0', 'SEQEND', '8', layer);
  return out;
}

function dxfPoint(layer: string, x: number, y: number, z = 0): string[] {
  return ['0', 'POINT', '8', layer, '10', str(x), '20', str(y), '30', str(z)];
}

// ─── Diagram computation helpers ───────────────────────────────

function momentAtX(ef: ElementForces, x: number): number {
  const L = ef.length;
  if (L < 1e-12) return 0;
  const dq = ef.qJ - ef.qI;
  let M = ef.mStart - ef.vStart * x;
  if (ef.qI !== 0 || ef.qJ !== 0) {
    M -= ef.qI * x * x / 2 + dq * x * x * x / (6 * L);
  }
  for (const pl of ef.pointLoads) {
    if (x > pl.a) M -= pl.p * (x - pl.a);
  }
  return M;
}

function shearAtX(ef: ElementForces, x: number): number {
  const L = ef.length;
  if (L < 1e-12) return 0;
  let V = ef.vStart;
  if (ef.qI !== 0 || ef.qJ !== 0) {
    V += ef.qI * x + (ef.qJ - ef.qI) * x * x / (2 * L);
  }
  for (const pl of ef.pointLoads) {
    if (x > pl.a) V += pl.p;
  }
  return V;
}

// ─── Support label ─────────────────────────────────────────────

function supportLabel(type: string): string {
  switch (type) {
    case 'fixed': return 'EMPOTRADO';
    case 'pinned': return 'ARTICULADO';
    case 'rollerX': return 'MOVIL X';
    case 'rollerY': return 'MOVIL Y';
    case 'spring': return 'RESORTE';
    default: return type.toUpperCase();
  }
}

// ─── Main export function ──────────────────────────────────────

export function exportDxfWithResults(options: DxfExportOptions): string {
  const lines: string[] = [];

  // Header
  lines.push(...dxfHeader());

  // Layer definitions
  const layerDefs: Array<{ name: string; color: number }> = [
    { name: 'ESTRUCTURA', color: DXF_COLORS.ESTRUCTURA },
    { name: 'APOYOS_OUT', color: DXF_COLORS.APOYOS_OUT },
  ];

  const hasResults = options.includeResults && resultsStore.results;
  if (hasResults) {
    layerDefs.push(
      { name: 'MOMENTOS', color: DXF_COLORS.MOMENTOS },
      { name: 'CORTANTES', color: DXF_COLORS.CORTANTES },
      { name: 'AXILES', color: DXF_COLORS.AXILES },
      { name: 'DEFORMADA', color: DXF_COLORS.DEFORMADA },
      { name: 'REACCIONES', color: DXF_COLORS.REACCIONES },
      { name: 'RESULTADOS', color: DXF_COLORS.RESULTADOS },
    );
  }
  lines.push(...dxfLayerTable(layerDefs));

  // Entities
  lines.push('0', 'SECTION', '2', 'ENTITIES');

  // ── Structure geometry ──

  for (const [, elem] of modelStore.elements) {
    const ni = modelStore.getNode(elem.nodeI);
    const nj = modelStore.getNode(elem.nodeJ);
    if (!ni || !nj) continue;
    lines.push(...dxfLine('ESTRUCTURA', ni.x, ni.y, nj.x, nj.y, ni.z ?? 0, nj.z ?? 0));
  }

  // Nodes as points
  for (const [, node] of modelStore.nodes) {
    lines.push(...dxfPoint('ESTRUCTURA', node.x, node.y, node.z ?? 0));
  }

  // ── Supports ──

  for (const [, sup] of modelStore.supports) {
    const node = modelStore.getNode(sup.nodeId);
    if (!node) continue;
    lines.push(...dxfPoint('APOYOS_OUT', node.x, node.y, node.z ?? 0));
    lines.push(...dxfText('APOYOS_OUT', node.x + 0.1, node.y - 0.3, 0.15, supportLabel(sup.type), node.z ?? 0));
  }

  // ── Result diagrams ──

  if (hasResults) {
    const r = resultsStore.results!;
    const ds = options.diagramScale;

    for (const ef of r.elementForces) {
      const elem = modelStore.elements.get(ef.elementId);
      if (!elem) continue;
      const ni = modelStore.getNode(elem.nodeI);
      const nj = modelStore.getNode(elem.nodeJ);
      if (!ni || !nj) continue;

      const L = ef.length;
      if (L < 1e-6) continue;

      const dx = nj.x - ni.x;
      const dy = nj.y - ni.y;
      const cosA = dx / L;
      const sinA = dy / L;
      // Perpendicular direction (offset direction for diagrams)
      const px = -sinA;
      const py = cosA;

      const nPts = 20;

      // Moment diagram
      const mPts: Array<{ x: number; y: number }> = [];
      let mMax = 0;
      let mMaxX = 0;
      let mMaxVal = 0;
      for (let k = 0; k <= nPts; k++) {
        const t = k / nPts;
        const x = t * L;
        const M = momentAtX(ef, x);
        mPts.push({
          x: ni.x + t * dx + M * ds * px,
          y: ni.y + t * dy + M * ds * py,
        });
        if (Math.abs(M) > mMax) { mMax = Math.abs(M); mMaxX = t; mMaxVal = M; }
      }
      // Closed polyline: bar axis + diagram contour
      const mClosed = [
        { x: ni.x, y: ni.y },
        ...mPts,
        { x: nj.x, y: nj.y },
      ];
      lines.push(...dxfPolyline('MOMENTOS', mClosed, true));

      if (options.includeValues && mMax > 0.01) {
        const tx = ni.x + mMaxX * dx + mMaxVal * ds * px;
        const ty = ni.y + mMaxX * dy + mMaxVal * ds * py;
        lines.push(...dxfText('MOMENTOS', tx, ty + 0.05, 0.1, mMaxVal.toFixed(2)));
      }

      // Shear diagram
      const vPts: Array<{ x: number; y: number }> = [];
      let vMax = 0;
      let vMaxVal = 0;
      let vMaxX = 0;
      for (let k = 0; k <= nPts; k++) {
        const t = k / nPts;
        const x = t * L;
        const V = shearAtX(ef, x);
        vPts.push({
          x: ni.x + t * dx + V * ds * px,
          y: ni.y + t * dy + V * ds * py,
        });
        if (Math.abs(V) > vMax) { vMax = Math.abs(V); vMaxX = t; vMaxVal = V; }
      }
      const vClosed = [
        { x: ni.x, y: ni.y },
        ...vPts,
        { x: nj.x, y: nj.y },
      ];
      lines.push(...dxfPolyline('CORTANTES', vClosed, true));

      if (options.includeValues && vMax > 0.01) {
        const tx = ni.x + vMaxX * dx + vMaxVal * ds * px;
        const ty = ni.y + vMaxX * dy + vMaxVal * ds * py;
        lines.push(...dxfText('CORTANTES', tx, ty + 0.05, 0.1, vMaxVal.toFixed(2)));
      }

      // Axial diagram (constant for uniform load case)
      const N = (ef.nStart + ef.nEnd) / 2;
      if (Math.abs(N) > 0.001) {
        const aPts = [
          { x: ni.x, y: ni.y },
          { x: ni.x + N * ds * px, y: ni.y + N * ds * py },
          { x: nj.x + N * ds * px, y: nj.y + N * ds * py },
          { x: nj.x, y: nj.y },
        ];
        lines.push(...dxfPolyline('AXILES', aPts, true));

        if (options.includeValues) {
          const mx = (ni.x + nj.x) / 2 + N * ds * px;
          const my = (ni.y + nj.y) / 2 + N * ds * py;
          lines.push(...dxfText('AXILES', mx, my + 0.05, 0.1, N.toFixed(2)));
        }
      }
    }

    // ── Deformed shape (Hermite cubic interpolation) ──

    if (options.deformedScale > 0) {
      const dispMap = new Map<number, { ux: number; uy: number; rz: number }>();
      for (const d of r.displacements) {
        dispMap.set(d.nodeId, { ux: d.ux, uy: d.uy, rz: d.rz ?? 0 });
      }
      const defScale = options.deformedScale;

      for (const ef of r.elementForces) {
        const elem = modelStore.elements.get(ef.elementId);
        if (!elem) continue;
        const ni = modelStore.getNode(elem.nodeI);
        const nj = modelStore.getNode(elem.nodeJ);
        if (!ni || !nj) continue;

        const di = dispMap.get(elem.nodeI) ?? { ux: 0, uy: 0, rz: 0 };
        const dj = dispMap.get(elem.nodeJ) ?? { ux: 0, uy: 0, rz: 0 };

        const defPts = computeDeformedShape(
          ni.x, ni.y, nj.x, nj.y,
          di.ux, di.uy, di.rz,
          dj.ux, dj.uy, dj.rz,
          defScale, ef.length,
        );
        lines.push(...dxfPolyline('DEFORMADA', defPts));
      }
    }

    // ── Reactions ──

    for (const rx of r.reactions) {
      const node = modelStore.getNode(rx.nodeId);
      if (!node) continue;
      const parts: string[] = [];
      if (Math.abs(rx.rx) > 0.001) parts.push(`Rx=${rx.rx.toFixed(2)}`);
      if (Math.abs(rx.ry) > 0.001) parts.push(`Ry=${rx.ry.toFixed(2)}`);
      if (Math.abs(rx.mz) > 0.001) parts.push(`Mz=${rx.mz.toFixed(2)}`);
      if (parts.length > 0) {
        lines.push(...dxfText('REACCIONES', node.x, node.y - 0.5, 0.12, parts.join(' ')));
      }
    }

    // ── Summary ──

    if (options.includeSummary) {
      // Place at top-left of bounding box
      let minX = Infinity, maxY = -Infinity;
      for (const [, node] of modelStore.nodes) {
        if (node.x < minX) minX = node.x;
        if (node.y > maxY) maxY = node.y;
      }
      if (isFinite(minX)) {
        const sx = minX;
        const sy = maxY + 1.5;
        lines.push(...dxfText('RESULTADOS', sx, sy, 0.2, `Max delta: ${(resultsStore.maxDisplacement * 1000).toFixed(3)} mm`));
        lines.push(...dxfText('RESULTADOS', sx, sy - 0.4, 0.2, `Max M: ${resultsStore.maxMoment.toFixed(2)} kN.m`));
        lines.push(...dxfText('RESULTADOS', sx, sy - 0.8, 0.2, `Max V: ${resultsStore.maxShear.toFixed(2)} kN`));
      }
    }
  }

  lines.push('0', 'ENDSEC');
  lines.push('0', 'EOF');

  return lines.join('\n');
}
