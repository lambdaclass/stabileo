// Moving load analysis — envelope of moving load trains across a structure

import type { SolverInput, AnalysisResults, ElementForces, FullEnvelope, ElementEnvelopeDiagram, EnvelopeDiagramData } from './types';
import { solve } from './solver-js';
import { computeDiagramValueAt } from './diagrams';
import { t } from '../i18n';

/** A single axle in a load train */
export interface Axle {
  /** Distance from reference axle (m). First axle should be 0. */
  offset: number;
  /** Force magnitude (kN, positive = downward) */
  weight: number;
}

/** A load train configuration */
export interface LoadTrain {
  name: string;
  axles: Axle[];
}

/** Predefined load trains (function to pick up current locale) */
export function getPredefinedTrains(): LoadTrain[] {
  return [
    {
      name: t('train.pointLoad100'),
      axles: [{ offset: 0, weight: 100 }],
    },
    {
      name: t('train.hl93Truck'),
      axles: [
        { offset: 0, weight: 35 },
        { offset: 4.3, weight: 145 },
        { offset: 8.6, weight: 145 },
      ],
    },
    {
      name: t('train.tandem'),
      axles: [
        { offset: 0, weight: 110 },
        { offset: 1.2, weight: 110 },
      ],
    },
  ];
}

/** @deprecated Use getPredefinedTrains() instead */
export const PREDEFINED_TRAINS: LoadTrain[] = [
  {
    name: 'Carga puntual (100 kN)',
    axles: [{ offset: 0, weight: 100 }],
  },
  {
    name: 'HL-93 Camión',
    axles: [
      { offset: 0, weight: 35 },
      { offset: 4.3, weight: 145 },
      { offset: 8.6, weight: 145 },
    ],
  },
  {
    name: 'Tándem (2×110 kN)',
    axles: [
      { offset: 0, weight: 110 },
      { offset: 1.2, weight: 110 },
    ],
  },
];

export interface MovingLoadConfig {
  train: LoadTrain;
  /** Step size for moving the reference axle (m). Default 0.25 */
  step?: number;
  /** Element IDs defining the load path (in order). If empty, auto-detect. */
  pathElementIds?: number[];
}

export interface MovingLoadEnvelope {
  /** Per-element: max positive and max negative for each force component */
  elements: Map<number, {
    mMaxPos: number; mMaxNeg: number;
    vMaxPos: number; vMaxNeg: number;
    nMaxPos: number; nMaxNeg: number;
  }>;
  /** All individual results for animation */
  positions: Array<{ refPosition: number; results: AnalysisResults }>;
  /** Pointwise envelope for dual-curve rendering */
  fullEnvelope?: FullEnvelope;
  /** Load train used (for axle visualization) */
  train: LoadTrain;
  /** Path segments (for axle position reconstruction) */
  path: PathSegment[];
}

export interface PathSegment {
  elementId: number;
  nodeI: number;
  nodeJ: number;
  length: number;
  cumStart: number; // cumulative distance at start of segment
  dx: number;
  dy: number;
}

/**
 * Build ordered path of elements through the structure.
 * If pathElementIds provided, use that order; otherwise auto-detect
 * a continuous chain starting from the leftmost node.
 */
