import { requireCableAnalysis } from './analysis-validity';
import { isContainmentRefusal } from './containment-error';
import type { StructuredDiagnostic } from './types';
/**
 * Moving loads on a 3D model: a train of axles along a path of members, the envelope of every
 * member's forces over all positions.
 *
 * ── Why the app sweeps the positions itself ───────────────────────
 *
 * The engine has a 3D moving-load routine, and it takes each member's envelope from the forces
 * at its two ends. The largest moment under a moving axle is under the axle, inside the member,
 * so on a simply supported span modelled as one member it reports zero for a beam whose real
 * envelope is P·L/4. The 2D path met the same thing and reads its pointwise envelope instead
 * (`moving-loads.ts`). Here each position reuses a prepared 3D factorization and is read at the
 * member's critical stations (`station-forces.ts`), which include every point-load position, so
 * the maximum under each axle is read where it occurs.
 *
 * ── The loads ────────────────────────────────────────────────────
 *
 * Each axle weighs downward (−Z in the solver's frame, which is also the frame a flat model is
 * embedded in).
 * A train that is not symmetric also runs the other way, on the mirrored positions.
 */
import { prepareLoadSession3D, movingFaceForce, movingSegmentRoundoff } from './wasm-solver';
import { computeLocalAxes3D } from './local-axes-3d';
import { criticalForceStations, extractForcesAtStation } from './station-forces';
import type { SolverInput3D, SolverLoad3D, AnalysisResults3D } from './types-3d';
import type { LoadTrain } from './moving-loads';
import { buildSolverInput3D, type ModelData } from './solver-service';
import { withoutSettlement } from './settlement-case';
import { checkAxlePath, locateAxlePlacement, referenceStation, type ReferencePosition, type RouteSegment } from './moving-axle-station';
// The position cases read the same symmetry and the same reversed train (`vehicles.ts`).
import { positionPasses, usableStep } from './vehicles';
import { axleFaceForce, MovingSample, type AxleFace, type FaceLoads } from './moving-sample';

export interface PathSegment3D extends RouteSegment {
  elementId: number;
  /** Node the path enters the member by. */
  from: number;
  to: number;
  /** True when the path runs from the member's node J to node I. */
  reversed: boolean;
}

export type EnvelopeComponent = 'n' | 'vy' | 'vz' | 'my' | 'mz' | 'torsion';
export const ENVELOPE_COMPONENTS: readonly EnvelopeComponent[] = ['n', 'vy', 'vz', 'my', 'mz', 'torsion'];

export interface Extreme { value: number; x: number; position: number }

export interface MovingEnvelope3D {
  structuredDiagnostics: StructuredDiagnostic[];
  /** Per member, per component: the largest and the smallest value, where, and the reference axle's position. */
  elements: Map<number, Record<EnvelopeComponent, { max: Extreme; min: Extreme }>>;
  path: PathSegment3D[];
  train: LoadTrain;
  positions: number;
  failed: number;
}

/**
 * Order `ids` into a chain, each member entered at the node it shares with the previous one.
 * Null when the members do not form one open chain.
 */
export function buildPath3D(input: SolverInput3D, ids: number[]): PathSegment3D[] | null {
  const els = ids.map((id) => input.elements.get(id)).filter((e): e is NonNullable<typeof e> => !!e);
  if (els.length === 0 || els.length !== ids.length) return null;
  const degree = new Map<number, number>();
  for (const e of els) for (const n of [e.nodeI, e.nodeJ]) degree.set(n, (degree.get(n) ?? 0) + 1);
  if ([...degree.values()].some((d) => d > 2)) return null;
  const ends = [...degree].filter(([, d]) => d === 1).map(([n]) => n);
  if (ends.length !== 2) return null;
  // Start at the end the first listed member touches, so the user's order sets the direction.
  const first = els[0]!;
  let at = ends.includes(first.nodeI) ? first.nodeI : ends.includes(first.nodeJ) ? first.nodeJ : ends[0]!;
  const left = new Set(els.map((e) => e.id));
  const out: PathSegment3D[] = [];
  let cum = 0, roundoff = 0;
  while (left.size > 0) {
    const e = els.find((x) => left.has(x.id) && (x.nodeI === at || x.nodeJ === at));
    if (!e) return null;
    left.delete(e.id);
    const reversed = e.nodeJ === at;
    const a = input.nodes.get(e.nodeI)!, b = input.nodes.get(e.nodeJ)!;
    const L = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
    const lengthRoundoff = movingSegmentRoundoff(a, b);
    const startRoundoff = roundoff;
    roundoff += lengthRoundoff;
    out.push({
      elementId: e.id, from: at, to: reversed ? e.nodeI : e.nodeJ, length: L, cumStart: cum, reversed,
      lengthRoundoff, startRoundoff, endRoundoff: roundoff,
    });
    cum += L;
    at = reversed ? e.nodeI : e.nodeJ;
  }
  return out;
}

