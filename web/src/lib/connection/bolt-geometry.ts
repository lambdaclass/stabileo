/**
 * Bolt-layout geometry — CIRSOC 301-2018 §J.3.
 *
 * ── What the code gives, and it is more than expected ───────────────
 *
 * Chapter J turned out to be readable text, tables included, which is not what B.4.1 looked
 * like: Tables J.3.3 and J.3.4 are transcribable rows, not scanned images. So this module
 * computes the geometric envelope a bolt layout must sit inside, and every number in it points
 * at the clause it came from:
 *
 *   · **§J.3.3** — «La distancia mínima s entre los centros de los agujeros normales u holgados
 *     será 3 veces el diámetro nominal del bulón.» Arithmetic: `s ≥ 3·d`.
 *   · **§J.3.4, Tabla J.3.4** — minimum edge distance, per diameter, and different for a sheared
 *     or punched edge than for a rolled or flame-cut one. Above 30 mm the table itself gives a
 *     rule: `1,75·d` and `1,25·d`.
 *   · **§J.3.5** — «La distancia máxima desde el centro de cualquier remache o bulón al borde
 *     más próximo … será igual a 12 veces el espesor de la parte unida en consideración, pero
 *     no excederá de 150 mm», and a maximum longitudinal spacing that depends on exposure:
 *     `24·t` and ≤ 300 mm painted, `14·t` and ≤ 180 mm for weathering steel.
 *   · **§J.3.2, Tabla J.3.3** — nominal hole dimensions, per diameter, with `d+3` above 28 mm.
 *
 * ── What it does not do ─────────────────────────────────────────────
 *
 * It does not design a connection. It has no demand, no bolt count, no plate outline, and it
 * invents none of them: given a diameter and a thickness it reports the envelope, and given
 * nothing it reports what is missing. A joint is not detailed because its bolt spacing has a
 * lower bound.
 *
 * The three strength clauses — J.3.6 tension and shear, J.3.8 slip-critical, J.3.10 bearing —
 * are deliberately outside this file. They need demands, and `connection-design.ts` already
 * holds the bolt strength table. This is the GEOMETRY, which is the half that can be answered
 * from a diameter alone.
 */

/** How the edge was made, which changes the minimum distance to it — Tabla J.3.4. */
export type EdgeFinish =
  /** Sheared, die-cut or punched. The larger requirement. */
  | 'sheared'
  /** Rolled edge of a plate, shape or bar, or a flame-cut edge. */
  | 'rolled';

/** Exposure, which changes the maximum longitudinal spacing — §J.3.5. */
export type Exposure =
  /** Painted, or unpainted with no corrosion risk. */
  | 'painted'
  /** Unpainted weathering steel exposed to atmospheric corrosion. */
  | 'weathering';

export interface BoltQuantity {
  /** Millimetres. Null when the input it needs is absent. */
  valueMm: number | null;
  /** Dotted CIRSOC clause. Never absent. */
  clause: string;
  /** i18n key qualifying the value, or explaining its absence. */
  noteKey: string;
  /** Whether the number was read from a table or computed from a rule. */
  basis: 'tabulated' | 'derivedFromRule' | 'unavailable';
}

/**
 * Tabla J.3.4 — minimum edge distance, mm, centre of a standard hole to the edge.
 *
 * Transcribed from the shipped text. The `>30` row is a rule rather than a pair of numbers, and
 * is applied below instead of being expanded into invented entries.
 */
const MIN_EDGE_DISTANCE: ReadonlyArray<{ d: number; sheared: number; rolled: number }> = Object.freeze([
  { d: 6, sheared: 12, rolled: 10 },
  { d: 7, sheared: 14, rolled: 11 },
  { d: 8, sheared: 15, rolled: 12 },
  { d: 10, sheared: 18, rolled: 14 },
  { d: 12, sheared: 22, rolled: 16 },
  { d: 14, sheared: 25, rolled: 18 },
  { d: 16, sheared: 28, rolled: 22 },
  { d: 20, sheared: 34, rolled: 26 },
  { d: 22, sheared: 38, rolled: 28 },
  { d: 24, sheared: 42, rolled: 30 },
  { d: 27, sheared: 48, rolled: 34 },
  { d: 30, sheared: 52, rolled: 38 },
]);

/**
 * Tabla J.3.3 — nominal standard hole diameter, mm.
 *
 * Note this is NOT the `nominal + 2 mm` of §B.4.2. That clause is about the hole to deduct when
 * computing a NET AREA — «se tomará 2 mm mayor que la dimensión nominal del agujero» — and this
 * is the hole itself. Both appear in this app and they are different numbers; conflating them
 * would over- or under-deduct on every bolted tension member.
 */
const STANDARD_HOLE: ReadonlyArray<{ d: number; hole: number }> = Object.freeze([
  { d: 6, hole: 8 }, { d: 7, hole: 9 }, { d: 8, hole: 10 }, { d: 10, hole: 12 },
  { d: 12, hole: 14 }, { d: 14, hole: 16 }, { d: 16, hole: 18 }, { d: 20, hole: 22 },
  { d: 22, hole: 24 }, { d: 24, hole: 27 }, { d: 27, hole: 30 },
]);

export interface BoltLayoutInput {
  /** Nominal bolt diameter, mm. Absent is a normal state — nothing has chosen one. */
  diameterMm?: number;
  /** Thickness of the connected part under consideration, mm. */
  plateThicknessMm?: number;
  edgeFinish?: EdgeFinish;
  exposure?: Exposure;
}

