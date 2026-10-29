import { expect, it, vi } from 'vitest';
import { EditorLoad } from '../editor-load.svelte';

it('attempts a rejected encoder once and preserves the error until manual retry', async () => {
  const editor = new EditorLoad();
  const encode = vi.fn().mockRejectedValue(new Error('raw-deflate unavailable'));
  // Repeated evaluations of the page's automatic-load gate must not retry a rejection.
  for (let i = 0; i < 10; i++) if (!editor.attempted) await editor.load(encode, () => true);
  expect(encode).toHaveBeenCalledTimes(1);
  expect(editor.error).toContain('raw-deflate unavailable');
  expect(editor.loading).toBe(false);
  encode.mockResolvedValue('/editor');
  await editor.load(encode, () => true);
  expect(encode).toHaveBeenCalledTimes(2);
  expect(editor.error).toBeNull();
  expect(editor.src).toBe('/editor');
});
it('does not install a URL for an obsolete simulation', async () => {
  const editor = new EditorLoad();
  await editor.load(async () => '/obsolete', () => false);
  expect(editor.src).toBeNull();
  expect(editor.loading).toBe(false);
  expect(editor.attempted).toBe(true);
});

it.each([false, true])('ignores obsolete completion (rejection: %s) while the newer iframe loads', async (rejectOld) => {
  const editor = new EditorLoad();
  let resolve!: (url: string) => void;
  let reject!: (error: Error) => void;
  const old = editor.load(() => new Promise<string>((yes, no) => { resolve = yes; reject = no; }), () => true);
  expect(await editor.load(async () => '/new', () => true)).toBe(true);
  if (rejectOld) reject(new Error('obsolete failure')); else resolve('/old');
  expect(await old).toBe(false);
  expect(editor.src).toBe('/new');
  expect(editor.error).toBeNull();
  editor.loaded('/old');
  expect(editor.loading).toBe(true);
  editor.loaded('/new');
  expect(editor.loading).toBe(false);
});

it('closes a failed full-editor popup and permits retry', async () => {
  const { openEditorWindow } = await import('../editor-load.svelte');
  const popup = { close: vi.fn(), opener: {}, location: { href: 'about:blank' } };
  const open = () => popup as unknown as Window;
  const navigate = vi.fn();
  await expect(openEditorWindow(async () => { throw new Error('encoding failed'); }, open, navigate)).rejects.toThrow('encoding failed');
  expect(popup.close).toHaveBeenCalledOnce();
  expect(navigate).not.toHaveBeenCalled();
  await openEditorWindow(async () => '/retry', open, navigate);
  expect(popup.location.href).toBe('/retry');
  expect(popup.opener).toBeNull();
});

it('ignores the previous iframe onload while encoding a replacement', async () => {
  const editor = new EditorLoad();
  await editor.load(async () => '/old', () => true);
  let resolve!: (url: string) => void;
  const replacement = editor.load(() => new Promise<string>((yes) => { resolve = yes; }), () => true);
  editor.loaded('/old');
  expect(editor.loading).toBe(true);
  resolve('/new');
  expect(await replacement).toBe(true);
  editor.loaded('/new');
  expect(editor.loading).toBe(false);
});
