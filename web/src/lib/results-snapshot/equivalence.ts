import { capture, type Snapshot } from './capture';
import type { SnapshotCase } from './corpus';
import { compareValues, formatCaseReport } from '../../../scripts/results-snapshot/compare.mjs';

export async function sameAsBefore(c: SnapshotCase, fixture: unknown, before: Snapshot): Promise<{ same: boolean; report: string }> {
  const fresh = await capture(c, { fixture });
  const diff = compareValues(before.values, fresh.values);
  return { same: !diff.differs, report: diff.differs ? formatCaseReport(c.name, diff) : '' };
}
