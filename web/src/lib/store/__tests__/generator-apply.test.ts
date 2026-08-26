/**
 * A generated model lands intact, and carries its assumptions with it.
 *
 * The one property worth guarding above all: what the preview promised is what the store
 * holds. The preview counts come from the topology, the store's come from a fixture load
 * that remaps every id, and if those ever diverge the number beside the Generate button is
 * a lie.
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { modelStore } from '../model.svelte';
import { historyStore } from '../history.svelte';
import { applyGeneratedModel, matchesPreview } from '../generator-apply';
import { generateTruss, DEFAULT_TRUSS_PARAMS } from '../../engine/generators/truss-topology';
import { generateShed, DEFAULT_SHED_PARAMS } from '../../engine/generators/shed';
import { generateLatticeColumn } from '../../engine/generators/lattice-column';
import { emitModel, defaultProfileSpec, type EmitOptions } from '../../engine/generators/emit';
import { isGenerated } from '../../model/provenance';

const PROFILES: EmitOptions['profiles'] = {
  chord: defaultProfileSpec('IPE 100'),
  post: defaultProfileSpec('L 50x50x5'),
  diagonal: defaultProfileSpec('L 50x50x5'),
  rafter: defaultProfileSpec('IPE 160'),
  column: defaultProfileSpec('HEB 160'),
  beam: defaultProfileSpec('IPE 200'),
  purlin: defaultProfileSpec('UPN 100'),
};

const AT = '2026-08-12T00:00:00.000Z';

beforeEach(() => { modelStore.clear(); });

describe('applyGeneratedModel — undo', () => {
  beforeAll(async () => {
    // history.svelte.ts wires modelStore._setHistoryPush from a queueMicrotask.
    await new Promise((r) => setTimeout(r, 0));
  });

  it('is ONE undo step back to the model that was replaced — never the empty in-between', () => {
    // A non-empty model on screen, then Generate over it.
    const first = emitModel(generateLatticeColumn({ divisions: 6 }), { name: 'Columna', profiles: PROFILES });
    applyGeneratedModel(first, { source: 'generator-lattice-column', atIso: AT, params: {} });
    const before = { nodes: modelStore.nodes.size, elements: modelStore.elements.size };
    expect(before.elements).toBeGreaterThan(0);

    // Only the Generate under test may be on the stack.
    historyStore.clear();

    const second = emitModel(generateTruss({ panelsPerHalf: 3 }), { name: 'Cercha', profiles: PROFILES });
    applyGeneratedModel(second, { source: 'generator-truss', atIso: AT, params: {} });
    expect(modelStore.elements.size).toBe(second.json.elements.length);
    expect(historyStore.undoCount).toBe(1);

    historyStore.undo();
    // The replaced model is back — not the empty model a clear-then-load pair would leave.
    expect(modelStore.nodes.size).toBe(before.nodes);
    expect(modelStore.elements.size).toBe(before.elements);
    expect(modelStore.model.name).toBe('Columna');
    expect(historyStore.canUndo).toBe(false);
  });
});

describe('applyGeneratedModel — a truss', () => {
  it('puts exactly what the preview promised into the store', () => {
    const t = generateTruss({ ...DEFAULT_TRUSS_PARAMS, panelsPerHalf: 5 });
    const g = emitModel(t, { name: 'Cercha 10 m', profiles: PROFILES });
    const r = applyGeneratedModel(g, { source: 'generator-truss', atIso: AT, params: { spanM: 10 } });

    expect(r.nodes).toBe(g.json.nodes.length);
    expect(r.elements).toBe(g.json.elements.length);
    expect(matchesPreview(g, r)).toBe(true);
  });

  it('names the model and records where it came from', () => {
    const g = emitModel(generateTruss(), { name: 'Cercha', profiles: PROFILES });
    const r = applyGeneratedModel(g, {
      source: 'generator-truss', atIso: AT, params: { spanM: 10, panelsPerHalf: 5 },
      name: 'Cercha trapezoidal',
    });
    expect(modelStore.model.name).toBe('Cercha trapezoidal');
    expect(r.provenance.source).toBe('generator-truss');
    expect(r.provenance.fileName).toBe('Cercha trapezoidal');
    expect(r.provenance.importedAtIso).toBe(AT);
    expect(isGenerated(r.provenance)).toBe(true);
  });

  it('marks it unreviewed, like the CAD import does', () => {
    const g = emitModel(generateTruss(), { name: 'x', profiles: PROFILES });
    const r = applyGeneratedModel(g, { source: 'generator-truss', atIso: AT, params: {} });
    expect(r.provenance.status).toBe('generated-unreviewed');
  });

  it('carries the assumptions as KEYS, and says they are keys', () => {
    const g = emitModel(generateTruss(), { name: 'x', profiles: PROFILES });
    const r = applyGeneratedModel(g, { source: 'generator-truss', atIso: AT, params: {} });
    expect(r.provenance.assumptionsAreKeys).toBe(true);
    expect(r.provenance.assumptions).toEqual(g.assumptions);
    expect(r.provenance.assumptions.length).toBeGreaterThan(0);
    // Keys, not prose: an engine below the i18n layer has no business producing Spanish.
    for (const a of r.provenance.assumptions) expect(a).toMatch(/^generator\./);
  });

  it('records the parameters, so the model can be argued with rather than reverse-engineered', () => {
    const params = { kind: 'trapezoidal', spanM: 12, panelsPerHalf: 6 };
    const g = emitModel(generateTruss({ spanM: 12, panelsPerHalf: 6 }), { name: 'x', profiles: PROFILES });
    const r = applyGeneratedModel(g, { source: 'generator-truss', atIso: AT, params });
    expect(r.provenance.generatorParams).toEqual(params);
  });

  it('reaches the model store, not just the returned record', () => {
    const g = emitModel(generateTruss(), { name: 'x', profiles: PROFILES });
    applyGeneratedModel(g, { source: 'generator-truss', atIso: AT, params: {} });
    expect(modelStore.model.provenance?.source).toBe('generator-truss');
    expect(isGenerated(modelStore.model.provenance)).toBe(true);
  });
});

describe('applyGeneratedModel — replacing what was there', () => {
  it('leaves nothing of the previous model behind', () => {
    const first = emitModel(generateLatticeColumn({ divisions: 6 }), { name: 'Columna', profiles: PROFILES });
    applyGeneratedModel(first, { source: 'generator-lattice-column', atIso: AT, params: {} });
    const afterFirst = modelStore.elements.size;

    const second = emitModel(generateTruss({ panelsPerHalf: 3 }), { name: 'Cercha', profiles: PROFILES });
    const r = applyGeneratedModel(second, { source: 'generator-truss', atIso: AT, params: {} });

    expect(afterFirst).toBe(25);
    expect(r.elements).toBe(second.json.elements.length);
    expect(modelStore.elements.size).toBe(second.json.elements.length);
    expect(modelStore.model.provenance?.source).toBe('generator-truss');
  });
});

describe('applyGeneratedModel — a whole shed', () => {
  const shed = generateShed({
    ...DEFAULT_SHED_PARAMS, frames: 3, roof: true, purlins: true, longitudinalBeams: true,
  });
  const g = emitModel(shed, { name: 'Nave', profiles: PROFILES });

  it('lands every member and every node', () => {
    const r = applyGeneratedModel(g, { source: 'generator-shed', atIso: AT, params: { frames: 3 } });
    expect(matchesPreview(g, r)).toBe(true);
    expect(r.elements).toBeGreaterThan(100);
  });

  it('gives each role its own section and no more', () => {
    const r = applyGeneratedModel(g, { source: 'generator-shed', atIso: AT, params: {} });
    // The store seeds a default section, so it holds at most one more than the generator
    // emitted — never one per member.
    expect(r.sections).toBeLessThanOrEqual(g.json.sections.length + 1);
    expect(r.sections).toBeLessThan(r.elements);
  });

  it('arrives with every member undesigned — no reinforcement, no certificate', () => {
    applyGeneratedModel(g, { source: 'generator-shed', atIso: AT, params: {} });
    for (const el of modelStore.elements.values()) {
      expect(el.reinforcement).toBeUndefined();
    }
  });

  it('keeps the per-member purlin roll through the fixture load', () => {
    applyGeneratedModel(g, { source: 'generator-shed', atIso: AT, params: {} });
    // `loadFixture` remaps every id, so a roll that survives proves the passthrough works —
    // without it every purlin would land flat and the roof would be silently wrong.
    const rolled = [...modelStore.elements.values()].filter((e) => (e.rollAngle ?? 0) !== 0);
    expect(rolled.length).toBeGreaterThan(0);
  });

  it('discloses the assumptions a 600-member shed was built on', () => {
    const r = applyGeneratedModel(g, { source: 'generator-shed', atIso: AT, params: {} });
    expect(r.provenance.assumptions).toContain('generator.assume.purlinsRolledToPitch');
    expect(r.provenance.assumptions).toContain('generator.assume.columnCapSharesReaction');
    expect(r.provenance.assumptions).toContain('generator.assume.webPinned');
  });
});

describe('the generated model reads as metallic', () => {
  it('is picked up by the steel inventory, with nothing designed', async () => {
    const { steelStore } = await import('../steel.svelte');
    const g = emitModel(generateTruss({ panelsPerHalf: 3 }), { name: 'Cercha', profiles: PROFILES });
    applyGeneratedModel(g, { source: 'generator-truss', atIso: AT, params: {} });

    const inv = steelStore.inventory;
    expect(inv.members.length).toBe(modelStore.elements.size);
    expect(inv.emptyReason).toBeNull();
    for (const m of inv.members) {
      expect(m.state.status).not.toBe('EXPERIMENTAL');
      expect(m.state.experimental).toBeUndefined();
    }
  });
});
