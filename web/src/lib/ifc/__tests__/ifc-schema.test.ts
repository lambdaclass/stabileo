/**
 * A file in a schema the reader does not open (IFC2X2, as older exporters still write it) is
 * refused with its schema named, rather than with the reader's internal error.
 */
import { describe, it, expect } from 'vitest';
import { parseIfc } from '../ifc-parser';

const OLD = `ISO-10303-21;
HEADER;
FILE_DESCRIPTION(('ViewDefinition [CoordinationView]'),'2;1');
FILE_NAME('old.ifc','2026-10-21T00:00:00',(''),(''),'','','');
FILE_SCHEMA(('IFC2X2_FINAL'));
ENDSEC;
DATA;
#1=IFCPROJECT('0YvctVUKr0kugbFTf53O9L',$,'P',$,$,$,$,$,$);
ENDSEC;
END-ISO-10303-21;
`;

describe('an IFC schema the reader does not open', () => {
  it('is refused by name', async () => {
    await expect(parseIfc(new TextEncoder().encode(OLD).buffer as ArrayBuffer, { wasmPath: './' })).rejects.toThrow(/IFC2X2_FINAL/);
  });
});
