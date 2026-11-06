import { beamFrame } from './beam-frame';
import { slab } from './slab';
import { earthquake } from './earthquake';
import { rcPushover } from './rc-pushover';
import { rcColumn } from './rc-column';
import { outrigger } from './outrigger';
import { tower } from './tower';
import type { Example } from './define';

export const EXAMPLES: Example<any>[] = [beamFrame, slab, earthquake, rcPushover, rcColumn, outrigger, tower];

export function findExample(id: string | undefined) {
  return EXAMPLES.find(e => e.id === id);
}
