import { expect, it } from 'vitest';
import { numEntry } from '../dynamics/num-entry';

it('a number in range is taken, with a decimal comma too', () => {
  const field = { value: '2,5' };
  expect(numEntry(field, 1, 0, 10)).toBe(2.5);
  expect(field.value).toBe('2,5');
});

for (const raw of ['-3', '11', '', 'abc', 'Infinity']) {
  it(`"${raw}" is refused and the field shows the value the calculation still uses`, () => {
    const field = { value: raw };
    expect(numEntry(field, 4, 0, 10)).toBeNull();
    expect(field.value).toBe('4');
  });
}
