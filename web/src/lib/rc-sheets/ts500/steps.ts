import type { Fmt } from '../format';
import type { Step } from '../types';
import { GAMMA_MC, GAMMA_MS, type Ts500Mat } from './basis';

export const materialSteps = (t: Ts500Mat, f: Fmt): Step[] => [
  { label: 'rcSheets.s.materials', formula: 'fck · fyk', value: `${f(t.fck, 0)} · ${f(t.fyk, 0)} MPa` },
  {
    label: 'rcSheets.ts500.s.basis',
    formula: `fcd = fck/${f(GAMMA_MC, 2)}; fctd = 0.35·√fck/${f(GAMMA_MC, 2)}; fyd = fyk/${f(GAMMA_MS, 2)} (6.2.5)`,
    value: `${f(t.fcd)} · ${f(t.fctd, 3)} · ${f(t.fyd, 1)} MPa`,
  },
];
