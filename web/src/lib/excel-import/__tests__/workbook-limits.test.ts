/** Resource ceilings on a user-chosen workbook, checked before the xlsx library inflates it. */
import { describe, expect, it } from 'vitest';
import { zipSync } from 'fflate';
import { checkWorkbookArchive, MAX_WORKBOOK_ENTRIES, MAX_WORKBOOK_INFLATED_BYTES, WorkbookLimitError } from '../apply';

/** Overwrite the declared uncompressed size of every central-directory entry. */
function declareSize(zip: Uint8Array, size: number): Uint8Array {
  const out = zip.slice();
  const dv = new DataView(out.buffer);
  for (let i = 0; i + 46 <= out.length; i++) {
    if (dv.getUint32(i, true) === 0x02014b50) dv.setUint32(i + 24, size, true);
  }
  return out;
}

describe('checkWorkbookArchive', () => {
  it('passes an ordinary small zip and non-zip input', () => {
    expect(() => checkWorkbookArchive(zipSync({ 'xl/workbook.xml': new Uint8Array(100) }))).not.toThrow();
    expect(() => checkWorkbookArchive(new TextEncoder().encode('a,b\n1,2'))).not.toThrow();
  });

  it('refuses a zip declaring more than the inflated ceiling', () => {
    const files: Record<string, Uint8Array> = {};
    for (let i = 0; i < 3; i++) files[`f${i}.xml`] = new Uint8Array(10);
    const zip = declareSize(zipSync(files), Math.ceil(MAX_WORKBOOK_INFLATED_BYTES / 2));
    expect(() => checkWorkbookArchive(zip)).toThrow(WorkbookLimitError);
  });

  it('refuses a zip with too many entries', () => {
    const files: Record<string, Uint8Array> = {};
    for (let i = 0; i <= MAX_WORKBOOK_ENTRIES; i++) files[`f${i}`] = new Uint8Array(0);
    expect(() => checkWorkbookArchive(zipSync(files))).toThrow(WorkbookLimitError);
  });
});
