// Moving load analysis — envelope of moving load trains across a structure

import type { SolverInput, SolverLoad, AnalysisResults, FullEnvelope, ElementEnvelopeDiagram, EnvelopeDiagramData } from './types';
import { errorText as baseErrorText } from '../utils/error-text';
import { solve, isWasmReady } from './wasm-solver';
import { analyzeKinematics, type KinematicResult } from './kinematic-2d';
import { computeDiagramValueAt } from './diagrams';
import { t } from '../i18n';
import { withoutSettlement } from './settlement-case';

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
    // Each segment runs in the direction of travel: from the node it shares with
    // the previous member (for the first, away from the node it shares with the
    // next), whichever way the member itself was drawn.
    const elems = pathElementIds.map((eid) => input.elements.get(eid)).filter((e) => e !== undefined);
    let cumDist = 0;
    let prevEnd: number | undefined;
    for (let k = 0; k < elems.length; k++) {
      const elem = elems[k];
      let from = elem.nodeI, to = elem.nodeJ;
      if (prevEnd !== undefined) {
        if (elem.nodeJ === prevEnd) { from = elem.nodeJ; to = elem.nodeI; }
      } else if (k + 1 < elems.length) {
        const next = elems[k + 1];
        if (elem.nodeI === next.nodeI || elem.nodeI === next.nodeJ) { from = elem.nodeJ; to = elem.nodeI; }
      }
      const ni = input.nodes.get(from)!;
      const nj = input.nodes.get(to)!;
      const dx = nj.x - ni.x;
      const dy = nj.z - ni.z;
      const L = Math.sqrt(dx * dx + dy * dy);
      segments.push({ elementId: elem.id, nodeI: from, nodeJ: to, length: L, cumStart: cumDist, dx, dy });
      cumDist += L;
      prevEnd = to;
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

    const ni = input.nodes.get(current)!;
    const nj = input.nodes.get(best.otherNode)!;
    const dx = nj.x - ni.x;
    const dy = nj.z - ni.z;
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
/**
 * Check if a train is symmetric (single axle or mirror-symmetric weights).
 */
function isTrainSymmetric(train: LoadTrain): boolean {
  if (train.axles.length <= 1) return true;
  const maxOff = Math.max(...train.axles.map(a => a.offset));
  for (const axle of train.axles) {
    const mirror = maxOff - axle.offset;
    const pair = train.axles.find(a => Math.abs(a.offset - mirror) < 1e-6);
    if (!pair || Math.abs(pair.weight - axle.weight) > 1e-6) return false;
  }
  return true;
}

/**
 * Create a reversed copy of a train (mirror axle order so it travels right-to-left).
 */
function reverseTrain(train: LoadTrain): LoadTrain {
  const maxOff = Math.max(...train.axles.map(a => a.offset));
  return {
    name: train.name,
    axles: train.axles.map(a => ({ offset: maxOff - a.offset, weight: a.weight })),
  };
}

/**
 * The loads a downward force `weight` puts on the structure when it stands at
 * distance `a` from node I of `elementId` — node I of the ELEMENT, not of the
 * path walking over it.
 *
 * On a frame member it is the member's own transverse point load plus the axial
 * component shared by its end nodes, exactly as the static solve splits a global
 * point load (solver-service.ts buildSolverLoads2D). On a truss bar the engine
 * assembles no member load at all, so the force reaches the bar's two nodes by
 * the lever rule — the only way a bar that carries no bending can take it, and
 * how a deck resting on a truss loads it.
 *
 * Shared by the moving load (each axle) and the influence line (the unit load),
 * so the two place a load the same way.
 */
export function verticalLoadOnMember(input: SolverInput, elementId: number, a: number, weight: number): SolverLoad[] {
  const elem = input.elements.get(elementId);
  if (!elem) return [];
  const ni = input.nodes.get(elem.nodeI);
  const nj = input.nodes.get(elem.nodeJ);
  if (!ni || !nj) return [];
  const dx = nj.x - ni.x;
  const dz = nj.z - ni.z;
  const L = Math.hypot(dx, dz);
  if (L < 1e-12) return [];
  const t = Math.min(1, Math.max(0, a / L));
  const c = dx / L;
  const s = dz / L;

  if (elem.type === 'truss') {
    return [
      { type: 'nodal', data: { nodeId: elem.nodeI, fx: 0, fz: -weight * (1 - t), my: 0 } },
      { type: 'nodal', data: { nodeId: elem.nodeJ, fx: 0, fz: -weight * t, my: 0 } },
    ];
  }

  const out: SolverLoad[] = [];
  const pPerp = -weight * c;
  if (Math.abs(pPerp) > 1e-10) {
    out.push({ type: 'pointOnElement', data: { elementId, a: t * L, p: pPerp } });
  }
  const pAxial = -weight * s;
  if (Math.abs(pAxial) > 1e-10) {
    const fI = pAxial * (1 - t);
    const fJ = pAxial * t;
    out.push(
      { type: 'nodal', data: { nodeId: elem.nodeI, fx: fI * c, fz: fI * s, my: 0 } },
      { type: 'nodal', data: { nodeId: elem.nodeJ, fx: fJ * c, fz: fJ * s, my: 0 } },
    );
  }
  return out;
}

/**
 * Build the load array for a single train position on the path.
 *
 * The path is walked in the direction of travel, which on a member drawn the
 * other way runs from the member's node J to its node I. The axle's point is
 * found on the path and then measured from the ELEMENT's node I: measuring it
 * from the path's node put the axle at the mirrored point, and taking the
 * perpendicular from the path's direction made it push upward.
 */
function buildTrainLoads(
  input: SolverInput,
  train: LoadTrain,
  refPos: number,
  totalLength: number,
  path: PathSegment[],
): SolverInput['loads'] {
  const loads: SolverInput['loads'] = [];

  for (const axle of train.axles) {
    const pos = refPos + axle.offset;
    if (pos < 0 || pos > totalLength) continue;

    const seg = path.find(s => pos >= s.cumStart && pos <= s.cumStart + s.length);
    if (!seg) continue;
    const elem = input.elements.get(seg.elementId);
    if (!elem) continue;

    const f = (pos - seg.cumStart) / seg.length;
    // Along the path f runs from seg.nodeI; the element's own node I is at 0 or at 1.
    const tElem = elem.nodeI === seg.nodeI ? f : 1 - f;
    loads.push(...verticalLoadOnMember(input, seg.elementId, tElem * seg.length, axle.weight));
  }

  return loads;
}

type ElementEnvelope = { mMaxPos: number; mMaxNeg: number; vMaxPos: number; vMaxNeg: number; nMaxPos: number; nMaxNeg: number };

/** Fold one position's end forces into the per-element envelope. */
function accumulate(envelope: Map<number, ElementEnvelope>, results: AnalysisResults): void {
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
}

/** A thrown value as text: the WASM throws strings, JS throws Errors (`utils/error-text`). */
export function errorText(e: unknown): string {
  return baseErrorText(e, String(e));
}

/**
 * The structure the train runs on: the train alone, as the 3D sweep and the influence line
 * solve it. The model's own loads (self-weight included) and its support settlements are not
 * part of a moving-load envelope; kept, they were added to every position and shifted every
 * peak by the static result.
 */
function trainBase(input: SolverInput): SolverInput {
  return { ...input, loads: [], supports: withoutSettlement(input.supports) };
}

/**
 * Solve a single position. A position that fails refuses the whole run: an
 * envelope missing the positions that failed would read as complete.
 */
function solvePosition(
  baseInput: SolverInput,
  train: LoadTrain,
  refPos: number,
  path: PathSegment[],
  totalLength: number,
  envelope: Map<number, ElementEnvelope>,
  positions: MovingLoadEnvelope['positions'],
): string | null {
  const loads = buildTrainLoads(baseInput, train, refPos, totalLength, path);
  const input: SolverInput = { ...baseInput, loads };

  try {
    const results = solve(input);
    positions.push({ refPosition: refPos, results });
    accumulate(envelope, results);
    return null;
  } catch (e) {
    return t('svc.solverError').replace('{n}', errorText(e));
  }
}

/**
 * The static solve's kinematic gate, run once before the sweep.
 *
 * Every position solves the same stiffness, so a mechanism is a mechanism at
 * all of them. The engine does not refuse it on its own: the vanishing spring
 * it adds keeps the system solvable, and the sweep used to come back with an
 * envelope of numbers in the 1e11 range. Refused here with the diagnosis the
 * static solve shows (solver-service.ts prepareSolve2D). If the check itself
 * cannot run, the sweep goes on, as the static solve does.
 */
function mechanismRefusal(input: SolverInput): string | null {
  let k: KinematicResult;
  try {
    k = analyzeKinematics({ ...input, loads: [] });
  } catch {
    return null;
  }
  if (k.rankAnalysis === 'unavailable' || k.isSolvable) return null;
  return k.invalidInput ? t('svc.solverError').replace('{n}', k.invalidInput) : k.diagnosis;
}

/**
 * Compute forward reference positions for a train on a path.
 */
function computeRefPositions(train: LoadTrain, totalLength: number, step: number): number[] {
  const maxAxleOffset = Math.max(...train.axles.map(a => a.offset));
  const positions: number[] = [];
  for (let refPos = -maxAxleOffset; refPos <= totalLength; refPos += step) {
    positions.push(refPos);
  }
  return positions;
}

/**
 * For each forward refPos, compute the mirror reverse refPos so that
 * the reversed train produces the exact mirror loading on the structure.
 * Forward train at r places axles at [r+o₁, r+o₂, ...].
 * Mirror: reversed train at (L - r - maxOffset) places axles at [L-r-o₁, L-r-o₂, ...].
 */
function mirrorRefPositions(forwardPositions: number[], totalLength: number, maxAxleOffset: number): number[] {
  return forwardPositions.map(r => totalLength - r - maxAxleOffset);
}


/**
 * Per-element extremes, taken from the POINTWISE envelope rather than from
 * element end values.
 *
 * The envelope built while sweeping compares `ef.mStart` and `ef.mEnd`, which
 * are the moments at the two ENDS of a member. A simply supported span modelled
 * as one element has zero moment at both ends at every load position, so the
 * per-element envelope came out at 1e-14 for a beam whose real envelope peaks
 * at PL/4 — the entire result, missed, because the maximum lives in the span.
 *
 * The pointwise envelope already samples along each member, so the extremes are
 * read from it. Nothing extra is solved.
 *
 * It went unnoticed because the viewport draws the pointwise curves and never
 * reads this map. That makes it a trap rather than a visible bug: the next
 * caller wanting "the worst moment in member 3" would reach for the obvious
 * field and get zero.
 */
function elementExtremesFromPointwise(
  envelope: MovingLoadEnvelope['elements'],
  full: FullEnvelope | undefined,
): void {
  if (!full) return;
  const apply = (
    curves: { elements: Array<{ elementId: number; posValues: number[]; negValues: number[] }> } | undefined,
    pos: 'mMaxPos' | 'vMaxPos' | 'nMaxPos',
    neg: 'mMaxNeg' | 'vMaxNeg' | 'nMaxNeg',
  ) => {
    for (const e of curves?.elements ?? []) {
      const env = envelope.get(e.elementId);
      if (!env) continue;
      for (const v of e.posValues) if (v > env[pos]) env[pos] = v;
      for (const v of e.negValues) if (v < env[neg]) env[neg] = v;
    }
  };
  apply(full.moment, 'mMaxPos', 'mMaxNeg');
  apply(full.shear, 'vMaxPos', 'vMaxNeg');
  apply(full.axial, 'nMaxPos', 'nMaxNeg');
}

export function solveMovingLoads(
  baseInput: SolverInput,
  config: MovingLoadConfig,
): MovingLoadEnvelope | string {
  if (!isWasmReady()) return t('toast.solverNotReady');
  baseInput = trainBase(baseInput);
  const step = config.step ?? 0.25;
  const path = buildPath(baseInput, config.pathElementIds);

  if (path.length === 0) return t('train.noPathFound');

  const totalLength = path[path.length - 1].cumStart + path[path.length - 1].length;

  const envelope = new Map<number, ElementEnvelope>();
  for (const seg of path) {
    envelope.set(seg.elementId, {
      mMaxPos: 0, mMaxNeg: 0,
      vMaxPos: 0, vMaxNeg: 0,
      nMaxPos: 0, nMaxNeg: 0,
    });
  }

  const refused = mechanismRefusal(baseInput);
  if (refused) return refused;

  const positions: MovingLoadEnvelope['positions'] = [];
  const forwardTrain = config.train;
  const maxAxleOffset = Math.max(...forwardTrain.axles.map(a => a.offset));
  const forwardRefPositions = computeRefPositions(forwardTrain, totalLength, step);

  // Forward pass
  for (const refPos of forwardRefPositions) {
    const err = solvePosition(baseInput, forwardTrain, refPos, path, totalLength, envelope, positions);
    if (err) return err;
  }

  // Reverse pass for asymmetric trains — use mirror positions for exact symmetry
  if (!isTrainSymmetric(forwardTrain)) {
    const revTrain = reverseTrain(forwardTrain);
    const reverseRefPositions = mirrorRefPositions(forwardRefPositions, totalLength, maxAxleOffset);
    for (const refPos of reverseRefPositions) {
      const err = solvePosition(baseInput, revTrain, refPos, path, totalLength, envelope, positions);
      if (err) return err;
    }
  }

  if (positions.length === 0) return t('train.noPositionSolved');

  const allResults = positions.map(p => p.results);
  const fullEnvelope = computePointwiseEnvelope(allResults);
  elementExtremesFromPointwise(envelope, fullEnvelope);

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
  if (!isWasmReady()) return t('toast.solverNotReady');
  baseInput = trainBase(baseInput);
  const step = config.step ?? 0.25;
  const path = buildPath(baseInput, config.pathElementIds);

  if (path.length === 0) return t('train.noPathFound');

  const totalLength = path[path.length - 1].cumStart + path[path.length - 1].length;

  const envelope = new Map<number, ElementEnvelope>();
  for (const seg of path) {
    envelope.set(seg.elementId, {
      mMaxPos: 0, mMaxNeg: 0,
      vMaxPos: 0, vMaxNeg: 0,
      nMaxPos: 0, nMaxNeg: 0,
    });
  }

  const refused = mechanismRefusal(baseInput);
  if (refused) return refused;

  // Pre-compute all positions: forward + mirrored reverse for asymmetric trains
  const forwardTrain = config.train;
  const maxAxleOffset = Math.max(...forwardTrain.axles.map(a => a.offset));
  const forwardRefPositions = computeRefPositions(forwardTrain, totalLength, step);

  const allRefPositions: Array<{ train: LoadTrain; refPos: number }> = [];
  for (const refPos of forwardRefPositions) {
    allRefPositions.push({ train: forwardTrain, refPos });
  }
  if (!isTrainSymmetric(forwardTrain)) {
    const revTrain = reverseTrain(forwardTrain);
    const reverseRefPositions = mirrorRefPositions(forwardRefPositions, totalLength, maxAxleOffset);
    for (const refPos of reverseRefPositions) {
      allRefPositions.push({ train: revTrain, refPos });
    }
  }
  const total = allRefPositions.length;

  const positions: MovingLoadEnvelope['positions'] = [];

  for (let idx = 0; idx < total; idx++) {
    if (signal?.aborted) return t('train.analysisCancelled');

    const { train, refPos } = allRefPositions[idx];
    const err = solvePosition(baseInput, train, refPos, path, totalLength, envelope, positions);
    if (err) return err;

    onProgress?.({ current: idx + 1, total, refPosition: refPos });
    await new Promise(r => setTimeout(r, 0));
  }

  if (signal?.aborted) return t('train.analysisCancelled');
  if (positions.length === 0) return t('train.noPositionSolved');

  const allResults = positions.map(p => p.results);
  const fullEnvelope = computePointwiseEnvelope(allResults);
  elementExtremesFromPointwise(envelope, fullEnvelope);

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
      if (Math.abs(res.displacements[i].uz) > Math.abs(displacements[i].uz)) displacements[i].uz = res.displacements[i].uz;
      if (Math.abs(res.displacements[i].ry) > Math.abs(displacements[i].ry)) displacements[i].ry = res.displacements[i].ry;
    }
    for (let i = 0; i < res.reactions.length && i < reactions.length; i++) {
      if (Math.abs(res.reactions[i].rx) > Math.abs(reactions[i].rx)) reactions[i].rx = res.reactions[i].rx;
      if (Math.abs(res.reactions[i].rz) > Math.abs(reactions[i].rz)) reactions[i].rz = res.reactions[i].rz;
      if (Math.abs(res.reactions[i].my) > Math.abs(reactions[i].my)) reactions[i].my = res.reactions[i].my;
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
