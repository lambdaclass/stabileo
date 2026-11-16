export const MAIN_CALCULATOR_IDS = ['simply-supported-beam', 'cantilever-beam', 'column-buckling'] as const;
export const MAIN_BATCH_IDS = ['continuous-beam', 'portal-frame', 'truss-2d', 'influence-line', 'beam-natural-frequency'] as const;
export const MAIN_TOOL_IDS = [...MAIN_CALCULATOR_IDS, ...MAIN_BATCH_IDS] as const;

export function isMainToolPath(path: string): boolean {
  const route = path.replace(/\/+$/, '');
  return MAIN_TOOL_IDS.some(id => route === `/tools/${id}`);
}
