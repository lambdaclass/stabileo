import packed from 'virtual:result-change-packed';
import { inflateSync, strFromU8 } from 'fflate';
import type { ResultChangeRegistry } from './registry';

export const RESULT_CHANGES: ResultChangeRegistry = JSON.parse(
  strFromU8(inflateSync(Uint8Array.from(atob(packed), c => c.charCodeAt(0)))),
);
