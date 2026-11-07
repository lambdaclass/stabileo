import { describe, it, expect, afterAll } from 'vitest';
import * as engine from '../../../lib/engine/wasm-solver';
import { EXAMPLES } from '../catalog';
import { defaults, refusedOutcome, type Example, type Outcome, type Param, type Values } from '../define';
import { exampleStrings } from '../strings';
import { rcColumn, barsTied } from '../rc-column';

const LOCALES = ['en', 'es', 'pt', 'de', 'fr', 'tr'] as const;
const CERTIFICATE_STATUSES = ['certified', 'uncertified', 'failed', 'unavailable'];
const MAX_REFUSED_SHARE = 0.2;
const SAMPLES = 300;

const REFERENCE_TOLERANCE: Record<string, Record<string, number>> = {
  'beam-frame': { maxMoment: 1e-9, maxDeflection: 1e-9 },
  'slab-on-columns': { maxDeflection: 0.02 },
  'rc-column': { squashLoad: 1e-9, balancedP: 1e-6, balancedM: 1e-6 },
  outrigger: { topDrift: 1e-6, bareDrift: 1e-6, columnForce: 1e-6 },
  tower: { f1: 1e-4, f2: 1e-3, f3: 5e-3, bucklingFactor: 1e-4, criticalLoad: 1e-4 },
};

const EXPECTED_REFUSALS: Record<string, string> = { 'beam-frame load=0': 'noLoad' };

type Case = { name: string; values: Values };

function settings(p: Param): number[] {
  if (p.options) return p.options.map((_, k) => k);
  return [...new Set([p.min, p.max])];
}

function grid(p: Param): number[] {
  if (p.options) return p.options.map((_, k) => k);
  const n = Math.round((p.max - p.min) / p.step);
  return Array.from({ length: n + 1 }, (_, k) => Number((p.min + k * p.step).toPrecision(12)));
}

function label(values: Values): string {
  return Object.entries(values).map(([k, v]) => `${k}=${v}`).join(' ');
}

function cases(example: Example<any>): Case[] {
  const out: Case[] = [{ name: 'defaults', values: {} }];
  for (const p of example.params) for (const at of settings(p)) out.push({ name: label({ [p.key]: at }), values: { [p.key]: at } });
  example.params.forEach((p, i) => example.params.slice(i + 1).forEach(q => {
    for (const a of settings(p)) for (const b of settings(q)) out.push({ name: label({ [p.key]: a, [q.key]: b }), values: { [p.key]: a, [q.key]: b } });
  }));
  return out;
}

function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function solve(example: Example<any>, extra: Values): { outcome: Outcome; crash?: string } {
  const values = { ...defaults(example.params), ...extra };
  try {
    return { outcome: example.analyses(example.build(values), values, engine) };
  } catch (error) {
    const text = error instanceof Error ? error.message : String(error);
    const fromEngine = text.includes('structuredDiagnostics');
    return { outcome: refusedOutcome(error), crash: fromEngine ? undefined : `${error instanceof Error ? error.name : typeof error}: ${text}` };
  }
}

function hasString(key: string): boolean {
  return LOCALES.every(locale => typeof (exampleStrings[locale] as Record<string, string>)[key] === 'string' && (exampleStrings[locale] as Record<string, string>)[key].trim() !== '');
}

