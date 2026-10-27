/**
 * «Size»: the design runs until every member verifies, changing a section where no reinforcement can.
 *
 * Sizing a member is finding reinforcement that verifies. An exhausted reinforcement search
 * does not prove the section inadequate. Where an evaluated constraint suggests a section
 * change, the section is enlarged as a trial, the structure solved
 * again (a larger section is a stiffer, heavier member and moves the forces) and the design run
 * again, round after round, until nothing is refused for its section or a round changes nothing.
 *
 * What grows, by what the search reports as limiting (`DesignOutcome.limiting`):
 *   - a beam's bars that cannot be anchored in the column at an end (§9.7.3.8, §25.4.3): the
 *     column, along the beam, the side the hook needs room in; bars that find no way between the
 *     column's bars: the column, both sides;
 *   - a beam refused for flexure, shear or steel limits: its depth; for bars that do not fit
 *     across it, its width while it stays within its columns', its depth past that;
 *   - a column refused: both its sides.
 * By 5 cm a round, the whole physical member at once (a column on every floor, a beam on every
 * span of its line), so one member keeps one section; up to 1,20 m.
 *
 * Each change is reported with the member, the section before and after, and why. The changes,
 * the solves and the designs are one undo step. A locked member is left as it is: neither it nor
 * a column it frames into is enlarged for it, and a column locked is not enlarged for a beam.
 */
import { modelStore } from './model.svelte';
import { t } from '../i18n';
import { historyStore } from './history.svelte';
import { migrateStoredDecisions } from '../design-contract/decisions';
import { resultsStore } from './results.svelte';
import { uiStore } from './ui.svelte';
import { verificationStore } from './verification.svelte';
import { designEverything, finalReport, type DeskReport, type DeskRunOptions } from './design-desk';
import { publishCombinations3D } from './active-results';
import { syncDefinedLoadsForAnalysis } from './defined-loads';
import { spectralCaseResults } from './spectral-cases';
import { physicalGroups } from './physical';
import { computeLocalAxes3D, memberRoll } from '../engine/local-axes-3d';
import { meshDeferredSlabs, representFootprints } from '../model/building/deferred-slabs';

export const RESIZE_STEP_M = 0.05;
export const RESIZE_MAX_M = 1.2;
export const RESIZE_MAX_ROUNDS = 6;

export type ResizeReason = 'anchorage' | 'flexure' | 'shear' | 'spacing' | 'column';

export interface ResizeChange {
  /** The physical member's name (C3, V7…), or the element's id when it has none. */
  member: string;
  kind: 'column' | 'beam';
  elementIds: number[];
  from: { b: number; h: number };
  to: { b: number; h: number };
  reason: ResizeReason;
  round: number;
}

export interface ResizeRun {
  report: DeskReport;
  changes: ResizeChange[];
  rounds: number;
  /** Members still refused when the run stopped, and why it stopped. */
  stopped: 'verified' | 'blocked' | 'noChange' | 'maxRounds' | 'solveFailed' | 'cancelled';
}

interface Grow { elementIds: number[]; member: string; kind: 'column' | 'beam'; db: number; dh: number; reason: ResizeReason }

const REFUSED = new Set(['SEARCH_EXHAUSTED', 'SECTION_INADEQUATE']);
/** What a beam's bars need of the column at a joint: room for the hook, a way between its bars. */
const JOINT_LIMITS = new Set(['anchorage', 'congestion']);

/** Solve the model as the «Calculate» button does, without the toasts: the deferred meshes, the defined loads, the combinations. */
export function solveForDesign(): boolean {
  representFootprints();
  meshDeferredSlabs();
  syncDefinedLoadsForAnalysis();
  const isPro = uiStore.analysisMode === 'pro';
  const left = uiStore.axisConvention3D === 'leftHand';
  const r = modelStore.solve3D(uiStore.includeSelfWeight, left, isPro);
  if (!r || typeof r === 'string') return false;
  resultsStore.setResults3D(r);
  if (modelStore.model.combinations.length > 0) {
    // The spectral cases too, as the Solve's: without their results the combinations that take
    // them were left out, and a resized model was verified without its earthquake.
    const sp = isPro && modelStore.model.loadCases.some((c) => c.spectral) ? spectralCaseResults() : undefined;
    if (typeof sp === 'string') uiStore.toast(t('spectralCase.leftOut') + ' ' + sp, 'error');
    const c = modelStore.solveCombinations3D(uiStore.includeSelfWeight, left, isPro, sp && typeof sp !== 'string' ? sp.results : undefined);
    if (!c || typeof c === 'string') return false;
    publishCombinations3D(c);
  }
  return true;
}

