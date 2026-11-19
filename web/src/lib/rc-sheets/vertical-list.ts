import type { ColumnRow } from './column-row';
import type { WallRow } from './wall-row';
import type { RowStatus } from './types';

export type VerticalRow = ColumnRow | WallRow;

export interface VerticalPier {
  key: string; name: string; level?: string;
  walls: WallRow[]; columns: ColumnRow[];
  ratio: number; ok: boolean; combo: string;
  status: RowStatus;
}

export type VerticalItem = { kind: 'row'; row: VerticalRow } | { kind: 'pier'; pier: VerticalPier; rows: VerticalRow[] };

const natural = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true });
const byName = <T extends { name: string }>(list: readonly T[]) => [...list].sort((a, b) => natural(a.name, b.name));

export function verticalLevels(columns: ReadonlyArray<{ level?: string }>, walls: ReadonlyArray<{ level?: string }>): string[] {
  const out = [...new Set(columns.map((r) => r.level ?? ''))];
  let after = -1;
  for (const l of new Set(walls.map((r) => r.level ?? ''))) {
    const at = out.indexOf(l);
    if (at >= 0) { after = at; continue; }
    out.splice(after + 1, 0, l);
    after++;
  }
  return out;
}

function pierStatus(rows: readonly VerticalRow[], ok: boolean): RowStatus {
  if (!ok || rows.some((r) => r.status === 'fail')) return 'fail';
  return rows.length && rows.every((r) => r.status === 'warn') ? 'warn' : 'ok';
}

export function verticalPiers(columns: readonly ColumnRow[], walls: readonly WallRow[]): VerticalPier[] {
  const piers = new Map<string, VerticalPier>();
  for (const w of walls) {
    if (!w.pier) continue;
    const p = piers.get(w.pier.key) ?? { key: w.pier.key, name: w.pier.name, level: w.level, walls: [], columns: [], ratio: w.pier.ratio, ok: w.pier.ok, combo: w.pier.combo, status: 'ok' as RowStatus };
    p.walls.push(w);
    piers.set(p.key, p);
  }
  for (const c of columns) if (c.pier) piers.get(c.pier.key)?.columns.push(c);
  return [...piers.values()].map((p) => ({ ...p, walls: byName(p.walls), columns: byName(p.columns), status: pierStatus([...p.walls, ...p.columns], p.ok) }));
}

export function verticalItems(columns: readonly ColumnRow[], walls: readonly WallRow[], keep: (r: VerticalRow) => boolean = () => true): VerticalItem[] {
  const piers = verticalPiers(columns, walls);
  const inPier = new Set(piers.flatMap((p) => [...p.walls, ...p.columns].map((r) => r.key)));
  const out: VerticalItem[] = [];
  for (const level of verticalLevels(columns, walls)) {
    const at = (r: { level?: string }) => (r.level ?? '') === level;
    const free = <T extends VerticalRow>(list: readonly T[]) => byName(list.filter((r) => at(r) && !inPier.has(r.key) && keep(r)));
    out.push(...free(columns).map((row) => ({ kind: 'row' as const, row })));
    for (const p of byName(piers.filter(at))) {
      const rows = [...p.walls, ...p.columns].filter(keep);
      if (rows.length) out.push({ kind: 'pier', pier: p, rows });
    }
    out.push(...free(walls).map((row) => ({ kind: 'row' as const, row })));
  }
  return out;
}
