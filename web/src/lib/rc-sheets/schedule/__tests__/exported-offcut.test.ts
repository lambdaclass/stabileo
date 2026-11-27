import { expect, it } from 'vitest';
import { buildSchedule, scheduleToAoa, type TitleBlock } from '../../../engine/detailing/drawings';

const title: TitleBlock = {
  title: 'Cuts', sheetNumber: '1', codeEdition: '', clauses: [], revision: 1,
  reviewState: '', superseded: false, maturity: 'VALIDATED', scale: 1,
};

it.skip('known wrong result: #2365 counts only pieces actually cut on each purchased stock bar', () => {
  const marks = [
    ['A', 5, 1, 1, 7],
    ['B', 5, 2, 1, 2],
    ['C', 5, 3, 2, 9],
    ['D', 6, 2, 1, 0],
  ] as const;
  const schedule = buildSchedule(marks.map(([mark, cuttingLength, quantity]) => ({
    mark, cuttingLength, quantity, diameterMm: 12, shape: 'straight', massKg: 1,
  })), 12);
  const workbook = scheduleToAoa(schedule, title, 'en');
  for (const [mark, , , bars, offcut] of marks) {
    expect.soft(schedule.rows.find(row => row.mark === mark)).toMatchObject({ stockBars: bars, offcutM: offcut });
    expect.soft(workbook.find(row => row[0] === mark)?.slice(-2)).toEqual([bars, offcut]);
  }
  expect.soft(schedule.totals).toMatchObject({ stockBars: 5, totalLengthM: 42, wasteM: 18 });
  expect.soft(workbook.find(row => row[0] === 'TOTAL')?.slice(-2)).toEqual([5, 18]);
});