function buildPath(input: SolverInput, pathElementIds?: number[]): PathSegment[] {
  const segments: PathSegment[] = [];

  if (pathElementIds && pathElementIds.length > 0) {
    let cumDist = 0;
    for (const eid of pathElementIds) {
      const elem = input.elements.get(eid);
      if (!elem) continue;
      const ni = input.nodes.get(elem.nodeI)!;
      const nj = input.nodes.get(elem.nodeJ)!;
      const dx = nj.x - ni.x;
      const dy = nj.y - ni.y;
      const L = Math.sqrt(dx * dx + dy * dy);
      segments.push({ elementId: eid, nodeI: elem.nodeI, nodeJ: elem.nodeJ, length: L, cumStart: cumDist, dx, dy });
      cumDist += L;
    }
    return segments;
  }

  // Auto-detect: find the connected chain by walking from leftmost node
  const adj = new Map<number, Array<{ elemId: number; otherNode: number }>>();
  for (const [eid, elem] of input.elements) {
    if (!adj.has(elem.nodeI)) adj.set(elem.nodeI, []);
    if (!adj.has(elem.nodeJ)) adj.set(elem.nodeJ, []);
    adj.get(elem.nodeI)!.push({ elemId: eid, otherNode: elem.nodeJ });
    adj.get(elem.nodeJ)!.push({ elemId: eid, otherNode: elem.nodeI });
  }

  // Find leftmost node
  let startNode = -1;
  let minX = Infinity;
  for (const [nid, node] of input.nodes) {
    if (node.x < minX) { minX = node.x; startNode = nid; }
  }

  // Walk greedily to the right
  const visited = new Set<number>();
  let current = startNode;
  let cumDist = 0;

  while (true) {
    const neighbors = adj.get(current);
    if (!neighbors) break;

    let best: { elemId: number; otherNode: number } | null = null;
    let bestX = -Infinity;

    for (const nb of neighbors) {
      if (visited.has(nb.elemId)) continue;
      const otherNode = input.nodes.get(nb.otherNode)!;
      if (otherNode.x >= bestX) {
        bestX = otherNode.x;
        best = nb;
      }
    }

    if (!best) break;
    visited.add(best.elemId);

    const elem = input.elements.get(best.elemId)!;
    const ni = input.nodes.get(current)!;
    const nj = input.nodes.get(best.otherNode)!;
    const dx = nj.x - ni.x;
    const dy = nj.y - ni.y;
    const L = Math.sqrt(dx * dx + dy * dy);

    segments.push({
      elementId: best.elemId,
      nodeI: current,
      nodeJ: best.otherNode,
      length: L,
      cumStart: cumDist,
      dx, dy,
    });
    cumDist += L;
    current = best.otherNode;
  }

  return segments;
}

/**
 * Run moving load analysis.
 * Returns envelope of max/min forces across all positions.
 */
export function solveMovingLoads(
  baseInput: SolverInput,
  config: MovingLoadConfig,
): MovingLoadEnvelope | string {
  const step = config.step ?? 0.25;
  const path = buildPath(baseInput, config.pathElementIds);

  if (path.length === 0) return t('train.noPathFound');

  const totalLength = path[path.length - 1].cumStart + path[path.length - 1].length;
  const maxAxleOffset = Math.max(...config.train.axles.map(a => a.offset));

  // Initialize envelope
  const envelope = new Map<number, {
    mMaxPos: number; mMaxNeg: number;
    vMaxPos: number; vMaxNeg: number;
    nMaxPos: number; nMaxNeg: number;
  }>();
  for (const seg of path) {
    envelope.set(seg.elementId, {
      mMaxPos: 0, mMaxNeg: 0,
      vMaxPos: 0, vMaxNeg: 0,
      nMaxPos: 0, nMaxNeg: 0,
    });
  }

  const positions: MovingLoadEnvelope['positions'] = [];

  // Move reference axle from -maxAxleOffset to totalLength
  for (let refPos = -maxAxleOffset; refPos <= totalLength; refPos += step) {
    // Build loads for this position
    const loads: SolverInput['loads'] = [...baseInput.loads];

    for (const axle of config.train.axles) {
      const pos = refPos + axle.offset;
      if (pos < 0 || pos > totalLength) continue;

      // Find which segment this axle falls on
      const seg = path.find(s => pos >= s.cumStart && pos <= s.cumStart + s.length);
      if (!seg) continue;

      const t = (pos - seg.cumStart) / seg.length;
      const a = t * seg.length; // distance from nodeI of this segment

      // Decompose downward force into local coords
      const cosTheta = seg.dx / seg.length;
      const sinTheta = seg.dy / seg.length;
      const pPerp = -axle.weight * cosTheta; // perpendicular component (local)

      if (Math.abs(pPerp) > 1e-10) {
        loads.push({
          type: 'pointOnElement',
          data: { elementId: seg.elementId, a, p: pPerp },
        });
      }

      // Axial component as nodal loads
      const pAxial = -axle.weight * sinTheta;
      if (Math.abs(pAxial) > 1e-10) {
        const fI = pAxial * (1 - t);
        const fJ = pAxial * t;
        loads.push(
          { type: 'nodal', data: { nodeId: seg.nodeI, fx: fI * cosTheta, fy: fI * sinTheta, mz: 0 } },
          { type: 'nodal', data: { nodeId: seg.nodeJ, fx: fJ * cosTheta, fy: fJ * sinTheta, mz: 0 } },
        );
      }
    }

    const input: SolverInput = { ...baseInput, loads };

    try {
      const results = solve(input);
      positions.push({ refPosition: refPos, results });

      // Update envelope
      for (const ef of results.elementForces) {
        const env = envelope.get(ef.elementId);
        if (!env) continue;
        const mMax = Math.max(ef.mStart, ef.mEnd);
        const mMin = Math.min(ef.mStart, ef.mEnd);
        const vMax = Math.max(ef.vStart, ef.vEnd);
        const vMin = Math.min(ef.vStart, ef.vEnd);
        const nMax = Math.max(ef.nStart, ef.nEnd);
        const nMin = Math.min(ef.nStart, ef.nEnd);

        if (mMax > env.mMaxPos) env.mMaxPos = mMax;
        if (mMin < env.mMaxNeg) env.mMaxNeg = mMin;
        if (vMax > env.vMaxPos) env.vMaxPos = vMax;
        if (vMin < env.vMaxNeg) env.vMaxNeg = vMin;
        if (nMax > env.nMaxPos) env.nMaxPos = nMax;
        if (nMin < env.nMaxNeg) env.nMaxNeg = nMin;
      }
    } catch (e) {
      // Skip positions where the solver fails (e.g. singular matrix at certain load configs).
      // Log for debugging but don't abort — other positions may still be valid.
      console.warn(`Moving load position ${refPos.toFixed(2)} failed: ${e instanceof Error ? e.message : e}`);
    }
  }

  if (positions.length === 0) return t('train.noPositionSolved');

  // Compute pointwise envelope for dual-curve rendering
  const allResults = positions.map(p => p.results);
  const fullEnvelope = computePointwiseEnvelope(allResults);

  return { elements: envelope, positions, fullEnvelope, train: config.train, path };
}

