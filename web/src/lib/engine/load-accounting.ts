import { accountingCaseSources, accountingProjection, accountingSource, scenarioSurfaceAdjustment } from './accounting-source';
import { tp } from '../i18n';
import type { Load, PointLoadOnElement } from '../store/model.svelte';
import type { FloorLoadDef } from '../model/loads/floor-definitions';
import type { ModelData } from './solver-service';
import type { SolverInput, SolverLoad } from './types';
import type { SolverInput3D, SolverLoad3D } from './types-3d';
import { computeLocalAxes3D, memberRoll, type LocalAxes3D } from './local-axes-3d';
import { memberFrame3D } from './member-loads';
import { transverseSign } from './transverse-sign-2d';
import { add, agrees, cross, norm, mul, sub, unit, xyz, zero, Wrench, type Vector } from './accounting-math';
import { accountSurface } from './surface-accounting';
import { SolveAccountingError, type PlateMeasure } from './plate-accounting';

type Frame = 'xy' | 'xz' | 'space';
const components = ['Fx', 'Fy', 'Fz', 'Mx', 'My', 'Mz'];
const inPlane = (frame: Frame, x: number, y: number): Vector => frame === 'xz' ? [x, 0, y] : [x, y, 0];
const planeMoment = (frame: Frame, m: number): Vector => frame === 'xz' ? [0, -m, 0] : [0, 0, m];

function caseLabel(model: ModelData, id: number): string {
  const name = model.loadCases?.find(c => c.id === id)?.name;
  return name ? `#${id} (${name})` : `#${id}`;
}

function unsupported(model: ModelData, caseId: number, kind: string, id: number): never {
  throw new SolveAccountingError(tp('svc.accountingUnsupported', { case: caseLabel(model, caseId), kind, id }));
}

function compare(label: string, entered: Wrench, assembled: Wrench): void {
  for (let i = 0; i < components.length; i++) {
    const a = entered.components[i]!.value, b = assembled.components[i]!.value;
    const scale = i < 3
      ? Math.max(entered.forceScale.value, assembled.forceScale.value)
      : Math.max(entered.momentScale.value, assembled.momentScale.value);
    if (!agrees(a, b, scale)) throw new SolveAccountingError(tp('svc.accountingMismatch', {
      case: label, component: components[i]!, entered: a, assembled: b,
    }));
  }
}

