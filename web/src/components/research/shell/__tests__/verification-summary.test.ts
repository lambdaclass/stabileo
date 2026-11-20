import { expect, it } from 'vitest';
import { render } from 'svelte/server';
import VerificationSummary from '../VerificationSummary.svelte';

it('marks a comparison with failing checks instead of showing it as passed', () => {
  const partial = render(VerificationSummary, { props: { reference: { kind: 'checks', passed: 8, total: 8 }, published: { kind: 'checks', passed: 14, total: 17, href: '#checks' } } }).body;
  expect(partial).toContain('14 of 17 checks pass');
  expect(partial).toMatch(/class="fail[^"]*"[^>]*>✗/);
  expect(partial.match(/class="ok[ "]/g)).toHaveLength(1);
  const full = render(VerificationSummary, { props: { reference: { kind: 'checks', passed: 3, total: 3 }, published: { kind: 'checks', passed: 2, total: 2 } } }).body;
  expect(full).not.toContain('✗');
});
