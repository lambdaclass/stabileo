import { describe, it, expect, beforeAll } from 'vitest';
import audit from '../../../../../docs/results-changes/2198-round23-span-lateral-audit.json';
import { cirsoc201Adapter } from '../../engine/design/adapters/cirsoc201-adapter';
import type { ProvidedReinforcement } from '../../design-contract/reinforcement';
import { verificationStore } from '../verification.svelte';
import { building, designAndDocument, designPlace } from './span-fixture';
import { anchorageCoherence } from './anchorage-coherence';
import { memoriaInput } from '../memoria-inputs';
import { projectIfcInput } from '../ifc-export';
import { designSheets } from '../design-exchange';
import { lateralReadingFor } from '../lateral-system';
import * as wasmSolver from '../../engine/wasm-solver';
import '../../engine/design/adapters/unsupported-adapter';
import type { DocumentModel } from '../../engine/detailing/document-model';

beforeAll(async () => {
  await new Promise((r) => setTimeout(r, 0));
  expect(wasmSolver.isSolverReady(), 'real WASM solver required').toBe(true);
});

const tr = (k: string) => k;
const beamCtxs = () => [...verificationStore.contexts.values()].filter((c) => c.elementType === 'beam');
const beamSpans = () => [...new Map(beamCtxs().map(c => [c.span?.key ?? `e${c.elementId}`, c])).values()];
const spanOutcomes = () => {
  const by = new Map<string, string>();
  for (const c of beamCtxs()) {
    const o = verificationStore.outcomeFor(c.elementId)!;
    by.set(c.span?.key ?? `e${c.elementId}`, `${o.outcome}${o.limiting.length ? ` ${o.limiting.join(',')}` : ''}`);
  }
  const counts: Record<string, number> = {};
  for (const v of by.values()) counts[v] = (counts[v] ?? 0) + 1;
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

function expectFyAtEveryBottomEnd() {
  for (const c of beamSpans()) {
    if (verificationStore.outcomeFor(c.elementId)?.outcome !== 'VERIFIED') continue;
    const ends = verificationStore.providedFor(c.elementId)!.supportAnchorage!
      .filter(v => v.position === 'bottom' && v.support === 'end');
    expect(ends.length, `e${c.elementId}`).toBeGreaterThan(0);
    for (const v of ends) {
      expect(v.rule, `e${c.elementId} ${v.end}`).toBe('ldh');
      expect(v.solution, `e${c.elementId} ${v.end}`).toBe('hook');
      expect(v.available, `e${c.elementId} ${v.end}`).toBeGreaterThanOrEqual(v.required);
    }
  }
  expect([...bottomRules()].sort()).toEqual(['ldh']);
}

function expectUndeclaredReaders() {
  const designed = beamCtxs().filter(c => verificationStore.outcomeFor(c.elementId)?.outcome === 'VERIFIED'
    && verificationStore.providedFor(c.elementId)?.supportAnchorage?.some(v => v.position === 'bottom' && v.support === 'end'));
  expect(designed.length).toBeGreaterThan(0);
  const readers = readersOf();
  for (const c of designed) {
    const r = readers(c.elementId);
    expect(r.desk[0], `e${c.elementId}`).toBe('undeclared');
    expect(r.desk[1], `e${c.elementId}`).toBe(verificationStore.memberVerdict(c.elementId).status);
    expect(r.memoria, `e${c.elementId}`).toEqual(['lateral.reading.undeclared', '9.7.3.8.2', 'ℓ ≥ ℓd, ℓdh (fy)', 'lateral.reading.undeclared', 'ok']);
    expect(r.ifc[0]).toBe('not declared: designed as part of the lateral-force-resisting system, fy developed at the face (CIRSOC 201-2025 9.7.3.8.2)');
    expect(r.workbook).toEqual(['9.7.3.8.2', 'ℓ ≥ ℓd, ℓdh (fy)', 'ok', 'lateral.reading.undeclared']);
  }
}

function readingCensus() {
  const memo = memoriaInput(tr, 'es');
  const census: Record<string, number> = {};
  for (const c of beamCtxs()) {
    if (verificationStore.outcomeFor(c.elementId)?.outcome !== 'VERIFIED') continue;
    const open = memo.elements.find(e => e.id === `e${c.elementId}`)!.rows
      .filter(r => r.status !== 'ok' && r.titleKey !== 'check.slabColumnJoint').map(r => r.titleKey);
    const word = verificationStore.getDisplayStatus(c.elementId) === 'fail' ? 'fail' : verificationStore.localStatus(c.elementId);
    const k = `${word}:${[...new Set(open)].join('+')}`;
    census[k] = (census[k] ?? 0) + 1;
  }
  for (const k of Object.keys(census)) expect(k, k).not.toMatch(/check\.rc\.(lateralAnchorage|anchorage)/);
  return census;
}

function expectedSpanOutcomes() {
  const counts: Record<string, number> = {};
  for (const o of audit.after) {
    const key = `${o.outcome}${o.limiting.length ? ` ${o.limiting.join(',')}` : ''}`;
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

describe('the span fixture at 40×40, its beams\' role not declared', () => {
  let doc: DocumentModel;
  beforeAll(() => {
    building(1, { columnSide: 0.4, lateral: null });
    doc = designAndDocument();
  }, 600_000);

  it('every span matches the lateral acceptance inventory', () => {
    const actual = beamSpans().map(c => {
      const o = verificationStore.outcomeFor(c.elementId)!;
      return { id: c.elementId, outcome: o.outcome, limiting: o.limiting };
    });
    expect(actual).toEqual(audit.after);
  });

  it('designs them as part of the system: exact span statuses, every accepted bottom end in a column developing fy', () => {
    expect(beamCtxs().every(c => c.lateral?.role === 'undeclared')).toBe(true);
    expect(spanOutcomes()).toEqual(expectedSpanOutcomes());
    expectFyAtEveryBottomEnd();
  });

  it('audits every former accepted span against closure and every retained proposal against its exact limits', () => {
    expect(audit.lost.map(r => r.id)).toEqual([37, 43, 54, 60, 70, 87, 104]);
    for (const r of audit.lost) {
      const ctx = verificationStore.contextFor(r.id)!;
      expect(designPlace(ctx)).toBe(r.place);
      const old = cirsoc201Adapter.verify(ctx, r.previous as ProvidedReinforcement);
      expect(old.overallStatus, `e${r.id}`).toBe('fail');
      expect(old.jointThreading, `e${r.id}`).toEqual(r.previousThreading);
      expect(old.checks.filter(c => c.status === 'fail').map(c => c.limiting)).toEqual(['congestion', 'congestion']);
      const o = verificationStore.outcomeFor(r.id)!;
      expect(o.outcome).toBe('SEARCH_EXHAUSTED');
      expect(o.accepted).toBeUndefined();
      expect(o.certificate).toBeUndefined();
      expect(o.exhaustion).toEqual(r.exhaustion);
      expect(o.provisional!.verdict.checks.filter(c => c.status !== 'ok')).toEqual(r.retainedChecks);
      expect(o.provisional!.verdict.supportAnchorage!.filter(v => v.solution === 'unresolved')
        .map(({ cage: _cage, ...v }) => v)).toEqual(r.retainedAnchorage);
    }
  });

  it('the detailing builds every bar end the design verified', () => {
    const c = anchorageCoherence(doc.assemblies.flatMap(a => a.bars));
    expect(c.mismatches).toEqual([]);
    expect(c.compared).toBe(32);
  });

  it('every designed beam states the assumption: desk, memoria, IFC, workbook', expectUndeclaredReaders);

  it('the conservative design retains its exact independent holds and no anchorage reading fails', () => {
    expect(readingCensus()).toEqual({ 'fail:check.rc.torsion': 10, 'warn:check.rc.minSteel': 5 });
    const c = verificationStore.contextFor(48)!;
    expect(verificationStore.localStatus(c.elementId)).toBe('warn');
    expect(verificationStore.memberVerdict(c.elementId).holds.map(h => h.kind)).toEqual(['analysis']);
    expect(verificationStore.getDisplayStatus(c.elementId)).toBe('unavailable');
    const ifc = readersOf()(c.elementId).ifc;
    expect(ifc[0]).toBe('not declared: designed as part of the lateral-force-resisting system, fy developed at the face (CIRSOC 201-2025 9.7.3.8.2)');
    expect(ifc[1]).not.toBe('fails');
  });

  it('a refused beam says it was refused under that assumption', () => {
    const refused = beamCtxs().filter(c => verificationStore.outcomeFor(c.elementId)?.outcome !== 'VERIFIED');
    expect(beamSpans().filter(c => verificationStore.outcomeFor(c.elementId)?.outcome !== 'VERIFIED')).toHaveLength(11);
    expect(refused.length).toBeGreaterThan(0);
    const memo = memoriaInput(tr, 'es');
    for (const c of refused) {
      const el = memo.elements.find(e => e.id === `e${c.elementId}`)!;
      expect(el.data.find(([k]) => k === 'lateral.symbol')?.[1]).toBe('lateral.reading.undeclared');
      expect(verificationStore.getDisplayStatus(c.elementId)).not.toMatch(/^(ok|warn)$/);
    }
  });
});

describe('the span fixture at 50×50, its beams\' role not declared', () => {
  let doc: DocumentModel;
  beforeAll(() => {
    building(1, { columnSide: 0.5, lateral: null });
    doc = designAndDocument();
  }, 600_000);

  it('keeps all 14 spans designed with every bottom end in a column developing fy', () => {
    expect(beamCtxs().every(c => c.lateral?.role === 'undeclared')).toBe(true);
    expect(spanOutcomes()).toEqual({ VERIFIED: 14 });
    expectFyAtEveryBottomEnd();
  });

  it('the detailing builds more than 50 verified bar ends coherently', () => {
    const c = anchorageCoherence(doc.assemblies.flatMap(a => a.bars));
    expect(c.mismatches).toEqual([]);
    expect(c.compared).toBeGreaterThan(50);
  });

  it('every designed beam states the assumption: desk, memoria, IFC, workbook', expectUndeclaredReaders);

  it('keeps locally correct answers while the independent generation and analysis holds remain visible', () => {
    readingCensus();
    const correct = beamCtxs().filter(c => verificationStore.localStatus(c.elementId) === 'ok'
      && verificationStore.providedFor(c.elementId)?.supportAnchorage?.some(v => v.position === 'bottom' && v.support === 'end'));
    expect(correct.length).toBeGreaterThan(0);
    const readers = readersOf();
    for (const c of correct) {
      expect(verificationStore.memberVerdict(c.elementId).holds.map(h => h.kind)).toEqual(['analysis', 'detailing']);
      expect(verificationStore.getDisplayStatus(c.elementId)).toBe('fail');
      expect(readers(c.elementId).ifc[1]).toBe('not fully verified');
    }
  });
});

describe('the same building, its beams declared outside the system', () => {
  beforeAll(() => {
    building(1, { columnSide: 0.4, lateral: 'gravity' });
    designAndDocument();
  }, 600_000);

  it('designs the 14 spans, every bottom end cut 150 mm past the face, and every reader says it was declared', () => {
    expect(beamCtxs().every((c) => c.lateral?.role === 'gravity' && c.lateral.source === 'project')).toBe(true);
    expect(spanOutcomes()).toEqual({ VERIFIED: 14 });
    expect([...bottomRules()]).toEqual(['9.7.3.8.2']);
    const c = beamCtxs().find((x) => verificationStore.providedFor(x.elementId)?.supportAnchorage?.some((v) => v.position === 'bottom' && v.support === 'end'))!;
    const r = readersOf()(c.elementId);
    expect(r.memoria).toEqual(['lateral.reading.gravity', '9.7.3.8.2', 'ℓ ≥ 150 mm', 'lateral.reading.gravity', 'ok']);
    expect(r.ifc[0]).toBe('not part of the lateral-force-resisting system (declared)');
    expect(r.workbook).toEqual(['9.7.3.8.2', 'ℓ ≥ 150 mm', 'ok', 'lateral.reading.gravity']);
  });
});
