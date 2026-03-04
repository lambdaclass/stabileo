// Combination & envelope computation — pure functions (no store dependency)
// Extracted from model.svelte.ts to reduce file size and improve testability.

import type {
  AnalysisResults,
  FullEnvelope,
  ElementEnvelopeDiagram,
  EnvelopeDiagramData,
} from './types';
import type {
  AnalysisResults3D,
  FullEnvelope3D,
  ElementEnvelopeDiagram3D,
  EnvelopeDiagramData3D,
} from './types-3d';
import { computeDiagramValueAt } from './diagrams';
import { computeDiagram3D, type Diagram3DKind } from './diagrams-3d';
import type { LoadCaseType } from '../store/model.svelte';

// ─── 2D Combination ──────────────────────────────────────────────

/**
 * Linearly combine AnalysisResults from multiple load cases using given factors.
 * Returns null if no cases are available.
 */
export function combineResults(
  factors: Array<{ caseId: number; factor: number }>,
  perCase: Map<number, AnalysisResults>,
): AnalysisResults | null {
  // Use the first available case as template for node/element ordering
  const template = perCase.values().next().value;
  if (!template) return null;

  const displacements = template.displacements.map(d => ({
    nodeId: d.nodeId, ux: 0, uy: 0, rz: 0,
  }));
  const reactions = template.reactions.map(r => ({
    nodeId: r.nodeId, rx: 0, ry: 0, mz: 0,
  }));
  const elementForces = template.elementForces.map(f => ({
    elementId: f.elementId,
    nStart: 0, nEnd: 0, vStart: 0, vEnd: 0, mStart: 0, mEnd: 0,
    length: f.length, qI: 0, qJ: 0,
    pointLoads: [] as Array<{ a: number; p: number }>,
    distributedLoads: [] as Array<{ qI: number; qJ: number; a: number; b: number }>,
    hingeStart: f.hingeStart, hingeEnd: f.hingeEnd,
  }));

  for (const { caseId, factor } of factors) {
    const r = perCase.get(caseId);
    if (!r) continue;

    for (let i = 0; i < r.displacements.length && i < displacements.length; i++) {
      displacements[i].ux += factor * r.displacements[i].ux;
      displacements[i].uy += factor * r.displacements[i].uy;
      displacements[i].rz += factor * r.displacements[i].rz;
    }
    for (let i = 0; i < r.reactions.length && i < reactions.length; i++) {
      reactions[i].rx += factor * r.reactions[i].rx;
      reactions[i].ry += factor * r.reactions[i].ry;
      reactions[i].mz += factor * r.reactions[i].mz;
    }
    for (let i = 0; i < r.elementForces.length && i < elementForces.length; i++) {
      elementForces[i].nStart += factor * r.elementForces[i].nStart;
      elementForces[i].nEnd += factor * r.elementForces[i].nEnd;
      elementForces[i].vStart += factor * r.elementForces[i].vStart;
      elementForces[i].vEnd += factor * r.elementForces[i].vEnd;
      elementForces[i].mStart += factor * r.elementForces[i].mStart;
      elementForces[i].mEnd += factor * r.elementForces[i].mEnd;
      elementForces[i].qI += factor * r.elementForces[i].qI;
      elementForces[i].qJ += factor * r.elementForces[i].qJ;
      // Add factored distributed loads from this case
      for (const dl of r.elementForces[i].distributedLoads) {
        elementForces[i].distributedLoads.push({
          qI: dl.qI * factor, qJ: dl.qJ * factor, a: dl.a, b: dl.b,
        });
      }
    }
  }

  return { displacements, reactions, elementForces };
}

// ─── 2D Envelope ─────────────────────────────────────────────────

/**
 * Compute pointwise envelope from multiple AnalysisResults.
 * Returns FullEnvelope with pos/neg curves for M, V, N + maxAbsResults for backward compat.
 */
