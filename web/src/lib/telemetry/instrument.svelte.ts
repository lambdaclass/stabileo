import { untrack } from 'svelte';
import { uiStore, resultsStore, modelStore } from '../store';
import { i18n } from '../i18n';
import { setUsageContext, trackUsage, installUsageLifecycle } from './usage';
import { solveSignal } from './solve-signal.svelte';

export function appModeLabel(): string {
  const m = uiStore.appMode;
  return m === 'pro' ? 'pro' : m === 'educativo' ? 'edu' : 'basic';
}

export function sizeBucket(n: number): string {
  if (n <= 10) return '1-10';
  if (n <= 50) return '11-50';
  if (n <= 200) return '51-200';
  if (n <= 1000) return '201-1000';
  return '1000+';
}

export function noteSolve(ok: boolean, startedAt: number): void {
  solveSignal.bump(ok);
  trackUsage('solve', {
    outcome: ok ? 'ok' : 'error',
    ms: Math.round(performance.now() - startedAt),
    dim3: uiStore.is3DWorkspace,
    elements: sizeBucket(modelStore.elements.size),
  });
}

export function installUsageTracking(): () => void {
  setUsageContext({ appMode: appModeLabel, locale: () => i18n.locale });
  const stopLifecycle = installUsageLifecycle();
  const stopEffects = $effect.root(() => {
    let firstTool = true;
    $effect(() => {
      const tool = uiStore.currentTool;
      if (firstTool) { firstTool = false; return; }
      untrack(() => trackUsage('tool.select', { tool, dim3: uiStore.is3DWorkspace }));
    });
    let firstDiagram = true;
    $effect(() => {
      const kind = resultsStore.diagramType;
      if (firstDiagram) { firstDiagram = false; return; }
      if (kind && kind !== 'none') untrack(() => trackUsage('diagram.show', { kind, dim3: uiStore.is3DWorkspace }));
    });
    $effect(() => {
      const mode = appModeLabel();
      untrack(() => trackUsage('mode.open', { mode }));
    });
  });
  return () => {
    stopEffects();
    stopLifecycle();
  };
}
