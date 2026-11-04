/**
 * What transverse steel a floor's slabs, walls and foundations actually require — and the
 * physical pieces that satisfy it.
 *
 * ── Why this module exists ─────────────────────────────────────────
 *
 * `assessConstructibility`'s thirteenth condition asks whether every REQUIRED transverse
 * path was materialised. `floor-design.ts` did not answer it: it built its
 * `ConstructibilityFacts` without `requiredTransversePieces` or
 * `materialisedTransversePieces` at all, so the comparison ran `undefined >= undefined`,
 * which is `false`, and every floor was pinned below CONSTRUCTIBLE for a reason that had
 * nothing to do with its steel. (It is also a type error the repo's `vite build` never
 * sees, because `build` does not typecheck.)
 *
 * The repair is not to hand the gate a number. It is to state, per family and from the
 * clauses, what transverse steel is required — and then to build it.
 *
 * ── An empty requirement is a real answer ──────────────────────────
 *
 * Three of the four families here usually require NO transverse steel, and that is a
 * property of the regulation rather than a gap in this code:
 *
 * - a slab whose one-way shear is carried by the concrete needs no shear reinforcement;
 * - a footing sized so its concrete carries one-way and punching shear needs none either
 *   — that is precisely how a spread footing is proportioned;
 * - a wall whose vertical ratio stays under §11.7.4.1's 0,01 needs no ties around it.
 *
 * So each family returns an `applicable: false` requirement carrying the clause and the
 * measurement that made it empty. That is deliberately NOT the same as a materialised
 * path: nothing is counted as built, and the reason is auditable. Faking a path, or
 * flipping the gate with a count, would make the empty case indistinguishable from a
 * generator that silently produced nothing — which is the exact failure the condition was
 * added to catch.
 *
 * ── The one family that does require it, and did not have it ───────
 *
 * Column starter bars lapping out of a footing are a column cage, and §10.7.6.1.1 requires
 * ties around it. `generateDowels` emitted the vertical dowels and nothing else, so every
 * footing in the model drew a bundle of unrestrained bars. That is a genuine required
 * transverse path that was genuinely missing, and it is built here.
 *
 * Pure: no store, no runes, no i18n.
 */

import {
  buildStraightBarWithHooks, type BarPath, type Point3,
} from '../../codes/cirsoc201/bar-geometry';
import {
  buildColumnTieSet, stirrupStations, stirrupStationCount,
  type LongitudinalBarRef, type TransversePiece,
} from '../../codes/cirsoc201/transverse-cage';
import { clause, type ClauseRef, type RegulationEdition } from '../../codes/regulation';
import { msg, type EngineMessage } from '../../codes/message';
import type { SlabDesignResult } from './slab-design';
import type { WallDesignResult } from './wall-design';
import type { FootingCheck } from './foundation-check';

export type TransverseFamily = 'slab' | 'wall' | 'footing' | 'dowel';

/**
 * One family's transverse requirement at one scope.
 *
 * `requiredPieces` is derived from the ZONE — a length and a clause-limited spacing — never
 * from the pieces that were built, for the reason `stirrupStationCount` documents: a
 * requirement read off the output is satisfied by a generator that emits nothing.
 */
export interface TransverseRequirement {
  family: TransverseFamily;
  /** The slab panel, wall, footing or connection this applies to. */
  scopeId: string;
  elementIds: number[];
  /**
   * True when the clauses impose transverse steel here at all.
   *
   * `false` with `requiredPieces: 0` is the honest representation of "this family, in this
   * condition, needs none" — an EMPTY requirement set, not a satisfied one.
   */
  applicable: boolean;
  requiredPieces: number;
  /** States the measurement that produced the requirement, including an empty one. */
  reason: EngineMessage;
  refs: ClauseRef[];
}

export interface RequirementTotals {
  requiredPieces: number;
  materialisedPieces: number;
  /** Requirements the clauses do impose. */
  applicable: TransverseRequirement[];
  /** Requirements the clauses genuinely leave empty, with the reason each is empty. */
  empty: TransverseRequirement[];
}

// ─── Slabs ───────────────────────────────────────────────────────

