// Regression for the "deleting upper floors removes unselected lower-floor
// shells" bug (PR [9]). Frame elements, plates and quads have independent id
// spaces, so a numeric id can be both a frame element and an (unrelated) quad.
// Deleting selected upper-floor nodes/frames must NEVER remove a lower-floor
// shell that was not selected — even when ids collide.
import { describe, it, expect, beforeEach } from 'vitest';
import { modelStore } from '../../store/model.svelte';
import { historyStore } from '../../store/history.svelte';
import { buildStabileoTemplateDxf } from '../template';
import { parseCadDxf } from '../parse';
import { suggestLayerMappings, extractArchPlan } from '../classify';
import { generateRcDraft } from '../draft';
import type { RcDraftAssumptions } from '../types';

function loadTemplateDraft() {
  const doc = parseCadDxf(buildStabileoTemplateDxf(), 'stb.dxf');
  const plan = extractArchPlan(doc, suggestLayerMappings(doc, 'm'), 'm');
  const a: RcDraftAssumptions = {
    nFloors: 10, storyHeights: plan.levelHeights ?? Array.from({ length: 10 }, () => 2.8),
    concreteGrade: 'H-30', columnSection: { b: 0.3, h: 0.3 }, beamSection: { b: 0.2, h: 0.5 },
    slabThickness: 0.2, wallThickness: 0.15, baseSupport: 'fixed3d',
    deadLoad: 7, liveLoad: 2, roofLiveLoad: 1, generateCombos: true,
    meshSlabs: true, meshMode: 'fixedDivisions', meshDivisions: 3, splitBeams: true, snapTolerance: 0.03,
    detectOffsets: false,
  };
  const draft = generateRcDraft(plan, a, { fileName: 'stb.dxf', importedAtIso: 'x' });
  modelStore.restore(draft.snapshot);
}

const Z_CUT = 11.4; // floor 4 base (3 + 2*2.8 + … ) — "delete floor 4 upward"

function nodeZ() {
  const m = new Map<number, number>();
  for (const [id, n] of modelStore.nodes) m.set(id, n.z ?? 0);
  return m;
}

beforeEach(() => {
  modelStore.clear();
  historyStore.clear();
  loadTemplateDraft();
});

describe('CAD draft: deleting upper floors keeps unselected lower shells', () => {
  it('the scenario is real: some frame-element ids collide with lower-floor quad ids', () => {
    const z = nodeZ();
    const lowerQuadIds = new Set<number>();
    for (const [id, q] of modelStore.model.quads) {
      if (Math.max(...q.nodes.map((nn) => z.get(nn) ?? 0)) <= 8.6 + 1e-6) lowerQuadIds.add(id);
    }
    const collide = [...modelStore.elements.keys()].some((eid) => lowerQuadIds.has(eid));
    expect(collide).toBe(true); // id spaces overlap → the bug was possible
  });

  it('box-select (nodes + frame elements) above the cut does not delete lower-floor quads', () => {
    const z = nodeZ();
    const lowerQuads = [...modelStore.model.quads.entries()]
      .filter(([, q]) => Math.max(...q.nodes.map((nn) => z.get(nn) ?? 0)) <= 8.6 + 1e-6)
      .map(([id]) => id);
    expect(lowerQuads.length).toBeGreaterThan(0);

    // Mimic 3D box-select of everything from the cut upward: nodes at z≥cut and
    // frame elements with both ends at z≥cut. (Shells are NOT box-selected.)
    const selNodes = [...modelStore.nodes.values()].filter((n) => (n.z ?? 0) >= Z_CUT - 1e-6).map((n) => n.id);
    const selElems = [...modelStore.elements.entries()]
      .filter(([, e]) => (z.get(e.nodeI) ?? 0) >= Z_CUT - 1e-6 && (z.get(e.nodeJ) ?? 0) >= Z_CUT - 1e-6)
      .map(([id]) => id);
    expect(selElems.length).toBeGreaterThan(0);

    modelStore.deleteEntities({ nodes: selNodes, elements: selElems });

    // EVERY lower-floor quad must still exist (none was reinterpreted/deleted).
    for (const qid of lowerQuads) expect(modelStore.model.quads.has(qid)).toBe(true);
  });

  it('deleting only upper-floor frame members leaves all lower-floor shells', () => {
    const z = nodeZ();
    const lowerQuadsBefore = modelStore.model.quads.size;
    const lowerQuads = [...modelStore.model.quads.entries()]
      .filter(([, q]) => Math.max(...q.nodes.map((nn) => z.get(nn) ?? 0)) <= 8.6 + 1e-6)
      .map(([id]) => id);

    const upperFrames = [...modelStore.elements.entries()]
      .filter(([, e]) => (z.get(e.nodeI) ?? 0) >= Z_CUT - 1e-6 || (z.get(e.nodeJ) ?? 0) >= Z_CUT - 1e-6)
      .map(([id]) => id);
    modelStore.deleteEntities({ elements: upperFrames });

    for (const qid of lowerQuads) expect(modelStore.model.quads.has(qid)).toBe(true);
    // No quad was removed at all (we deleted only frame elements).
    expect(modelStore.model.quads.size).toBe(lowerQuadsBefore);
  });

  it('removeNode never deletes shells (only frame elements/supports/nodal loads)', () => {
    const z = nodeZ();
    const beforeQuads = modelStore.model.quads.size;
    // Delete one interior floor-3 node; quads referencing it survive (a shell
    // is only removed when the shell itself is selected).
    const someNode = [...modelStore.nodes.values()].find((n) => (n.z ?? 0) > 5 && (n.z ?? 0) < 9);
    expect(someNode).toBeDefined();
    modelStore.deleteEntities({ nodes: [someNode!.id] });
    expect(modelStore.model.quads.size).toBe(beforeQuads);
  });

  it('a selected shell IS deleted, and nothing else of that kind', () => {
    const firstQuad = [...modelStore.model.quads.keys()][0];
    const before = modelStore.model.quads.size;
    modelStore.deleteEntities({ quads: [firstQuad] });
    expect(modelStore.model.quads.has(firstQuad)).toBe(false);
    expect(modelStore.model.quads.size).toBe(before - 1);
  });
});
