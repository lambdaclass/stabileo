/**
 * A beam line's reinforcement in the store: read for the frame editor (the saved line when its
 * members have not changed since, else read from their regions), checked as a draft without
 * writing it, and saved: each member's regions from the line, the line kept with the decisions,
 * one undo step. Lines grouped to stay equal take the saved line too.
 */
import { modelStore } from './model.svelte';
import { designRunStore } from './design-run.svelte';
import { verificationStore } from './verification.svelte';
import { storedDecisions } from './design-decisions';
import { framesOf, modelBeamLines, copyFrame } from './frame-equalize';
import { rebarHash } from '../engine/design/rebar-hash';
import { lineFromMembers, lineMembersOf, memberCuts, membersFromLine, memberOffsets, type LineMember, type MemberCuts } from '../engine/design/beam-line';
import { lineLaps, linePieces, type LineBarPiece, type LineLap, type LineStirrupPiece } from '../engine/detailing/line-bars';
import { mirrorReinforcement, type BeamLine } from '../engine/design/repeated-frames';
import { lineKey, type BeamLineReinforcement } from '../design-contract/beam-line';
import { designLength, withSpanPieces } from './design-spans-store';
import { lineAxis } from './line-axis';
import type { ProvidedReinforcement } from '../design-contract/reinforcement';
import type { ProvidedRebarResult } from '../engine/station-design-forces';

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

/** A member's length on the line: its span's, when it stands for one (`collapseLineSpans`). */
const lengthOf = (id: number): number => designLength(id, (x) => verificationStore.contextFor(x));

/** The members of a line as the line sees them: regions, faces and bars turned to its sense. */
export function lineMembers(line: BeamLine): LineMember[] {
  return lineMembersOf(line, (id) => ({
    L: lengthOf(id),
    criticalSections: verificationStore.contextFor(id)?.criticalSections,
    reinforcement: modelStore.elements.get(id)?.reinforcement,
  }), mirrorReinforcement);
}

/** Each member's regions from a line, turned back to the member's own sense. */
function projected(line: BeamLine, model: BeamLineReinforcement): Map<number, ProvidedReinforcement> {
  const ms = lineMembers(line);
  const p = membersFromLine(model, ms);
  const out = new Map<number, ProvidedReinforcement>();
  line.members.forEach((id, i) => {
    const r = p.get(id);
    if (r) out.set(id, line.forward[i] !== false ? r : mirrorReinforcement(r));
  });
  return out;
}

const hashes = (ids: readonly number[]) => Object.fromEntries(ids.map((id) => [String(id), rebarHash(modelStore.elements.get(id)?.reinforcement)]));

/**
 * Why a saved line no longer stands for its members:
 * - `redesigned`: a member's bars changed since the line was saved (a design run, an edit
 *   elsewhere); the line's geometry still fits, so it can be taken up again as a draft;
 * - `geometry`: a member's length changed (a node moved, a span was split or joined); positions
 *   along the line no longer mean the same, and no length is rescaled to make them fit.
 */
export type LineStaleness = 'redesigned' | 'geometry';

export interface StaleLine {
  key: string;
  label: string;
  members: number[];
  reason: LineStaleness;
  /** The members that changed: redesigned, or whose length moved. */
  changed: Array<{ id: number; was?: number; now?: number }>;
  record: BeamLineReinforcement;
}

const LENGTH_TOL = 1e-3;

/** Whether a saved line still stands for its members, and if not, why. */
function stalenessOf(line: BeamLine, rec: BeamLineReinforcement): Pick<StaleLine, 'reason' | 'changed'> | null {
  const ms = lineMembers(line);
  const moved = ms.map((m, i) => ({ id: m.id, was: rec.lengths[i], now: m.L })).filter((x) => x.was === undefined || Math.abs(x.was - x.now) > LENGTH_TOL);
  if (rec.lengths.length !== ms.length || moved.length) return { reason: 'geometry', changed: moved };
  const now = hashes(line.members);
  const redesigned = line.members.filter((id) => rec.memberHashes?.[String(id)] !== now[String(id)]).map((id) => ({ id }));
  return redesigned.length ? { reason: 'redesigned', changed: redesigned } : null;
}

