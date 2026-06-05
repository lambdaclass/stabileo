import { describe, it, expect } from 'vitest';
import type { ElementForces3D } from '../types-3d';
import type { GoverningPerElement3D } from '../governing-case';
import {
  buildQueryRows,
  extremeRow,
  filterByAbsThreshold,
  governingForComponent,
  topGoverning,
  componentEnds,
  componentToDiagramType,
  rowsToCsv,
  governingToCsv,
  type QueryExportMeta,
} from '../result-query';

const META: QueryExportMeta = {
  sourceKind: 'envelope',
  sourceId: null,
  sourceName: 'Envolvente',
  scopeMode: 'all',
  scopeIds: [],
  threshold: 0,
  extremeMode: 'absmax',
};

/** Minimal ElementForces3D factory — only the fields the query layer reads. */
function ef(elementId: number, vals: Partial<ElementForces3D> = {}): ElementForces3D {
  return {
    elementId,
    length: 1,
    nStart: 0, nEnd: 0,
    vyStart: 0, vyEnd: 0,
    vzStart: 0, vzEnd: 0,
    mxStart: 0, mxEnd: 0,
    myStart: 0, myEnd: 0,
    mzStart: 0, mzEnd: 0,
    releaseMyStart: false, releaseMyEnd: false,
    releaseMzStart: false, releaseMzEnd: false,
    releaseTStart: false, releaseTEnd: false,
    qYI: 0, qYJ: 0, distributedLoadsY: [], pointLoadsY: [],
    qZI: 0, qZJ: 0, distributedLoadsZ: [], pointLoadsZ: [],
    ...vals,
  };
}

describe('result-query: extremes by component', () => {
  const forces = [
    ef(1, { mzStart: 10, mzEnd: -40 }),
    ef(2, { mzStart: 25, mzEnd: -15 }),
    ef(3, { mzStart: 5, mzEnd: 5 }),
  ];

  it('absmax picks the largest magnitude regardless of sign', () => {
    const rows = buildQueryRows(forces, 'Mz');
    const top = extremeRow(rows, 'absmax');
    expect(top).toMatchObject({ elementId: 1, end: 'j', value: -40 });
  });

  it('max picks the largest signed value', () => {
    const rows = buildQueryRows(forces, 'Mz');
    const top = extremeRow(rows, 'max');
    expect(top).toMatchObject({ elementId: 2, end: 'i', value: 25 });
  });

  it('min picks the smallest signed value', () => {
    const rows = buildQueryRows(forces, 'Mz');
    const top = extremeRow(rows, 'min');
    expect(top).toMatchObject({ elementId: 1, end: 'j', value: -40 });
  });

  it('componentEnds maps each component to the right fields', () => {
    const e = ef(7, { nStart: 1, nEnd: 2, vyStart: 3, vzStart: 4, mxStart: 5, myStart: 6, mzStart: 7 });
    expect(componentEnds(e, 'N')).toEqual({ i: 1, j: 2 });
    expect(componentEnds(e, 'Vy').i).toBe(3);
    expect(componentEnds(e, 'Vz').i).toBe(4);
    expect(componentEnds(e, 'T').i).toBe(5);
    expect(componentEnds(e, 'My').i).toBe(6);
    expect(componentEnds(e, 'Mz').i).toBe(7);
  });

  it('restricts to requested element ids, in order, skipping unknown ids', () => {
    const rows = buildQueryRows(forces, 'Mz', { elementIds: [3, 99, 1] });
    expect(rows.map((r) => r.elementId)).toEqual([3, 3, 1, 1]);
  });
});

describe('result-query: threshold filter predicate', () => {
  const rows = buildQueryRows(
    [ef(1, { vyStart: 8, vyEnd: -50 }), ef(2, { vyStart: 30, vyEnd: 0 })],
    'Vy',
  );

  it('keeps only rows at or above the abs threshold', () => {
    const filtered = filterByAbsThreshold(rows, 30);
    expect(filtered.map((r) => Math.abs(r.value)).sort((a, b) => a - b)).toEqual([30, 50]);
  });

  it('is inclusive at the threshold boundary', () => {
    expect(filterByAbsThreshold(rows, 50)).toHaveLength(1);
  });

  it('a zero/negative threshold is a no-op (returns all rows)', () => {
    expect(filterByAbsThreshold(rows, 0)).toHaveLength(rows.length);
    expect(filterByAbsThreshold(rows, -5)).toHaveLength(rows.length);
  });
});

