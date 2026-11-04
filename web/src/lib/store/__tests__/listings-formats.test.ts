/**
 * Every listing comes out in every format with the same content: the native PDF, the HTML, the
 * workbook and the CSV are written from the same rows, cell by cell. The frame is designed and
 * detailed so the listings hold real rows.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import * as XLSX from 'xlsx';
import { strFromU8, unzipSync } from 'fflate';
import { historyStore, modelStore, resultsStore, uiStore } from '..';
import { designRunStore } from '../design-run.svelte';
import { verificationStore } from '../verification.svelte';
import { detailingStore } from '../detailing.svelte';
import { placeFrame } from '../../model/building/build-on-grid';
import { LISTING_IDS, listing, setListingConfig, setWastePct } from '../listings';
import { bvbsOfDocument, listingBytes } from '../listing-export';
import { bvbsChecksum } from '../../listings/bvbs';
import { toAoa, cellText } from '../../listings/listing';
import type { StructuralGrid } from '../../model/grid';
import * as wasmSolver from '../../engine/wasm-solver';
import { stateSuiteLateral } from './suite-lateral';

beforeAll(async () => {
  await new Promise((r) => setTimeout(r, 0));
  expect(wasmSolver.isSolverReady(), 'real WASM solver required').toBe(true);
});

const grid: StructuralGrid = {
  axes: [
    { id: 'x0', name: '1', axis: 'x', at: 0 }, { id: 'x1', name: '2', axis: 'x', at: 5 }, { id: 'x2', name: '3', axis: 'x', at: 9 },
    { id: 'y0', name: 'A', axis: 'y', at: 0 },
  ],
  levels: [{ id: 'N0', name: 'PB', z: 0 }, { id: 'N1', name: 'P1', z: 3 }, { id: 'N2', name: 'P2', z: 6 }],
};

function project() {
  modelStore.clear(); historyStore.clear(); resultsStore.clear(); verificationStore.clear(); uiStore.analysisMode = 'pro';
  stateSuiteLateral();
  const conc = modelStore.addMaterial({ name: 'H-25', e: 23500, nu: 0.2, rho: 25, fy: 25, fc: 25 });
  const col = modelStore.addSection({ name: '40×40', a: 0.16, iy: 0.4 ** 4 / 12, iz: 0.4 ** 4 / 12, j: 0.1406 * 0.4 ** 4, b: 0.4, h: 0.4, shape: 'rect' } as never);
  const beam = modelStore.addSection({ name: '20×50', a: 0.1, iy: 0.00208, iz: 0.000333, j: 0.00093, b: 0.2, h: 0.5, shape: 'rect' } as never);
  placeFrame(grid, { x: ['x0', 'x2'], y: ['y0', 'y0'], levels: ['N0', 'N2'], columns: { sectionId: col, materialId: conc }, beamsX: { sectionId: beam, materialId: conc }, beamsY: null }, { fixBase: true });
  const beams = [...modelStore.elements.values()].filter((e) => { const a = modelStore.nodes.get(e.nodeI)!, b = modelStore.nodes.get(e.nodeJ)!; return Math.abs((a.z ?? 0) - (b.z ?? 0)) < 1e-6; });
  for (const e of beams) modelStore.addDistributedLoad3D(e.id, 0, 0, -25, -25, undefined, undefined, 1);
  const combo = modelStore.solveCombinations3D(false, false, true);
  if (!combo || typeof combo === 'string') throw new Error(String(combo));
  resultsStore.setCombinationResults3D(combo.perCase, combo.perCombo, combo.envelope);
  expect(designRunStore.computeDemands().ok).toBe(true);
  expect(designRunStore.autoDesign([...verificationStore.contexts.keys()]).ok).toBe(true);
  detailingStore.generate();
}

const unesc = (s: string) => s.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
/** A text as the PDF writes it for Helvetica: the WinAnsi code page (`to-pdf.ts`), anything else as «?». */
const WIN: Record<string, string> = { '—': '\x97', '–': '\x96', '…': '\x85', '€': '\x80', '•': '\x95', '’': '\x92' };
const ansi = (s: string) => [...s].map((c) => WIN[c] ?? (c.charCodeAt(0) < 256 ? c : '?')).join('');

function csvRows(csv: string): string[][] {
  return csv.trim().split('\r\n').map((line) => {
    const out: string[] = []; let cur = '', q = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]!;
      if (q) { if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; }
      else if (ch === '"') q = true; else if (ch === ';') { out.push(cur); cur = ''; } else cur += ch;
    }
    out.push(cur); return out;
  });
}

