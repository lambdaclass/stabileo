import { tp } from '../i18n';
import { nonconformingWallSlab, plateAnalysisIssue, type PlateAnalysisModel } from '../model/physical/plate-analysis';

export function plateRemeshMessage(name: string, reason: string): string | null {
  if (reason === 'ambiguousSweep') return tp('plates.remeshAmbiguousSweep', { name });
  if (reason === 'shellEdits') return tp('plates.remeshShellEdits', { name });
  return null;
}

export function plateAnalysisRefusal(model: PlateAnalysisModel): string | null {
  const issue = plateAnalysisIssue(model);
  if (!issue) return null;
  if (issue.kind === 'wallSlab') return tp('plates.analysisWallSlab', issue.joint);
  if (issue.kind === 'ambiguousSweep') return issue.names.map(name => plateRemeshMessage(name, issue.kind)).join(' ');
  return tp(issue.kind === 'invalid' ? 'plates.analysisInvalid' : 'plates.analysisNeedsMesh', { names: issue.names.join(', ') });
}

export function wallSlabRefusal(model: PlateAnalysisModel): string | null {
  const joint = nonconformingWallSlab(model);
  return joint && tp('plates.analysisWallSlab', joint);
}

export class PlateAnalysisError extends Error {}