describe('result-query: governing source label preservation', () => {
  const governing = new Map<number, GoverningPerElement3D>([
    [1, { momentZ: { comboId: 3, comboName: '1.2D+1.6L', value: 84.3 } }],
    [2, { momentZ: { comboId: 5, comboName: '1.2D+1.0W', value: 120.7 }, axial: { comboId: 2, comboName: '1.4D', value: 9 } }],
  ]);

  it('carries the governing combo name through as sourceLabel', () => {
    const list = governingForComponent(governing, 'Mz');
    const e1 = list.find((g) => g.elementId === 1)!;
    expect(e1.sourceLabel).toBe('1.2D+1.6L');
    expect(e1.comboId).toBe(3);
    expect(e1.value).toBe(84.3);
  });

  it('topGoverning returns the element with the largest governing value + its label', () => {
    const top = topGoverning(governingForComponent(governing, 'Mz'))!;
    expect(top).toMatchObject({ elementId: 2, value: 120.7, sourceLabel: '1.2D+1.0W' });
  });

  it('skips elements with no governing entry for the component', () => {
    expect(governingForComponent(governing, 'T')).toEqual([]);
    expect(governingForComponent(governing, 'N').map((g) => g.elementId)).toEqual([2]);
  });
});

describe('result-query: empty / no-results behavior', () => {
  it('buildQueryRows on no forces is empty', () => {
    expect(buildQueryRows([], 'Mz')).toEqual([]);
  });

  it('extremeRow on empty rows is null', () => {
    expect(extremeRow([], 'absmax')).toBeNull();
    expect(extremeRow(buildQueryRows([], 'N'))).toBeNull();
  });

  it('governing lookups on an empty map are empty/null', () => {
    expect(governingForComponent(new Map(), 'Mz')).toEqual([]);
    expect(topGoverning([])).toBeNull();
  });

  it('CSV builders emit a header-only document when there are no rows', () => {
    expect(rowsToCsv([], META).split('\n')).toHaveLength(1);
    expect(governingToCsv([], META).split('\n')).toHaveLength(1);
  });
});

describe('result-query: component → diagram type', () => {
  it('maps each component to the matching 3D diagram type', () => {
    expect(componentToDiagramType('N')).toBe('axial');
    expect(componentToDiagramType('Vy')).toBe('shearY');
    expect(componentToDiagramType('Vz')).toBe('shearZ');
    expect(componentToDiagramType('T')).toBe('torsion');
    expect(componentToDiagramType('My')).toBe('momentY');
    expect(componentToDiagramType('Mz')).toBe('momentZ');
  });
});

describe('result-query: flat CSV serialization with metadata', () => {
  const HEADER = 'sourceKind,sourceId,sourceName,component,scopeMode,scopeIds,threshold,extremeMode,element,end,value,unit';

  it('rowsToCsv: header + one flat row per query row, metadata repeated', () => {
    const rows = buildQueryRows([ef(1, { mzStart: 10, mzEnd: -40 })], 'Mz');
    const meta: QueryExportMeta = {
      sourceKind: 'combo', sourceId: 3, sourceName: 'U2: 1.2D + 1.6L',
      scopeMode: 'id', scopeIds: [1, 4], threshold: 5, extremeMode: 'absmax',
    };
    const lines = rowsToCsv(rows, meta).split('\n');
    expect(lines[0]).toBe(HEADER);
    expect(lines).toHaveLength(3);
    // every row carries the full source + query metadata
    expect(lines[1]).toBe('combo,3,U2: 1.2D + 1.6L,Mz,id,1 4,5,absmax,1,i,10,kN·m');
    expect(lines[2]).toBe('combo,3,U2: 1.2D + 1.6L,Mz,id,1 4,5,absmax,1,j,-40,kN·m');
  });

  it('quotes a source name containing a comma', () => {
    const rows = buildQueryRows([ef(1, { nStart: 5, nEnd: 5 })], 'N');
    const meta: QueryExportMeta = { ...META, sourceKind: 'combo', sourceId: 9, sourceName: 'U9: D, L, W' };
    expect(rowsToCsv(rows, meta)).toContain('combo,9,"U9: D, L, W",N,');
  });

  it('envelope/case sourceId is blank when null', () => {
    const rows = buildQueryRows([ef(7, { nStart: 5, nEnd: 5 })], 'N');
    const row = rowsToCsv(rows, META).split('\n')[1];
    expect(row).toBe('envelope,,Envolvente,N,all,,0,absmax,7,i,5,kN');
  });

  it('governingToCsv: sourceKind=governing, per-row comboId/name, end=governing', () => {
    const list = governingForComponent(
      new Map<number, GoverningPerElement3D>([
        [4, { momentZ: { comboId: 5, comboName: 'U5: 1.2D + 1.6W', value: 47.5 } }],
      ]),
      'Mz',
    );
    const meta: QueryExportMeta = { ...META, sourceKind: 'governing', sourceName: 'Governing' };
    const lines = governingToCsv(list, meta).split('\n');
    expect(lines[0]).toBe(HEADER);
    expect(lines[1]).toBe('governing,5,U5: 1.2D + 1.6W,Mz,all,,0,absmax,4,governing,47.5,kN·m');
  });
});
