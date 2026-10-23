import { readFileSync, writeFileSync } from 'node:fs';
import { expect, it, vi } from 'vitest';
import { frameDesignQuality, currentFrameDesignQuality } from './design-quality-fixture';
import { modelStore } from '..';
import { verificationStore } from '../verification.svelte';
import { detailingStore } from '../detailing.svelte';
import { detailableReinforcement, type MemberDesignOutcome } from '../../engine/design/outcome';
import type { PhysicalRepairOperator } from '../../engine/detailing/physical-design-search';
import { physicallyBlockedMembers } from '../../engine/detailing/physical-design-search';
import * as physicalSearch from '../../engine/detailing/physical-design-search';
import { detailRegressionReasons } from '../../engine/detailing/detail-regression';
import * as detailEngine from '../../engine/detailing/run-detailing';
import { rebarHash } from '../../engine/design/rebar-hash';
import { cirsoc201Adapter } from '../../engine/design/adapters/cirsoc201-adapter';
import { beamCageContinuityAlternatives, beamContinuityAlternatives } from '../../engine/detailing/beam-continuity-alternatives';
import { beamCornerRecord } from '../../engine/design/end-support-anchorage';
import { designMember } from '../../engine/design/candidate-search';

// Forensic continuation of a saved audit. Forces are solved again; only its reinforcement
// assignment is restored. Every comparison below uses a newly generated full detail.
it.runIf(!!process.env.STABILEO_REPAIR_SNAPSHOT)('reverifies a retained reinforcement assignment', async () => {
  const saved = JSON.parse(readFileSync(process.env.STABILEO_REPAIR_SNAPSHOT!, 'utf8'));
  await frameDesignQuality();
  const outcomes = new Map<number, MemberDesignOutcome>(saved.members.map((m: { id: number; outcome: MemberDesignOutcome }) => [m.id, m.outcome]));
  modelStore.reinforcementTransaction(api => {
    for (const [id, o] of outcomes) {
      const rebar = detailableReinforcement(o)?.rebar;
      // Refused members have no retained steel. Clear any seed supplied by the fresh model.
      api.setReinforcement(id, rebar);
    }
  });
  verificationStore.setDesignOutcomes({ ...verificationStore.runSummary!, outcomes });
  expect(detailingStore.generate(), detailingStore.lastError ?? '').not.toBeNull();
  const restored = currentFrameDesignQuality();
  const initialDetail = detailingStore.lastRun!;
  // Diagnose whether exhausted nominal searches can recover against the retained neighbours.
  // These proposals are evidence only; they are never installed without a full-detail gate.
  const reopened: unknown[] = [];
  if (process.env.STABILEO_REPAIR_REOPEN) {
    const corners = new Map();
    const absent = new Set<number>();
    for (const [id, ctx] of verificationStore.contexts) {
      if (ctx.elementType !== 'beam') continue;
      const record = beamCornerRecord(detailableReinforcement(outcomes.get(id))?.rebar, ctx.material.stirrupDia);
      if (record) corners.set(id, record); else absent.add(id);
    }
    for (const [id, prior] of outcomes) {
      const ctx = verificationStore.contexts.get(id);
      if (prior.outcome !== 'SEARCH_EXHAUSTED' || ctx?.elementType !== 'beam' || ctx.span) continue;
      const next = designMember(cirsoc201Adapter, { ...ctx, beamCorners: corners, absentBeams: absent });
      reopened.push({ elementId: id, outcome: next });
    }
  }
  // Recheck saved rejected catalog proposals without repeating expensive full detailing.
  // This mode is for a sweep with no accepted changes: all trials share the restored assignment.
  const nominalFailures: unknown[] = [];
  if (process.env.STABILEO_REPAIR_PROPOSALS) {
    const ids = process.env.STABILEO_REPAIR_PROPOSALS.split(',').map(Number);
    const ctx = ids.map(id => verificationStore.contexts.get(id)!);
    const current = ids.map(id => outcomes.get(id)!.accepted!);
    const demand = ['harmonizeDemandCatalog', 'harmonizeCoupledCatalog'].includes(process.env.STABILEO_REPAIR_OPERATOR ?? '');
    for (const proposal of beamCageContinuityAlternatives(ctx, current,
      demand ? 'all' : process.env.STABILEO_REPAIR_OPERATOR === 'harmonizeMixedCageCatalog' ? 'mixed' : 'common',
      demand ? 'demand' : 'retained')) {
      const corners = new Map(ctx[0].beamCorners);
      ids.forEach((id, i) => corners.set(id, beamCornerRecord(proposal.reinforcement[i], ctx[i].material.stirrupDia)!));
      nominalFailures.push({ elementIds: ids, diameterMm: proposal.layers[0].diameter,
        counts: proposal.layers.map(l => l.count), bottomCounts: proposal.bottomLayers!.map(l => l.count),
        bottomDiameterMm: proposal.bottomLayers![0].diameter,
        failed: ids.flatMap((id, i) => {
          const verdict = cirsoc201Adapter.verify({ ...ctx[i], beamCorners: corners }, proposal.reinforcement[i]);
          const checks = verdict.checks.filter(c => c.status === 'fail' || c.anchorHook);
          return checks.length ? [{ elementId: id, checks }] : [];
        }) });
    }
  }
  if (process.env.STABILEO_REPAIR_NOMINAL_AUDIT) {
    const audit = JSON.parse(readFileSync(process.env.STABILEO_REPAIR_NOMINAL_AUDIT, 'utf8'));
    expect(restored).toEqual(audit.before);
    expect(audit.search.trials.some((t: { disposition: string }) => t.disposition === 'accepted')).toBe(false);
    for (const trial of audit.search.trials.filter((t: { disposition: string }) => t.disposition === 'nominalFailure')) {
      expect(trial.operator).toBe('harmonizeTopCatalog');
      const ids: number[] = trial.elementIds;
      const ctx = ids.map(id => verificationStore.contexts.get(id)!);
      const current = ids.map(id => outcomes.get(id)!.accepted!);
      const proposal = [...beamContinuityAlternatives(ctx, current, 'top', 'catalog')]
        .find(p => p.layers[0].diameter === trial.diameterMm && JSON.stringify(p.layers.map(l => l.count)) === JSON.stringify(trial.counts));
      expect(proposal).toBeDefined();
      const corners = new Map(ctx[0].beamCorners);
      ids.forEach((id, i) => corners.set(id, beamCornerRecord(proposal!.reinforcement[i], ctx[i].material.stirrupDia)!));
      const failed = ids.flatMap((id, i) => {
        const verdict = cirsoc201Adapter.verify({ ...ctx[i], beamCorners: corners }, proposal!.reinforcement[i]);
        const checks = verdict.checks.filter(c => c.status === 'fail' || c.anchorHook);
        return checks.length ? [{ elementId: id, checks }] : [];
      });
      expect(failed.map(f => f.elementId)).toEqual(trial.nominalFailures);
      nominalFailures.push({ elementIds: ids, diameterMm: trial.diameterMm, counts: trial.counts, failed });
    }
  }
  const attempts: unknown[] = [];
  const run = detailEngine.runDetailing;
  const spy = process.env.STABILEO_REPAIR_TRACE ? vi.spyOn(detailEngine, 'runDetailing') : undefined;
  spy?.mockImplementation(input => {
    const result = run(input);
    const changed = [...input.outcomes].filter(([id, o]) => rebarHash(detailableReinforcement(o)?.rebar)
      !== rebarHash(detailableReinforcement(outcomes.get(id))?.rebar)).map(([id, o]) => ({ id, reinforcement: detailableReinforcement(o)?.rebar }));
    if (changed.length) {
      const blockedBefore = physicallyBlockedMembers(initialDetail);
      const newlyBlocked = [...physicallyBlockedMembers(result)].filter(id => !blockedBefore.has(id));
      const changedIds = new Set(changed.map(m => m.id));
      attempts.push({ changed, regressionsFromSnapshot: detailRegressionReasons(initialDetail, result), newlyBlocked,
        newConflicts: result.assemblies.flatMap(a => a.conflicts).filter(c => c.elementIds.some(id => newlyBlocked.includes(id))),
        newConditions: result.assemblies.flatMap(a => a.unsupported.filter(u =>
          (u.scope?.elementIds ?? a.elementIds).some(id => newlyBlocked.includes(id)))),
        ...(process.env.STABILEO_REPAIR_GEOMETRY ? {
          changedLongitudinal: result.assemblies.flatMap(a => a.bars.filter(b => b.role === 'longitudinal'
            && b.ownerElementIds.some(id => changedIds.has(id)))),
          changedLapConditions: result.assemblies.flatMap(a => a.unsupported.filter(u => u.key.startsWith('detailing.lapCheck.')
            && (u.scope?.elementIds ?? a.elementIds).some(id => changedIds.has(id)))),
          changedLaps: result.lapping?.laps.filter(l => changedIds.has(l.fromElementId!) || changedIds.has(l.toElementId!)),
          lapConditions: result.assemblies.flatMap(a => a.unsupported.filter(u => u.key.startsWith('detailing.lapCheck.'))),
        } : {}),
      });
    }
    // The audit retains only the evidence above. Vitest otherwise holds every full building
    // geometry in mock.results, exhausting the worker heap on longer diagnostic sweeps.
    spy.mockClear();
    return result;
  });
  const runs = process.env.STABILEO_REPAIR_RUNS ?? process.env.STABILEO_REPAIR_CATALOG;
  const targets = process.env.STABILEO_REPAIR_TARGETS?.split(',').map(Number);
  const searchImpl = physicalSearch.searchPhysicalDesignAlternatives;
  const targetSpy = targets ? vi.spyOn(physicalSearch, 'searchPhysicalDesignAlternatives').mockImplementation(input =>
    searchImpl({ ...input, lockedMembers: new Set([...(input.lockedMembers ?? []),
      ...[...input.contexts.keys()].filter(id => !targets.includes(id))]) })) : undefined;
  try {
    if (runs) expect(detailingStore.generate({ physicalSearch: {
      maxDetailingRuns: Number(runs), maxMemberSearches: 512,
      operators: (process.env.STABILEO_REPAIR_OPERATOR ?? 'harmonizeTopCatalog')
        .split(',').map(s => s.trim()) as PhysicalRepairOperator[],
    } }), detailingStore.lastError ?? '').not.toBeNull();
  } finally { spy?.mockRestore(); targetSpy?.mockRestore(); }
  const after = currentFrameDesignQuality();
  const detail = detailingStore.lastRun!;
  const search = detailingStore.lastFeedbackLoop?.physicalSearch;
  const evidence = { before: saved.after, restored, after, attempts, nominalFailures, reopened,
    search: search ? { trials: search.trials, stats: search.stats, termination: search.termination, changed: search.changed } : undefined,
    reverification: detail.reverification,
    failedChecks: detail.reverification.filter(r => r.status === 'fail').map(r => {
      const ctx = verificationStore.contexts.get(r.elementId)!;
      const rebar = detailableReinforcement(verificationStore.outcomeFor(r.elementId))!.rebar;
      return { elementId: r.elementId, finalGeometry: r.finalGeometry,
        nominal: cirsoc201Adapter.verify(ctx, rebar).checks.filter(c => c.status === 'fail'),
        final: cirsoc201Adapter.verify({ ...ctx, finalGeometry: r.finalGeometry }, rebar).checks.filter(c => c.status === 'fail') };
    }),
    assemblies: detail.assemblies, lapping: detail.lapping, layering: detail.layering,
    members: [...verificationStore.contexts].map(([id, ctx]) => ({ id, kind: ctx.elementType,
      section: ctx.section, material: ctx.material, verdict: verificationStore.memberVerdict(id),
      outcome: verificationStore.outcomeFor(id) })),
  };
  writeFileSync(process.env.STABILEO_REPAIR_AUDIT ?? '/tmp/design-next-conflicts.json', JSON.stringify(evidence,
    (_k, v) => v instanceof Map ? Object.fromEntries(v) : v instanceof Set ? [...v] : v));
  console.log(JSON.stringify({ before: saved.after.output, after: after.output,
    lost: saved.after.verifiedIds.filter((id: number) => !after.verifiedIds.includes(id)) }));
  expect(after.verifiedIds).toEqual(expect.arrayContaining(saved.after.verifiedIds));
  expect(after.output.passingWithBlockingConflicts).toEqual([]);
  expect(after.output.blockingConflicts).toBeLessThanOrEqual(saved.after.output.blockingConflicts);
  expect(detailingStore.generate()).not.toBeNull();
  expect(currentFrameDesignQuality()).toEqual(after);
}, 600_000);
