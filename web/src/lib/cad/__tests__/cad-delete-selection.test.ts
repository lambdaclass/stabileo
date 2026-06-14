// Regression for the REAL UI delete bug: in shell select mode, box-select put
// floor-3+ FRAME ids into `selectedElements` while `selectedShells` stayed
// empty; the old handler reinterpreted those frame ids as quads (numeric id
// collision) and deleted unselected lower-floor shells. The resolver must map
// selection channels straight through — shells deleted ONLY from selectedShells.
import { describe, it, expect, beforeEach } from 'vitest';
import { resolveDeleteTargets } from '../../store/delete-selection';
import { modelStore } from '../../store/model.svelte';
import { historyStore } from '../../store/history.svelte';
import { buildStabileoTemplateDxf } from '../template';
import { parseCadDxf } from '../parse';
import { suggestLayerMappings, extractArchPlan } from '../classify';
import { generateRcDraft } from '../draft';
import type { RcDraftAssumptions } from '../types';

describe('resolveDeleteTargets — channel mapping (no id inference)', () => {
  const hasElement = (id: number) => [1, 2, 3, 100, 101].includes(id);

  it('frame ids stay frames even when they collide with quad ids', () => {
    // selectedElements = frame ids (some collide with quad numeric ids), and
    // NO shells selected → zero plates/quads deleted.
    const t = resolveDeleteTargets({ nodes: [5, 6], elements: [1, 2, 100], shells: [] }, hasElement);
    expect(t.elements).toEqual([1, 2, 100]);
    expect(t.plates).toEqual([]);
    expect(t.quads).toEqual([]);
    expect(t.nodes).toEqual([5, 6]);
  });

  it('shells are deleted only from the selectedShells channel (keys)', () => {
    const t = resolveDeleteTargets({ nodes: [], elements: [], shells: ['q7', 'p3', 'q12'] }, hasElement);
    expect(t.quads.sort((a, b) => a - b)).toEqual([7, 12]);
    expect(t.plates).toEqual([3]);
    expect(t.elements).toEqual([]);
  });

  it('stale frame ids (not in the model) are dropped, never reinterpreted', () => {
    const t = resolveDeleteTargets({ nodes: [], elements: [999], shells: [] }, hasElement);
    expect(t.elements).toEqual([]);
    expect(t.quads).toEqual([]);
    expect(t.plates).toEqual([]);
  });
});

// ── End-to-end against the CAD template, mirroring the real UI selection ──

function loadTemplate() {
  const doc = parseCadDxf(buildStabileoTemplateDxf(), 'stb.dxf');
  const plan = extractArchPlan(doc, suggestLayerMappings(doc, 'm'), 'm');
  const a: RcDraftAssumptions = {
    nFloors: 10, storyHeights: plan.levelHeights ?? Array.from({ length: 10 }, () => 2.8),
    concreteGrade: 'H-30', columnSection: { b: 0.3, h: 0.3 }, beamSection: { b: 0.2, h: 0.5 },
    slabThickness: 0.2, wallThickness: 0.15, baseSupport: 'fixed3d',
    deadLoad: 7, liveLoad: 2, roofLiveLoad: 1, generateCombos: true,
    meshSlabs: true, meshMode: 'fixedDivisions', meshDivisions: 2, splitBeams: true,
    snapTolerance: 0.03, detectOffsets: false,
  };
  modelStore.restore(generateRcDraft(plan, a, { fileName: 'stb.dxf', importedAtIso: 'x' }).snapshot);
}

const Z_CUT = 11.4; // floor 4 base

beforeEach(() => { modelStore.clear(); historyStore.clear(); loadTemplate(); });

describe('CAD template: shell-mode box-select of upper floors keeps lower shells', () => {
  it('reproduces the real selection (frames+nodes above the cut, NO shells) → no lower quads deleted', () => {
    const z = new Map([...modelStore.nodes].map(([id, n]) => [id, n.z ?? 0]));
    const lowerQuads = [...modelStore.model.quads.entries()]
      .filter(([, q]) => Math.max(...q.nodes.map((n) => z.get(n) ?? 0)) <= 8.6 + 1e-6)
      .map(([id]) => id);
    expect(lowerQuads.length).toBeGreaterThan(0);
    // Prove the collision precondition is real: some upper frame id equals a lower quad id.
    const upperFrames = [...modelStore.elements.entries()]
      .filter(([, e]) => (z.get(e.nodeI) ?? 0) >= Z_CUT - 1e-6 && (z.get(e.nodeJ) ?? 0) >= Z_CUT - 1e-6)
      .map(([id]) => id);
    expect(upperFrames.some((id) => lowerQuads.includes(id))).toBe(true);

    // Exactly what the UI produces in shell mode after box-selecting floor 4↑:
    // selectedElements = upper frames, selectedNodes = upper nodes, selectedShells = ∅.
    const upperNodes = [...modelStore.nodes.values()].filter((n) => (n.z ?? 0) >= Z_CUT - 1e-6).map((n) => n.id);
    const targets = resolveDeleteTargets(
      { nodes: upperNodes, elements: upperFrames, shells: [] },
      (id) => modelStore.elements.has(id),
    );
    expect(targets.quads).toEqual([]);   // ← the fix: no shells inferred from frame ids
    expect(targets.plates).toEqual([]);
    modelStore.deleteEntities(targets);

    for (const qid of lowerQuads) expect(modelStore.model.quads.has(qid)).toBe(true);
  });

  it('selecting upper shells (selectedShells) deletes ONLY those, lower shells remain', () => {
    const z = new Map([...modelStore.nodes].map(([id, n]) => [id, n.z ?? 0]));
    const isUpper = (q: { nodes: number[] }) => Math.min(...q.nodes.map((n) => z.get(n) ?? 0)) >= Z_CUT - 1e-6;
    const upperQuadIds = [...modelStore.model.quads.entries()].filter(([, q]) => isUpper(q)).map(([id]) => id);
    const lowerQuadIds = [...modelStore.model.quads.entries()].filter(([, q]) => !isUpper(q)).map(([id]) => id);
    expect(upperQuadIds.length).toBeGreaterThan(0);
    expect(lowerQuadIds.length).toBeGreaterThan(0);

    const targets = resolveDeleteTargets(
      { nodes: [], elements: [], shells: upperQuadIds.map((id) => 'q' + id) },
      (id) => modelStore.elements.has(id),
    );
    modelStore.deleteEntities(targets);

    for (const id of upperQuadIds) expect(modelStore.model.quads.has(id)).toBe(false);
    for (const id of lowerQuadIds) expect(modelStore.model.quads.has(id)).toBe(true);
  });

  it('no cross-floor node sharing: identical x/y at different z are distinct node ids', () => {
    const byXY = new Map<string, Set<number>>();
    for (const [id, n] of modelStore.nodes) {
      const key = `${n.x.toFixed(3)}|${n.y.toFixed(3)}`;
      const zs = byXY.get(key) ?? new Set<number>();
      zs.add(id);
      byXY.set(key, zs);
    }
    // For any (x,y) shared by multiple elevations, every elevation has a UNIQUE
    // node id (a vertical column line is many nodes, one per level — never one
    // reused id across z).
    for (const [, ids] of byXY) {
      const zset = new Set([...ids].map((id) => modelStore.nodes.get(id)!.z ?? 0));
      expect(ids.size).toBe(zset.size); // one id per distinct elevation
    }
  });
});
