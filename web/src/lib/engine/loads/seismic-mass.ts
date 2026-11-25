import type { LoadModelData, LevelMass, PlannedDistributed, PlannedNodal } from './load-plan';
import { widthSpans, type GravityLayout } from './plan-gravity';
import type { AreaLoadsResult } from './plan-area-loads';
import { hasShellOffset } from '../shell-offsets';
import { hasMemberOffset } from '../member-offsets';
import { pressureQuadrature } from './wind-pressure-field';
import { createSectionWeight } from '../../section/weight';
import type { MemberOffset, ShellOffset } from '../../model/element-3d-metadata';
import { SupportMappingError, supportDofs3D } from '../support-dofs-3d';

export type MassNode = { id: number; x: number; y: number; z: number };
type LineGeometry = { elementId: number; nodeI: MassNode; nodeJ: MassNode; length: number; a: number; b: number };
type LineWeight = LineGeometry & { wi: number; wj: number; width?: number };
export type MassMember = LineWeight & { kind: 'member' };
type MassAtNode = LineWeight & { kind: 'nodal'; node: MassNode };
export type MassShell = { kind: 'shell'; quadId: number; on?: 'plate'; nodes: MassNode[]; density: number };
export type SeismicMass = MassMember | MassAtNode | MassShell;
export type SeismicLevel = LevelMass & { mass: SeismicMass[]; planWidth: { x: number; y: number }; snowWeightKN: number; unresolvedWeight: boolean; refusals: Set<MassRefusal> };
type SeismicGeometryRefusal = 'seismicBase' | 'seismicSteppedBase' | 'seismicDisconnected' | 'seismicBelowDatum' | 'seismicAmbiguousStory' | 'seismicStoryPrecision';
export type SeismicModel =
  | { levels: SeismicLevel[]; datum: { elevation: number } }
  | { levels: []; datum: { refusal: SeismicGeometryRefusal } };
export type MassRefusal = 'member' | 'shell' | 'panel' | 'eccentric' | 'snow' | 'torsion' | 'weight' | 'storyNode' | 'slopedMember';

const interpolate = (a: number, b: number, t: number) => a + (b - a) * t;
type MassSample = (weight: number, x: number, y: number) => void;

export function massSamples(mass: SeismicMass, sample: MassSample) {
  if (mass.kind !== 'shell') {
    for (const [u, w] of pressureQuadrature) {
      const t = (1 + u) / 2, s = interpolate(mass.a, mass.b, t);
      const x = interpolate(mass.nodeI.x, mass.nodeJ.x, s / mass.length);
      const y = interpolate(mass.nodeI.y, mass.nodeJ.y, s / mass.length);
      const weight = w * (mass.b - mass.a) * interpolate(mass.wi, mass.wj, t) / 2;
      sample(weight, x, y);
    }
    return;
  }
  const [a, b, c, d] = mass.nodes;
  if (mass.on === 'plate') {
    const size = Math.abs((b!.x - a!.x) * (c!.y - a!.y) - (b!.y - a!.y) * (c!.x - a!.x)) / 2;
    for (const i of [0, 1, 2]) {
      const shape = [0, 1, 2].map(j => i === j ? 2 / 3 : 1 / 6);
      const point = (key: 'x' | 'y') => a![key] + mass.nodes.reduce((v, n, j) => v + shape[j]! * (n[key] - a![key]), 0);
      sample(size * mass.density / 3, point('x'), point('y'));
    }
    return;
  }
  for (const [r, wr] of pressureQuadrature) for (const [s, ws] of pressureQuadrature) {
    const shape = [(1 - r) * (1 - s), (1 + r) * (1 - s), (1 + r) * (1 + s), (1 - r) * (1 + s)].map(n => n / 4);
    const derivatives = (key: 'x' | 'y') => [
      ((b![key] - a![key]) * (1 - s) + (c![key] - d![key]) * (1 + s)) / 4,
      ((d![key] - a![key]) * (1 - r) + (c![key] - b![key]) * (1 + r)) / 4,
    ];
    const [xr, xs] = derivatives('x'), [yr, ys] = derivatives('y');
    const point = (key: 'x' | 'y') => a![key] + mass.nodes.reduce((v, n, i) => v + shape[i]! * (n[key] - a![key]), 0);
    sample(wr * ws * Math.abs(xr! * ys! - xs! * yr!) * mass.density, point('x'), point('y'));
  }
}

