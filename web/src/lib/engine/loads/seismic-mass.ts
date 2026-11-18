import type { LoadModelData, LevelMass, PlannedDistributed, PlannedNodal } from './load-plan';
import { widthSpans, type GravityLayout } from './plan-gravity';
import type { AreaLoadsResult } from './plan-area-loads';
import { hasShellOffset } from '../shell-offsets';
import { hasMemberOffset } from '../member-offsets';
import { pressureQuadrature } from './wind-pressure-field';
import { createSectionWeight } from '../../section/weight';

export type MassNode = { id: number; x: number; y: number; z: number };
export type MassLine = {
  kind: 'line'; elementId: number; memberName?: string; hasBendingRelease: boolean; nodeI: MassNode; nodeJ: MassNode;
  length: number; a: number; b: number; wi: number; wj: number; width?: number; added?: boolean;
};
export type MassShell = { kind: 'shell'; quadId: number; on?: 'plate'; nodes: MassNode[]; density: number; added?: boolean };
export type SeismicMass = MassLine | MassShell;
export type SeismicLevel = LevelMass & { mass: SeismicMass[]; planWidth: { x: number; y: number }; snowWeightKN: number; unresolvedWeight: boolean; refusals: Set<MassRefusal> };
export type MassRefusal = 'member' | 'shell' | 'panel' | 'eccentric' | 'snow' | 'torsion' | 'mode' | 'weight';

const interpolate = (a: number, b: number, t: number) => a + (b - a) * t;
export function atLine(line: MassLine, s: number) {
  const t = s / line.length;
  return {
    x: interpolate(line.nodeI.x, line.nodeJ.x, t),
    y: interpolate(line.nodeI.y, line.nodeJ.y, t),
    z: interpolate(line.nodeI.z, line.nodeJ.z, t),
    weight: interpolate(line.wi, line.wj, (s - line.a) / (line.b - line.a)),
  };
}

