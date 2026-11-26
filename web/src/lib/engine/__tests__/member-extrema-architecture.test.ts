import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

it('known wrong result: #2581 force peak consumers do not reduce member ends', () => {
  const files = [
    '../../../components/Viewport.svelte',
    '../calc-report.ts',
    '../report/calc-report-extra.ts',
    '../../export/excel.ts',
    '../../store/results.svelte.ts',
    '../../viewport3d/results-sync.ts',
    '../governing-case.ts',
    '../section-stress-3d.ts',
  ];
  const violations = files.flatMap(file => {
    const source = readFileSync(new URL(file, import.meta.url), 'utf8');
    return source.split('\n').flatMap((line, i) =>
      /Math\.(?:max|min)\([^;]*(?:\b[ij]\.[nmv][xyz]?\b|Math\.abs\((?:[ij]|[nmvt][ij])\)|\.[nmv][xyz]?(?:Start|End)|memberEnd(?:Sections|Forces)[23]D)/.test(line)
        ? [file + ':' + (i + 1)] : []);
  });
  expect(violations).toEqual([]);
});

it('the planar viewport uses the shared member scale for paint and legend', () => {
  const source = readFileSync(new URL('../../../components/Viewport.svelte', import.meta.url), 'utf8');
  const colourMap = source.slice(source.indexOf("dtNow() === 'colorMap'"), source.indexOf('// Pre-compute bar count'));
  expect(colourMap).toMatch(/const scale = forcePeakScale\([\s\S]*?globalMax = scale\.max;\s*elemMaxes = scale\.values;/);
  expect(colourMap).toContain('colourRampCss(val / globalMax)');
  expect(colourMap).toContain('{ max: globalMax, unit: colourMapUnit(kind)');
});
