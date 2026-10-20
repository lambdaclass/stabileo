/**
 * Editing one bar of the detailing, where the bar is a saved beam line's (`line-bars.ts`).
 *
 * A detailed beam bar whose id names a line bar (`e12-line-<lineBarId>-<k>`) is that line bar laid:
 * editing it edits the line, which is the one source the regions, the verifier, the detailing,
 * the schedule, the sheets and the 3-D view all read. So an edit here and the same edit in the
 * frame editor are the same operation (`saveLine`, one undo step), the member is checked again
 * at once, and the detailing is laid again from the line.
 *
 * A bar the generator laid on its own (a beam with no saved line) is not edited in place: the
 * beam's line is first saved exactly as its members hold it (`takeAsDrawn`), which changes no bar,
 * and from then on its bars are drawn bars with identities that survive regenerations.
 */
import { detailingStore } from './detailing.svelte';
import { lineBarsFromDetailing } from '../engine/detailing/line-bars';
import { verificationStore } from './verification.svelte';
import { framesOf } from './frame-equalize';
import { openLine, saveLine, staleLines } from './beam-line-store';
import { lineAxis } from './line-axis';
import { setHook, updateBar } from '../engine/design/beam-line';
import { lineKey, type BeamLineBar, type BeamLineReinforcement } from '../design-contract/beam-line';
import type { BeamLine } from '../engine/design/repeated-frames';

const DRAWN = /^e(\d+)-line-(.+)-(\d+)$/;

/** The line bar a detailed bar was laid from: the first bar of a fused pair names it. */
export function lineBarOf(detailedBarId: string): { memberId: number; lineBarId: string } | null {
  const m = DRAWN.exec(detailedBarId.split('+')[0]!);
  return m ? { memberId: Number(m[1]), lineBarId: m[2]! } : null;
}

export interface DrawnBar {
  line: BeamLine;
  model: BeamLineReinforcement;
  bar: BeamLineBar;
  /** The line's whole length, m: where `from` and `to` may go. */
  length: number;
}

/** A detailed bar as the line bar it is, when its line is saved and still stands. */
export function drawnBar(detailedBarId: string): DrawnBar | null {
  const ref = lineBarOf(detailedBarId);
  if (!ref) return null;
  const open = openLine(ref.memberId);
  if (!open?.saved) return null;
  const bar = open.model.bars.find((b) => b.id === ref.lineBarId);
  return bar ? { line: open.line, model: open.model, bar, length: open.model.lengths.reduce((s, l) => s + l, 0) } : null;
}

/** Whether a member's bars can be taken as drawn: a beam on a line whose saved line, if any, is not stale. */
export function canTakeAsDrawn(memberId: number): boolean {
  const f = framesOf(memberId);
  if (!f || verificationStore.contextFor(memberId)?.elementType !== 'beam') return false;
  const key = lineKey(f.line.members);
  return !staleLines().some((s) => s.key === key) && !openLine(memberId)?.saved;
}

/** Steel per diameter in the detailing's bars of these members, kg. */
function steelOf(memberIds: readonly number[]): Map<number, number> {
  const ids = new Set(memberIds), out = new Map<number, number>();
  for (const a of detailingStore.assemblies) for (const b of a.bars) {
    if (!b.ownerElementIds.some((id) => ids.has(id))) continue;
    out.set(b.diameterMm, (out.get(b.diameterMm) ?? 0) + Math.PI * (b.diameterMm / 2000) ** 2 * b.cuttingLength * 7850 / Math.max(1, b.ownerElementIds.length));
  }
  return out;
}

/** What an edit changed in the schedule of the line's members: kg per diameter, after minus before. */
export interface ScheduleChange { diameterMm: number; deltaKg: number }

function relay(line: BeamLine, next: BeamLineReinforcement): ScheduleChange[] {
  const before = steelOf(line.members);
  saveLine(line, next);
  // The detailing is laid again from the line when there is one to lay again; the member was
  // checked again by the save.
  if (detailingStore.assemblies.length) detailingStore.generate();
  const after = steelOf(line.members);
  const dias = [...new Set([...before.keys(), ...after.keys()])].sort((a, b) => a - b);
  return dias.map((d) => ({ diameterMm: d, deltaKg: (after.get(d) ?? 0) - (before.get(d) ?? 0) })).filter((c) => Math.abs(c.deltaKg) > 0.005);
}

/**
 * Save a beam's line as the detailing laid it, so its bars become drawn bars: each bar the
 * detailing laid along the line is a line bar with the same ends, row, diameter and hooks
 * (`lineBarsFromDetailing`), the stirrup zones as its members hold them. With no detailing laid
 * yet the line is read from the members' regions, as the frame editor reads it.
 */
export function takeAsDrawn(memberId: number): boolean {
  const open = openLine(memberId);
  if (!open || open.saved) return false;
  const axis = lineAxis(open.line);
  const ids = new Set(open.line.members);
  const laid = detailingStore.assemblies.flatMap((a) => a.bars).filter((b) => b.ownerElementIds.some((id) => ids.has(id)));
  let model = open.model;
  if (axis && laid.length) {
    const length = open.model.lengths.reduce((s, l) => s + l, 0);
    const bars = lineBarsFromDetailing(laid, axis.start, axis.dir, length);
    if (bars.length) model = { ...open.model, bars };
  }
  relay(open.line, model);
  return true;
}

export interface DrawnBarPatch {
  from?: number;
  to?: number;
  hookStart?: boolean;
  hookEnd?: boolean;
  diameter?: number;
  count?: number;
  row?: number;
}

/** Edit the line bar a detailed bar was laid from: the line saved (one undo step), the member checked, the detailing laid again. */
export function editDrawnBar(detailedBarId: string, patch: DrawnBarPatch): ScheduleChange[] | null {
  const d = drawnBar(detailedBarId);
  if (!d) return null;
  const { hookStart, hookEnd, ...rest } = patch;
  let next = Object.keys(rest).length ? updateBar(d.model, d.bar.id, rest) : d.model;
  if (hookStart !== undefined) next = setHook(next, d.bar.id, 'start', hookStart);
  if (hookEnd !== undefined) next = setHook(next, d.bar.id, 'end', hookEnd);
  return relay(d.line, next);
}
