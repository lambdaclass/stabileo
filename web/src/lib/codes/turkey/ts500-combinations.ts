import { combinationLabel, type CombinationInputs, type CombinationTerm, type LoadCombinationSpec, type LoadSymbol } from '../cirsoc101/combinations';
import { msg, type EngineMessage } from '../message';
import type { ClauseRef } from '../regulation';
import type { ActionCategory } from '../families/origin';
import { TBDY, TS498, TS500 } from './refs';

export const TR_CATEGORY: Readonly<Record<string, ActionCategory>> = Object.freeze({
  D: 'permanent', L: 'imposed', Lr: 'roofImposed', S: 'snow', W: 'wind', Wa: 'serviceWind', E: 'seismic',
  T: 'thermal', H: 'earthPressure', F: 'fluid',
});

type Terms = Array<[LoadSymbol, number]>;

const REF = {
  '6.3': TS500('6.2.6', 'Denk. 6.3'), '6.4': TS500('6.2.6', 'Denk. 6.4'), '6.5': TS500('6.2.6', 'Denk. 6.5'),
  '6.6': TS500('6.2.6', 'Denk. 6.6'), '6.9': TS500('6.2.6', 'Denk. 6.9'), '6.10': TS500('6.2.6', 'Denk. 6.10'),
  fluid: TS500('6.2.6', 'e'), service: TS500('6.2.6', 'f'), snowWind: TS498('9.1', 'kar ve rüzgar'), snowLive: TS498('7', 'kar yükü hareketli yük sınıfına girer'),
  '4.11': TBDY('4.4.4.1', 'Denk. 4.11'), '4.12': TBDY('4.4.4.1', 'Denk. 4.12'),
} as const;

function build(ci: CombinationInputs, service: boolean): LoadCombinationSpec[] {
  const p = ci.present;
  const out: LoadCombinationSpec[] = [];
  const seen = new Set<string>();
  const k = (f: number) => (service ? 1 : f);
  const push = (id: string, raw: Terms, refs: ClauseRef[], notes: EngineMessage[] = []) => {
    const withF = p.F && raw.some(([s]) => s === 'L' || s === 'Lr' || s === 'S') ? [...raw, ['F', k(1.4)] as [LoadSymbol, number]] : raw;
    const terms: CombinationTerm[] = withF.filter(([, f]) => f !== 0).map(([symbol, factor]) => ({ symbol, factor: +factor.toFixed(4) }));
    const label = combinationLabel(terms);
    if (seen.has(label)) return;
    seen.add(label);
    out.push({
      id: `${id}${service ? '-k' : ''}`, terms, label,
      refs: [...refs, ...(withF !== raw ? [REF.fluid] : []), ...(service ? [REF.service] : [])], notes,
      ...(service ? { purpose: 'service' as const } : {}),
    });
  };
  const roofQ = (f: number): Array<{ t: Terms; tag: string; refs: ClauseRef[] }> => {
    const live: Terms = [...(p.L ? [['L', f]] as Terms : []), ...(p.Lr ? [['Lr', f]] as Terms : [])];
    const out2 = [{ t: live, tag: '', refs: [] as ClauseRef[] }];
    if (p.S) {
      const withSnow: Terms = [...(p.L ? [['L', f]] as Terms : []), ['S', f]];
      if (p.Lr) out2.push({ t: withSnow, tag: '-S', refs: [REF.snowLive] });
      else out2[0] = { t: withSnow, tag: '', refs: [REF.snowLive] };
    }
    return out2;
  };
  const notActing = ci.notActing ?? true;

  for (const q of roofQ(k(1.6))) push(`TS500-6.3${q.tag}`, [['D', k(1.4)], ...q.t], [REF['6.3'], ...q.refs]);
  if (p.T) for (const q of roofQ(k(1.2))) push(`TS500-6.4${q.tag}`, [['D', 1], ...q.t, ['T', k(1.2)]], [REF['6.4'], ...q.refs]);
  if (p.W) {
    for (const q of roofQ(k(1.3))) {
      const hasS = q.t.some(([s]) => s === 'S');
      if (!hasS) { push(`TS500-6.5${q.tag}`, [['D', 1], ...q.t, ['W', k(1.3)]], [REF['6.5'], ...q.refs]); continue; }
      const live = q.t.filter(([s]) => s !== 'S');
      push(`TS500-6.5${q.tag}a`, [['D', 1], ...live, ['S', k(1.3)], ['W', k(1.3) / 2]], [REF['6.5'], REF.snowWind, ...q.refs]);
      push(`TS500-6.5${q.tag}b`, [['D', 1], ...live, ['W', k(1.3)], ['S', k(1.3) / 2]], [REF['6.5'], REF.snowWind, ...q.refs]);
    }
    if (notActing && (p.L || p.Lr || p.S)) push('TS500-6.5-0', [['D', 1], ['W', k(1.3)]], [REF['6.5']], [msg('loads.tr.combo.notActing')]);
    push('TS500-6.6', [['D', k(0.9)], ['W', k(1.3)]], [REF['6.6']]);
  }
  if (p.E && !service) {
    const q: Terms = [...(p.L ? [['L', 1]] as Terms : []), ...(p.Lr ? [['Lr', 1]] as Terms : []), ...(p.S ? [['S', 0.2]] as Terms : [])];
    push('TBDY-4.11', [['D', 1], ...q, ['E', 1]], [REF['4.11']]);
    if (notActing && q.length) push('TBDY-4.11-0', [['D', 1], ['E', 1]], [REF['4.11']], [msg('loads.tr.combo.notActing')]);
    push('TBDY-4.12', [['D', 0.9], ...(p.H ? [['H', 1]] as Terms : []), ['E', 1]], [REF['4.12']]);
  }
  if (p.H) {
    for (const q of roofQ(k(1.6))) push(`TS500-6.9${q.tag}`, [['D', k(1.4)], ...q.t, ['H', k(1.6)]], [REF['6.9'], ...q.refs]);
    push('TS500-6.10', [['D', k(0.9)], ['H', k(1.6)]], [REF['6.10']]);
  }
  return out;
}

export function ts500Strength(ci: CombinationInputs): { combinations: LoadCombinationSpec[]; refs: ClauseRef[]; notes: EngineMessage[] } {
  const refs: ClauseRef[] = [TS500('6.2.6', 'yük katsayıları ve yük birleşimleri')];
  if (ci.present.E) refs.push(TBDY('4.4.4.1', 'deprem etkisini içeren yük birleşimleri'));
  const notes: EngineMessage[] = [];
  if (ci.present.S) notes.push(msg('loads.tr.combo.snowAsLive'));
  if (ci.present.S && ci.present.Lr) notes.push(msg('loads.tr.combo.roofLiveOrSnow'));
  if (ci.present.E && ci.present.F) notes.push(msg('loads.tr.combo.fluidInSeismic'));
  return { combinations: build(ci, false), refs, notes };
}

export const ts500Service = (ci: CombinationInputs): LoadCombinationSpec[] => build(ci, true);
