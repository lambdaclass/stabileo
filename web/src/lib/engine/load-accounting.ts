import { accountingCaseSources, accountingProjection, accountingSource, scenarioIntents, scenarioSurfaceExpectations, scenarioSurfaceIntentOf, type ScenarioSurfaceIntent } from './accounting-source';
import { tp } from '../i18n';
import type { Load, PointLoadOnElement } from '../store/model.svelte';
import type { FloorLoadDef } from '../model/loads/floor-definitions';
import type { ModelData } from './solver-service';
import type { SolverInput, SolverLoad } from './types';
import type { SolverInput3D, SolverLoad3D } from './types-3d';
import { computeLocalAxes3D, memberRoll, type LocalAxes3D } from './local-axes-3d';
import { memberFrame3D } from './member-loads';
import { planarLoadDirection } from './planar-load-direction';
import { transverseSign } from './transverse-sign-2d';
import { add, cross, mul, agreesAtScale, assembledMagnitudes3D, LoadScalar, LoadVector, norm, positionAt, sub, unit, xyz, zero, Wrench, type Vector } from './accounting-math';
import { accountSurface, expectedSurfaceNodeForces } from './surface-accounting';
import type { ShellLoadSpec } from './shell-load-integration';
import { selfWeightDirection, type SelfWeightSource } from './self-weight';
import { SolveAccountingError, type PlateMeasure } from './plate-accounting';

type Frame = 'xy' | 'xz' | 'space';
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

function compareComponent(
  label: string, component: string, entered: number, assembled: number, scale: number, underflow: number,
): void {
  if (!agreesAtScale(entered, assembled, scale, underflow)) {
    throw new SolveAccountingError(tp('svc.accountingMismatch', { case: label, component, entered, assembled }));
  }
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
  const first = entered.memberLineMeasures, second = assembled.memberLineMeasures;
  if (!first && !second) return;
  const empty = new Wrench();
  for (const id of new Set([...(first?.keys() ?? []), ...(second?.keys() ?? [])])) {
    compareMeasures(`${label} · ${tp('whatif.member', { n: id })}`, stationComponents,
      first?.get(id) ?? empty, second?.get(id) ?? empty);
  }
}

export const redistributedLineLoads = new WeakMap<SolverLoad3D, { member: number; station: number }>();

type ScenarioNodeForce = { shellId: number; nodeId: number; force: LoadVector };

const scenarioNodeForces = new WeakMap<SolverLoad3D, ScenarioNodeForce>();

function verifyScenarioNode(
  model: ModelData, caseId: number, label: string, wire: SolverLoad3D, expected: ScenarioNodeForce,
): void {
  const { shellId, nodeId, force } = expected;
  if (wire.type !== 'nodal' || wire.data.nodeId !== nodeId) unsupported(model, caseId, 'surface3d', shellId);
  const { fx, fy, fz, mx, my, mz } = wire.data;
  const nodeLabel = `${label} · #${shellId} · ${tp('whatif.node', { n: nodeId })}`;
  for (const [i, actual] of [fx, fy, fz, mx, my, mz].entries()) {
    const entered = force.value[i] ?? 0;
    compareComponent(nodeLabel, components[i]!, entered, actual, Math.max(force.magnitude[i] ?? 0, Math.abs(entered), Math.abs(actual)),
      force.underflow[i] ?? 0);
  }
}

export function verifyFactoredScenarioNode(
  model: ModelData, id: number, name: string, original: SolverLoad3D, scaled: SolverLoad3D, factor: number,
): void {
  const expected = scenarioNodeForces.get(original);
  if (expected) verifyScenarioNode(model, id, `#${id} (${name})`, scaled, { ...expected, force: expected.force.scale(factor) });
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
    const forces = expectedSurfaceNodeForces(points, expected);
    const batch = sources?.get(load) ?? [];
    if (!forces || batch.length !== shell.nodes.length) unsupported(model, caseId, load.type, data.quadId);
    const byNode = new Map(batch.map(wire => {
      if (wire.type !== 'nodal') unsupported(model, caseId, load.type, data.id);
      return [wire.data.nodeId, wire] as const;
    }));
    for (const [i, nodeId] of shell.nodes.entries()) {
      const wire = byNode.get(nodeId) ?? unsupported(model, caseId, load.type, data.id);
      const expectedNode = { shellId: data.quadId, nodeId, force: forces[i]! };
      verifyScenarioNode(model, caseId, label, wire, expectedNode);
      scenarioNodeForces.set(wire, expectedNode);
    }
  }
}