function problems(example: Example<any>, extra: Values): string[] {
  const { outcome, crash } = solve(example, extra);
  const found: string[] = [];
  if (crash) found.push(`threw outside the engine: ${crash}`);
  if (outcome.status === 'refused') {
    if (!hasString(`refuse.${outcome.code}`)) found.push(`refusal code ${outcome.code} has no string in every locale`);
    if (outcome.reason !== undefined && (typeof outcome.reason !== 'string' || /[{}]/.test(outcome.reason))) found.push(`refusal reason is not a sentence: ${outcome.reason}`);
    return found;
  }
  if (outcome.status !== 'ok') return [`unknown status ${(outcome as { status: unknown }).status}`];
  const tolerances = REFERENCE_TOLERANCE[example.id] ?? {};
  for (const r of outcome.readouts) {
    if (!Number.isFinite(r.value)) found.push(`readout ${r.key} = ${r.value}`);
    if (typeof r.unit !== 'string') found.push(`readout ${r.key} has no unit`);
    if (!hasString(`r.${r.key}`)) found.push(`readout ${r.key} has no string`);
    if (!r.reference) continue;
    if (!Number.isFinite(r.reference.value)) { found.push(`reference ${r.key} = ${r.reference.value}`); continue; }
    const tolerance = tolerances[r.key];
    if (tolerance === undefined) { found.push(`reference ${r.key} has no stated tolerance`); continue; }
    const gap = r.reference.value === 0 ? Math.abs(r.value) : Math.abs(r.value / r.reference.value - 1);
    if (!(gap <= tolerance)) found.push(`readout ${r.key} = ${r.value} is ${gap.toPrecision(3)} from its reference ${r.reference.value} (${r.reference.source}), over ${tolerance}`);
  }
  const c = outcome.certificate;
  if (!c || !CERTIFICATE_STATUSES.includes(c.status)) found.push(`certificate status ${c?.status}`);
  else if (c.status === 'certified') {
    if (c.bound !== null && !Number.isFinite(c.bound)) found.push(`certificate bound ${c.bound}`);
  } else if (!hasString(`cert.code.${c.code}`)) found.push(`certificate code ${c.code} has no string`);
  const views = Object.entries(outcome.views);
  if (views.length === 0) found.push('no view');
  for (const [key, view] of views) {
    const segments = view.cells.length / view.cellSize;
    if (!(segments >= 1) || !Number.isInteger(segments)) found.push(`view ${key} has ${segments} cells`);
    if (!view.xy.every(Number.isFinite)) found.push(`view ${key} has a non-finite coordinate`);
    if (view.cells.some(i => !(i >= 0 && i < view.xy.length / 2))) found.push(`view ${key} indexes a missing node`);
    if (!view.values.every(Number.isFinite)) found.push(`view ${key} has a non-finite value`);
    if (view.values.length !== (view.perCell ? segments : view.xy.length / 2)) found.push(`view ${key} has ${view.values.length} values`);
    const [x0, y0, x1, y1] = view.bounds;
    if (![x0, y0, x1, y1].every(Number.isFinite) || !(x1 > x0) || !(y1 > y0)) found.push(`view ${key} bounds ${view.bounds}`);
    if (!(view.range.max >= view.range.min) || !Number.isFinite(view.range.min) || !Number.isFinite(view.range.max)) found.push(`view ${key} range ${view.range.min}..${view.range.max}`);
    if (view.legend?.scale !== undefined && !(Number.isFinite(view.legend.scale) && view.legend.scale > 0)) found.push(`view ${key} legend scale ${view.legend.scale}`);
    if (!hasString(`pane.${key}`)) found.push(`view ${key} has no string`);
  }
  for (const chart of outcome.charts) {
    if (chart.points.length === 0) found.push(`chart ${chart.key} is empty`);
    if (!chart.points.flat().every(Number.isFinite)) found.push(`chart ${chart.key} has a non-finite point`);
    if (chart.marker !== undefined && !Number.isFinite(chart.marker)) found.push(`chart ${chart.key} marker ${chart.marker}`);
    for (const o of chart.overlays ?? []) if (o.points.length === 0 || !o.points.flat().every(Number.isFinite)) found.push(`chart ${chart.key} overlay ${o.key} is empty or non-finite`);
    if (!hasString(`c.${chart.key}`)) found.push(`chart ${chart.key} has no string`);
  }
  for (const note of outcome.notes) if (!hasString(`note.${note}`)) found.push(`note ${note} has no string`);
  return found;
}

const shares: string[] = [];
afterAll(() => console.log(`refused share of the slider space (${SAMPLES} seeded samples each):\n${shares.join('\n')}`));

