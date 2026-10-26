/**
 * A refused member's outcome survives a save and a reopen, and a snapshot restore (the path an
 * autosave, an undo and a tab switch take), like a verified member's bars do.
 *
 * A verified member comes back from its saved reinforcement; a refused one has none, and its
 * outcome lived only in the session. Before: after the `.ded` round trip and a new solve, the
 * refused beams of the span fixture had no outcome, no refusal row in the memoria, and the
 * workbook and the IFC read them with whatever rows were left. After: the refusal comes back,
 * with its reasons, while the model is still the one it was reached on.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { modelStore } from '../model.svelte';
import { resultsStore } from '../results.svelte';
import { verificationStore } from '../verification.svelte';
import { designRunStore } from '../design-run.svelte';
import { serializeProject, deserializeProject } from '../file';
import { memoriaInput } from '../memoria-inputs';
import { projectIfcInput } from '../ifc-export';
import { building } from './span-fixture';
import * as wasmSolver from '../../engine/wasm-solver';
import '../index';

const tr = (k: string) => k;
const beams = () => [...verificationStore.contexts.values()].filter((c) => c.elementType === 'beam');

async function solveAndDemands(): Promise<void> {
  const solved = await modelStore.solveCombinations3DParallel(true, false, true);
  const r = solved as { perCase: never; perCombo: never; envelope: never };
  resultsStore.setCombinationResults3D(r.perCase, r.perCombo, r.envelope);
  expect(designRunStore.computeDemands().ok).toBe(true);
}

/** What a reader sees of the refused beams: the outcome, its scope, the memoria row, the IFC state. */
function readRefusals() {
  const memo = memoriaInput(tr, 'es');
  const ifc = projectIfcInput(tr, 'es', 'p');
  return beams().map((c) => {
    const o = verificationStore.outcomeFor(c.elementId);
    const row = memo.elements.find((e) => e.id === `e${c.elementId}`)?.rows.find((r) => r.titleKey?.startsWith('check.design.'));
    const key = c.span?.key ?? String(c.elementId);
    return {
      id: c.elementId, outcome: o?.outcome, scope: o?.exhaustion?.scope, reason: o?.reasons.find((r) => r.key === 'design.reason.alternativesExhausted')?.key,
      row: row?.titleKey, rowStatus: row?.status, ifc: ifc.members.find((m) => m.id === key)?.props?.DesignOutcome,
    };
  });
}

let before: ReturnType<typeof readRefusals>;
/** The project as first designed, saved: what a reopen hands back. */
let saved: string;

beforeAll(async () => {
  await new Promise((r) => setTimeout(r, 0));
  expect(wasmSolver.isSolverReady(), 'real WASM solver required').toBe(true);
  building(1);
  designRunStore.designFamilies(['column', 'beam']);
  before = readRefusals();
  saved = serializeProject();
}, 600_000);

describe('a refused beam after a save and a reopen', () => {
  it('the session reads every beam refused, an exhausted search with its reason, in the memoria and the IFC', () => {
    expect(before.length).toBe(78);
    for (const r of before) {
      expect([r.outcome, r.scope, r.reason, r.row, r.rowStatus, r.ifc], `e${r.id}`).toEqual([
        'SEARCH_EXHAUSTED', 'implementedAlternatives', 'design.reason.alternativesExhausted',
        'check.design.alternativesExhausted', 'fail', 'implemented alternatives exhausted, insufficiency not shown',
      ]);
    }
    // The fixture declares its beams outside the lateral system: no «declare the role» note.
    // An undeclared beam refused on its anchorage carries it (`refusal-evidence.test.ts`).
    for (const c of beams()) {
      expect([c.lateral?.role, verificationStore.outcomeFor(c.elementId)!.exhaustion!.notImplemented.includes('lateralRoleUndeclared')], `e${c.elementId}`).toEqual(['gravity', false]);
    }
  });

  it('comes back the same through the .ded round trip and a new solve', async () => {
    const file = serializeProject();
    modelStore.clear(); resultsStore.clear(); verificationStore.clear();
    expect(deserializeProject(file)).toBe(true);
    await solveAndDemands();
    expect(readRefusals()).toEqual(before);
  }, 600_000);

  it('comes back the same through a snapshot restore', async () => {
    const snap = modelStore.snapshot();
    modelStore.clear(); resultsStore.clear(); verificationStore.clear();
    modelStore.restore(snap);
    await solveAndDemands();
    expect(readRefusals()).toEqual(before);
  }, 600_000);

  it('and is not read on a model that changed after it', async () => {
    const col = [...modelStore.sections.values()].find((s) => s.name.startsWith('Rect 30'))!;
    modelStore.updateSection(col.id, { b: 0.31, h: 0.31 } as never);
    await solveAndDemands();
    expect(beams().every((c) => verificationStore.outcomeFor(c.elementId) === undefined)).toBe(true);
  }, 600_000);
});

describe('«design all» after a reopen', () => {
  /*
   * A refused beam has no bars, and `designAll` designs the members with no bars when there are
   * any. Read as undesigned, the kept refusals made it retry the refused beams alone: the columns,
   * which keep their bars, were never designed again, had no outcome, and the detailing read every
   * member as not verified (rc-qa-diagnostic in `rebar-toggles.spec.ts`: 26 of 26). A kept refusal
   * is the design's answer for the member, so «design all» designs the whole model again.
   */
  it('designs every member again, not only the refused ones', async () => {
    modelStore.clear(); resultsStore.clear(); verificationStore.clear();
    expect(deserializeProject(saved)).toBe(true);
    await solveAndDemands();
    const columns = [...verificationStore.contexts.values()].filter((c) => c.elementType === 'column');
    // The premise: the refusals are back, and the columns carry bars and no outcome yet.
    expect(readRefusals()).toEqual(before);
    expect(columns.length).toBeGreaterThan(0);
    expect(columns.every((c) => !!modelStore.elements.get(c.elementId)?.reinforcement
      && verificationStore.outcomeFor(c.elementId) === undefined)).toBe(true);

    expect(designRunStore.designAll().ok).toBe(true);
    expect(columns.filter((c) => verificationStore.outcomeFor(c.elementId) === undefined).map((c) => c.elementId)).toEqual([]);
    expect(readRefusals()).toEqual(before);
  }, 600_000);
});
