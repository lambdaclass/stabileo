import { describe, expect, it, vi } from 'vitest';
import { CodedRefusal } from '../../containment-error';

const buckling = vi.hoisted(() => ({ impl: (): unknown => ({ modes: [] }) }));
vi.mock('../../wasm-solver', async (orig) => ({ ...(await orig<object>()), solveBuckling: () => buckling.impl() }));

import { engineLambda1 } from '../run-pdelta';
import { column } from './fixtures';

const both = new Error(JSON.stringify({ message: 'withheld', structuredDiagnostics: [
  { code: 'no_compressed_elements', severity: 'error', message: 'coded' },
  { code: 'known_issue', severity: 'error', phase: 'BU-BOUND', value: 741, message: 'withheld' },
] }));

describe('λ₁ of the P-Δ comparison', () => {
  it('is ∞ for the coded "no compressed elements" refusal', () => {
    buckling.impl = () => { throw new CodedRefusal('nothing to buckle', 'no_compressed_elements'); };
    expect(engineLambda1(column('fixed', null, 4, 100))).toBe(Infinity);
  });

  it('is unknown, not ∞, when that refusal also carries a containment refusal', () => {
    buckling.impl = () => { throw both; };
    expect(engineLambda1(column('fixed', null, 4, 100))).toBeNull();
  });
});
