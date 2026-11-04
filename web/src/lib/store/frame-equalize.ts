/**
 * Repeated frames in the design: which beam lines repeat the selected one, copying one line's bars
 * onto the lines that repeat it, and equalizing a group so each position along the line carries
 * the most reinforced member any line of the group has there. Locked members are left; every
 * write is an edit, one undo step, re-verified by the reinforcement channel like any other edit.
 */
import { modelStore } from './model.svelte';
import { designRunStore } from './design-run.svelte';
import { verificationStore } from './verification.svelte';
import { lockedIds } from './design-decisions';
import { collapseLineSpans, designLength, withSpanPieces } from './design-spans-store';
import { beamLines, mapLines, mirrorReinforcement, repeatedFrames, steelOf, type BeamLine, type RepeatedFrames } from '../engine/design/repeated-frames';
import type { ProvidedReinforcement } from '../design-contract/reinforcement';
import { designData } from './design-data';
import { lineAxis } from './line-axis';
import { matchFloorLines, planFrameCopy, type CopyLine, type CopyPlan } from '../engine/design/frame-copy';

/** The project's tolerance for repeated frames, mm (`frameToleranceMm`). */
export const frameTolerance = (): number => designData().frameToleranceMm ?? 0;

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

const isBeam = (id: number): boolean => {
  const ctx = verificationStore.contextFor(id);
  return ctx ? ctx.elementType === 'beam' : false;
};

/** The model's beam lines, a span's pieces read as one member (`collapseLineSpans`). */
export function modelBeamLines(): BeamLine[] {
  const ctxOf = (id: number) => verificationStore.contextFor(id);
  return beamLines(modelStore.model as never, isBeam).map((l) => collapseLineSpans(l, ctxOf));
}

export function modelRepeatedFrames(): RepeatedFrames[] {
  return repeatedFrames(modelBeamLines(), frameTolerance());
}

/** The line a member is on, and the group of lines repeating it. */
export function framesOf(memberId: number): { line: BeamLine; group: RepeatedFrames | null } | null {
  const lines = modelBeamLines();
  // A piece of a span is on its line as the span's representative.
  const id = verificationStore.contextFor(memberId)?.span?.representative ?? memberId;
  const line = lines.find((l) => l.members.includes(id));
  if (!line) return null;
  return { line, group: repeatedFrames(lines, frameTolerance()).find((g) => g.lines.some((l) => l.id === line.id)) ?? null };
}

const lengthOf = (id: number): number => designLength(id, (x) => verificationStore.contextFor(x));

function write(entries: Array<{ target: number; bars: ProvidedReinforcement }>): number[] {
  const locked = lockedIds();
  // A span's arrangement goes to every piece of it, and a span with a locked piece is left whole.
  const ctxOf = (id: number) => verificationStore.contextFor(id);
  const ok = entries.flatMap((e) => {
    const pieces = withSpanPieces([e.target], ctxOf);
    return pieces.some((id) => locked.has(id)) ? [] : pieces.map((target) => ({ target, bars: e.bars }));
  });
  const written = modelStore.reinforcementTransaction((api) => { for (const e of ok) api.setReinforcement(e.target, clone(e.bars)); });
  designRunStore.markManual(written);
  return [...written];
}

/** Copy `source`'s bars onto each target line that repeats it. Returns the members written. */
export function copyFrame(source: BeamLine, targets: readonly BeamLine[]): number[] {
  const entries: Array<{ target: number; bars: ProvidedReinforcement }> = [];
  for (const t of targets) {
    if (t.id === source.id) continue;
    for (const m of mapLines(source, t, frameTolerance()) ?? []) {
      const r = modelStore.elements.get(m.source)?.reinforcement;
      if (r) entries.push({ target: m.target, bars: m.mirror ? mirrorReinforcement(r) : r });
    }
  }
  return write(entries);
}

/**
 * Equalize a group: at each position along the line, the most reinforced member of any line,
 * turned to each target's sense. Returns the members written.
 */
export function equalizeFrames(group: RepeatedFrames): number[] {
  return write(equalizing(group));
}

