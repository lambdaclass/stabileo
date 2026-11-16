import { capture, type Snapshot } from './capture';
import type { SnapshotCase } from './corpus';
// @ts-expect-error plain JavaScript shared with the CI gate (no declaration file)
import { compareValues, formatCaseReport } from '../../../scripts/results-snapshot/compare.mjs';
import { unexplainedDiff, type Excuse } from '../../../scripts/results-snapshot/applicability.mjs';

/**
 * Whether this engine gives `fixture` the numbers of `before`, but for what the engine entries the
 * pull request registers explain for that model (`excuse`): those are told to saved models.
 */
export async function sameAsBefore(c: SnapshotCase, fixture: unknown, before: Snapshot, excuse?: Excuse): Promise<{ same: boolean; report: string; explainedBy: string[] }> {
  const fresh = await capture(c, { fixture });
  const diff = unexplainedDiff(compareValues(before.values, fresh.values), excuse);
  return { same: !diff.differs, report: diff.differs ? formatCaseReport(c.name, diff) : '', explainedBy: diff.explainedBy };
}
