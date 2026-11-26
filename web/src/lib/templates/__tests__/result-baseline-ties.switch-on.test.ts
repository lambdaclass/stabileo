import { describe, it, expect } from 'vitest';
import { sameRows } from './result-baseline';

const HEAD = ['table', 'component', 'unit', 'extreme', 'value', 'entity', 'end', 'x [m]', 'source', 'sourceId', 'sourceName'];
const row = (extreme: string, value: number, entity: string) => ['shells', 'topVonMises', 'kN/m²', extreme, value, entity, '', '', 'combination', 6, '1.2 D'];

describe('a baseline\'s maxima', () => {
  it('hold an extreme that is round-off by its value alone, and any other by where it occurs too', () => {
    const want = [HEAD, row('max', 4121.58, 'quad 45'), row('min', 2.7e-30, 'quad 357')];
    expect(() => sameRows('m', [HEAD, row('max', 4121.58, 'quad 45'), row('min', 0, 'quad 568')], want)).not.toThrow();
    expect(() => sameRows('m', [HEAD, row('max', 4121.58, 'quad 46'), row('min', 2.7e-30, 'quad 357')], want)).toThrow(/row 1 "entity"/);
    expect(() => sameRows('m', [HEAD, row('max', 4121.58, 'quad 45'), row('min', 1e-3, 'quad 568')], want)).toThrow(/row 2 "value"/);
  });
});
