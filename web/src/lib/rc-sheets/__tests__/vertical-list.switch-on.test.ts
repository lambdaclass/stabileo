import { describe, expect, it } from 'vitest';
import { verticalItems, verticalLevels } from '../vertical-list';
import type { ColumnRow } from '../column-row';
import type { WallRow } from '../wall-row';
import type { RowStatus } from '../types';

const col = (name: string, level: string, status: RowStatus = 'ok', pier?: string) =>
  ({ family: 'column', key: `column:${name}:${level}`, name, level, status, ...(pier ? { pier: { key: pier, name: 'M1 + M2 + C1', walls: ['M1', 'M2'], host: `wall:M1:${level}` } } : {}) }) as unknown as ColumnRow;
const wall = (name: string, level: string, status: RowStatus = 'ok', pier?: string, ok = true) =>
  ({ family: 'wall', key: `wall:${name}:${level}`, name, level, status, ...(pier ? { pier: { key: pier, name: 'M1 + M2 + C1', ratio: 0.6, ok, combo: 'U1', columns: [] } } : {}) }) as unknown as WallRow;

const names = (items: ReturnType<typeof verticalItems>) => items.map((it) => (it.kind === 'row' ? it.row.name : `[${it.pier.name}: ${it.rows.map((r) => r.name).join(', ')}]`));

describe('the columns and walls as one list', () => {
  const columns = [col('C2', 'N0'), col('C1', 'N0', 'ok', 'p0'), col('C10', 'N0'), col('C2', 'N1'), col('C1', 'N1', 'ok', 'p1')];
  const walls = [wall('M2', 'N0', 'ok', 'p0'), wall('M1', 'N0', 'fail', 'p0'), wall('M3', 'N0'), wall('M2', 'N1', 'ok', 'p1'), wall('M1', 'N1', 'ok', 'p1')];

  it('lists each level\'s free columns, then each pier with its walls and the column inside them, then the free walls', () => {
    expect(names(verticalItems(columns, walls))).toEqual([
      'C2', 'C10', '[M1 + M2 + C1: M1, M2, C1]', 'M3',
      'C2', '[M1 + M2 + C1: M1, M2, C1]',
    ]);
  });

  it('never lists a pier\'s column on its own', () => {
    const items = verticalItems(columns, walls);
    expect(items.filter((it) => it.kind === 'row' && it.row.name === 'C1')).toEqual([]);
  });

  it('gives a pier the worst status of its members and of its own check', () => {
    const [n0, n1] = verticalItems(columns, walls).filter((it) => it.kind === 'pier');
    expect(n0!.kind === 'pier' && n0!.pier.status).toBe('fail');
    expect(n1!.kind === 'pier' && n1!.pier.status).toBe('ok');
    const failing = verticalItems([col('C1', 'N0', 'ok', 'p')], [wall('M1', 'N0', 'ok', 'p', false)]);
    expect(failing[0]!.kind === 'pier' && failing[0]!.pier.status).toBe('fail');
  });

  it('filters the rows and keeps a pier while any of its rows is shown, with all its members for its drawing', () => {
    const failing = verticalItems(columns, walls, (r) => r.status === 'fail');
    expect(names(failing)).toEqual(['[M1 + M2 + C1: M1]']);
    expect(failing[0]!.kind === 'pier' && failing[0]!.pier.walls.map((w) => w.name)).toEqual(['M1', 'M2']);
    expect(verticalItems(columns, walls, (r) => r.level === 'N1' && r.family === 'column').map((it) => it.kind)).toEqual(['row', 'pier']);
  });

  it('places a level only the walls stand on after the level the walls list before it', () => {
    expect(verticalLevels([{ level: 'N1' }, { level: 'N2' }], [{ level: 'N0' }, { level: 'N1' }, { level: 'N1b' }, { level: 'N2' }])).toEqual(['N0', 'N1', 'N1b', 'N2']);
  });
});
