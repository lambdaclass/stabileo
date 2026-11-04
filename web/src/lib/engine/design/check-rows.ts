/**
 * Every verifier's result, as the contract's check rows and element outcome.
 *
 * The concrete verifier, the CIRSOC 301 checker and the connection checks each kept their own
 * shape; the design table, the memoria and the summary of the structure read these instead.
 * Translation only: no check is recomputed here.
 */
import {
  fromVerifStatus, governingCheck, statusOfRatio, worstStatus,
  type CheckInput, type CheckRow, type ElementOutcome, type Notice,
} from '../../design-contract';
import type { ProvidedRebarResult } from '../station-design-forces';
import type { SteelVerification } from '../codes/argentina/cirsoc301';
import { CIRSOC201_DESIGN_EDITION } from '../codes/argentina/cirsoc201-basis';

/** The clause each concrete check category is written under, CIRSOC 201-2025. */
function concreteClause(category: string): string | undefined {
  const c = category.toLowerCase();
  if (c.includes('tie spacing')) return '25.7.2.1';
  if (c.includes('shear') || c.includes('corte')) return '22.5';
  if (c.includes('axial') || c.includes('p-m') || c.includes('column')) return '22.4';
  if (c.includes('crack')) return '24.3.2';
  if (c.includes('anchor') || c.includes('ld')) return '25.4';
  if (c.startsWith('fit') || c.startsWith('layout') || c.includes('spacing')) return '25.2';
  if (c.includes('min steel') || c.includes('max steel')) return '9.6.1';
  if (c.includes('my') || c.includes('mz') || c.includes('flex')) return '22.3';
  return undefined;
}

type Limiting = NonNullable<ProvidedRebarResult['checks'][number]['limiting']>;

/**
 * What each class of concrete check states: its clause in CIRSOC 201-2025, the inequality, and
 * the symbols its demand and capacity are read as. The class comes from the checker
 * (`ProvidedRebarCheck.limiting`), so the clause does not have to be guessed from the label.
 */
const CONCRETE: Record<Exclude<Limiting, 'unsupportedCheck'>, { clause: string | ((el: string) => string); formula: string; demand: string; capacity: string }> = {
  flexure: { clause: '22.3', formula: 'Mu ≤ φ·Mn', demand: 'Mu', capacity: 'φMn' },
  shear: { clause: '22.5', formula: 'Vu ≤ φ·Vn', demand: 'Vu', capacity: 'φVn' },
  axialFlexure: { clause: '22.4', formula: '(Pu, Mu) ≤ φ·(Pn, Mn)', demand: 'Mu', capacity: 'φMn' },
  biaxial: { clause: '22.4', formula: '(Pu, Mux, Muy) ≤ φ·(Pn, Mnx, Mny)', demand: 'η', capacity: '1' },
  torsion: { clause: '22.7', formula: 'Tu ≤ φ·Tn', demand: 'Tu', capacity: 'φTn' },
  // The row's width with the minimum clear spacing between bars against the width inside the stirrups.
  barFit: { clause: '25.2.1', formula: 'n·db + (n − 1)·máx(25 mm; db; 4/3·dagg) ≤ b,disp', demand: 'b,nec', capacity: 'b,disp' },
  barSpacing: { clause: '24.3.2', formula: 's ≤ s,máx', demand: 's', capacity: 's,máx' },
  anchorage: { clause: '25.4.2', formula: 'ℓd ≤ ℓ,disp', demand: 'ℓd', capacity: 'ℓ,disp' },
  // A wall's reinforcement is checked by the beam path (`verifyProvidedReinforcement`), whose
  // minimum is 9.6.1.2's flexural one: the row names what it evaluated, not 11.6.1.
  minSteel: { clause: (el) => (el === 'column' ? '10.6.1.1' : '9.6.1.2'), formula: 'As ≥ As,mín', demand: 'As,mín', capacity: 'As' },
  maxSteel: { clause: (el) => (el === 'column' ? '10.6.1.1' : '9.3.3.1'), formula: 'As ≤ As,máx', demand: 'As', capacity: 'As,máx' },
  tieSpacing: { clause: '25.7.2.1', formula: 's ≤ s,máx', demand: 's', capacity: 's,máx' },
  // Every congestion row is a clear distance between bars or layers (`computeSectionLayout`,
  // `shaped-column.ts`); ρ against its maximum is the maxSteel row.
  congestion: { clause: '25.2', formula: 's,libre ≥ s,mín', demand: 's,mín', capacity: 's,libre' },
  // Specified concrete cover is 20.5.1.3 in CIRSOC 201-2025 (docs/codes/CIRSOC/markdown/cirsoc-201-2025/
  // capitulo-20-armadura-de-acero-propiedades-durabilidad-y.md:1204), as in ACI 318-19.
  cover: { clause: '20.5.1.3', formula: 'c ≥ c,mín', demand: 'c,mín', capacity: 'c' },
};

