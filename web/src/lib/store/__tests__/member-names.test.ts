/**
 * One name per physical member (QA of 20-oct): on the span fixture, its slab meshed at 1 m (every
 * beam cut at the mesh's nodes), a column keeps its name on every floor, a beam's pieces between
 * two supports share one name, and the next span takes the next.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { modelStore } from '../model.svelte';
import { building, designAndDocument } from './span-fixture';
import { memberNames } from '../member-names';
import { physicalGroups } from '../physical';
import * as wasmSolver from '../../engine/wasm-solver';
import '../../engine/design/adapters/cirsoc201-adapter';
import '../../engine/design/adapters/unsupported-adapter';

beforeAll(async () => {
  await new Promise((r) => setTimeout(r, 0));
  expect(wasmSolver.isSolverReady(), 'real WASM solver required').toBe(true);
});

describe('member names', () => {
  it('columns through their floors, beams by span, each span one name', () => {
    building(1, { columnSide: 0.4 });
    designAndDocument();
    const n = memberNames();
    for (const g of physicalGroups()) {
      const els = g.members.elements ?? [];
      if (g.physical.kind === 'column') expect(new Set(els.map((id) => n.name(id))), g.name).toEqual(new Set([g.name]));
      if (g.physical.kind === 'beam') {
        // Every piece is named by its span: «<beam>-<k>», the same for the pieces of one span.
        const bySpan = new Map<string, Set<string>>();
        for (const id of els) { const sp = n.span(id)!; bySpan.set(sp.key, (bySpan.get(sp.key) ?? new Set()).add(n.name(id))); }
        for (const names of bySpan.values()) expect(names.size, g.name).toBe(1);
        const labels = [...bySpan.values()].map((x) => [...x][0]!);
        expect(new Set(labels).size).toBe(labels.length);
        for (const l of labels) expect(l).toMatch(new RegExp(`^${g.name}-\\d+$`));
        // The mesh cut each span into several pieces: the names are fewer than the pieces.
        expect(labels.length).toBeLessThan(els.length);
      }
    }
    void modelStore;
  }, 600_000);
});
