import { afterAll, vi } from 'vitest';

vi.stubEnv('VITE_RESEARCH', '1');
vi.stubEnv('VITE_TOOLS', '1');
vi.stubEnv('VITE_DIAGRAM_GAME', '1');

vi.stubEnv('VITE_ACCOUNTS', '1');

afterAll(() => vi.unstubAllEnvs());
