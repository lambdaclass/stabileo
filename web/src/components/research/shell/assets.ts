export const researchBuildId = import.meta.env.RESEARCH_BUILD_ID ?? 'unavailable';
export const researchAssetBase = `${import.meta.env.BASE_URL}research-wasm/builds/${researchBuildId}/`;

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  return JSON.stringify(value);
}

export function replayMatchesBuild(header: { build_id?: string; config: unknown }, expectedConfig: unknown, expectedBuild = researchBuildId): boolean {
  return expectedBuild !== 'unavailable' && header.build_id === expectedBuild && canonical(header.config) === canonical(expectedConfig);
}
