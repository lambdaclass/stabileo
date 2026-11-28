/**
 * A gallery example on its way in: which one, and the step it is on (its model, the loads the
 * generator writes for it, its first drawing), for the page to say it is working rather than look
 * stuck while a building opens.
 */
export type ExampleStep = 'model' | 'loads' | 'draw';

export interface ExampleProgress { nameKey: string; step: ExampleStep; startedAt: number }

let now = $state.raw<ExampleProgress | null>(null);

export const exampleProgress = {
  get now() { return now; },
  begin(nameKey: string, at = performance.now()): void { now = { nameKey, step: 'model', startedAt: at }; },
  step(step: ExampleStep): void { if (now) now = { ...now, step }; },
  end(): void { now = null; },
};
