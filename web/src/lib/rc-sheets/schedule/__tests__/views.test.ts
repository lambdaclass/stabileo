import { describe, it, expect } from 'vitest';
import { closedHoop, hookedStraight, shapeKey, shapeWeight, type BarShape } from '../../shape';
import { scheduleOf } from '../schedule';
import type { ScheduleElement } from '../pieces';
import { SCHEDULE_VIEWS, isScheduleView, scheduleView, usesText } from '../views';
import { scheduleBvbs, scheduleCsv, scheduleSheets } from '../exports';
import es from '../../../i18n/locales/es';
import en from '../../../i18n/locales/en';
import pt from '../../../i18n/locales/pt';
import de from '../../../i18n/locales/de';
import fr from '../../../i18n/locales/fr';
import tr from '../../../i18n/locales/tr';

const bar = (len: number, dia = 16): BarShape => hookedStraight(0, len, 0, dia, 0.096, [false, false], 1, 0);
const hoop = () => closedHoop(0.24, 0.24, 8, 0.032, 0.075);
const el = (key: string, family: ScheduleElement['family'], level: string | undefined, pieces: ScheduleElement['pieces']): ScheduleElement => ({ key, name: key.split(':')[1]!, family, level, pieces });

const elements: ScheduleElement[] = [
  el('line:V1', 'beam', 'N2', [{ kind: 'continuous', count: 2, shape: bar(5), elevation: 'A' }, { kind: 'stirrup', count: 30, shape: hoop() }]),
  el('line:V2', 'beam', 'N10', [{ kind: 'continuous', count: 3, shape: bar(5), elevation: 'A' }, { kind: 'support', count: 2, shape: bar(2.4), elevation: 'B' }]),
  el('column:C1', 'column', 'N2', [{ kind: 'column', count: 4, shape: bar(5) }, { kind: 'hoop', count: 20, shape: hoop() }]),
  el('column:C2', 'column', 'N2', [{ kind: 'column', count: 4, shape: bar(5) }, { kind: 'hoop', count: 20, shape: hoop() }]),
  el('slab:L1', 'slab', undefined, [{ kind: 'slabBottom', count: 10, shape: bar(4.2, 10) }]),
  el('wall:W1', 'wall', 'N10', [{ kind: 'vertical', count: 8, shape: bar(3.5, 12) }, { kind: 'wallTie', count: 12, shape: hoop() }]),
];
const s = scheduleOf(elements, { code: 'cirsoc201-2025', waste: 0.1 });

describe('schedule views', () => {
  it('unified: an equal bar is one row wherever it is placed, with its elements, marks and kinds', () => {
    const v = scheduleView(s, 'unified');
    expect(v.groups).toHaveLength(1);
    const five = v.groups[0]!.rows.find((r) => r.key === shapeKey(bar(5)))!;
    expect(five.count).toBe(2 + 3 + 4 + 4);
    expect(five.uses.map((u) => [u.name, u.count])).toEqual([['V1', 2], ['V2', 3], ['C1', 4], ['C2', 4]]);
    expect(five.kinds).toEqual(['continuous', 'column']);
    expect(five.uses[0]!.elevation).toEqual(['A']);
    expect(five.kg).toBeCloseTo(shapeWeight(bar(5), 13), 9);
    const hoops = v.groups[0]!.rows.find((r) => r.key === shapeKey(hoop()))!;
    expect(hoops.count).toBe(30 + 20 + 20 + 12);
    expect(hoops.uses.map((u) => u.family)).toEqual(['beam', 'column', 'column', 'wall']);
    expect(v.groups[0]!.rows.map((r) => r.dia)).toEqual([...v.groups[0]!.rows.map((r) => r.dia)].sort((a, b) => a - b));
  });

  it('by family: one section per family in the sheets\' order, equal bars merged inside it only', () => {
    const v = scheduleView(s, 'family');
    expect(v.groups.map((g) => g.family)).toEqual(['beam', 'column', 'slab', 'wall']);
    const beams = v.groups[0]!;
    expect(beams.rows.find((r) => r.key === shapeKey(bar(5)))!.count).toBe(5);
    expect(v.groups[1]!.rows.find((r) => r.key === shapeKey(bar(5)))!.count).toBe(8);
    expect(v.groups[1]!.rows.find((r) => r.key === shapeKey(hoop()))!.uses.map((u) => u.name)).toEqual(['C1', 'C2']);
  });

  it('by level: levels in their natural order, elements without one last, bars merged across families within a level', () => {
    const v = scheduleView(s, 'level');
    expect(v.groups.map((g) => g.title)).toEqual(['N2', 'N10', '']);
    const n2 = v.groups[0]!;
    expect(n2.rows.find((r) => r.key === shapeKey(bar(5)))!.count).toBe(2 + 4 + 4);
    expect(n2.rows.find((r) => r.key === shapeKey(hoop()))!.count).toBe(30 + 40);
    expect(v.groups[1]!.rows.find((r) => r.key === shapeKey(bar(5)))!.count).toBe(3);
  });

  it('by diameter: one section per Ø with the 12 m bars it is cut from', () => {
    const v = scheduleView(s, 'diameter');
    expect(v.groups.map((g) => g.dia)).toEqual([8, 10, 12, 16]);
    expect(v.groups.every((g) => g.rows.every((r) => r.dia === g.dia))).toBe(true);
    expect(v.groups.map((g) => g.stockBars)).toEqual(s.byDiameter.map((d) => d.stockBars));
  });

  it('by element: equal elements are one group, their rows per element and how many', () => {
    const v = scheduleView(s, 'element');
    const cols = v.groups.find((g) => g.title === 'C1 = C2')!;
    expect(cols.elements!.map((e) => e.key)).toEqual(['column:C1', 'column:C2']);
    expect(cols.rows.map((r) => [r.marks[0], r.perElement, r.equal, r.count])).toEqual([['A', 4, 2, 8], ['B', 20, 2, 40]]);
    expect(cols.rows[0]!.uses.map((u) => u.name)).toEqual(['C1', 'C2']);
    const v2 = v.groups.find((g) => g.title === 'V2')!;
    expect(v2.rows[1]!.uses[0]!.elevation).toEqual(['B']);
    expect(v.groups.flatMap((g) => g.rows)).toHaveLength(s.rows.length);
  });

  it('every view adds up to the same pieces, length and kg as the schedule, and each group to its rows', () => {
    const pieces = s.rows.reduce((a, r) => a + r.total, 0);
    for (const view of SCHEDULE_VIEWS) {
      const v = scheduleView(s, view);
      expect(v.total.count, view).toBe(pieces);
      expect(v.total.kg, view).toBeCloseTo(s.total.kg, 9);
      expect(v.total.length, view).toBeCloseTo(s.total.length, 9);
      expect(v.total.withWaste, view).toBeCloseTo(s.total.withWaste, 9);
      for (const g of v.groups) {
        expect(g.kg).toBeCloseTo(g.rows.reduce((a, r) => a + r.kg, 0), 9);
        expect(g.count).toBe(g.rows.reduce((a, r) => a + r.count, 0));
        for (const r of g.rows) expect(r.count).toBe(r.uses.reduce((a, u) => a + u.count, 0));
      }
    }
  });

  it('with marks numbered over the project an equal bar carries one mark in the unified view', () => {
    const p = scheduleOf(elements, { code: 'cirsoc201-2025', scope: 'project' });
    expect(scheduleView(p, 'unified').groups[0]!.rows.every((r) => r.marks.length === 1)).toBe(true);
    expect(scheduleView(s, 'unified').groups[0]!.rows.find((r) => r.key === shapeKey(bar(5)))!.marks).toEqual(['A']);
  });

  it('writes the elements by name, with the level only when they span several', () => {
    expect(usesText([{ key: 'a', name: 'C1', level: 'N1', family: 'column' }, { key: 'b', name: 'C2', level: 'N1', family: 'column' }])).toBe('C1, C2');
    expect(usesText([{ key: 'a', name: 'C1', level: 'N1', family: 'column' }, { key: 'b', name: 'C1', level: 'N2', family: 'column' }])).toBe('C1 (N1), C1 (N2)');
    expect(isScheduleView('diameter')).toBe(true);
    expect(isScheduleView('nowhere')).toBe(false);
  });
});

