import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { axesStore } from '../axes.svelte';
import { makeFrame, DEFAULT_AXES } from '../frame';
import { axesStatement } from '../statement';
import { kinDofSymbol } from '../../engine/kinematic-report';
import { userAxesSection } from '../../ai/capabilities/build-model';
import { fragmentFromCode, fragmentToCode } from '../../model/edit/fragment-code';
import type { Fragment } from '../../model/edit/fragment';

afterEach(() => axesStore.reset());

const SRC = join(__dirname, '..', '..', '..');
const read = (p: string) => readFileSync(join(SRC, p), 'utf8');

describe('imports, exports and reports go through the user frame', () => {
  const seam: Array<[string, RegExp]> = [
    ['lib/excel-import/parse.ts', /axes\/frame'/],
    ['lib/excel-import/template.ts', /axes\/axes\.svelte'/],
    ['lib/export/workbook-model.ts', /workbook-frame'/],
    ['lib/export/workbook-results.ts', /workbook-frame'/],
    ['lib/export/project-workbook.ts', /axes\/statement'/],
    ['lib/store/project-workbook.ts', /axes\/axes\.svelte'/],
    ['lib/engine/pro-report.ts', /axes\/frame'/],
    ['lib/engine/pro-report-inputs.ts', /model\/code\/frame'/],
    ['lib/engine/report/project-sections.ts', /axes\/frame'/],
    ['lib/pro/report-export.ts', /axes\/axes\.svelte'/],
    ['lib/engine/calc-report.ts', /axes\/display'/],
    ['lib/engine/calc-report-loads.ts', /axes\/display'/],
    ['lib/engine/forces-report.ts', /axes\/display'/],
    ['lib/engine/kinematic-report.ts', /TWO_D_DISPLACEMENT_LABELS/],
    ['lib/report/memoria/render.ts', /axes\/display'/],
    ['lib/model/edit/fragment-code.ts', /axes\/axes\.svelte'/],
    ['lib/ai/browser-provider.ts', /userAxesSection\(axesStore\.frame, 'The result summary'\)/],
    ['lib/export/excel.ts', /axesStatement\(/],
    ['lib/store/file.ts', /axesStatement\(/],
    ['App.svelte', /pastedPoint\(parts\[0\], parts\[1\]\)/],
  ];
  for (const [f, re] of seam) it(`${f} reads the user frame`, () => expect(read(f)).toMatch(re));

  it('no report prints a raw model reaction, displacement or 2D label next to an axis name', () => {
    const forbidden = [
      /fmtNum\(r\.f[xyz]\)/, /fmtNum\(d\.u[xyz], 6\)/, /F\(r\.f[xyz]\)/, /U\.d\(d\.u[xyz]\)/, /<th>Rx \(/, /<th>ux \(\$\{du\}\)<\/th><th>uz/,
      /round\(r\.f[xyz], 3\)/, /round\(d\.u[xyz], 6\)/, /'Mx \(%\)'/, /'Δx\/h'/, /\['Fx', d\.fx, 'force'\], \['Fz'/,
    ];
    for (const [f] of seam) for (const re of forbidden) expect(read(f), `${f} ${re}`).not.toMatch(re);
  });
});

describe('small display pieces', () => {
  it('names DOFs by the user axes, and leaves the default as it was', () => {
    expect((['ux', 'uz', 'θy'] as const).map(kinDofSymbol)).toEqual(['ux', 'uz', 'θy']);
    axesStore.choice = { up: '+Y', right: '+X', hand: 'right' };
    expect((['ux', 'uz', 'θy'] as const).map(kinDofSymbol)).toEqual(['ux', 'uy', 'θz']);
  });

  it('states a frame in words and in its own line', () => {
    const s = axesStatement((k) => k, { up: '+Y', right: '-Z', hand: 'left' });
    expect(s).toContain('+Y ↑');
    expect(s).toContain('axes.handLeft');
    expect(s).toContain('frame up=+Y right=-Z hand=left');
  });

  it('tells the assistant which data stays in model axes', () => {
    expect(userAxesSection(makeFrame(DEFAULT_AXES), 'The result summary')).toBe('');
    expect(userAxesSection(makeFrame({ up: '+Y', right: '+X', hand: 'right' }), 'The result summary')).toContain('- The result summary stay in MODEL axes');
  });

  it('copies a piece as code in the user axes, with its frame, and pastes it back unchanged under any frame', () => {
    const frag: Fragment = {
      nodes: [{ id: 1, x: 0, y: 0, z: 0 }, { id: 2, x: 4, y: 1, z: 3 }], elements: [], quads: [], plates: [],
      supports: [], loads: [{ type: 'nodal3d', data: { id: 1, nodeId: 2, fx: 1, fy: 2, fz: -10, mx: 0, my: 0.5, mz: 0, caseId: 1 } }] as never,
      groups: [], materials: [], sections: [], loadCases: [], local: false,
    };
    expect(fragmentToCode(frag)).not.toContain('frame up=');
    axesStore.choice = { up: '+Y', right: '-Z', hand: 'left' };
    const code = fragmentToCode(frag);
    expect(code).toContain('frame up="+Y" right="-Z" hand="left"');
    expect(code).toContain('node 2 1 3 -4');
    axesStore.reset();
    const back = fragmentFromCode(code)!;
    expect(back.nodes[1]).toMatchObject({ x: 4, y: 1, z: 3 });
    expect(back.loads[0]!.data).toMatchObject({ fx: 1, fy: 2, fz: -10, my: 0.5 });
  });
});
