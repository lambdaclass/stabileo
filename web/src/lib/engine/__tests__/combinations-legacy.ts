/**
 * Legacy TS combination & envelope code — test-only.
 * Extracted from the pre-WASM combinations-service.ts for generating
 * reference fixtures that the Rust solver can be compared against.
 */

import type {
  AnalysisResults,
  FullEnvelope,
  ElementEnvelopeDiagram,
  EnvelopeDiagramData,
} from '../types';
import { computeDiagramValueAt } from '../diagrams';

// ─── 2D Combination ──────────────────────────────────────────────

export function combineResults(
  factors: Array<{ caseId: number; factor: number }>,
  perCase: Map<number, AnalysisResults>,
): AnalysisResults | null {
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

export function computeEnvelope(results: AnalysisResults[]): FullEnvelope | null {
  if (results.length === 0) return null;
  const first = results[0];
  const N_POINTS = 21;

  // maxAbsResults: keep value with largest absolute magnitude
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
        let maxPos = 0;
        let maxNeg = 0;

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
