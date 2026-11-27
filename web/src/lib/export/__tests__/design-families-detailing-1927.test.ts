import { afterEach, expect, it, vi } from 'vitest';
import { designRunStore } from '../../store/design-run.svelte';
import { detailingStore } from '../../store/detailing.svelte';
import { designFamiliesWithWorkerYields, familyOf, ready } from './design-families-fixture';

afterEach(() => vi.restoreAllMocks());

it.each(['sync', 'worker'] as const)('known wrong result: #1927 — %s cannot count undetailed reinforcement after a detailing failure', async entry => {
  await ready('rc-qa-diagnostic');
  const detail = vi.spyOn(detailingStore, 'generate').mockReturnValue(null);
  const report = entry === 'sync' ? designRunStore.designFamilies(['column'])
    : await designFamiliesWithWorkerYields(['column']);
  expect(detail).toHaveBeenCalledTimes(1);
  expect.soft(report.ok).toBe(false);
  expect(familyOf(report, 'column')).toMatchObject({ state: 'failed', designed: 0 });
});
