import { knownIssueResultDisposition } from '../engine/known-issues';
import { resultsStore } from '../store/results.svelte';
import { uiStore } from '../store/ui.svelte';
import { t } from '../i18n';

export class ContainmentExportError extends Error {}

export function exportWarnings(sources: unknown): string[] {
  const disposition = knownIssueResultDisposition(sources);
  if (disposition.refused) throw new ContainmentExportError(disposition.messages.join('\n'));
  return disposition.messages;
}

/** Default for exports assembled from the workspace; explicit sources narrow independent exports. */
export function workspaceExportDisposition() {
  return uiStore.is3DWorkspace ? resultsStore.knownIssues3D : resultsStore.knownIssues;
}

export function exportMessages(disposition = workspaceExportDisposition()): string[] | null {
  if (disposition.refused) { uiStore.toast(disposition.messages.join('\n'), 'error'); return null; }
  return disposition.messages;
}

/** Throw at synchronous serializers, including individual archive members. */
export function requiredExportMessages(): string[] {
  const disposition = workspaceExportDisposition();
  if (disposition.refused) throw new ContainmentExportError(disposition.messages.join('\n'));
  return disposition.messages;
}
const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const WARNING_SECTION = /<section\b[^>]*\bid\s*=\s*(["']?)stabileo-warnings\1[^>]*>[\s\S]*?<\/section>/gi;
export function warningHtml(html: string, warnings = requiredExportMessages()): string {
  html = html.replace(WARNING_SECTION, '');
  if (!warnings.length) return html;
  const block = `<section id="stabileo-warnings" style="border:2px solid #9b3b00;padding:12px;color:#742d00;background:white;font:14px sans-serif"><h2>⚠ ${escape(t('knownIssue.exportHeading'))}</h2>${warnings.map(w => `<p>${escape(w)}</p>`).join('')}</section>`;
  const body = /<body\b[^>]*>/i.exec(html);
  const at = body ? body.index + body[0].length : 0;
  return html.slice(0, at) + block + html.slice(at);
}

/** Extend the image: warnings never cover engineering content or get clipped. */
export function warningCanvas(source: HTMLCanvasElement, warnings = requiredExportMessages()): HTMLCanvasElement {
  if (!warnings.length) return source;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(source.width, 320);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');
  const font = Math.max(14, Math.round(canvas.width / 70));
  ctx.font = `${font}px sans-serif`;
  const lines: string[] = [];
  for (const warning of warnings) {
    let line = '';
    for (const char of warning) {
      if (ctx.measureText(line + char).width > canvas.width - 32 || char === '\n') { lines.push(line); line = ''; }
      if (char !== '\n') line += char;
    }
    lines.push(line);
  }
  canvas.height = source.height + 32 + lines.length * font * 1.5;
  ctx.fillStyle = 'white'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(source, 0, 0);
  ctx.font = `${font}px sans-serif`; ctx.fillStyle = '#742d00';
  lines.forEach((line, i) => ctx.fillText(line, 16, source.height + 20 + i * font * 1.5));
  return canvas;
}
export async function warningImage(dataUrl: string, warnings = requiredExportMessages()): Promise<string> {
  if (!warnings.length) return dataUrl;
  const img = new Image();
  await new Promise<void>((resolve, reject) => { img.onload = () => resolve(); img.onerror = reject; img.src = dataUrl; });
  const canvas = document.createElement('canvas'); canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('Canvas unavailable');
  ctx.drawImage(img, 0, 0);
  return warningCanvas(canvas, warnings).toDataURL('image/png');
}
