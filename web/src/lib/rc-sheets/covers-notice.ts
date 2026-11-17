/**
 * What the sheets say about covers under CIRSOC 201-2025 Table 20.5.1.3.1: where each value comes
 * from, the table's arithmetic for it, and what the one action changes, in words.
 */
import { DESIGN_KINDS, largestBar, minimumCoverFor, withCirsocCovers, type DesignKind, type ProjectDesignData, type StoredDesignData } from '../model/design-data';

/** The covers the program stored in every project before it kept only what someone stated, m. */
export const OLD_DEFAULT_COVER = 0.025;

export type CoverOrigin = 'oldDefault' | 'stored' | 'default';

export type CoverRule =
  | { kind: 'main'; stirrup: number; db: number; base: number; dbAdd: number; need: number }
  | { kind: 'stirrup' }
  | { kind: 'mesh'; db: number; base: number; dbAdd: number }
  | { kind: 'exposed' }
  | { kind: 'ground' };

/** Covers in mm. */
export interface CoverShortfall { kind: DesignKind; cover: number; minimum: number; target: number; origin: CoverOrigin; rule: CoverRule }

/** The old default when the project stores 25 mm for every kind, as that default froze it; otherwise stored, or the default in force when it stores none. */
export function coverOrigin(stored: Pick<StoredDesignData, 'covers'>, kind: DesignKind): CoverOrigin {
  const own = stored.covers ?? {};
  if (!(kind in own)) return 'default';
  return DESIGN_KINDS.every((k) => own[k] === OLD_DEFAULT_COVER) ? 'oldDefault' : 'stored';
}

type MainBarMm = (dbMm: number, control: boolean) => number;

function ruleOf(d: ProjectDesignData, kind: DesignKind, mainBarMm: MainBarMm): CoverRule {
  const control = d.executionControl !== false, add = control ? 0 : 5, dbAdd = control ? 5 : 10, db = largestBar(d, kind);
  if (kind === 'footing') return { kind: 'ground' };
  if (d.exposure[kind] !== 'interior') return { kind: 'exposed' };
  if (kind === 'slab' || kind === 'wall') return { kind: 'mesh', db, base: 25 + add, dbAdd };
  const need = mainBarMm(db, control);
  return need - d.stirrupDiaMm >= 25 + add ? { kind: 'main', stirrup: d.stirrupDiaMm, db, base: control ? 35 : 40, dbAdd, need } : { kind: 'stirrup' };
}

const mm = (m: number) => Math.round(m * 1000);

/** The kinds under the table, with where their cover comes from and why the table asks more. */
export function coverShortfalls(d: ProjectDesignData, stored: Pick<StoredDesignData, 'covers'>, mainBarMm: MainBarMm): CoverShortfall[] {
  const table = withCirsocCovers(d).covers;
  return DESIGN_KINDS.map((kind) => ({ kind, cover: d.covers[kind], minimum: minimumCoverFor(d, kind) }))
    .filter((x) => x.cover < x.minimum - 1e-9)
    .map((x) => ({ kind: x.kind, cover: mm(x.cover), minimum: mm(x.minimum), target: mm(table[x.kind]), origin: coverOrigin(stored, x.kind), rule: ruleOf(d, x.kind, mainBarMm) }));
}

export interface CoverWords {
  t: (key: string) => string;
  tp: (key: string, params: Record<string, string | number>) => string;
  tpn: (key: string, n: number, params?: Record<string, string | number>) => string;
  /** A kind's name as it reads inside a sentence. */
  inSentence: (label: string) => string;
  locale: string;
}

const kindName = (w: CoverWords, k: DesignKind) => w.t(`designData.kind.${k}`);

/** One kind's line: its value and origin, and the table's arithmetic against it. */
export function shortfallText(s: CoverShortfall, w: CoverWords): string {
  const base = { kind: kindName(w, s.kind), cover: s.cover, min: s.minimum, origin: w.t(`rcSheets.coversNotice.origin.${s.origin}`) };
  const r = s.rule;
  if (r.kind === 'main') return w.tp('rcSheets.coversNotice.main', { ...base, base: r.base, dbAdd: r.dbAdd, db: r.db, stirrup: r.stirrup, have: s.cover + r.stirrup, need: r.need });
  if (r.kind === 'mesh') return w.tp('rcSheets.coversNotice.mesh', { ...base, base: r.base, dbAdd: r.dbAdd, db: r.db });
  return w.tp(`rcSheets.coversNotice.${r.kind}`, base);
}

/** The kinds that go from one cover to the same other, in table order. */
export function coverChanges(list: readonly CoverShortfall[]): Array<{ kinds: DesignKind[]; from: number; to: number }> {
  const out: Array<{ kinds: DesignKind[]; from: number; to: number }> = [];
  for (const s of list) {
    const g = out.find((x) => x.from === s.cover && x.to === s.target);
    if (g) g.kinds.push(s.kind); else out.push({ kinds: [s.kind], from: s.cover, to: s.target });
  }
  return out;
}

const kindsList = (w: CoverWords, kinds: readonly DesignKind[]) =>
  new Intl.ListFormat(w.locale, { type: 'conjunction' }).format(kinds.map((k) => w.inSentence(kindName(w, k))));

/** The notice in full: one line a kind, what follows until it is corrected, what the button changes, and the button. */
export function coversNotice(list: readonly CoverShortfall[], w: CoverWords): { items: string[]; consequence: string; change: string; undo: string; button: string } {
  const changes = coverChanges(list);
  return {
    items: list.map((s) => shortfallText(s, w)),
    consequence: w.tpn('rcSheets.coversNotice.consequence', list.length),
    change: w.tp('rcSheets.coversNotice.change', { changes: new Intl.ListFormat(w.locale, { type: 'conjunction' }).format(changes.map((c) => w.tp('rcSheets.coversNotice.changeItem', { kinds: kindsList(w, c.kinds), from: c.from, to: c.to }))) }),
    undo: w.t('rcSheets.coversNotice.undo'),
    button: coversButton(list, w),
  };
}

/** "Pasar a 30 mm (vigas y columnas) y volver a dimensionar". */
export function coversButton(list: readonly CoverShortfall[], w: CoverWords): string {
  const by = new Map<number, DesignKind[]>();
  for (const s of list) by.set(s.target, [...(by.get(s.target) ?? []), s.kind]);
  const targets = [...by].map(([to, kinds]) => w.tp('rcSheets.coversNotice.buttonItem', { to, kinds: kindsList(w, kinds) })).join(', ');
  return w.tp('rcSheets.coversNotice.button', { targets });
}

/** The line under a row's failing main-bar cover: its kind's value, origin and the table's minimum. */
export function coverCheckText(s: CoverShortfall, w: CoverWords): string {
  return w.tp('rcSheets.coversNotice.check', { kind: w.inSentence(kindName(w, s.kind)), cover: s.cover, origin: w.t(`rcSheets.coversNotice.origin.${s.origin}`), min: s.minimum, to: s.target });
}
