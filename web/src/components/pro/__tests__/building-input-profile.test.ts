import { render } from 'svelte/server';
import { expect, it } from 'vitest';
import BuildingGeneral from '../building/BuildingGeneral.svelte';
import ProSurfaces from '../ProSurfaces.svelte';
import { uiStore } from '../../../lib/store';

it.skip.each([false, true])('known wrong result: #1928 building design inputs follow available sheets and design mode %s', design => {
  const previous = uiStore.designInPro;
  try {
    uiStore.designInPro = design;
    const html = render(BuildingGeneral).body;
    const available = design || !!__PUBLIC_FEATURES__.proRcSheets;
    expect(html.includes('data-testid="building-rebar-grade"')).toBe(available);
    expect(html.includes('data-testid="building-general-more"')).toBe(available);
    expect(html).toContain('data-testid="design-data-concrete"');
    if (!available) expect(html).not.toMatch(/<details[^>]*>[\s\S]*data-testid="design-data-concrete"/);
  } finally {
    uiStore.designInPro = previous;
  }
});

it.skip('known wrong result: #1928 ordinary analytical surfaces retain their published action styles', () => {
  const html = render(ProSurfaces).body;
  function classes(id: string) {
    const element = html.match(new RegExp('<button[^>]*data-testid="' + id + '"[^>]*>'))?.[0];
    expect(element).toBeDefined();
    return element!.match(/class="([^"]*)"/)?.[1]?.split(/\s+/);
  }
  const unified = !!__PUBLIC_FEATURES__.proPlatesUnified;
  expect(classes('sf-place')).toEqual(expect.arrayContaining(unified ? ['pk-btn', 'pk-btn-primary'] : ['pro-btn', 'pro-btn-accent']));
  expect(classes('sf-axis')).toContain(unified ? 'pk-btn' : 'pro-btn');
});
