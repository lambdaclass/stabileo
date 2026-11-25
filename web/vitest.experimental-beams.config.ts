import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { include: ['src/experimental-beams/study.test.ts'], environment: 'node' },
});
