import { combinationLabel, type CombinationInputs, type CombinationTerm, type LoadCombinationSpec, type LoadSymbol } from '../cirsoc101/combinations';
import { msg, round, type EngineMessage } from '../message';
import type { ClauseRef } from '../regulation';
import { A7, PSF } from './refs';

type Roof = 'Lr' | 'S' | 'R';
const ROOF: readonly Roof[] = ['Lr', 'S', 'R'];
const PRINCIPAL: Readonly<Record<Roof, number>> = { Lr: 1.6, S: 1.0, R: 1.6 };
const COMPANION: Readonly<Record<Roof, number>> = { Lr: 0.5, S: 0.3, R: 0.5 };
export const SEISMIC_SNOW = 0.15;
export const EXCEPTION1_LIMIT_KNM2 = 100 * PSF;

const REF_BASIC = A7('2.3.1', 'basic combinations');
const REF_SEISMIC = A7('2.3.6', 'basic combinations with seismic load effects');
const REF_SERVICE = A7('Appendix C', 'serviceability considerations');

const term = (symbol: LoadSymbol, factor: number): CombinationTerm => ({ symbol, factor });

interface Rule { id: string; basic: NonNullable<LoadCombinationSpec['basic']>; terms: CombinationTerm[]; principal: LoadSymbol | null; ref: ClauseRef; notes: EngineMessage[] }

export function liveCompanion(ci: CombinationInputs): { factor: number; note: EngineMessage } {
  const lo = ci.maxLoKNm2 ?? Infinity;
  const ok = lo <= EXCEPTION1_LIMIT_KNM2 + 1e-9 && !ci.hasGarageOrPublicAssembly;
  return {
    factor: ok ? 0.5 : 1,
    note: msg(ok ? 'loads.asce7.combo.exception1' : 'loads.asce7.combo.exception1Not', { lo: Number.isFinite(lo) ? round(lo, 2) : '—', limit: round(EXCEPTION1_LIMIT_KNM2, 2) }),
  };
}

function rules(ci: CombinationInputs): Rule[] {
  const p = ci.present;
  const roof = ROOF.filter((r) => p[r]);
  const { factor: fL, note } = liveCompanion(ci);
  const lNotes = p.L && fL === 0.5 ? [note] : [];
  const L = p.L ? [term('L', fL)] : [];
  const out: Rule[] = [];
  const add = (id: string, basic: Rule['basic'], terms: CombinationTerm[], principal: LoadSymbol | null, ref = REF_BASIC, notes: EngineMessage[] = []) =>
    out.push({ id, basic, terms, principal, ref, notes });
  add('1', 1, [term('D', 1.4)], null);
  if (p.L) {
    if (roof.length === 0) add('2', 2, [term('D', 1.2), term('L', 1.6)], 'L');
    for (const r of roof) add(`2${r}`, 2, [term('D', 1.2), term('L', 1.6), term(r, COMPANION[r])], 'L');
  }
  for (const r of roof) {
    if (p.L) add(`3${r}`, 3, [term('D', 1.2), term(r, PRINCIPAL[r]), ...L], r, REF_BASIC, lNotes);
    if (p.W) add(`3${r}W`, 3, [term('D', 1.2), term(r, PRINCIPAL[r]), term('W', 0.5)], r);
    if (!p.L && !p.W) add(`3${r}`, 3, [term('D', 1.2), term(r, PRINCIPAL[r])], r);
  }
  if (p.W) {
    if (roof.length === 0) add('4', 4, [term('D', 1.2), term('W', 1), ...L], 'W', REF_BASIC, lNotes);
    for (const r of roof) add(`4${r}`, 4, [term('D', 1.2), term('W', 1), ...L, term(r, COMPANION[r])], 'W', REF_BASIC, lNotes);
    add('5', 5, [term('D', 0.9), term('W', 1)], 'W');
  }
  if (p.E) {
    add('6', 6, [term('D', 1.2), term('E', 1), ...L, ...(p.S ? [term('S', SEISMIC_SNOW)] : [])], 'E', REF_SEISMIC, lNotes);
    add('7', 7, [term('D', 0.9), term('E', 1)], 'E', REF_SEISMIC);
  }
  return out;
}

export function asce7Strength(ci: CombinationInputs): { combinations: LoadCombinationSpec[]; refs: ClauseRef[]; notes: EngineMessage[] } {
  const seen = new Set<string>();
  const combinations: LoadCombinationSpec[] = [];
  for (const r of rules(ci)) {
    const companions = r.terms.filter((x) => x.symbol !== 'D' && x.symbol !== r.principal);
    const subsets = ci.notActing === false ? [[]] : subsetsOf(companions);
    for (const drop of subsets) {
      const terms = r.terms.filter((x) => !drop.includes(x));
      const label = combinationLabel(terms);
      if (seen.has(label)) continue;
      seen.add(label);
      combinations.push({
        id: drop.length ? `${r.id}-${drop.map((d) => d.symbol).join('')}` : r.id, basic: r.basic, terms, label,
        refs: [r.ref], notes: terms.some((x) => x.symbol === 'L' && x.factor === 0.5) ? r.notes : [],
      });
    }
  }
  const p = ci.present;
  const notes: EngineMessage[] = [];
  const skipped = (['F', 'H', 'T'] as const).filter((s) => p[s]);
  if (skipped.length) notes.push(msg('loads.asce7.combo.notCombined', { symbols: skipped.join(', ') }));
  const refs = [REF_BASIC, ...(p.E ? [REF_SEISMIC] : [])];
  return { combinations, refs, notes };
}

function subsetsOf<T>(items: readonly T[]): T[][] {
  const out: T[][] = [];
  for (let m = 0; m < 1 << items.length; m++) out.push(items.filter((_, i) => m & (1 << i)));
  return out;
}

export function asce7Service(ci: Pick<CombinationInputs, 'present'>): LoadCombinationSpec[] {
  const p = ci.present;
  const out: LoadCombinationSpec[] = [];
  const note = msg('loads.asce7.service.basis');
  const add = (id: string, terms: CombinationTerm[]) => out.push({ id: `S${id}`, terms, label: combinationLabel(terms), refs: [REF_SERVICE], notes: [note], purpose: 'service' });
  add('1', [term('D', 1)]);
  if (p.L) { add('2', [term('D', 1), term('L', 1)]); add('3', [term('D', 1), term('L', 0.5)]); }
  for (const r of ROOF.filter((x) => p[x])) add(`4${r}`, [term('D', 1), term(r, 1)]);
  if (p.Wa) add('5', [term('D', 1), ...(p.L ? [term('L', 0.5)] : []), term('Wa', 1)]);
  return out;
}
