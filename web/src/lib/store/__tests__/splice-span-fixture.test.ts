/**
 * The span fixture on 40×40 columns, its laps as built (`splice-checks.ts`), on every slab mesh.
 *
 * The fixture's beams run continuous through their interior supports (one bar, fused), so they
 * hold no lap. Its six column stacks lap at the first floor: 8Ø16 per lift, the lower lift's bars
 * running 759,5 mm past the end of their crank — Class B on ℓd = 420/(2,1·√30)·16 = 584,2 mm,
 * 1,3·584,2 = 759,5 mm (Table 25.5.2.1; ψt = 1,0, vertical).
 *
 * Both lifts put their bars on the certified cage's plan points, so the lower bars are cranked
 * (§10.7.4.1): straight through the joint, on the plan points the beams' bars were threaded past,
 * then inward by two Ø16 in contact, 16 mm over 96 mm (1 in 6), above the joint (+3,25 m, the top
 * of the 50 cm beams' joint). The upper bars start where the bend ends, and each pair laps in
 * contact (§25.5.1.2).
 *
 * Before the crank (QA of 20-oct): each pair shared a centreline, 0 mm between centres against
 * the 16 of two Ø16 in contact, the six laps were open and the storey above held them; the
 * memoria, the IFC, the workbook and the desk read the six upper lifts as open. Now none is.
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
    cranks: Array<{ zBend: number; inward: number; rise: number; lap: number }>; columnsHeldByDetailing: number[];
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
        cranks: assemblies.flatMap((a) => a.bars).filter((b) => /-L0-v\d+$/.test(b.id) && b.segments.length === 3).map((b) => {
          const [, bend, run] = b.segments as [typeof b.segments[0], typeof b.segments[0], typeof b.segments[0]];
          return { zBend: bend.start.z, inward: Math.hypot(bend.end.x - bend.start.x, bend.end.y - bend.start.y), rise: bend.end.z - bend.start.z, lap: run.end.z - run.start.z };
        }),
        columnsHeldByDetailing: [...verificationStore.contexts.values()].filter((c) => c.elementType === 'column')
          .filter((c) => verificationStore.memberHolds(c.elementId).some((h) => h.kind === 'detailing')).map((c) => c.elementId),
      });
    }
  }, 900_000);

  it('the beams lap nowhere; the six stacks lap at the first floor, every pair in contact', () => {
    for (const mesh of MESHES) {
      const r = runs.get(mesh)!;
      expect(r.laps, `mesh ${mesh}`).toBe(0);
      expect(r.open, `mesh ${mesh}`).toEqual([]);
      expect(r.upperLifts, `mesh ${mesh}`).toEqual([]);
      // Each lower bar: straight to the joint's top, then 16 mm inward over 96 mm, then the lap.
      expect(r.cranks.length, `mesh ${mesh}`).toBe(6 * 8);
      for (const c of r.cranks) {
        expect(c.zBend, `mesh ${mesh}`).toBeCloseTo(3.25, 6);
        expect(c.inward * 1000, `mesh ${mesh}`).toBeCloseTo(16, 6);
        expect(c.rise * 1000, `mesh ${mesh}`).toBeCloseTo(96, 6);
        expect(c.lap * 1000, `mesh ${mesh}`).toBeCloseTo(759.5, 1);
      }
    }
  });

  it('no storey is held by a lap, and the document carries no open lap', () => {
    for (const mesh of MESHES) {
      const r = runs.get(mesh)!;
      expect(r.states.filter(([, , holds]) => holds).map(([id]) => id), `mesh ${mesh}`).toEqual([]);
      expect(r.draft, `mesh ${mesh}`).toBe(false);
    }
  });

  it('nothing in the memoria, the IFC, the workbook or the desk holds a column on its lap', () => {
    for (const mesh of MESHES) {
      const r = runs.get(mesh)!;
      expect(r.memo, `mesh ${mesh}`).toEqual([]);
      expect(r.columnsHeldByDetailing, `mesh ${mesh}`).toEqual([]);
    }
  });
});
