// Moving load analysis — envelope of moving load trains across a structure

import type { SolverInput, SolverLoad, AnalysisResults, ElementForces, FullEnvelope } from './types';
import { errorText as baseErrorText } from '../utils/error-text';
import { computeEnvelope, prepareLoadSession2D, isWasmReady, movingSegmentRoundoff } from './wasm-solver';
import { analyzeKinematics, type KinematicResult } from './kinematic-2d';
import { t } from '../i18n';
import { localizeEngineText } from '../i18n/engine-text';
import { withoutSettlement } from './settlement-case';
import { computeDiagramValueAt } from './diagrams';
import { envelopeForceExtrema, inwardEnvelopeEndIndices } from './member-diagram';
import { envelopeJumpCuts } from './diagram-cut';
import { locateAxle, locateAxlePlacement, checkAxlePath, referenceGrid, referenceStation, type ReferencePosition, type RouteSegment } from './moving-axle-station';
import { axleFaceForce, MovingSample, recoverAxleFace, type AxleFace, type FaceLoads } from './moving-sample';

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
  structuredDiagnostics?: AnalysisResults['structuredDiagnostics'];
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

export interface PathSegment extends RouteSegment {
  elementId: number;
  nodeI: number;
  nodeJ: number;
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
  let roundoff = 0;

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
      const lengthRoundoff = movingSegmentRoundoff(ni, nj);
      const startRoundoff = roundoff;
      roundoff += lengthRoundoff;
      segments.push({
        elementId: elem.id, nodeI: from, nodeJ: to, length: L, cumStart: cumDist, dx, dy,
        lengthRoundoff, startRoundoff, endRoundoff: roundoff,
      });
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

