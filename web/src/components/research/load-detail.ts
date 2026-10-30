import type { Component } from 'svelte';

export const researchDetails: Record<string, () => Promise<{ default: Component }>> = {
  '/research/optimization/andreassen-2011': () => import('./andreassen2011/TopoptPage.svelte'),
  '/research/benchmarks/mattiasson-elastica': () => import('./mattiasson1981/MattiassonPage.svelte'),
  '/research/benchmarks/shell-obstacle-course': () => import('./shell1985/ShellPage.svelte'),
  '/research/benchmarks/macneal-harder-1985': () => import('./macneal1985/MacnealPage.svelte'),
  '/research/fracture/shauer-2025': () => import('./shauer2025/ShauerPage.svelte'),
  '/research/metamaterials/grossman-2026': () => import('./grossman2026/SpringsPage.svelte'),
  '/research/stability/ferrari-sigmund-2025': () => import('./ferrari2025/FerrariPage.svelte'),
  '/research/form-finding/pastrana-2026': () => import('./pastrana2026/FormPage.svelte'),
  '/research/mechanics/biggins-2026': () => import('./biggins2026/BigginsPage.svelte'),
  '/research/optimisation/fairclough-2026': () => import('./fairclough2026/FaircloughPage.svelte'),
  '/research/benchmarks/newmark-1959': () => import('./newmark1959/NewmarkPage.svelte'),
  '/research/benchmarks/cqc-1981': () => import('./cqc1981/CqcPage.svelte'),
  '/research/benchmarks/plastic-collapse': () => import('./plastic-collapse/PlasticPage.svelte'),
  '/research/benchmarks/navier-plate': () => import('./navier1823/NavierPage.svelte'),
  '/research/benchmarks/lee-frame-1968': () => import('./lee1968/LeePage.svelte'),
  '/research/benchmarks/dadeppo-arch-1975': () => import('./dadeppo1975/ArchPage.svelte'),
  '/research/benchmarks/riks-crisfield': () => import('./riksCrisfield/RiksCrisfieldPage.svelte'),
};

/** Resolved before the router commits, so detail content and hash targets render together. */
export const loadedResearchDetails: Record<string, Component> = {};
const pending = new Map<string, Promise<Component>>();
export function loadResearchDetail(path: string): Promise<Component | null> {
  const route = path.replace(/\/+$/, '');
  const load = researchDetails[route];
  if (!load) return Promise.resolve(null);
  if (!pending.has(route)) pending.set(route, load().then(m => (loadedResearchDetails[route] = m.default)).catch(error => { pending.delete(route); throw error; }));
  return pending.get(route)!;
}
