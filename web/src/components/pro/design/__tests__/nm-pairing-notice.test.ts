import { readFileSync } from 'node:fs';
import { afterEach, expect, it } from 'vitest';
import { render } from 'svelte/server';
import NmPairingNotice from '../NmPairingNotice.svelte';
import { verificationStore } from '../../../../lib/store/verification.svelte';
import { buildDesignSummary, normalizeCirsoc201 } from '../../../../lib/engine/design-check-results';
import { t } from '../../../../lib/i18n';

const column = (elementId: number, axialCombo: number) => ({
  elementId, elementType: 'column', Mu: 80, Vu: 10, Nu: 500,
  b: 0.3, h: 0.3, fc: 25, fy: 420, cover: 0.025,
  flexure: { Mu: 80, AsReq: 8, AsMin: 2, AsProv: 10, phiMn: 150, ratio: 0.5, status: 'ok', steps: [] },
  shear: { Vu: 10, phiVc: 50, phiVn: 100, ratio: 0.1, status: 'ok', steps: [], AvPerS: 0, spacing: 0.15 },
  column: { Nu: 500, Mu: 80, phiPn: 800, phiMn: 100, ratio: 0.62, status: 'ok', AsProv: 12, steps: [], spacing: 0.15, bars: '4φ16' },
  overallStatus: 'ok',
  governingCombos: { flexure: { comboId: 3, comboName: '1.2D+1.0L+1.6W' }, axial: { comboId: axialCombo, comboName: axialCombo === 3 ? '1.2D+1.0L+1.6W' : '1.2D+1.6L' } },
}) as never;

afterEach(() => verificationStore.clear());

it('explains a mixed-combination N-M row beside the member, and says nothing for a paired one (#1316)', () => {
  const results = normalizeCirsoc201([column(1, 1), column(2, 3)], new Map());
  verificationStore.setDesignResults(results, buildDesignSummary(results, 'cirsoc', 'CIRSOC 201'));
  const html = render(NmPairingNotice, { props: { elementId: 1 } }).body;
  expect(html).toMatch(/<div[^>]*role="alert"[^>]*data-testid="nm-pairing-1"/);
  expect(t('knownIssue.RC-NM-PAIRING')).not.toBe('knownIssue.RC-NM-PAIRING');
  expect(html).toContain(t('knownIssue.RC-NM-PAIRING').replace(/'/g, '&#39;'));
  expect(html).toContain('(#1316)');
  expect(html).toContain('N 1.2D+1.6L · M 1.2D+1.0L+1.6W');
  expect(render(NmPairingNotice, { props: { elementId: 2 } }).body).not.toContain('nm-pairing');
});

it('is shown in the member detail whether or not the member has provided steel', () => {
  const source = readFileSync(new URL('../VerificationDetail.svelte', import.meta.url), 'utf8');
  const notice = source.indexOf('<NmPairingNotice {elementId} />');
  expect(notice).toBeGreaterThan(0);
  expect(notice).toBeLessThan(source.indexOf('{#if provided && provided.checks.length > 0}'));
});
