/**
 * Imperfections, staged construction and creep keep their results in the Advanced panel.
 *
 * Each of them used to call `resultsStore.setResults3D`, which replaces the project's results:
 * it cleared every solved case, combination, envelope and governing set and bumped the solve
 * generation, so running one wiped the combinations, the report printed it as the analysis
 * results and design went stale. Staged construction published member forces that are wrong
 * besides (see `staged-final-state.test.ts`). The panel shows each one's peaks instead, as it
 * did before they were published.
 *
 * A source-level guard: the handlers live in a Svelte component, and what matters is that none
 * of them writes to the results store at all.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const source = readFileSync(fileURLToPath(new URL('../../../components/pro/ProAdvancedTab.svelte', import.meta.url)), 'utf8');

/** The body of `function name()`, comments stripped so the explanatory notes do not match. */
function body(name: string): string {
  const start = source.indexOf(`function ${name}(`);
  expect(start, `${name} not found`).toBeGreaterThanOrEqual(0);
  let depth = 0;
  let i = source.indexOf('{', start);
  const open = i;
  for (; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}' && --depth === 0) break;
  }
  return source.slice(open, i + 1).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

describe('Advanced panel analyses that leave the project results alone', () => {
  for (const name of ['handleImperfections', 'handleStaged', 'handleCreep']) {
    it(`${name} keeps its result in the panel`, () => {
      const b = body(name);
      expect(b).not.toMatch(/resultsStore\s*\.\s*set/);
      expect(b).toMatch(/(imperfResult|stagedResult|creepResult)\s*=/);
    });
  }
});
