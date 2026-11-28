import { fixedPointsOf } from '../rc-sheets/fixed-points';
import { FOUNDATION_SYSTEMS, footingSetupOf } from '../rc-sheets/footing-types';
import { SHEET_CODE_LIST, type SheetCode, type StoredRcSheets } from '../rc-sheets/types';

export { migrateDesignOptions as readSheetOptions } from '../rc-sheets/design-options';

const SCOPES = ['element', 'level', 'project'] as const;
function scheduleOf(x: unknown): { schedule?: { waste?: number; scope?: (typeof SCOPES)[number] } } {
  if (!x || typeof x !== 'object') return {};
  const { waste, scope } = x as { waste?: unknown; scope?: unknown };
  const out: { waste?: number; scope?: (typeof SCOPES)[number] } = {};
  if (typeof waste === 'number' && Number.isFinite(waste) && waste >= 0 && waste <= 0.5) out.waste = waste;
  if (SCOPES.includes(scope as never)) out.scope = scope as (typeof SCOPES)[number];
  return Object.keys(out).length ? { schedule: out } : {};
}

const bentLinesOf = (v: unknown): { bentLines?: Record<string, boolean> } => {
  if (!v || typeof v !== 'object') return {};
  const kept = Object.entries(v as Record<string, unknown>).filter((x): x is [string, boolean] => typeof x[1] === 'boolean');
  return kept.length ? { bentLines: Object.fromEntries(kept) } : {};
};

function memberOf<T extends string>(value: unknown, choices: readonly T[]): value is T {
  return typeof value === 'string' && choices.includes(value as T);
}

export function readSheetRecord(raw: unknown): { rcSheets?: StoredRcSheets } {
  if (!raw || typeof raw !== 'object') return {};
  const row = raw as Record<string, unknown>;
  if (typeof row.adopted !== 'object') return {};
  return { rcSheets: {
    version: 1,
    ...(memberOf<SheetCode>(row.code, SHEET_CODE_LIST) ? { code: row.code } : {}),
    ...bentLinesOf(row.bentLines),
    ...(memberOf(row.footingSizing, ['full', 'minimum', 'reinforce'] as const) ? { footingSizing: row.footingSizing } : {}),
    ...(memberOf(row.foundationSystem, FOUNDATION_SYSTEMS) ? { foundationSystem: row.foundationSystem } : {}),
    ...scheduleOf(row.schedule), ...footingSetupOf(row.footingSetup), ...fixedPointsOf(row.fixedPoints),
    ...(Array.isArray(row.edited) ? { edited: row.edited.filter((key): key is string => typeof key === 'string') } : {}),
    ...(memberOf<SheetCode>(row.adoptedCode, SHEET_CODE_LIST) ? { adoptedCode: row.adoptedCode } : {}),
    ...(row.adoptedSeismic === true ? { adoptedSeismic: true } : {}),
    ...(typeof row.adoptedLogic === 'number' && Number.isInteger(row.adoptedLogic) && row.adoptedLogic > 0 ? { adoptedLogic: row.adoptedLogic } : {}),
    ...(typeof row.adoptedBasis === 'string' && row.adoptedBasis ? { adoptedBasis: row.adoptedBasis } : {}),
    ...(typeof row.adoptedFoundationBasis === 'string' && row.adoptedFoundationBasis ? { adoptedFoundationBasis: row.adoptedFoundationBasis } : {}),
    ...(row.foundationSystem === null ? { foundationSystem: null } : {}),
    adopted: { ...(row.adopted as StoredRcSheets['adopted']) },
  } };
}

export { readSheetAssumptions } from './sheet-design-assumptions';
