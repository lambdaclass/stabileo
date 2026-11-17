import type { ClauseRef } from '../../codes/regulation';
import { clauseOf } from '../cite';
import type { ActionKind, KeyedTable, LoadsProfile, Val } from '../types';

export interface GeneratedCombinations {
  gamma: { gSup: number; gInf: number; q: number };
  xi: number;
  psi: Readonly<Record<string, readonly [number, number, number]>>;
  exclusive: ReadonlyArray<readonly string[]>;
  notActing: boolean;
  /** The clauses of ξ (or of the γ when there is no ξ) and of the ψ table. */
  refs: { factors: ClauseRef; psi: ClauseRef };
}

/** The data of a profile whose combinations EN 1990's procedure generates. */
export function generatedCombinationsOf(p: LoadsProfile): GeneratedCombinations {
  const c = p.combinations;
  if (!c || !('form' in c) || c.form !== 'generated') throw new Error(`${p.meta.id}: no generated combinations`);
  const psi = c.psi as KeyedTable;
  const xi = c.xi as Val | undefined;
  return {
    gamma: { gSup: c.gamma.gSup.v, gInf: c.gamma.gInf.v, q: c.gamma.q.v },
    xi: xi?.v ?? 1,
    psi: Object.fromEntries(Object.entries(psi.rows).map(([k, r]) => [k, [r[0]!, r[1]!, r[2]!] as const])),
    exclusive: c.exclusive,
    notActing: c.notActing,
    refs: { factors: clauseOf(p.meta, (xi ?? c.gamma.gSup).cite), psi: clauseOf(p.meta, psi.cite) },
  };
}

export const symbolsOf = (p: LoadsProfile): Readonly<Record<string, ActionKind>> => ({ ...p.symbols });
