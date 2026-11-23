/**
 * The result notices as one family: each engine finding, self-check or estimate is sorted into a
 * kind with a level, so every place that shows them can say it in one plain sentence, fold the
 * technical text and let the reader hide a kind. `withheld` is the only blocking kind and can
 * never be hidden.
 */
export const NOTICE_KINDS = [
  'withheld', 'outdated', 'secondOrder', 'secondOrderUnchecked', 'largeDisplacement', 'conditioning', 'shellMesh', 'limitation', 'selfCheck', 'discretization', 'underReview',
] as const;
export type NoticeKind = typeof NOTICE_KINDS[number];
export type NoticeLevel = 'blocking' | 'warning' | 'info';
export const HIDEABLE_KINDS: readonly NoticeKind[] = NOTICE_KINDS.filter((k) => k !== 'withheld' && k !== 'outdated');

export interface ResultNotice {
  kind: NoticeKind;
  level: NoticeLevel;
  details: string[];
  /** The sentence the row says, where it is not the kind's own (a count, a name). */
  summary?: string;
}

const KIND_BY_PHASE: Record<string, NoticeKind> = {
  'LIN-SECOND-ORDER': 'secondOrder',
  'LIN-SECOND-ORDER-NEAR': 'secondOrderUnchecked',
  'LIN-SECOND-ORDER-UNBOUNDED': 'secondOrderUnchecked',
  'LIN-SMALL-DISPLACEMENT': 'largeDisplacement',
  'NL-3': 'largeDisplacement',
  'NUM-INVARIANCE': 'conditioning',
  'CERT-MECHANISM': 'conditioning',
};

const LEVEL_RANK: Record<NoticeLevel, number> = { blocking: 0, warning: 1, info: 2 };

export function knownIssueKind(d: { phase?: string; severity?: string }): NoticeKind {
  if (d.severity === 'error') return 'withheld';
  if (d.phase && KIND_BY_PHASE[d.phase]) return KIND_BY_PHASE[d.phase]!;
  if (d.phase?.startsWith('SH-')) return 'shellMesh';
  return 'limitation';
}

export function kindLevel(kind: NoticeKind): NoticeLevel {
  if (kind === 'withheld') return 'blocking';
  return kind === 'secondOrderUnchecked' || kind === 'discretization' || kind === 'underReview' ? 'info' : 'warning';
}

/**
 * The engine's known-issue findings, one notice per kind, most severe first. A definite
 * second-order exceedance makes "not screened" redundant, so the weaker notice is dropped.
 */
export function groupKnownIssues<D extends { phase?: string; severity?: string }>(diagnostics: readonly D[], message: (d: D) => string): ResultNotice[] {
  const byKind = new Map<NoticeKind, string[]>();
  for (const d of diagnostics) {
    const kind = knownIssueKind(d);
    const text = message(d);
    const list = byKind.get(kind) ?? [];
    if (!list.includes(text)) list.push(text);
    byKind.set(kind, list);
  }
  if (byKind.has('secondOrder')) byKind.delete('secondOrderUnchecked');
  return sortNotices([...byKind].map(([kind, details]) => ({ kind, level: kindLevel(kind), details })));
}

export function sortNotices(notices: ResultNotice[]): ResultNotice[] {
  return [...notices].sort((a, b) => LEVEL_RANK[a.level] - LEVEL_RANK[b.level] || NOTICE_KINDS.indexOf(a.kind) - NOTICE_KINDS.indexOf(b.kind));
}

export function topLevel(notices: readonly ResultNotice[]): NoticeLevel | null {
  return notices.reduce<NoticeLevel | null>((top, n) => (top === null || LEVEL_RANK[n.level] < LEVEL_RANK[top] ? n.level : top), null);
}

export function visibleNotices(notices: readonly ResultNotice[], isHidden: (kind: NoticeKind) => boolean): ResultNotice[] {
  return notices.filter((n) => n.level === 'blocking' || !isHidden(n.kind));
}

/** The engine's notices and the app's own (results out of date, features under review) as one list, most severe first. */
export function boardNotices(engine: readonly ResultNotice[], app: readonly ResultNotice[]): ResultNotice[] {
  return sortNotices([...engine, ...app.filter((n) => !engine.some((e) => e.kind === n.kind))]);
}
