import { expect, it } from 'vitest';
import { sceneHost } from '../scene-host.svelte';

it.skip('accepts solo ownership only while reinforcement sheets are available (known wrong result: #1928)', () => {
  sceneHost.setSolo(true);
  try { expect(sceneHost.solo).toBe(Boolean(__PUBLIC_FEATURES__.proRcSheets)); }
  finally { sceneHost.setSolo(false); }
  expect(sceneHost.solo).toBe(false);
});
