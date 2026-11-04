/**
 * `modalOverlayOpen` is what silences the model's editing shortcuts (Delete, Escape's clear,
 * cut, paste, select-all, tool keys) while a surface covers the model. The keyboard path itself is
 * proved end to end in `e2e/interaction-contracts.spec.ts` (C1b, C18, C18b); this pins the three
 * sources it reads.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { modalOverlayOpen } from '../modal-overlay';
import { deskUi } from '../../store/design-desk-ui.svelte';
import { rebarWorkspace } from '../../store/rebar-workspace.svelte';

const noDialog = { querySelector: () => null } as unknown as Pick<Document, 'querySelector'>;
const withDialog = {
  querySelector: (sel: string) => (sel === '[aria-modal="true"]' ? ({} as Element) : null),
} as unknown as Pick<Document, 'querySelector'>;

afterEach(() => { deskUi.open = false; rebarWorkspace.close(); });

describe('modalOverlayOpen', () => {
  it('is false with nothing covering the model', () => {
    expect(modalOverlayOpen(noDialog)).toBe(false);
    expect(modalOverlayOpen(undefined)).toBe(false);
  });

  it('is true while the design desk is open', () => {
    deskUi.open = true;
    expect(modalOverlayOpen(noDialog)).toBe(true);
  });

  it('is true while the 3-D reinforcement workspace is open', () => {
    rebarWorkspace.openWorkspace();
    expect(modalOverlayOpen(noDialog)).toBe(true);
  });

  it('is true while any aria-modal dialog is in the page', () => {
    expect(modalOverlayOpen(withDialog)).toBe(true);
  });
});
