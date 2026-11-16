import { expect } from 'vitest';

export function expectWindTips(displacements: Array<{ nodeId: number; ux: number; uy?: number }>, tips: number[], component: 'ux' | 'uy', expected: number, digits: number) {
  for (const d of displacements) if (tips.includes(d.nodeId)) expect(d[component]).toBeCloseTo(expected, digits);
}
