import { accountingCaseSources, accountingMemberPieces, accountingProjection, accountingSource, scenarioIntents, scenarioSurfaceExpectations, scenarioSurfaceIntentOf, type ScenarioSurfaceIntent } from './accounting-source';
import { accountingOrigin } from './accounting-source';
import { tp } from '../i18n';
import type { Load, Node, PointLoadOnElement } from '../store/model.svelte';
import type { FloorLoadDef } from '../model/loads/floor-definitions';
import type { ModelData } from './solver-service';
import type { SolverInput, SolverLoad } from './types';
import type { SolverInput3D, SolverLoad3D } from './types-3d';
import { computeLocalAxes3D, memberRoll, type LocalAxes3D } from './local-axes-3d';
import { memberFrame3D, memberRef3D, type MemberRef } from './member-loads';
import { takesNoBending } from './member-loads';
import { tendonLineIntensity } from './prestress';
import { shouldEmbedFlat2DModelIn3D } from './model-embedding';
import { planarLoadDirection } from './planar-load-direction';
import { transverseSign } from './transverse-sign-2d';
import { add, cross, mul, agreesAtScale, assembledMagnitudes3D, memberLineSources, LoadScalar, LoadVector, norm, positionAt, sub, unit, xyz, zero, Wrench, type Vector } from './accounting-math';
import { accountSurface, accountUniformClippedSurface, expectedSurfaceNodeForces, SingularSurfaceProjection } from './surface-accounting';
import type { ShellLoadSpec } from './shell-load-integration';
import { quadGaussSamples } from './solver-shells';
import { selfWeightDirection, type SelfWeightSource } from './self-weight';
import { SolveAccountingError, type PlateMeasure } from './plate-accounting';

type Frame = 'xy' | 'xz' | 'space';
const coordinateComponents = ['X', 'Y', 'Z'];
const components = ['Fx', 'Fy', 'Fz', 'Mx', 'My', 'Mz'];
const inPlane = (frame: Frame, x: number, y: number): Vector => frame === 'xz' ? [x, 0, y] : [x, y, 0];
const planeMoment = (frame: Frame, m: number): LoadVector => LoadVector.from(frame === 'xz' ? [0, -m, 0] : [0, 0, m]);

function caseLabel(model: ModelData, id: number): string {
  const name = model.loadCases?.find(c => c.id === id)?.name;
  return name ? `#${id} (${name})` : `#${id}`;
}

function unsupported(model: ModelData, caseId: number, kind: string, id: number): never {
  throw new SolveAccountingError(tp('svc.accountingUnsupported', { case: caseLabel(model, caseId), kind, id }));
}

function checkSurfaceProjection<T>(model: ModelData, caseId: number, id: number, check: () => T): T {
  try {
    return check();
  } catch (error) {
    if (!(error instanceof SingularSurfaceProjection)) throw error;
    throw new SolveAccountingError(tp('svc.accountingSurfaceProjection', { case: caseLabel(model, caseId), id }));
  }
}

function requireSurfaceNodeForces(model: ModelData, caseId: number, id: number, points: Vector[], spec: ShellLoadSpec): LoadVector[] {
  return checkSurfaceProjection(model, caseId, id, () => expectedSurfaceNodeForces(points, spec))
    ?? unsupported(model, caseId, 'surface3d', id);
}

export function verifyMassSurfaceRegion(
  model: ModelData, caseId: number, spec: ShellLoadSpec & { quadId: number; on?: 'plate' },
): void {
  if (!spec.region) return;
  const id = spec.quadId;
  const shell = (spec.on === 'plate' ? model.plates : model.quads)?.get(id);
  if (!shell) unsupported(model, caseId, 'surface3d', id);
  const points = shell.nodes.map(nodeId => xyz(model.nodes.get(nodeId) ?? unsupported(model, caseId, 'node', nodeId)));
  if (!checkSurfaceProjection(model, caseId, id, () => accountSurface(new Wrench(), points, spec))) {
    unsupported(model, caseId, 'surface3d', id);
  }
}

function compareComponent(
  label: string, component: string, entered: number, assembled: number, scale: number, underflow: number,
): void {
  if (!agreesAtScale(entered, assembled, scale, underflow)) mismatch(label, component, entered, assembled);
}

function mismatch(label: string, component: string, entered: number, assembled: number): never {
  throw new SolveAccountingError(tp('svc.accountingMismatch', { case: label, component, entered, assembled }));
}

function compareMeasures(label: string, names: readonly string[], entered: Wrench, assembled: Wrench): void {
  for (const [i, name] of names.entries()) {
    const a = entered.component(i), b = assembled.component(i);
    compareComponent(label, name, a.value, b.value, Math.max(a.scale, b.scale), a.underflow + b.underflow);
  }
}

const stationComponents = ['Fx', 'Fy', 'Fz', 's·Fx', 's·Fy', 's·Fz'];

function compare(label: string, entered: Wrench, assembled: Wrench): void {
  compareMeasures(label, components, entered, assembled);
  const empty = new Wrench();
  for (const source of memberLineSources) {
    const first = entered.memberLineMeasures(source), second = assembled.memberLineMeasures(source);
    if (!first && !second) continue;
    for (const id of new Set([...(first?.keys() ?? []), ...(second?.keys() ?? [])])) {
      compareMeasures(`${label} · ${tp('whatif.member', { n: id })}`, stationComponents,
        first?.get(id) ?? empty, second?.get(id) ?? empty);
    }
  }
}

type SurfaceNodeForce = { shellId: number; carrier: string; nodeId: number; force: LoadVector };

const surfaceNodeForces = new WeakMap<SolverLoad3D, SurfaceNodeForce[]>();

function verifySurfaceNode(
  model: ModelData, caseId: number, label: string, wire: SolverLoad3D, expected: SurfaceNodeForce,
): void {
  const { shellId, carrier, nodeId, force } = expected;
  if (wire.type !== 'nodal' || wire.data.nodeId !== nodeId) unsupported(model, caseId, 'surface3d', shellId);
  const { fx, fy, fz, mx, my, mz } = wire.data;
  const nodeLabel = `${label} · ${carrier} · ${tp('whatif.node', { n: nodeId })}`;
  for (const [i, actual] of [fx, fy, fz, mx, my, mz].entries()) {
    const entered = force.value[i] ?? 0;
    compareComponent(nodeLabel, components[i]!, entered, actual, Math.max(force.magnitude[i] ?? 0, Math.abs(entered), Math.abs(actual)),
      force.underflow[i] ?? 0);
  }
}

export function verifyFactoredSurfaceNode(
  model: ModelData, id: number, name: string, original: SolverLoad3D, scaled: SolverLoad3D, factor: number,
): void {
  for (const expected of surfaceNodeForces.get(original) ?? []) {
    verifySurfaceNode(model, id, `#${id} (${name})`, scaled, { ...expected, force: expected.force.scale(factor) });
  }
}