type StructuralSegment = [MassNode, MassNode];
type SeismicSurface = { id: number; nodes: readonly number[]; materialId?: number; thickness?: number; curved?: boolean; offset?: ShellOffset };
type SeismicMember = { id: number; nodeI: number; nodeJ: number; type?: string; offset?: MemberOffset };
type SeismicGeometry = Pick<LoadModelData, 'nodes' | 'supports' | 'constraints'> & {
  elements: ReadonlyMap<number, SeismicMember>;
  quads?: ReadonlyMap<number, SeismicSurface>;
  plates?: ReadonlyMap<number, SeismicSurface>;
};

function setStructuralPlanWidths(levels: SeismicLevel[], segments: StructuralSegment[]) {
  const bounds = new Map(levels.map(l => [l.elevation, { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity }]));
  const include = (z: number, x: number, y: number) => {
    const b = bounds.get(z);
    if (!b) return;
    b.minX = Math.min(b.minX, x);
    b.maxX = Math.max(b.maxX, x);
    b.minY = Math.min(b.minY, y);
    b.maxY = Math.max(b.maxY, y);
  };
  for (const [i, j] of segments) {
    include(i.z, i.x, i.y);
    include(j.z, j.x, j.y);
    if (i.z === j.z) continue;
    const low = Math.min(i.z, j.z), high = Math.max(i.z, j.z);
    for (const { elevation } of levels) {
      if (elevation <= low) continue;
      if (elevation >= high) break;
      const t = (elevation - i.z) / (j.z - i.z);
      include(elevation, interpolate(i.x, j.x, t), interpolate(i.y, j.y, t));
    }
  }
  for (const level of levels) {
    const b = bounds.get(level.elevation)!;
    level.planWidth = { x: Math.max(0, b.maxX - b.minX), y: Math.max(0, b.maxY - b.minY) };
  }
}

type SupportedSeismicComponent = {
  elevation: number;
  nodes: Set<number>;
  storyNodes: Set<number>;
  segments: StructuralSegment[];
};

function supportedSeismicComponent(
  model: SeismicGeometry, nodes: ReadonlyMap<number, MassNode>, segments: StructuralSegment[],
): SupportedSeismicComponent | { refusal: SeismicGeometryRefusal } {
  const first = segments[0]?.[0];
  if (!first) return { refusal: 'seismicBase' };

  const adjacent = new Map<number, number[]>();
  const link = (from: number, to: number) => {
    const neighbors = adjacent.get(from);
    if (neighbors) neighbors.push(to);
    else adjacent.set(from, [to]);
  };
  const connect = (a: number, b: number) => {
    link(a, b);
    link(b, a);
  };
  for (const [a, b] of segments) connect(a.id, b.id);

  const storyNodes = new Set<number>();
  const hasPosition = (id: number) => {
    const n = nodes.get(id);
    return n && [n.x, n.y, n.z].every(Number.isFinite);
  };
  for (const constraint of model.constraints ?? []) {
    if (constraint.type !== 'diaphragm') continue;
    const { masterNode, slaveNodes } = constraint;
    if (!hasPosition(masterNode)) continue;
    const plane = constraint.plane?.toUpperCase() || 'XY';
    const elevation = nodes.get(masterNode)!.z;
    for (const slave of slaveNodes) {
      if (slave === masterNode || !hasPosition(slave)) continue;
      connect(masterNode, slave);
      if (plane === 'XY' && nodes.get(slave)!.z === elevation) {
        storyNodes.add(masterNode);
        storyNodes.add(slave);
      }
    }
  }

  const reached = new Set([first.id]);
  const pending = [first.id];
  while (pending.length > 0) {
    for (const id of adjacent.get(pending.pop()!) ?? []) {
      if (reached.has(id)) continue;
      reached.add(id);
      pending.push(id);
    }
  }
  if (segments.some(([a, b]) => !reached.has(a.id) || !reached.has(b.id))) return { refusal: 'seismicDisconnected' };

  const supportElevations = new Set<number>();
  for (const { nodeId } of model.supports?.values() ?? []) {
    if (!reached.has(nodeId)) continue;
    storyNodes.add(nodeId);
    supportElevations.add(nodes.get(nodeId)!.z);
  }
  if (supportElevations.size > 1) return { refusal: 'seismicSteppedBase' };
  const [elevation] = supportElevations;
  if (elevation === undefined) return { refusal: 'seismicBase' };
  return { elevation, nodes: reached, storyNodes, segments };
}

