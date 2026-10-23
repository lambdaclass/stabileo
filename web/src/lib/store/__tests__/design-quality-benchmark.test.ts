import { expect, it } from 'vitest';
import { frameDesignQuality } from './design-quality-fixture';

// Opt-in end-to-end benchmark: STABILEO_DESIGN_BENCHMARK=1 npx vitest run --project unit src/lib/store/__tests__/design-quality-benchmark.test.ts
it.runIf(process.env.STABILEO_DESIGN_BENCHMARK === '1')('measures the designed and detailed frame', async () => {
  const { output } = await frameDesignQuality();
  expect(output.aborted).toBe(false);
  expect(output.notReached).toBe(0);
  expect(Object.values(output.counts).reduce((a, b) => a + b, 0)).toBe(408);
  expect(output.assemblies).toBeGreaterThan(0);
  console.log(JSON.stringify(output));
}, 600_000);
