import { afterEach, describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import SolveProgressCard from '../SolveProgressCard.svelte';
import { solveProgress } from '../../lib/store/solve-progress.svelte';
import { setMeshProgress, endMeshProgress } from '../../lib/store/mesh-progress.svelte';
import { fullScreenWorkspace } from '../../lib/store/fullscreen-workspace.svelte';
import { setLocale } from '../../lib/i18n';

const text = (html: string) => html.replace(/<!--[^>]*-->/g, '').replace(/<[^>]+>/g, '');
const meshBar = (html: string) => {
  const tag = html.match(/<progress[^>]*>/g)!.find((p) => p.includes('solve-progress-mesh'))!;
  return Number(tag.match(/value="([^"]+)"/)![1]);
};

describe('the solve card', () => {
  afterEach(() => { solveProgress.dismiss(); endMeshProgress(); setLocale('en'); });

  it('keeps a space before the time left', () => {
    setLocale('es');
    const now = performance.now();
    solveProgress.begin(now - 4000);
    solveProgress.step('cases', 0, 7, now - 3000);
    solveProgress.step('cases', 1, 7, now - 1000);
    expect(text(render(SolveProgressCard).body)).toMatch(/1 de 7 casos · /);
  });

  it('never moves the meshing bar backwards from planning to meshing, and names the step', () => {
    solveProgress.begin();
    solveProgress.step('mesh');
    setMeshProgress('planning', 55, 63);
    const planning = render(SolveProgressCard).body;
    setMeshProgress('meshing', 54, 63);
    const meshing = render(SolveProgressCard).body;
    expect(meshBar(meshing)).toBeGreaterThan(meshBar(planning));
    expect(text(planning)).toContain('Planning the mesh: 55 of 63 plates');
    expect(text(meshing)).toContain('Meshing: 54 of 63 plates');
  });

  it('shrinks to one line while a full-screen workspace is open, and can still be closed', () => {
    const leave = fullScreenWorkspace.enter();
    try {
      solveProgress.begin(0);
      solveProgress.finish({ ok: true, warnings: 12 }, 1000);
      const html = render(SolveProgressCard).body;
      expect(html).toContain('data-compact="true"');
      expect(html).toContain('data-testid="solve-progress-done"');
      expect(html).not.toContain('data-testid="solve-progress-warnings"');
    } finally {
      leave();
    }
    expect(fullScreenWorkspace.open).toBe(false);
    expect(render(SolveProgressCard).body).toContain('data-testid="solve-progress-warnings"');
  });
});