function lineJoint(a: MassNode, p: MassNode, b: MassNode): 'straight' | 'corner' | 'unresolved' {
  const chord = [b.x - a.x, b.y - a.y, b.z - a.z];
  const leg = [p.x - a.x, p.y - a.y, p.z - a.z];
  const other = [b.x - p.x, b.y - p.y, b.z - p.z];
  const lengthA = Math.hypot(...leg), lengthB = Math.hypot(...other);
  const u = leg.map(value => value / lengthA), v = other.map(value => value / lengthB);
  const cross = Math.hypot(u[1]! * v[2]! - u[2]! * v[1]!, u[2]! * v[0]! - u[0]! * v[2]!, u[0]! * v[1]! - u[1]! * v[0]!);
  if (cross <= 64 * Number.EPSILON && u.reduce((sum, value, i) => sum + value * v[i]!, 0) > 0) return 'straight';

  const axis = chord.reduce((best, value, i) => Math.abs(value) > Math.abs(chord[best]!) ? i : best, 0);
  const t = leg[axis]! / chord[axis]!;
  if (!(0 < t && t < 1)) return 'corner';

  const residual = leg.map((value, i) => i === axis ? 0 : value - t * chord[i]!);
  const rounding = (['x', 'y', 'z'] as const).map(dir =>
    (Number.EPSILON / 2) * (Math.abs(p[dir]) + (1 - t) * Math.abs(a[dir]) + t * Math.abs(b[dir])),
  );
  const bounds = chord.map((value, i) => i === axis ? 0 : rounding[i]! + Math.abs(value / chord[axis]!) * rounding[axis]!);
  if (residual.some((value, i) => Math.abs(value) > bounds[i]!)) return 'corner';
  const localPrecision = Math.sqrt(Number.EPSILON) * Math.min(lengthA, lengthB);
  return Math.hypot(...bounds) <= localPrecision ? 'straight' : 'unresolved';
}

