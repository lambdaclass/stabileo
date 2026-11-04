/**
 * GH explained, as blocks of a step-by-step document: the formula with its
 * numbers, what each symbol counts, the hinges and springs, the external and
 * internal parts, the classification, and why the count alone does not prove
 * a structure stable. The stiffness and flexibility wizards and the explained
 * methods show it the same way.
 */
import type { Block } from './doc';
import { tx } from './doc';
import type { GhReport } from '../static-degree';

export type GhContext = 'fm' | 'dsm' | 'doc';

export function ghBlocks(rep: GhReport, context: GhContext = 'doc', nameOf: (nodeId: number) => string = String): Block[] {
  const { count, gh } = rep;
  const out: Block[] = [
    { kind: 'p', text: tx('course.statics.gh.what') },
    { kind: 'calc', formula: rep.formula.tex, subst: rep.subst.tex, result: `\\boxed{GH = ${gh}}` },
    { kind: 'p', text: tx(`course.statics.gh.legend.${rep.kind}`, { m: count.mFrame, mb: count.mTruss, r: count.r, n: count.nFrameNodes, nb: count.nTrussNodes, c: count.c }), detail: true },
  ];
  if (rep.springs > 0) out.push({ kind: 'note', tone: 'info', text: tx('course.statics.gh.springs', { s: rep.springs }) });
  if (rep.hinges.length > 0) {
    out.push({ kind: 'p', text: tx('course.statics.gh.hinges'), detail: true });
    out.push({
      kind: 'table',
      head: [tx('steps.common.node'), tx('course.statics.gh.kCol'), tx('course.statics.gh.jCol'), { tex: 'c_i' }],
      rows: rep.hinges.map((h) => [nameOf(h.nodeId), h.k, h.j, h.c]),
      caption: tx('course.statics.gh.hingeCaption', { c: count.c }),
    });
  }
  if (rep.split) {
    const { external: e, internal: i } = rep.split;
    out.push({ kind: 'calc', label: tx('course.statics.gh.splitLabel'), formula: 'GH = GH_e + GH_i', subst: `GH = ${e} + ${i < 0 ? `(${i})` : i}`, result: `GH_e = ${e},\\quad GH_i = ${i}` });
    out.push({ kind: 'p', text: tx('course.statics.gh.split', { e, i, mech: rep.split.mechanisms }), detail: true });
  }
  const verdict = gh === 0 ? 'iso' : gh > 0 ? 'hyper' : 'hypo';
  out.push({ kind: 'note', tone: gh < 0 ? 'warn' : gh === 0 ? 'ok' : 'info', text: tx(`course.statics.gh.verdict.${verdict}`, { g: gh }) });
  if (gh > 0 && context === 'fm') out.push({ kind: 'p', text: tx('course.statics.gh.redundants', { g: gh }) });
  if (gh >= 0) out.push({ kind: 'p', text: tx('course.statics.gh.necessary'), detail: true });
  return out;
}