/** The table or clause a «not evaluated» check names in its own description. */
const namedClause = (s: string) => /(?:Table|Tabla)\s+([\d.]+)/.exec(s)?.[0] ?? /§\s*([\d.]+)/.exec(s)?.[1];

/**
 * The rows are labelled with the edition the verifier computed φ and the axial cap by
 * (`CIRSOC201_DESIGN_EDITION`), read from the same constant so the two cannot drift apart.
 */
export function concreteCheckRows(p: ProvidedRebarResult, edition: string = CIRSOC201_DESIGN_EDITION): CheckRow[] {
  return p.checks.map((c) => {
    const spec = c.limiting && c.limiting !== 'unsupportedCheck' ? CONCRETE[c.limiting] : undefined;
    // A wall's own minimum (`wall-minimum-steel.ts`) names Tabla 11.6.1 or §11.6.2 in its category.
    const wallMin = c.limiting === 'minSteel' ? /\((11\.6\.[12])\)$/.exec(c.category)?.[1] : undefined;
    const clause = wallMin ?? (spec ? (typeof spec.clause === 'function' ? spec.clause(p.elementType) : spec.clause)
      : c.limiting === 'unsupportedCheck' ? namedClause(c.description) ?? concreteClause(c.category) : concreteClause(c.category));
    const inputs: CheckInput[] = [
      ...(spec && c.demand !== undefined ? [{ symbol: spec.demand, value: c.demand, unit: c.unit }] : []),
      ...(spec && c.capacity !== undefined ? [{ symbol: spec.capacity, value: c.capacity, unit: c.unit }] : []),
      ...(c.required !== undefined ? [{ symbol: 'req', value: c.required, unit: c.unit }] : []),
      ...(c.provided !== undefined ? [{ symbol: 'prov', value: c.provided, unit: c.unit }] : []),
    ];
    return {
      code: 'cirsoc-201', edition,
      ...(clause ? { clause } : {}),
      title: c.category,
      ...(c.limiting ? { titleKey: `check.rc.${c.limiting}` } : {}),
      // The inequality; a provision this app does not evaluate states what it left out.
      formula: spec?.formula ?? (c.description || undefined),
      inputs,
      ...(c.demand !== undefined ? { demand: c.demand } : {}),
      ...(c.capacity !== undefined ? { capacity: c.capacity } : {}),
      unit: c.unit,
      ratio: Number.isFinite(c.ratio) ? c.ratio : null,
      // A hook the bars do not carry yet is not a near-limit pass: as provided they are short of ld.
      status: c.limiting === 'unsupportedCheck' ? 'unsupported' : c.anchorHook ? 'fail' : fromVerifStatus(c.status),
      ...(c.comboName ? { combination: c.comboName } : {}),
      ...(c.stationX !== undefined ? { location: `x = ${c.stationX.toFixed(2)} m` } : {}),
      ...(c.description && spec ? { derivation: [c.description] } : {}),
    };
  });
}