function verifySurfaceRows(
  model: ModelData, caseId: number, label: string, shellId: number, carrier: string, nodeIds: readonly number[],
  forces: readonly LoadVector[], rows: readonly SolverLoad3D[],
): void {
  const carrierLabel = `${label} · ${carrier}`;
  compareComponent(carrierLabel, tp('whatif.loads'), nodeIds.length, rows.length, 0, 0);
  const byNode = new Map(rows.map(wire => {
    if (wire.type !== 'nodal') mismatch(carrierLabel, tp('whatif.loads'), 1, 0);
    return [wire.data.nodeId, wire] as const;
  }));
  for (const [i, nodeId] of nodeIds.entries()) {
    const wire = byNode.get(nodeId) ?? mismatch(carrierLabel, tp('whatif.node', { n: nodeId }), 1, 0);
    const expected = { shellId, carrier, nodeId, force: forces[i]! };
    verifySurfaceNode(model, caseId, label, wire, expected);
    const checked = surfaceNodeForces.get(wire);
    if (checked) checked.push(expected);
    else surfaceNodeForces.set(wire, [expected]);
  }
}

function scenarioKey(intent: ScenarioSurfaceIntent): string {
  const { baseline, caseFactors = [] } = intent;
  return [baseline.caseId ?? 1, baseline.id, ...caseFactors.filter(factor => factor !== 1)].join(':');
}

function matchScenarioSurfaces(
  model: ModelData, caseId: number, loads: readonly Load[], expectedIntents?: readonly ScenarioSurfaceIntent[],
) {
  const pending = new Map<string, ScenarioSurfaceIntent[]>();
  for (const intent of expectedIntents ?? []) {
    const key = scenarioKey(intent);
    const same = pending.get(key);
    if (same) same.push(intent);
    else pending.set(key, [intent]);
  }
  const matched = [];
  for (const load of loads) {
    if (load.type !== 'surface3d') continue;
    const actual = scenarioSurfaceIntentOf(load);
    if (!actual) continue;
    const intent = expectedIntents ? pending.get(scenarioKey(actual))?.pop() : actual;
    if (!intent) unsupported(model, caseId, 'surface3d', actual.baseline.quadId);
    matched.push({ load, intent });
  }
  for (const [missing] of pending.values()) {
    if (missing) unsupported(model, caseId, 'surface3d', missing.baseline.quadId);
  }
  return matched;
}

function matchesPressureGeometry(a: ShellLoadSpec, b: ShellLoadSpec): boolean {
  const sameVector = (x: Vector | undefined, y: Vector | undefined) =>
    x && y ? x.every((value, i) => value === y[i]) : x === y;
  const sameRing = (x: Vector[], y: Vector[]) => x.length === y.length && x.every((point, i) => sameVector(point, y[i]));
  if (a.frame !== b.frame || !sameVector(a.dir, b.dir)) return false;
  if (a.vary && b.vary && (a.vary.c1 !== b.vary.c1 || a.vary.c2 !== b.vary.c2 || !sameVector(a.vary.dir, b.vary.dir))) {
    return false;
  }
  if (!a.region || !b.region) return a.region === b.region;
  const holesA = a.region.holes ?? [], holesB = b.region.holes ?? [];
  return sameVector(a.region.normal, b.region.normal) && sameRing(a.region.points, b.region.points)
    && holesA.length === holesB.length && holesA.every((ring, i) => sameRing(ring, holesB[i]!));
}

export function* checkedScenarioSurfacePressures(
  model: ModelData, caseId: number, loads: readonly Load[],
  label = caseLabel(model, caseId), expectedIntents?: readonly ScenarioSurfaceIntent[],
) {
  for (const { load, intent } of matchScenarioSurfaces(model, caseId, loads, expectedIntents)) {
    const { data } = load;
    const { baseline, factor } = intent;
    const shell = (baseline.on === 'plate' ? model.plates : model.quads)?.get(baseline.quadId);
    if (!shell || data.quadId !== baseline.quadId || data.on !== baseline.on || !matchesPressureGeometry(data, baseline)) {
      unsupported(model, caseId, load.type, data.id);
    }
    const scale = (q: number) => (intent.caseFactors ?? []).reduce(
      (pressure, caseFactor) => pressure.scale(caseFactor), new LoadScalar(q).scale(factor),
    );
    const comparePressure = (component: string, baselinePressure: number, assembled: number) => {
      const entered = scale(baselinePressure);
      compareComponent(`${label} · #${data.quadId}`, component, entered.value, assembled,
        Math.max(Math.abs(entered.value), Math.abs(assembled)), entered.underflow);
      return entered.value;
    };
    const expected: ShellLoadSpec = { ...baseline, q: scale(baseline.q).value };
    if (baseline.vary || data.vary) {
      if (!baseline.vary || !data.vary || baseline.qNodes || data.qNodes) {
        unsupported(model, caseId, load.type, data.id);
      }
      expected.vary = {
        ...baseline.vary,
        q1: comparePressure('q1', baseline.vary.q1, data.vary.q1),
        q2: comparePressure('q2', baseline.vary.q2, data.vary.q2),
      };
    } else {
      const corners = shell.nodes.length;
      if ((baseline.qNodes && baseline.qNodes.length !== corners) || (data.qNodes && data.qNodes.length !== corners)) {
        unsupported(model, caseId, load.type, data.id);
      }
      const pressures = shell.nodes.map((_, i) => comparePressure(`q[${i + 1}]`, baseline.qNodes ? baseline.qNodes[i]! : baseline.q,
        data.qNodes ? data.qNodes[i]! : data.q));
      if (baseline.qNodes) expected.qNodes = pressures;
    }

    yield { load, shell, expected };
  }
}

export function verifyScenarioSurfaceLoads(
  model: ModelData, caseId: number, loads: readonly Load[], sources: ReadonlyMap<Load, readonly SolverLoad3D[]> | undefined,
  label = caseLabel(model, caseId), expectedIntents?: readonly ScenarioSurfaceIntent[],
): void {
  for (const { load, shell, expected } of checkedScenarioSurfacePressures(model, caseId, loads, label, expectedIntents)) {
    const { data } = load;
    const points = shell.nodes.map(nodeId => xyz(model.nodes.get(nodeId) ?? unsupported(model, caseId, 'node', nodeId)));
    const forces = requireSurfaceNodeForces(model, caseId, data.quadId, points, expected);
    verifySurfaceRows(model, caseId, label, data.quadId, `#${data.quadId}`, shell.nodes, forces, sources?.get(load) ?? []);
  }
}

function localVector(axes: LocalAxes3D, x: number, y: number, z: number, budget?: LoadVector): LoadVector {
  const local = LoadVector.from([x, y, z], budget?.magnitude, budget?.underflow);
  return local.componentAlong(0, axes.ex).add(local.componentAlong(1, axes.ey).add(local.componentAlong(2, axes.ez)));
}