/**
 * §7.6.3.1 / §8.6.3.1 — shear reinforcement is required only where `V_u` exceeds `φV_c`.
 *
 * A slab is normally proportioned so it does not need any, which is why the ordinary
 * outcome here is an empty set rather than a cage. When the concrete is NOT enough the
 * requirement is real, but this engine cannot size slab shear reinforcement, so the
 * shortfall is reported by `designSlabPanel` as an unsupported condition and no invented
 * piece count is attached to it.
 */
export function slabTransverseRequirement(
  scopeId: string, elementIds: number[], design: SlabDesignResult,
  edition: RegulationEdition,
): TransverseRequirement {
  const refs = [clause('cirsoc-201', edition, edition === '2025' ? '7.6.3.1' : '11.5.5.1',
    'armadura de corte mínima en losas')];
  const carried = design.shear.ok;
  return {
    family: 'slab', scopeId, elementIds,
    applicable: !carried,
    requiredPieces: 0,
    reason: carried
      ? msg('detailing.transverse.slabNoneRequired', {
        vu: +design.shear.vu.toFixed(1), phiVc: +design.shear.phiVc.toFixed(1),
      })
      : msg('detailing.transverse.slabShearReinforcementNeeded', {
        vu: +design.shear.vu.toFixed(1), phiVc: +design.shear.phiVc.toFixed(1),
      }),
    refs,
  };
}

// ─── Walls ───────────────────────────────────────────────────────

/**
 * §11.7.4.1 — ties per §10.7.6 are required only where the vertical reinforcement ratio
 * exceeds 0,01, or where the vertical bars are needed as compression reinforcement.
 *
 * A distributed-reinforcement wall at the §11.6.1 minimum is an order of magnitude under
 * that, so the ordinary wall requires no ties. The wall's HORIZONTAL bars are not ties:
 * they are distributed reinforcement resisting in-plane shear, they are generated as
 * physical bars by `generateWallBars`, and counting them here would conflate two different
 * provisions.
 */
export function wallTransverseRequirement(
  scopeId: string, elementIds: number[], design: WallDesignResult,
  edition: RegulationEdition,
): TransverseRequirement {
  const refs = [
    clause('cirsoc-201', edition, '11.7.4.1', 'estribos en la armadura vertical de tabiques'),
    clause('cirsoc-201', edition, '10.7.6', 'armadura transversal en elementos comprimidos'),
  ];
  const rhoL = design.ratios.rhoL;
  const needsTies = rhoL > 0.01;
  return {
    family: 'wall', scopeId, elementIds,
    applicable: needsTies,
    requiredPieces: 0,
    reason: needsTies
      ? msg('detailing.transverse.wallTiesNeeded', { rho: +rhoL.toFixed(4) })
      : msg('detailing.transverse.wallNoTiesRequired', { rho: +rhoL.toFixed(4) }),
    refs,
  };
}

// ─── Footings ────────────────────────────────────────────────────

/**
 * A spread footing carries shear on its concrete alone — that is what its thickness is
 * chosen for. So the requirement is empty exactly when both shear checks pass, and when
 * one does not, the footing is already UNSUPPORTED or failing and says so itself.
 */
export function footingTransverseRequirement(
  scopeId: string, elementIds: number[], check: FootingCheck,
  edition: RegulationEdition,
): TransverseRequirement {
  const refs = [clause('cirsoc-201', edition, '13.2.6',
    'resistencia al corte en bases')];
  const oneWayOk = check.oneWayShear?.status === 'OK';
  const punchingOk = check.punching?.status === 'OK';
  const carried = check.status === 'OK' && oneWayOk && punchingOk;
  return {
    family: 'footing', scopeId, elementIds,
    applicable: !carried,
    requiredPieces: 0,
    reason: carried
      ? msg('detailing.transverse.footingNoneRequired', {
        oneWay: +(check.oneWayShear?.utilization ?? 0).toFixed(2),
        punching: +(check.punching?.utilization ?? 0).toFixed(2),
      })
      : msg('detailing.transverse.footingShearNotEstablished', { status: check.status }),
    refs,
  };
}

// ─── Column starter cages ────────────────────────────────────────

/** Everything the starter cage needs that the dowel geometry does not already state. */
export interface StarterCageInput {
  id: string;
  centre: { x: number; y: number };
  footingTopZ: number;
  /** Lap length above the footing, m — the cage covers it. */
  lapAbove: number;
  columnB: number;
  columnH: number;
  cover: number;
  tieDia: number;
  /** The dowels this cage restrains. */
  bars: { count: number; diameterMm: number };
  maxAggregateSizeMm: number;
  elementIds: number[];
  edition: RegulationEdition;
}

