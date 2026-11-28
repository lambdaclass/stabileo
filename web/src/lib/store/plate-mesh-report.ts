import { plateRemeshMessage } from '../engine/plate-analysis-refusal';
import { tp } from '../i18n';
import { plateEntry, type PlateMeshReport } from './physical-plates';

export function plateMeshReportMessage(report: PlateMeshReport): string {
  const parts = [tp('plates.meshApplied', { plates: report.plates, cells: report.cells })];
  if (report.refused.length) parts.push(tp('plates.meshRefusedSome', { n: report.refused.length }));
  if (report.droppedLocalLoads) parts.push(tp('plates.localLoadsDropped', { n: report.droppedLocalLoads }));
  for (const { id, reason } of report.refused) {
    const message = plateRemeshMessage(plateEntry(id)?.name ?? '#' + id, reason);
    if (message) parts.push(message);
  }
  if (report.analysisBlock) parts.push(report.analysisBlock);
  return parts.join(' ');
}
