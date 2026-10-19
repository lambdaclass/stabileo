/**
 * The span fixture on 40×40 columns, its laps as built (`splice-checks.ts`), on every slab mesh.
 *
 * The fixture's beams run continuous through their interior supports (one bar, fused), so they
 * hold no lap. Its six column stacks lap at the first floor: 8Ø16 per lift, the lower lift's bars
 * running 759,5 mm past the floor (+3,25 m, the top of the 50 cm beams' joint) — Class B on
 * ℓd = 420/(2,1·√30)·16 = 584,2 mm, 1,3·584,2 = 759,5 mm (Table 25.5.2.1; ψt = 1,0, vertical).
 *
 * Both lifts put their bars on the certified cage's plan points, so each pair shares a centreline
 * (0 mm between centres against the 16 mm of two Ø16 in contact). Neither the crank of §10.7.4.1
 * nor a side-by-side arrangement is modelled, so §25.5.1.2's clearance of the pair to its
 * neighbours is not evaluated: the six laps are open, and the storey above holds them.
 *
 * Before: the two lifts sat in different storeys' assemblies, no check saw the pair, and the
 * assembly above reached CONSTRUCTIBLE. After: it does not, and the memoria, the IFC, the
 * workbook and the desk read the six upper lifts as open.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { modelStore } from '..';
import { verificationStore } from '../verification.svelte';
import { detailingStore } from '../detailing.svelte';
import { building, designAndDocument } from './span-fixture';
import { memoriaInput } from '../memoria-inputs';
import { projectIfcInput } from '../ifc-export';
import { designSheets } from '../design-exchange';
import * as wasmSolver from '../../engine/wasm-solver';
import '../../engine/design/adapters/cirsoc201-adapter';
import '../../engine/design/adapters/unsupported-adapter';

beforeAll(async () => {
  await new Promise((r) => setTimeout(r, 0));
  expect(wasmSolver.isSolverReady(), 'real WASM solver required').toBe(true);
});

const tr = (k: string) => k;
const MESHES = [1, 0.5, 2, 6] as const;

describe('the span fixture on 40×40 columns: its laps as built', () => {
  const runs = new Map<number, {
    laps: number; open: Array<[string, number[], unknown, unknown, unknown, unknown]>;
    states: Array<[string, string, boolean]>; upperLifts: number[]; draft: boolean;
    memo: Array<[number, string, string]>; ifc: string[]; workbook: string[]; desk: string[];
  }>();
  beforeAll(() => {
    for (const mesh of MESHES) {
      building(mesh, { columnSide: 0.4 });
      const doc = designAndDocument();
      // The persisted assemblies, as the memoria and the desk read them.
      const assemblies = modelStore.model.detailing?.assemblies ?? [];
      if (process.env.SPLICE_PRINT) for (const a of assemblies) for (const u of a.unsupported) console.log('OPEN', mesh, a.id, u.key, JSON.stringify(u.scope.elementIds), JSON.stringify(u.params));
      const open = assemblies.flatMap((a) => a.unsupported.filter((u) => u.key.startsWith('detailing.lapCheck.')));
      const upperLifts = [...verificationStore.contexts.values()]
        .filter((c) => c.elementType === 'column')
        .map((c) => c.elementId)
        .filter((id) => open.some((u) => u.scope.elementIds?.includes(id)));
      const memo = memoriaInput(tr, 'es');
      const ifc = projectIfcInput(tr, 'es', 'splices');
      const wb = designSheets(tr, 'es').find((s) => s.rows[0]?.[0] === 'element')!;
      runs.set(mesh, {
        laps: detailingStore.lastRun?.lapping.laps.length ?? -1,
        open: open.map((u) => [u.key, u.scope.elementIds ?? [], u.params?.joint, u.params?.pairs, u.params?.offset, u.params?.overlap]),
        states: assemblies.filter((a) => a.kind === 'beamLine').map((a) => [a.id, a.state, a.unsupported.some((u) => u.key.startsWith('detailing.lapCheck.'))]),
        upperLifts,
        draft: (doc.openIssues ?? []).some((i) => i.key.startsWith('detailing.lapCheck.')),
        memo: upperLifts.flatMap((id) => (memo.elements.find((e) => e.id === `e${id}`)?.rows ?? [])
          .filter((r) => r.titleKey === 'check.detailing.splice').map((r): [number, string, string] => [id, r.clause ?? '', r.status])),
        ifc: upperLifts.map((id) => String(ifc.members.find((m) => m.id === String(id))?.props?.DesignState ?? 'missing')),
        workbook: upperLifts.map((id) => {
          const name = memo.elements.find((e) => e.id === `e${id}`)!.name;
          return String(wb.rows.find((r) => r[0] === name)?.[6] ?? 'missing');
        }),
        desk: upperLifts.map((id) => verificationStore.getDisplayStatus(id)),
      });
    }
  }, 900_000);

  it('the beams lap nowhere; the six stacks lap at the first floor, every pair on one centreline', () => {
    for (const mesh of MESHES) {
      const r = runs.get(mesh)!;
      expect(r.laps, `mesh ${mesh}`).toBe(0);
      expect(r.open.map(([key, , joint, pairs, offset, overlap]) => [key, joint, pairs, offset, overlap]), `mesh ${mesh}`)
        .toEqual(Array.from({ length: 6 }, () => ['detailing.lapCheck.unarranged', 'z3.25', 8, 0, 759.5]));
      // One condition per upper lift, scoped to it alone.
      expect(r.open.every(([, ids]) => ids.length === 1), `mesh ${mesh}`).toBe(true);
      expect(r.upperLifts.length, `mesh ${mesh}`).toBe(6);
    }
  });

  it('the storey that holds the laps does not reach CONSTRUCTIBLE, and the document stays a draft', () => {
    for (const mesh of MESHES) {
      const r = runs.get(mesh)!;
      for (const [id, state, holds] of r.states) if (holds) expect(state, `mesh ${mesh} ${id}`).not.toBe('CONSTRUCTIBLE');
      expect(r.states.filter(([, , holds]) => holds).map(([id]) => id), `mesh ${mesh}`).toEqual(['level-6.00']);
      expect(r.draft, `mesh ${mesh}`).toBe(true);
    }
  });

  it('the memoria, the IFC, the workbook and the desk read the six upper lifts as open', () => {
    for (const mesh of MESHES) {
      const r = runs.get(mesh)!;
      expect(r.memo.map(([, clause, status]) => [clause, status]), `mesh ${mesh}`)
        .toEqual(Array.from({ length: 6 }, () => ['25.5.1.2, 10.7.4.1', 'unsupported']));
      expect(r.ifc, `mesh ${mesh}`).toEqual(Array.from({ length: 6 }, () => 'not fully verified'));
      expect(r.workbook, `mesh ${mesh}`).toEqual(Array.from({ length: 6 }, () => 'memo.state.open'));
      expect(r.desk, `mesh ${mesh}`).toEqual(Array.from({ length: 6 }, () => 'fail'));
    }
  });
});
