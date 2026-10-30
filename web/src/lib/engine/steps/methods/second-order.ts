/**
 * Second order and buckling in the catalog: P-Δ with the stability functions or with the
 * geometric matrix, and the critical load by det K(λ) = 0 or by the eigenproblem.
 */
import type { ExplainedMethod, MethodContext } from '../registry';
import { optionOn } from '../registry';
import type { Applicability, StepDoc, Txt } from '../doc';
import { tx } from '../doc';
import { readSecondOrder } from '../second-order-common';
import { buildPDeltaDoc, hasCompression } from '../second-order-pdelta';
import { buildBucklingDoc } from '../second-order-buckling';
import type { GeomMethod } from '../../second-order/member-matrices';

const RIGID = { id: 'axialRigid', default: false };
const CHORD = { id: 'chord', default: false };

function methodOf(m: ExplainedMethod, ctx: MethodContext): GeomMethod {
  if (m.id.endsWith('-phi')) return 'phi';
  return optionOn(ctx, m, 'chord') ? 'string' : 'consistent';
}

function ready(m: ExplainedMethod, ctx: MethodContext) {
  return readSecondOrder(ctx, methodOf(m, ctx), optionOn(ctx, m, 'axialRigid'));
}

function verdict(m: ExplainedMethod, ctx: MethodContext): Applicability {
  const r = ready(m, ctx);
  if (!r.ok) return r;
  if (!hasCompression(r.sys)) return { ok: false, reason: tx('course.second-order.refuse.noCompression') };
  return { ok: true };
}

/** An assumption switched to one this model cannot take: the reason, as a document of one step. */
function refused(id: string, reason: Txt): StepDoc {
  const note = { kind: 'note' as const, tone: 'warn' as const, text: reason };
  return { method: id, title: tx(`steps.m.${id}.title`), intro: [note], steps: [{ title: tx('course.second-order.doc.cannot'), blocks: [note] }] };
}

const pdelta = (id: string, options: ExplainedMethod['options']): ExplainedMethod => {
  const m: ExplainedMethod = {
    id, group: 'secondOrder', example: 'portal-second-order', options,
    applies: (ctx) => verdict(m, ctx),
    build: (ctx) => {
      const r = ready(m, ctx);
      if (!r.ok) return refused(id, r.reason);
      return buildPDeltaDoc(ctx, r.sys, id, methodOf(m, ctx));
    },
  };
  return m;
};

const buckling = (id: string, options: ExplainedMethod['options']): ExplainedMethod => {
  const m: ExplainedMethod = {
    id, group: 'secondOrder', example: 'portal-second-order', options,
    applies: (ctx) => verdict(m, ctx),
    build: (ctx) => {
      const r = ready(m, ctx);
      if (!r.ok) return refused(id, r.reason);
      return buildBucklingDoc(ctx, r.sys, id, methodOf(m, ctx) as 'phi' | 'consistent' | 'string');
    },
  };
  return m;
};

export const methods: ExplainedMethod[] = [
  pdelta('so-pdelta-phi', [RIGID]),
  pdelta('so-pdelta-kg', [CHORD, RIGID]),
  buckling('so-buckling-phi', [RIGID]),
  buckling('so-buckling-kg', [CHORD, RIGID]),
];
