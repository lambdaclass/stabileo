import { retainedSheetOptions } from './retained-sheet-options';
import { readSheetOptions } from './sheet-option-reader';
import { unifiedPlates } from '../features';
import { DESIGN_KINDS, migrateDesignData, type StoredDesignData } from './design-data';

const STATED_BY_DEFAULT = ['stirrupDiaMm', 'wallBarDiaMm', 'rebarGrade', 'rebarFy', 'longDiametersMm', 'stirrupDiametersMm', 'slabDiametersMm', 'wallDiametersMm', 'minTieSpacingMm', 'maxAggregateMm', 'presumedBearingKPa'] as const;
const derivedDesignKeys: readonly string[] = unifiedPlates() ? ['stirrupDiaMm', 'wallBarDiaMm'] : [];

export function migrateStoredDesignData(raw: unknown): StoredDesignData | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const e = raw as Record<string, unknown>;
  const full = migrateDesignData(raw);
  const out: Record<string, unknown> = { version: 1 };
  for (const [k, v] of Object.entries(full)) {
    if (k === 'version' || k === 'covers' || k === 'exposure' || derivedDesignKeys.includes(k)) continue;
    if ((STATED_BY_DEFAULT as readonly string[]).includes(k) && !(k in e)) continue;
    out[k] = v;
  }
  for (const k of ['covers', 'exposure'] as const) {
    const own = e[k] && typeof e[k] === 'object' ? e[k] as Record<string, unknown> : {};
    const kinds = DESIGN_KINDS.filter((kind) => kind in own && full[k][kind] === own[kind]);
    if (kinds.length) out[k] = Object.fromEntries(kinds.map((kind) => [kind, full[k][kind]]));
  }
  if (!readSheetOptions) {
    if (e.rcSheets && typeof e.rcSheets === 'object' && !Array.isArray(e.rcSheets)) out.rcSheets = { ...e.rcSheets };
    const options = retainedSheetOptions(e.designOptions, e.rcSheets);
    if (options) out.designOptions = options;
  }
  return out as StoredDesignData;
}
