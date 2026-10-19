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
import { lineFromMembers, lineMembersOf, memberCuts, membersFromLine, type LineMember, type MemberCuts } from '../engine/design/beam-line';
import { mirrorReinforcement, type BeamLine } from '../engine/design/repeated-frames';
import { lineKey, type BeamLineReinforcement } from '../design-contract/beam-line';
import { designLength, withSpanPieces } from './design-spans-store';
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

/** The saved line of these members, when none of them changed since it was saved. */
function storedLine(line: BeamLine): BeamLineReinforcement | null {
  const l = storedDecisions().lines?.[lineKey(line.members)];
  if (!l || !l.memberHashes) return null;
  const now = hashes(line.members);
  return line.members.every((id) => l.memberHashes![String(id)] === now[String(id)]) ? l : null;
}

export interface OpenLine { line: BeamLine; model: BeamLineReinforcement; saved: boolean }

/** The line a member is on, with its reinforcement as a line. */
export function openLine(memberId: number): OpenLine | null {
  const f = framesOf(memberId);
  if (!f) return null;
  const saved = storedLine(f.line);
  return { line: f.line, model: saved ? clone(saved) : lineFromMembers(lineMembers(f.line)), saved: !!saved };
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
