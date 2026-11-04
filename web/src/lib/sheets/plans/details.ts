/**
 * The construction details every set draws by default, now drawn by the catalogue
 * (`sheets/details/`): kept as a name for the callers that ask for the basic six with a main bar,
 * a tie and a cover.
 */
import { drawDetails } from '../details/catalog';
import type { Tr } from '../details/def';
import { TYPICAL, type DetailValues } from '../details/values';
import type { DrawingInput } from '../compose';

export type { Tr } from '../details/def';
export { hookPath } from '../details/sketch';

export interface DetailParams {
  /** The main bar diameter the details are drawn with, mm (the most used in the project). */
  bar: number;
  /** The tie diameter, mm. */
  tie: number;
  /** Clear cover, mm. */
  cover: number;
}

/** The six basic details with one bar, one tie and one cover for every kind. */
export function constructionDetails(p: DetailParams, tr: Tr): DrawingInput[] {
  const kinds = Object.keys(TYPICAL.cover) as Array<keyof DetailValues['cover']>;
  const v: DetailValues = {
    ...TYPICAL,
    cover: Object.fromEntries(kinds.map((k) => [k, p.cover])) as DetailValues['cover'],
    bars: Object.fromEntries(kinds.map((k) => [k, [p.bar]])) as DetailValues['bars'],
    ties: Object.fromEntries(kinds.map((k) => [k, p.tie])) as DetailValues['ties'],
  };
  const fmt = (x: number, d: number) => x.toFixed(d);
  return drawDetails(['hooks', 'tie', 'lap', 'starters', 'slab-edge', 'joint'].map((id) => ({ id, target: 'details' })), v, tr, fmt);
}