function coordinates(point: Vector, id: number) {
  return { id, x: point[0], y: point[1], z: point[2] };
}

function basis(start: Vector, end: Vector, id: number, el: { localYx?: number; localYy?: number; localYz?: number }, roll: number, leftHand = false): LocalAxes3D {
  const orientation = el.localYx === undefined ? undefined : { x: el.localYx, y: el.localYy!, z: el.localYz! };
  return computeLocalAxes3D(coordinates(start, id), coordinates(end, id), orientation, roll, leftHand);
}

function planarTangent(chord: Vector): [number, number] {
  const length = Math.hypot(chord[0], chord[1]);
  return [chord[0] / length, chord[1] / length];
}

function directionalPlaneForce(frame: Frame, chord: Vector, magnitude: number, degrees: number, global: boolean): LoadVector {
  const radians = degrees * Math.PI / 180;
  const { sin, cos } = frame === 'xy'
    ? planarLoadDirection(degrees)
    : { sin: Math.sin(radians), cos: Math.cos(radians) };
  if (global) return LoadVector.from(inPlane(frame, sin, cos)).scale(magnitude);
  const tangent = unit([chord[0], chord[1], 0]);
  const sign = frame === 'space' ? 1 : transverseSign(chord[0], chord[1]);
  return LoadVector.from(inPlane(frame, tangent[0], tangent[1])).scale(sin)
    .add(LoadVector.from(inPlane(frame, -tangent[1], tangent[0])).scale(sign * cos))
    .scale(magnitude);
}

function enteredMoment(d: PointLoadOnElement): number {
  if (d.enteredZeroMoment) return 0;
  return d.my || d.mz || 0;
}

function wrenchForModel(model: ModelData): Wrench {
  return new Wrench(model[accountingMemberPieces]);
}

function isClippedSlabZone(model: ModelData, spec: ShellLoadSpec & { fromDef?: number }): boolean {
  if (!spec.region || spec.vary || spec.qNodes || spec.fromDef === undefined) return false;
  const group = model.groups?.get(spec.fromDef);
  const definition = group?.kind === 'floorLoad' ? group.data as unknown as FloorLoadDef | undefined : undefined;
  return definition?.distribution === 'slab' && definition.target.by === 'zone';
}

function enteredLoads(model: ModelData, loads: readonly Load[], frame: Frame, leftHand: boolean, caseId: number, definitions: ReadonlySet<number>): Wrench {
  const out = wrenchForModel(model);
  const at = (id: number): Vector => {
    const node = model.nodes.get(id);
    if (!node) return unsupported(model, caseId, 'node', id);
    return frame === 'space' ? xyz(node) : inPlane(frame, node.x, node.y);
  };

  for (const load of loads) {
    const d = load.data;
    switch (load.type) {
      case 'nodal': {
        const { nodeId, fx, fz, fy, my, mz } = load.data;
        const force = LoadVector.from(inPlane(frame, fx, fz ?? fy ?? 0));
        out.apply(at(nodeId), force, planeMoment(frame, my ?? mz ?? 0));
        continue;
      }
      case 'nodal3d': {
        const { nodeId, fx, fy, fz, mx, my, mz } = load.data;
        out.apply(at(nodeId), LoadVector.from([fx, fy, fz]), LoadVector.from([mx, my, mz]));
        continue;
      }
      case 'thermal':
      case 'thermalQuad3d':
      case 'displacement3d':
        if (frame === 'xy' && load.type !== 'thermal') unsupported(model, caseId, load.type, d.id);
        continue;
      case 'surface3d': {
        const intent = scenarioSurfaceIntentOf(load);
        const spec = intent?.baseline ?? load.data;
        const coveredByDefinition = spec.fromDef !== undefined && definitions.has(spec.fromDef);
        if (coveredByDefinition && !intent) continue;
        const shell = (spec.on === 'plate' ? model.plates : model.quads)?.get(spec.quadId);
        const surface = intent ? new Wrench() : out;
        if (!shell || frame !== 'space') unsupported(model, caseId, load.type, spec.quadId);
        const account = isClippedSlabZone(model, spec) ? accountUniformClippedSurface : accountSurface;
        const points = shell.nodes.map(at);
        if (!checkSurfaceProjection(model, caseId, spec.quadId, () => account(surface, points, spec))) {
          unsupported(model, caseId, load.type, spec.quadId);
        }
        if (intent) {
          let adjusted = surface;
          for (const factor of [intent.factor - (coveredByDefinition ? 1 : 0), ...(intent.caseFactors ?? [])]) {
            if (factor === 1) continue;
            const scaled = new Wrench();
            scaled.addScaled(adjusted, factor);
            adjusted = scaled;
          }
          out.addScaled(adjusted, 1);
        }
        continue;
      }
      case 'distributed':
      case 'pointOnElement':
      case 'distributed3d':
      case 'pointOnElement3d':
      case 'prestress3d':
        break;
      default:
        unsupported(model, caseId, (load as Load).type, d.id);
    }

    const member = model.elements.get(load.data.elementId);
    if (!member) unsupported(model, caseId, load.type, d.id);
    const originalI = model.nodes.get(member.nodeI), originalJ = model.nodes.get(member.nodeJ);
    if (!originalI || !originalJ) unsupported(model, caseId, load.type, d.id);
    const drawnChord = sub(xyz(originalJ), xyz(originalI));
    const spatial = frame === 'space' ? memberFrame3D(model, member) : null;
    if (frame === 'space' && !spatial) unsupported(model, caseId, load.type, d.id);
    const start = spatial?.ni ?? at(member.nodeI), end = spatial?.nj ?? at(member.nodeJ);
    const axis = unit(sub(end, start)), length = norm(sub(end, start));
    if (!(length > 0)) unsupported(model, caseId, load.type, d.id);

    if (load.type === 'pointOnElement' || load.type === 'distributed') {
      const data = load.data;
      const force = (q: number) => directionalPlaneForce(frame, drawnChord, q, data.angle ?? 0, data.isGlobal ?? false);
      if (load.type === 'pointOnElement') {
        const { p, a, px } = load.data;
        const planar = p === 0 && !px ? LoadVector.from(zero())
          : force(p).add(LoadVector.from(inPlane(frame, ...planarTangent(drawnChord))).scale(px ?? 0));
        out.apply(positionAt(start, axis, a), planar, planeMoment(frame, enteredMoment(load.data)));
      } else {
        const { qI, qJ, a, b } = load.data;
        out.line(start, axis, a ?? 0, b ?? length, force(qI), force(qJ), member.id);
      }
      continue;
    }

    if (frame === 'xy') unsupported(model, caseId, load.type, d.id);
    const axes = spatial?.ax ?? basis(start, end, member.id, {}, memberRoll(member, model.sections));
    if (load.type === 'prestress3d') {
      const { force, eI, eM, eJ } = load.data;
      if (![force, eI, eM, eJ].every(Number.isFinite)) unsupported(model, caseId, load.type, d.id);
      if (force !== 0 && !takesNoBending(member)) {
        const { amount, magnitude } = tendonLineIntensity(load.data, length);
        const transverse = LoadVector.from(axes.ez).scale(amount, magnitude);
        const span = new LoadScalar(length);
        out.memberLineForce(member.id, span.divide(2), transverse.scale(span), 'prestress');
      }
      continue;
    }

    const local = (x: number, y: number, z: number) => localVector(axes, x, leftHand ? -y : y, z);
    if (load.type === 'pointOnElement3d') {
      const d = load.data;
      const inFrame = d.frame === 'global' ? (x: number, y: number, z: number) => LoadVector.from([x, y, z]) : local;
      out.apply(positionAt(start, axis, d.a), inFrame(d.px ?? 0, d.py, d.pz), inFrame(d.mx ?? 0, d.my ?? 0, d.mz ?? 0));
    } else {
      const d = load.data;
      const inFrame = (x: number, y: number, z: number): LoadVector => {
        if (d.frame === 'global') return LoadVector.from([x, y, z]);
        if (d.frame === 'projected') {
          return LoadVector.from([x, y, z]).scaleComponents([
            Math.hypot(axis[1], axis[2]), Math.hypot(axis[0], axis[2]), Math.hypot(axis[0], axis[1]),
          ]);
        }
        return local(x, y, z);
      };
      out.line(start, axis, d.a ?? 0, d.b ?? length,
        inFrame(d.qXI ?? 0, d.qYI, d.qZI), inFrame(d.qXJ ?? 0, d.qYJ, d.qZJ), member.id);
    }
  }
  return out;
}

