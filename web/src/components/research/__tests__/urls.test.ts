import { expect, it } from 'vitest';
import { isHttpUrl } from '../urls';

it('only permits absolute HTTPS gallery links', () => {
  for (const url of ['https://github.com/example', 'HTTPS://gitlab.com/example']) {
    expect(isHttpUrl(url)).toBe(true);
  }
  for (const url of ['http://example.com', 'javascript:alert(1)', 'data:text/html,test', '//github.com/example', '/relative', '', 'https://']) {
    expect(isHttpUrl(url)).toBe(false);
  }
});
