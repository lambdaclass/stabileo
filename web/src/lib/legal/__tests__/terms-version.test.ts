import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { LEGAL_VERSION } from '../legal';

const CONSENTS = fileURLToPath(new URL('../../../../../backend/apps/stabileo_auth/lib/stabileo_auth/consents.ex', import.meta.url));

describe('terms version', () => {
  it('is the date the backend records as the terms in force', () => {
    const declared = readFileSync(CONSENTS, 'utf8').match(/@terms_version\s+"([^"]+)"/)?.[1];
    expect(declared).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(LEGAL_VERSION).toBe(declared);
  });
});