function assembled2D(model: ModelData, input: SolverInput, loads: readonly SolverLoad[], caseId: number): Wrench {
  const result = wrenchForModel(model);
  const at = (id: number): Vector => {
    const node = input.nodes.get(id);
    if (!node) return unsupported(model, caseId, 'node', id);
    return [node.x, node.z, 0];
  };
  for (const load of loads) {
    const d = load.data;
    if (load.type === 'thermal') continue;
    if (load.type === 'nodal') {
      const { nodeId, fx, fz, my } = load.data;
      result.apply(at(nodeId), LoadVector.from([fx, fz ?? 0, 0]), LoadVector.from([0, 0, my ?? 0]));
      continue;
    }
    if (load.type !== 'distributed' && load.type !== 'axialDistributed' && load.type !== 'pointOnElement') {
      unsupported(model, caseId, (load as SolverLoad).type, 0);
    }
    const elementId = (d as { elementId: number }).elementId;
    const member = input.elements.get(elementId);
    if (!member) unsupported(model, caseId, load.type, elementId);
    const a = at(member.nodeI), chord = sub(at(member.nodeJ), a);
    const length = norm(chord), axis = unit(chord);
    const normal: Vector = [-axis[1], axis[0], 0];
    if (load.type === 'pointOnElement') {
      const { a: position, p, px, my } = load.data;
      const force = LoadVector.from(normal).scale(p).add(LoadVector.from(axis).scale(px ?? 0));
      result.apply(positionAt(a, axis, position), force, LoadVector.from([0, 0, my ?? 0]));
    } else {
      const { qI, qJ, a: start, b: end } = load.data;
      const direction = load.type === 'distributed' ? normal : axis;
      result.line(a, axis, start ?? 0, end ?? length, LoadVector.from(direction).scale(qI), LoadVector.from(direction).scale(qJ), elementId);
    }
  }
  return result;
}

function assembled3D(
  model: ModelData, input: SolverInput3D, loads: readonly SolverLoad3D[], caseId: number, label: string,
): Wrench {
  const result = wrenchForModel(model);
  const at = (id: number): Vector => {
    const node = input.nodes.get(id);
    if (!node) return unsupported(model, caseId, 'node', id);
    return xyz(node);
  };
  const frames = new Map<number, { start: Vector; axes: LocalAxes3D }>();
  const members = new Map<number, MemberRef>();
  let embedded: boolean | undefined;
  for (const load of loads) {
    const kind: string = load.type;
    if (kind === 'thermal' || kind === 'plateThermal' || kind === 'quadThermal' || kind === 'curvedShellThermal') continue;
    const magnitudes = assembledMagnitudes3D.get(load);
    if (load.type === 'nodal') {
      const { nodeId, fx, fy, fz, mx, my, mz } = load.data;
      const nodal = magnitudes && 'force' in magnitudes ? magnitudes : undefined;
      const force = LoadVector.from([fx, fy, fz], nodal?.force.magnitude, nodal?.force.underflow);
      result.apply(at(nodeId), force, LoadVector.from([mx, my, mz], nodal?.couple.magnitude, nodal?.couple.underflow));
      const redistributed = nodal?.memberLine;
      if (redistributed) {
        const { member, end, source } = redistributed;
        let ref = members.get(member);
        if (!ref) {
          ref = memberRef3D(model, member, embedded ??= shouldEmbedFlat2DModelIn3D(model)) ?? undefined;
          if (!ref) unsupported(model, caseId, kind, member);
          members.set(member, ref);
        }
        const expected = end === 'i' ? ref.nodeI : ref.nodeJ;
        if (nodeId !== expected) {
          throw new SolveAccountingError(tp('svc.accountingLineEnd', {
            case: label, member, end: end.toUpperCase(), actual: nodeId, expected,
          }));
        }
        if (source === 'external') {
          result.memberLineForce(member, new LoadScalar(end === 'i' ? 0 : ref.axes.L), force);
        }
        else result.memberLineForce(member, new LoadScalar(end === 'i' ? 0 : ref.axes.L), force, source);
      }
      continue;
    }
    if (kind === 'pressure' || kind === 'quadPressure' || kind === 'curvedShellPressure') {
      const { elementId, pressure } = load.data as unknown as { elementId: number; pressure: number };
      const shell = (kind === 'pressure' ? input.plates : kind === 'quadPressure' ? input.quads : input.curvedShells)?.get(elementId);
      if (!shell || !accountSurface(result, shell.nodes.map(at), { q: pressure, frame: 'local' })) {
        unsupported(model, caseId, kind, elementId);
      }
      continue;
    }
    if (load.type !== 'distributed' && load.type !== 'pointOnElement') unsupported(model, caseId, kind, 0);
    const { elementId } = load.data;
    let frame = frames.get(elementId);
    if (!frame) {
      const member = input.elements.get(elementId);
      if (!member) unsupported(model, caseId, kind, elementId);
      const start = at(member.nodeI), end = at(member.nodeJ);
      const axes = basis(start, end, elementId, member, member.rollAngle ?? 0, input.leftHand);
      frame = { start, axes };
      frames.set(elementId, frame);
    }

    const { start, axes } = frame;
    if (load.type === 'distributed') {
      const d = load.data;
      const line = magnitudes && 'qI' in magnitudes ? magnitudes : undefined;
      result.line(start, axes.ex, d.a ?? 0, d.b ?? axes.L,
        localVector(axes, d.qXI ?? 0, d.qYI, d.qZI, line?.qI),
        localVector(axes, d.qXJ ?? 0, d.qYJ, d.qZJ, line?.qJ), line?.source === 'prestress' ? undefined : elementId);
      if (line?.source === 'prestress') {
        result.memberLine(elementId, d.a ?? 0, d.b ?? axes.L,
          localVector(axes, d.qXI ?? 0, d.qYI, d.qZI, line.qI),
          localVector(axes, d.qXJ ?? 0, d.qYJ, d.qZJ, line.qJ), line.source);
      }
    } else {
      const d = load.data;
      result.apply(positionAt(start, axes.ex, d.a), localVector(axes, d.px ?? 0, d.py, d.pz));
    }
  }
  return result;
}