describe.each(EXAMPLES.map(e => [e.id, e] as const))('example %s across its sliders', (id, example) => {
  it('solves at the defaults', () => {
    expect(solve(example, {}).outcome.status).toBe('ok');
  });

  it('solves or refuses cleanly at every slider extreme, every pair of extremes and every option', () => {
    const found: string[] = [];
    for (const c of cases(example)) for (const p of problems(example, c.values)) found.push(`${c.name}: ${p}`);
    expect(found).toEqual([]);
  });

  it('refuses each single slider extreme only where expected', () => {
    const found: string[] = [];
    for (const p of example.params) for (const at of settings(p)) {
      const name = `${id} ${p.key}=${at}`;
      const { outcome } = solve(example, { [p.key]: at });
      const got = outcome.status === 'refused' ? outcome.code : 'ok';
      if (got !== (EXPECTED_REFUSALS[name] ?? 'ok')) found.push(`${name}: ${got}`);
    }
    expect(found).toEqual([]);
  });

  it(`refuses less than ${MAX_REFUSED_SHARE * 100}% of a seeded sample of the slider space, and every sample is clean`, () => {
    const random = mulberry32(0x5eed + id.length * 7919 + id.charCodeAt(0));
    const grids = example.params.map(grid);
    let refused = 0;
    const codes: Record<string, number> = {};
    const found: string[] = [];
    for (let k = 0; k < SAMPLES; k++) {
      const values = Object.fromEntries(example.params.map((p, i) => [p.key, grids[i][Math.floor(random() * grids[i].length)]]));
      for (const p of problems(example, values)) found.push(`${label(values)}: ${p}`);
      const { outcome } = solve(example, values);
      if (outcome.status === 'refused') { refused++; codes[outcome.code] = (codes[outcome.code] ?? 0) + 1; }
    }
    shares.push(`${id}: ${(100 * refused / SAMPLES).toFixed(1)}% ${JSON.stringify(codes)}`);
    expect(found).toEqual([]);
    expect(refused / SAMPLES).toBeLessThan(MAX_REFUSED_SHARE);
  });
});

describe('rc-column width', () => {
  it('solves at every width with the default three bars per face, and still refuses an untied middle bar', () => {
    const b = rcColumn.params.find(p => p.key === 'b')!;
    expect([b.min, b.max]).toEqual([0.25, 0.45]);
    for (const width of grid(b)) {
      const { outcome } = solve(rcColumn, { b: width });
      expect(outcome.status === 'refused' ? outcome.code : 'ok').toBe('ok');
    }
    expect(barsTied({ ...defaults(rcColumn.params), b: 0.45, barDia: 12 })).toBe(false);
    const { outcome } = solve(rcColumn, { b: 0.45, barDia: 12 });
    expect(outcome.status === 'refused' && outcome.code).toBe('needsCrossties');
  });
});

describe('example drawings', () => {
  const ok = (id: string) => {
    const { outcome } = solve(EXAMPLES.find(e => e.id === id)!, {});
    if (outcome.status !== 'ok') throw new Error(`${id} refused`);
    return outcome;
  };

  it('give every overlay of an undeformed and a deformed shape a legend with its magnification', () => {
    const legends: Record<string, string[]> = {};
    for (const example of EXAMPLES) for (const [key, view] of Object.entries(ok(example.id).views)) {
      if (view.legend?.shape === 'deformed') expect(view.legend.scale).toBeGreaterThan(1);
      if (view.legend) (legends[example.id] ??= []).push(`${key}:${view.legend.shape}`);
    }
    expect(legends).toEqual({
      'beam-frame': ['deflection:deformed'],
      'earthquake-frame': ['deformed:deformed'],
      outrigger: ['outrigger:deformed'],
      tower: ['mode1:mode', 'mode2:mode', 'mode3:mode', 'buckling:mode'],
    });
  });

  it('draws the outrigger deformed shape at the magnification the legend states', () => {
    const out = ok('outrigger');
    const drift = out.readouts.find(r => r.key === 'topDrift')!.value / 1000;
    expect(out.views.outrigger.legend!.scale!).toBeCloseTo(40 * 3.5 * 0.08 / Math.abs(drift), 6);
  });
});
