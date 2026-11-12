/**
 * Each family's plan, every action on, says only its own codes: no CIRSOC or INPRES clause, ref,
 * string or message, and every case and combination from the family bound. The other way round,
 * a CIRSOC plan cites no other family. (The dialog's panes: `e2e/pro-load-families.spec.ts`.)
 */
import { describe, expect, it } from 'vitest';
import { buildLoadPlan, type LoadPlanInput } from '../../engine/loads/load-plan';
import { teAllAt } from '../../i18n/engine-text';
import type { EngineMessage } from '../message';
import { FAMILY_STACKS, type LoadFamilyChoice } from '../families/stacks';
import { findAnyOccupancy, occupancyTableFor } from '../families/occupancy-tables';
import { loadCodeFor } from '../families';
import { planInput, SEISMIC_ON } from './family-plan-helpers';
import { PSF, MPH } from '../asce7/refs';

const WIND = { enabled: true, basicSpeed: 45, exposure: 'B', enclosure: 'enclosed', siteAltitudeM: 0, kzt: 1, kztSurveyed: false, roofSlopeDeg: 0, rigid: true, directions: { x: true, y: true } } as LoadPlanInput['wind'];
const SNOW = { enabled: true, pg: 1, source: 'site', terrain: 'C', exposure: 'partial', thermal: 'normal', category: 'II', roofKind: 'gable', slippery: false } as LoadPlanInput['snow'];

const INPUTS: Record<Exclude<LoadFamilyChoice, 'cirsoc'>, { roof: string; codeInputs: LoadPlanInput['codeInputs'] }> = {
  eurocode: { roof: 'ec-C1', codeInputs: { 'en1991-1-4': { vb0: 26, terrain: 'III' }, 'en1991-1-3': { sk: 1 }, 'en1998-1': { agR: 0.3, groundType: 'C', q: 3.9 } } },
  uk: { roof: 'uk-C11', codeInputs: { 'en1991-1-4-uk': { vbMap: 22, altitude: 150, terrain: 'II' }, 'en1991-1-3-uk': { zone: 3, altitude: 205 } } },
  us: { roof: 'roofAssembly', codeInputs: {
    'asce7-22-wind': { V: 115 * MPH, exposure: 'C' }, 'asce7-22-snow': { pg: 30 * PSF },
    'asce7-22-seismic': { sds: 1.0, sd1: 0.6, s1: 0.5, tl: 8, systemKey: 'steelSMF', periodKey: 'steelMRF' },
  } },
  turkey: { roof: 'tr_roof_terrace_garden', codeInputs: { tbdy2018: { ss: 1.0, s1: 0.3, soil: 'ZC', bks: 3, system: 'A11' }, 'ts498-1997-snow': { zone: 'II', altitudeM: 900 } } },
};

const FORBIDDEN_KEYS = /^(loads\.cirsoc|loadPlan\.derivation\.(occupancy|patterns|adjacentSpans|reductionPerMember|roofOccupancy|thermalSenses|soil|roofLive|roofWeight|roofWeightUnknown|seismicSnow|verticalSeismic)$)/;

function every(p: ReturnType<typeof buildLoadPlan>): EngineMessage[] {
  return [...p.derivation, ...p.assumptions, ...p.unsupportedKeys, ...p.blockedKeys, ...p.combinations.flatMap((c) => c.notes ?? [])];
}

describe.each(Object.keys(INPUTS) as Array<Exclude<LoadFamilyChoice, 'cirsoc'>>)('%s: only its own codes', (family) => {
  const { roof, codeInputs } = INPUTS[family];
  const p = buildLoadPlan(planInput(family, {
    occupancyKey: loadCodeFor(FAMILY_STACKS[family].loads)!.role === 'loads' ? (loadCodeFor(FAMILY_STACKS[family].loads) as { defaultOccupancy?: string }).defaultOccupancy! : '',
    codeInputs, wind: WIND, snow: SNOW, ...(FAMILY_STACKS[family].seismic ? { seismic: SEISMIC_ON(false) } : {}),
    roof: { use: 'occupancy', occupancyKey: roof, dead: 2, slopeDeg: 0 }, partitionLive: 0.8, applyLiveReduction: true, patterns: 'all',
    gravity: { mode: 'panels' }, thermal: { dtUniform: 20, dtGradient: 0 }, combinationSet: 'both',
  }));
  it('is ready', () => {
    expect(p.blockedKeys).toEqual([]);
    expect(p.outcome).toBe('READY');
  });
  it('no CIRSOC or INPRES ref, message or text', () => {
    expect(p.refs.filter((r) => /^(cirsoc|inpres)/i.test(String(r.regulation)))).toEqual([]);
    const msgs = every(p);
    expect(msgs.map((m) => m.key).filter((k) => FORBIDDEN_KEYS.test(k))).toEqual([]);
    for (const loc of ['en', 'es'] as const) {
      const text = teAllAt(msgs, loc).join('\n');
      expect(text).not.toMatch(/CIRSOC|INPRES|Tabla 4\.1|Table 4\.1/);
    }
  });
  it('the cases and combinations come from the family', () => {
    const basis = FAMILY_STACKS[family].basis!;
    expect(p.generatedBy).toBe(basis);
    expect(p.combinations.length).toBeGreaterThan(0);
    for (const c of p.combinations) expect(c.origin?.code).toBe(basis);
    expect(p.cases.some((c) => c.type === 'W')).toBe(true);
    expect(p.cases.some((c) => c.type === 'S')).toBe(true);
    if (FAMILY_STACKS[family].seismic) expect(p.cases.some((c) => c.type === 'E')).toBe(true);
  });
});

describe('CIRSOC: no other family', () => {
  const p = buildLoadPlan(planInput('cirsoc', { wind: WIND, snow: SNOW, partitionLive: 0.75, applyLiveReduction: true }));
  it('cites CIRSOC alone', () => {
    expect(p.outcome).toBe('READY');
    expect(p.refs.filter((r) => /EN 19|asce|ts-498|tbdy/i.test(String(r.regulation)))).toEqual([]);
  });
});

describe('the occupancy tables', () => {
  it('no key is in two families\' tables, and each adapter lists its own', () => {
    const ids = ['cirsoc101-2025-loads', 'en1991-1-1', 'en1991-1-1-uk', 'asce7-22-loads', 'ts498-1997-loads'];
    const keys = ids.flatMap((id) => occupancyTableFor(id).map((o) => o.key));
    expect(new Set(keys).size).toBe(keys.length);
    for (const id of ids) for (const o of occupancyTableFor(id)) expect(findAnyOccupancy(o.key)).toBe(o);
    expect(occupancyTableFor('en1991-1-1').every((o) => o.key.startsWith('ec-'))).toBe(true);
  });
});
