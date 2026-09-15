/**
 * INPRES-CIRSOC 103 Parte I (2018) — design spectrum and the gravity load that goes with it.
 *
 * §2.2 / Anexo A   seismic zoning
 * §2.3.1           site classification SA…SF
 * §2.4             destination groups and the risk factor γr
 * §3.5.1           the elastic design spectrum, Eqs. [3.1]–[3.4]
 * Tabla 3.1        Ca and Cv by zone and spectral type; Na and Nv
 * Tabla 3.2        T3 by zone
 * §3.6 Tabla 3.3   the fraction of the imposed load that is present during the earthquake
 *
 * ── Why this is being written from the regulation ──────────────
 *
 * A seismic workflow existed on a branch that was lost with the machine it was on; see
 * `docs/handoffs/deferred-seismic-103-2026-07-29.md`. No code and no diff survived, and
 * the handoff is explicit that its successor must re-derive from the regulation rather
 * than present anything as continuing prior work. Everything here is read off the
 * printed text, and the clause is recorded on every value.
 *
 * ── The one thing this refuses to do ───────────────────────────
 *
 * Decide which zone a building is in. Anexo A assigns zones department by department —
 * "4 parte de Tulumba", "25 parte de Presidente Roque Sáenz Peña" — across five zones
 * and every province, in a two-column layout. A digitised version of that would be a
 * table nobody checked, and putting a building in zone 2 that belongs in zone 4 changes
 * the base shear by a factor of two with no symptom anywhere. The zone is an input, and
 * the annex is cited so the reader knows exactly what to open.
 *
 * Pure: no store, no runes.
 */

import { clause, type ClauseRef } from '../regulation';
import { msg, round, type EngineMessage } from '../message';

const ED = '2018';

const REF_ZONING = clause('inpres-cirsoc-103-i', ED, 'Anexo A — art. 2.2', 'zonificación sísmica');
const REF_SITE = clause('inpres-cirsoc-103-i', ED, '2.3.1', 'clasificación del sitio de emplazamiento');
export const REF_GROUPS = clause('inpres-cirsoc-103-i', ED, '2.4', 'clasificación según destino y factor de riesgo');
const REF_T31 = clause('inpres-cirsoc-103-i', ED, 'Tabla 3.1', 'valores de as, Ca y Cv');
const REF_T32 = clause('inpres-cirsoc-103-i', ED, 'Tabla 3.2', 'valor del período T3');
const REF_SPECTRUM = clause('inpres-cirsoc-103-i', ED, '3.5.1', 'espectros de diseño para acciones horizontales (ELU)');
const REF_T33 = clause('inpres-cirsoc-103-i', ED, 'Tabla 3.3', 'factor de simultaneidad para sobrecargas');

// ─── Zoning ──────────────────────────────────────────────────────

export type SeismicZone = 0 | 1 | 2 | 3 | 4;

/**
 * Effective ground acceleration as, by zone, in g — Tabla 3.1's column headings.
 *
 * Zone 0 is absent on purpose: Tabla 3.1 prints no spectrum for it, because §2.5.2
 * exempts most construction there from the regulation entirely. `designSpectrum`
 * reports that rather than extrapolating a fifth column.
 */
export const ZONE_AS: Readonly<Record<1 | 2 | 3 | 4, number>> =
  Object.freeze({ 1: 0.08, 2: 0.15, 3: 0.25, 4: 0.35 });

/** Tabla 3.2 — the period at which the spectrum's last branch begins, s. */
export const ZONE_T3: Readonly<Record<1 | 2 | 3 | 4, number>> =
  Object.freeze({ 1: 3, 2: 5, 3: 8, 4: 13 });

// ─── Site ────────────────────────────────────────────────────────

export type SiteClass = 'SA' | 'SB' | 'SC' | 'SD' | 'SE' | 'SF';
export type SpectralType = 1 | 2 | 3;

/**
 * Tabla 3.1's row, by site class.
 *
 * SF returns null: §2.3.2 sends those soils to a site-specific evaluation, and there is
 * no row in the table to read for them.
 */
export function spectralType(site: SiteClass): SpectralType | null {
  switch (site) {
    case 'SA': case 'SB': case 'SC': return 1;
    case 'SD': return 2;
    case 'SE': return 3;
    case 'SF': return null;
  }
}

// ─── Destination group ───────────────────────────────────────────

export type DestinationGroup = 'Ao' | 'A' | 'B' | 'C';

