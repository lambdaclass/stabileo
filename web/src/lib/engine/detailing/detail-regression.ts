import type { FinalGeometryRecord, RunDetailingResult } from './run-detailing';

/**
 * A local repair must survive full detailing. Do not trade a previously verified member,
 * missing verification, or an additional physical blocker for fewer local check failures.
 * These are separate gates, not a weighted score where steel savings can cancel a failure.
 */
export function detailRegressionReasons(before: RunDetailingResult, after: RunDetailingResult): string[] {
  const reasons: string[] = [];
  const passes = (status: FinalGeometryRecord['status']) => status === 'ok' || status === 'warn';
  const next = new Map(after.reverification.map(r => [r.elementId, r]));
  for (const r of before.reverification) {
    if (!next.has(r.elementId) || (passes(r.status) && !passes(next.get(r.elementId)!.status))) {
      reasons.push(`reverification:${r.elementId}`);
    }
  }
  const counts = (r: RunDetailingResult) => [
    r.reverification.filter(v => v.status === 'fail').length,
    r.reverification.filter(v => v.status === 'noBars' || v.status === 'noVerifier').length,
    r.skipped.length,
    r.provisionalMembers.length,
    r.assemblies.reduce((n, a) => n + a.conflicts.filter(c => c.severity !== 'marginal').length, 0),
    r.assemblies.reduce((n, a) => n + a.unsupported.length, 0),
  ];
  const previous = counts(before);
  const labels = ['failedVerification', 'missingVerification', 'skipped', 'provisional', 'blockingConflicts', 'unsupported'];
  counts(after).forEach((n, i) => { if (n > previous[i]) reasons.push(labels[i]); });
  const blockers = (r: RunDetailingResult) => {
    const tally = new Map<string, number>();
    for (const a of r.assemblies) {
      for (const u of a.unsupported) tally.set(u.key, (tally.get(u.key) ?? 0) + 1);
      for (const c of a.conflicts) {
        if (c.severity === 'marginal') continue;
        const key = `conflict:${c.severity}`;
        tally.set(key, (tally.get(key) ?? 0) + 1);
      }
    }
    return tally;
  };
  const priorBlockers = blockers(before);
  for (const [key, n] of blockers(after)) if (n > (priorBlockers.get(key) ?? 0)) reasons.push(key);
  return reasons;
}

export function detailRegresses(before: RunDetailingResult, after: RunDetailingResult): boolean {
  return detailRegressionReasons(before, after).length > 0;
}
