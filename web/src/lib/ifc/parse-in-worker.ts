import { i18n } from '../i18n';
import type { IfcParseResult } from './ifc-parser';

/**
 * The desktop app's IFC parsing: in `./ifc-worker.ts` (which says why), one worker per file, ended
 * when it answers. Callers test VITE_DESKTOP first; outside the desktop build this module is a stub
 * (web/vite.desktop.ts), so the worker is not in the browser bundle.
 */
export function parseIfcInWorker(data: ArrayBuffer): Promise<IfcParseResult> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./ifc-worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<{ ok: true; result: IfcParseResult } | { ok: false; message: string }>) => {
      worker.terminate();
      if (e.data.ok) resolve(e.data.result);
      else reject(new Error(e.data.message));
    };
    worker.onerror = (e) => {
      worker.terminate();
      reject(new Error(e.message || 'IFC worker failed'));
    };
    worker.postMessage({ data, locale: i18n.locale });
  });
}