/** The solver loads of `train` with its reference axle at `refPos` along the path. */
export function trainLoads(input: SolverInput3D, path: PathSegment3D[], train: LoadTrain, refPos: ReferencePosition): SolverLoad3D[] {
  checkAxlePath(path);
  const sample = new MovingSample<SolverLoad3D>();
  addTrain(sample, input, path, train, refPos);
  return sample.loads;
}

function addTrain(
  sample: MovingSample<SolverLoad3D>, input: SolverInput3D, path: PathSegment3D[],
  train: LoadTrain, refPos: ReferencePosition,
): void {
  const axleOn = (elementId: number, weight: number) => {
    const e = input.elements.get(elementId)!;
    const ni = input.nodes.get(e.nodeI)!, nj = input.nodes.get(e.nodeJ)!;
    const localY = e.localYx !== undefined && e.localYy !== undefined && e.localYz !== undefined
      ? { x: e.localYx, y: e.localYy, z: e.localYz } : undefined;
    const axes = computeLocalAxes3D(ni, nj, localY, e.rollAngle ?? 0, input.leftHand);
    const force: AxleFace['force'] = [-weight * axes.ex[2], -weight * axes.ey[2], -weight * axes.ez[2]];
    return { e, force };
  };
  for (const axle of train.axles) {
    const at = locateAxlePlacement(path, refPos, axle.offset, (seg) => seg.reversed);
    if (!at) continue;
    if (at.kind === 'joint') {
      const face = (routeFace: typeof at.faces[number]): AxleFace | undefined => {
        if (!routeFace) return undefined;
        const { segment, atEnd } = routeFace;
        const { e, force } = axleOn(segment.elementId, axle.weight);
        return {
          elementId: e.id, nodeId: atEnd ? e.nodeJ : e.nodeI, atEnd,
          force: axleFaceForce(force, e.type === 'truss'),
        };
      };
      sample.addJoint([face(at.faces[0]), face(at.faces[1])], (nodeId) => (
        { type: 'nodal', data: { nodeId, fx: 0, fy: 0, fz: -axle.weight, mx: 0, my: 0, mz: 0 } }
      ));
      continue;
    }
    const { segment: seg, a } = at;
    const { e, force: [px, py, pz] } = axleOn(seg.elementId, axle.weight);
    if (px !== 0 || py !== 0 || pz !== 0) {
      sample.loads.push({ type: 'pointOnElement', data: { elementId: e.id, a, px, py, pz } });
    }
  }
}

function blank(): Record<EnvelopeComponent, { max: Extreme; min: Extreme }> {
  const e = () => ({ max: { value: 0, x: 0, position: 0 }, min: { value: 0, x: 0, position: 0 } });
  return { n: e(), vy: e(), vz: e(), my: e(), mz: e(), torsion: e() };
}

/** Fold one position's results into the envelope, at each member's critical stations. */
export function foldPosition(
  env: MovingEnvelope3D['elements'], results: AnalysisResults3D, position: number, faces?: FaceLoads, reuse = false,
): void {
  const include = (component: { max: Extreme; min: Extreme }, value: number, x: number) => {
    if (value > component.max.value) component.max = { value, x, position };
    if (value < component.min.value) component.min = { value, x, position };
  };
  for (const ef of results.elementForces) {
    const loads = faces?.get(ef.elementId);
    if (reuse && !loads) continue;
    let rec = env.get(ef.elementId);
    if (!rec) { rec = blank(); env.set(ef.elementId, rec); }
    if (!reuse) {
      for (const t of criticalForceStations(ef)) {
        const f = extractForcesAtStation(ef, t);
        for (const c of ENVELOPE_COMPONENTS) include(rec[c], f[c], f.x);
      }
    }
    if (loads) {
      for (const end of [0, 1] as const) {
        for (const [axis, component, force] of [
          [0, 'n', end ? ef.nEnd : ef.nStart],
          [1, 'vy', end ? ef.vyEnd : ef.vyStart],
          [2, 'vz', end ? ef.vzEnd : ef.vzStart],
        ] as const) {
          const load = loads[end][axis];
          if (load !== 0) include(rec[component], movingFaceForce(force, load, end === 1, component === 'n'), end * ef.length);
        }
      }
    }
  }
}

