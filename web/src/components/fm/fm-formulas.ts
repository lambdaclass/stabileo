/**
 * The flexibility formulas as the steps write them, with only the terms the
 * structure has: bending, the axial term of frame members when it is on, the
 * bielas' n·n·L/EA, the springs' r·r/k, and in δᵢ₀ temperature and settlements.
 */
import type { ForceMethodResult, TermRow } from '../../lib/engine/force-method/solve';

const has = (rows: TermRow[], f: (r: TermRow) => boolean) => rows.some(f);

function parts(rows: TermRow[], b: { m: string; n: string; r: string }): string[] {
  const out: string[] = [];
  if (has(rows, (x) => x.source === 'bending')) out.push(`\\sum \\int \\frac{m_i\\,${b.m}}{EI}\\,dx`);
  if (has(rows, (x) => x.source === 'axial' && !x.detail?.biela)) out.push(`\\sum \\int \\frac{n_i\\,${b.n}}{EA}\\,dx`);
  if (has(rows, (x) => !!x.detail?.biela)) out.push(`\\sum \\frac{n_i\\,${b.n}\\,L}{EA}`);
  if (has(rows, (x) => x.source === 'spring')) out.push(`\\sum \\frac{r_i\\,${b.r}}{k}`);
  return out;
}

export function deltaTex(r: ForceMethodResult): string {
  const rows = r.deltaTerms.flat(2);
  const p = parts(rows, { m: 'm_j', n: 'n_j', r: 'r_j' });
  return `\\delta_{ij} = ${p.length ? p.join(' + ') : '0'}`;
}

export function delta0Tex(r: ForceMethodResult): string {
  const rows = r.delta0Terms.flat();
  const p = parts(rows, { m: 'M_0', n: 'N_0', r: 'R_0' });
  if (has(rows, (x) => x.source === 'thermal')) p.push('\\sum \\int n_i\\,\\alpha\\,\\Delta T\\,dx + \\sum \\int m_i\\,\\frac{\\alpha\\,\\Delta t}{h}\\,dx');
  let tex = `\\delta_{i0} = ${p.length ? p.join(' + ') : '0'}`;
  if (has(rows, (x) => x.source === 'settlement')) tex += ' - \\sum R_{k,i}\\,c_k';
  return tex;
}