function equalizing(group: RepeatedFrames): Array<{ target: number; bars: ProvidedReinforcement }> {
  const ref = group.lines[0]!;
  const maps = group.lines.map((l) => mapLines(ref, l, frameTolerance())!);
  const entries: Array<{ target: number; bars: ProvidedReinforcement }> = [];
  ref.members.forEach((_, i) => {
    // The members at position i, each with its bars seen in the reference line's sense.
    const at = maps.map((m, li) => {
      const k = m.findIndex((x) => x.source === ref.members[i]);
      const x = m[k]!;
      const r = modelStore.elements.get(x.target)?.reinforcement;
      return { line: li, target: x.target, mirror: x.mirror, bars: r ? (x.mirror ? mirrorReinforcement(r) : r) : undefined };
    });
    const best = at.reduce((b, c) => (steelOf(c.bars, lengthOf(c.target)) > steelOf(b.bars, lengthOf(b.target)) ? c : b), at[0]!);
    if (!best.bars) return;
    for (const c of at) if (c.target !== best.target) entries.push({ target: c.target, bars: c.mirror ? mirrorReinforcement(best.bars) : best.bars });
  });
  return entries;
}

/** Every group of repeated frames, equalized, in one undo step. */
export function equalizeAllFrames(): { groups: number; members: number } {
  const groups = modelRepeatedFrames();
  return { groups: groups.length, members: write(groups.flatMap(equalizing)).length };
}

// ─── Copying onto a different frame ───

/** A line as the copy reads it: each member's design length and section. */
export function copyLineOf(line: BeamLine): CopyLine {
  return {
    id: line.id, label: line.label, members: line.members, forward: line.forward,
    lengths: line.members.map(lengthOf),
    sections: line.members.map((id) => modelStore.elements.get(id)?.sectionId ?? -1),
  };
}

/** The copy of `source` onto each target, with what does not fit, at `tolMm` (the project's by default). */
export function previewFrameCopy(source: BeamLine, targets: readonly BeamLine[], tolMm = frameTolerance()): CopyPlan[] {
  const src = copyLineOf(source);
  return targets.filter((t) => t.id !== source.id).map((t) => planFrameCopy(src, copyLineOf(t), Math.max(tolMm, 1) / 1000));
}

/** Write what the plans copy (the rows that fit), one undo step. Locked members and spans with one keep theirs. */
export function applyFrameCopy(plans: readonly CopyPlan[]): number[] {
  const entries: Array<{ target: number; bars: ProvidedReinforcement }> = [];
  for (const p of plans) for (const r of p.rows) {
    if (r.status !== 'copy' || r.source === null) continue;
    const bars = modelStore.elements.get(r.source)?.reinforcement;
    if (bars) entries.push({ target: r.target, bars: r.mirror ? mirrorReinforcement(bars) : bars });
  }
  return write(entries);
}

/** The levels beam lines lie on, m, low to high. */
export function lineLevels(): number[] {
  const zs = new Set<number>();
  for (const l of modelBeamLines()) { const a = lineAxis(l); if (a) zs.add(Math.round(a.start.z * 1000) / 1000); }
  return [...zs].sort((a, b) => a - b);
}

/**
 * A whole floor's lines copied onto another floor: each line onto the line on the same plan line
 * (`matchFloorLines`), with what does not fit; a line with no partner on the target floor is
 * listed.
 */
export function previewFloorCopy(fromZ: number, toZ: number, tolMm = frameTolerance()): { plans: CopyPlan[]; unmatched: BeamLine[] } {
  const at = (z: number) => modelBeamLines().flatMap((l) => {
    const a = lineAxis(l);
    return a && Math.abs(a.start.z - z) < 0.01 ? [{ id: l.id, line: l, start: a.start, dir: a.dir }] : [];
  });
  const m = matchFloorLines(at(fromZ), at(toZ));
  return {
    plans: m.pairs.flatMap((p) => previewFrameCopy(p.source.line, [p.target.line], tolMm)),
    unmatched: m.unmatched.map((u) => u.line),
  };
}
