/**
 * The raw forces report, against the rules its contract states.
 *
 * The point of these is not that the numbers come out — it is that the four rules
 * `rc-forces-report.ts` writes down are enforced by code rather than by intention:
 *
 *   1. a report of raw results imports nothing from the design or detailing layers;
 *   2. narrowing to a member selection never narrows the reactions;
 *   3. choosing the quarter convention never hides a critical station;
 *   4. a section that was asked for and has nothing still produces its sheet.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildForcesReport, forcesBlocks, FORCES_REPORT_IS_NOT,
  type ForcesReportSource,
} from '../forces-report';
import { renderForcesReportHtml } from '../forces-report-render';
import { RC_FORCES_DEFAULT, type RcForcesReportConfig } from '../../flow/rc-forces-report';
import type { AnalysisResults3D, ElementForces3D } from '../types-3d';

const here = dirname(fileURLToPath(import.meta.url));

/** Keys resolve to themselves, so a missing label is visible instead of blank. */
const t = (k: string) => k;

function ef(id: number, over: Partial<ElementForces3D> = {}): ElementForces3D {
  return {
    elementId: id, length: 6,
    nStart: -100, nEnd: -100,
    vyStart: 30, vyEnd: -30,
    vzStart: 0, vzEnd: 0,
    mxStart: 0, mxEnd: 0,
    myStart: 0, myEnd: 0,
    mzStart: -45, mzEnd: -45,
    // The solver always fills these, and `evaluateDiagramAt` iterates them without a guard —
    // a fixture that omits them is not a smaller model, it is one the engine never produces.
    pointLoadsY: [], pointLoadsZ: [], distributedLoadsY: [], distributedLoadsZ: [],
    ...over,
  } as ElementForces3D;
}

function results(over: Partial<AnalysisResults3D> = {}): AnalysisResults3D {
  return {
    displacements: [
      { nodeId: 1, ux: 0, uy: 0, uz: 0, rx: 0, ry: 0, rz: 0 },
      { nodeId: 2, ux: 0.001234567, uy: 0, uz: -0.004, rx: 0, ry: 0.0001, rz: 0 },
      { nodeId: 3, ux: 0.5, uy: 0, uz: -0.02, rx: 0, ry: 0, rz: 0 },
    ],
    reactions: [
      { nodeId: 1, fx: 1, fy: 2, fz: 3, mx: 4, my: 5, mz: 6 },
      { nodeId: 9, fx: -1, fy: -2, fz: -3, mx: 0, my: 0, mz: 0 },
    ],
    elementForces: [ef(1), ef(2)],
    ...over,
  } as AnalysisResults3D;
}

function source(over: Partial<ForcesReportSource> = {}): ForcesReportSource {
  return {
    results: results(),
    perCombo: new Map(),
    comboNames: new Map(),
    elementNodes: new Map([[1, [1, 2]], [2, [2, 3]]]),
    ...over,
  };
}

const cfg = (over: Partial<RcForcesReportConfig> = {}): RcForcesReportConfig =>
  ({ ...RC_FORCES_DEFAULT, ...over });

const sheet = (doc: ReturnType<typeof buildForcesReport>, s: string) =>
  doc.sheets.find((x) => x.section === s)!;

describe('the raw report keeps its distance from the design layer', () => {
  it('imports nothing from design or detailing', () => {
    for (const f of ['../forces-report.ts', '../forces-report-render.ts', '../station-forces.ts']) {
      const code = readFileSync(resolve(here, f), 'utf8');
      expect(code, `${f} imports engine/design`).not.toMatch(/from\s+'[^']*engine\/design/);
      expect(code, `${f} imports design/`).not.toMatch(/from\s+'\.\/design\//);
      expect(code, `${f} imports detailing`).not.toMatch(/from\s+'[^']*detailing/);
    }
  });

  it('says what it is not, on every document it produces', () => {
    const doc = buildForcesReport(cfg(), source(), t);
    expect(doc.limitations).toEqual([...FORCES_REPORT_IS_NOT]);
    // And the rendered page carries them ABOVE the tables, not in a footer.
    const html = renderForcesReportHtml(doc, {
      projectName: 'P', locale: 'en', at: '2026-08-27T00:00:00.000Z', title: 'T',
      labels: { scope: 's', stations: 'st', isNot: 'not', generated: 'g', empty: 'none' },
    });
    const banner = html.indexOf('design.forcesReport.isNot.design');
    const firstTable = html.indexOf('<table>');
    expect(banner).toBeGreaterThan(-1);
    expect(banner, 'the qualification must precede the first table').toBeLessThan(firstTable);
  });
});

