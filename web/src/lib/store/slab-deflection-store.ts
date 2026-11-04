/**
 * Slab deflections in the store: the service field (the service combination that moves the
 * structure most, or, with none, every case added unfactored), a panel's deflection with its
 * cracking and long term, and the deflection between two points (`slab-deflection.ts`).
 */
import { modelStore } from './model.svelte';
import { resultsStore } from './results.svelte';
import { activeCombinations, activePerCombo3D } from './active-results';
import { designData } from './design-data';
import { concreteFc } from '../model/design-data';
import { woodArmer } from '../engine/wood-armer';
import { providedAt } from '../engine/detailing/slab-panel';
import { deflectionBetween, panelDeflection, type DeflectionModel, type PanelDeflection } from '../engine/detailing/slab-deflection';
import type { SlabDesignResult } from '../engine/detailing/slab-design';
import type { AnalysisResults3D } from '../engine/types-3d';

/** The service result the deflections read, and where it came from. */
export function serviceResult(): { result: AnalysisResults3D; source: 'service' | 'cases' } | null {
  const service = activeCombinations().filter((c) => c.origin?.purpose === 'service');
  const per = activePerCombo3D();
  let best: AnalysisResults3D | null = null, worst = -1;
  for (const c of service) {
    const r = per.get(c.id);
    const m = r ? Math.max(0, ...r.displacements.map((d) => -d.uz)) : -1;
    if (r && m > worst) { worst = m; best = r; }
  }
  if (best) return { result: best, source: 'service' };
  const cases = [...resultsStore.perCase3D.values()];
  if (!cases.length) return null;
  const uz = new Map<number, number>();
  const quads = new Map<number, { elementId: number; mx: number; my: number; mxy: number }>();
  for (const r of cases) {
    for (const d of r.displacements) uz.set(d.nodeId, (uz.get(d.nodeId) ?? 0) + d.uz);
    for (const q of r.quadStresses ?? []) { const p = quads.get(q.elementId); quads.set(q.elementId, { elementId: q.elementId, mx: (p?.mx ?? 0) + q.mx, my: (p?.my ?? 0) + q.my, mxy: (p?.mxy ?? 0) + q.mxy }); }
  }
  return {
    result: { displacements: [...uz].map(([nodeId, z]) => ({ nodeId, ux: 0, uy: 0, uz: z, rx: 0, ry: 0, rz: 0 })), quadStresses: [...quads.values()] as never, reactions: [], elementForces: [] } as AnalysisResults3D,
    source: 'cases',
  };
}

function modelOf(r: AnalysisResults3D): DeflectionModel {
  return {
    nodes: modelStore.nodes,
    shells: [...modelStore.quads.values(), ...modelStore.plates.values()].map((s) => ({ nodes: s.nodes })),
    uz: new Map(r.displacements.map((d) => [d.nodeId, d.uz])),
  };
}

export function slabPanelDeflection(s: SlabDesignResult): (PanelDeflection & { source: 'service' | 'cases' }) | null {
  const sr = serviceResult();
  if (!sr || !s.panel) return null;
  const inp = s.panel.input;
  const ids = inp.elements.map((e) => e.id);
  const nodeIds = [...new Set(ids.flatMap((id) => modelStore.quads.get(id)?.nodes ?? modelStore.plates.get(id)?.nodes ?? []))];
  // The strip that bends most in service, and the bottom bars it has there.
  const stress = new Map((sr.result.quadStresses ?? []).map((q) => [q.elementId, q]));
  let moment = 0, steel = 0;
  for (const e of inp.elements) {
    const q = stress.get(e.id);
    if (!q) continue;
    const w = woodArmer(q.mx, q.my, q.mxy);
    for (const [m, k] of [[w.bottomX, 'bottomX'], [w.bottomY, 'bottomY']] as const) {
      if (m > moment) { moment = m; steel = providedAt(s.panel.reinforcement, k, e.cx, e.cy); }
    }
  }
  const q0 = modelStore.quads.get(ids[0]!) ?? modelStore.plates.get(ids[0]!);
  const mat = q0 ? modelStore.materials.get(q0.materialId) : undefined;
  const r = panelDeflection({
    m: modelOf(sr.result), nodeIds, box: { x0: inp.x0, x1: inp.x1, y0: inp.y0, y1: inp.y1 },
    thickness: inp.thickness, cover: designData().covers.slab, fc: (mat ? concreteFc(mat) : undefined) ?? 25, Ec: mat?.e ?? 25000,
    serviceMoment: moment, steelThere: Math.max(steel, 1e-6),
  });
  return { ...r, source: sr.source };
}

export function slabDeflectionBetween(a: { x: number; y: number }, b: { x: number; y: number }, p?: { x: number; y: number }) {
  const sr = serviceResult();
  return sr ? deflectionBetween(modelOf(sr.result), a, b, p) : null;
}