/** The saved line of these members, when none of them changed since it was saved: bars nor lengths. */
function storedLine(line: BeamLine): BeamLineReinforcement | null {
  const l = storedDecisions().lines?.[lineKey(line.members)];
  return l && !stalenessOf(line, l) ? l : null;
}

/**
 * The saved lines that no longer stand for their members, with why: they are not applied (the
 * frame editor and the detailing read the members instead) and are shown, so a person decides
 * whether to take one up again or let it go. A saved line whose members no longer form a line
 * (a member deleted or renumbered) is not listed: it cannot be opened, and it is dropped with
 * the next save of that line's members.
 */
export function staleLines(): StaleLine[] {
  const lines = storedDecisions().lines ?? {};
  if (!Object.keys(lines).length) return [];
  const out: StaleLine[] = [];
  for (const l of modelBeamLines()) {
    const key = lineKey(l.members), rec = lines[key];
    if (!rec) continue;
    const st = stalenessOf(l, rec);
    if (st) out.push({ key, label: l.label, members: [...l.members], record: rec, ...st });
  }
  return out;
}

/** Let a saved line go: the members keep their bars, the line is read from them. One undo step. */
export function discardLine(key: string): void {
  const d = storedDecisions();
  if (!d.lines?.[key]) return;
  const { [key]: _gone, ...rest } = d.lines;
  modelStore.reinforcementTransaction((api) => api.setDecisions({ ...d, lines: rest }));
}

export interface OpenLine {
  line: BeamLine;
  model: BeamLineReinforcement;
  saved: boolean;
  /** A saved line that no longer stands for the members: not applied, offered. */
  stale?: StaleLine;
}

/** The line a member is on, with its reinforcement as a line. */
export function openLine(memberId: number): OpenLine | null {
  const f = framesOf(memberId);
  if (!f) return null;
  const saved = storedLine(f.line);
  const stale = saved ? undefined : staleLines().find((x) => x.key === lineKey(f.line.members));
  return {
    line: f.line, model: saved ? clone(saved) : lineFromMembers(lineMembers(f.line)), saved: !!saved,
    ...(stale ? { stale } : {}),
  };
}

/** Check a draft line without writing it: each member's verdict on its projected regions. */
export function checkDraft(line: BeamLine, model: BeamLineReinforcement): Map<number, ProvidedRebarResult> {
  const a = designRunStore.currentAdapter();
  const out = new Map<number, ProvidedRebarResult>();
  if (!a) return out;
  for (const [id, r] of projected(line, model)) {
    const ctx = verificationStore.contextFor(id);
    if (ctx) out.set(id, a.verify(ctx, r) as ProvidedRebarResult);
  }
  return out;
}

/** Save a line: its members' regions, the line with the decisions, one undo step. */
export function saveLine(line: BeamLine, model: BeamLineReinforcement): number[] {
  const regions = projected(line, model);
  const key = lineKey(line.members);
  const written = modelStore.reinforcementTransaction((api) => {
    // A span's arrangement is held by every piece of it.
    for (const [id, r] of regions) for (const p of withSpanPieces([id], (x) => verificationStore.contextFor(x))) api.setReinforcement(p, clone(r));
    const d = storedDecisions();
    const rec: BeamLineReinforcement = { ...clone(model), memberHashes: Object.fromEntries([...regions].map(([id, r]) => [String(id), rebarHash(r)])) };
    api.setDecisions({ ...d, lines: { ...(d.lines ?? {}), [key]: rec } });
  });
  designRunStore.markManual(written);
  // Lines grouped with this one take the same bars.
  const group = storedDecisions().frameGroups?.find((g) => g.includes(key));
  if (group) {
    const others = modelBeamLines().filter((l) => group.includes(lineKey(l.members)) && lineKey(l.members) !== key);
    if (others.length) for (const id of copyFrame(line, others)) written.add(id);
  }
  return [...written];
}