function seismicTopology(model: SeismicGeometry) {
  const nodes = new Map([...model.nodes].map(([id, n]) => [id, { ...n, z: n.z ?? 0 }]));
  const geometry = new Map<number, LineGeometry>();
  const neighbours = new Map<number, Array<{ node: MassNode; elementId: number }>>();
  const next = (id: number, node: MassNode, elementId: number) => neighbours.set(id, [...(neighbours.get(id) ?? []), { node, elementId }]);
  for (const e of model.elements.values()) {
    const nodeI = nodes.get(e.nodeI), nodeJ = nodes.get(e.nodeJ);
    if (!nodeI || !nodeJ) continue;
    const length = Math.hypot(nodeJ.x - nodeI.x, nodeJ.y - nodeI.y, nodeJ.z - nodeI.z);
    if (!(Number.isFinite(length) && length > 0)) continue;
    geometry.set(e.id, { elementId: e.id, a: 0, b: length, length, nodeI, nodeJ });
    next(e.nodeI, nodeJ, e.id);
    next(e.nodeJ, nodeI, e.id);
  }
  const shells = [...model.quads?.values() ?? []].map(q => ({ ...q, on: undefined }));
  const plates = [...model.plates?.values() ?? []].map(q => ({ ...q, on: 'plate' as const }));
  const surfaces = [...shells, ...plates].map(q => {
    const corners = q.nodes.map(id => nodes.get(id)).filter((n): n is MassNode => n !== undefined);
    const valid = q.nodes.length === (q.on ? 3 : 4) && corners.length === q.nodes.length
      && corners.every(n => [n.x, n.y, n.z].every(Number.isFinite));
    return { q, corners: valid ? corners : undefined };
  });
  const surfaceNodes = new Set(surfaces.flatMap(({ q }) => q.nodes));
  const segments: StructuralSegment[] = [...geometry.values()].map(g => [g.nodeI, g.nodeJ]);
  for (const { corners } of surfaces) {
    if (!corners) continue;
    for (const [k, corner] of corners.entries()) segments.push([corner, corners[(k + 1) % corners.length]!]);
  }
  const component = supportedSeismicComponent(model, nodes, segments);
  if ('refusal' in component) return { refusal: component.refusal };

  const evidenced = new Set(component.storyNodes);
  for (const { corners } of surfaces) {
    if (!corners?.every(n => n.z === corners[0]!.z)) continue;
    for (const node of corners) evidenced.add(node.id);
  }
  const horizontalJoints = new Set<number>();
  for (const [a, b] of segments) {
    if (a.z !== b.z) continue;
    horizontalJoints.add(a.id);
    horizontalJoints.add(b.id);
  }
  const continuations = new Map<number, Map<number, number>>();
  const crossings = new Set<number>();
  const ambiguous = new Set<number>();
  const ridgeCandidates = new Set<number>();
  const storyNodes = new Set(evidenced);
  for (const [id, adjacent] of neighbours) {
    if (evidenced.has(id)) continue;
    const node = nodes.get(id)!;
    const connected = adjacent.map(edge => edge.node);
    const below = connected.filter(n => n.z < node.z);
    const descendingSlopes = below.filter(n => n.x !== node.x || n.y !== node.y);
    const ridge = node.z > component.elevation && descendingSlopes.length >= 2;
    if (!ridge && horizontalJoints.has(id)) {
      evidenced.add(id);
      storyNodes.add(id);
      continue;
    }
    if (adjacent.length === 2 || adjacent.length === 4) {
      const pairs = new Map<number, number[]>();
      for (const [i, from] of adjacent.entries()) for (const to of adjacent.slice(i + 1)) {
        const joint = lineJoint(from.node, node, to.node);
        if (joint === 'unresolved') return { refusal: 'seismicStoryPrecision' as const };
        if (joint === 'straight') {
          pairs.set(from.elementId, [...(pairs.get(from.elementId) ?? []), to.elementId]);
          pairs.set(to.elementId, [...(pairs.get(to.elementId) ?? []), from.elementId]);
        }
      }
      if (pairs.size === adjacent.length && [...pairs.values()].every(matches => matches.length === 1)) {
        continuations.set(id, new Map([...pairs].map(([from, [to]]) => [from, to!])));
        if (adjacent.length === 4) crossings.add(id);
        continue;
      }
    }
    if (ridge || (node.z > component.elevation && below.length && connected.some(n => n.z > node.z))) {
      ambiguous.add(id);
      if (ridge && adjacent.length === 2 && descendingSlopes.length === 2) ridgeCandidates.add(id);
      continue;
    }
    storyNodes.add(id);
  }

  const supported = new Set<number>();
  for (const [id, support] of model.supports ?? []) {
    if (!support.type || support.isInclined || support.uplift || support.curves) continue;
    try {
      const { rx, ry, rz } = supportDofs3D({ ...support, id, type: support.type });
      if (rx && ry && rz) supported.add(support.nodeId);
    } catch (error) {
      if (!(error instanceof SupportMappingError)) throw error;
    }
  }
  const highest = [...component.nodes].reduce((z, id) => Math.max(z, nodes.get(id)!.z), component.elevation);
  type Edge = { node: MassNode; elementId: number };
  const frameMember = ({ type, offset }: SeismicMember) => (type === undefined || type === 'frame') && !hasMemberOffset({ offset });
  const verticalSupport = (eave: MassNode, edge: Edge): boolean => {
    for (;;) {
      const { node, elementId } = edge;
      const member = model.elements.get(elementId)!;
      if (node.x !== eave.x || node.y !== eave.y || !frameMember(member)) return false;
      if (node.z === component.elevation) return supported.has(node.id);
      if (node.z < component.elevation || crossings.has(node.id)) return false;
      const nextId = continuations.get(node.id)?.get(elementId);
      const next = neighbours.get(node.id)?.find(other => other.elementId === nextId);
      if (!next || next.node.z >= node.z) return false;
      edge = next;
    }
  };
  const rafter = (edge: Edge) => {
    const members: number[] = [];
    for (;;) {
      const { elementId, node } = edge;
      const el = model.elements.get(elementId)!;
      if (!frameMember(el)) return undefined;
      members.push(elementId);
      const nextId = continuations.get(node.id)?.get(elementId);
      if (nextId === undefined) {
        const adjacent = neighbours.get(node.id)!;
        if (adjacent.length !== 2) return undefined;
        const post = adjacent.find(other => other.elementId !== elementId)!;
        return post.node.z < node.z && verticalSupport(node, post) ? { eave: node, members } : undefined;
      }
      const next = neighbours.get(node.id)!.find(other => other.elementId === nextId)!;
      if (crossings.has(node.id) || next.node.z >= node.z) return undefined;
      edge = next;
    }
  };

  const gableMembers = new Set<number>();
  const planPoint = (node: MassNode) => ({ ...node, z: 0 });
  for (const id of ridgeCandidates) {
    const ridge = nodes.get(id)!;
    if (ridge.z !== highest || surfaceNodes.has(id)) continue;
    const [first, second] = neighbours.get(id)!.map(rafter);
    if (!first || !second || first.eave.id === second.eave.id || first.eave.z !== second.eave.z) continue;
    if (lineJoint(planPoint(first.eave), planPoint(ridge), planPoint(second.eave)) !== 'straight') continue;
    ambiguous.delete(id);
    for (const { eave, members } of [first, second]) {
      ambiguous.delete(eave.id);
      evidenced.add(eave.id);
      storyNodes.add(eave.id);
      for (const member of members) gableMembers.add(member);
    }
  }
  if (ambiguous.size) return { refusal: 'seismicAmbiguousStory' as const };

  for (const id of surfaceNodes) if (component.nodes.has(id)) storyNodes.add(id);

  type Run = { atStory: Map<number, MassNode>; loading: 'story' | 'member' | 'unresolvedSlope' };
  const runs = new Map<number, Run>();
  let connectedBraceCrossing = false;
  for (const [id, line] of geometry) {
    if (line.nodeI.z === line.nodeJ.z || runs.has(id)) continue;
    const run: Run = { atStory: new Map(), loading: 'story' };
    const pending = [line];
    let low = line.nodeI, high = line.nodeI;
    let crossesBrace = false;
    while (pending.length) {
      const member = pending.pop()!;
      if (runs.has(member.elementId)) continue;
      runs.set(member.elementId, run);
      for (const node of [member.nodeI, member.nodeJ]) {
        if (node.z < low.z) low = node;
        if (node.z > high.z) high = node;
        if (storyNodes.has(node.id)) {
          run.atStory.set(node.z, node);
          continue;
        }
        const nextId = continuations.get(node.id)?.get(member.elementId);
        if (nextId === undefined) continue;
        crossesBrace ||= crossings.has(node.id);
        const adjacent = geometry.get(nextId)!;
        if (!runs.has(nextId) && adjacent.nodeI.z !== adjacent.nodeJ.z) pending.push(adjacent);
      }
    }
    if (gableMembers.has(id)) run.loading = 'member';
    else if (crossesBrace || (low.z > component.elevation && (low.x !== high.x || low.y !== high.y))) {
      run.loading = evidenced.has(low.id) && evidenced.has(high.id) ? 'member' : 'unresolvedSlope';
      connectedBraceCrossing ||= crossesBrace && run.loading === 'member';
    }
  }
  return {
    nodes, geometry, surfaces, component, storyNodes, runs,
    connectedBraceCrossing, supportedGable: gableMembers.size > 0,
  };
}