export interface MovingLoad3DOptions {
  step?: number;
  /** A second line of members for the other wheel line: each axle half on each path. */
  path2?: PathSegment3D[] | null;
  onProgress?: (done: number, total: number) => void;
  signal?: AbortSignal;
}

const half = (train: LoadTrain): LoadTrain => ({ name: train.name, axles: train.axles.map((a) => ({ offset: a.offset, weight: a.weight / 2 })) });

/**
 * Sweep each of `trains` (a vehicle's spacings, `vehicles.ts` `vehicleTrains`) and keep the
 * extremes over all of them.
 */
export async function sweepTrains3D(base: SolverInput3D, path: PathSegment3D[], trains: readonly LoadTrain[], opts: MovingLoad3DOptions = {}): Promise<MovingEnvelope3D> {
  let out: MovingEnvelope3D | null = null;
  for (const train of trains) {
    const r = await sweepMovingLoad3D(base, path, train, opts);
    if (!out) { out = r; continue; }
    for (const [id, rec] of r.elements) {
      const mine = out.elements.get(id);
      if (!mine) { out.elements.set(id, rec); continue; }
      for (const c of ENVELOPE_COMPONENTS) {
        if (rec[c].max.value > mine[c].max.value) mine[c].max = rec[c].max;
        if (rec[c].min.value < mine[c].min.value) mine[c].min = rec[c].min;
      }
    }
    out.structuredDiagnostics.push(...r.structuredDiagnostics);
    out = { ...out, positions: out.positions + r.positions, failed: out.failed + r.failed };
  }
  return out!;
}

/**
 * The structure a train runs on: the model's, with none of its loads. A load builds the input it
 * is in: a moment or an axial force inside a span cuts the member there, and a load case's imposed
 * displacement goes on the supports. Neither belongs to the train: the cut made the path's member
 * pieces the path could not name, and every case's displacements were imposed on every position.
 * A support's own settlement is not part of a moving-load envelope either.
 */
export function movingLoadBase3D(model: ModelData, leftHand = false): SolverInput3D | null {
  return buildSolverInput3D({ ...model, supports: withoutSettlement(model.supports), loads: [] }, false, leftHand);
}

/** Sweep `train` along `path`, forward and (for an asymmetric train) back. */
export async function sweepMovingLoad3D(
  base: SolverInput3D, path: PathSegment3D[], train: LoadTrain, opts: MovingLoad3DOptions = {},
): Promise<MovingEnvelope3D> {
  requireCableAnalysis(base.elements.values());
  // At least `MIN_STEP`: a step of a few micrometres ran for ever.
  const step = usableStep(opts.step ?? 0, 0.25);
  const total = path.reduce((s, p) => s + p.length, 0);
  const passes = positionPasses(train, total, step, path.at(-1)?.endRoundoff);
  checkAxlePath(path);
  if (opts.path2) checkAxlePath(opts.path2);
  const count = passes.reduce((n, p) => n + p.refs.length, 0);
  const env: MovingEnvelope3D['elements'] = new Map();
  const structuredDiagnostics: StructuredDiagnostic[] = [];
  const seen = new Set<string>();
  let done = 0, failed = 0;
  const session = prepareLoadSession3D(base);
  try {
    for (const p of passes) {
      for (const r of p.refs) {
        if (opts.signal?.aborted) throw new DOMException('aborted', 'AbortError');
        const position = referenceStation(r);
        const sample = new MovingSample<SolverLoad3D>();
        const wheelLine = opts.path2 ? half(p.train) : p.train;
        addTrain(sample, base, path, wheelLine, r);
        if (opts.path2) addTrain(sample, base, opts.path2, wheelLine, r);
        try {
          sample.fold((loads) => {
            const result = session.solve(loads);
            const diagnostics = result.structuredDiagnostics ?? [];
            if (diagnostics.some(d => d.code === 'known_issue' && d.severity === 'error')) {
              throw new Error(JSON.stringify({ structuredDiagnostics: diagnostics }));
            }
            for (const d of diagnostics) {
              const key = JSON.stringify(d);
              if (!seen.has(key)) { seen.add(key); structuredDiagnostics.push(d); }
            }
            return result;
          }, (result, faces, reuse) => foldPosition(env, result, position, faces, reuse));
        } catch (error) {
          if (isContainmentRefusal(error) || sample.hasJoints) throw error;
          failed++;
        }
        done++;
        opts.onProgress?.(done, count);
        if (done % 8 === 0) await new Promise((res) => setTimeout(res, 0));
      }
    }
    return { structuredDiagnostics, elements: env, path, train, positions: done - failed, failed };
  } finally { session.free(); }
}
