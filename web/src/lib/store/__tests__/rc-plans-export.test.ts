/**
 * Exporting the reinforcement drawings from the sheets workspace: the project's name and the
 * author and licence written in reach the title block, the files asked for are downloaded (one
 * as it is, several zipped), and nothing is downloaded when the choice draws nothing.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { unzipSync } from 'fflate';
const saved = vi.hoisted(() => [] as Array<{ blob: Blob; name: string }>);
vi.mock('../file', async (orig) => ({ ...(await orig<typeof import('../file')>()), downloadBlob: (blob: Blob, name: string) => { saved.push({ blob, name }); } }));
import { modelStore } from '../model.svelte';
import '../index';
import { defaultPlanAuthor, exportRcPlans, type PlanExportRequest } from '../rc-plans-export';
import type { SheetRows } from '../rc-sheets.svelte';
import { DEFAULT_PLAN_SCALES } from '../../rc-sheets/plans/sheets';
import { columnStack, level, tr, twoSpanLine, wall } from '../../rc-sheets/plans/__tests__/fixtures';

const { line, rows: beam } = twoSpanLine();
const rows: SheetRows = { beam, line: [line], column: columnStack(), slab: level().rows, slabPlan: [level().plan], wall: [wall()], punching: [], code: 'CIRSOC 201-2025', basis: 'combinations', combos: 1 };
const req = (o: Partial<PlanExportRequest> = {}): PlanExportRequest => ({ selection: { families: ['beam'], levels: null }, format: 'A3', scales: DEFAULT_PLAN_SCALES, dxf: true, pdf: true, author: ' Ing. B. P. ', licence: '1234', ...o });
const bytes = async (b: Blob) => new Uint8Array(await b.arrayBuffer());
const latin1 = (b: Uint8Array) => Array.from(b, (c) => String.fromCharCode(c)).join('');

beforeEach(() => {
  saved.length = 0;
  modelStore.clear();
  modelStore.model.name = 'Torre Norte';
  modelStore.model.projectInfo = { job: 'Torre Norte', designer: { name: 'Ing. B. P.' } };
});

describe('exporting the reinforcement drawings', () => {
  it('starts the author from the project designer', () => {
    expect(defaultPlanAuthor()).toBe('Ing. B. P.');
  });

  it('downloads a zip of a DXF per sheet and the PDF, the title block carrying the project, author, licence and date', async () => {
    const n = exportRcPlans(rows, req(), tr, '2026-11-15');
    expect(n).toBeGreaterThan(0);
    expect(saved).toHaveLength(1);
    expect(saved[0]!.name).toBe('Torre-Norte-rcSheets.plans.fileName.zip');
    const files = unzipSync(await bytes(saved[0]!.blob));
    const names = Object.keys(files);
    expect(names.filter((f) => f.endsWith('.dxf'))).toHaveLength(n);
    const pdf = latin1(files[names.find((f) => f.endsWith('.pdf'))!]!);
    expect(pdf).toContain('(Torre Norte)');
    expect(pdf).toContain('rcSheets.plans.tb.author: Ing. B. P. · rcSheets.plans.tb.licence: 1234');
    expect(pdf).toContain('rcSheets.plans.tb.date: 2026-11-15');
  });

  it('downloads a lone PDF as it is, and nothing when the choice draws nothing', () => {
    exportRcPlans(rows, req({ dxf: false, selection: { families: [], levels: null, element: rows.column[0]!.key } }), tr);
    expect(saved.map((s) => s.name)).toEqual(['Torre-Norte-rcSheets.plans.fileName.pdf']);
    expect(saved[0]!.blob.type).toBe('application/pdf');
    expect(exportRcPlans(rows, req({ selection: { families: ['beam'], levels: ['N9'] } }), tr)).toBe(0);
    expect(saved).toHaveLength(1);
  });
});
