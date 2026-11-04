/**
 * Whether the calculation engine (WASM) is loaded, as reactive state.
 *
 * Every engineering result comes from the engine. A screen that computes before it is up
 * (the flexure calculator, say) reads `engineStatus.ready` so that it recomputes once the engine
 * arrives, and shows "engine not available" until then instead of a TypeScript stand-in. When
 * the engine fails to load, `error` holds why.
 */
export const engineStatus = $state<{ ready: boolean; error: string | null }>({ ready: false, error: null });

export function markEngineReady(): void { engineStatus.ready = true; engineStatus.error = null; }
export function markEngineFailed(error: string): void { engineStatus.ready = false; engineStatus.error = error; }
