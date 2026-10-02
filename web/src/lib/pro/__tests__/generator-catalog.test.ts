/** The Generators panel's list: every generator once, each with a sample, none covered twice. */
import { describe, it, expect } from 'vitest';
import { COVERED_STRUCTURE_KINDS, GENERATOR_CATALOG, sampleOf } from '../generator-catalog';
import { STRUCTURE_KINDS } from '../../engine/generators/structures';

const entries = GENERATOR_CATALOG.flatMap((c) => c.entries);

describe('generator catalogue', () => {
  it('lists every generator once, and every structure kind but the covered ones', () => {
    expect(new Set(entries.map((e) => e.id)).size).toBe(entries.length);
    for (const k of ['truss', 'column', 'shed']) expect(entries.some((e) => e.id === k)).toBe(true);
    const listed = entries.filter((e) => e.kind === 'structure').map((e) => e.structureKind);
    expect([...listed, ...COVERED_STRUCTURE_KINDS].sort()).toEqual([...STRUCTURE_KINDS].sort());
  });

  it('draws a sample for each', () => {
    for (const e of entries) {
      const t = sampleOf(e);
      expect(t, e.id).not.toBeNull();
      expect(t!.members.length, e.id).toBeGreaterThan(0);
    }
  });
});
