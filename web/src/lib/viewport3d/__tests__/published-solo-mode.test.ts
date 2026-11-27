import { expect, it } from 'vitest';
import { sceneHost } from '../scene-host.svelte';

it('accepts solo ownership only while reinforcement sheets are available', () => {
  sceneHost.setSolo(true);
  try { expect(sceneHost.solo).toBe(Boolean(__PUBLIC_FEATURES__.proRcSheets)); }
  finally { sceneHost.setSolo(false); }
  expect(sceneHost.solo).toBe(false);
});
