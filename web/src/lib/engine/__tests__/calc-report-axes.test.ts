import { describe, it, expect, afterEach } from 'vitest';
import { generateCalcReportHtml, type CalcReportData } from '../calc-report';
import { loadComponentsText, pointOnElementText } from '../calc-report-loads';
import { allChoices } from '../../axes/frame';
import { axesStore } from '../../axes/axes.svelte';

afterEach(() => axesStore.reset());

const YUP = { up: '+Y', right: '-Z', hand: 'left' } as const;
const MIRROR = { up: '-Y', right: '+X', hand: 'right' } as const;

function data(overrides: Partial<CalcReportData> = {}): CalcReportData {
  return {
    config: { projectName: 'Test', engineerName: '', companyName: '', date: '1 Jan 2026', notes: '' },
    is3D: false, analysisMode: '2D', provenance: { kind: 'single', caseName: 'D' }, hasDesignChecks: false,
    nodes: [{ id: 1, x: 2, y: 3 } as never], elements: [], materials: [], sections: [], supports: [], loads: [], loadCases: [], combinations: [],
    results2D: { reactions: [{ nodeId: 1, rx: 1, rz: 6, my: 2 }], displacements: [{ nodeId: 1, ux: 0.001, uz: -0.002, ry: 0.0005 }], elementForces: [] } as never,
    ...overrides,
  };
}

const cells = (html: string, heading: RegExp) => {
  const at = html.search(heading);
  const table = html.slice(at, html.indexOf('</table>', at));
  return [...table.matchAll(/<th>([^<]*)<\/th>/g)].map((m) => m[1]!);
};

describe('the calculation report in the user axes', () => {
  // A plane rotation turns from +h toward +v: with Y down, a counterclockwise couple reads negative.
  it('names and signs a plane model by the user\'s horizontal, vertical and normal', () => {
    axesStore.choice = MIRROR;
    const html = generateCalcReportHtml(data());
    expect(cells(html, /id="sec-reactions"/)).toEqual(expect.arrayContaining(['Rx (kN)', 'Ry (kN)', 'Mz (kN·m)']));
    expect(html).toMatch(/<td>1<\/td><td class="num">1(\.0+)?<\/td><td class="num">-6(\.0+)?<\/td><td class="num">-2(\.0+)?<\/td>/);
    expect(cells(html, /id="sec-displacements"/)).toEqual(expect.arrayContaining(['θz (rad)']));
  });

  it('reads the same as before in the default axes', () => {
    const html = generateCalcReportHtml(data());
    expect(cells(html, /id="sec-reactions"/)).toEqual(expect.arrayContaining(['Rx (kN)', 'Rz (kN)', 'My (kN·m)']));
  });

  it('writes loads in the user axes', () => {
    axesStore.choice = YUP;
    expect(loadComponentsText('nodal3d', { fx: 0, fy: 0, fz: -10 })).toBe('Fy=-10 kN');
    expect(loadComponentsText('distributed3d', { frame: 'global', qYI: 0, qYJ: 0, qZI: -5, qZJ: -5 })).toContain('qY=-5 → -5');
    expect(loadComponentsText('distributed3d', { qYI: 0, qYJ: 0, qZI: -5, qZJ: -5 })).toContain('qz=-5 → -5');
    axesStore.choice = MIRROR;
    expect(loadComponentsText('nodal', { fx: 3, fz: -10, my: 1 })).toBe('Fx=3 kN, Fy=10 kN, Mz=-1 kN·m');
    expect(pointOnElementText({ a: 1, p: -5, my: 2 }, { global: 'g', perpendicular: 'p' } as never)).toContain('Mz=-2');
  });
});

it('known wrong result: #2259 calculation reports retain SRSS and ABS magnitudes in plane and space frames', () => {
  for (const method of ['srss', 'abs'] as const) for (const c of allChoices()) {
    axesStore.choice = c;
    for (const is3D of [false, true]) {
      const result = is3D ? { magnitude: { method }, reactions: [{ nodeId: 1, fx: 1, fy: 2, fz: 3, mx: 4, my: 5, mz: 6 }], displacements: [{ nodeId: 1, ux: 0.001, uy: 0.002, uz: 0.003, rx: 0.004, ry: 0.005, rz: 0.006 }], elementForces: [] }
        : { ...data().results2D!, magnitude: { method }, displacements: [{ nodeId: 1, ux: 0.001, uz: 0.002, ry: 0.003 }] };
      const html = generateCalcReportHtml(data({ is3D, results2D: is3D ? undefined : result as never, results3D: is3D ? result as never : undefined }));
      for (const id of ['reactions', 'displacements']) {
        const at = html.indexOf(`id="sec-${id}"`);
        const end = html.indexOf('</div><div class="page-break">', at);
        const section = html.slice(at, end);
        const numbers = [...section.matchAll(/<td class="num">([^<]+)<\/td>/g)].map(m => m[1]!);
        expect(numbers.length).toBeGreaterThan(0);
        expect(numbers.every(n => !n.trim().startsWith('-'))).toBe(true);
      }
    }
  }
});
