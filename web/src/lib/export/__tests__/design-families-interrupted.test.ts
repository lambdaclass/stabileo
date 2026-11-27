import { afterEach, expect, it, vi } from 'vitest';
import { designRunStore } from '../../store/design-run.svelte';
import { detailingStore } from '../../store/detailing.svelte';
import { verificationStore } from '../../store/verification.svelte';
import { designFamiliesWithWorkerYields, familyOf, ready } from './design-families-fixture';

afterEach(() => { vi.restoreAllMocks(); });

it.each(['sync', 'worker'] as const)('known wrong result: #1927 — %s reports only pieces reached in this frame invocation', async (entry) => {
  await ready('rc-qa-diagnostic');
  const families = ['column', 'beam'] as const;
  const run = (maxRunMs?: number) => entry === 'sync'
    ? designRunStore.designFamilies(families, { maxRunMs })
    : designFamiliesWithWorkerYields([...families], { maxRunMs });
  let now = 0;
  const clock = vi.spyOn(performance, 'now').mockImplementation(() => now);
  const full = await run();
  expect(full.ok).toBe(true);
  for (const f of families) expect(familyOf(full, f).processed).toBeGreaterThan(0);
  expect(familyOf(full, 'column').designed).toBeGreaterThan(0);
  clock.mockImplementation(() => ++now);
  const detail = vi.spyOn(detailingStore, 'generate');
  const empty = await run(0);
  expect(verificationStore.runSummary?.aborted).toBe(true);
  expect(empty.ok).toBe(false);
  for (const f of families) expect(familyOf(empty, f)).toMatchObject({
    state: 'failed', processed: 0, designed: 0, refused: 0, notModelled: 0, errorKey: 'design.cmd.truncated',
  });
  clock.mockImplementation(() => now);
  const adapter = designRunStore.currentAdapter()!;
  const verify = adapter.verify.bind(adapter);
  vi.spyOn(adapter, 'verify').mockImplementation((ctx, bars) => {
    if (designRunStore.phase === 'autoDesign') now++;
    return verify(ctx, bars);
  });
  const partial = await run(0);
  expect(partial.ok).toBe(false);
  expect(familyOf(partial, 'column').processed).toBe(1);
  expect(familyOf(partial, 'beam').processed).toBe(0);
  expect(detail).not.toHaveBeenCalled();
});

it.each(['sync', 'worker'] as const)('known wrong result: #1927 — review withholds undetailed %s family results after interruption', async entry => {
  await ready('rc-qa-diagnostic');
  let now = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  const adapter = designRunStore.currentAdapter()!;
  const verify = adapter.verify.bind(adapter);
  vi.spyOn(adapter, 'verify').mockImplementation((ctx, bars) => {
    if (designRunStore.phase === 'autoDesign' && ctx.elementType === 'beam') now++;
    return verify(ctx, bars);
  });
  const report = entry === 'sync' ? designRunStore.designFamilies(['column', 'beam'], { maxRunMs: 0 })
    : await designFamiliesWithWorkerYields(['column', 'beam'], { maxRunMs: 0 });
  expect(report.ok).toBe(false);
  expect(familyOf(report, 'column')).toMatchObject({ state: 'failed', designed: 0, errorKey: 'design.cmd.truncated', errorParams: { notReached: 0 } });
  expect(familyOf(report, 'column').processed).toBeGreaterThan(0);
  expect(familyOf(report, 'beam').errorParams?.notReached).toBe(verificationStore.runSummary!.notReached);
});

it.each(['autoDesign', 'designAll'] as const)('known wrong result: #1927 — %s returns a translated interruption', async (command) => {
  await ready('rc-qa-diagnostic');
  expect(designRunStore.computeDemands().ok).toBe(true);
  let now = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => ++now);
  const result = command === 'designAll' ? designRunStore.designAll({ maxRunMs: 0 })
    : designRunStore.autoDesign(verificationStore.contexts.keys(), { maxRunMs: 0 });
  expect(verificationStore.runSummary?.notReached).toBeGreaterThan(0);
  expect(result).toMatchObject({ ok: false, reasonKey: 'design.cmd.truncated' });
});
