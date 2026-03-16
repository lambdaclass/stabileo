import 'katex/dist/katex.min.css';
import App from './App.svelte';
import { mount } from 'svelte';
import { solve2D, solve3D, EXAMPLE_INPUT_2D } from './lib/engine/api';
import type { ApiModelInput, ApiSolveOptions } from './lib/engine/api';

const app = mount(App, {
  target: document.getElementById('app')!,
});

// ─── Public API on window.stabileo ────────────────────────────────
// Allows programmatic access from browser console, userscripts, notebooks.
// Usage: const result = stabileo.solve2D(stabileo.EXAMPLE);
(window as any).stabileo = {
  solve2D: (input: ApiModelInput, options?: ApiSolveOptions) => solve2D(input, options),
  solve3D: (input: ApiModelInput, options?: ApiSolveOptions) => solve3D(input, options),
  EXAMPLE: EXAMPLE_INPUT_2D,
  version: '1.0.0',
};

export default app;
