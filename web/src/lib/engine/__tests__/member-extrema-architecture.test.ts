import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

it.skip('known wrong result: #2581 force peak consumers do not reduce member ends', () => {
  const files = [
    '../../../components/Viewport.svelte',
    '../calc-report.ts',
    '../report/calc-report-extra.ts',
    '../../export/excel.ts',
    '../../store/results.svelte.ts',
  ];
  const violations = files.flatMap(file => {
    const source = readFileSync(new URL(file, import.meta.url), 'utf8');
    return source.split('\n').flatMap((line, i) =>
      /Math\.(?:max|min)\([^;]*(?:\b[ij]\.[nmv][xyz]?\b|Math\.abs\([ijnvmt][ij]?\)|\.[nmv][xyz]?(?:Start|End))/.test(line)
        ? [file + ':' + (i + 1)] : []);
  });
  expect(violations).toEqual([]);
});
