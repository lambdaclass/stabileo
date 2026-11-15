import { describe, expect, it } from 'vitest';
import { plasticReading } from '../certificate-read';
import type { PlasticCertificate } from '../certificate-types';

const cert = (lambdaLower: number | null, lambdaUpper: number | null) => ({ lambdaLower, lambdaUpper }) as PlasticCertificate;

describe('the collapse factor read against its certificate', () => {
  it('a factor a few ulps past the upper bound is within, as the engine releases it', () => {
    const r = plasticReading(cert(249.99999999999, 249.99999999999994), 250);
    expect(r.within).toBe(true);
    expect(r.deviation).toBeLessThan(1e-12);
  });

  it('a factor clearly outside the enclosure is not', () => {
    const r = plasticReading(cert(240, 245), 250);
    expect(r.within).toBe(false);
    expect(r.deviation).toBeCloseTo(0.02, 12);
  });

  it('no bounds give no verdict', () => {
    expect(plasticReading(cert(null, null), 250).within).toBeNull();
  });
});
