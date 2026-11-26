import { unavailableDiagramExtrema } from './member-diagram';
import { bindSpatialEnvelope, envelopeQuerySources } from './result-query';
import { envelopeJumpCuts, sameCutLocation, type DiagramCutLocation } from './diagram-cut';
import type { AnalysisResults3D, Displacement3D, ElementForces3D, EnvelopeDiagramData3D, FullEnvelope3D } from './types-3d';
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

function collapseDiagram(d: EnvelopeDiagramData3D, exp: VariableExpansion): EnvelopeDiagramData3D {
  const byId = new Map(d.elements.map((e) => [e.elementId, e]));
  const pieceIds = new Set<number>();
  const parents = [];
  for (const m of exp.members.values()) {
    const tPositions: number[] = [], posValues: number[] = [], negValues: number[] = [];
    const jumpCuts: NonNullable<EnvelopeDiagramData3D['elements'][number]['jumpCuts']> = [];
    const publishedJumps = new Map<number, { index: number; location: DiagramCutLocation }>();
    let previousStation: { piece: VariablePiece; local: number; parent: number; jump: boolean } | undefined;
    const addJump = (index: number, location: DiagramCutLocation) => {
      const t = location.x / m.length;
      const previous = publishedJumps.get(t);
      if (previous && (previous.index !== index || !sameCutLocation(previous.location, location))) throw unavailableDiagramExtrema();
      publishedJumps.set(t, { index, location });
      jumpCuts.push({ index, distance: location.x });
    };
    let complete = true;
    for (const p of m.pieces) {
      pieceIds.add(p.id);
      const e = byId.get(p.id);
      if (!e) { complete = false; continue; }
      const start = tPositions.length;
      if (start > 0 && tPositions[start - 1] === p.x0 / m.length && e.tPositions[0] === 0
        && (posValues[start - 1] !== e.posValues[0] || negValues[start - 1] !== e.negValues[0])) {
        addJump(start - 1, { x: p.x0 });
      }
      const distances = new Map<number, number>();
      for (const cut of envelopeJumpCuts(e, p.x1 - p.x0)) {
        const x = p.x0 + cut.distance;
        addJump(start + cut.index, { x, rebased: { offset: p.x0, local: { x: cut.distance } } });
        distances.set(cut.index, x);
        distances.set(cut.index + 1, x);
      }
      e.tPositions.forEach((t, i) => {
        const x = distances.get(i) ?? (t === 0 ? p.x0 : t === 1 ? p.x1 : p.x0 + t * (p.x1 - p.x0));
        const parent = x / m.length;
        const jump = distances.has(i);
        if (previousStation?.parent === parent && (jump || previousStation.jump || publishedJumps.has(parent))) {
          const samePieceCut = previousStation.piece === p && previousStation.local === t;
          const sharedBoundary = previousStation.local === 1 && t === 0 && previousStation.piece.x1 === p.x0;
          if (!samePieceCut && !sharedBoundary) throw unavailableDiagramExtrema();
        }
        previousStation = { piece: p, local: t, parent, jump };
        tPositions.push(parent);
        posValues.push(e.posValues[i]!); negValues.push(e.negValues[i]!);
      });
    }
    if (complete) parents.push({ elementId: m.parentId, tPositions, posValues, negValues, ...(jumpCuts.length && { jumpCuts }) });
  }
  return { ...d, elements: [...d.elements.filter((e) => !pieceIds.has(e.elementId)), ...parents] };
}

export function collapseVariableEnvelopeGeometry(env: FullEnvelope3D, exp: VariableExpansion): FullEnvelope3D {
  return {
    momentY: collapseDiagram(env.momentY, exp), momentZ: collapseDiagram(env.momentZ, exp),
    shearY: collapseDiagram(env.shearY, exp), shearZ: collapseDiagram(env.shearZ, exp),
    axial: collapseDiagram(env.axial, exp), torsion: collapseDiagram(env.torsion, exp),
    maxAbsResults3D: collapseVariableResults(env.maxAbsResults3D, exp),
  };
}

export function collapseVariableEnvelope(env: FullEnvelope3D, exp: VariableExpansion | undefined): FullEnvelope3D {
  if (!exp?.members.size) return bindSpatialEnvelope(env, []);
  const sources = envelopeQuerySources(env)?.map(result => collapseVariableResults(result, exp)) ?? [];
  return bindSpatialEnvelope(collapseVariableEnvelopeGeometry(env, exp), sources);
}
