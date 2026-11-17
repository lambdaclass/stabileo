/**
 * A member whose deflection exceeds its limit reads «fails» everywhere: the desk, the rebar
 * workspace, the document's certificates and readiness, the memoria, the IFC and the workbook.
 *
 * rc-design-qa-8, solved and designed (8/8 VERIFIED on strength). Its beams, read on CIRSOC 201
 * Tabla 24.2.2:
 *   under the default ℓ/360 (immediate deflection due to L): e5, e6 4.10 mm of 16.67 (0.246),
 *   e7, e8 2.93 mm of 13.89 (0.211): all ok, and the document is FOR_REVIEW.
 *   under a project limit of ℓ/480 (the part after attachment of damageable elements,
 *   λΔ·δ(all) + δ due to L): e5, e6 ratio 1.751 and e7, e8 1.176: they fail.
 * Before, under ℓ/480 the memoria, the IFC and the workbook said «fails» for e5–e8 while the desk
 * said ok for all eight and the document read FOR_REVIEW, as under ℓ/360 before the reading was
 * corrected (memoria 4 fails, desk 8 ok).
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { modelStore, resultsStore } from '..';
import { detailingStore } from '../detailing.svelte';
import { designRunStore } from '../design-run.svelte';
import { verificationStore } from '../verification.svelte';
import { memoriaInput } from '../memoria-inputs';
import { projectIfcInput } from '../ifc-export';
import { designSheets } from '../design-exchange';
import { buildOutcomeSummaries } from '../element-status-join';
import { readinessBanner } from '../../engine/detailing/document-render';
import type { DocumentModel } from '../../engine/detailing/document-model';
import * as wasmSolver from '../../engine/wasm-solver';
import { stateSuiteLateral } from './suite-lateral';

beforeAll(async () => {
  await new Promise((r) => setTimeout(r, 0));
  expect(wasmSolver.isSolverReady(), 'real WASM solver required').toBe(true);
});

const tr = (k: string) => k;
const BEAMS = [5, 6, 7, 8];

async function qa8(n?: number): Promise<DocumentModel> {
  modelStore.clear(); resultsStore.clear(); detailingStore.clear(); designRunStore.resetMarks(); verificationStore.clear();
  await modelStore.loadExample('rc-design-qa-8');
  // The reading of the beams' role in the lateral system this suite was written under (`suite-lateral.ts`).
  stateSuiteLateral();
  if (n) modelStore.setDeflectionLimits({ rules: [{ id: 1, scope: { kind: 'memberKind', value: 'beam' }, n, direction: 'resultant' }] });
  const solved = await modelStore.solveCombinations3DParallel(true, false, true) as { perCase: never; perCombo: never; envelope: never };
  resultsStore.setCombinationResults3D(solved.perCase, solved.perCombo, solved.envelope);
  designRunStore.computeDemands(); designRunStore.runCodeCheck(); designRunStore.designAll();
  return detailingStore.buildDocument({ author: 'test', at: '2026-10-12T00:00:00Z' })!;
}

const deflectionRows = () => {
  const memo = memoriaInput(tr, 'es');
  return BEAMS.map((id) => {
    const r = memo.elements.find((e) => e.id === `e${id}`)!.rows.find((x) => x.titleKey === 'check.deflection')!;
    return [id, r.status, +r.ratio!.toFixed(3), r.formula];
  });
};

describe('serviceability is read by every consumer', () => {
  it('ℓ/360: every beam passes, every consumer says so', async () => {
    const doc = await qa8();
    const ids = [...verificationStore.contexts.keys()];
    expect(ids.map((id) => verificationStore.outcomeFor(id)?.outcome)).toEqual(Array(8).fill('VERIFIED'));
    expect(ids.map((id) => verificationStore.getDisplayStatus(id))).toEqual(Array(8).fill('ok'));
    expect(deflectionRows()).toEqual([[5, 'ok', 0.246, 'δ ≤ L/360'], [6, 'ok', 0.246, 'δ ≤ L/360'], [7, 'ok', 0.211, 'δ ≤ L/360'], [8, 'ok', 0.211, 'δ ≤ L/360']]);
    expect(doc.readiness).toBe('FOR_REVIEW');
    expect(doc.certificates.map((c) => c.status)).toEqual(Array(8).fill('ok'));
    expect(projectIfcInput(tr, 'es', 'qa8').members.map((m) => m.props?.DesignState)).toEqual(Array(8).fill('satisfies'));
  }, 600_000);

  it('ℓ/480: the four beams fail on the desk, the workspace, the document, the memoria, the IFC and the workbook', async () => {
    const doc = await qa8(480);
    // Strength still verifies; serviceability does not.
    expect(BEAMS.map((id) => verificationStore.outcomeFor(id)?.outcome)).toEqual(Array(4).fill('VERIFIED'));
    expect(deflectionRows()).toEqual([[5, 'fail', 1.751, 'δ ≤ L/480'], [6, 'fail', 1.751, 'δ ≤ L/480'], [7, 'fail', 1.176, 'δ ≤ L/480'], [8, 'fail', 1.176, 'δ ≤ L/480']]);
    expect([...verificationStore.contexts.keys()].map((id) => [id, verificationStore.getDisplayStatus(id)]))
      .toEqual([[1, 'ok'], [2, 'ok'], [3, 'ok'], [4, 'ok'], [5, 'fail'], [6, 'fail'], [7, 'fail'], [8, 'fail']]);
    const join = buildOutcomeSummaries();
    for (const id of BEAMS) expect([join.get(id)!.verificationStatus, (join.get(id)!.verificationLimiting ?? []).includes('deflection')], `e${id}`).toEqual(['fail', true]);
    expect(doc.certificates.map((c) => [c.elementId, c.status]))
      .toEqual([[1, 'ok'], [2, 'ok'], [3, 'ok'], [4, 'ok'], [5, 'fail'], [6, 'fail'], [7, 'fail'], [8, 'fail']]);
    expect(doc.readiness).toBe('REVIEW_DRAFT');
    expect(readinessBanner(doc, 'es')).toMatch(/NO APTO PARA CONSTRUCCI/);
    // The assembly holding them is not CONSTRUCTIBLE either: its gate counts a member as
    // re-verified only when the verifier passes it, deflection included (`serviceabilityFails`).
    const held = doc.assemblies.filter((x) => x.elementIds.some((id) => BEAMS.includes(id)));
    expect(held.length).toBeGreaterThan(0);
    for (const a of held) {
      expect(a.state, a.id).not.toBe('CONSTRUCTIBLE');
      const gate = (detailingStore.assemblies.find((x) => x.id === a.id) ?? a) as { constructibility?: { blocking: string[] } };
      expect(gate.constructibility?.blocking, a.id).toEqual(expect.arrayContaining(['allMembersReverified', 'certificatesMatchGeometry']));
    }
    expect(projectIfcInput(tr, 'es', 'qa8').members.map((m) => [m.id, m.props?.DesignState]))
      .toEqual([['1', 'satisfies'], ['2', 'satisfies'], ['3', 'satisfies'], ['4', 'satisfies'], ['5', 'fails'], ['6', 'fails'], ['7', 'fails'], ['8', 'fails']]);
    const wb = designSheets(tr, 'es').find((s) => s.rows[0]?.[0] === 'element')!;
    expect(wb.rows.filter((r) => r[6] === 'memo.state.fail').map((r) => r[0]))
      .toEqual(BEAMS.map((id) => `memo.kind.beam ${id}`));
  }, 600_000);
});