export function loadCaseBatches(loads: readonly Load[], caseIds: readonly number[] = []): Map<number, Load[]> {
  const cases = new Map<number, Load[]>(caseIds.map(id => [id, []]));
  for (const load of loads) {
    const id = load.data.caseId ?? 1;
    const group = cases.get(id);
    if (group) group.push(load);
    else cases.set(id, [load]);
  }
  return cases;
}

export function hasGeneratedSource(load: Load): boolean {
  return 'generatedBy' in load.data || 'fromDef' in load.data || load.type === 'surface3d';
}

function sourceLabel(model: ModelData, caseId: number, load: Load): string {
  const definition = 'fromDef' in load.data && load.data.fromDef !== undefined ? model.groups?.get(load.data.fromDef) : undefined;
  const name = tp('whatif.loadFallback', { n: `#${load.data.id}` });
  const carrier = load.type === 'surface3d' ? ` · #${load.data.quadId}` : '';
  return [caseLabel(model, caseId), definition?.name, name + carrier].filter(Boolean).join(' · ');
}

function weightLabel(model: ModelData, source: SelfWeightSource): string {
  const carrier = source.kind === 'member' ? tp('whatif.member', { n: source.id }) : `#${source.id}`;
  return `${caseLabel(model, source.caseId)} · ${tp('selfWeight.title')} · ${carrier}`;
}

function memberWeight(out: Wrench, source: SelfWeightSource, a: Vector, b: Vector, dir: Vector) {
  const chord = sub(b, a), length = norm(chord);
  const q = LoadVector.from(dir).scale(source.intensity);
  out.line(a, unit(chord), 0, length, q, q, source.id);
}

export function accountWeight2D(model: ModelData, input: SolverInput, source: SelfWeightSource, rows: readonly SolverLoad[]) {
  const el = model.elements.get(source.id)!;
  const a = model.nodes.get(el.nodeI)!, b = model.nodes.get(el.nodeJ)!;
  const [x, , z] = selfWeightDirection(source);
  const expected = wrenchForModel(model);
  memberWeight(expected, source, [a.x, a.y, 0], [b.x, b.y, 0], [x, z, 0]);
  compare(weightLabel(model, source), expected, assembled2D(model, input, rows, source.caseId));
}

type ShellTarget = {
  id: number;
  kind: 'pressure' | 'quadPressure' | 'curvedShellPressure';
  nodeIds: readonly number[];
  forces: ReadonlyMap<number, LoadVector>;
};
type WrenchSource3D = { label: string; expected: Wrench; rows: readonly SolverLoad3D[]; nodeId?: number; shell?: ShellTarget };

function shellTarget(
  model: ModelData, caseId: number, on: 'plate' | undefined, id: number, spec: ShellLoadSpec,
): ShellTarget {
  const shell = (on === 'plate' ? model.plates : model.quads)?.get(id);
  if (!shell) unsupported(model, caseId, 'surface3d', id);
  const points = shell.nodes.map(nodeId => xyz(model.nodes.get(nodeId) ?? unsupported(model, caseId, 'node', nodeId)));
  const forces = requireSurfaceNodeForces(model, caseId, id, points, spec);
  const kind = on === 'plate' ? 'pressure' : 'curved' in shell && shell.curved ? 'curvedShellPressure' : 'quadPressure';
  return { id, kind, nodeIds: shell.nodes, forces: new Map(shell.nodes.map((nodeId, i) => [nodeId, forces[i]!])) };
}

function verifyShellDelivery(
  model: ModelData, input: SolverInput3D, caseId: number, label: string, slab: ShellTarget,
  rows: readonly SolverLoad3D[], factor: number,
): void {
  const actual = new Map<number, LoadVector>();
  const addForce = (nodeId: number, force: LoadVector) => {
    if (!slab.nodeIds.includes(nodeId)) compareComponent(label, tp('whatif.node', { n: nodeId }), 0, 1, 0, 0);
    actual.set(nodeId, (actual.get(nodeId) ?? LoadVector.from(zero())).add(force));
  };
  const shell = (slab.kind === 'pressure' ? input.plates : slab.kind === 'quadPressure' ? input.quads : input.curvedShells)?.get(slab.id);
  if (!shell) unsupported(model, caseId, 'surface3d', slab.id);
  for (const row of rows) {
    if (row.type === 'nodal') {
      const { nodeId, fx, fy, fz, mx, my, mz } = row.data;
      for (const [i, value] of [mx, my, mz].entries()) {
        compareComponent(label, components[i + 3]!, 0, value, 0, 0);
      }
      addForce(nodeId, LoadVector.from([fx, fy, fz]));
      continue;
    }
    compareComponent(label, tp('whatif.loads'), 1, Number((row.type as string) === slab.kind), 0, 0);
    const { elementId, pressure } = row.data as unknown as { elementId: number; pressure: number };
    compareComponent(label, tp('whatif.loads'), slab.id, elementId, 0, 0);
    const points = shell.nodes.map(id => xyz(input.nodes.get(id) ?? unsupported(model, caseId, 'node', id)));
    const forces = requireSurfaceNodeForces(model, caseId, slab.id, points, { frame: 'local', q: pressure });
    shell.nodes.forEach((nodeId, i) => addForce(nodeId, forces[i]!));
  }
  for (const nodeId of slab.nodeIds) {
    const nodeLabel = label + ' · ' + tp('whatif.node', { n: nodeId });
    const delivered = actual.get(nodeId) ?? mismatch(nodeLabel, tp('whatif.loads'), 1, 0);
    const intended = slab.forces.get(nodeId) ?? unsupported(model, caseId, 'surface3d', slab.id);
    const scaled = intended.scale(factor);
    for (const [i, value] of delivered.value.entries()) {
      compareComponent(nodeLabel, components[i]!, scaled.value[i]!, value,
        Math.max(scaled.magnitude[i]!, delivered.magnitude[i]!), scaled.underflow[i]! + delivered.underflow[i]!);
    }
  }
}

