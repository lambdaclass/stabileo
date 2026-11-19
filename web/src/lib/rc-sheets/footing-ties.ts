import type { FootingAction, FootingDemand, FootingRow, TiePull } from './footing-types';

/**
 * The pulls of the ties that footings at a line run to other footings (FIUBA Cim. §6.5): each one
 * acts on the footing it ends at, at the first floor, toward the line. `heightOf` gives how far
 * above that footing's column foot the tie runs, m.
 */
export function tiePulls(rows: readonly FootingRow[], heightOf: (d: FootingDemand, tieH: number, from: FootingRow) => number, demands: readonly FootingDemand[]): Map<string, TiePull[]> {
  const out = new Map<string, TiePull[]>();
  for (const r of rows) for (const t of r.edge?.ties ?? []) {
    if (!t.partner) continue;
    const q = demands.find((x) => x.key === t.partner!.key);
    if (!q) continue;
    const toward = (Math.sign(t.axis === 'x' ? r.demand.at.x - q.at.x : r.demand.at.y - q.at.y) || 1) as 1 | -1;
    out.set(q.key, [...(out.get(q.key) ?? []), { from: r.key, name: r.name, axis: t.axis, toward, height: heightOf(q, t.H, r), byCombo: t.byCombo, service: t.Ts }]);
  }
  return out;
}

/** An action with the pulls added: each a horizontal force at its height above the column's foot, its shear and its moment there. */
export function pulled(a: FootingAction, pulls: readonly TiePull[], force: (p: TiePull) => number): FootingAction {
  let { Mx, My, Vx, Vy } = a;
  for (const p of pulls) {
    const T = force(p) * p.toward;
    if (p.axis === 'x') { Vx += T; My += T * p.height; } else { Vy += T; Mx -= T * p.height; }
  }
  return { ...a, Mx, My, Vx, Vy };
}

/** The demand of a footing that ties end at, with their pulls in every combination and in service. */
export function withPulls(d: FootingDemand, pulls: readonly TiePull[]): FootingDemand {
  if (!pulls.length) return d;
  return {
    ...d, pulls: [...pulls],
    service: d.service ? pulled(d.service, pulls, (p) => p.service) : d.service,
    combos: d.combos.map((k) => pulled(k, pulls, (p) => p.byCombo[k.combo] ?? 0)),
  };
}