export function computeEnvelope(results: AnalysisResults[]): FullEnvelope | null {
  if (results.length === 0) return null;
  const first = results[0];
  const N_POINTS = 21; // sampling points per element (0, 0.05, ..., 1.0)

  // --- maxAbsResults (backward compat: max absolute with sign) ---
  const displacements = first.displacements.map(d => ({ ...d }));
  const reactions = first.reactions.map(r => ({ ...r }));
  const elementForces = first.elementForces.map(f => ({
    ...f, pointLoads: [...f.pointLoads], distributedLoads: [...f.distributedLoads],
  }));

  for (let r = 1; r < results.length; r++) {
    const res = results[r];
    for (let i = 0; i < res.displacements.length && i < displacements.length; i++) {
      if (Math.abs(res.displacements[i].ux) > Math.abs(displacements[i].ux)) displacements[i].ux = res.displacements[i].ux;
      if (Math.abs(res.displacements[i].uy) > Math.abs(displacements[i].uy)) displacements[i].uy = res.displacements[i].uy;
      if (Math.abs(res.displacements[i].rz) > Math.abs(displacements[i].rz)) displacements[i].rz = res.displacements[i].rz;
    }
    for (let i = 0; i < res.reactions.length && i < reactions.length; i++) {
      if (Math.abs(res.reactions[i].rx) > Math.abs(reactions[i].rx)) reactions[i].rx = res.reactions[i].rx;
      if (Math.abs(res.reactions[i].ry) > Math.abs(reactions[i].ry)) reactions[i].ry = res.reactions[i].ry;
      if (Math.abs(res.reactions[i].mz) > Math.abs(reactions[i].mz)) reactions[i].mz = res.reactions[i].mz;
    }
    for (let i = 0; i < res.elementForces.length && i < elementForces.length; i++) {
      if (Math.abs(res.elementForces[i].nStart) > Math.abs(elementForces[i].nStart)) elementForces[i].nStart = res.elementForces[i].nStart;
      if (Math.abs(res.elementForces[i].nEnd) > Math.abs(elementForces[i].nEnd)) elementForces[i].nEnd = res.elementForces[i].nEnd;
      if (Math.abs(res.elementForces[i].vStart) > Math.abs(elementForces[i].vStart)) elementForces[i].vStart = res.elementForces[i].vStart;
      if (Math.abs(res.elementForces[i].vEnd) > Math.abs(elementForces[i].vEnd)) elementForces[i].vEnd = res.elementForces[i].vEnd;
      if (Math.abs(res.elementForces[i].mStart) > Math.abs(elementForces[i].mStart)) elementForces[i].mStart = res.elementForces[i].mStart;
      if (Math.abs(res.elementForces[i].mEnd) > Math.abs(elementForces[i].mEnd)) elementForces[i].mEnd = res.elementForces[i].mEnd;
    }
  }
  const maxAbsResults: AnalysisResults = { displacements, reactions, elementForces };

  // --- Pointwise envelope for M, V, N ---
  function computeEnvelopeDiagram(kind: 'moment' | 'shear' | 'axial'): EnvelopeDiagramData {
    const elements: ElementEnvelopeDiagram[] = [];
    let globalMax = 0;

    for (let eIdx = 0; eIdx < first.elementForces.length; eIdx++) {
      const elemId = first.elementForces[eIdx].elementId;
      const tPositions: number[] = [];
      const posValues: number[] = [];
      const negValues: number[] = [];

      for (let j = 0; j < N_POINTS; j++) {
        const t = j / (N_POINTS - 1);
        tPositions.push(t);
        let maxPos = 0; // best positive value (≥ 0)
        let maxNeg = 0; // best negative value (≤ 0)

        for (const res of results) {
          if (eIdx >= res.elementForces.length) continue;
          const ef = res.elementForces[eIdx];
          const val = computeDiagramValueAt(kind, t, ef);
          if (val > maxPos) maxPos = val;
          if (val < maxNeg) maxNeg = val;
        }

        posValues.push(maxPos);
        negValues.push(maxNeg);
        globalMax = Math.max(globalMax, Math.abs(maxPos), Math.abs(maxNeg));
      }

      elements.push({ elementId: elemId, tPositions, posValues, negValues });
    }

    return { kind, elements, globalMax };
  }

  return {
    moment: computeEnvelopeDiagram('moment'),
    shear: computeEnvelopeDiagram('shear'),
    axial: computeEnvelopeDiagram('axial'),
    maxAbsResults,
  };
}

