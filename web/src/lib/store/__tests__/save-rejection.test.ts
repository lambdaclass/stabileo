import { expect, it, vi } from 'vitest';
vi.mock('../../export/save-file', () => ({ saveFile() { throw new Error('download failed'); } }));
vi.mock(import('../../features'), async (importOriginal) => ({
  ...await importOriginal(),
  accounts: () => false,
  canonicalSections: () => true,
}));
it('#2364 — save wrapper loads and forwards rejection (#765 T235)', async () => {
  const { saveTextTo } = await import('../file');
  const result = saveTextTo('{}', 'model.ded', 'application/json').then(() => 'saved', e => e.message);
  expect(await Promise.race([result, new Promise(r => setTimeout(() => r('pending'), 20))])).toBe('download failed');
});
