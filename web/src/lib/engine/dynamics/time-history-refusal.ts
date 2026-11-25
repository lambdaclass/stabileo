import type { EngineMessage } from '../../codes/message';

const NON_FINITE = /^TH-NONFINITE: .* from step (\d+) \(t = (\S+) s\)/;
const NON_FINITE_REACTIONS = /^TH-NONFINITE: .*reactions/;

/** The engine's time-history refusals that have a translation, as a message; null for any other error. */
export function timeHistoryRefusal(text: string): EngineMessage | null {
  const m = NON_FINITE.exec(text);
  if (m) return { key: 'pro.th.refusal.nonFinite', params: { step: Number(m[1]), time: Number(m[2]) } };
  if (NON_FINITE_REACTIONS.test(text)) return { key: 'pro.th.refusal.nonFiniteReactions' };
  if (text.startsWith('TH-MASSLESS-MECHANISM: ')) return { key: 'pro.th.refusal.masslessMechanism' };
  return text.startsWith('TH-MASS-SINGULAR: ') ? { key: 'pro.th.refusal.massSingular' } : null;
}

const MODAL_TRANSLATION_MECHANISM = /^MODAL-MECHANISM: Modal analysis: the constrained physical stiffness has a mechanism at node (\d+) \(dominant component: (\w+)\)/;
const MODAL_MECHANISM = /^MODAL-MECHANISM: .*?(\d+) mode\(s\) .* moves node (\d+) along (\w+) /;

/** The engine's refusal of a modal analysis whose zero modes move mass, as a message; null for any other error. */
export function modalMechanismRefusal(text: string): EngineMessage | null {
  const witness = MODAL_TRANSLATION_MECHANISM.exec(text);
  if (witness) return { key: 'advanced.modalTranslationMechanism', params: { node: Number(witness[1]), dof: witness[2] } };
  const m = MODAL_MECHANISM.exec(text);
  return m ? { key: 'advanced.modalMechanism', params: { count: Number(m[1]), node: Number(m[2]), dof: m[3] } } : null;
}