    const lengthRoundoff = movingSegmentRoundoff(ni, nj);
    const startRoundoff = roundoff;
    roundoff += lengthRoundoff;
    segments.push({
      lengthRoundoff, startRoundoff, endRoundoff: roundoff,
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
 * Shared by the moving load (each axle) and the influence line (the unit load),
 * so the two place a load the same way.
 */
export function verticalLoadOnMember(input: SolverInput, elementId: number, a: number, weight: number): SolverLoad[] {
  return loadOnMember(input, elementId, a, weight, DOWN);
}

/** The global direction of a downward load: −Z. */
const DOWN = { x: 0, z: -1 } as const;

/**
 * As `verticalLoadOnMember`, for a force `weight` along any global direction `dir` (a unit
 * vector in X, Z): the influence line's unit load may also act across, as on a wall.
 */
export function loadOnMember(
  input: SolverInput, elementId: number, a: number, weight: number, dir: { x: number; z: number },
): SolverLoad[] {
  const elem = input.elements.get(elementId);
  if (!elem) return [];
  const ni = input.nodes.get(elem.nodeI);
  const nj = input.nodes.get(elem.nodeJ);
  if (!ni || !nj) return [];
  const dx = nj.x - ni.x;
  const dz = nj.z - ni.z;
  const L = Math.hypot(dx, dz);
  if (L < 1e-12) return [];
  const station = Math.min(L, Math.max(0, a));
  const t = station / L;
  const c = dx / L;
  const s = dz / L;
  const Fx = weight * dir.x, Fz = weight * dir.z;

  if (elem.type === 'truss') {
    return [
      { type: 'nodal', data: { nodeId: elem.nodeI, fx: Fx * (1 - t), fz: Fz * (1 - t), my: 0 } },
      { type: 'nodal', data: { nodeId: elem.nodeJ, fx: Fx * t, fz: Fz * t, my: 0 } },
    ];
  }

  const p = -s * Fx + c * Fz;
  const px = c * Fx + s * Fz;
  const transverse = Math.abs(p) > 1e-10 ? p : 0;
  const axial = Math.abs(px) > 1e-10 ? px : 0;
  if (transverse === 0 && axial === 0) return [];
  return [{ type: 'pointOnElement', data: { elementId, a: station, p: transverse, ...(axial === 0 ? {} : { px: axial }) } }];
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
  refPos: ReferencePosition,
  path: PathSegment[],
): MovingSample<SolverLoad> {
  const sample = new MovingSample<SolverLoad>();

  for (const axle of train.axles) {
    const at = locateAxlePlacement(path, refPos, axle.offset, (seg) => input.elements.get(seg.elementId)!.nodeI !== seg.nodeI);
    if (!at) continue;
    if (at.kind === 'interior') {
      sample.loads.push(...verticalLoadOnMember(input, at.segment.elementId, at.a, axle.weight));
      continue;
    }
    const face = (routeFace: typeof at.faces[number]): AxleFace | undefined => {
      if (!routeFace) return undefined;
      const { segment, atEnd } = routeFace;
      const { dx, dy, length, elementId } = segment;
      const elem = input.elements.get(elementId)!;
      const direction = elem.nodeI === segment.nodeI ? -1 : 1;
      const weight = direction * axle.weight;
      return {
        elementId,
        nodeId: atEnd ? elem.nodeJ : elem.nodeI,
        atEnd,
        force: axleFaceForce([weight * (dy / length), 0, weight * (dx / length)], elem.type === 'truss'),
      };
    };
    sample.addJoint([face(at.faces[0]), face(at.faces[1])], (nodeId) => (
      { type: 'nodal', data: { nodeId, fx: 0, fz: -axle.weight, my: 0 } }
    ));
  }

  return sample;
}

type ElementEnvelope = { mMaxPos: number; mMaxNeg: number; vMaxPos: number; vMaxNeg: number; nMaxPos: number; nMaxNeg: number };

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
type EndRange = { min: number; max: number };
type FaceComponent = 'shear' | 'axial';

class PlanarSweepResults {
  readonly positions: MovingLoadEnvelope['positions'] = [];
  readonly results: AnalysisResults[] = [];
  readonly faces = new Map<number, Record<FaceComponent, [EndRange, EndRange]>>();

  foldFaces(results: AnalysisResults, faces: FaceLoads): void {
    for (const ef of results.elementForces) {
      const loads = faces.get(ef.elementId);
      if (!loads) continue;
      let ranges = this.faces.get(ef.elementId);
      if (!ranges) {
        const range = () => ({ min: 0, max: 0 });
        ranges = { shear: [range(), range()], axial: [range(), range()] };
        this.faces.set(ef.elementId, ranges);
      }
      for (const end of [0, 1] as const) {
        for (const [kind, axis] of [['shear', 2], ['axial', 0]] as const) {
          const load = loads[end][axis];
          if (load === 0) continue;
          const value = recoverAxleFace(end, load, kind === 'axial',
            (t, right) => computeDiagramValueAt(kind, t, ef, right));
          const range = ranges[kind][end];
          range.min = Math.min(range.min, value);
          range.max = Math.max(range.max, value);
        }
      }
    }
  }
}

function solvePosition(
  baseInput: SolverInput,
  train: LoadTrain,
  refPos: ReferencePosition,
  path: PathSegment[],
  sweep: PlanarSweepResults,
  session: ReturnType<typeof prepareLoadSession2D>,
): string | null {
  try {
    const sample = buildTrainLoads(baseInput, train, refPos, path);
    const solve = (loads: SolverLoad[]) => {
      const result = session.solve(loads);
      if (result.structuredDiagnostics?.some(d => d.code === 'known_issue' && d.severity === 'error')) {
        throw new Error(JSON.stringify({ structuredDiagnostics: result.structuredDiagnostics }));
      }
      return result;
    };
    const results = solve(sample.loads);
    sweep.results.push(results);
    sample.foldLimits(results, solve, (limit, faces, reuse) => {
      if (!reuse) sweep.results.push(limit);
      sweep.foldFaces(limit, faces);
    });
    sweep.positions.push({ refPosition: referenceStation(refPos), results });
    return null;
  } catch (e) {
    return t('svc.solverError').replace('{n}', localizeEngineText(errorText(e)));
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

function planarPositionPasses(train: LoadTrain, path: PathSegment[], step: number) {
  if (train.axles.length === 0) return [];
  const last = path[path.length - 1];
  const total = last.cumStart + last.length;
  const maxOffset = Math.max(...train.axles.map((axle) => axle.offset));
  checkAxlePath(path);
  const grid = referenceGrid(-maxOffset, total, step, last.endRoundoff);
  const forward = { train, refs: grid.positions() };
  if (isTrainSymmetric(train)) return [forward];
  const reverse = reverseTrain(train);
  return [forward, { train: reverse, refs: grid.positions(true) }];
}

function elementExtremesFromPointwise(
  envelope: MovingLoadEnvelope['elements'],
  full: FullEnvelope,
  members: ReadonlyMap<number, ElementForces>,
): void {
  const apply = (
    curves: FullEnvelope['moment'],
    pos: 'mMaxPos' | 'vMaxPos' | 'nMaxPos',
    neg: 'mMaxNeg' | 'vMaxNeg' | 'nMaxNeg',
  ) => {
    for (const e of curves.elements) {
      const env = envelope.get(e.elementId);
      if (!env) continue;
      const range = envelopeForceExtrema(e, members.get(e.elementId)!.length);
      env[pos] = Math.max(env[pos], range.max.value);
      env[neg] = Math.min(env[neg], range.min.value);
    }
  };
  apply(full.moment, 'mMaxPos', 'mMaxNeg');
  apply(full.shear, 'vMaxPos', 'vMaxNeg');
  apply(full.axial, 'nMaxPos', 'nMaxNeg');
}

function includeAxleFaces(
  full: FullEnvelope, faces: PlanarSweepResults['faces'], members: ReadonlyMap<number, ElementForces>,
): void {
  for (const kind of ['shear', 'axial'] as const) {
    const diagram = full[kind];
    for (const element of diagram.elements) {
      const ranges = faces.get(element.elementId)?.[kind];
      if (!ranges) continue;
      const forces = members.get(element.elementId)!;
      element.jumpCuts ??= envelopeJumpCuts(element, forces.length);
      const indices = inwardEnvelopeEndIndices(element, forces.length);
      for (const end of [0, 1] as const) {
        const index = indices[end];
        const { min, max } = ranges[end];
        element.posValues[index] = Math.max(element.posValues[index], max);
        element.negValues[index] = Math.min(element.negValues[index], min);
        diagram.globalMax = Math.max(diagram.globalMax, max, -min);
        const value = max >= -min ? max : min;
        const key = kind === 'axial' ? (end === 0 ? 'nStart' : 'nEnd') : (end === 0 ? 'vStart' : 'vEnd');
        if (Math.abs(value) > Math.abs(forces[key])) forces[key] = value;
      }
    }
  }
}

function movingEnvelope(sweep: PlanarSweepResults, train: LoadTrain, path: PathSegment[]): MovingLoadEnvelope | string {
  const { positions, results, faces } = sweep;
  if (positions.length === 0) return t('train.noPositionSolved');
  try {
    const fullEnvelope = computePointwiseEnvelope(results);
    const elements = new Map<number, ElementEnvelope>();
    for (const { elementId } of path) {
      elements.set(elementId, { mMaxPos: 0, mMaxNeg: 0, vMaxPos: 0, vMaxNeg: 0, nMaxPos: 0, nMaxNeg: 0 });
    }
    if (fullEnvelope) {
      const members = new Map(fullEnvelope.maxAbsResults.elementForces.map(ef => [ef.elementId, ef]));
      includeAxleFaces(fullEnvelope, faces, members);
      elementExtremesFromPointwise(elements, fullEnvelope, members);
    }
    const structuredDiagnostics = [...new Map(results.flatMap(r => r.structuredDiagnostics ?? []).map(d => [JSON.stringify(d), d])).values()];
    return { structuredDiagnostics, elements, positions, fullEnvelope, train, path };
  } catch (e) {
    return t('svc.solverError').replace('{n}', localizeEngineText(errorText(e)));
  }
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
  let passes: ReturnType<typeof planarPositionPasses>;
  try { passes = planarPositionPasses(config.train, path, step); }
  catch (error) { return localizeEngineText(errorText(error)); }

  const refused = mechanismRefusal(baseInput);
  if (refused) return refused;

  const session = prepareLoadSession2D(baseInput);
  try {
    const sweep = new PlanarSweepResults();
    for (const { train, refs } of passes) {
      for (const refPos of refs) {
        const err = solvePosition(baseInput, train, refPos, path, sweep, session);
        if (err) return err;
      }
    }

    return movingEnvelope(sweep, config.train, path);
  } finally { session.free(); }
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
  let passes: ReturnType<typeof planarPositionPasses>;
  try { passes = planarPositionPasses(config.train, path, step); }
  catch (error) { return localizeEngineText(errorText(error)); }

  const refused = mechanismRefusal(baseInput);
  if (refused) return refused;

  const allRefPositions = passes.flatMap(({ train, refs }) => refs.map((refPos) => ({ train, refPos })));
  const total = allRefPositions.length;

  const session = prepareLoadSession2D(baseInput);
  try {
    const sweep = new PlanarSweepResults();

    for (let idx = 0; idx < total; idx++) {
      if (signal?.aborted) return t('train.analysisCancelled');

      const { train, refPos } = allRefPositions[idx];
      const err = solvePosition(baseInput, train, refPos, path, sweep, session);
      if (err) return err;

      onProgress?.({ current: idx + 1, total, refPosition: referenceStation(refPos) });
      await new Promise(r => setTimeout(r, 0));
    }

    if (signal?.aborted) return t('train.analysisCancelled');
    return movingEnvelope(sweep, config.train, path);
  } finally { session.free(); }
}

export function computePointwiseEnvelope(results: AnalysisResults[]): FullEnvelope | undefined {
  return results.length ? computeEnvelope(results) ?? undefined : undefined;
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
  const result: AxleWorldPosition[] = [];
  for (const axle of train.axles) {
    const at = locateAxle(path, refPos, axle.offset, () => false);
    if (!at) continue;
    const { segment: seg, a } = at;
    const t = a / seg.length;
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
