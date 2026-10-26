/**
 * The two refusals read as what they are, wherever a refused member is read: the memoria, the
 * workbook, the IFC and the desk's notices. A section a code bound rules out states the bound and
 * its numbers; a search that ran out of the arrangements it implements states what it tried and
 * what it did not, and is not called «section inadequate».
 *
 * The span fixture on 9 × 9 cm columns: two Ø10 with the column's clear spacing do not fit inside
 * the ties (the columns: SECTION_INADEQUATE, proven), and the beams have nowhere to anchor (an
 * exhausted search).
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { verificationStore } from '../verification.svelte';
import { building } from './span-fixture';
import { designRunStore } from '../design-run.svelte';
import { memoriaInput } from '../memoria-inputs';
import { projectIfcInput } from '../ifc-export';
import { designSheets } from '../design-exchange';
import { noticesOf } from '../../engine/design/notice-catalogue';
import * as wasmSolver from '../../engine/wasm-solver';
import '../../engine/design/adapters/cirsoc201-adapter';

const tr = (k: string) => k;

beforeAll(async () => {
  await new Promise((r) => setTimeout(r, 0));
  expect(wasmSolver.isSolverReady(), 'real WASM solver required').toBe(true);
  building(null, { columnSide: 0.09 });
  // Nothing verifies, so there is no document to build: the design alone.
  designRunStore.designFamilies(['column', 'beam']);
}, 600_000);

const ctxs = (t: string) => [...verificationStore.contexts.values()].filter((c) => c.elementType === t);

describe('a proven section and an exhausted search, told apart', () => {
  it('the engine: columns SECTION_INADEQUATE with their bound, beams SEARCH_EXHAUSTED with their alternatives', () => {
    for (const c of ctxs('column')) {
      const o = verificationStore.outcomeFor(c.elementId)!;
      expect([o.outcome, o.insufficiency?.bound], `c${c.elementId}`).toEqual(['SECTION_INADEQUATE', 'minimumBarRowDoesNotFit']);
    }
    for (const c of ctxs('beam')) {
      const o = verificationStore.outcomeFor(c.elementId)!;
      expect([o.outcome, o.exhaustion?.scope], `b${c.elementId}`).toEqual(['SEARCH_EXHAUSTED', 'implementedAlternatives']);
    }
  });

  it('the memoria: the proof as the row (clause, demand, bound), or the exhaustion with its reasons', () => {
    const memo = memoriaInput(tr, 'es');
    const col = ctxs('column')[0]!, beam = ctxs('beam')[0]!;
    const proof = verificationStore.outcomeFor(col.elementId)!.insufficiency!;
    const colRow = memo.elements.find((e) => e.id === `e${col.elementId}`)!.rows[0]!;
    expect([colRow.titleKey, colRow.clause, colRow.status, colRow.demand, colRow.capacity, colRow.unit])
      .toEqual(['check.design.sectionInadequate', '25.2.3', 'fail', proof.demand, proof.capacity, 'cm']);
    expect(colRow.derivation?.[0]).toBe('design.reason.insufficiency.minimumBarRowDoesNotFit');
    const beamRow = memo.elements.find((e) => e.id === `e${beam.elementId}`)!.rows[0]!;
    expect(beamRow.titleKey).toBe('check.design.alternativesExhausted');
    expect(beamRow.derivation).toEqual(expect.arrayContaining(['design.reason.alternativesExhausted', 'design.gap.headedBars']));
  });

  it('the workbook names which refusal governs; the IFC states it beside «fails»', () => {
    const memo = memoriaInput(tr, 'es');
    const wb = designSheets(tr, 'es').find((s) => s.rows[0]?.[0] === 'element')!;
    const nameOf = (id: number) => memo.elements.find((e) => e.id === `e${id}`)!.name;
    const col = ctxs('column')[0]!, beam = ctxs('beam')[0]!;
    expect(wb.rows.find((r) => r[0] === nameOf(col.elementId))![3]).toBe('check.design.sectionInadequate');
    expect(wb.rows.find((r) => r[0] === nameOf(beam.elementId))![3]).toBe('check.design.alternativesExhausted');
    const ifc = projectIfcInput(tr, 'es', 'labels');
    const colProps = ifc.members.find((m) => m.id === String(col.elementId))!.props!;
    expect([colProps.DesignState, colProps.DesignOutcome]).toEqual(['fails', 'section inadequate']);
    expect(String(colProps.DesignReason)).toMatch(/^minimumBarRowDoesNotFit §25\.2\.3: [\d.]+ > [\d.]+ cm$/);
    const beamMember = ifc.members.find((m) => (m.id === String(beam.elementId) || (beam.span && m.id === beam.span.key)))!;
    expect([beamMember.props!.DesignState, beamMember.props!.DesignOutcome]).toEqual(['fails', 'implemented alternatives exhausted, insufficiency not shown']);
  });

  it('the desk and the report: D001 for the proof, D006 for the exhausted search', () => {
    expect(noticesOf(verificationStore.outcomeFor(ctxs('column')[0]!.elementId))[0]!.code).toBe('D001');
    expect(noticesOf(verificationStore.outcomeFor(ctxs('beam')[0]!.elementId))[0]!.code).toBe('D006');
  });
});
