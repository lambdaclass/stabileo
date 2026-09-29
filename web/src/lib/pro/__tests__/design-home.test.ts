import { describe, it, expect } from 'vitest';
import { designHome } from '../design-home';

const steel = { id: 1, name: 'F-24', fy: 240, e: 200000, gradeId: 'iram-f24' };
const concrete = { id: 2, name: 'H-30', fy: 30, e: 27000 };
const mats = new Map<number, unknown>([[1, steel], [2, concrete]]);

describe('where Design opens', () => {
  it('steel design for a mostly steel model, the concrete workflow otherwise', () => {
    expect(designHome([{ materialId: 1 }, { materialId: 1 }, { materialId: 2 }], mats)).toBe('steel');
    expect(designHome([{ materialId: 2 }, { materialId: 2 }, { materialId: 1 }], mats)).toBe('design');
    expect(designHome([], mats)).toBe('design');
  });
});
