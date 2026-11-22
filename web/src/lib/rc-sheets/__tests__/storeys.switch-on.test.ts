import { describe, it, expect } from 'vitest';
import { FOUNDATIONS, levelOfStorey, storeyLabel, storeyOf, storeysUp } from '../storeys';

const order = ['P0', 'P1', 'P2', 'P3'];
const t = (k: string) => (k === 'rcSheets.storey.foundations' ? 'Fundaciones' : k);

describe('the storey a member is read in', () => {
  it('a column or wall in the one it stands on, a beam, slab or punching joint in the one under its floor, the lowest floor\'s in the foundations', () => {
    expect(storeyOf('column', 'P0', order)).toBe('P0');
    expect(storeyOf('wall', 'P2', order)).toBe('P2');
    expect(storeyOf('pier', 'P1', order)).toBe('P1');
    expect(storeyOf('beam', 'P1', order)).toBe('P0');
    expect(storeyOf('line', 'P3', order)).toBe('P2');
    expect(storeyOf('slab', 'P1', order)).toBe('P0');
    expect(storeyOf('punching', 'P2', order)).toBe('P1');
    expect(storeyOf('beam', 'P0', order)).toBe(FOUNDATIONS);
    expect(storeyOf('footing', undefined, order)).toBe(FOUNDATIONS);
    expect(storeyOf('beam', '+7.30', order)).toBe('+7.30');
    expect(storeyOf('column', undefined, order)).toBe('');
  });

  it('goes back to the level a family stands at or carries, lists the storeys from the foundations up, and names them as drawings do', () => {
    expect(levelOfStorey('slab', 'P0', order)).toBe('P1');
    expect(levelOfStorey('line', FOUNDATIONS, order)).toBe('P0');
    expect(levelOfStorey('column', 'P2', order)).toBe('P2');
    expect(storeysUp(['P2', FOUNDATIONS, 'P0', '+9', 'P1', 'P0'], order)).toEqual([FOUNDATIONS, 'P0', 'P1', 'P2', '+9']);
    expect([FOUNDATIONS, 'P0', ''].map((s) => storeyLabel(s, t))).toEqual(['Fundaciones', 's/P0', '—']);
  });
});
