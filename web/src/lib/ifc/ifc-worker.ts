/**
 * IFC parsing off the page, for the desktop app (`./parse.ts`).
 *
 * web-ifc's bindings compile their glue with `new Function`, which the desktop app's
 * Content-Security-Policy forbids on the page (`desktop/src-tauri/tauri.conf.json`: no
 * 'unsafe-eval'). A worker loaded from its own script file is not under the page's policy, and it
 * has no access to the shell's commands, so the parser runs here instead of widening the policy.
 */
import '../i18n/full-dictionaries';
import { setLocale } from '../i18n';
import { parseIfc } from './ifc-parser';

self.onmessage = async (e: MessageEvent<{ data: ArrayBuffer; locale: string }>) => {
  try {
    setLocale(e.data.locale);
    const result = await parseIfc(e.data.data);
    self.postMessage({ ok: true, result });
  } catch (err) {
    self.postMessage({ ok: false, message: err instanceof Error ? err.message : String(err) });
  }
};
