import type { IfcParseResult } from './ifc-parser';

/**
 * Parse an IFC file: in the browser on the page, as always; in the desktop app in a worker
 * (`./ifc-worker.ts` says why). The browser bundle never contains the worker.
 */
export async function parseIfcFile(data: ArrayBuffer): Promise<IfcParseResult> {
  if (import.meta.env.VITE_DESKTOP === '1') {
    const { parseIfcInWorker } = await import('./parse-in-worker');
    return parseIfcInWorker(data);
  }
  const { parseIfc } = await import('./ifc-parser');
  return parseIfc(data);
}
