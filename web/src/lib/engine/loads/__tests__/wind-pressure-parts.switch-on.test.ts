/**
 * A wind pressure that grows with height reaches a member as a few loads that carry its four work
 * moments (the same fix as #2529 on main, here so the gallery's buildings open with their wind).
 */
import { it, expect } from 'vitest';
import { integrateWindPressure } from '../wind-pressure-field';

it('a storey column under a CIRSOC 102 pressure takes a few loads that carry its four work moments', () => {
  const z0 = 2.8, length = 2.8, knee = 5 - z0;
  const p = (s: number) => 0.62 * (Math.max(5, z0 + s) / 365.76) ** (2 / 7);
  const parts = integrateWindPressure(length, [knee], p);
  expect(parts.length).toBeLessThanOrEqual(4);
  for (const part of parts) expect(Math.min(part.q, part.qJ)).toBeGreaterThan(0);
  const exact = (k: number) => {
    const n = 200_000, h = length / n;
    let sum = 0;
    for (let i = 0; i <= n; i++) { const s = i * h; sum += (i === 0 || i === n ? 1 : i % 2 ? 4 : 2) * s ** k * p(s); }
    return (sum * h) / 3;
  };
  for (const k of [0, 1, 2, 3]) {
    const actual = parts.reduce((sum, q) => {
      const slope = (q.qJ - q.q) / (q.b - q.a), intercept = q.q - slope * q.a;
      return sum + intercept * (q.b ** (k + 1) - q.a ** (k + 1)) / (k + 1) + slope * (q.b ** (k + 2) - q.a ** (k + 2)) / (k + 2);
    }, 0);
    expect(actual).toBeCloseTo(exact(k), 8);
  }
});