export function steelCheckRows(v: SteelVerification): CheckRow[] {
  const g = v.governingCombos;
  type Ran = { status: 'ok' | 'warn' | 'fail' | 'held'; ratio: number };
  /*
   * A check the engine refused under load (`held`) is `unsupported`, with no ratio: the refusal is
   * in the derivation, and nothing was computed to pass or fail it.
   */
  const judged = (c: Ran): { status: CheckRow['status']; ratio: number | null } =>
    (c.status === 'held' ? { status: 'unsupported', ratio: null } : { status: fromVerifStatus(c.status), ratio: c.ratio });
  const row = (title: string, clause: string, formula: string, demand: number, capacity: number,
    unit: string, c: Ran, combination?: string, steps?: string[]): CheckRow => ({
    code: 'cirsoc-301', edition: '2018', clause, title, titleKey: `check.steel.${clause}`, formula,
    // The two sides of the inequality, by the symbols it is written with.
    inputs: [{ symbol: formula.split('≤')[0]!.trim(), value: demand, unit }, { symbol: formula.split('≤')[1]!.trim(), value: capacity, unit }],
    demand, capacity, unit, ...judged(c),
    ...(combination ? { combination } : {}), ...(steps?.length ? { derivation: steps } : {}),
  });
  const out: CheckRow[] = [];
  if (v.tension) out.push(row('Tension', 'D.2', 'Pu ≤ φt·Pn', Math.abs(v.tension.Pu), v.tension.phiPn, 'kN', v.tension, g?.axial?.comboName, v.tension.steps));
  if (v.compression) out.push(row('Compression', v.compression.clauseRef ?? 'E.3', 'Pu ≤ φc·Pn', Math.abs(v.compression.Pu), v.compression.phiPn, 'kN', v.compression, g?.axial?.comboName, v.compression.steps));
  out.push(row('Flexure, strong axis', v.flexureZ.clause ?? 'F.2', 'Mu ≤ φb·Mn', Math.abs(v.flexureZ.Mu), v.flexureZ.phiMn, 'kN·m', v.flexureZ, g?.flexure?.comboName, v.flexureZ.steps));
  if (v.flexureY) out.push(row('Flexure, weak axis', v.flexureY.clause ?? 'F.6', 'Mu ≤ φb·Mn', Math.abs(v.flexureY.Mu), v.flexureY.phiMn, 'kN·m', v.flexureY, g?.flexure?.comboName, v.flexureY.steps));
  out.push(row('Shear', 'G.2', 'Vu ≤ φv·Vn', Math.abs(v.shear.Vu), v.shear.phiVn, 'kN', v.shear, g?.shear?.comboName, v.shear.steps));
  if (v.shearWeak) out.push(row('Shear, weak axis', 'G.6', 'Vu ≤ φv·Vn', Math.abs(v.shearWeak.Vu), v.shearWeak.phiVn, 'kN', v.shearWeak, g?.shear?.comboName, v.shearWeak.steps));
  if (v.interaction) {
    out.push({
      code: 'cirsoc-301', edition: '2018', clause: v.interaction.equation, title: 'Axial and flexure', titleKey: 'check.steel.H1',
      formula: v.interaction.equation === 'H1-1a' ? 'Pu/φPn + 8/9·(Mux/φMnx + Muy/φMny) ≤ 1' : 'Pu/2φPn + (Mux/φMnx + Muy/φMny) ≤ 1',
      inputs: [], ...judged(v.interaction), derivation: v.interaction.steps,
      ...(g?.interaction ? { combination: g.interaction.comboName, location: `t = ${g.interaction.t.toFixed(3)}` } : {}),
    });
  }
  return out;
}

/** The common outcome of a member, from its check rows and what was left out. */
export function elementOutcome(
  elementId: number, family: ElementOutcome['family'], code: string, rows: CheckRow[], notices: Notice[] = [],
): ElementOutcome {
  const ratios = rows.map((r) => r.ratio).filter((r): r is number => r !== null);
  const utilization = ratios.length > 0 ? Math.max(...ratios) : null;
  const status = rows.length === 0 ? 'notVerified'
    : worstStatus([...rows.map((r) => r.status), ...(utilization !== null ? [statusOfRatio(utilization)] : [])]);
  const governing = governingCheck(rows);
  return { elementId, family, code, status, utilization, ...(governing ? { governing } : {}), checks: rows, notices };
}