type QuadWeightReceipt = {
  label: string;
  rows: readonly SolverLoad3D[];
  id: number;
  corners: ReadonlyMap<number, { node: Node; share: number }>;
  direction: Vector;
  weightPerArea: number;
  gravityFactor: number;
  additions: number;
};

export type CheckedSource3D = WrenchSource3D | QuadWeightReceipt;

function verifyQuadWeight(
  model: ModelData, input: SolverInput3D, caseId: number, source: QuadWeightReceipt,
  factor: number, rows: readonly SolverLoad3D[],
): void {
  const { label, direction, weightPerArea, gravityFactor, additions } = source;
  if (rows.length !== source.corners.size) mismatch(label, tp('whatif.loads'), source.corners.size, rows.length);
  const seen = new Set<number>();
  const multiplications = 2 + Number(factor !== 1);
  const ku = (additions + multiplications) * (Number.EPSILON / 2);
  const gamma = ku / (1 - ku);
  for (const row of rows) {
    if (row.type !== 'nodal') unsupported(model, caseId, 'quad', source.id);
    const { nodeId, fx, fy, fz, mx, my, mz } = row.data;
    const corner = source.corners.get(nodeId), wireNode = input.nodes.get(nodeId);
    if (!corner || !wireNode || seen.has(nodeId)) unsupported(model, caseId, 'node', nodeId);
    seen.add(nodeId);
    const nodeLabel = `${label} · ${tp('whatif.node', { n: nodeId })}`;
    const wirePosition = xyz(wireNode);
    for (const [i, position] of xyz(corner.node).entries()) {
      compareComponent(nodeLabel, coordinateComponents[i]!, position, wirePosition[i]!, 0, 0);
    }
    const weight = new LoadScalar(weightPerArea).scale(corner.share).scale(gravityFactor).scale(factor);
    for (const [i, actual] of [fx, fy, fz, mx, my, mz].entries()) {
      const expected = weight.scale(direction[i] ?? 0);
      const bound = (2 * gamma / (1 - gamma)) * Math.abs(expected.value) + 2 * expected.underflow;
      if (!Number.isFinite(bound) || !Number.isFinite(actual) || !Number.isFinite(expected.value)
        || Math.abs(expected.value - actual) > bound) {
        mismatch(nodeLabel, components[i]!, expected.value, actual);
      }
    }
  }
}

export function accountSource3D(
  model: ModelData, input: SolverInput3D, caseId: number, source: CheckedSource3D, factor = 1, rows = source.rows,
) {
  if ('corners' in source) return verifyQuadWeight(model, input, caseId, source, factor, rows);
  if (rows.length !== source.rows.length) {
    mismatch(source.label, tp('whatif.loads'), source.rows.length, rows.length);
  }
  if (source.nodeId !== undefined) {
    for (const row of rows) {
      if (row.type !== 'nodal') unsupported(model, caseId, 'nodal3d', source.nodeId);
      compareComponent(source.label, tp('whatif.node', { n: source.nodeId }), source.nodeId, row.data.nodeId, 0, 0);
    }
  }
  const expected = new Wrench();
  expected.addScaled(source.expected, factor);
  compare(source.label, expected, assembled3D(model, input, rows, caseId, source.label));
  if (source.shell) verifyShellDelivery(model, input, caseId, source.label, source.shell, rows, factor);
}

export function weightSource3D(model: ModelData, embedded: boolean, source: SelfWeightSource, rows: readonly SolverLoad3D[]): CheckedSource3D {
  const label = weightLabel(model, source);
  const dir = selfWeightDirection(source);
  const node = (id: number) => model.nodes.get(id) ?? unsupported(model, source.caseId, 'node', id);
  if (source.kind === 'quad') {
    const shell = model.quads?.get(source.id);
    if (!shell) unsupported(model, source.caseId, source.kind, source.id);
    const [a, b, c, d] = shell.nodes;
    const nodes = [node(a), node(b), node(c), node(d)] as const;
    const samples = Array.from(quadGaussSamples(nodes)).reverse();
    const corners = new Map(nodes.map((node, i) => [node.id, {
      node, share: samples.reduce((sum, sample) => sum + sample.area * sample.shapes[i]!, 0),
    }]));
    return {
      label, id: source.id, corners, rows, direction: dir, additions: samples.length - 1,
      weightPerArea: model.materials.get(shell.materialId)!.rho * shell.thickness, gravityFactor: source.factor,
    };
  }
  const expected = wrenchForModel(model);
  if (source.kind === 'member') {
    const member = model.elements.get(source.id)!;
    const frame = embedded ? null : memberFrame3D(model, member);
    if (!embedded && !frame) unsupported(model, source.caseId, source.kind, source.id);
    const at = (id: number): Vector => {
      const { x, y } = node(id);
      return [x, 0, y];
    };
    memberWeight(expected, source, frame ? frame.ni : at(member.nodeI), frame ? frame.nj : at(member.nodeJ), dir);
  } else {
    const shell = model.plates?.get(source.id);
    if (!shell) unsupported(model, source.caseId, source.kind, source.id);
    const [a, b, c] = shell.nodes.map(id => xyz(node(id)));
    const u = sub(b!, a!), v = sub(c!, a!);
    const area = norm(cross(u, v)) / 2;
    const weight = LoadVector.from(dir).scale(source.intensity);
    expected.apply(add(a!, mul(add(u, v), 1 / 3)), weight.scale(area));
  }
  return { label, expected, rows };
}

type GeneratedMeasure = Pick<WrenchSource3D, 'expected' | 'nodeId' | 'shell'>;

function addGeneratedMeasure(
  receipts: Map<Load, GeneratedMeasure>, original: Load, receipt: GeneratedMeasure, factor: number,
) {
  const previous = receipts.get(original);
  const expected = previous?.expected ?? new Wrench();
  expected.addScaled(receipt.expected, factor);
  const shell = receipt.shell
    ? { ...receipt.shell, forces: scaleShellForces(receipt.shell.forces, factor, previous?.shell?.forces) }
    : receipt.shell;
  receipts.set(original, { expected, nodeId: receipt.nodeId, shell });
}

function generatedExpected(
  model: ModelData, loads: readonly Load[], frame: 'xz' | 'space', leftHand: boolean, caseId: number, factor: number,
  select: (load: Load) => boolean = hasGeneratedSource,
) {
  const receipts = new Map<Load, GeneratedMeasure>();
  for (const load of loads) {
    if (!select(load)) continue;
    const expected = enteredLoads(model, [load], frame, leftHand, caseId, new Set());
    const receipt: GeneratedMeasure = { expected, nodeId: load.type === 'nodal3d' ? load.data.nodeId : undefined };
    if (load.type === 'surface3d') {
      const intent = scenarioSurfaceIntentOf(load);
      const spec = intent?.baseline ?? load.data;
      const shell = shellTarget(model, caseId, spec.on, spec.quadId, spec);
      receipt.shell = intent ? {
        ...shell,
        forces: [intent.factor, ...(intent.caseFactors ?? [])].reduce((forces, k) => scaleShellForces(forces, k), shell.forces),
      } : shell;
    }
    addGeneratedMeasure(receipts, accountingOrigin(load), receipt, factor);
  }
  return receipts;
}