describe('scope narrows members and never the reactions', () => {
  const doc = buildForcesReport(cfg({ scope: { kind: 'elements', elementIds: [2] } }), source(), t);

  it('reports only the selected member', () => {
    const rows = sheet(doc, 'elementForces').aoa.slice(1);
    expect(rows.map((r) => r[1])).toEqual([2]);
  });

  it('reports every reaction, because a filtered reaction table does not balance', () => {
    const rows = sheet(doc, 'reactions').aoa.slice(1);
    expect(rows.map((r) => r[1]).sort()).toEqual([1, 9]);
  });

  it('narrows displacements to the nodes those members touch', () => {
    const rows = sheet(doc, 'displacements').aoa.slice(1);
    // Element 2 spans nodes 2 and 3. Node 1 is another member's and is not reported.
    expect(rows.map((r) => r[1]).sort()).toEqual([2, 3]);
  });

  it('names the members it covers, so a file cannot be read without its scope', () => {
    expect(doc.scopeLine).toContain('2');
    expect(doc.elementIds).toEqual([2]);
    expect(buildForcesReport(cfg(), source(), t).scopeLine)
      .toBe('design.forcesReport.scope.model');
  });
});

describe('the quarter convention never hides a station', () => {
  // A point load at t = 0.4 puts a station there that the quarter grid does not contain.
  const withPointLoad = ef(1, { pointLoadsY: [{ p: 10, a: 2.4 }] } as Partial<ElementForces3D>);
  const src = source({ results: results({ elementForces: [withPointLoad] }) });

  it('the stations sheet honours the chosen convention', () => {
    const doc = buildForcesReport(cfg({ stationMode: 'quarters' }), src, t);
    const ts = sheet(doc, 'stations').aoa.slice(1).map((r) => r[2]);
    expect(ts).toEqual([0, 0.25, 0.5, 0.75, 1]);
  });

  it('and the raw sheet carries the engine\'s own stations anyway', () => {
    const doc = buildForcesReport(cfg({ stationMode: 'quarters' }), src, t);
    const ts = sheet(doc, 'rawStations').aoa.slice(1).map((r) => r[2]) as number[];
    expect(ts).toContain(0.4);
    expect(ts.length).toBeGreaterThan(5);
  });

  it('the document states which convention produced the stations sheet', () => {
    expect(buildForcesReport(cfg({ stationMode: 'quarters' }), src, t).stationNote)
      .toBe('design.forcesReport.stations.quarters');
    expect(buildForcesReport(cfg({ stationMode: 'critical' }), src, t).stationNote)
      .toBe('design.forcesReport.stations.critical');
  });
});

describe('station columns follow the configuration, end forces do not', () => {
  const doc = buildForcesReport(cfg({ magnitudes: ['mz'] }), source(), t);

  it('a station table carries exactly the chosen magnitudes, in that order', () => {
    expect(sheet(doc, 'stations').aoa[0]).toEqual([
      'design.forcesReport.col.block', 'design.forcesReport.col.element',
      't', 'x (m)', 'Mz (kN·m)',
    ]);
  });

  it('but end forces keep every magnitude, so the table can be checked for equilibrium', () => {
    const head = sheet(doc, 'elementForces').aoa[0] as string[];
    for (const col of ['N i (kN)', 'Vy i (kN)', 'Vz i (kN)', 'T i (kN·m)', 'My i (kN·m)', 'Mz i (kN·m)']) {
      expect(head).toContain(col);
    }
  });

  it('signs are preserved: a hogging moment is not an absolute value', () => {
    const row = sheet(doc, 'stations').aoa[1];
    expect(row[4]).toBeLessThan(0);
  });
});