// ─── 3D Combination ──────────────────────────────────────────────

/**
 * Linearly combine AnalysisResults3D from multiple load cases using given factors.
 */
export function combineResults3D(
  factors: Array<{ caseId: number; factor: number }>,
  perCase: Map<number, AnalysisResults3D>,
): AnalysisResults3D | null {
  const template = perCase.values().next().value;
  if (!template) return null;

  const displacements = template.displacements.map(d => ({
    nodeId: d.nodeId, ux: 0, uy: 0, uz: 0, rx: 0, ry: 0, rz: 0,
  }));
  const reactions = template.reactions.map(r => ({
    nodeId: r.nodeId, fx: 0, fy: 0, fz: 0, mx: 0, my: 0, mz: 0,
  }));
  const elementForces = template.elementForces.map(f => ({
    elementId: f.elementId, length: f.length,
    nStart: 0, nEnd: 0,
    vyStart: 0, vyEnd: 0, vzStart: 0, vzEnd: 0,
    mxStart: 0, mxEnd: 0, myStart: 0, myEnd: 0, mzStart: 0, mzEnd: 0,
    hingeStart: f.hingeStart, hingeEnd: f.hingeEnd,
    qYI: 0, qYJ: 0, qZI: 0, qZJ: 0,
    distributedLoadsY: [] as Array<{ qI: number; qJ: number; a: number; b: number }>,
    pointLoadsY: [] as Array<{ a: number; p: number }>,
    distributedLoadsZ: [] as Array<{ qI: number; qJ: number; a: number; b: number }>,
    pointLoadsZ: [] as Array<{ a: number; p: number }>,
  }));

  for (const { caseId, factor } of factors) {
    const r = perCase.get(caseId);
    if (!r) continue;

    for (let i = 0; i < r.displacements.length && i < displacements.length; i++) {
      displacements[i].ux += factor * r.displacements[i].ux;
      displacements[i].uy += factor * r.displacements[i].uy;
      displacements[i].uz += factor * r.displacements[i].uz;
      displacements[i].rx += factor * r.displacements[i].rx;
      displacements[i].ry += factor * r.displacements[i].ry;
      displacements[i].rz += factor * r.displacements[i].rz;
    }
    for (let i = 0; i < r.reactions.length && i < reactions.length; i++) {
      reactions[i].fx += factor * r.reactions[i].fx;
      reactions[i].fy += factor * r.reactions[i].fy;
      reactions[i].fz += factor * r.reactions[i].fz;
      reactions[i].mx += factor * r.reactions[i].mx;
      reactions[i].my += factor * r.reactions[i].my;
      reactions[i].mz += factor * r.reactions[i].mz;
    }
    for (let i = 0; i < r.elementForces.length && i < elementForces.length; i++) {
      const ef = r.elementForces[i];
      const out = elementForces[i];
      out.nStart += factor * ef.nStart;
      out.nEnd += factor * ef.nEnd;
      out.vyStart += factor * ef.vyStart;
      out.vyEnd += factor * ef.vyEnd;
      out.vzStart += factor * ef.vzStart;
      out.vzEnd += factor * ef.vzEnd;
      out.mxStart += factor * ef.mxStart;
      out.mxEnd += factor * ef.mxEnd;
      out.myStart += factor * ef.myStart;
      out.myEnd += factor * ef.myEnd;
      out.mzStart += factor * ef.mzStart;
      out.mzEnd += factor * ef.mzEnd;
      out.qYI += factor * ef.qYI;
      out.qYJ += factor * ef.qYJ;
      out.qZI += factor * ef.qZI;
      out.qZJ += factor * ef.qZJ;
      // Add factored distributed loads
      for (const dl of ef.distributedLoadsY) {
        out.distributedLoadsY.push({ qI: dl.qI * factor, qJ: dl.qJ * factor, a: dl.a, b: dl.b });
      }
      for (const dl of ef.distributedLoadsZ) {
        out.distributedLoadsZ.push({ qI: dl.qI * factor, qJ: dl.qJ * factor, a: dl.a, b: dl.b });
      }
      for (const pl of ef.pointLoadsY) {
        out.pointLoadsY.push({ a: pl.a, p: pl.p * factor });
      }
      for (const pl of ef.pointLoadsZ) {
        out.pointLoadsZ.push({ a: pl.a, p: pl.p * factor });
      }
    }
  }

  return { displacements, reactions, elementForces };
}

