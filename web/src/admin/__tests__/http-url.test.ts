import { describe, it, expect } from 'vitest';
import { httpUrl } from '../http-url';

describe('httpUrl', () => {
  it('keeps http and https links', () => {
    expect(httpUrl('https://stabileo.com/app/basic#data=abc')).toBe('https://stabileo.com/app/basic#data=abc');
    expect(httpUrl('http://localhost:4000/app/pro')).toBe('http://localhost:4000/app/pro');
  });

  it('refuses every other scheme, relative paths and non-strings', () => {
    for (const bad of ['javascript:alert(1)', ' JavaScript:alert(1)', 'data:text/html,<script>alert(1)</script>', 'vbscript:x', 'file:///etc/passwd', '/app/basic', '//evil.test/x', '', 'not a url', null, undefined, 42]) {
      expect(httpUrl(bad)).toBeNull();
    }
  });
});
