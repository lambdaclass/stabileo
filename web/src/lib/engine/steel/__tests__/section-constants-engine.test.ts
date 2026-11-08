import { describe, it, expect } from 'vitest';
import { cirsoc301InputsRequest } from '../cirsoc301-inputs';
import type { SteelSectionConstants } from '../section-constants';
import { ALL_PROFILES, familyToShape } from '../../../data/steel-profiles';

const engine = (s: object) => cirsoc301InputsRequest<SteelSectionConstants>('sectionConstants', 'section constants', s);

const plateJ = (plates: Array<[number, number]>) => plates.reduce((sum, [len, t]) => sum + len * t * t * t / 3, 0);

function channel(b: number, h: number, tw: number, tf: number, iz: number) {
  const h0 = h - tf, bp = b - tw / 2;
  const e0 = 3 * bp * bp * tf / (6 * bp * tf + h0 * tw);
  const cw = tf * bp * bp * bp * h0 * h0 / 12 * (2 - 3 * e0 / bp);
  const parts: Array<[number, number]> = [[b * tf, b / 2], [b * tf, b / 2], [(h - 2 * tf) * tw, tw / 2]];
  const xBar = parts.reduce((s, [a, x]) => s + a * x, 0) / parts.reduce((s, [a]) => s + a, 0);
  return { cw, c: (h0 / 2) * Math.sqrt(iz / cw), sy: iz / (b - xBar) };
}

const rel = (a: number | undefined, b: number, tol: number) => expect(Math.abs((a! - b) / b), `${a} against ${b}`).toBeLessThanOrEqual(tol);

const PLATED = ALL_PROFILES.filter((p) => p.tw && p.tf && ['I', 'H', 'U'].includes(familyToShape(p.family)));

describe('section constants from the engine, against the closed forms written out independently', () => {
  it('covers the catalogue', () => {
    expect(PLATED.length).toBeGreaterThan(80);
  });

  it.each(PLATED.map((p) => [p.name, p] as const))('%s', (_name, p) => {
    const [b, h, tw, tf, iz] = [p.b / 1000, p.h / 1000, p.tw! / 1000, p.tf! / 1000, p.iz * 1e-8];
    const shape = familyToShape(p.family);
    const k = engine({ shape, b, h, tw, tf, iz });
    if (shape === 'U') {
      const ref = channel(b, h, tw, tf, iz);
      expect(k.jBasis).toBe('none');
      rel(k.Cw, ref.cw, 1e-13);
      rel(k.c, ref.c, 1e-13);
      rel(k.Sy, ref.sy, 1e-13);
    } else {
      expect(k.jBasis).toBe('thinWalled');
      rel(k.J, plateJ([[b, tf], [b, tf], [h - 2 * tf, tw]]), 1e-14);
      rel(k.Cw, iz * (h - tf) * (h - tf) / 4, 1e-15);
      expect(k.c).toBeUndefined();
      expect(k.Sy).toBeUndefined();
    }
  });
});