/** Group lines to stay equal, or ungroup a line. One undo step with the bars. */
export function setFrameGroup(keys: readonly string[]): void {
  const d = storedDecisions();
  const rest = (d.frameGroups ?? []).map((g) => g.filter((k) => !keys.includes(k))).filter((g) => g.length > 1);
  const groups = keys.length > 1 ? [...rest, [...keys]] : rest;
  modelStore.reinforcementTransaction((api) => api.setDecisions({ ...d, frameGroups: groups }));
}

export function frameGroupOf(key: string): string[] | null {
  return storedDecisions().frameGroups?.find((g) => g.includes(key)) ?? null;
}

/** The cut points of every saved line's members, in each member's own sense, for the detailing. */
export function savedMemberCuts(): Map<number, MemberCuts> {
  const out = new Map<number, MemberCuts>();
  const lines = storedDecisions().lines ?? {};
  if (!Object.keys(lines).length) return out;
  for (const l of modelBeamLines()) {
    const saved = storedLine(l);
    if (!saved) continue;
    const ms = lineMembers(l);
    for (const [id, c] of memberCuts(saved, ms)) {
      const i = l.members.indexOf(id), L = ms[i]!.L;
      if (l.forward[i] !== false) { out.set(id, c); continue; }
      out.set(id, {
        ...(c.bottomTo !== undefined ? { bottomFrom: L - c.bottomTo } : {}),
        ...(c.bottomFrom !== undefined ? { bottomTo: L - c.bottomFrom } : {}),
        ...(c.bottomShort !== undefined ? { bottomShort: c.bottomShort } : {}),
        ...(c.topJ !== undefined ? { topI: L - c.topJ } : {}),
        ...(c.topI !== undefined ? { topJ: L - c.topI } : {}),
      });
    }
  }
  return out;
}

/**
 * Every saved line that still stands for its members, as the detailing lays it: each member's
 * bars and stirrups exactly as drawn (`line-bars.ts`), and each drawn lap with the member that
 * holds its middle. A stale line gives nothing: its members are detailed from their own bars.
 */
export function savedLinePieces(): {
  pieces: Map<number, { bars: LineBarPiece[]; stirrups: LineStirrupPiece[] }>;
  laps: Array<{ owner: number; lap: LineLap }>;
} {
  const pieces = new Map<number, { bars: LineBarPiece[]; stirrups: LineStirrupPiece[] }>();
  const laps: Array<{ owner: number; lap: LineLap }> = [];
  if (!Object.keys(storedDecisions().lines ?? {}).length) return { pieces, laps };
  for (const l of modelBeamLines()) {
    const saved = storedLine(l);
    if (!saved) continue;
    for (const [id, p] of linePieces(saved, l.forward)) pieces.set(id, p);
    const X = memberOffsets(saved);
    for (const lap of lineLaps(saved)) {
      const mid = (lap.from + lap.to) / 2;
      const k = Math.max(0, X.findIndex((x, i) => mid >= x - 1e-9 && mid <= x + saved.lengths[i]! + 1e-9));
      laps.push({ owner: saved.members[k]!, lap });
    }
  }
  return { pieces, laps };
}

/** The cross-sections placed on saved lines, each at its point in the model (`DocumentModel.sectionCuts`). */
export function savedSectionCuts(): NonNullable<import('../engine/detailing/document-model').DocumentModel['sectionCuts']> {
  const out: NonNullable<import('../engine/detailing/document-model').DocumentModel['sectionCuts']> = [];
  if (!Object.keys(storedDecisions().lines ?? {}).length) return out;
  for (const l of modelBeamLines()) {
    const saved = storedLine(l);
    if (!saved?.cuts?.length) continue;
    const axis = lineAxis(l);
    if (!axis) continue;
    const X = memberOffsets(saved);
    for (const c of saved.cuts) {
      const k = Math.max(0, X.findIndex((x, i) => c.x >= x - 1e-9 && c.x <= x + saved.lengths[i]! + 1e-9));
      const at = { x: axis.start.x + axis.dir.x * c.x, y: axis.start.y + axis.dir.y * c.x, z: axis.start.z + axis.dir.z * c.x };
      out.push({ elementIds: [saved.members[k]!], label: c.label, at });
    }
  }
  return out;
}
