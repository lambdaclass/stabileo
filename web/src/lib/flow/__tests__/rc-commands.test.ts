/**
 * The pipeline's actions, and the pairing the extraction exists to preserve.
 *
 * The assertion that matters is not "the store was called". It is that every design command
 * ARMS the diagnostics warning first — because `diagnostics-warning.svelte.ts` states the rule
 * that pressing Calculate on a model that cannot be calculated must explain itself, and an
 * action relocated to another stage without its `arm()` would drop that silently.
 *
 * `rcCancelRun` is here for a different reason: it had zero coverage of any kind.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  rcAutoDesignSelected, rcCancelRun, rcCodeCheck, rcComputeDemands, rcDesignScope,
  rcDesignScopeFamilies, rcGenerateDetailing,
} from '../rc-commands';
import { designRunStore } from '../../store/design-run.svelte';
import { detailingStore } from '../../store/detailing.svelte';
import { diagnosticsWarning } from '../../store/diagnostics-warning.svelte';

beforeEach(() => vi.restoreAllMocks());

describe('every design command arms the diagnostics warning', () => {
  /*
   * Loading a model arms implicitly; an explicit press has to arm explicitly. This is the
   * pairing that used to live in a closure inside the component drawing the button, and that
   * relocating the button would have had to copy.
   */
  it.each([
    ['computeDemands', () => rcComputeDemands(), 'computeDemands'],
    ['codeCheck', () => rcCodeCheck(), 'runCodeCheck'],
    ['autoDesignSelected', () => rcAutoDesignSelected([1, 2]), 'autoDesign'],
  ])('%s arms, then calls %s', (_label, run, method) => {
    const arm = vi.spyOn(diagnosticsWarning, 'arm');
    const call = vi.spyOn(designRunStore, method as 'computeDemands').mockReturnValue(
      { ok: false, reason: 'test' } as never);
    run();
    expect(arm, 'the warning was armed').toHaveBeenCalled();
    expect(call, `${method} ran`).toHaveBeenCalled();
    // Order matters: arming after the run would miss a diagnostic the run itself produced.
    expect(arm.mock.invocationCallOrder[0]).toBeLessThan(call.mock.invocationCallOrder[0]);
  });

  it('the scoped design arms too, and runs the scope the store holds', () => {
    const arm = vi.spyOn(diagnosticsWarning, 'arm');
    const call = vi.spyOn(designRunStore, 'designFamilies').mockReturnValue(null as never);
    designRunStore.setFamilySelection(['beam']);
    rcDesignScope('v1');
    expect(arm).toHaveBeenCalled();
    expect(call.mock.calls[0][0], 'it ran the stored scope, not an argument')
      .toEqual(['beam']);
  });

  /*
   * The scope comes from the store and not from a parameter, so a caller cannot run a scope the
   * read-out beside the button never showed.
   */
  it('exposes the scope it would run', () => {
    designRunStore.setFamilySelection(['column', 'beam']);
    expect(rcDesignScopeFamilies()).toEqual(['column', 'beam']);
  });
});

describe('the two that do not arm, and why', () => {
  /*
   * Detailing coordinates bars the design already produced; it raises no solver diagnostic of
   * its own, and the prerequisites are RENDERED beside the button rather than evaluated in the
   * handler — the store refuses on its own and reports through `lastError`.
   */
  it('generateDetailing delegates to the store and nothing else', () => {
    const gen = vi.spyOn(detailingStore, 'generate').mockReturnValue(undefined as never);
    const arm = vi.spyOn(diagnosticsWarning, 'arm');
    rcGenerateDetailing();
    expect(gen).toHaveBeenCalled();
    expect(arm, 'nothing to arm: it starts no solve').not.toHaveBeenCalled();
  });

  /* Cancelling stops work; it cannot produce a diagnostic worth raising. */
  it('cancel stops the run', () => {
    const cancel = vi.spyOn(designRunStore, 'cancel');
    rcCancelRun();
    expect(cancel, 'the command nothing used to exercise').toHaveBeenCalled();
  });
});

describe('the viewer keeps one implementation', () => {
  /*
   * `openRebar3D` is already the single function behind four entry points. This module
   * re-exposes it rather than re-implementing it, and the check is on the source because the
   * failure mode is a second implementation being written, not a call that fails today.
   */
  it('passes through to rebar-open and builds no viewer of its own', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(resolve(here, '../rc-commands.ts'), 'utf8');
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(code).toMatch(/from '\.\.\/store\/rebar-open'/);
    expect(code, 'no scene or workspace is built here')
      .not.toMatch(/rebarWorkspace|RebarScene|buildScene/);
  });

  /* The clock comes from the caller, the rule the detailing store states about itself. */
  it('never reads a clock', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const code = readFileSync(resolve(here, '../rc-commands.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(code).not.toMatch(/new Date\(\)|Date\.now\(\)/);
  });
});
