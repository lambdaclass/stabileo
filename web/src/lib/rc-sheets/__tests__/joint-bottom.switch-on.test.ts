import { describe, it, expect } from 'vitest';
import { mostBottom } from '../joints';

describe('the bottom bars a beam brings to its joints', () => {
  it('are those of its section that holds most, not the span\'s', () => {
    const at = (s: 'start' | 'span' | 'end') => ({ top: [], bottom: s === 'end' ? [{ count: 4, dia: 20 }] : [{ count: 2, dia: 12 }] });
    expect(mostBottom(at)).toEqual([{ count: 4, dia: 20 }]);
  });
});
