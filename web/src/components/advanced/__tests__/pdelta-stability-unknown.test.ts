import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import { setLocale } from '../../../lib/i18n';

const base = { converged: true, iterations: 4, b2Factor: NaN, results: { displacements: [] }, linearResults: { displacements: [] } };

describe('the P-Δ summary when the first-mode check could not run', () => {
  it('says the stability is not checked, never stable', async () => {
    setLocale('en');
    const { default: Summary } = await import('../PDeltaSummary.svelte');
    const body = render(Summary, { props: { result: { ...base, isStable: null, secondOrder: { lambda1: null, b2: NaN, bucklingError: 'eigen solver did not converge' } } } as never }).body;
    const stability = /data-testid="pdelta-stability">([^<]*)</.exec(body)?.[1];
    expect(stability).toBe('stability not checked');
    expect(body).toContain('data-testid="pdelta-first-mode-failed"');
  });

  it('a checked result still reads stable or unstable', async () => {
    setLocale('en');
    const { default: Summary } = await import('../PDeltaSummary.svelte');
    const read = (isStable: boolean) => /data-testid="pdelta-stability">([^<]*)</.exec(render(Summary, { props: { result: { ...base, b2Factor: 1.2, isStable, secondOrder: { lambda1: 6, b2: 1.2 } } } as never }).body)?.[1];
    expect(read(true)).toBe('stable');
    expect(read(false)).toBe('unstable');
  });
});
