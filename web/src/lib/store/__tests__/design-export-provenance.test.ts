/**
 * The design exports carry the results' provenance and stale status, as every export of results
 * does (`export/provenance-attach.ts`): the IFC on its building, the sheet set's DXF in each file's
 * 999 comments and its PDF on a closing page.
 */
import { describe, it, expect } from 'vitest';
import { exportProjectIfc } from '../ifc-export';
import { currentResultProvenance } from '../result-provenance';
import { provenanceLines, dxfWithProvenance, reportProvenanceLines } from '../../export/provenance-attach';
import { sheetSetDxfZip } from '../../sheets/sheet-set';
import { unzipSync, strFromU8 } from 'fflate';

describe('design exports carry the results\' provenance', () => {
  const record = currentResultProvenance();
  const [statusKey, statusValue] = provenanceLines(record)[0]!;

  it('the IFC names it on the building, the status line first', () => {
    const ifc = exportProjectIfc((k) => k, 'en', 'p', record);
    expect(ifc).toContain(`Provenance_01_${statusKey.replace(/[^\w]+/g, '_')}`);
    // STEP doubles an apostrophe inside a string.
    expect(ifc).toContain(statusValue.replace(/'/g, "''"));
    expect(exportProjectIfc((k) => k, 'en', 'p')).not.toContain('Provenance_01');
  });

  it('each DXF of a sheet set opens with its 999 comments', () => {
    const { title, lines } = reportProvenanceLines(record);
    const zip = sheetSetDxfZip([{ number: 'E-01', width: 420, height: 297, primitives: [] } as never], undefined, '2004', { dxf: (d) => dxfWithProvenance(d, record), svg: (d) => d, title, lines });
    const files = unzipSync(zip);
    const dxf = strFromU8(files['E-01.dxf']!, true);
    expect(dxf.startsWith('999\n')).toBe(true);
    expect(dxf).toContain(statusValue.replace(/[\r\n]+/g, ' '));
  });
});