export function accountLoads2D(
  model: ModelData, input: SolverInput, loads: readonly Load[], assembled: readonly SolverLoad[],
  caseId: number, originals: readonly Load[], source?: Load,
): void {
  const label = source ? sourceLabel(model, caseId, source) : caseLabel(model, caseId);
  const wire = assembled2D(model, input, assembled, caseId);
  const projection = model[accountingProjection];
  if (!projection || !originals.length) {
    compare(label, enteredLoads(model, loads, 'xy', false, caseId, new Set()), wire);
    return;
  }
  const spatialIds = new Set(originals.map(l => l.data.id));
  const planar = enteredLoads(model, loads.filter(l => !spatialIds.has(l.data.id)), 'xy', false, caseId, new Set());
  const spatial = enteredLoads(projection.source, originals, 'space', false, caseId, new Set());
  const location = projection.source.nodes.values().next().value;
  const origin: Vector = projection.plane === 'xz' ? [0, location?.y ?? 0, 0] : [location?.x ?? 0, 0, 0];
  const expected = planar.toWorld(projection.plane, origin);
  expected.addScaled(spatial, 1);
  compare(label, expected, wire.toWorld(projection.plane, origin));
}

type SlabCell = { shellId: number; nodeIds: readonly number[]; expected: Wrench; forces: (readonly LoadVector[])[] };

function scaleShellForces(
  source: ReadonlyMap<number, LoadVector>, factor: number, previous?: ReadonlyMap<number, LoadVector>,
): Map<number, LoadVector> {
  return new Map([...source].map(([id, force]) => {
    const scaled = force.scale(factor);
    const prior = previous?.get(id);
    return [id, prior ? prior.add(scaled) : scaled];
  }));
}
type SlabSource = { name: string; cells: ReadonlyMap<string, SlabCell>; expected: Wrench };

function addSlabSource(targets: Map<number, Map<string, SlabCell>>, id: number, cells: ReadonlyMap<string, SlabCell>, factor: number) {
  const target = targets.get(id) ?? new Map<string, SlabCell>();
  for (const [cell, receipt] of cells) {
    const previous = target.get(cell);
    const expected = previous?.expected ?? new Wrench();
    expected.addScaled(receipt.expected, factor);
    const forces = previous?.forces ?? [];
    for (const batch of receipt.forces) forces.push(factor === 1 ? batch : batch.map(force => force.scale(factor)));
    target.set(cell, { shellId: receipt.shellId, nodeIds: receipt.nodeIds, expected, forces });
  }
  targets.set(id, target);
}

const slabCell = (on: 'plate' | undefined, id: number) => `${on ?? 'quad'} #${id}`;

