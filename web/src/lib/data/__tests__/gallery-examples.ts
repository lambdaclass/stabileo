/**
 * The gallery's examples by id, and the models it showed before its buildings were remade, loaded
 * as their cards loaded them: tests hold their numbers to those models.
 */
import { PRO_EXAMPLES, publishedBuildingExamples, unifiedBuildingExamples, type ProExample } from '../pro-examples';

export function galleryExample(id: string): ProExample {
  const ex = [...unifiedBuildingExamples, ...PRO_EXAMPLES, ...publishedBuildingExamples].find((e) => e.id === id);
  if (!ex) throw new Error(`no gallery example ${id}`);
  return ex;
}
