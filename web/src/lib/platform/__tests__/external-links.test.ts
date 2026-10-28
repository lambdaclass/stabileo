import { describe, expect, it } from 'vitest';
import { externalHttps } from '../external-links';

const APP = 'http://tauri.localhost/app/basic';

describe('externalHttps: which links leave the desktop app for the system browser', () => {
  it('takes an https address on another origin', () => {
    expect(externalHttps('https://github.com/lambdaclass/stabileo/releases', APP)).toBe('https://github.com/lambdaclass/stabileo/releases');
    expect(externalHttps('https://wa.me/123?text=hola', APP)).toBe('https://wa.me/123?text=hola');
  });

  it('keeps the app\'s own addresses in the app', () => {
    expect(externalHttps('/app/pro', APP)).toBeNull();
    expect(externalHttps('#results', APP)).toBeNull();
    expect(externalHttps('https://tauri.localhost/app/pro', 'https://tauri.localhost/app/basic')).toBeNull();
  });

  it('refuses anything that is not https', () => {
    expect(externalHttps('http://example.com', APP)).toBeNull();
    expect(externalHttps('mailto:a@b.c', APP)).toBeNull();
    expect(externalHttps('file:///etc/passwd', APP)).toBeNull();
    expect(externalHttps('javascript:alert(1)', APP)).toBeNull();
    expect(externalHttps('https://[bad', APP)).toBeNull();
  });
});