/** §2.4 — the risk factor γr, by destination group. */
export const RISK_FACTOR: Readonly<Record<DestinationGroup, number>> =
  Object.freeze({ Ao: 1.5, A: 1.3, B: 1.0, C: 0.8 });

// ─── Tabla 3.1 ───────────────────────────────────────────────────

/**
 * Ca and Cv, as printed: a plain number in zones 1 and 2, and a multiple of Na or Nv in
 * zones 3 and 4, which are where fault proximity is treated.
 */
const T31: Readonly<Record<SpectralType, Record<1 | 2 | 3 | 4, { ca: number; cv: number; near: boolean }>>> =
  Object.freeze({
    1: { 4: { ca: 0.37, cv: 0.51, near: true }, 3: { ca: 0.29, cv: 0.39, near: true },
         2: { ca: 0.18, cv: 0.25, near: false }, 1: { ca: 0.09, cv: 0.13, near: false } },
    2: { 4: { ca: 0.40, cv: 0.59, near: true }, 3: { ca: 0.32, cv: 0.47, near: true },
         2: { ca: 0.22, cv: 0.32, near: false }, 1: { ca: 0.12, cv: 0.18, near: false } },
    3: { 4: { ca: 0.36, cv: 0.90, near: true }, 3: { ca: 0.35, cv: 0.74, near: true },
         2: { ca: 0.30, cv: 0.50, near: false }, 1: { ca: 0.19, cv: 0.26, near: false } },
  });

/**
 * Tabla 3.1, closing note — the floors on the fault-proximity coefficients.
 *
 * The table prints "Na ≥ 1" and "Nv ≥ 1,2" and gives no distance-to-fault table to
 * raise them with, so these are what the generator uses and what it says it used. The
 * lost branch left Na/Nv recorded as an open question; it still is, and an assumption
 * that announces itself is the only honest form for it.
 */
export const NA_MIN = 1.0;
export const NV_MIN = 1.2;

export interface SpectrumInputs {
  zone: SeismicZone;
  site: SiteClass;
  /** Fault-proximity coefficients. Below the printed floors they are raised to them. */
  na?: number;
  nv?: number;
}

export interface DesignSpectrum {
  zone: 1 | 2 | 3 | 4;
  type: SpectralType;
  /** Effective ground acceleration, g. */
  as: number;
  ca: number;
  cv: number;
  na: number;
  nv: number;
  /** Characteristic periods, s. T1 = 0,2 T2 [3.14]; T2 = Cv/(2,5 Ca) [3.13]. */
  t1: number;
  t2: number;
  t3: number;
  refs: ClauseRef[];
  assumptions: EngineMessage[];
}

export interface SpectrumBlocked {
  blocked: EngineMessage;
  refs: ClauseRef[];
}

export function isBlocked(r: DesignSpectrum | SpectrumBlocked): r is SpectrumBlocked {
  return (r as SpectrumBlocked).blocked !== undefined;
}

/**
 * The elastic design spectrum's parameters, or the reason there is none.
 *
 * Two conditions have no row to read and are reported rather than approximated: zone 0,
 * which Tabla 3.1 does not cover, and site class SF, which §2.3.2 sends to a
 * site-specific study.
 */
export function designSpectrum(i: SpectrumInputs): DesignSpectrum | SpectrumBlocked {
  if (i.zone === 0) {
    return {
      blocked: msg('seismic.blocked.zone0'),
      refs: [REF_ZONING, clause('inpres-cirsoc-103-i', ED, '2.5.2', 'construcciones en Zona 0')],
    };
  }
  const type = spectralType(i.site);
  if (type === null) {
    return {
      blocked: msg('seismic.blocked.siteSF'),
      refs: [REF_SITE, clause('inpres-cirsoc-103-i', ED, '2.3.2', 'suelos que requieren evaluación específica del sitio')],
    };
  }

  const row = T31[type][i.zone];
  const assumptions: EngineMessage[] = [];
  let na = 1;
  let nv = 1;
  if (row.near) {
    na = Math.max(NA_MIN, i.na ?? NA_MIN);
    nv = Math.max(NV_MIN, i.nv ?? NV_MIN);
    if (i.na === undefined || i.nv === undefined) {
      assumptions.push(msg('seismic.assumed.faultProximity', { na: NA_MIN, nv: NV_MIN }));
    }
  }

  const ca = row.ca * na;
  const cv = row.cv * nv;
  const t2 = cv / (2.5 * ca);        // [3.13]
  const t1 = 0.2 * t2;               // [3.14]

  return {
    zone: i.zone, type, as: ZONE_AS[i.zone], ca, cv, na, nv,
    t1, t2, t3: ZONE_T3[i.zone],
    refs: [REF_ZONING, REF_SITE, REF_T31, REF_T32],
    assumptions,
  };
}

