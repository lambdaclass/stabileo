import { expect, it, vi } from 'vitest';
vi.mock('../../export/save-file', () => ({ saveFile() { throw new Error('download failed'); } }));
vi.mock('../../features', () => ({ accounts: () => false, canonicalSections: () => true }));
import { saveTextTo } from '../file';
it('known wrong result: #765 T235 — save wrapper forwards rejection', async () => {
  const result = saveTextTo('{}', 'model.ded', 'application/json').then(() => 'saved', e => e.message);
  expect(await Promise.race([result, new Promise(r => setTimeout(() => r('pending'), 20))])).toBe('download failed');
});
