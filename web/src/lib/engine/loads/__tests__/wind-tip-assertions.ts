import { expect } from 'vitest';

export function expectWindTips(displacements: Array<{ nodeId: number; ux: number; uy?: number }>, tips: number[], component: 'ux' | 'uy', expected: number, digits: number) {
  expect(tips.length).toBeGreaterThan(0);
  for (const id of tips) {
    const rows = displacements.filter(d => d.nodeId === id);
    expect(rows).toHaveLength(1);
    expect(rows[0]![component]).toBeCloseTo(expected, digits);
  }
}

export function expectHeightCarrierTips(displacements: Array<{ nodeId: number; ux: number; uy?: number }>, tips: number[], component: 'ux' | 'uy', expected: (id: number) => number, digits: number) {
  expect(tips.length).toBeGreaterThan(0);
  for (const id of tips) expectWindTips(displacements, [id], component, expected(id), digits);
}