function localVector(axes: LocalAxes3D, x: number, y: number, z: number): Vector {
  return add(mul(axes.ex, x), add(mul(axes.ey, y), mul(axes.ez, z)));
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

function directionalPlaneForce(frame: Frame, chord: Vector, magnitude: number, degrees: number, global: boolean): Vector {
  const t = degrees * Math.PI / 180;
  if (global) return inPlane(frame, magnitude * Math.sin(t), magnitude * Math.cos(t));
  const tangent = unit([chord[0], chord[1], 0]);
  const sign = frame === 'space' ? 1 : transverseSign(chord[0], chord[1]);
  return inPlane(frame,
    magnitude * (Math.sin(t) * tangent[0] - sign * Math.cos(t) * tangent[1]),
    magnitude * (Math.sin(t) * tangent[1] + sign * Math.cos(t) * tangent[0]));
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
        out.apply(at(nodeId), inPlane(frame, fx, fz ?? fy ?? 0), planeMoment(frame, my ?? mz ?? 0));
        continue;
      }
      case 'nodal3d': {
        const { nodeId, fx, fy, fz, mx, my, mz } = load.data;
        out.apply(at(nodeId), [fx, fy, fz], [mx, my, mz]);
        continue;
      }
      case 'thermal':
      case 'thermalQuad3d':
      case 'displacement3d':
        if (frame === 'xy' && load.type !== 'thermal') unsupported(model, caseId, load.type, d.id);
        continue;
      case 'surface3d': {
        const d = load.data;
        const spec = d.fromDef !== undefined && definitions.has(d.fromDef) ? d[scenarioSurfaceAdjustment] : d;
        if (!spec) continue;
        const shell = (d.on === 'plate' ? model.plates : model.quads)?.get(d.quadId);
        if (!shell || frame !== 'space' || !accountSurface(out, shell.nodes.map(at), spec)) {
          unsupported(model, caseId, load.type, d.id);
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
        const planar = p === 0 && !px ? zero() : add(force(p), mul(inPlane(frame, ...planarTangent(drawnChord)), px ?? 0));
        out.apply(add(start, mul(axis, a)), planar, planeMoment(frame, enteredMoment(load.data)));
      } else {
        const { qI, qJ, a, b } = load.data;
        out.line(start, axis, a ?? 0, b ?? length, force(qI), force(qJ));
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
      const inFrame = d.frame === 'global' ? (x: number, y: number, z: number): Vector => [x, y, z] : local;
      out.apply(add(start, mul(axis, d.a)), inFrame(d.px ?? 0, d.py, d.pz), inFrame(d.mx ?? 0, d.my ?? 0, d.mz ?? 0));
    } else {
      const d = load.data;
      const inFrame = (x: number, y: number, z: number): Vector => {
        if (d.frame === 'global') return [x, y, z];
        if (d.frame === 'projected') {
          return [x * Math.hypot(axis[1], axis[2]), y * Math.hypot(axis[0], axis[2]), z * Math.hypot(axis[0], axis[1])];
        }
        return local(x, y, z);
      };
      out.line(start, axis, d.a ?? 0, d.b ?? length,
        inFrame(d.qXI ?? 0, d.qYI, d.qZI), inFrame(d.qXJ ?? 0, d.qYJ, d.qZJ));
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
      result.apply(at(nodeId), [fx, fz ?? 0, 0], [0, 0, my ?? 0]);
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
      result.apply(add(a, mul(axis, position)), add(mul(normal, p), mul(axis, px ?? 0)), [0, 0, my ?? 0]);
    } else {
      const { qI, qJ, a: start, b: end } = load.data;
      const direction = load.type === 'distributed' ? normal : axis;
      result.line(a, axis, start ?? 0, end ?? length, mul(direction, qI), mul(direction, qJ));
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
    if (load.type === 'nodal') {
      const { nodeId, fx, fy, fz, mx, my, mz } = load.data;
      result.apply(at(nodeId), [fx, fy, fz], [mx, my, mz]);
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
      result.line(start, axes.ex, d.a ?? 0, d.b ?? axes.L,
        localVector(axes, d.qXI ?? 0, d.qYI, d.qZI), localVector(axes, d.qXJ ?? 0, d.qYJ, d.qZJ));
    } else {
      const d = load.data;
      result.apply(add(start, mul(axes.ex, d.a)), localVector(axes, 0, d.py, d.pz));
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

function toWorld(wrench: Wrench, plane: 'xz' | 'yz', origin: Vector): Wrench {
  const rotate = ([x, y, z]: Vector): Vector => plane === 'xz' ? [x, -z, y] : [z, x, y];
  const { force, moment } = wrench.resultants;
  const worldForce = rotate(force);
  const world = new Wrench();
  world.addTotals(worldForce, add(rotate(moment), cross(origin, worldForce)),
    wrench.forceScale.value, wrench.momentScale.value + norm(origin) * wrench.forceScale.value);
  return world;
}

export function accountLoads2D(
  model: ModelData, input: SolverInput, loads: readonly Load[], assembled: readonly SolverLoad[],
  caseId: number, originals: readonly Load[],
): void {
  const wire = assembled2D(model, input, assembled, caseId);
  const projection = model[accountingProjection];
  if (!projection || !originals.length) {
    compare(caseLabel(model, caseId), enteredLoads(model, loads, 'xy', false, caseId, new Set()), wire);
    return;
  }
  const spatialIds = new Set(originals.map(l => l.data.id));
  const planar = enteredLoads(model, loads.filter(l => !spatialIds.has(l.data.id)), 'xy', false, caseId, new Set());
  const spatial = enteredLoads(projection.source, originals, 'space', false, caseId, new Set());
  const location = projection.source.nodes.values().next().value;
  const origin: Vector = projection.plane === 'xz' ? [0, location?.y ?? 0, 0] : [location?.x ?? 0, 0, 0];
  const expected = toWorld(planar, projection.plane, origin);
  const { force, moment } = spatial.resultants;
  expected.addTotals(force, moment, spatial.forceScale.value, spatial.momentScale.value);
  compare(caseLabel(model, caseId), expected, toWorld(wire, projection.plane, origin));
}

export function loadAccounting3D(
  model: ModelData, input: SolverInput3D, embedded: boolean, leftHand: boolean,
  plates: ReadonlyMap<number, PlateMeasure>, checkAuthored: boolean,
) {
  const source = (checkAuthored ? model[accountingSource] : undefined) ?? model;
  const effects = checkAuthored ? model[accountingCaseSources] : undefined;
  const authored = effects?.authored ?? loadCaseBatches(source.loads);
  const pressures = new Map<number, Array<{ id: number; plate: PlateMeasure; q: number }>>();
  for (const [id, group] of source.groups ?? []) {
    if (group.kind !== 'floorLoad') continue;
    const d = group.data as unknown as FloorLoadDef | undefined;
    if (!d || d.distribution !== 'slab' || d.target.by !== 'group') continue;
    const plate = plates.get(d.target.groupId);
    if (!plate) continue;
    const batch = pressures.get(d.caseId) ?? [];
    batch.push({ id, plate, q: d.q * (d.perPlanArea ? Math.abs(plate.normal[2]) : 1) });
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
    for (const { plate, q } of batch) totals.apply(plate.centroid, [0, 0, -q * plate.area]);
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
    verify(caseId: number, loads: readonly Load[], assembled: readonly SolverLoad3D[]): Wrench {
      const { totals, names } = !checkAuthored
        ? { totals: enteredLoads(model, loads, frame, leftHand, caseId, new Set()), names: [] }
        : effects && !effects.targets.has(caseId)
          ? { totals: new Wrench(), names: [] }
          : expected(caseId);
      const label = [caseLabel(model, caseId), ...names].join(' · ');
      compare(label, totals, assembled3D(model, input, assembled, caseId));
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
