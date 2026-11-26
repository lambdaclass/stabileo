/**
 * The gallery's examples by id, and the models it showed before its buildings were remade, loaded
 * as their cards loaded them: tests hold their numbers to those models.
 */
import { PRO_EXAMPLES, exampleEntry, type ProExample } from '../pro-examples';

const RETIRED: readonly ProExample[] = [
  exampleEntry({ id: 'rc-qa-diagnostic', source: 'fixture', group: 'rcBuildings', tags: [], stats: { nodes: 18, members: 26 }, selfWeight: 'all', combinations: 'regulationAsSigned' }),
  exampleEntry({ id: '3d-building', source: 'fixture', group: 'rcBuildings', tags: [], stats: { nodes: 54, members: 105 }, selfWeight: 'all', combinations: 'regulation' }),
  exampleEntry({ id: 'pro-edificio-7p', source: 'fixture', group: 'rcBuildings', tags: [], stats: { nodes: 183, members: 252, shells: 126 }, selfWeight: 'all', combinations: 'regulationAsSigned' }),
  exampleEntry({ id: 'pro-rc-frame-area-loads', source: 'code', group: 'rcBuildings', tags: [], stats: { nodes: 59, members: 113 }, selfWeight: 'all', combinations: 'regulation' }),
  exampleEntry({ id: 'rc-design-frame', source: 'fixture', group: 'rcBuildings', tags: [], stats: { nodes: 180, members: 408 }, selfWeight: 'all', combinations: 'regulation' }),
];

export function galleryExample(id: string): ProExample {
  const ex = [...PRO_EXAMPLES, ...RETIRED].find((e) => e.id === id);
  if (!ex) throw new Error(`no gallery example ${id}`);
  return ex;
}
