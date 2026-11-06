import { describe, expect, it } from 'vitest';
import config from '../../playwright.config';

describe('playwright config', () => {
  it('never captures a git diff, whose PR-base fetch with depth 1 makes the checkout shallow', () => {
    expect(config.captureGitInfo?.diff).toBe(false);
  });
});
