export type BuildFeatures = Readonly<{
  accounts: boolean;
  research: boolean;
  tools: boolean;
  diagramGame: boolean;
  globalAxes: boolean;
}>;

export function validateFeatures(value: unknown, label: string): BuildFeatures;
export function featuresForMode(mode: string, config?: unknown): BuildFeatures;
export function buildFeatures(): BuildFeatures;
export function featureDefines(features: BuildFeatures, inline?: boolean): Record<string, string>;
export function unitFeatureProfile(): string;