/** The physical member an element belongs to: its group's elements and name, else the element alone. */
function memberOf(id: number): { elementIds: number[]; member: string } {
  const g = physicalGroups().find((x) => x.members.elements?.includes(id));
  return g ? { elementIds: [...g.members.elements!], member: g.name } : { elementIds: [id], member: `#${id}` };
}

/** Whether a vertical element's section b (else h) spans global `axis` in plan. */
function bAlong(id: number, axis: 'x' | 'y'): boolean {
  const e = modelStore.elements.get(id)!;
  const a = modelStore.nodes.get(e.nodeI)!, b = modelStore.nodes.get(e.nodeJ)!;
  const ly = e.localYx !== undefined ? { x: e.localYx, y: e.localYy ?? 0, z: e.localYz ?? 0 } : undefined;
  const ax = computeLocalAxes3D({ id: a.id, x: a.x, y: a.y, z: a.z ?? 0 }, { id: b.id, x: b.x, y: b.y, z: b.z ?? 0 }, ly, memberRoll(e, modelStore.sections));
  const k = axis === 'x' ? 0 : 1;
  return Math.abs(ax.ey[k]) >= Math.abs(ax.ez[k]);
}

/** The joint checks (anchorage, bars through the column) that fail at a refused beam's ends, by end. */
function failingJointEnds(id: number): Array<'start' | 'end'> {
  const o = verificationStore.outcomeFor(id) as { provisional?: { verdict?: { checks?: Array<{ category?: string; status?: string; limiting?: string }> } } } | undefined;
  const ends = new Set<'start' | 'end'>();
  for (const c of o?.provisional?.verdict?.checks ?? []) {
    if (c.status !== 'fail' || !JOINT_LIMITS.has(c.limiting ?? '')) continue;
    const m = /\((start|end)\b/.exec(c.category ?? '');
    if (m) ends.add(m[1] as 'start' | 'end');
  }
  return [...ends];
}

/** The vertical elements at a node: the columns a beam end sits on. */
function columnsAt(node: number): number[] {
  const out: number[] = [];
  for (const e of modelStore.elements.values()) {
    if (e.nodeI !== node && e.nodeJ !== node) continue;
    const a = modelStore.nodes.get(e.nodeI), b = modelStore.nodes.get(e.nodeJ);
    if (a && b && Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6 && Math.abs((a.z ?? 0) - (b.z ?? 0)) > 1e-6) out.push(e.id);
  }
  return out;
}

/** What to enlarge after a round: one entry per physical member, the largest growth asked of it. */
export function plannedGrowth(): Grow[] {
  const byMember = new Map<string, Grow>();
  const locked = new Set(modelStore.designDecisions ? migrateStoredDecisions(modelStore.designDecisions).locked : []);
  const want = (g: Grow) => {
    if (g.elementIds.some((id) => locked.has(id))) return;
    const k = g.elementIds.slice().sort((p, q) => p - q).join(',');
    const prev = byMember.get(k);
    if (!prev) { byMember.set(k, g); return; }
    prev.db = Math.max(prev.db, g.db); prev.dh = Math.max(prev.dh, g.dh);
  };
  const seen = new Set<string>();
  for (const [id, ctx] of verificationStore.contexts) {
    const o = verificationStore.outcomeFor(id) as { outcome?: string; limiting?: string[] } | undefined;
    if (!o?.outcome || !REFUSED.has(o.outcome) || locked.has(id)) continue;
    const key = ctx.span?.key ?? `e${id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const limiting = new Set(o.limiting ?? []);
    // A search cut short or an invalid force orientation is not evidence for more concrete.
    if (limiting.has('searchBudget') || limiting.has('memberOrientationSuspect')) continue;
    if (ctx.elementType === 'column') {
      want({ ...memberOf(id), kind: 'column', db: RESIZE_STEP_M, dh: RESIZE_STEP_M, reason: 'column' });
      continue;
    }
    if (ctx.elementType !== 'beam') continue;
    if ([...limiting].some((l) => JOINT_LIMITS.has(l))) {
      const e = modelStore.elements.get(id)!;
      const start = ctx.span?.start ?? e.nodeI, end = ctx.span?.end ?? e.nodeJ;
      const p = modelStore.nodes.get(start)!, q = modelStore.nodes.get(end)!;
      const axis: 'x' | 'y' = Math.abs(q.x - p.x) >= Math.abs(q.y - p.y) ? 'x' : 'y';
      for (const side of failingJointEnds(id)) {
        for (const col of columnsAt(side === 'start' ? start : end)) {
          const along = bAlong(col, axis);
          // Room for the hook: the side along the beam. A way between the bars: both sides.
          const both = limiting.has('congestion');
          want({ ...memberOf(col), kind: 'column', db: along || both ? RESIZE_STEP_M : 0, dh: !along || both ? RESIZE_STEP_M : 0, reason: 'anchorage' });
        }
      }
    }
    const rest = [...limiting].filter((l) => !JOINT_LIMITS.has(l));
    if (rest.length === 0) continue;
    // Bars that do not fit across: a wider beam, while it stays within its columns' width; deeper past that.
    const e = modelStore.elements.get(id)!;
    const sec = modelStore.sections.get(e.sectionId);
    const colWidth = Math.min(...[e.nodeI, e.nodeJ].flatMap(columnsAt).map((c) => { const k = modelStore.sections.get(modelStore.elements.get(c)!.sectionId); return Math.min(k?.b ?? Infinity, k?.h ?? Infinity); }));
    const across = rest.some((l) => /spacing|width/i.test(l)) && (sec?.b ?? 0) + RESIZE_STEP_M <= colWidth + 1e-9;
    want({ ...memberOf(id), kind: 'beam', db: across ? RESIZE_STEP_M : 0, dh: across ? 0 : RESIZE_STEP_M, reason: across ? 'spacing' : rest.some((l) => /shear/i.test(l)) ? 'shear' : 'flexure' });
  }
  return [...byMember.values()];
}

/** A rectangular section b × h, found among the model's or added: name, area, inertias, Saint-Venant torsion. */
export function rectSection(b: number, h: number): number {
  const cmLabel = (v: number) => Math.round(v * 100000) / 1000;
  const name = `Rect ${cmLabel(b)}x${cmLabel(h)} cm`;
  for (const s of modelStore.sections.values()) {
    if (s.shape === 'rect' && Math.abs((s.b ?? 0) - b) < 1e-6 && Math.abs((s.h ?? 0) - h) < 1e-6 && !(s as { drawn?: unknown }).drawn) return s.id;
  }
  const long = Math.max(b, h), short = Math.min(b, h), q = short / long;
  const j = long * short ** 3 * (1 / 3 - 0.21 * q * (1 - q ** 4 / 12));
  return modelStore.addSection({ name, a: b * h, iy: b * h ** 3 / 12, iz: h * b ** 3 / 12, j, b, h, shape: 'rect' } as never);
}

/** Apply the planned growth: each member's elements onto the enlarged section. The changes made. */
export function applyGrowth(plan: readonly Grow[], round: number): ResizeChange[] {
  const out: ResizeChange[] = [];
  for (const g of plan) {
    const first = modelStore.elements.get(g.elementIds[0]!);
    const sec = first && modelStore.sections.get(first.sectionId);
    if (!sec || sec.shape !== 'rect' || !sec.b || !sec.h) continue;
    const cm = (v: number) => Math.round(v * 100) / 100;
    const b = g.db > 0 ? Math.max(sec.b, cm(Math.min(RESIZE_MAX_M, sec.b + g.db))) : sec.b;
    const h = g.dh > 0 ? Math.max(sec.h, cm(Math.min(RESIZE_MAX_M, sec.h + g.dh))) : sec.h;
    if (Math.abs(b - sec.b) < 1e-6 && Math.abs(h - sec.h) < 1e-6) continue;
    const id = rectSection(b, h);
    for (const e of g.elementIds) if (modelStore.elements.has(e)) modelStore.updateElement(e, { sectionId: id });
    out.push({ member: g.member, kind: g.kind, elementIds: g.elementIds, from: { b: sec.b, h: sec.h }, to: { b, h }, reason: g.reason, round });
  }
  return out;
}

/** Where a sizing run stands, for its progress bar. */
export interface ResizeProgress {
  phase: 'design' | 'resize' | 'solve';
  round: number;
  /** Members to enlarge this round (`resize`), sections changed so far. */
  members?: number;
  changed: number;
}

export interface ResizeHooks {
  progress?: (p: ResizeProgress) => void;
  /** Asked between steps: a run stopped keeps what the rounds before it did. */
  cancelled?: () => boolean;
  /** Lets the page draw between steps (a frame in the app; nothing in a test). */
  pause?: () => Promise<void>;
}

/** No resize proposal is not a verification: read the same verdicts shown in the desk. */
export function designChecksPass(report: DeskReport): boolean {
  if (!report.concrete?.ok || report.concrete.families.some(f =>
    f.state === 'failed' || f.refused > 0 || f.notModelled > 0 || f.designed < f.processed)) return false;
  const checked = report.levels.reduce((n, l) => n + l.counts.ok + l.counts.warn, 0);
  return checked > 0 && report.levels.every(l =>
    l.counts.fail === 0 && l.counts.provisional === 0 && l.counts.unavailable === 0 && l.counts.stale === 0);
}

/**
 * Design, and while members are refused for their section, enlarge it, solve again and design
 * again. Each round's enlargement and solve is a batch; the run, whatever its rounds, is one undo
 * step back to the model as the first design left it.
 */
export async function designWithResizing(o: DeskRunOptions & { resize?: boolean; maxRounds?: number }, hooks: ResizeHooks = {}): Promise<ResizeRun> {
  const pause = hooks.pause ?? (async () => {});
  const changes: ResizeChange[] = [];
  hooks.progress?.({ phase: 'design', round: 0, changed: 0 });
  await pause();
  // Preserve the nominal growth trajectory; alternative bars are evaluated only once,
  // against the final sections and forces, so an early repair cannot lose later approvals.
  let repair: (() => void) | undefined;
  const design = () => {
    repair = undefined;
    return designEverything(o, next => { repair = next; });
  };
  let report = design();
  const max = o.resize === false ? 0 : o.maxRounds ?? RESIZE_MAX_ROUNDS;
  let stopped: ResizeRun['stopped'] = 'verified';
  let round = 0;
  // The last step before the rounds, by identity: the stack is capped, so its length does not move.
  const mark = historyStore.getStacks().undo.at(-1);
  while (true) {
    // A partial nominal pass cannot justify the next section change.
    if (verificationStore.runSummary?.aborted) { stopped = 'blocked'; break; }
    // Read before the batch opens: opening it records the undo step, and recording it drops the
    // verification of the model as it was, which is what the plan reads.
    const plan = plannedGrowth();
    if (plan.length === 0) { stopped = designChecksPass(report) ? 'verified' : 'blocked'; break; }
    if (round >= max) { stopped = 'maxRounds'; break; }
    if (hooks.cancelled?.()) { stopped = 'cancelled'; break; }
    round++;
    hooks.progress?.({ phase: 'resize', round, members: plan.length, changed: changes.length });
    await pause();
    let made: ResizeChange[] = [];
    let solved = true;
    modelStore.batch(() => {
      made = applyGrowth(plan, round);
      if (made.length) solved = solveForDesign();
    });
    if (made.length === 0) { stopped = 'noChange'; break; }
    changes.push(...made);
    if (!solved) { stopped = 'solveFailed'; break; }
    hooks.progress?.({ phase: 'design', round, changed: changes.length });
    await pause();
    report = design();
  }
  if (repair && stopped !== 'solveFailed' && stopped !== 'cancelled'
    && !hooks.cancelled?.() && !verificationStore.runSummary?.aborted) {
    repair();
    report = { ...report, levels: finalReport() };
    if (designChecksPass(report)) stopped = 'verified';
    else if (stopped === 'verified') stopped = 'blocked';
  }
  // One undo step for the whole run: the rounds' steps folded into the first one after the mark.
  if (round > 0) {
    const st = historyStore.getStacks();
    const at = mark ? st.undo.indexOf(mark) : -1;
    const keep = at + 2;
    if ((at >= 0 || !mark) && st.undo.length > keep) historyStore.setStacks(st.undo.slice(0, keep), st.redo, st.undoKinds.slice(0, keep), st.redoKinds);
  }
  return { report, changes, rounds: round, stopped };
}
