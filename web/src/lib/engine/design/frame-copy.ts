/**
 * Copying a beam line's bars onto a line that is not the same frame: another axis, another floor,
 * a different number of spans. Each target member takes the source member at its position along
 * the line, read the way (as laid or reversed) that matches more members; a member takes bars only
 * when its section is the source's and its length is within the tolerance. What does not fit is
 * listed with why and left as it is: bars are never stretched to another length.
 *
 * Pure: no store, no runes.
 */
import type { BeamLine } from './repeated-frames';

export interface CopyLine extends Pick<BeamLine, 'id' | 'label' | 'members' | 'forward'> {
  /** Per member, m. */
  lengths: readonly number[];
  /** Per member, its section id. */
  sections: readonly number[];
}

export type CopyStatus = 'copy' | 'length' | 'section' | 'noSource';

export interface CopyRow {
  target: number;
  source: number | null;
  /** The source's bars turn end for end on this target. */
  mirror: boolean;
  status: CopyStatus;
  /** Target and source lengths, m, for what the preview says. */
  lengthTarget: number;
  lengthSource: number | null;
}

export interface CopyPlan {
  source: string; target: string;
  /** True when the source is read reversed along the target. */
  reversed: boolean;
  rows: CopyRow[];
  /** Source members no target member takes. */
  unused: number[];
}

/** Where each member's middle is along its line, m. */
const mids = (l: CopyLine) => { let a = 0; return l.lengths.map((L) => { const m = a + L / 2; a += L; return m; }); };

function mapOnce(source: CopyLine, target: CopyLine, reversed: boolean, tolM: number): CopyRow[] {
  const n = source.members.length, total = source.lengths.reduce((s, l) => s + l, 0);
  const srcIdx = (i: number) => (reversed ? n - 1 - i : i);
  // The source's members in the target's reading order, with their spans along it.
  const order = source.members.map((_, i) => srcIdx(i));
  const spans: Array<{ k: number; from: number; to: number }> = [];
  let a = 0;
  for (const k of order) { spans.push({ k, from: a, to: a + source.lengths[k]! }); a += source.lengths[k]!; }
  const tm = mids(target);
  return target.members.map((id, i) => {
    // Same count: member by member; otherwise the source member under the target's middle.
    const k = source.members.length === target.members.length
      ? srcIdx(i)
      : spans.find((s) => tm[i]! >= s.from - 1e-9 && tm[i]! <= s.to + 1e-9 && tm[i]! <= total + 1e-9)?.k;
    const Lt = target.lengths[i]!;
    if (k === undefined) return { target: id, source: null, mirror: false, status: 'noSource' as const, lengthTarget: Lt, lengthSource: null };
    const Ls = source.lengths[k]!;
    const mirror = (source.forward[k] !== false) !== (target.forward[i] !== false) !== reversed;
    const status: CopyStatus = source.sections[k] !== target.sections[i] ? 'section' : Math.abs(Ls - Lt) > tolM + 1e-9 ? 'length' : 'copy';
    return { target: id, source: source.members[k]!, mirror, status, lengthTarget: Lt, lengthSource: Ls };
  });
}

/** The copy of `source` onto `target`, member by member, with what does not fit. */
export function planFrameCopy(source: CopyLine, target: CopyLine, tolM = 0.001): CopyPlan {
  const fwd = mapOnce(source, target, false, tolM), rev = mapOnce(source, target, true, tolM);
  const ok = (rows: CopyRow[]) => rows.filter((r) => r.status === 'copy').length;
  const reversed = ok(rev) > ok(fwd);
  const rows = reversed ? rev : fwd;
  const used = new Set(rows.map((r) => r.source).filter((s): s is number => s !== null));
  return { source: source.id, target: target.id, reversed, rows, unused: source.members.filter((m) => !used.has(m)) };
}

/**
 * The lines of one floor matched to another floor's: each source line to the target line on the
 * same plan line (same direction, same offset across it, within `tolM`), so a floor is copied
 * line by line. A line with no partner is listed.
 */
export function matchFloorLines<L extends { id: string; start: { x: number; y: number }; dir: { x: number; y: number } }>(
  source: readonly L[], target: readonly L[], tolM = 0.01,
): { pairs: Array<{ source: L; target: L }>; unmatched: L[] } {
  const pairs: Array<{ source: L; target: L }> = [];
  const unmatched: L[] = [];
  const taken = new Set<string>();
  for (const s of source) {
    const t = target.find((t) => {
      if (taken.has(t.id)) return false;
      const parallel = Math.abs(s.dir.x * t.dir.y - s.dir.y * t.dir.x) < 1e-3;
      // Offset of t's start from s's plan line, across it.
      const off = Math.abs((t.start.x - s.start.x) * -s.dir.y + (t.start.y - s.start.y) * s.dir.x);
      return parallel && off < tolM;
    });
    if (t) { pairs.push({ source: s, target: t }); taken.add(t.id); } else unmatched.push(s);
  }
  return { pairs, unmatched };
}
