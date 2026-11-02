import { beamFrame } from './beam-frame';
import { slab } from './slab';
import { earthquake } from './earthquake';
import type { Example } from './define';

export const EXAMPLES = [beamFrame, slab, earthquake] as unknown as Example<unknown>[];

export function findExample(id: string | undefined) {
  return EXAMPLES.find(e => e.id === id);
}