// ─── Async Moving Load Analysis with Progress ────────────────────

export interface MovingLoadProgress {
  current: number;      // posición actual (1-based)
  total: number;        // total posiciones
  refPosition: number;  // posición en metros
}

/**
 * Async version of solveMovingLoads with progress reporting and cancellation.
 * Yields to the event loop between each position so the UI stays responsive.
 */
export async function solveMovingLoadsAsync(
  baseInput: SolverInput,
  config: MovingLoadConfig,
  onProgress?: (progress: MovingLoadProgress) => void,
  signal?: AbortSignal,
): Promise<MovingLoadEnvelope | string> {
  const step = config.step ?? 0.25;
  const path = buildPath(baseInput, config.pathElementIds);

  if (path.length === 0) return t('train.noPathFound');

  const totalLength = path[path.length - 1].cumStart + path[path.length - 1].length;
  const maxAxleOffset = Math.max(...config.train.axles.map(a => a.offset));

  // Initialize envelope
  const envelope = new Map<number, {
    mMaxPos: number; mMaxNeg: number;
    vMaxPos: number; vMaxNeg: number;
    nMaxPos: number; nMaxNeg: number;
  }>();
  for (const seg of path) {
    envelope.set(seg.elementId, {
      mMaxPos: 0, mMaxNeg: 0,
      vMaxPos: 0, vMaxNeg: 0,
      nMaxPos: 0, nMaxNeg: 0,
    });
  }

  // Pre-compute all positions
  const refPositions: number[] = [];
  for (let refPos = -maxAxleOffset; refPos <= totalLength; refPos += step) {
    refPositions.push(refPos);
  }
  const total = refPositions.length;

  const positions: MovingLoadEnvelope['positions'] = [];

  for (let idx = 0; idx < total; idx++) {
    // Check cancellation
    if (signal?.aborted) return t('train.analysisCancelled');

    const refPos = refPositions[idx];

    // Build loads for this position
    const loads: SolverInput['loads'] = [...baseInput.loads];

    for (const axle of config.train.axles) {
      const pos = refPos + axle.offset;
      if (pos < 0 || pos > totalLength) continue;

      const seg = path.find(s => pos >= s.cumStart && pos <= s.cumStart + s.length);
      if (!seg) continue;

      const t = (pos - seg.cumStart) / seg.length;
      const a = t * seg.length;

      const cosTheta = seg.dx / seg.length;
      const sinTheta = seg.dy / seg.length;
      const pPerp = -axle.weight * cosTheta;

      if (Math.abs(pPerp) > 1e-10) {
        loads.push({
          type: 'pointOnElement',
          data: { elementId: seg.elementId, a, p: pPerp },
        });
      }

      const pAxial = -axle.weight * sinTheta;
      if (Math.abs(pAxial) > 1e-10) {
        const fI = pAxial * (1 - t);
        const fJ = pAxial * t;
        loads.push(
          { type: 'nodal', data: { nodeId: seg.nodeI, fx: fI * cosTheta, fy: fI * sinTheta, mz: 0 } },
          { type: 'nodal', data: { nodeId: seg.nodeJ, fx: fJ * cosTheta, fy: fJ * sinTheta, mz: 0 } },
        );
      }
    }

    const input: SolverInput = { ...baseInput, loads };

    try {
      const results = solve(input);
      positions.push({ refPosition: refPos, results });

      // Update envelope
      for (const ef of results.elementForces) {
        const env = envelope.get(ef.elementId);
        if (!env) continue;
        const mMax = Math.max(ef.mStart, ef.mEnd);
        const mMin = Math.min(ef.mStart, ef.mEnd);
        const vMax = Math.max(ef.vStart, ef.vEnd);
        const vMin = Math.min(ef.vStart, ef.vEnd);
        const nMax = Math.max(ef.nStart, ef.nEnd);
        const nMin = Math.min(ef.nStart, ef.nEnd);

        if (mMax > env.mMaxPos) env.mMaxPos = mMax;
        if (mMin < env.mMaxNeg) env.mMaxNeg = mMin;
        if (vMax > env.vMaxPos) env.vMaxPos = vMax;
        if (vMin < env.vMaxNeg) env.vMaxNeg = vMin;
        if (nMax > env.nMaxPos) env.nMaxPos = nMax;
        if (nMin < env.nMaxNeg) env.nMaxNeg = nMin;
      }
    } catch (e) {
      console.warn(`Moving load position ${refPos.toFixed(2)} failed: ${e instanceof Error ? e.message : e}`);
    }

    // Report progress & yield to event loop
    onProgress?.({ current: idx + 1, total, refPosition: refPos });
    await new Promise(r => setTimeout(r, 0));
  }

  if (signal?.aborted) return t('train.analysisCancelled');
  if (positions.length === 0) return t('train.noPositionSolved');

  // Compute pointwise envelope for dual-curve rendering
  const allResults = positions.map(p => p.results);
  const fullEnvelope = computePointwiseEnvelope(allResults);

  return { elements: envelope, positions, fullEnvelope, train: config.train, path };
}