/**
 * §10.7.6.1.2 tie spacing: the least of 16 longitudinal diameters, 48 tie diameters and the
 * smallest column dimension.
 */
export function starterTieSpacing(input: {
  longitudinalDiaMm: number; tieDiaMm: number; columnB: number; columnH: number;
}): number {
  return Math.min(
    16 * input.longitudinalDiaMm / 1000,
    48 * input.tieDiaMm / 1000,
    Math.min(input.columnB, input.columnH),
  );
}

/**
 * How many tie sets the starter cage requires, from the lap length and the clause spacing.
 *
 * Derived from the ZONE, not from what was built — see `stirrupStationCount`.
 */
export function starterTieCount(input: StarterCageInput): number {
  const spacing = starterTieSpacing({
    longitudinalDiaMm: input.bars.diameterMm, tieDiaMm: input.tieDia,
    columnB: input.columnB, columnH: input.columnH,
  });
  return stirrupStationCount(0, input.lapAbove, spacing, false);
}

export function dowelTransverseRequirement(
  input: StarterCageInput,
): TransverseRequirement {
  return {
    family: 'dowel', scopeId: input.id, elementIds: input.elementIds,
    applicable: true,
    requiredPieces: starterTieCount(input),
    reason: msg('detailing.transverse.starterTiesRequired', {
      lap: +input.lapAbove.toFixed(3),
      spacing: +starterTieSpacing({
        longitudinalDiaMm: input.bars.diameterMm, tieDiaMm: input.tieDia,
        columnB: input.columnB, columnH: input.columnH,
      }).toFixed(3),
    }),
    refs: [
      clause('cirsoc-201', input.edition, '10.7.6.1.1',
        'estribos en toda la altura del elemento comprimido'),
      clause('cirsoc-201', input.edition, '10.7.6.1.2', 'separación máxima de estribos'),
      clause('cirsoc-201', input.edition, '16.3.4',
        'transmisión de fuerzas por armadura en la interfaz'),
    ],
  };
}

/**
 * The physical ties that restrain the starter bars over their lap.
 *
 * Reuses `buildColumnTieSet` — the same builder PR17 uses for a column lift — so a starter
 * cage and a column cage are the same detail, checked by the same collision rules, rather
 * than a second spelling of one bend.
 */
export function generateStarterTies(
  input: StarterCageInput, dowelPositions: readonly { x: number; y: number }[],
): { pieces: TransversePiece[]; bars: BarPath[]; refs: ClauseRef[] } {
  const spacing = starterTieSpacing({
    longitudinalDiaMm: input.bars.diameterMm, tieDiaMm: input.tieDia,
    columnB: input.columnB, columnH: input.columnH,
  });
  const stations = stirrupStations({
    from: 0, to: input.lapAbove, spacing, nextZoneStartsAtEnd: false,
  });

  // Section frame for a vertical member: axis up, `up` along +y, `across` = axis × up = +x.
  const axis: Point3 = { x: 0, y: 0, z: 1 };
  const up: Point3 = { x: 0, y: 1, z: 0 };
  const across: Point3 = { x: 1, y: 0, z: 0 };
  const origin: Point3 = {
    x: input.centre.x, y: input.centre.y, z: input.footingTopZ,
  };

  const longitudinalBars: LongitudinalBarRef[] = dowelPositions.map((p, k) => ({
    id: `${input.id}-dowel-${k}`,
    across: p.x, up: p.y, diameterMm: input.bars.diameterMm,
  }));

  const pieces: TransversePiece[] = [];
  const refs: ClauseRef[] = [];
  stations.forEach((station, i) => {
    const set = buildColumnTieSet({
      elementId: input.elementIds[0] ?? 0,
      cageId: `${input.id}-starter`,
      zoneId: `${input.id}:starter`,
      station,
      b: input.columnB, h: input.columnH,
      cover: input.cover,
      stirrupDiaMm: input.tieDia,
      legs: 2,
      longitudinalBars,
      origin, axis, up, across,
      hookOrientation: i % 2 === 0 ? 'a' : 'b',
      maxAggregateSizeMm: input.maxAggregateSizeMm,
    });
    pieces.push(...set.pieces);
    refs.push(...set.unsupported);
  });

  return { pieces, bars: pieces.map((p) => p.path), refs };
}