describe('schedule view exports', () => {
  const id = (k: string) => k;

  it('the CSV follows the view: merged rows with their elements, a subtotal per group, and the sums', () => {
    const unified = scheduleCsv(s, id, 'unified').split('\n');
    expect(unified[0]!.startsWith('rcSheets.bbs.elements')).toBe(true);
    expect(unified.filter((l) => /a=\d+/.test(l))).toHaveLength(scheduleView(s, 'unified').groups[0]!.rows.length);
    expect(unified.some((l) => l.includes('V1 (N2), V2 (N10), C1 (N2), C2 (N2)'))).toBe(true);
    const family = scheduleCsv(s, id, 'family').split('\n');
    expect(family[0]!.startsWith('rcSheets.bbs.groupBy.family')).toBe(true);
    expect(family.filter((l) => l.includes('rcSheets.bbs.subtotal'))).toHaveLength(4);
    expect(family.some((l) => l.includes('kg + 10 %'))).toBe(true);
    expect(scheduleCsv(s, id)).toBe(scheduleCsv(s, id, 'element'));
    expect(scheduleCsv(s, id).split('\n')[0]!.startsWith('rcSheets.bbs.element,')).toBe(true);
  });

  it('the workbook carries every view as a sheet, the element view first', () => {
    const sheets = scheduleSheets(s, id, 'CIRSOC 201-2025');
    expect(sheets.map((x) => x.name)).toEqual(['rcSheets.bbs.title', 'rcSheets.bbs.sheet.unified', 'rcSheets.bbs.sheet.family', 'rcSheets.bbs.sheet.level', 'rcSheets.bbs.sheet.diameter']);
    expect(sheets.every((x) => x.rows[0]![0] === 'rcSheets.code: CIRSOC 201-2025')).toBe(true);
  });

  it('the sheets\' names fit Excel\'s 31 characters and differ from each other in every language', () => {
    for (const dict of [es, en, pt, de, fr, tr] as Array<Record<string, string>>) {
      const names = scheduleSheets(s, (k) => dict[k] ?? k, '').map((x) => x.name);
      expect(names.every((n) => n.length <= 31 && !n.startsWith('rcSheets.')), names.join()).toBe(true);
      expect(new Set(names).size).toBe(names.length);
    }
  });

  it('BVBS stays one record per mark of each element group, whatever the view', () => {
    const records = scheduleBvbs(s, { project: 'P', index: '', grade: '' }).split('\r\n').filter(Boolean);
    expect(records).toHaveLength(s.rows.length);
  });
});
