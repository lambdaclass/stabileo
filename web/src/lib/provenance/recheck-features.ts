import { modelFeatures, type FeatureContext, type FeatureId, type FeatureSnapshot } from './model-features';

export const PRO_WORKSPACE_EVIDENCE = 'proWorkspace';

export function recheckFeatures(snapshot: FeatureSnapshot, context: FeatureContext): Set<FeatureId | typeof PRO_WORKSPACE_EVIDENCE> {
  const features: Set<FeatureId | typeof PRO_WORKSPACE_EVIDENCE> = modelFeatures(snapshot, context);
  if ((context.analysisMode ?? snapshot.analysisMode) === 'pro') features.add(PRO_WORKSPACE_EVIDENCE);
  return features;
}
