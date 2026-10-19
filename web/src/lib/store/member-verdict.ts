/**
 * The member's verdict and the project's, apart from the local checks, for every surface to read.
 *
 * ── The rule ──────────────────────────────────────────────────────────
 *
 * A check row (flexure, shear, an anchorage, …) states that one provision is met at the section it
 * was evaluated on: a LOCAL check. It may read `ok` only labelled as such ("comprobación local de
 * la sección"), and never as the member's or the project's verdict. The member's verdict
 * (`verificationStore.memberVerdict`) and the project's (`projectVerdict` below) are separate
 * fields: they read held, with the reason, whenever the member is held short of conformity by
 * something that is not one of its own section checks (`MemberHold`): its analysis not
 * validated, a condition the detailing left open, its deflection, a refusal, seismic checks run
 * only as a substitute. Counts of verified members count verdicts, never local rows; colours and
 * badges follow the verdict.
 *
 * Pure reading of the stores: nothing here computes a structural fact.
 */
import { verificationStore, type MemberHold, type MemberHoldKind, type MemberVerdict } from './verification.svelte';

type Tr = (key: string, params?: Record<string, string | number>) => string;

/** The detailing conditions a member can be held on, by the key's family, as the reason names them. */
function detailingWhat(keys: string, tr: Tr): string {
  const kinds = new Set(String(keys).split(', ').map((k) => (k.startsWith('detailing.lapCheck.') ? 'splice'
    : k === 'detailing.anchorage.unresolved' ? 'anchorage' : k === 'detailing.cover.violated' ? 'cover' : 'clash')));
  return [...kinds].map((k) => tr(`verdict.detailing.${k}`)).join(', ');
}

/** One hold, in words. */
export function holdText(h: MemberHold | { key: string; params?: Record<string, string | number> }, tr: Tr): string {
  const p = h.params ?? {};
  if (h.key === 'verdict.hold.detailing') return tr(h.key, { n: p.n ?? 1, what: detailingWhat(String(p.keys ?? ''), tr) });
  if (h.key === 'verdict.hold.refused') return tr(h.key, { outcome: tr(`verdict.outcome.${p.outcome}`) });
  if (h.key === 'verdict.hold.analysis') return tr(h.key, { share: p.share ?? '?', level: p.level ?? '?' });
  // A steel limit state left out: what it is, in words, inside the sentence that names its clause.
  if (h.key === 'verdict.hold.steelNotEvaluated') {
    // The engine's refusal sentence, its word parameters (message keys) translated first.
    const inner: Record<string, string | number> = {};
    for (const [k, x] of Object.entries(p)) inner[k] = typeof x === 'string' && /^(c301|steel)\./.test(x) && k !== 'what' ? tr(x) : x;
    return tr(h.key, { clause: p.clause ?? '', what: tr(String(p.what ?? ''), inner) });
  }
  return tr(h.key, p);
}

/** The member's verdict as a sentence: its word, then why it is held, then the readings it assumed. */
export function verdictReasons(v: MemberVerdict, tr: Tr): string[] {
  return [...v.holds.map((h) => holdText(h, tr)), ...v.assumptions.map((a) => tr(a.key))];
}

/** Whether a member's verdict is an approval: ok or near the limit, with nothing holding it. */
export const verdictApproves = (v: MemberVerdict): boolean => (v.status === 'ok' || v.status === 'warn') && v.holds.length === 0;

export interface ProjectVerdict {
  /**
   * `conforms` only when every concrete design member's verdict approves it and the analysis is
   * not left unvalidated anywhere; `held` otherwise; `empty` with nothing designed.
   */
  state: 'conforms' | 'held' | 'empty';
  total: number;
  /** Members whose verdict approves them. */
  conforming: number;
  /** Members held, by what holds them (a member held twice counts in both). */
  held: Partial<Record<MemberHoldKind, number>>;
  /** Members whose own local checks fail, are a proposal, stale or were not checked, without a hold. */
  failing: number;
  provisional: number;
  unchecked: number;
  stale: number;
}

/** The project's verdict over the members the design reads (`verificationStore.contexts`). */
export function projectVerdict(): ProjectVerdict {
  const out: ProjectVerdict = { state: 'empty', total: 0, conforming: 0, held: {}, failing: 0, provisional: 0, unchecked: 0, stale: 0 };
  for (const id of verificationStore.contexts.keys()) {
    out.total++;
    const v = verificationStore.memberVerdict(id);
    for (const k of new Set(v.holds.map((h) => h.kind))) out.held[k] = (out.held[k] ?? 0) + 1;
    if (verdictApproves(v)) { out.conforming++; continue; }
    if (v.holds.length) continue;
    if (v.status === 'fail') out.failing++;
    else if (v.status === 'provisional') out.provisional++;
    else if (v.status === 'stale') out.stale++;
    else out.unchecked++;
  }
  out.state = out.total === 0 ? 'empty' : out.conforming === out.total ? 'conforms' : 'held';
  return out;
}

/** The project's verdict as sentences: the state, then each reason with its count. */
export function projectVerdictLines(p: ProjectVerdict, tr: Tr): { state: string; reasons: string[] } {
  const reasons: string[] = [];
  const HOLDS: MemberHoldKind[] = ['analysis', 'detailing', 'deflection', 'refused', 'seismic', 'enginePending'];
  for (const k of HOLDS) if (p.held[k]) reasons.push(tr(`verdict.project.held.${k}`, { n: p.held[k]! }));
  if (p.failing) reasons.push(tr('verdict.project.failing', { n: p.failing }));
  if (p.provisional) reasons.push(tr('verdict.project.provisional', { n: p.provisional }));
  if (p.stale) reasons.push(tr('verdict.project.stale', { n: p.stale }));
  if (p.unchecked) reasons.push(tr('verdict.project.unchecked', { n: p.unchecked }));
  return { state: tr(`verdict.project.${p.state}`, { n: p.conforming, total: p.total }), reasons };
}
