import { afterEach, expect, it } from 'vitest';
import { setPreparedLoadSessionsEnabled } from '../../../lib/engine/wasm-solver';
import { DEFAULT_BATCH, type BatchParameters } from '../batch';
import { calculateBatch } from '../batch-solve';

afterEach(() => setPreparedLoadSessionsEnabled(true));

const cases = [[6.1, 1, 0.571875], [6.4, 1, 0.6], [6, 1, 3.0000000001], [6, 1, 2.9999999999], [6, 2, 6.0000000001], [6, 2, 5.9999999999], [6, 2, 6.1875000001]] as const;

for (const [length, count, position] of cases) {
  it.each(['reaction', 'moment', 'shear'] as const)(`prepared and direct %s results are identical for ${length}, ${count}, ${position}`, async (quantity) => {
    const input = { ...DEFAULT_BATCH, length, count, position, quantity } as BatchParameters;
    setPreparedLoadSessionsEnabled(false);
    const direct = await calculateBatch('influence-line', input);
    setPreparedLoadSessionsEnabled(true);
    expect(await calculateBatch('influence-line', input)).toEqual(direct);
  });
}