describe('each listing in each format, with the same content', () => {
  it('PDF, HTML, DOCX, XLSX and CSV say the same, cell by cell', async () => {
    project();
    setWastePct(10);
    for (const id of LISTING_IDS) {
      const l = listing(id, 'es'), aoa = toAoa(l, 'es');
      // HTML: every cell, in order.
      const html = (await listingBytes(id, 'html', 'es')) as string;
      const cells = [...html.matchAll(/<t[hd](?:\s[^>]*)?>([\s\S]*?)<\/t[hd]>/g)].map((m) => unesc(m[1]!));
      expect(cells, `${id} html`).toEqual(aoa.flat());
      // DOCX: the same cells, in the document's table.
      const docx = unzipSync((await listingBytes(id, 'docx', 'es')) as Uint8Array);
      const xml = strFromU8(docx['word/document.xml']!);
      const tcs = [...xml.matchAll(/<w:tc>([\s\S]*?)<\/w:tc>/g)].map((m) => unesc([...m[1]!.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map((t) => t[1]).join('')));
      expect(tcs, `${id} docx`).toEqual(aoa.flat());
      // CSV: the same rows.
      expect(csvRows((await listingBytes(id, 'csv', 'es')) as string), `${id} csv`).toEqual(aoa);
      // PDF: every cell's text is on its pages.
      const pdf = Buffer.from((await listingBytes(id, 'pdf', 'es')) as Uint8Array).toString('latin1');
      const texts = new Set([...pdf.matchAll(/\(((?:\\.|[^\\)])*)\) Tj/g)].map((m) => m[1]!.replace(/\\([\\()])/g, '$1')));
      for (const c of aoa.flat()) if (c) expect(texts.has(ansi(c)), `${id} pdf «${c}»`).toBe(true);
      // XLSX: numbers as numbers (at the column's digits), texts as written.
      const wb = XLSX.read((await listingBytes(id, 'xlsx', 'es')) as Uint8Array, { type: 'array' });
      const back = XLSX.utils.sheet_to_json<Array<string | number>>(wb.Sheets[wb.SheetNames[0]!]!, { header: 1, raw: true, defval: '' });
      expect(back[0], `${id} xlsx header`).toEqual(aoa[0]);
      l.rows.forEach((r, i) => l.columns.forEach((c, j) => {
        const v = r[c.key] ?? null, got = back[i + 1]![j];
        if (typeof v === 'number' && Number.isFinite(v)) expect(got, `${id} xlsx ${i},${j}`).toBeCloseTo(v, 9);
        else expect(got, `${id} xlsx ${i},${j}`).toBe(cellText(v, c, 'es'));
      }));
    }
  });

  it('the listings hold rows, the checks name their article, and the waste reaches the quantities', () => {
    project();
    setWastePct(10);
    for (const id of ['combinations', 'beams', 'beamSteel', 'columns', 'columnForces', 'checks', 'quantities'] as const) expect(listing(id, 'es').rows.length, id).toBeGreaterThan(0);
    const checks = listing('checks', 'es');
    expect(checks.rows.every((r) => r.article !== '—' || /^[A-Z]/.test(String(r.check)) === false)).toBe(true);
    expect(checks.rows.filter((r) => r.article !== '—').length).toBeGreaterThan(checks.rows.length / 2);
    const steel = listing('quantities', 'es').rows.find((r) => r.unit === 'kg' && String(r.item).startsWith('Acero'))!;
    expect(steel.gross as number).toBeCloseTo((steel.net as number) * 1.1, 9);
    // Columns and a filter chosen for a listing.
    setListingConfig('beams', { columns: ['member', 'check', 'ratio', 'article'], failingOnly: false, text: 'Shear' });
    const b = listing('beams', 'es');
    expect(b.columns.map((c) => c.key)).toEqual(['member', 'check', 'ratio', 'article']);
    expect(b.rows.every((r) => String(r.check).includes('Shear'))).toBe(true);
  });
});

describe('the bar schedule for bending machines', () => {
  it('one BVBS record per mark of the issued document, each closed by its checksum', () => {
    project();
    const doc = detailingStore.buildDocument({ author: 'QA', at: '2026-10-19T12:00:00Z' })!;
    const text = bvbsOfDocument(doc, 'E-05');
    const lines = text.split('\r\n').filter(Boolean);
    const marks = doc.assemblies.flatMap((a) => a.source.marks);
    expect(lines).toHaveLength(marks.length);
    for (const l of lines) {
      const m = /^(BF2D@.*@C)(\d+)@$/.exec(l)!;
      expect(m).not.toBeNull();
      expect(Number(m[2])).toBe(bvbsChecksum(m[1]!));
      expect(l).toMatch(/@rE-05@/);
    }
    // The first mark's count, diameter and length as the schedule states them.
    const mk = marks[0]!;
    expect(lines[0]).toContain(`@p${mk.mark}@l${Math.round(mk.cuttingLength * 1000)}@n${mk.quantity}@`);
    expect(lines[0]).toContain(`@d${mk.diameterMm}@`);
  });
});
