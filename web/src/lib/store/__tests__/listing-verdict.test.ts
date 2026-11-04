/**
 * A listing states each member's verdict beside its checks (QA of 20-oct: the listings said
 * «verifica» where the panel said «no verifica»). On the span fixture at 30×30 every span is
 * refused for its anchorage, and every column is held by its analysis: each reads what holds it.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { verificationStore } from '../verification.svelte';
import { building, designAndDocument } from './span-fixture';
import { buildListing } from '../listings';
import { memberNames } from '../member-names';
import * as wasmSolver from '../../engine/wasm-solver';
import '../../engine/design/adapters/cirsoc201-adapter';
import '../../engine/design/adapters/unsupported-adapter';

beforeAll(async () => {
  await new Promise((r) => setTimeout(r, 0));
  expect(wasmSolver.isSolverReady(), 'real WASM solver required').toBe(true);
});

describe('the listings read the member verdict', () => {
  it('a refused beam: its rows say «sin verificar» with the refusal, whatever its local rows say', () => {
    building(1);
    designAndDocument();
    const refused = [...verificationStore.contexts.values()].filter((c) => verificationStore.outcomeFor(c.elementId)?.outcome === 'SEARCH_EXHAUSTED').map((c) => memberNames().name(c.elementId));
    expect(refused.length).toBeGreaterThan(0);
    for (const id of ['checks', 'beams'] as const) {
      const l = buildListing(id, 'es');
      expect(l.columns.map((c) => c.key)).toEqual(expect.arrayContaining(['verdict', 'held']));
      const rows = l.rows.filter((r) => refused.includes(String(r.member)));
      expect(rows.length, id).toBeGreaterThan(0);
      for (const r of rows) {
        expect(r.verdict, id).toBe('sin verificar');
        expect(String(r.held), id).toMatch(/rechaz/);
      }
    }
    // The columns, verified locally, are held by their analysis on this mesh (the slab at one
    // node, `analysis-validity.ts`): none reads «verifica», and each says why.
    const cols = buildListing('columns', 'es').rows;
    expect(cols.length).toBeGreaterThan(0);
    for (const r of cols) {
      expect(r.status).not.toBe('verifica');
      expect(String(r.held)).not.toBe('');
    }
  }, 600_000);
});
