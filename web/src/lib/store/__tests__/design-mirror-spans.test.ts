/**
 * Mirror-image beams get the same steel.
 *
 * The span building is symmetric about both of its plan axes: V2 (axis 1, y = 0) and V3 (axis 2,
 * y = 5) are mirror images, and so are each beam's two 6 m spans. Their stations are the same
 * forces with Mz, Vy and T reversed (to 1e-13 kN, kN·m). Under them the design gave V2 2 Ø16 and
 * 3 Ø12 at the bottom of its two spans and V3 3 Ø12 and 2 Ø16, and the detailing 14 and 8
 * longitudinal bars: the torsion longitudinal check (§22.7.6.1, `station-design-forces.ts`) read
 * the flexural steel at whichever of several tuples tying on the stirrup ratio the rounding
 * picked, x = 0,70 m on one span and 1,00 m on its mirror image, and the 3 Ø12 it passed there is
 * 11 % short at x = 0,70 m. With 40 cm columns, as `design-span-mesh-guard.test.ts` builds it,
 * on every mesh; the 6 m one is read here, under the 0,5 m solve's forces.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { modelStore } from '..';
import { verificationStore } from '../verification.svelte';
import * as wasmSolver from '../../engine/wasm-solver';
import { building, designAndDocumentUnder, forcesByPlace, physicalBeams } from './span-fixture';
import { cirsoc201Adapter } from '../../engine/design/adapters/cirsoc201-adapter';
import type { DocumentModel } from '../../engine/detailing/document-model';
import '../../engine/design/adapters/unsupported-adapter';

beforeAll(async () => {
  await new Promise((r) => setTimeout(r, 0));
  expect(wasmSolver.isSolverReady(), 'real WASM solver required').toBe(true);
});

type Groups = Array<{ count: number; diameter: number }> | undefined;
const g = (x: Groups) => (x ?? []).map((l) => `${l.count}Ø${l.diameter}`).join('+');

describe('the span building on the 6 m mesh under the 0,5 m forces: mirror-image beams, the same steel', () => {
  let doc: DocumentModel;
  beforeAll(() => {
    // The 0,5 m solve's forces, read by the 6 m model's design (`designAndDocumentUnder`), as the
    // mesh guard's second block does.
    building(0.5, { columnSide: 0.4 });
    const forces = forcesByPlace();
    building(6, { columnSide: 0.4 });
    doc = designAndDocumentUnder(forces);
  }, 300_000);

  /** Each span of a beam, from x = 0: its bottom, top-start and top-end layers. */
  const spans = (name: string) => physicalBeams().find((b) => b.name === name)!.elements
    .map((id) => ({ id, x: Math.min(...[modelStore.elements.get(id)!.nodeI, modelStore.elements.get(id)!.nodeJ].map((n) => modelStore.nodes.get(n)!.x)) }))
    .sort((p, q) => p.x - q.x)
    .map(({ id }) => {
      const r = modelStore.elements.get(id)!.reinforcement?.regions as Record<string, Groups> | undefined;
      return `${g(r?.bottomSpanLayers)} / ${g(r?.topStartLayers)} / ${g(r?.topEndLayers)}`;
    });

  it('V2 and V3, and their two spans, are designed alike, and V7 and V8 above them', () => {
    expect(spans('V3')).toEqual(spans('V2'));
    expect(spans('V8')).toEqual(spans('V7'));
    // The two spans of one beam mirror each other about column B: the bottom is the same.
    for (const name of ['V2', 'V3']) {
      const [a, b] = spans(name);
      expect(a!.split(' / ')[0], name).toBe(b!.split(' / ')[0]);
    }
  });

  it('and detailed alike: the same number of longitudinal bars', () => {
    const count = (name: string) => {
      const ids = new Set(physicalBeams().find((b) => b.name === name)!.elements);
      return doc.assemblies.flatMap((a) => a.bars)
        .filter((b) => b.role === 'longitudinal' && b.ownerElementIds.every((id) => ids.has(id))).length;
    };
    expect(count('V3')).toBe(count('V2'));
    expect(count('V8')).toBe(count('V7'));
  });

  it('a candidate passes or fails the torsion longitudinal check alike on a span and its mirror image', () => {
    const [e2] = physicalBeams().find((b) => b.name === 'V2')!.elements;
    const [e3] = physicalBeams().find((b) => b.name === 'V3')!.elements;
    const accepted = verificationStore.runSummary!.outcomes.get(e2!)!.accepted!;
    for (const bottom of [{ count: 3, diameter: 12 }, { count: 2, diameter: 16 }]) {
      const rebar = { ...accepted, regions: { ...accepted.regions, bottomSpanLayers: [{ ...bottom, row: 0 }], bottomSpan: bottom } };
      const al = (id: number) => {
        const v = cirsoc201Adapter.verify(verificationStore.contextFor(id)!, { ...rebar, elementId: id } as never);
        const c = (v.checks as Array<{ category: string; status: string; ratio?: number }>).find((x) => x.category.startsWith('Torsion Al Span'));
        return `${c?.status} ${c?.ratio}`;
      };
      expect(al(e3!), `${bottom.count}Ø${bottom.diameter}`).toBe(al(e2!));
    }
  });
});
