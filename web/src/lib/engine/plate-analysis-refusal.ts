import { tp } from '../i18n';
import { nonconformingWallSlab, plateAnalysisIssue, type PlateAnalysisModel } from '../model/physical/plate-analysis';

export function plateAnalysisRefusal(model: PlateAnalysisModel): string | null {
  const issue = plateAnalysisIssue(model);
  if (!issue) return null;
  if (issue.kind === 'wallSlab') return tp('plates.analysisWallSlab', issue.joint);
  return tp(issue.kind === 'invalid' ? 'plates.analysisInvalid' : 'plates.analysisNeedsMesh', { names: issue.names.join(', ') });
}

export function wallSlabRefusal(model: PlateAnalysisModel): string | null {
  const joint = nonconformingWallSlab(model);
  return joint && tp('plates.analysisWallSlab', joint);
}

export class PlateAnalysisError extends Error {}
