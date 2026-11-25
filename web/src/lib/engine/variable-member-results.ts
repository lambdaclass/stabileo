import { rebaseDiagramDistance, unavailableDiagramExtrema } from './member-diagram';
import type { AnalysisResults3D, Displacement3D, ElementForces3D, ElementEnvelopeDiagram3D, EnvelopeDiagramData3D, FullEnvelope3D } from './types-3d';
import type { ResultPiece, VariableExpansion, VariableMember, VariablePiece } from './variable-members';

function parentForces(m: VariableMember, byId: Map<number, ElementForces3D>, disp: Map<number, Displacement3D>): ElementForces3D | null {
  const fs = m.pieces.map((p) => byId.get(p.id));
  if (fs.some((f) => !f)) return null;
  const first = fs[0]!, last = fs[fs.length - 1]!;
  const shift = <T extends { a: number }>(list: T[] | undefined, x0: number): T[] => (list ?? []).map((l) => ({ ...l, a: l.a + x0 }));
  const shiftD = (list: Array<{ qI: number; qJ: number; a: number; b: number }> | undefined, x0: number) =>
    (list ?? []).map((l) => ({ ...l, a: l.a + x0, b: l.b + x0 }));
  const pieces: ResultPiece[] = m.pieces.map((p, k) => ({
    x0: p.x0, x1: p.x1, sectionId: p.sectionId, forces: fs[k]!, ...(p.ei ? { ei: p.ei } : {}),
    ...(disp.get(p.nodeI) ? { dI: disp.get(p.nodeI) } : {}), ...(disp.get(p.nodeJ) ? { dJ: disp.get(p.nodeJ) } : {}),
  }));
  const along = (pick: (f: ElementForces3D) => Array<{ qI: number; qJ: number; a: number; b: number }> | undefined) =>
    m.pieces.flatMap((p, k) => shiftD(pick(fs[k]!), p.x0));
  const xLoads = m.pieces.some((_, k) => fs[k]!.distributedLoadsX) ? { distributedLoadsX: along((f) => f.distributedLoadsX) } : {};
  return {
    ...first,
    elementId: m.parentId, length: m.length,
    nStart: first.nStart, vyStart: first.vyStart, vzStart: first.vzStart, mxStart: first.mxStart, myStart: first.myStart, mzStart: first.mzStart,
    nEnd: last.nEnd, vyEnd: last.vyEnd, vzEnd: last.vzEnd, mxEnd: last.mxEnd, myEnd: last.myEnd, mzEnd: last.mzEnd,
    releaseMyEnd: last.releaseMyEnd, releaseMzEnd: last.releaseMzEnd, releaseTEnd: last.releaseTEnd,
    qYI: 0, qYJ: 0, qZI: 0, qZJ: 0,
    distributedLoadsY: along((f) => f.distributedLoadsY),
    distributedLoadsZ: along((f) => f.distributedLoadsZ),
    ...xLoads,
    pointLoadsX: m.pieces.flatMap((p, k) => shift(fs[k]!.pointLoadsX, p.x0)),
    pointLoadsY: m.pieces.flatMap((p, k) => shift(fs[k]!.pointLoadsY, p.x0)),
    pointLoadsZ: m.pieces.flatMap((p, k) => shift(fs[k]!.pointLoadsZ, p.x0)),
    pieces,
  } as ElementForces3D;
}

export function collapseVariableResults(r: AnalysisResults3D, exp: VariableExpansion | undefined): AnalysisResults3D {
  if (!exp || exp.members.size === 0) return r;
  const pieceIds = new Set<number>();
  for (const m of exp.members.values()) for (const p of m.pieces) pieceIds.add(p.id);
  const byId = new Map(r.elementForces.map((f) => [f.elementId, f]));
  const disp = new Map(r.displacements.map((d) => [d.nodeId, d]));
  const parents: ElementForces3D[] = [];
  for (const m of exp.members.values()) { const f = parentForces(m, byId, disp); if (f) parents.push(f); }
  return {
    ...r,
    displacements: r.displacements.filter((d) => !exp.innerNodes.has(d.nodeId)),
    reactions: r.reactions.filter((x) => !exp.innerNodes.has(x.nodeId)),

    ...(r.constraintForces ? { constraintForces: r.constraintForces.filter((c) => !exp.innerNodes.has(c.nodeId)) } : {}),
    elementForces: [...r.elementForces.filter((f) => !pieceIds.has(f.elementId)), ...parents],
  };
}

export function reexpandVariableResults(r: AnalysisResults3D): { results: AnalysisResults3D; exp: VariableExpansion | undefined } {
  const exp: VariableExpansion = { members: new Map(), innerNodes: new Set() };
  const forces: ElementForces3D[] = [];
  const extra = new Map<number, Displacement3D>();
  const known = new Set(r.displacements.map((d) => d.nodeId));
  for (const f of r.elementForces) {
    const ps = f.pieces;
    if (!ps?.length || ps.some((p) => !p.dI || !p.dJ)) { forces.push(f); continue; }
    const pieces: VariablePiece[] = ps.map((p) => ({
      id: p.forces.elementId, sectionId: p.sectionId, x0: p.x0, x1: p.x1, nodeI: p.dI!.nodeId, nodeJ: p.dJ!.nodeId, ...(p.ei ? { ei: p.ei } : {}),
    }));
    const innerNodes = pieces.slice(1).map((p) => p.nodeI);
    exp.members.set(f.elementId, { parentId: f.elementId, length: f.length, pieces, innerNodes });
    for (const n of innerNodes) exp.innerNodes.add(n);
    for (const p of ps) { forces.push(p.forces); extra.set(p.dJ!.nodeId, p.dJ!); }

    const first = ps[0]!.dI!, last = ps[ps.length - 1]!.dJ!;
    for (const d of [first, last]) if (!known.has(d.nodeId)) { exp.innerNodes.add(d.nodeId); extra.set(d.nodeId, d); }
  }
  if (exp.members.size === 0) return { results: r, exp: undefined };
  const displacements = [...r.displacements, ...[...exp.innerNodes].map((n) => extra.get(n)!)];
  return { results: { ...r, elementForces: forces, displacements }, exp };
}

