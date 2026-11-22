/**
 * The covers the project stores against CIRSOC 201 Table 20.5.1.3.1, where the sheets' code checks
 * them: said once for the project, and set to the table's with one change that the sheets then
 * design with.
 */
import { coversUnderMinimum, withCirsocCovers, type DesignKind } from '../model/design-data';
import { rulesFor } from '../rc-sheets/codes';
import { coverShortfalls, type CoverShortfall } from '../rc-sheets/covers-notice';
import { designData, patchDesignData, storedDesignData } from './design-data';
import { sheetCode } from './rc-sheets.svelte';
import { designSheets } from './rc-sheets-view.svelte';

/** The kinds whose cover is under the table's minimum, m; none under a code the sheets do not hold to the table. */
export function sheetCoversUnder(): Array<{ kind: DesignKind; cover: number; minimum: number }> {
  if (!rulesFor(sheetCode()).coverTable) return [];
  return coversUnderMinimum(designData());
}

/** The same kinds with where their cover comes from and the table's arithmetic for it. */
export function sheetCoverShortfalls(): CoverShortfall[] {
  const table = rulesFor(sheetCode()).coverTable;
  if (!table) return [];
  return coverShortfalls(designData(), storedDesignData(), table.mainBarMm);
}

/** Those covers set to the table's, rounded up to 5 mm, as one undoable change; the sheets are designed again with them. */
export async function applyTableCovers(): Promise<void> {
  const under = sheetCoversUnder();
  if (!under.length) return;
  const table = withCirsocCovers(designData()).covers;
  patchDesignData({ covers: { ...storedDesignData().covers, ...Object.fromEntries(under.map((u) => [u.kind, table[u.kind]])) } });
  await designSheets();
}
