/**
 * Quantities by level and by type of element, from one list of measured items: each item is a
 * member, a shell, a footing or a mark of steel, with the level it belongs to and its concrete,
 * formwork and steel. Measuring rules (what counts as formwork) are the caller's, stated where
 * the items are made (`store/memoria-inputs.ts`); here they are only added up.
 */
export interface QtyItem { kind: string; level: string; concrete: number; formwork: number; steel: number }

export function quantitiesBy(items: readonly QtyItem[], levelOrder: readonly string[]) {
  const sum = (key: (i: QtyItem) => string) => {
    const m = new Map<string, { concrete: number; formwork: number; steel: number; count: number }>();
    for (const i of items) {
      const g = m.get(key(i)) ?? { concrete: 0, formwork: 0, steel: 0, count: 0 };
      g.concrete += i.concrete; g.formwork += i.formwork; g.steel += i.steel; g.count += i.concrete > 0 || i.formwork > 0 ? 1 : 0;
      m.set(key(i), g);
    }
    return m;
  };
  const lv = sum((i) => i.level), ty = sum((i) => i.kind);
  const rank = (l: string) => { const k = levelOrder.indexOf(l); return k < 0 ? levelOrder.length : k; };
  return {
    byLevel: [...lv.entries()].sort((a, b) => rank(a[0]) - rank(b[0])).map(([level, g]) => ({ level, concrete: g.concrete, formwork: g.formwork, steel: g.steel })),
    byType: [...ty.entries()].map(([kind, g]) => ({ kind, ...g })),
  };
}

/** Formwork of a member, m²: a beam's soffit and two sides, a column's perimeter, by its length. */
export function memberFormwork(kind: 'beam' | 'column' | 'brace', b: number, h: number, length: number, perimeter?: number): number {
  if (kind === 'column') return (perimeter ?? 2 * (b + h)) * length;
  return (b + 2 * h) * length;
}
