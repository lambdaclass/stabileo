import { render } from 'svelte/server';
import { expect, it } from 'vitest';
import SelectionPanel from '../SelectionPanel.svelte';
import { uiStore } from '../../lib/store';

it('known wrong result: #1928 meshed plates are selected whole until an element is requested', () => {
  const oldMode = uiStore.analysisMode;
  const oldSelection = uiStore.selectMode;
  const oldScope = uiStore.shellPickScope;
  try {
    uiStore.analysisMode = 'pro';
    uiStore.selectMode = 'shells';
    function selected(scope: string) {
      const button = render(SelectionPanel).body.match(new RegExp('<button[^>]*data-testid="shell-pick-' + scope + '"[^>]*>'));
      expect(button?.[0]).toContain('aria-pressed="true"');
    }
    selected('plate');
    uiStore.shellPickScope = 'element';
    selected('element');
    uiStore.shellPickScope = 'plate';
    selected('plate');
  } finally {
    uiStore.shellPickScope = oldScope;
    uiStore.selectMode = oldSelection;
    uiStore.analysisMode = oldMode;
  }
});
