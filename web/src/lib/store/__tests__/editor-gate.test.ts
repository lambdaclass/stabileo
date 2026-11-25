import { describe, it, expect } from 'vitest';
import { editorNeedsAccount, framedByAnotherPage, type EditorGateState } from '../editor-gate';

const asks: EditorGateState = { configKnown: true, restoring: false, required: true, signedIn: false, embedded: false, editorShown: true };

describe('when opening the editor asks for an account', () => {
  it('asks a signed-out reader in the editor once the settings are known', () => {
    expect(editorNeedsAccount(asks)).toBe(true);
  });

  it.each([
    ['the settings are not known yet', { configKnown: false }],
    ['a stored session is being restored', { restoring: true }],
    ['the admin site does not require it', { required: false }],
    ['the reader is signed in', { signedIn: true }],
    ['the editor is embedded or only views a shared model', { embedded: true }],
    ['a public page is on screen', { editorShown: false }],
  ] as const)('does not ask while %s', (_why, change) => {
    expect(editorNeedsAccount({ ...asks, ...change })).toBe(false);
  });

  it('tells a page framed by another one from a top-level page', () => {
    const top = {} as Window;
    expect(framedByAnotherPage({ self: top, top } as unknown as Window)).toBe(false);
    expect(framedByAnotherPage({ self: {}, top: {} } as unknown as Window)).toBe(true);
  });
});
