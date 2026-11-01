/**
 * The snapshot test of one corpus group (#716): run each case, compare with its committed
 * snapshot under the shared tolerance (`scripts/results-snapshot/compare.mjs`), and fail with a
 * readable report of what moved. `RESULTS_SNAPSHOT_UPDATE=1` (`make snapshots-update`) writes
 * the snapshots instead, keeping every value still within the tolerance as it was.
 */
import { it, expect } from 'vitest';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { CORPUS, type SnapshotCase } from './corpus';
import { capture, type Snapshot } from './capture';
// @ts-expect-error plain JavaScript shared with the CI gate (no declaration file)
import { compareValues, mergeValues, formatCaseReport, HOW_TO_REGISTER, serialiseSnapshot, parseSnapshot } from '../../../scripts/results-snapshot/compare.mjs';

export const SNAPSHOT_DIR = new URL('../../../results-snapshots/', import.meta.url);
const UPDATE = process.env.RESULTS_SNAPSHOT_UPDATE === '1';

export function snapshotFile(name: string): URL {
  return new URL(`${name}.json`, SNAPSHOT_DIR);
}

function read(name: string): Snapshot | null {
  const f = snapshotFile(name);
  return existsSync(f) ? (parseSnapshot(readFileSync(f, 'utf8')) as Snapshot) : null;
}

export function runGroup(group: SnapshotCase['group']): void {
  for (const c of CORPUS.filter((x) => x.group === group)) {
    it(c.name, async () => {
      const fresh = await capture(c);
      const committed = read(c.name);
      if (UPDATE) {
        mkdirSync(SNAPSHOT_DIR, { recursive: true });
        writeFileSync(snapshotFile(c.name), serialiseSnapshot({ ...fresh, values: mergeValues(committed?.values ?? null, fresh.values) }));
        return;
      }
      expect(committed, `no committed snapshot for ${c.name}: run make snapshots-update`).not.toBeNull();
      const diff = compareValues(committed!.values, fresh.values);
      if (diff.differs) throw new Error(`${formatCaseReport(c.name, diff)}\n\n${HOW_TO_REGISTER}`);
      // A quantity recorded now and not in the file: not a result change, but the file is behind.
      expect(diff.added, `${c.name}: ${diff.added.length} value(s) not in the committed snapshot; run make snapshots-update`).toEqual([]);
    }, 180_000);
  }
}
