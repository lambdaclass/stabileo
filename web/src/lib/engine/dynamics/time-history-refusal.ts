import type { EngineMessage } from '../../codes/message';

const NON_FINITE = /^TH-NONFINITE: .* from step (\d+) \(t = (\S+) s\)/;

/** The engine's time-history refusals that have a translation, as a message; null for any other error. */
export function timeHistoryRefusal(text: string): EngineMessage | null {
  const m = NON_FINITE.exec(text);
  return m ? { key: 'pro.th.refusal.nonFinite', params: { step: Number(m[1]), time: Number(m[2]) } } : null;
}