function localVector(axes: LocalAxes3D, x: number, y: number, z: number, budget?: LoadVector): LoadVector {
  const along = LoadVector.from(axes.ex).scale(new LoadScalar(x, budget?.underflow[0]), budget?.magnitude[0]);
  const transverseY = LoadVector.from(axes.ey).scale(new LoadScalar(y, budget?.underflow[1]), budget?.magnitude[1]);
  const transverseZ = LoadVector.from(axes.ez).scale(new LoadScalar(z, budget?.underflow[2]), budget?.magnitude[2]);
  return along.add(transverseY.add(transverseZ));
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

function enteredLoads(model: ModelData, loads: readonly Load[], frame: Frame, leftHand: boolean, caseId: number, definitions: ReadonlySet<number>): Wrench {
  const out = new Wrench();
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
        if (!shell || frame !== 'space' || !accountSurface(surface, shell.nodes.map(at), spec)) {
          unsupported(model, caseId, load.type, spec.id);
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
    if (load.type === 'prestress3d') {
      const { force, eI, eM, eJ } = load.data;
      if (![force, eI, eM, eJ].every(Number.isFinite)) unsupported(model, caseId, load.type, d.id);
      continue;
    }

    const axes = spatial?.ax ?? basis(start, end, member.id, {}, memberRoll(member, model.sections));
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
  const result = new Wrench();
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

function assembled3D(model: ModelData, input: SolverInput3D, loads: readonly SolverLoad3D[], caseId: number): Wrench {
  const result = new Wrench();
  const at = (id: number): Vector => {
    const node = input.nodes.get(id);
    if (!node) return unsupported(model, caseId, 'node', id);
    return xyz(node);
  };
  const frames = new Map<number, { start: Vector; axes: LocalAxes3D }>();
  for (const load of loads) {
    const kind: string = load.type;
    if (kind === 'thermal' || kind === 'plateThermal' || kind === 'quadThermal' || kind === 'curvedShellThermal') continue;
    const magnitudes = assembledMagnitudes3D.get(load);
    if (load.type === 'nodal') {
      const { nodeId, fx, fy, fz, mx, my, mz } = load.data;
      const nodal = magnitudes && 'force' in magnitudes ? magnitudes : undefined;
      const force = LoadVector.from([fx, fy, fz], nodal?.force.magnitude, nodal?.force.underflow);
      result.apply(at(nodeId), force, LoadVector.from([mx, my, mz], nodal?.couple.magnitude, nodal?.couple.underflow));
      const redistributed = redistributedLineLoads.get(load);
      if (redistributed) result.memberLineForce(redistributed.member, new LoadScalar(redistributed.station), force);
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
        localVector(axes, d.qXJ ?? 0, d.qYJ, d.qZJ, line?.qJ), elementId);
    } else {
      const d = load.data;
      result.apply(positionAt(start, axes.ex, d.a), localVector(axes, 0, d.py, d.pz));
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
  const expected = new Wrench();
  memberWeight(expected, source, [a.x, a.y, 0], [b.x, b.y, 0], [x, z, 0]);
  compare(weightLabel(model, source), expected, assembled2D(model, input, rows, source.caseId));
}

export type CheckedSource3D = { label: string; expected: Wrench; rows: readonly SolverLoad3D[] };

export function accountSource3D(
  model: ModelData, input: SolverInput3D, caseId: number, source: CheckedSource3D, factor = 1, rows = source.rows,
) {
  if (rows.length !== source.rows.length) {
    throw new SolveAccountingError(tp('svc.accountingMismatch', {
      case: source.label, component: tp('whatif.loads'), entered: source.rows.length, assembled: rows.length,
    }));
  }
  const expected = new Wrench();
  expected.addScaled(source.expected, factor);
  compare(source.label, expected, assembled3D(model, input, rows, caseId));
}

export function weightSource3D(model: ModelData, embedded: boolean, source: SelfWeightSource, rows: readonly SolverLoad3D[]): CheckedSource3D {
  const expected = new Wrench();
  const dir = selfWeightDirection(source);
  if (source.kind === 'member') {
    const member = model.elements.get(source.id)!;
    const frame = embedded ? null : memberFrame3D(model, member);
    if (!embedded && !frame) unsupported(model, source.caseId, source.kind, source.id);
    const at = (id: number): Vector => {
      const { x, y } = model.nodes.get(id)!;
      return [x, 0, y];
    };
    memberWeight(expected, source, frame ? frame.ni : at(member.nodeI), frame ? frame.nj : at(member.nodeJ), dir);
  } else {
    const shell = (source.kind === 'plate' ? model.plates : model.quads)?.get(source.id);
    if (!shell) unsupported(model, source.caseId, source.kind, source.id);
    const [a, b, c, d] = shell.nodes.map(id => xyz(model.nodes.get(id) ?? unsupported(model, source.caseId, 'node', id)));
    const u = sub(b!, a!), v = sub(d ?? c!, a!);
    const weight = LoadVector.from(dir).scale(source.intensity);
    if (!d) {
      const area = norm(cross(u, v)) / 2;
      expected.apply(add(a!, mul(add(u, v), 1 / 3)), weight.scale(area));
    } else {
      const w = sub(sub(sub(c!, a!), u), v);
      const g = 1 / (2 * Math.sqrt(3));
      for (const s of [0.5 - g, 0.5 + g]) for (const t of [0.5 - g, 0.5 + g]) {
        const point = add(a!, add(mul(u, s), add(mul(v, t), mul(w, s * t))));
        const area = norm(cross(add(u, mul(w, t)), add(v, mul(w, s)))) / 4;
        expected.apply(point, weight.scale(area));
      }
    }
  }
  return { label: weightLabel(model, source), expected, rows };
}

export function generatedSource3D(
  model: ModelData, embedded: boolean, leftHand: boolean, caseId: number, load: Load, rows: readonly SolverLoad3D[],
): CheckedSource3D {
  return {
    label: sourceLabel(model, caseId, load), rows,
    expected: enteredLoads(model, [load], embedded ? 'xz' : 'space', leftHand, caseId, new Set()),
  };
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
  const pressures = new Map<number, Array<{ id: number; plate: PlateMeasure; pressure: LoadVector }>>();
  for (const [id, group] of source.groups ?? []) {
    if (group.kind !== 'floorLoad') continue;
    const d = group.data as unknown as FloorLoadDef | undefined;
    if (!d || d.distribution !== 'slab' || d.target.by !== 'group') continue;
    const plate = plates.get(d.target.groupId);
    if (!plate) continue;
    const batch = pressures.get(d.caseId) ?? [];
    const pressure = LoadVector.from([0, 0, -d.q]);
    batch.push({ id, plate, pressure: d.perPlanArea ? pressure.scale(Math.abs(plate.normal[2])) : pressure });
    pressures.set(d.caseId, batch);
  }

  const frame = embedded ? 'xz' : 'space';
  const cache = new Map<number, { totals: Wrench; names: Set<string> }>();
  const expected = (caseId: number): { totals: Wrench; names: Set<string> } => {
    const cached = cache.get(caseId);
    if (cached) return cached;
    const batch = pressures.get(caseId) ?? [];
    const definitions = new Set(batch.map(({ id }) => id));
    const totals = enteredLoads(source, authored.get(caseId) ?? [], frame, leftHand, caseId, definitions);
    const names = new Set(batch.map(({ plate }) => plate.name));
    for (const { plate, pressure } of batch) totals.apply(plate.centroid, pressure.scale(plate.area));
    const rule = effects?.cases.get(caseId);
    const result = new Wrench();
    result.addScaled(totals, rule?.ratio ?? 1);
    const generated = effects?.generated.get(caseId);
    if (generated) result.addScaled(enteredLoads(source, generated, frame, leftHand, caseId, definitions), 1);
    for (const { caseId: from, factor } of rule?.includes ?? []) {
      const part = expected(from);
      result.addScaled(part.totals, factor);
      for (const name of part.names) names.add(name);
    }
    const entry = { totals: result, names };
    cache.set(caseId, entry);
    return entry;
  };

  return {
    cases: effects?.targets ?? new Set([...authored.keys(), ...pressures.keys()]),
    verify(
      caseId: number, loads: readonly Load[], assembled: readonly SolverLoad3D[],
      sources?: ReadonlyMap<Load, readonly SolverLoad3D[]>,
    ): Wrench {
      const { totals, names } = !checkAuthored
        ? { totals: enteredLoads(model, loads, frame, leftHand, caseId, new Set()), names: [] }
        : effects && !effects.targets.has(caseId)
          ? { totals: new Wrench(), names: [] }
          : expected(caseId);
      const label = [caseLabel(model, caseId), ...names].join(' · ');
      compare(label, totals, assembled3D(model, input, assembled, caseId));
      const intents = checkAuthored ? (!effects || effects.targets.has(caseId) ? scenarioExpected(caseId) : []) : undefined;
      verifyScenarioSurfaceLoads(source, caseId, loads, sources, label, intents);
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
  compare(`#${id} (${name})`, entered, assembled3D(model, input, loads, id));
}
