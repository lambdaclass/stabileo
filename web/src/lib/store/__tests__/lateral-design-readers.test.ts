import { describe, it, expect, beforeAll } from 'vitest';
import { verificationStore } from '../verification.svelte';
import { building, designAndDocument } from './span-fixture';
import { anchorageCoherence } from './anchorage-coherence';
import { memoriaInput } from '../memoria-inputs';
import { projectIfcInput } from '../ifc-export';
import { designSheets } from '../design-exchange';
import { lateralReadingFor } from '../lateral-system';
import { memoElementState } from '../../report/memoria/types';
import * as wasmSolver from '../../engine/wasm-solver';
import '../../engine/design/adapters/cirsoc201-adapter';
import '../../engine/design/adapters/unsupported-adapter';
import type { DocumentModel } from '../../engine/detailing/document-model';

beforeAll(async () => {
  await new Promise((r) => setTimeout(r, 0));
  expect(wasmSolver.isSolverReady(), 'real WASM solver required').toBe(true);
});

const tr = (k: string) => k;
const perimeterRefusals = [27, 32, 38, 49, 55, 61, 66, 71, 77, 88, 94, 100];
const shearDepthSpan = 83;
const beamCtxs = () => [...verificationStore.contexts.values()].filter((c) => c.elementType === 'beam');
const spanOutcomes = () => {
  const counts: Record<string, number> = {};
  for (const c of beamCtxs()) {
    if (c.span && c.span.representative !== c.elementId) continue;
    const o = verificationStore.outcomeFor(c.elementId)!;
    const key = [o.outcome, ...o.limiting].join(' ');
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
};
const bottomRules = () => new Set(beamCtxs().flatMap((c) => (verificationStore.providedFor(c.elementId)?.supportAnchorage ?? [])
  .filter((v) => v.position === 'bottom' && v.support === 'end').map((v) => v.rule)));

function readersOf() {
  const memo = memoriaInput(tr, 'es');
  const ifc = projectIfcInput(tr, 'es', 'lateral').members;
  const wb = designSheets(tr, 'es').find((s) => s.name === 'Design checks')!;
  return (id: number) => {
    const el = memo.elements.find((e) => e.id === `e${id}`)!;
    const row = el.rows.find((r) => r.titleKey === 'check.rc.lateralAnchorage')!;
    const ctx = verificationStore.contextFor(id)!;
    const member = ifc.find((m) => m.id === (ctx.span?.key ?? String(id)))!;
    const wbRow = wb.rows.find((r) => r[0] === el.name && r[2] === 'check.rc.lateralAnchorage')!;
    return {
      desk: [lateralReadingFor(id).role, verificationStore.getDisplayStatus(id)],
      memoria: [el.data.find(([k]) => k === 'lateral.symbol')?.[1], row.clause, row.formula, row.location, row.status],
      ifc: [member.props?.LateralSystem, member.props?.DesignState],
      workbook: [wbRow[4], wbRow[5], wbRow[10], wbRow[12]],
    };
  };
}

function expectRefusals(doc: DocumentModel, role: 'undeclared' | 'gravity') {
  const memo = memoriaInput(tr, 'es');
  const ifc = projectIfcInput(tr, 'es', 'lateral').members;
  const workbook = designSheets(tr, 'es').find((s) => s.name === 'Design elements')!;
  const certified = new Set(doc.certificates.map((c) => c.elementId));
  const barOwners = new Set(doc.assemblies.flatMap((a) => a.bars.flatMap((b) => b.ownerElementIds)));
  const refusedSpans = new Set<number>();
  for (const c of beamCtxs()) {
    const id = c.elementId;
    const rep = c.span!.representative;
    const shearDepth = role === 'undeclared' && rep === shearDepthSpan;
    const outcome = verificationStore.outcomeFor(id)!;
    if (!shearDepth && !perimeterRefusals.includes(rep)) {
      expect(outcome.outcome, `e${id}`).toBe('VERIFIED');
      continue;
    }

    refusedSpans.add(rep);
    const reasons = shearDepth ? ['diag.rcShearDepth'] : ['diag.rcTorsionPerimeter', 'diag.rcTorsionSecondaryFace'];
    const where = `e${id} in span ${rep}`;
    expect(outcome.outcome, where).toBe(shearDepth ? 'UNSUPPORTED' : 'SEARCH_EXHAUSTED');
    expect(outcome.limiting, where).toEqual(shearDepth ? ['unsupportedCheck'] : ['minSteel', 'unsupportedCheck']);
    for (const reason of reasons) {
      expect(outcome.reasons, where).toContainEqual({ key: reason });
      expect(outcome.provisional?.verdict.checks, where).toContainEqual(expect.objectContaining({
        status: 'fail', limiting: 'unsupportedCheck', description: reason, ratio: Infinity,
      }));
    }
    expect(outcome.accepted, where).toBeUndefined();
    expect(outcome.certificate, where).toBeUndefined();
    expect(outcome.finalGeometryCertificate, where).toBeUndefined();
    expect(certified.has(id), where).toBe(false);
    expect(barOwners.has(id), where).toBe(false);
    expect(verificationStore.getDisplayStatus(id), where).toBe('unavailable');
    expect(verificationStore.memberVerdict(id).holds.map((h) => h.kind), where).toContain('refused');

    const el = memo.elements.find((e) => e.id === `e${id}`)!;
    expect(el.data.find(([k]) => k === 'lateral.symbol')?.[1], where).toBe(`lateral.reading.${role}`);
    const titleKey = shearDepth ? 'check.design.refused' : 'check.design.alternativesExhausted';
    const row = el.rows.find((r) => r.titleKey === titleKey);
    expect(row, where).toMatchObject({
      status: shearDepth ? 'notVerified' : 'fail',
      derivation: expect.arrayContaining(reasons),
    });
    expect(memoElementState(el), where).toBe(shearDepth ? 'open' : 'fail');
    expect(ifc.find((m) => m.id === c.span!.key)?.props?.DesignState, where)
      .toBe(shearDepth ? 'not fully verified' : 'fails');
    expect(workbook.rows.find((r) => r[0] === el.name)?.[6], where)
      .toBe(shearDepth ? 'memo.state.open' : 'memo.state.fail');
  }
  const expectedSpans = role === 'undeclared' ? [...perimeterRefusals, shearDepthSpan] : perimeterRefusals;
  expect([...refusedSpans].sort((a, b) => a - b)).toEqual([...expectedSpans].sort((a, b) => a - b));
}

function localCensus() {
  const memo = memoriaInput(tr, 'es');
  const census: Record<string, number> = {};
  for (const c of beamCtxs()) {
    if (verificationStore.outcomeFor(c.elementId)?.outcome !== 'VERIFIED') continue;
    const open = memo.elements.find((e) => e.id === `e${c.elementId}`)!.rows
      .filter((r) => r.status !== 'ok' && r.titleKey !== 'check.slabColumnJoint').map((r) => r.titleKey);
    const status = verificationStore.localStatus(c.elementId);
    const key = `${status}:${[...new Set(open)].join('+')}`;
    census[key] = (census[key] ?? 0) + 1;
  }
  return census;
}

describe('the span fixture at 40×40, its beams\' role not declared', () => {
  let doc: DocumentModel;
  beforeAll(() => {
    building(1, { columnSide: 0.4, lateral: null });
    doc = designAndDocument();
  }, 600_000);

  it('designs one span as part of the system with its bottom ends developing fy', () => {
    expect(beamCtxs().every((c) => c.lateral?.role === 'undeclared')).toBe(true);
    expect(spanOutcomes()).toEqual({ VERIFIED: 1, 'SEARCH_EXHAUSTED minSteel unsupportedCheck': 12, 'UNSUPPORTED unsupportedCheck': 1 });
    expect([...bottomRules()].sort()).toEqual(['ldh']);
  });

  it('the detailing builds every bar end the design verified', () => {
    expect(anchorageCoherence(doc.assemblies.flatMap((a) => a.bars)))
      .toEqual({ compared: 12, atEnds: 12, mismatches: [] });
  });

  it('every designed beam states the assumption: desk, memoria, IFC, workbook', () => {
    const designed = beamCtxs().filter((c) => verificationStore.outcomeFor(c.elementId)?.outcome === 'VERIFIED' && verificationStore.providedFor(c.elementId)?.supportAnchorage?.some((v) => v.position === 'bottom' && v.support === 'end'));
    expect(designed.map((c) => c.elementId)).toEqual([44, 45, 46, 47, 48]);
    const readers = readersOf();
    for (const c of designed) {
      const r = readers(c.elementId);
      expect(r.desk, `e${c.elementId}`).toEqual(['undeclared', 'unavailable']);
      expect(r.memoria, `e${c.elementId}`).toEqual(['lateral.reading.undeclared', '9.7.3.8.2', 'ℓ ≥ ℓd, ℓdh (fy)', 'lateral.reading.undeclared', 'ok']);
      expect(r.ifc, `e${c.elementId}`).toEqual(['not declared: designed as part of the lateral-force-resisting system, fy developed at the face (CIRSOC 201-2025 9.7.3.8.2)', 'not fully verified']);
      expect(r.workbook).toEqual(['9.7.3.8.2', 'ℓ ≥ ℓd, ℓdh (fy)', 'ok', 'lateral.reading.undeclared']);
    }
  });

  it('the verified pieces are near the minimum steel limit and held by the analysis', () => {
    expect(localCensus()).toEqual({ 'warn:check.rc.minSteel': 5 });
    expect(verificationStore.memberVerdict(44).holds.map((h) => h.kind)).toEqual(['analysis']);
  });

  it('every refused piece states the failed check and reads as unapproved', () => {
    expectRefusals(doc, 'undeclared');
  });
});

describe('the same building, its beams declared outside the system', () => {
  let doc: DocumentModel;
  beforeAll(() => {
    building(1, { columnSide: 0.4, lateral: 'gravity' });
    doc = designAndDocument();
  }, 600_000);

  it('designs two spans with bottom ends cut 150 mm past the face and reports the declared role', () => {
    expect(beamCtxs().every((c) => c.lateral?.role === 'gravity' && c.lateral.source === 'project')).toBe(true);
    expect(spanOutcomes()).toEqual({ VERIFIED: 2, 'SEARCH_EXHAUSTED minSteel unsupportedCheck': 12 });
    expect([...bottomRules()]).toEqual(['9.7.3.8.2']);
    const designed = beamCtxs().filter((c) => verificationStore.providedFor(c.elementId)?.supportAnchorage
      ?.some((v) => v.position === 'bottom' && v.support === 'end'));
    expect(designed.map((c) => c.elementId)).toEqual([44, 45, 46, 47, 48, 83, 84, 85, 86, 87]);
    const readers = readersOf();
    for (const c of designed) {
      const r = readers(c.elementId);
      expect(r.desk, `e${c.elementId}`).toEqual(['gravity', 'unavailable']);
      expect(r.memoria, `e${c.elementId}`).toEqual(['lateral.reading.gravity', '9.7.3.8.2', 'ℓ ≥ 150 mm', 'lateral.reading.gravity', 'ok']);
      expect(r.ifc, `e${c.elementId}`).toEqual(['not part of the lateral-force-resisting system (declared)', 'not fully verified']);
      expect(r.workbook, `e${c.elementId}`).toEqual(['9.7.3.8.2', 'ℓ ≥ 150 mm', 'ok', 'lateral.reading.gravity']);
    }
    expect(anchorageCoherence(doc.assemblies.flatMap((a) => a.bars)))
      .toEqual({ compared: 22, atEnds: 22, mismatches: [] });
  });

  it('locally conforming pieces keep their design verdict and remain held by the analysis', () => {
    expect(localCensus()).toEqual({ 'ok:': 5, 'warn:check.rc.minSteel': 5 });
    for (const c of beamCtxs().filter((c) => c.span?.representative === shearDepthSpan)) {
      expect(verificationStore.memberVerdict(c.elementId), `e${c.elementId}`).toMatchObject({
        local: 'ok', status: 'unavailable', holds: [expect.objectContaining({ kind: 'analysis' })],
      });
    }
  });

  it('every refused piece states the failed check and reads as unapproved', () => {
    expectRefusals(doc, 'gravity');
  });
});
