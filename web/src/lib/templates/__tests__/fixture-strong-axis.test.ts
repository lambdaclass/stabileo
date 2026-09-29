/**
 * Every I, H or U section in the bundled fixtures states its strong axis as `iy` (the b·h³/12
 * term). The industrial shed carried its crane girder and purlins crossed, so the girder was
 * analysed about 28 times too flexible and read 362 %.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';

const DIR = new URL('../fixtures/', import.meta.url);

describe('fixture sections', () => {
  it('state the strong axis as iy on every deep I, H and U', () => {
    const crossed: string[] = [];
    let read = 0;
    for (const f of readdirSync(DIR).filter((n) => n.endsWith('.json'))) {
      const j = JSON.parse(readFileSync(new URL(f, DIR), 'utf8'));
      const sections = (j.sections ?? j.model?.sections ?? []) as Array<{ name?: string; shape?: string; h?: number; b?: number; iy?: number; iz?: number }>;
      for (const s of Array.isArray(sections) ? sections : []) {
        if (!['I', 'H', 'U'].includes(s.shape ?? '') || !s.h || !s.b || s.h <= s.b * 1.2 || !s.iy || !s.iz) continue;
        read++;
        if (s.iy < s.iz) crossed.push(`${f}: ${s.name}`);
      }
    }
    expect(read, 'the test must read sections').toBeGreaterThan(10);
    expect(crossed).toEqual([]);
  });
});
