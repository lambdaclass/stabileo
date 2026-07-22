// PR[12] review fix — cross-language parity for the biaxial section-stress
// convention. The formula lives in TWO hand-maintained implementations
// (engine/src/postprocess/section_stress_3d.rs and section-stress-3d.ts); before
// this fixture each was guarded only by its own separately-authored expected
// values, so a one-sided sign/axis-pairing flip could pass both. This test and
// the Rust test (engine/tests/.../stress_3d.rs::validation_stress_3d_parity_fixture)
// assert the SAME fixture, so the two engines cannot silently drift.
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// Force the TS fallback path (the Rust side is covered by the Rust test).
vi.mock('../wasm-solver', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../wasm-solver')>();
  return { ...actual, isWasmReady: () => false };
});

import { analyzeSectionStressFromForces } from '../section-stress-3d';
import type { Section } from '../../store/model.svelte';

const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = resolve(here, '../../../../../engine/tests/fixtures/section-stress-parity.json');
const fx = JSON.parse(readFileSync(fixturePath, 'utf-8')) as {
  section: Record<string, number | string>;
  cases: Array<Record<string, number | string>>;
};

const section = { id: 1, name: 'parity-rect', ...fx.section } as unknown as Section;

describe('section-stress Rust↔TS parity (shared fixture)', () => {
  for (const c of fx.cases) {
    it(c.name as string, () => {
      const r = analyzeSectionStressFromForces(
        c.N as number, c.Vy as number, c.Vz as number,
        c.Mx as number, c.My as number, c.Mz as number,
        section, undefined, c.yFiber as number, c.zFiber as number,
      );
      expect(r.sigmaAtFiber).toBeCloseTo(c.expectSigmaMpa as number, 1);
      if (c.expectTauVzMpa !== undefined) {
        expect(Math.abs(r.tauVzAtFiber)).toBeCloseTo(c.expectTauVzMpa as number, 1);
      }
      if (c.expectTauVyMpa !== undefined) {
        expect(Math.abs(r.tauVyAtFiber)).toBeCloseTo(c.expectTauVyMpa as number, 1);
      }
    });
  }
});