// ─── 3D Envelope ─────────────────────────────────────────────────

/**
 * Compute pointwise envelope from multiple AnalysisResults3D.
 * Returns FullEnvelope3D with pos/neg curves for each diagram kind.
 */
export function computeEnvelope3D(results: AnalysisResults3D[]): FullEnvelope3D | null {
  if (results.length === 0) return null;
  const first = results[0];
  const N_POINTS = 21;

  // --- maxAbsResults3D: keep value with largest absolute magnitude ---
  const displacements = first.displacements.map(d => ({ ...d }));
  const reactions = first.reactions.map(r => ({ ...r }));
  const elementForces = first.elementForces.map(f => ({
    ...f,
    distributedLoadsY: [...f.distributedLoadsY],
    distributedLoadsZ: [...f.distributedLoadsZ],
    pointLoadsY: [...f.pointLoadsY],
    pointLoadsZ: [...f.pointLoadsZ],
  }));

  for (let r = 1; r < results.length; r++) {
    const res = results[r];
    for (let i = 0; i < res.displacements.length && i < displacements.length; i++) {
      const d = res.displacements[i]; const o = displacements[i];
      if (Math.abs(d.ux) > Math.abs(o.ux)) o.ux = d.ux;
      if (Math.abs(d.uy) > Math.abs(o.uy)) o.uy = d.uy;
      if (Math.abs(d.uz) > Math.abs(o.uz)) o.uz = d.uz;
      if (Math.abs(d.rx) > Math.abs(o.rx)) o.rx = d.rx;
      if (Math.abs(d.ry) > Math.abs(o.ry)) o.ry = d.ry;
      if (Math.abs(d.rz) > Math.abs(o.rz)) o.rz = d.rz;
    }
    for (let i = 0; i < res.reactions.length && i < reactions.length; i++) {
      const d = res.reactions[i]; const o = reactions[i];
      if (Math.abs(d.fx) > Math.abs(o.fx)) o.fx = d.fx;
      if (Math.abs(d.fy) > Math.abs(o.fy)) o.fy = d.fy;
      if (Math.abs(d.fz) > Math.abs(o.fz)) o.fz = d.fz;
      if (Math.abs(d.mx) > Math.abs(o.mx)) o.mx = d.mx;
      if (Math.abs(d.my) > Math.abs(o.my)) o.my = d.my;
      if (Math.abs(d.mz) > Math.abs(o.mz)) o.mz = d.mz;
    }
    for (let i = 0; i < res.elementForces.length && i < elementForces.length; i++) {
      const d = res.elementForces[i]; const o = elementForces[i];
      if (Math.abs(d.nStart) > Math.abs(o.nStart)) o.nStart = d.nStart;
      if (Math.abs(d.nEnd) > Math.abs(o.nEnd)) o.nEnd = d.nEnd;
      if (Math.abs(d.vyStart) > Math.abs(o.vyStart)) o.vyStart = d.vyStart;
      if (Math.abs(d.vyEnd) > Math.abs(o.vyEnd)) o.vyEnd = d.vyEnd;
      if (Math.abs(d.vzStart) > Math.abs(o.vzStart)) o.vzStart = d.vzStart;
      if (Math.abs(d.vzEnd) > Math.abs(o.vzEnd)) o.vzEnd = d.vzEnd;
      if (Math.abs(d.mxStart) > Math.abs(o.mxStart)) o.mxStart = d.mxStart;
      if (Math.abs(d.mxEnd) > Math.abs(o.mxEnd)) o.mxEnd = d.mxEnd;
      if (Math.abs(d.myStart) > Math.abs(o.myStart)) o.myStart = d.myStart;
      if (Math.abs(d.myEnd) > Math.abs(o.myEnd)) o.myEnd = d.myEnd;
      if (Math.abs(d.mzStart) > Math.abs(o.mzStart)) o.mzStart = d.mzStart;
      if (Math.abs(d.mzEnd) > Math.abs(o.mzEnd)) o.mzEnd = d.mzEnd;
    }
  }

  const maxAbsResults3D: AnalysisResults3D = { displacements, reactions, elementForces };

  // --- Pointwise envelope for each 3D diagram kind ---
  const diagramKinds: Diagram3DKind[] = ['momentY', 'momentZ', 'shearY', 'shearZ', 'axial', 'torsion'];

  function computeEnvelopeDiagram3D(kind: Diagram3DKind): EnvelopeDiagramData3D {
    const elements: ElementEnvelopeDiagram3D[] = [];
    let globalMax = 0;

    for (let eIdx = 0; eIdx < first.elementForces.length; eIdx++) {
      const elemId = first.elementForces[eIdx].elementId;
      const tPositions: number[] = [];
      const posValues: number[] = [];
      const negValues: number[] = [];

      for (let j = 0; j < N_POINTS; j++) {
        const t = j / (N_POINTS - 1);
        tPositions.push(t);
        let maxPos = 0;
        let maxNeg = 0;

        for (const res of results) {
          if (eIdx >= res.elementForces.length) continue;
          const ef = res.elementForces[eIdx];
          const diagram = computeDiagram3D(ef, kind);
          // Find value at this t by closest point in the computed diagram
          let val = 0;
          const pts = diagram.points;
          // Find the bracket
          let lo = 0, hi = pts.length - 1;
          for (let k = 0; k < pts.length - 1; k++) {
            if (pts[k].t <= t && pts[k + 1].t >= t) { lo = k; hi = k + 1; break; }
          }
          if (Math.abs(pts[lo].t - t) < 1e-10) {
            val = pts[lo].value;
          } else if (Math.abs(pts[hi].t - t) < 1e-10) {
            val = pts[hi].value;
          } else if (hi > lo) {
            const frac = (t - pts[lo].t) / (pts[hi].t - pts[lo].t);
            val = pts[lo].value + frac * (pts[hi].value - pts[lo].value);
          }
          if (val > maxPos) maxPos = val;
          if (val < maxNeg) maxNeg = val;
        }

        posValues.push(maxPos);
        negValues.push(maxNeg);
        globalMax = Math.max(globalMax, Math.abs(maxPos), Math.abs(maxNeg));
      }

      elements.push({ elementId: elemId, tPositions, posValues, negValues });
    }

    return { kind, elements, globalMax };
  }

  const envelopeResult: FullEnvelope3D = {
    momentY: computeEnvelopeDiagram3D('momentY'),
    momentZ: computeEnvelopeDiagram3D('momentZ'),
    shearY: computeEnvelopeDiagram3D('shearY'),
    shearZ: computeEnvelopeDiagram3D('shearZ'),
    axial: computeEnvelopeDiagram3D('axial'),
    torsion: computeEnvelopeDiagram3D('torsion'),
    maxAbsResults3D,
  };

  return envelopeResult;
}

// ─── Load Case Type Inference ────────────────────────────────────

/** Infer load case type from name for backward compat with old models */
export function inferLoadCaseType(name: string): LoadCaseType {
  const n = name.trim().toUpperCase();
  if (n === 'D' || n === 'DEAD' || n === 'DEAD LOAD') return 'D';
  if (n === 'L' || n === 'LIVE' || n === 'LIVE LOAD') return 'L';
  if (n === 'W' || n === 'WIND') return 'W';
  if (n === 'E' || n === 'EARTHQUAKE' || n === 'SEISMIC') return 'E';
  if (n === 'S' || n === 'SNOW') return 'S';
  if (n === 'T' || n === 'TEMPERATURE' || n === 'THERMAL') return 'T';
  if (n === 'LR' || n === 'ROOF LIVE' || n === 'ROOF LIVE LOAD') return 'Lr';
  if (n === 'R' || n === 'RAIN') return 'R';
  if (n === 'H' || n === 'FLUID' || n === 'FLUID PRESSURE') return 'H';
  return '';
}
