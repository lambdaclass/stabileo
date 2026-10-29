import { describe, expect, it, vi } from 'vitest';
import { openUrl } from '@tauri-apps/plugin-opener';
vi.mock('@tauri-apps/plugin-opener', () => ({ openUrl: vi.fn(async () => undefined) }));
import { externalHttps, routeExternalLinks } from '../external-links';

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


it('the installed router default-denies unsafe clicks and window.open', () => {
  const listeners = new Map<string, (event: any) => void>();
  const nativeOpen = vi.fn(() => null);
  vi.stubGlobal('location', new URL(APP));
  vi.stubGlobal('document', { addEventListener: (type: string, callback: (event: any) => void) => listeners.set(type, callback) });
  vi.stubGlobal('window', { open: nativeOpen });
  routeExternalLinks();
  for (const href of ['javascript:alert(1)', 'data:text/html,hello', 'file:///etc/passwd', '//example.com/path', 'http://example.com']) {
    const preventDefault = vi.fn();
    listeners.get('click')!({ button: 0, target: { closest: () => ({ getAttribute: () => href }) }, preventDefault });
    expect(preventDefault).toHaveBeenCalled();
    window.open(href);
    expect(nativeOpen).not.toHaveBeenCalled();
  }
  window.open('/app/pro');
  expect(nativeOpen).toHaveBeenCalledWith('/app/pro', undefined, undefined);
  window.open('https://example.com');
  expect(openUrl).toHaveBeenCalledWith('https://example.com/');
  vi.unstubAllGlobals();
});
