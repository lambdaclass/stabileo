export const MAIN_TOOL_IDS = ['simply-supported-beam', 'cantilever-beam', 'column-buckling', 'continuous-beam', 'portal-frame', 'truss-2d', 'influence-line', 'beam-natural-frequency'] as const;

export function isMainToolPath(path: string): boolean {
  const route = path.replace(/\/+$/, '');
  return MAIN_TOOL_IDS.some(id => route === `/tools/${id}`);
}
