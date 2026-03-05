// Combination & envelope — now handled by WASM (wasm-solver.ts).
// This file only keeps the inferLoadCaseType utility used by model.svelte.ts.

import type { LoadCaseType } from '../store/model.svelte';

/** Infer load case type from name for backward compat with old models */
export function inferLoadCaseType(name: string): LoadCaseType {
  const n = name.trim().toUpperCase();
  if (n === 'D' || n === 'DEAD' || n === 'DEAD LOAD') return 'D';
  if (n === 'L' || n === 'LIVE' || n === 'LIVE LOAD') return 'L';
  if (n === 'W' || n === 'WIND') return 'W';
  if (n === 'E' || n === 'EARTHQUAKE' || n === 'SEISMIC') return 'E';
  if (n === 'S' || n === 'SNOW') return 'S';
  if (n === 'T' || n === 'TEMPERATURE' || n === 'THERMAL') return 'T';
  if (n === 'LR' || n === 'ROOF LIVE' || n === 'ROOF LIVE LOAD') return 'Lr';
  if (n === 'R' || n === 'RAIN') return 'R';
  if (n === 'H' || n === 'FLUID' || n === 'FLUID PRESSURE') return 'H';
  return '';
}