describe('blocks are combinations when there are combinations', () => {
  const perCombo = new Map([[7, results()], [8, results()]]);
  const comboNames = new Map([[7, 'U1'], [8, 'U2']]);
  const src = source({ perCombo, comboNames });

  it('an un-combined solve is one block with no fabricated name', () => {
    const b = forcesBlocks(cfg(), source());
    expect(b).toHaveLength(1);
    expect(b[0].label).toBe('');
  });

  it('null means every solved combination', () => {
    expect(forcesBlocks(cfg({ comboIds: null }), src).map((b) => b.label)).toEqual(['U1', 'U2']);
  });

  it('a list means those, and an unsolved id is skipped rather than emitted empty', () => {
    expect(forcesBlocks(cfg({ comboIds: [8, 99] }), src).map((b) => b.label)).toEqual(['U2']);
  });

  it('an empty list is not the same as null: it reports nothing', () => {
    expect(forcesBlocks(cfg({ comboIds: [] }), src)).toEqual([]);
    const doc = buildForcesReport(cfg({ comboIds: [] }), src, t);
    expect(sheet(doc, 'reactions').aoa).toHaveLength(1); // header only
  });

  it('the combination is the first column of every table, not a tab per combination', () => {
    const doc = buildForcesReport(cfg(), src, t);
    for (const s of doc.sheets) {
      expect(s.aoa[0][0]).toBe('design.forcesReport.col.block');
    }
    expect(sheet(doc, 'reactions').aoa[1][0]).toBe('U1');
  });
});

describe('a requested section always produces its sheet', () => {
  it('even when it has nothing to say, because absent and empty are different answers', () => {
    const src = source({ results: results({ reactions: [] }) });
    const doc = buildForcesReport(cfg(), src, t);
    const s = sheet(doc, 'reactions');
    expect(s).toBeDefined();
    expect(s.aoa).toHaveLength(1);
    expect(s.note).toBe('design.forcesReport.note.reactions');
  });

  it('a section that was not requested produces no sheet at all', () => {
    const doc = buildForcesReport(cfg({ sections: ['reactions'] }), source(), t);
    expect(doc.sheets.map((s) => s.section)).toEqual(['reactions']);
  });

  it('sheets come out in the contract\'s order however they were requested', () => {
    const doc = buildForcesReport(
      cfg({ sections: ['rawStations', 'reactions', 'stations'] }), source(), t);
    expect(doc.sheets.map((s) => s.section)).toEqual(['reactions', 'stations', 'rawStations']);
  });

  it('sheet names fit a workbook tab and stay unique', () => {
    const doc = buildForcesReport(cfg(), source(), (k) => 'x'.repeat(40) + k.slice(-1));
    const names = doc.sheets.map((s) => s.name);
    for (const n of names) expect(n.length).toBeLessThanOrEqual(31);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe('the printed page renders the same sheets the workbook is built from', () => {
  const doc = buildForcesReport(cfg(), source(), t);
  const html = renderForcesReportHtml(doc, {
    projectName: 'Torre <A>', locale: 'en', at: '2026-08-27T03:00:00.000Z', title: 'Forces',
    labels: { scope: 's', stations: 'st', isNot: 'not', generated: 'g', empty: 'none' },
  });

  it('one table per sheet', () => {
    expect(html.match(/<table>/g) ?? []).toHaveLength(doc.sheets.length);
  });

  it('escapes what came from the project rather than trusting it', () => {
    expect(html).toContain('Torre &lt;A&gt;');
    expect(html).not.toContain('Torre <A>');
  });

  it('an empty section prints the word for nothing, not a headless table', () => {
    const empty = buildForcesReport(
      cfg({ sections: ['reactions'] }),
      source({ results: results({ reactions: [] }) }), t);
    const out = renderForcesReportHtml(empty, {
      projectName: 'P', locale: 'en', at: '2026-08-27T03:00:00.000Z', title: 'Forces',
      labels: { scope: 's', stations: 'st', isNot: 'not', generated: 'g', empty: 'NOTHING' },
    });
    expect(out).toContain('NOTHING');
  });
});