// ─── Wall reinforcement ──────────────────────────────────────────

export interface WallGeometry {
  wallId: string;
  /** Centreline of the wall base, in plan. */
  start: Point3;
  end: Point3;
  height: number;
  thickness: number;
  cover: number;
  elementIds: number[];
  /** Openings, along the wall from its start and up from its base, m. */
  openings?: Array<{ offset: number; width: number; sill: number; height: number }>;
}

/**
 * §11.7.2.3 — two curtains are required once the wall is thicker than 250 mm.
 *
 * Below that a single central curtain is what the clause allows and what is built.
 */
export function wallCurtains(thickness: number): 1 | 2 {
  return thickness > 0.25 ? 2 : 1;
}

/**
 * Physical vertical and horizontal reinforcement for one wall.
 *
 * Walls previously contributed NO bars to the floor assembly at all — the wall loop pushed
 * maturity, assumptions and unsupported conditions and never touched the bar list — so a
 * designed wall appeared in no drawing, no mark, no schedule and no collision check.
 */
export function generateWallBars(
  geometry: WallGeometry, design: WallDesignResult,
  barDiameterMm: number, edition: RegulationEdition,
): BarPath[] {
  const bars: BarPath[] = [];
  const r = design.reinforcement;
  const vDia = r?.vertical.diameter ?? barDiameterMm, hDia = r?.horizontal.diameter ?? barDiameterMm;
  const dv = vDia / 1000, dh = hDia / 1000;

  const dx = geometry.end.x - geometry.start.x;
  const dy = geometry.end.y - geometry.start.y;
  const length = Math.hypot(dx, dy);
  if (!(length > 0) || !(geometry.height > 0)) return bars;

  // Unit vector along the wall, and its in-plan normal (the thickness direction).
  const ux = dx / length;
  const uy = dy / length;
  const nx = -uy;
  const ny = ux;

  const curtains = r?.curtains ?? wallCurtains(geometry.thickness);
  // Horizontal bars sit OUTSIDE the verticals: they are the outer curtain in a wall, which
  // is what gives the verticals their cover and lets the horizontals be tied to them.
  const halfT = geometry.thickness / 2;
  const offsets = curtains === 2
    ? [-(halfT - geometry.cover - dh / 2), halfT - geometry.cover - dh / 2]
    : [0];

  const ANCHOR = 0.15;
  const openings = geometry.openings ?? [];
  const z0 = geometry.start.z;
  const at = (s: number, off: number, z: number): Point3 => ({ x: geometry.start.x + ux * s + nx * off, y: geometry.start.y + uy * s + ny * off, z });
  const push = (id: string, dia: number, a: Point3, b: Point3, axis: Point3, hookNormal: Point3) => bars.push(buildStraightBarWithHooks({
    id, diameterMm: dia, role: 'longitudinal', start: a, end: b, axis, hookNormal, ownerElementIds: geometry.elementIds, edition,
  }));
  /** The pieces of [lo, hi] left outside the openings that cross a line. */
  const cut = (lo: number, hi: number, holes: Array<[number, number]>): Array<[number, number]> => {
    let parts: Array<[number, number]> = [[lo, hi]];
    for (const [a, b] of holes) parts = parts.flatMap(([p, q]) => (b <= p || a >= q ? [[p, q]] : [[p, Math.min(q, a)], [Math.max(p, b), q]].filter(([u, v]) => v - u > 0.05) as Array<[number, number]>));
    return parts;
  };

  for (const [c, off] of offsets.entries()) {
    // ── Vertical (longitudinal) reinforcement, cut at the openings ──
    const vOff = off - Math.sign(off || 1) * (dv + dh) / 2;
    const nV = Math.max(1, Math.floor(length / design.verticalSpacing));
    for (let i = 0; i < nV; i++) {
      const s = (i + 0.5) * design.verticalSpacing;
      const holes = openings.filter((o) => s > o.offset && s < o.offset + o.width).map((o) => [z0 + o.sill, z0 + o.sill + o.height] as [number, number]);
      cut(z0 - ANCHOR, z0 + geometry.height, holes).forEach(([a, b], k) => push(
        `${geometry.wallId}-v${c}-${i}${k ? `-${k}` : ''}`, vDia, at(s, vOff, a), at(s, vOff, b), { x: 0, y: 0, z: 1 }, { x: nx, y: ny, z: 0 }));
    }

    // ── Horizontal (distributed shear) reinforcement, cut at the openings ──
    const nH = Math.max(1, Math.floor(geometry.height / design.horizontalSpacing));
    for (let j = 0; j < nH; j++) {
      const z = z0 + (j + 0.5) * design.horizontalSpacing;
      const holes = openings.filter((o) => z > z0 + o.sill && z < z0 + o.sill + o.height).map((o) => [o.offset, o.offset + o.width] as [number, number]);
      cut(-ANCHOR, length + ANCHOR, holes).forEach(([a, b], k) => push(
        `${geometry.wallId}-h${c}-${j}${k ? `-${k}` : ''}`, hDia, at(a, off, z), at(b, off, z), { x: ux, y: uy, z: 0 }, { x: 0, y: 0, z: -1 }));
    }

    // ── Boundary bars at both ends ──
    if (r?.boundary && r.boundary.count > 0) {
      const bd = r.boundary.diameter / 1000, pitch = Math.max(0.05, 2 * bd);
      const per = Math.ceil(r.boundary.count / curtains);
      const edge = geometry.cover + dh + dv / 2;
      for (const [e, s0] of [[0, edge], [1, length - edge]] as const) for (let i = 0; i < per; i++) {
        const s = e === 0 ? s0 + (i + 1) * pitch : s0 - (i + 1) * pitch;
        push(`${geometry.wallId}-b${e}${c}-${i}`, r.boundary.diameter, at(s, vOff, z0 - ANCHOR), at(s, vOff, z0 + geometry.height), { x: 0, y: 0, z: 1 }, { x: nx, y: ny, z: 0 });
      }
    }

    // ── Bars beside each opening (§11.7.5.1), a development length past its corners ──
    if (r?.openings && r.openings.count > 0) {
      const od = r.openings.diameter, ld = 40 * od / 1000, gap = Math.max(0.05, 2 * od / 1000);
      openings.forEach((o, k) => {
        const per = Math.max(1, Math.ceil(r.openings!.count / curtains));
        for (let i = 0; i < per; i++) {
          const zb = Math.max(z0, z0 + o.sill - ld), zt = Math.min(z0 + geometry.height, z0 + o.sill + o.height + ld);
          for (const [side, s] of [['l', o.offset - (i + 1) * gap], ['r', o.offset + o.width + (i + 1) * gap]] as const) {
            if (s > 0 && s < length) push(`${geometry.wallId}-o${k}${side}${c}-${i}`, od, at(s, vOff, zb), at(s, vOff, zt), { x: 0, y: 0, z: 1 }, { x: nx, y: ny, z: 0 });
          }
          const sa = Math.max(0, o.offset - ld), sb = Math.min(length, o.offset + o.width + ld);
          const rows: Array<['t' | 'u', number]> = [['t', z0 + o.sill + o.height + (i + 1) * gap]];
          if (o.sill > 0) rows.push(['u', z0 + o.sill - (i + 1) * gap]);
          for (const [side, z] of rows) if (z > z0 && z < z0 + geometry.height) push(`${geometry.wallId}-o${k}${side}${c}-${i}`, od, at(sa, off, z), at(sb, off, z), { x: ux, y: uy, z: 0 }, { x: 0, y: 0, z: -1 });
        }
      });
    }
  }

  return bars;
}

// ─── Totals ──────────────────────────────────────────────────────

/**
 * Fold a floor's requirements into the two counts the gate consumes.
 *
 * `materialisedPieces` is counted from the PATHS that exist, and `requiredPieces` from the
 * zones — so the pair can disagree, which is the entire point of the condition.
 */
export function summariseRequirements(
  requirements: readonly TransverseRequirement[], materialisedPieces: number,
): RequirementTotals {
  return {
    requiredPieces: requirements.reduce((n, r) => n + r.requiredPieces, 0),
    materialisedPieces,
    applicable: requirements.filter((r) => r.applicable),
    empty: requirements.filter((r) => !r.applicable),
  };
}
