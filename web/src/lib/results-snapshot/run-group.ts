/**
 * The snapshot test of one corpus group (#716): run each case, compare with its committed
 * snapshot under the shared tolerance (`scripts/results-snapshot/compare.mjs`), and fail with a
 * readable report of what moved. `RESULTS_SNAPSHOT_UPDATE=1` (`make snapshots-update`) writes
 * the snapshots instead, keeping every value still within the tolerance as it was.
 */
import { it, expect } from 'vitest';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { CORPUS, type SnapshotCase } from './corpus';
import { capture, containmentFindings, type Snapshot } from './capture';
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

export function runGroup(group: SnapshotCase['group'], expectedContainment: Record<string, string[]> = {}): void {
  for (const c of CORPUS.filter((x) => x.group === group)) {
    it(c.name, async () => {
      const fresh = await capture(c);
      if (expectedContainment[c.name]) expect([...containmentFindings]).toEqual(expectedContainment[c.name]);
      const committed = read(c.name);
      if (process.env.CONTAINMENT_AUDIT_DIR) {
        mkdirSync(process.env.CONTAINMENT_AUDIT_DIR, { recursive: true });
        writeFileSync(`${process.env.CONTAINMENT_AUDIT_DIR}/${c.name}.json`, JSON.stringify({ findings: [...containmentFindings], fresh, diff: compareValues(committed?.values ?? {}, fresh.values) }, null, 2));
      }
      if (process.env.CONTAINMENT_UPDATE_DIAGNOSTICS === '1') {
        expect(committed).not.toBeNull();
        const diff = compareValues(committed!.values, fresh.values);
        expect(diff.removed).toEqual([]);
        expect(diff.added).toEqual([]);
        expect(diff.changed.filter((d: { path: string }) => !d.path.endsWith('.diagnosticCodes'))).toEqual([]);
        // Copy only diagnostic strings: every numeric baseline stays byte-for-byte intact.
        const file = snapshotFile(c.name);
        let text = readFileSync(file, 'utf8');
        for (const d of diff.changed) {
          expect(typeof d.before).toBe('string');
          expect(typeof d.after).toBe('string');
          text = text.split('\n').map(line => {
            // Case/combination scalars are compact rows, unlike the flat base fields.
            const row = /^\s*("(?:[^"\\]|\\.)*"):/.exec(line);
            if (!row) return line;
            const key = JSON.parse(row[1]);
            if (key === d.path) return line.replace(JSON.stringify(d.before), JSON.stringify(d.after));
            if (`${key}.diagnosticCodes` === d.path) {
              return line.replace(`"diagnosticCodes":${JSON.stringify(d.before)}`, `"diagnosticCodes":${JSON.stringify(d.after)}`);
            }
            return line;
          }).join('\n');
        }
        expect(compareValues(parseSnapshot(text).values, fresh.values).differs).toBe(false);
        writeFileSync(file, text);
        return;
      }
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