export function massSamples(mass: SeismicMass, sample: (weight: number, x: number, y: number, shape: number[]) => void) {
  if (mass.kind === 'line') {
    for (const [u, w] of pressureQuadrature) {
      const s = interpolate(mass.a, mass.b, (1 + u) / 2);
      const p = atLine(mass, s);
      sample(w * (mass.b - mass.a) * p.weight / 2, p.x, p.y, [s / mass.length]);
    }
    return;
  }
  const [a, b, c, d] = mass.nodes;
  if (mass.on === 'plate') {
    const size = Math.abs((b!.x - a!.x) * (c!.y - a!.y) - (b!.y - a!.y) * (c!.x - a!.x)) / 2;
    for (const i of [0, 1, 2]) {
      const shape = [0, 1, 2].map(j => i === j ? 2 / 3 : 1 / 6);
      const point = (key: 'x' | 'y') => a![key] + mass.nodes.reduce((v, n, j) => v + shape[j]! * (n[key] - a![key]), 0);
      sample(size * mass.density / 3, point('x'), point('y'), shape);
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
    sample(wr * ws * Math.abs(xr! * ys! - xs! * yr!) * mass.density, point('x'), point('y'), shape);
  }
}

function setStructuralPlanWidths(levels: SeismicLevel[], segments: Array<[MassNode, MassNode]>) {
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

export function buildSeismicLevels(
  model: LoadModelData, layout: GravityLayout, area: AreaLoadsResult, width: number, liveFactor: number,
  snow: { distributed: PlannedDistributed[]; nodal: PlannedNodal[]; index: number; factor: number; panels: boolean } | undefined,
): SeismicLevel[] {
  const nodes = new Map([...model.nodes].map(([id, n]) => [id, { ...n, z: n.z ?? 0 }]));
  const geometry = new Map<number, Omit<MassLine, 'wi' | 'wj'>>();
  const neighbours = new Map<number, MassNode[]>();
  const next = (id: number, node: MassNode) => neighbours.set(id, [...(neighbours.get(id) ?? []), node]);
  for (const e of model.elements.values()) {
    const nodeI = nodes.get(e.nodeI), nodeJ = nodes.get(e.nodeJ);
    if (!nodeI || !nodeJ) continue;
    const length = Math.hypot(nodeJ.x - nodeI.x, nodeJ.y - nodeI.y, nodeJ.z - nodeI.z);
    if (!(Number.isFinite(length) && length > 0)) continue;
    const hasBendingRelease = [e.releaseI, e.releaseJ].some(end => end?.my === true || end?.mz === true);
    geometry.set(e.id, { kind: 'line', elementId: e.id, memberName: e.name, hasBendingRelease, a: 0, b: length, length, nodeI, nodeJ });
    next(e.nodeI, nodeJ);
    next(e.nodeJ, nodeI);
  }
  const shells = [...model.quads?.values() ?? []].map(q => ({ ...q, on: undefined }));
  const plates = [...model.plates?.values() ?? []].map(q => ({ ...q, on: 'plate' as const }));
  const shellNodes = new Set([...shells, ...plates].flatMap(q => q.nodes));
  const supportedNodes = new Set([...model.supports?.values() ?? []].map(s => s.nodeId));
  const subdivision = (p: MassNode) => {
    const adjacent = neighbours.get(p.id);
    if (adjacent?.length !== 2 || shellNodes.has(p.id)) return false;
    const [a, b] = adjacent;
    const u = [a!.x - p.x, a!.y - p.y, a!.z - p.z], v = [b!.x - p.x, b!.y - p.y, b!.z - p.z];
    const scale = Math.hypot(...u) * Math.hypot(...v);
    return u.reduce((s, x, i) => s + x * v[i]!, 0) < 0 &&
      Math.hypot(u[1]! * v[2]! - u[2]! * v[1]!, u[2]! * v[0]! - u[0]! * v[2]!, u[0]! * v[1]! - u[1]! * v[0]!) <= 64 * Number.EPSILON * scale;
  };
  const byElevation = new Map<number, SeismicLevel>();
  const level = (elevation: number) => {
    if (!byElevation.has(elevation)) byElevation.set(elevation, {
      elevation, nodeIds: [], mass: [], planWidth: { x: 0, y: 0 }, snowWeightKN: 0, unresolvedWeight: false, refusals: new Set(), weightKN: 0,
      planAreaM2: 0, selfWeightKN: 0, superimposedKN: 0, liveTotalKN: 0, liveParticipatingKN: 0,
    });
    return byElevation.get(elevation)!;
  };
  for (const n of nodes.values()) {
    if (Number.isFinite(n.z) && (shellNodes.has(n.id) || supportedNodes.has(n.id) || (neighbours.has(n.id) && !subdivision(n)))) level(n.z);
  }
  for (const g of geometry.values()) if (g.nodeI.z === g.nodeJ.z) level(g.nodeI.z);
  const levels = [...byElevation.values()].sort((a, b) => a.elevation - b.elevation);
  for (const n of nodes.values()) byElevation.get(n.z)?.nodeIds.push(n.id);
  const segments: Array<[MassNode, MassNode]> = [...geometry.values()].map(g => [g.nodeI, g.nodeJ]);
  for (const shell of [...shells, ...plates]) for (const [k, id] of shell.nodes.entries()) {
    const i = nodes.get(id), j = nodes.get(shell.nodes[(k + 1) % shell.nodes.length]!);
    if (i && j) segments.push([i, j]);
  }
  setStructuralPlanWidths(levels, segments);
  const nearest = (z: number) => levels.reduce<SeismicLevel | undefined>((best, l) =>
    !best || Math.abs(l.elevation - z) < Math.abs(best.elevation - z) ? l : best, undefined);
  const deny = (l: SeismicLevel, reason: MassRefusal, unresolvedWeight = true) => {
    l.refusals.add(reason);
    if (unresolvedWeight) l.unresolvedWeight = true;
  };
  const markMember = (id: number, reason: MassRefusal) => {
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
  };
  type Source = 'selfWeightKN' | 'superimposedKN' | 'liveTotalKN' | 'snow';
  const record = (l: SeismicLevel, source: Source, m: SeismicMass | null, weight: number) => {
    if (!Number.isFinite(weight) || weight < 0) { deny(l, 'weight'); return; }
    if (source === 'snow') l.snowWeightKN += weight;
    else l[source] += weight;
    if (source === 'liveTotalKN') l.liveParticipatingKN += liveFactor * weight;
    const factor = source === 'liveTotalKN' ? liveFactor : source === 'snow' ? snow!.factor : 1;
    if (!(factor > 0) || weight === 0) return;
    l.weightKN += factor * weight;
    if (!Number.isFinite(l.weightKN)) { deny(l, 'weight'); return; }
    if (m === null) return;
    const added = source !== 'selfWeightKN';
    l.mass.push(m.kind === 'line' ? { ...m, added, wi: factor * m.wi, wj: factor * m.wj } : { ...m, added, density: factor * m.density });
  };
  const line = (source: Source, g: Omit<MassLine, 'wi' | 'wj'>, wi: number, wj: number, strip?: number) => {
    if (!Number.isFinite(wi) || !Number.isFinite(wj) || wi < 0 || wj < 0) { markMember(g.elementId, 'weight'); return; }
    if (wi === 0 && wj === 0) return;
    const element = model.elements.get(g.elementId)!;
    if (element.type === 'truss' || hasMemberOffset(element as Parameters<typeof hasMemberOffset>[0])) {
      markMember(g.elementId, 'member');
      return;
    }
    if (!(0 <= g.a && g.a < g.b && g.b <= g.length)) { markMember(g.elementId, 'member'); return; }
    const add = (level: SeismicLevel, a: number, b: number, wi: number, wj: number) => {
      record(level, source, { ...g, a, b, wi, wj, width: strip }, (b - a) * (wi + wj) / 2);
    };
    const { nodeI, nodeJ, length } = g;
    if (nodeI.z === nodeJ.z) { add(level(nodeI.z), g.a, g.b, wi, wj); return; }
    const dz = nodeJ.z - nodeI.z;
    const cuts = [g.a, g.b, ...levels.slice(1).map((l, i) =>
      ((l.elevation + levels[i]!.elevation) / 2 - nodeI.z) * length / dz,
    ).filter(s => s > g.a && s < g.b)].sort((a, b) => a - b);
    const w = (s: number) => interpolate(wi, wj, (s - g.a) / (g.b - g.a));
    for (let k = 1; k < cuts.length; k++) {
      const a = cuts[k - 1]!, b = cuts[k]!;
      const l = nearest(nodeI.z + dz * (a + b) / (2 * length));
      if (l) add(l, a, b, w(a), w(b));
    }
  };

  const selfWeight = createSectionWeight(model.materials);
  for (const e of model.elements.values()) {
    const g = geometry.get(e.id), section = model.sections.get(e.sectionId);
    const features = e as { variableSection?: unknown; offset?: Parameters<typeof hasMemberOffset>[0]['offset'] };
    if (!section || !(section.a > 0)) { markMember(e.id, 'member'); continue; }
    let w: number;
    try { w = selfWeight(section, e.materialId); }
    catch { markMember(e.id, 'weight'); continue; }
    if (w === 0) continue;
    if (!g || features.variableSection || hasMemberOffset(features) || e.type === 'truss') {
      markMember(e.id, 'member');
      continue;
    }
    if (section.drawn) { markMember(e.id, 'eccentric'); continue; }
    line('selfWeightKN', g, w, w);
  }
  const shellPressures = new Map(layout.shellQuads.map(s => [s.quadId, s]));
  for (const q of [...shells, ...plates]) {
    const corners = q.nodes.map(id => nodes.get(id)).filter((n): n is MassNode => !!n);
    const density = q.thickness! * (model.materials.get(q.materialId!)?.rho ?? NaN);
    const p = area.massOfQuad(q.id), shell = q.on ? undefined : shellPressures.get(q.id);
    if (corners.length !== (q.on ? 3 : 4) || q.curved || hasShellOffset(q) || !Number.isFinite(density) || density < 0 || !(q.thickness! > 0) ||
      !corners.every(n => Number.isFinite(n.x) && Number.isFinite(n.y) && n.z === corners[0]!.z)) {
      const lo = Math.min(...corners.map(n => n.z)), hi = Math.max(...corners.map(n => n.z));
      for (const l of levels) if (!corners.length || (l.elevation >= lo && l.elevation <= hi)) deny(l, 'shell');
      continue;
    }
    const l = level(corners[0]!.z);
    const m: MassShell = { kind: 'shell', quadId: q.id, on: q.on, nodes: corners, density: 1 };
    const jacobianSigns = corners.map((n, i) => {
      const a = corners[(i + 1) % corners.length]!, b = corners[(i + corners.length - 1) % corners.length]!;
      return Math.sign((a.x - n.x) * (b.y - n.y) - (a.y - n.y) * (b.x - n.x));
    });
    if (!jacobianSigns[0] || jacobianSigns.some(s => s !== jacobianSigns[0])) { deny(l, 'shell'); continue; }
    let size = 0;
    massSamples(m, w => { size += w; });
    record(l, 'selfWeightKN', { ...m, density }, size * density);
    if (shell) {
      l.planAreaM2 += size;
      record(l, 'superimposedKN', { ...m, density: p.dead }, size * p.dead);
      record(l, 'liveTotalKN', { ...m, density: p.live }, size * p.live);
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
      const l = nearest((g.nodeI.z + g.nodeJ.z) / 2)!;
      l.planAreaM2 += span.width * (b - a) * m.horizontalLength / m.length;
      if (m.spans && (dead || live * liveFactor)) {
        if (g.nodeI.z !== g.nodeJ.z) { markMember(m.elementId, 'eccentric'); continue; }
        record(l, 'superimposedKN', null, dead * (b - a));
        record(l, 'liveTotalKN', null, live * (b - a));
        deny(l, 'eccentric', false);
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
    record(l, 'superimposedKN', null, p.dead * tributaryArea);
    record(l, 'liveTotalKN', null, p.live * tributaryArea);
    deny(l, 'panel', false);
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
      const l = node && nearest(node.z);
      if (l) deny(l, 'snow');
    }
  }
  return levels;
}