/**
 * §3.5.1 Eqs. [3.1]–[3.4] — the elastic spectral ordinate Sa at period T, in g.
 *
 * Four branches, and the point of implementing all four rather than the plateau alone
 * is the third: past T2 the ordinate falls as Cv/T, so a tall building's coefficient is
 * a fraction of a short one's, and treating the plateau as the whole spectrum
 * over-designs everything above about half a second.
 */
export function spectralOrdinate(t: number, s: DesignSpectrum): number {
  if (t <= s.t1) return s.ca * (1 + 1.5 * (t / s.t1));   // [3.1]
  if (t <= s.t2) return 2.5 * s.ca;                       // [3.2]
  if (t <= s.t3) return s.cv / t;                         // [3.3]
  return (s.cv * s.t3) / (t * t);                         // [3.4]
}

export const SPECTRUM_REF = REF_SPECTRUM;

// ─── §3.6 — the gravity load that shakes ─────────────────────────

/**
 * Tabla 3.3 — the simultaneity factor f1 for the imposed load.
 *
 * `Wi = Di + f1·Li + f2·Si` [3.15]. The point of this table is that a warehouse and a
 * flat do not carry the same fraction of their imposed load during an earthquake, and a
 * single project-wide "live participation" number — which is what the app asked for
 * before — cannot express that.
 */
export type OccupancyProbability =
  /** Imposed load acts only exceptionally: maintenance-only roofs. */
  | 'exceptional'
  /** Reduced probability: dwellings, hotels, offices. */
  | 'reduced'
  /** Intermediate: public buildings, shops, cinemas, schools. */
  | 'intermediate'
  /** High: warehouses, archives. */
  | 'high'
  /** Normally fully present: tanks, silos, stores kept full. */
  | 'full'
  /** Not listed in Tabla 3.3. */
  | 'other';

export const SIMULTANEITY_F1: Readonly<Record<OccupancyProbability, number>> =
  Object.freeze({
    exceptional: 0,
    reduced: 0.25,
    intermediate: 0.50,
    high: 0.75,
    full: 1.00,
    other: 0.20,
  });

/** Tabla 3.3 — snow simultaneity factor f2. */
export const SIMULTANEITY_F2 = Object.freeze({
  /** Flat roofs, or roofs that do not shed snow. */
  retaining: 0.70,
  other: 0.20,
});

/**
 * Garages. Tabla 3.3 marks them (*) and asks for a load analysis with every space
 * occupied and the real vehicle weights, so there is no factor to return.
 */
export const GARAGE_REQUIRES_ANALYSIS = msg('seismic.f1.garageSpecial');

export interface SeismicWeightInputs {
  /** Permanent load at the level, kN. */
  deadKN: number;
  /** Imposed load at the level, kN. */
  liveKN: number;
  /** Snow load at the level, kN. */
  snowKN?: number;
  occupancy: OccupancyProbability;
  snowRetaining?: boolean;
}

export interface SeismicWeightResult {
  weightKN: number;
  f1: number;
  f2: number;
  refs: ClauseRef[];
  derivation: EngineMessage;
}

/** [3.15] — Wi = Di + f1·Li + f2·Si. */
export function seismicWeight(i: SeismicWeightInputs): SeismicWeightResult {
  const f1 = SIMULTANEITY_F1[i.occupancy];
  const f2 = i.snowRetaining ? SIMULTANEITY_F2.retaining : SIMULTANEITY_F2.other;
  const snow = i.snowKN ?? 0;
  const w = i.deadKN + f1 * i.liveKN + f2 * snow;
  return {
    weightKN: w, f1, f2,
    refs: [REF_T33, clause('inpres-cirsoc-103-i', ED, '3.6', 'acciones gravitatorias para la acción sísmica horizontal')],
    derivation: msg('seismic.derivation.weight', {
      dead: round(i.deadKN, 1), f1, live: round(i.liveKN, 1),
      f2, snow: round(snow, 1), total: round(w, 1),
    }),
  };
}
