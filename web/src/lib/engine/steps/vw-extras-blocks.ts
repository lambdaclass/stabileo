/** The springs, settlements and temperature of the unit-load method, written out as tables. */
import type { Block, Cell } from './doc';
import { tx } from './doc';
import { num } from './format';
import type { PlaneModel } from './plane-model';
import type { Extras } from './vw-extras';

const tex = (s: string): Cell => ({ tex: s });
const COMP = ['x', 'z', '\\theta'];

export function extrasBlocks(pm: PlaneModel, ex: Extras, unit: string): Block[] {
  const name = (id: number) => pm.nodes.get(id)?.name ?? String(id);
  const out: Block[] = [];
  if (ex.springs.length) {
    out.push({ kind: 'p', text: tx('course.statics.vw.springsLead') });
    out.push({
      kind: 'table',
      head: [tx('steps.common.node'), tx('course.statics.vw.col.comp'), tex('R'), tex('r'), tex('k'), tex(`\\frac{r\\,R}{k}\\ [${unit}]`)],
      rows: ex.springs.map((s) => [name(s.node), tex(COMP[s.comp]), s.R, s.r, s.k, s.value]),
      caption: tx('course.statics.vw.springsCaption'),
    });
  }
  if (ex.settlements.length) {
    out.push({ kind: 'p', text: tx('course.statics.vw.settleLead') });
    out.push({
      kind: 'table',
      head: [tx('steps.common.support'), tx('course.statics.vw.col.comp'), tex('c'), tex('r'), tex(`-r\\,c\\ [${unit}]`)],
      rows: ex.settlements.map((s) => [name(s.node), tex(COMP[s.comp]), s.c, s.r, s.value]),
      caption: tx('course.statics.vw.settleCaption'),
    });
  }
  if (ex.thermal.length) {
    out.push({ kind: 'p', text: tx('course.statics.vw.thermalLead') });
    out.push({
      kind: 'table',
      head: [tx('steps.common.member'), tex('\\Delta T'), tex('\\Delta t'), tex('h'), tex('\\alpha'), tex('n'), tex('\\bar m'), tex('n\\,\\alpha\\,\\Delta T\\,L'), tex('\\bar m\\,L\\,\\frac{\\alpha\\,\\Delta t}{h}')],
      rows: ex.thermal.map((t) => [pm.members.get(t.member)?.name ?? String(t.member), t.dT, t.dTg, t.h, t.alpha, t.n, t.mMean, t.axial, t.bending]),
      caption: tx('course.statics.vw.thermalCaption'),
    });
  }
  out.push({ kind: 'eq', tex: `\\Sigma = ${num(ex.total)}\\ ${unit}` });
  return out;
}
