import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import '../index';
import { loadFile } from '../file';
import { uiStore } from '../ui.svelte';

const SESSION = gunzipSync(readFileSync(new URL('../../../../legacy-projects/v0.4.0/session.ded.gz', import.meta.url))).toString('utf8');

describe('a saved session whose view showed the physical geometry', () => {
  it('opens with the sections, which draw the same frame', async () => {
    const physical = SESSION.replace(/"renderMode3D": *"wireframe"/g, '"renderMode3D": "physical"');
    expect(physical).not.toBe(SESSION);
    await loadFile(new File([physical], 'session.ded'));
    expect(uiStore.renderMode3D).toBe('sections');
  });
});
