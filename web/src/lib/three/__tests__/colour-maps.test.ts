import { describe, expect, it } from 'vitest';
import { colourFor } from '../colour-maps';
import { shellContourColor } from '../shell-contour-colour';

describe('colour maps', () => {
  it('keeps the app shell ramp as the default', () => {
    expect(colourFor('shell', 0.3, 0, 1)).toBe(shellContourColor(0.3, 0, 1));
  });
  it('sequential runs from dark to light and clamps', () => {
    const lum = (h: number) => ((h >> 16) & 255) * 0.299 + ((h >> 8) & 255) * 0.587 + (h & 255) * 0.114;
    const vals = [0, 0.25, 0.5, 0.75, 1].map((t) => lum(colourFor('sequential', t, 0, 1)));
    for (let i = 1; i < vals.length; i++) expect(vals[i]).toBeGreaterThan(vals[i - 1]);
    expect(colourFor('sequential', 2, 0, 1)).toBe(colourFor('sequential', 1, 0, 1));
  });
  it('diverging is symmetric about zero with a neutral centre', () => {
    expect(colourFor('diverging', 0, -3, 1)).toBe(0x5b6b78);
    expect(colourFor('diverging', -3, -3, 1)).toBe(0x2c6cb4);
    expect(colourFor('diverging', 3, -3, 1)).toBe(0xe5482a);
  });
});