export function seismicRegenerationGeometry(model: SeismicGeometry) {
  const topology = seismicTopology(model);
  return { connectedBraceCrossing: topology.connectedBraceCrossing === true, supportedGable: topology.supportedGable === true };
}

export function buildSeismicModel(
  model: LoadModelData, layout: GravityLayout, area: AreaLoadsResult, width: number, liveFactor: number,
  snow: { distributed: PlannedDistributed[]; nodal: PlannedNodal[]; index: number; factor: number; panels: boolean } | undefined,
): SeismicModel {
  const topology = seismicTopology(model);
  if (topology.refusal) return { levels: [], datum: { refusal: topology.refusal } };
  const { nodes, geometry, surfaces, component, storyNodes, runs } = topology;
  const byElevation = new Map<number, SeismicLevel>();
  const level = (elevation: number) => {
    if (!byElevation.has(elevation)) byElevation.set(elevation, {
      elevation, nodeIds: [], mass: [], planWidth: { x: 0, y: 0 }, snowWeightKN: 0, unresolvedWeight: false, refusals: new Set(), weightKN: 0,
      planAreaM2: 0, selfWeightKN: 0, superimposedKN: 0, liveTotalKN: 0, liveParticipatingKN: 0,
    });
    return byElevation.get(elevation)!;
  };
  let levels: SeismicLevel[];
  const nearest = (z: number, offset = 0) => levels.reduce<SeismicLevel | undefined>((best, l) =>
    !best || Math.abs((l.elevation - z) - offset) < Math.abs((best.elevation - z) - offset) ? l : best, undefined);
  const deny = (l: SeismicLevel, reason: MassRefusal, unresolvedWeight = true) => {
    l.refusals.add(reason);
    if (unresolvedWeight) l.unresolvedWeight = true;
  };
  const distribute: Array<() => void> = [];
  const markMember = (id: number, reason: MassRefusal) => distribute.push(() => {
    const g = geometry.get(id), e = model.elements.get(id);
    const ends = [e && nodes.get(e.nodeI), e && nodes.get(e.nodeJ)].filter((n): n is MassNode => !!n);
    if (g) {
      const [lo, hi] = [g.nodeI.z, g.nodeJ.z].sort((a, b) => a - b);
      const first = Math.max(0, levels.findIndex(l => l.elevation >= lo!) - (byElevation.has(lo!) ? 0 : 1));
      const last = levels.findIndex(l => l.elevation >= hi!);
      for (const l of levels.slice(first, last < 0 ? levels.length : last + 1)) deny(l, reason);
    } else if (ends.length > 0) {
      for (const n of ends) {
        const l = byElevation.get(n.z) ?? nearest(n.z);
        if (l) deny(l, reason);
      }
    } else {
      for (const l of levels) deny(l, reason);
    }
  });
  const offsetMembers = new Set<number>();
  for (const g of geometry.values()) {
    if (hasMemberOffset(model.elements.get(g.elementId)!)) {
      offsetMembers.add(g.elementId);
      markMember(g.elementId, 'member');
    }
  }
  type Source = 'selfWeightKN' | 'superimposedKN' | 'liveTotalKN' | 'snow';
  const factorOf = (source: Source) => source === 'liveTotalKN' ? liveFactor : source === 'snow' ? snow!.factor : 1;
  let belowDatum = false;
  const record = (l: SeismicLevel, source: Source, m: SeismicMass | null, weight: number) => {
    if (!Number.isFinite(weight) || weight < 0) { deny(l, 'weight'); return; }
    if (source === 'snow') l.snowWeightKN += weight;
    else l[source] += weight;
    if (source === 'liveTotalKN') l.liveParticipatingKN += liveFactor * weight;
    const factor = factorOf(source);
    if (!(factor > 0) || weight === 0) return;
    if (l.elevation < component.elevation) belowDatum = true;
    l.weightKN += factor * weight;
    if (!Number.isFinite(l.weightKN)) { deny(l, 'weight'); return; }
    if (m === null) return;
    l.mass.push(m.kind === 'shell' ? { ...m, density: factor * m.density } : { ...m, wi: factor * m.wi, wj: factor * m.wj });
  };
  const line = (source: Source, g: LineGeometry, wi: number, wj: number, strip?: number) => {
    if (!Number.isFinite(wi) || !Number.isFinite(wj) || wi < 0 || wj < 0) { markMember(g.elementId, 'weight'); return; }
    if ((wi === 0 && wj === 0) || offsetMembers.has(g.elementId)) return;
    if (model.elements.get(g.elementId)!.type === 'truss') {
      markMember(g.elementId, 'member');
      return;
    }
    if (!(0 <= g.a && g.a < g.b && g.b <= g.length)) { markMember(g.elementId, 'member'); return; }
    const elevationAt = (s: number) => s === 0 ? g.nodeI.z
      : s === g.length ? g.nodeJ.z : interpolate(g.nodeI.z, g.nodeJ.z, s / g.length);
    if (factorOf(source) > 0 && Math.min(elevationAt(g.a), elevationAt(g.b)) < component.elevation) belowDatum = true;
    distribute.push(() => {
      const { nodeI, nodeJ, length } = g;
      if (nodeI.z === nodeJ.z) {
        record(level(nodeI.z), source, { ...g, kind: 'member', wi, wj, width: strip }, (g.b - g.a) * (wi + wj) / 2);
        return;
      }
      const run = runs.get(g.elementId)!;
      const add = (level: SeismicLevel, a: number, b: number, wi: number, wj: number) => {
        const weight = (b - a) * (wi + wj) / 2;
        if (run.loading === 'unresolvedSlope' && level.elevation > component.elevation && factorOf(source) > 0 && weight > 0) {
          deny(level, 'slopedMember');
          return;
        }
        if (run.loading === 'member') {
          record(level, source, { ...g, kind: 'member', a, b, wi, wj, width: strip }, weight);
          return;
        }
        const node = run.atStory.get(level.elevation);
        if (!node && level.elevation > component.elevation && factorOf(source) > 0 && weight > 0) deny(level, 'storyNode', false);
        record(level, source, node ? { ...g, kind: 'nodal', node, a, b, wi, wj, width: strip } : null, weight);
      };
      const dz = nodeJ.z - nodeI.z;
      const cuts = [g.a, g.b, ...levels.slice(1).map((l, i) =>
        ((l.elevation - nodeI.z) + (levels[i]!.elevation - nodeI.z)) / 2 * length / dz,
      ).filter(s => s > g.a && s < g.b)].sort((a, b) => a - b);
      const w = (s: number) => interpolate(wi, wj, (s - g.a) / (g.b - g.a));
      for (let k = 1; k < cuts.length; k++) {
        const a = cuts[k - 1]!, b = cuts[k]!;
        const l = nearest(nodeI.z, dz * (a + b) / (2 * length));
        if (l) add(l, a, b, w(a), w(b));
      }
    });
  };

  const selfWeight = createSectionWeight(model.materials);
  for (const e of model.elements.values()) {
    if (offsetMembers.has(e.id)) continue;
    const g = geometry.get(e.id), section = model.sections.get(e.sectionId);
    const features = e as { variableSection?: unknown };
    if (!section || !(section.a > 0)) { markMember(e.id, 'member'); continue; }
    let w: number;
    try { w = selfWeight(section, e.materialId); }
    catch { markMember(e.id, 'weight'); continue; }
    if (w === 0) continue;
    if (!g || features.variableSection || e.type === 'truss') {
      markMember(e.id, 'member');
      continue;
    }
    if (section.drawn) { markMember(e.id, 'eccentric'); continue; }
    line('selfWeightKN', g, w, w);
  }
  const deferWeight = (source: Source, l: () => SeismicLevel, m: SeismicMass | null, weight: number) =>
    distribute.push(() => record(l(), source, m, weight));

  const shellPressures = new Map(layout.shellQuads.map(s => [s.quadId, s]));
  for (const { q, corners } of surfaces) {
    if (!corners) {
      distribute.push(() => { for (const l of levels) deny(l, 'shell'); });
      continue;
    }
    const density = q.thickness! * (model.materials.get(q.materialId!)?.rho ?? NaN);
    const p = area.massOfQuad(q.id), shell = q.on ? undefined : shellPressures.get(q.id);
    if (q.curved || hasShellOffset(q) || !Number.isFinite(density) || density < 0 || !(q.thickness! > 0) ||
      !corners.every(n => n.z === corners[0]!.z)) {
      const lo = Math.min(...corners.map(n => n.z)), hi = Math.max(...corners.map(n => n.z));
      distribute.push(() => { for (const l of levels) if (l.elevation >= lo && l.elevation <= hi) deny(l, 'shell'); });
      continue;
    }
    const l = level(corners[0]!.z);
    const m: MassShell = { kind: 'shell', quadId: q.id, on: q.on, nodes: corners, density: 1 };
    const jacobianSigns = corners.map((n, i) => {
      const a = corners[(i + 1) % corners.length]!, b = corners[(i + corners.length - 1) % corners.length]!;
      return Math.sign((a.x - n.x) * (b.y - n.y) - (a.y - n.y) * (b.x - n.x));
    });
    if (!jacobianSigns[0] || jacobianSigns.some(s => s !== jacobianSigns[0])) {
      distribute.push(() => deny(l, 'shell'));
      continue;
    }
    let size = 0;
    massSamples(m, w => { size += w; });
    deferWeight('selfWeightKN', () => l, { ...m, density }, size * density);
    if (shell) {
      l.planAreaM2 += size;
      deferWeight('superimposedKN', () => l, { ...m, density: p.dead }, size * p.dead);
      deferWeight('liveTotalKN', () => l, { ...m, density: p.live }, size * p.live);
    }
  }
  for (const m of layout.widthMembers) {
    const g = geometry.get(m.elementId);
    if (!g) continue;
    const p = layout.roof.has(m.elementId) ? area.roofMass : area.floorMass;
    for (const span of widthSpans(m, width)) {
      if (span.width === 0) continue;
      const a = span.t0 * m.length, b = span.t1 * m.length;
      const dead = p.dead * span.width, live = p.live * span.width * m.horizontalLength / m.length;
      const l = () => nearest((g.nodeI.z + g.nodeJ.z) / 2)!;
      distribute.push(() => { l().planAreaM2 += span.width * (b - a) * m.horizontalLength / m.length; });
      if (m.spans && (dead || live * liveFactor)) {
        if (g.nodeI.z !== g.nodeJ.z) { markMember(m.elementId, 'eccentric'); continue; }
        deferWeight('superimposedKN', l, null, dead * (b - a));
        deferWeight('liveTotalKN', l, null, live * (b - a));
        distribute.push(() => deny(l(), 'eccentric', false));
        continue;
      }
      line('superimposedKN', { ...g, a, b }, dead, dead, span.width);
      line('liveTotalKN', { ...g, a, b }, live, live, span.width);
    }
  }
  for (const piece of [...layout.pieces, ...layout.points]) {
    const p = piece.roof ? area.roofMass : area.floorMass;
    if (!p.dead && !(p.live * liveFactor)) continue;
    const g = geometry.get(piece.elementId);
    if (!g || g.nodeI.z !== g.nodeJ.z) { markMember(piece.elementId, 'panel'); continue; }
    const l = level(g.nodeI.z);
    const tributaryArea = 'w' in piece ? piece.w : ((piece.b ?? g.length) - (piece.a ?? 0)) * (piece.wI + piece.wJ) / 2;
    l.planAreaM2 += tributaryArea;
    deferWeight('superimposedKN', () => l, null, p.dead * tributaryArea);
    deferWeight('liveTotalKN', () => l, null, p.live * tributaryArea);
    distribute.push(() => deny(l, 'panel', false));
  }
  if (snow && snow.factor !== 0) {
    for (const d of snow.distributed) {
      if (d.caseType !== 'S' || d.caseIndex !== snow.index) continue;
      const g = geometry.get(d.elementId);
      if (!g || snow.panels || d.frame !== 'projected') { markMember(d.elementId, 'snow'); continue; }
      const projection = Math.hypot(g.nodeJ.x - g.nodeI.x, g.nodeJ.y - g.nodeI.y) / g.length;
      line('snow', { ...g, a: d.a ?? 0, b: d.b ?? g.length }, -d.q * projection, -(d.qJ ?? d.q) * projection, width);
    }
    for (const n of snow.nodal) {
      if (n.caseType !== 'S' || n.caseIndex !== snow.index) continue;
      const node = nodes.get(n.nodeId);
      distribute.push(() => {
        const l = node && nearest(node.z);
        if (l) deny(l, 'snow');
      });
    }
  }
  for (const id of storyNodes) level(nodes.get(id)!.z);
  for (const g of geometry.values()) if (g.nodeI.z === g.nodeJ.z) level(g.nodeI.z);
  levels = [...byElevation.values()].sort((a, b) => a.elevation - b.elevation);
  for (const n of nodes.values()) if (component.nodes.has(n.id)) byElevation.get(n.z)?.nodeIds.push(n.id);
  setStructuralPlanWidths(levels, component.segments);
  for (const allocate of distribute) allocate();
  if (belowDatum) return { levels: [], datum: { refusal: 'seismicBelowDatum' } };
  return { levels, datum: { elevation: component.elevation } };
}
