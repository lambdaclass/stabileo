import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { forcePeakScale } from '../member-force-extrema';
import type { ElementForces } from '../types';

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

it('known wrong result: #2581 the axial label and colour share the signed peak for a member with axial force 0 to 10', () => {
  const member: ElementForces = {
    elementId: 1, length: 2, nStart: 0, nEnd: 10, vStart: 0, vEnd: 0, mStart: 0, mEnd: 0,
    qI: 0, qJ: 0, hingeStart: false, hingeEnd: false, pointLoads: [], distributedLoads: [],
  };
  const scale = forcePeakScale([member, { ...member, elementId: 2, nEnd: -10 }], 'axial', 'signed');
  expect(scale).toEqual({ max: 10, values: new Map([[1, 10], [2, -10]]) });

  const source = readFileSync(new URL('../../../components/Viewport.svelte', import.meta.url), 'utf8');
  const paintAndLabels = source.slice(source.indexOf('let axial:'), source.indexOf('// Draw supports, unless'));
  expect(paintAndLabels).toMatch(/const scale = forcePeakScale\([^\n]*'axial', 'signed'\);\s*axial = scale\.values;/);
  expect(paintAndLabels).toMatch(/for \(const \[(\w+), (\w+)\] of (\w+)\)[\s\S]*?colorMapOverrides\.set\(\1, mix\([\s\S]*?for \(const \[(\w+), (\w+)\] of \3\)[\s\S]*?drawMemberValueLabel\(\4, [^\n]*fixedQuantity\(\5,/);
});

it('known wrong result: #2581 remaining force consumers use the shared extrema and concurrency paths', () => {
  const sourceOf = (file: string) => readFileSync(new URL(file, import.meta.url), 'utf8');
  for (const file of ['../design/sway.ts', '../direct-analysis.ts', '../verification-service.ts']) {
    expect.soft(sourceOf(file), file).not.toMatch(/Math\.(?:max|min)\([^;\n]*(?:\b[ij]\.(?:n|m[yz]|v[yz])\b|\b[ij] \?\? 0)/);
  }
  const tables = sourceOf('../report/calc-report-extra.ts');
  expect.soft(tables).not.toContain('bindMemberEnvelopeEnds');
  const heatmap = sourceOf('../../three/stress-heatmap.ts');
  expect.soft(heatmap).toContain('requireConcurrentSectionForces');
  expect.soft(heatmap).toContain('sampleMemberResultant3D(resultantSources(ef), kinds, heatmapStations)');
});
