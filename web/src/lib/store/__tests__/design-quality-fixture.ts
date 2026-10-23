import { modelStore, resultsStore, uiStore } from '..';
import { designRunStore } from '../design-run.svelte';
import { verificationStore } from '../verification.svelte';
import { detailingStore } from '../detailing.svelte';
import { solveCombinations3D, validateAndSolve3D } from '../../engine/solver-service';

/** Full production path with the example’s own lateral declaration, including final holds. */
export async function frameDesignQuality() {
  await modelStore.loadExample('rc-design-frame');
  uiStore.analysisMode = 'pro';
  const combo = solveCombinations3D(modelStore.model as never, modelStore.model.loadCases, modelStore.model.combinations, true, false);
  if (!combo || typeof combo === 'string') throw new Error(String(combo));
  resultsStore.setResults3D(validateAndSolve3D(modelStore.model as never, true, false) as never);
  resultsStore.setCombinationResults3D(combo.perCase, combo.perCombo, combo.envelope);
  designRunStore.designAll({ maxRunMs: 180_000 });
  return currentFrameDesignQuality();
}

/** Read the published design after a further production detailing/repair command. */
export function currentFrameDesignQuality() {
  const assemblies = modelStore.model.detailing?.assemblies ?? [];
  const summary = verificationStore.runSummary!;
  const counts: Record<string, number> = {};
  const verifiedIds: number[] = [];
  for (const id of verificationStore.contexts.keys()) {
    const status = verificationStore.memberVerdict(id).status;
    if (status === 'ok' || status === 'warn') verifiedIds.push(id);
    counts[status] = (counts[status] ?? 0) + 1;
  }
  // Independent of member holds: an omitted open condition must not inflate this metric.
  const physicallyBlocked = new Set(assemblies.flatMap(a => a.conflicts
    .filter(c => c.severity !== 'marginal').flatMap(c => c.elementIds)));
  const finalPasses = new Set((detailingStore.lastRun?.reverification ?? [])
    .filter(r => r.status === 'ok' || r.status === 'warn').map(r => r.elementId));
  const output = { verified: summary.verified, exhausted: summary.searchExhausted, provisional: summary.provisionalBiaxial,
    aborted: summary.aborted, notReached: summary.notReached, counts, assemblies: assemblies.length,
    passingWithBlockingConflicts: verifiedIds.filter(id => physicallyBlocked.has(id)),
    passingWithoutFinalVerification: verifiedIds.filter(id => !finalPasses.has(id)),
    conflicts: assemblies.reduce((n, a) => n + a.conflicts.length, 0),
    blockingConflicts: assemblies.reduce((n, a) => n + a.conflicts.filter(c => c.severity !== 'marginal').length, 0),
    open: assemblies.flatMap(a => a.unsupported).reduce((n, u) => { n[u.key] = (n[u.key] ?? 0) + 1; return n; }, {} as Record<string, number>) };
  return { output, verifiedIds };
}

/** Final physical approvals before guided alternatives; preserved by identity. */
export const PHYSICAL_BASELINE_PASSES = [2, 4, 7, 8, 9, 13, 16, 17, 18, 19, 20, 32, 34, 38, 42, 43, 48, 52, 53, 54, 55, 58, 63, 68, 70, 74, 77, 78, 79, 82, 83, 84, 89, 94, 97, 98, 99, 102, 103, 104, 107, 109, 113, 114, 115, 118, 119, 121, 122, 123, 124, 125, 136, 137, 138, 139, 140, 142, 143, 144, 147, 148, 149, 152, 153, 154, 157, 158, 159, 185, 201, 202];
