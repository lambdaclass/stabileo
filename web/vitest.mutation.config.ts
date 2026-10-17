/**
 * The test set Stryker runs against each mutant (stryker.config.json).
 *
 * The full unit pass is 13 000 tests and several minutes; Stryker's dry run alone timed out on
 * it. These are the suites that exercise the modules stryker.config.json mutates — the
 * differential tests, the gate, the findings, the design contract and the CIRSOC 201 / 301 /
 * footing suites. A survivor here is a mutant none of them notices.
 */
import { defineConfig, mergeConfig } from 'vitest/config';
import base from './vite.config';

const { test: _test, ...rest } = base as Record<string, unknown>;

export default mergeConfig(rest, defineConfig({
  test: {
    setupFiles: ['./vitest.setup.ts'],
    pool: 'threads',
    testTimeout: 30_000,
    exclude: ['**/node_modules/**', '**/dist/**', 'e2e/**', '**/.stryker-tmp/**'],
    include: [
      'src/lib/engine/__tests__/differential/**/*.test.ts',
      'src/lib/engine/__tests__/cirsoc201-engine-gate*.test.ts',
      'src/lib/engine/__tests__/cirsoc201-beam-kernel.test.ts',
      'src/lib/engine/__tests__/ts-logic-findings.test.ts',
      'src/lib/engine/__tests__/design-check-results.test.ts',
      'src/lib/engine/__tests__/beam-shear-2025.test.ts',
      'src/lib/engine/__tests__/doubly-reinforced-capacity-balances.test.ts',
      'src/lib/engine/__tests__/auto-verify*.test.ts',
      'src/lib/engine/codes/argentina/__tests__/**/*.test.ts',
      'src/lib/engine/design/__tests__/**/*.test.ts',
      'src/lib/engine/detailing/__tests__/foundation*.test.ts',
      'src/lib/engine/detailing/__tests__/punching*.test.ts',
      'src/lib/codes/cirsoc201/__tests__/**/*.test.ts',
    ],
  },
}));