export function loadAccounting3D(
  model: ModelData, input: SolverInput3D, embedded: boolean, leftHand: boolean,
  plates: ReadonlyMap<number, PlateMeasure>, checkAuthored: boolean,
) {
  const source = (checkAuthored ? model[accountingSource] : undefined) ?? model;
  const effects = checkAuthored ? model[accountingCaseSources] : undefined;
  const authored = effects?.authored ?? loadCaseBatches(source.loads);
  const scenarioExpected = effects
    ? scenarioSurfaceExpectations(effects)
    : (id: number) => scenarioIntents(authored.get(id) ?? []);
  const pressures = new Map<number, Map<number, SlabSource>>();
  const sourceNames = new Map<number, string>();
  for (const [id, group] of source.groups ?? []) {
    if (!checkAuthored || group.kind !== 'floorLoad') continue;
    const d = group.data as unknown as FloorLoadDef | undefined;
    if (!d || d.distribution !== 'slab' || d.target.by !== 'group') continue;
    const plate = plates.get(d.target.groupId);
    if (!plate) continue;
    const batch = pressures.get(d.caseId) ?? new Map<number, SlabSource>();
    const pressure = LoadVector.from([0, 0, -d.q]);
    const expected = new Wrench();
    const force = d.perPlanArea ? pressure.scale(Math.abs(plate.normal[2])) : pressure;
    expected.apply(plate.centroid, force.scale(plate.area));
    const members = source.groups?.get(d.target.groupId)?.members;
    const cells = new Map<string, SlabCell>();
    const spec: ShellLoadSpec = d.perPlanArea ? { q: d.q, frame: 'projected', dir: [0, 0, -1] } : { q: d.q };
    for (const [on, ids] of [['plate', members?.plates], [undefined, members?.quads]] as const) {
      for (const cell of ids ?? []) {
        const shell = (on === 'plate' ? source.plates : source.quads)?.get(cell);
        if (!shell) unsupported(model, d.caseId, 'surface3d', cell);
        const points = shell.nodes.map(nodeId => xyz(source.nodes.get(nodeId) ?? unsupported(model, d.caseId, 'node', nodeId)));
        const cellExpected = new Wrench();
        const forces = requireSurfaceNodeForces(model, d.caseId, cell, points, spec);
        if (!accountSurface(cellExpected, points, spec)) unsupported(model, d.caseId, 'surface3d', cell);
        cells.set(slabCell(on, cell), { shellId: cell, nodeIds: shell.nodes, expected: cellExpected, forces: [forces] });
      }
    }
    const name = group.name ?? plate.name;
    sourceNames.set(id, name);
    batch.set(id, { name, cells, expected });
    pressures.set(d.caseId, batch);
  }

  const frame = embedded ? 'xz' : 'space';
  type CaseMeasure = {
    totals: Wrench; names: Set<string>; slabs: Map<number, Map<string, SlabCell>>; generated: Map<Load, GeneratedMeasure>;
  };
  const cache = new Map<number, CaseMeasure>();
  const expected = (caseId: number): CaseMeasure => {
    const cached = cache.get(caseId);
    if (cached) return cached;
    const batch = pressures.get(caseId) ?? new Map<number, SlabSource>();
    const definitions = new Set(batch.keys());
    const authoredLoads = authored.get(caseId) ?? [];
    const totals = enteredLoads(source, authoredLoads, frame, leftHand, caseId, definitions);
    const names = new Set([...batch.values()].map(slab => slab.name));
    const rule = effects?.cases.get(caseId);
    const ratio = rule?.ratio ?? 1;
    const slabs = new Map<number, Map<string, SlabCell>>();
    const receipts = generatedExpected(source, authoredLoads, frame, leftHand, caseId, ratio);
    for (const [id, slab] of batch) {
      totals.addScaled(slab.expected, 1);
      addSlabSource(slabs, id, slab.cells, ratio);
    }
    for (const load of authoredLoads) {
      if (load.type !== 'surface3d') continue;
      const intent = scenarioSurfaceIntentOf(load);
      if (!intent || intent.baseline.fromDef === undefined) continue;
      const { fromDef, on, quadId } = intent.baseline;
      const cell = slabs.get(fromDef)?.get(slabCell(on, quadId));
      if (!cell) continue;
      cell.expected.addScaled(enteredLoads(source, [load], frame, leftHand, caseId, definitions), ratio);
      const points = cell.nodeIds.map(nodeId => xyz(source.nodes.get(nodeId) ?? unsupported(model, caseId, 'node', nodeId)));
      const baseline = requireSurfaceNodeForces(model, caseId, quadId, points, intent.baseline);
      const factors = [intent.factor - 1, ...(intent.caseFactors ?? []), ratio];
      cell.forces[0] = cell.forces[0]!.map((force, i) =>
        force.add(factors.reduce((delta, factor) => delta.scale(factor), baseline[i]!)));
    }
    const result = new Wrench();
    result.addScaled(totals, ratio);
    const generated = effects?.generated.get(caseId);
    if (generated) {
      result.addScaled(enteredLoads(source, generated, frame, leftHand, caseId, definitions), 1);
      for (const [load, receipt] of generatedExpected(source, generated, frame, leftHand, caseId, 1, () => true)) {
        receipts.set(load, receipt);
      }
    }
    for (const { caseId: from, factor } of rule?.includes ?? []) {
      const part = expected(from);
      result.addScaled(part.totals, factor);
      for (const name of part.names) names.add(name);
      for (const [id, cells] of part.slabs) addSlabSource(slabs, id, cells, factor);
      for (const [load, receipt] of part.generated) {
        addGeneratedMeasure(receipts, load, receipt, factor);
      }
    }
    const entry = { totals: result, names, slabs, generated: receipts };
    cache.set(caseId, entry);
    return entry;
  };

  const verifyGenerated = (
    caseId: number, loads: readonly Load[], sources?: ReadonlyMap<Load, readonly SolverLoad3D[]>,
    checkedSource?: (source: CheckedSource3D) => void,
    select: (load: Load) => boolean = () => true,
  ) => {
    const receipts = !checkAuthored
      ? generatedExpected(model, loads, frame, leftHand, caseId, 1)
      : effects && !effects.targets.has(caseId) ? new Map<Load, GeneratedMeasure>() : expected(caseId).generated;
    const delivered = new Map<Load, SolverLoad3D[]>();
    for (const load of loads) {
      const original = accountingOrigin(load);
      if (!select(original)) continue;
      if (!receipts.has(original) && !hasGeneratedSource(load)) continue;
      const rows = delivered.get(original) ?? [];
      for (const row of sources?.get(load) ?? []) rows.push(row);
      delivered.set(original, rows);
    }
    for (const original of new Set([...receipts.keys(), ...delivered.keys()])) {
      if (!select(original)) continue;
      const expectedSource = receipts.get(original);
      const receipt: CheckedSource3D = {
        label: sourceLabel(model, caseId, original), expected: expectedSource?.expected ?? new Wrench(),
        rows: delivered.get(original) ?? [],
        nodeId: expectedSource?.nodeId, shell: expectedSource?.shell,
      };
      accountSource3D(model, input, caseId, receipt);
      checkedSource?.(receipt);
    }
  };

  const verifySlabs = (
    caseId: number, loads: readonly Load[], sources?: ReadonlyMap<Load, readonly SolverLoad3D[]>,
    checkedSource?: (source: CheckedSource3D) => void,
  ) => {
    if (!checkAuthored || (effects && !effects.targets.has(caseId))) return;
    const { slabs } = expected(caseId);
    const delivered = new Map<number, Map<string, (readonly SolverLoad3D[])[]>>();
    for (const load of loads) {
      if (load.type !== 'surface3d' || load.data.fromDef === undefined || !sourceNames.has(load.data.fromDef)) continue;
      const id = load.data.fromDef;
      const batch = delivered.get(id) ?? new Map<string, (readonly SolverLoad3D[])[]>();
      const cell = slabCell(load.data.on, load.data.quadId);
      const deliveries = batch.get(cell) ?? [];
      deliveries.push(sources?.get(load) ?? []);
      batch.set(cell, deliveries);
      delivered.set(id, batch);
    }
    for (const id of new Set([...slabs.keys(), ...delivered.keys()])) {
      const intended = slabs.get(id), actual = delivered.get(id);
      for (const cell of new Set([...(intended?.keys() ?? []), ...(actual?.keys() ?? [])])) {
        const expected = intended?.get(cell), batches = actual?.get(cell) ?? [];
        const carrier = `${sourceNames.get(id)} · ${tp('whatif.loads')} · ${cell}`;
        const label = caseLabel(model, caseId);
        const cellLabel = `${label} · ${carrier}`;
        compareComponent(cellLabel, tp('whatif.loads'), expected?.forces.length ?? 0, batches.length, 0, 0);
        if (!expected) continue;
        for (const [i, forces] of expected.forces.entries()) {
          verifySurfaceRows(model, caseId, label, expected.shellId, carrier, expected.nodeIds, forces, batches[i]!);
        }
        const receipt = { label: cellLabel, expected: expected.expected, rows: batches.flat() };
        accountSource3D(model, input, caseId, receipt);
        checkedSource?.(receipt);
      }
    }
  };

  return {
    cases: effects?.targets ?? new Set([...authored.keys(), ...pressures.keys()]),
    verifyGenerated,
    verifySlabs,
    verify(
      caseId: number, loads: readonly Load[], assembled: readonly SolverLoad3D[],
      sources?: ReadonlyMap<Load, readonly SolverLoad3D[]>,
      checkedSource?: (source: CheckedSource3D) => void,
    ): Wrench {
      const { totals, names } = !checkAuthored
        ? { totals: enteredLoads(model, loads, frame, leftHand, caseId, new Set()), names: [] }
        : effects && !effects.targets.has(caseId)
          ? { totals: new Wrench(), names: [] }
          : expected(caseId);
      const label = [caseLabel(model, caseId), ...names].join(' · ');
      compare(label, totals, assembled3D(model, input, assembled, caseId, label));
      const intents = checkAuthored ? (!effects || effects.targets.has(caseId) ? scenarioExpected(caseId) : []) : undefined;
      verifyScenarioSurfaceLoads(source, caseId, loads, sources, label, intents);
      verifySlabs(caseId, loads, sources, checkedSource);
      verifyGenerated(caseId, loads, sources, checkedSource);
      return totals;
    },
  };
}

export function accountCombination(
  model: ModelData, input: SolverInput3D, id: number, name: string, loads: readonly SolverLoad3D[],
  terms: ReadonlyArray<{ factor: number; totals: Wrench }>,
): void {
  const entered = new Wrench();
  for (const { factor, totals } of terms) entered.addScaled(totals, factor);
  const label = `#${id} (${name})`;
  compare(label, entered, assembled3D(model, input, loads, id, label));
}