export function sameVariableLayout(reference: VariableExpansion, other: VariableExpansion | undefined): boolean {
  if (!other || reference.members.size !== other.members.size) return false;
  for (const [id, member] of reference.members) {
    const candidate = other.members.get(id);
    if (!candidate || member.length !== candidate.length || member.pieces.length !== candidate.pieces.length) return false;
    if (member.pieces.some((piece, i) => {
      const next = candidate.pieces[i]!;
      return piece.id !== next.id || piece.x0 !== next.x0 || piece.x1 !== next.x1 ||
        piece.nodeI !== next.nodeI || piece.nodeJ !== next.nodeJ;
    })) return false;
  }
  return true;
}

function rebaseEnvelopeMember(m: VariableMember, elements: ReadonlyMap<number, ElementEnvelopeDiagram3D>): ElementEnvelopeDiagram3D | null {
  const pieces = m.pieces.map(p => ({ p, element: elements.get(p.id) }));
  if (pieces.every(({ element }) => !element)) return null;
  const candidates = [];
  for (const { p, element } of pieces) {
    if (!element) throw unavailableDiagramExtrema();
    const { tPositions, criticalStations } = element;
    if (!criticalStations?.length) throw unavailableDiagramExtrema();
    const stations = new Map(criticalStations.map(station => [station.index, station]));
    const start = p.x0 / m.length, end = p.x1 / m.length;
    const internalStart = p.x0 > 0;
    const hasStartJump = criticalStations.some(station => station.right && tPositions[station.index] === 0);
    if (!(start < end)) throw unavailableDiagramExtrema();
    let previousCritical: { local: number; t: number } | undefined;
    for (let i = 0; i < tPositions.length; i++) {
      const local = tPositions[i]!;
      const station = stations.get(i);
      if (internalStart && local === 0 && hasStartJump && !station?.right) continue;
      const x = local === 0 ? p.x0 : local === 1 ? p.x1
        : rebaseDiagramDistance(p.x0, station?.x ?? local * (p.x1 - p.x0)).x;
      const t = x / m.length;
      if (station) {
        if ((local > 0 && local < 1 && !(start < t && t < end))
          || (previousCritical && previousCritical.local !== local && previousCritical.t >= t)) throw unavailableDiagramExtrema();
        previousCritical = { local, t };
      }
      candidates.push({
        t, x, critical: !!station, right: (internalStart && local === 0) || !!station?.right,
        pos: element.posValues[i]!, neg: element.negValues[i]!,
      });
    }
  }
  candidates.sort((a, b) => a.t - b.t || Number(a.right) - Number(b.right));
  const parent: ElementEnvelopeDiagram3D & { criticalStations: NonNullable<ElementEnvelopeDiagram3D['criticalStations']> } = {
    elementId: m.parentId, tPositions: [], posValues: [], negValues: [], criticalStations: [],
  };
  for (let i = 0; i < candidates.length;) {
    const first = candidates[i]!;
    let j = i + 1;
    while (candidates[j]?.t === first.t) j++;
    const cuts = candidates.slice(i, j).filter(candidate => candidate.critical);
    if (cuts.length > 2 || (cuts.length === 2 && (cuts[0]!.x !== cuts[1]!.x || cuts[0]!.right || !cuts[1]!.right))) {
      throw unavailableDiagramExtrema();
    }
    for (const cut of cuts.length ? cuts : [first]) {
      if (cut.critical) parent.criticalStations.push({ index: parent.tPositions.length, x: cut.x, right: cut.right });
      parent.tPositions.push(cut.t);
      parent.posValues.push(cut.pos);
      parent.negValues.push(cut.neg);
    }
    i = j;
  }
  return parent;
}

function collapseDiagram(d: EnvelopeDiagramData3D, exp: VariableExpansion): EnvelopeDiagramData3D {
  const byId = new Map(d.elements.map(e => [e.elementId, e]));
  const pieceIds = new Set<number>();
  const parents: ElementEnvelopeDiagram3D[] = [];
  for (const member of exp.members.values()) {
    for (const piece of member.pieces) pieceIds.add(piece.id);
    const diagram = rebaseEnvelopeMember(member, byId);
    if (diagram) parents.push(diagram);
  }
  const elements = [...d.elements.filter(e => !pieceIds.has(e.elementId)), ...parents];
  let globalMax = 0;
  for (const { posValues, negValues } of elements) {
    for (let i = 0; i < posValues.length; i++) globalMax = Math.max(globalMax, posValues[i]!, -negValues[i]!);
  }
  return { ...d, elements, globalMax };
}

export function collapseVariableEnvelope(env: FullEnvelope3D, exp: VariableExpansion | undefined): FullEnvelope3D {
  if (!exp || exp.members.size === 0) return env;
  return {
    momentY: collapseDiagram(env.momentY, exp), momentZ: collapseDiagram(env.momentZ, exp),
    shearY: collapseDiagram(env.shearY, exp), shearZ: collapseDiagram(env.shearZ, exp),
    axial: collapseDiagram(env.axial, exp), torsion: collapseDiagram(env.torsion, exp),
    maxAbsResults3D: collapseVariableResults(env.maxAbsResults3D, exp),
  };
}
