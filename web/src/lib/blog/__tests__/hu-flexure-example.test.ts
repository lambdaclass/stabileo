import { expect, it } from 'vitest';
import body from '../translations/hu/verificacion-flexion-cirsoc-201';
import { computeFlexureCapacity } from '../../engine/station-design-forces';
it.skip('known wrong result: #1916 T103 — each printed bar example uses its actual effective depth', () => {
  const table = body.blocks.find(b => b.k === 'table' && b.rows.some(r => r.includes('2 Ø32')));
  expect(table?.k).toBe('table');
  if (table?.k !== 'table') throw new Error('missing bar examples');
  for (const row of table.rows) {
    const diameter = Number(row[1].match(/Ø(\d+)/)![1]);
    const d = (400 - 25 - 8 - diameter / 2) / 1000;
    const cap = computeFlexureCapacity(2 * Math.PI * (diameter / 10) ** 2 / 4, 0.2, d, 25, 420, 0, 0, 0, 0, { h: 0.4, edition: '2025' })!;
    expect(Number(row[2].replace(',', '.'))).toBe(Number((cap.epsilonT * 1000).toFixed(2)));
    expect(Number(row[4].replace(',', '.'))).toBe(Number(cap.phiMn.toFixed(2)));
  }
  expect(JSON.stringify(body)).toContain('35,7');
});
it.skip('known wrong result: #1916 T102 — over-reinforced example is explicitly refused', () => {
  expect(JSON.stringify(body)).toContain('Nem felel meg');
  expect(JSON.stringify(body)).not.toContain('Egy túlvasalt keresztmetszet nem bukik el');
});
