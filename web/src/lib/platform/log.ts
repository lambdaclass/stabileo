/**
 * The page's warnings and errors also go to the app's log file (the shell's `log_line`), so a
 * tester can attach it to a report. Nothing is sent anywhere.
 */
import { invoke } from '@tauri-apps/api/core';

let installed = false;

function text(args: unknown[]): string {
  return args
    .map((a) => (a instanceof Error ? `${a.message}\n${a.stack ?? ''}` : typeof a === 'string' ? a : safeJson(a)))
    .join(' ')
    .slice(0, 4000);
}

function safeJson(v: unknown): string {
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

export function logToFile(): void {
  if (installed) return;
  installed = true;
  for (const level of ['warn', 'error'] as const) {
    const original = console[level].bind(console);
    console[level] = (...args: unknown[]) => {
      original(...args);
      // Through the original console only, so a failing log cannot call itself.
      invoke('log_line', { line: `${level}: ${text(args)}` }).catch((err) => original('[stabileo] log:', err));
    };
  }
  window.addEventListener('error', (e) => console.error('uncaught:', e.error ?? e.message));
  window.addEventListener('unhandledrejection', (e) => console.error('unhandled rejection:', e.reason));
}