export interface BoltLayoutEnvelope {
  /** `s ≥ 3·d` — §J.3.3. */
  minSpacing: BoltQuantity;
  /** Tabla J.3.4, or its `>30 mm` rule. */
  minEdgeDistance: BoltQuantity;
  /** `12·t`, capped at 150 mm — §J.3.5. */
  maxEdgeDistance: BoltQuantity;
  /** `24·t ≤ 300` painted, `14·t ≤ 180` weathering — §J.3.5. */
  maxLongitudinalSpacing: BoltQuantity;
  /** Tabla J.3.3. */
  standardHoleDiameter: BoltQuantity;
  /** i18n keys for the inputs that are missing. Empty when the envelope is complete. */
  missingKeys: readonly string[];
  /** True when every quantity has a number. */
  complete: boolean;
}

const none = (clause: string, noteKey: string): BoltQuantity =>
  ({ valueMm: null, clause, noteKey, basis: 'unavailable' });

/** Exact row, or null. Never the nearest — a 21 mm bolt is not a 20 mm bolt. */
function rowFor<T extends { d: number }>(table: readonly T[], d: number): T | null {
  return table.find((r) => r.d === d) ?? null;
}

/**
 * The geometric envelope for a bolt layout.
 *
 * Everything absent comes back null with the clause still attached, so a surface can show what
 * the rule IS while saying it cannot evaluate it yet. That is the difference between "this
 * connection has no spacing requirement" and "nobody has chosen a diameter".
 */
export function boltLayoutEnvelope(input: BoltLayoutInput): BoltLayoutEnvelope {
  const { diameterMm: d, plateThicknessMm: t, edgeFinish = 'rolled', exposure = 'painted' } = input;
  const missing: string[] = [];
  if (d == null || !(d > 0)) missing.push('bolt.missing.diameter');
  if (t == null || !(t > 0)) missing.push('bolt.missing.plateThickness');

  const minSpacing: BoltQuantity = d != null && d > 0
    ? { valueMm: 3 * d, clause: 'J.3.3', noteKey: 'bolt.minSpacing.threeDiameters', basis: 'derivedFromRule' }
    : none('J.3.3', 'bolt.needsDiameter');

  const edgeRow = d != null ? rowFor(MIN_EDGE_DISTANCE, d) : null;
  const minEdge: BoltQuantity = (() => {
    if (d == null || !(d > 0)) return none('J.3.4', 'bolt.needsDiameter');
    if (edgeRow) {
      return {
        valueMm: edgeFinish === 'sheared' ? edgeRow.sheared : edgeRow.rolled,
        clause: 'J.3.4', noteKey: `bolt.minEdge.${edgeFinish}`, basis: 'tabulated',
      };
    }
    /*
     * The table's own rule above 30 mm: «> 30 → 1.75 × Diámetro / 1.25 × Diámetro». Applied only
     * ABOVE the table's range; a diameter that merely falls between two rows — 18 mm, say — gets
     * nothing, because interpolating a code table is inventing a limit it does not state.
     */
    if (d > 30) {
      return {
        valueMm: (edgeFinish === 'sheared' ? 1.75 : 1.25) * d,
        clause: 'J.3.4', noteKey: 'bolt.minEdge.aboveTable', basis: 'derivedFromRule',
      };
    }
    return none('J.3.4', 'bolt.minEdge.notTabulated');
  })();

  const maxEdge: BoltQuantity = t != null && t > 0
    ? {
        // «12 veces el espesor … pero no excederá de 150 mm»
        valueMm: Math.min(12 * t, 150),
        clause: 'J.3.5', noteKey: 'bolt.maxEdge.twelveT', basis: 'derivedFromRule',
      }
    : none('J.3.5', 'bolt.needsThickness');

  const maxSpacing: BoltQuantity = t != null && t > 0
    ? {
        valueMm: exposure === 'weathering' ? Math.min(14 * t, 180) : Math.min(24 * t, 300),
        clause: 'J.3.5', noteKey: `bolt.maxSpacing.${exposure}`, basis: 'derivedFromRule',
      }
    : none('J.3.5', 'bolt.needsThickness');

  const holeRow = d != null ? rowFor(STANDARD_HOLE, d) : null;
  const hole: BoltQuantity = (() => {
    if (d == null || !(d > 0)) return none('J.3.2', 'bolt.needsDiameter');
    if (holeRow) {
      return { valueMm: holeRow.hole, clause: 'J.3.2', noteKey: 'bolt.hole.tabulated', basis: 'tabulated' };
    }
    // «>28 → d+3»
    if (d > 28) {
      return { valueMm: d + 3, clause: 'J.3.2', noteKey: 'bolt.hole.aboveTable', basis: 'derivedFromRule' };
    }
    return none('J.3.2', 'bolt.hole.notTabulated');
  })();

  const all = [minSpacing, minEdge, maxEdge, maxSpacing, hole];
  return {
    minSpacing,
    minEdgeDistance: minEdge,
    maxEdgeDistance: maxEdge,
    maxLongitudinalSpacing: maxSpacing,
    standardHoleDiameter: hole,
    missingKeys: missing,
    complete: all.every((q) => q.valueMm !== null),
  };
}

/** The diameters Tabla J.3.4 actually tabulates, so a picker offers no size the code does not. */
export const TABULATED_DIAMETERS_MM: readonly number[] =
  Object.freeze(MIN_EDGE_DISTANCE.map((r) => r.d));
