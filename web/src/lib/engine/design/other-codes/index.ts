/**
 * The codes other than CIRSOC a member can be checked to, in the order they are offered.
 * See `types.ts` for what each reads and `run.ts` for how the demands are sent.
 */
import { AISC360, EC3 } from './steel-codes';
import { ACI318, EC2 } from './concrete-codes';
import { AISI_S100 } from './cfs-code';
import type { OtherCode, OtherCodeId } from './types';

export const OTHER_CODES: readonly OtherCode[] = [AISC360, EC3, AISI_S100, ACI318, EC2];

export function otherCode(id: OtherCodeId): OtherCode | undefined {
  return OTHER_CODES.find((c) => c.id === id);
}

export { memberContexts, runOtherCode } from './run';
export type { OtherCode, OtherCodeId, OtherCodeRow, OtherCodeRun, CheckReading } from './types';