/**
 * Compute pointwise FullEnvelope from multiple AnalysisResults.
 * Reusable for both combination envelopes and moving load envelopes.
 */
export function computePointwiseEnvelope(results: AnalysisResults[]): FullEnvelope | undefined {
  if (results.length === 0) return undefined;
  const first = results[0];
  const N_POINTS = 21;

  // maxAbsResults (backward compat)
  const displacements = first.displacements.map(d => ({ ...d }));
  const reactions = first.reactions.map(r => ({ ...r }));
  const elementForces = first.elementForces.map(f => ({ ...f, pointLoads: [...f.pointLoads] }));

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

  function computeEnvDiagram(kind: 'moment' | 'shear' | 'axial'): EnvelopeDiagramData {
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
    moment: computeEnvDiagram('moment'),
    shear: computeEnvDiagram('shear'),
    axial: computeEnvDiagram('axial'),
    maxAbsResults,
  };
}

// ─── Axle Position Visualization ──────────────────────────────────

/** World-space position of a single axle for canvas rendering */
export interface AxleWorldPosition {
  x: number;        // world X coordinate
  y: number;        // world Y coordinate
  weight: number;   // kN (positive = downward)
  elementId: number;
  /** Element direction cosine (dx/L) */
  cosTheta: number;
  /** Element direction sine (dy/L) */
  sinTheta: number;
}

/**
 * Compute world-space positions of all axles for a given reference position.
 * Used by the Viewport to render moving load arrows.
 */
export function computeAxleWorldPositions(
  refPos: number,
  train: LoadTrain,
  path: PathSegment[],
  getNode: (id: number) => { x: number; y: number } | undefined,
): AxleWorldPosition[] {
  if (path.length === 0) return [];
  const totalLength = path[path.length - 1].cumStart + path[path.length - 1].length;

  const result: AxleWorldPosition[] = [];
  for (const axle of train.axles) {
    const pos = refPos + axle.offset;
    if (pos < 0 || pos > totalLength) continue;

    const seg = path.find(s => pos >= s.cumStart && pos <= s.cumStart + s.length);
    if (!seg) continue;

    const t = (pos - seg.cumStart) / seg.length;
    const nodeI = getNode(seg.nodeI);
    const nodeJ = getNode(seg.nodeJ);
    if (!nodeI || !nodeJ) continue;

    const cosTheta = seg.dx / seg.length;
    const sinTheta = seg.dy / seg.length;

    result.push({
      x: nodeI.x + t * (nodeJ.x - nodeI.x),
      y: nodeI.y + t * (nodeJ.y - nodeI.y),
      weight: axle.weight,
      elementId: seg.elementId,
      cosTheta,
      sinTheta,
    });
  }
  return result;
}
