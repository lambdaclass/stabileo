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
  return repeatedFrames(modelBeamLines());
}

/** The line a member is on, and the group of lines repeating it. */
export function framesOf(memberId: number): { line: BeamLine; group: RepeatedFrames | null } | null {
  const lines = modelBeamLines();
  // A piece of a span is on its line as the span's representative.
  const id = verificationStore.contextFor(memberId)?.span?.representative ?? memberId;
  const line = lines.find((l) => l.members.includes(id));
  if (!line) return null;
  return { line, group: repeatedFrames(lines).find((g) => g.lines.some((l) => l.id === line.id)) ?? null };
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
    for (const m of mapLines(source, t) ?? []) {
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
  const maps = group.lines.map((l) => mapLines(ref, l)!);
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
