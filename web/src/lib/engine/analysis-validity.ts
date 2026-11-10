export function requireCableAnalysis(elements: Iterable<{ id: number; type: string }>): void {
  const elementIds = [...elements].filter(e => e.type === 'cable').map(e => e.id).sort((a, b) => a - b);
  if (elementIds.length === 0) return;
  const d = {
    code: 'cable_analysis_required', severity: 'error', elementIds,
    message: 'Results withheld: cable elements require cable analysis to enforce tension-only behaviour.',
  };
  throw new Error(JSON.stringify({ message: d.message, structuredDiagnostics: [d] }));
}
