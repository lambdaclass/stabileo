export function loadGenerationOwner(mark: unknown): 'plan' | 'independent' | 'unmarked' {
  if (mark == null || mark === '') return 'unmarked';
  return typeof mark === 'string' && !mark.includes(':') ? 'plan' : 'independent';
}

export const fromLoadPlan = (mark: unknown): boolean => loadGenerationOwner(mark) === 'plan';

export function independentLoadMark(producer: 'arch' | 'stair', source: string): string {
  return `${producer}:${source}`;
}
