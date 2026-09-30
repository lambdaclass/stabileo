/**
 * The viewport recorded to a video file: whatever it is animating (the deformed shape, a mode, a
 * time-history run) for a stated number of seconds, as WebM, through the browser's own encoder
 * (`MediaRecorder` over the canvas's stream). A browser without it says so rather than producing
 * an empty file.
 */
import { viewportCanvas } from '../utils/viewport-canvas';

export function canRecordVideo(): boolean {
  return typeof MediaRecorder !== 'undefined' && typeof HTMLCanvasElement !== 'undefined' && 'captureStream' in HTMLCanvasElement.prototype;
}

/** The first WebM encoding the browser offers. */
function mimeType(): string | undefined {
  for (const m of ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']) {
    if (MediaRecorder.isTypeSupported?.(m)) return m;
  }
  return undefined;
}

/** Record `seconds` of the viewport at `fps`; resolves with the file, or rejects with why not. */
export function recordViewport(seconds: number, fps = 30): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const canvas = viewportCanvas();
    if (!canvas || !canRecordVideo()) { reject(new Error('unsupported')); return; }
    const stream = (canvas as HTMLCanvasElement & { captureStream(fps?: number): MediaStream }).captureStream(fps);
    const type = mimeType();
    const rec = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
    rec.onstop = () => {
      stream.getTracks().forEach((tr) => tr.stop());
      const blob = new Blob(chunks, { type: type ?? 'video/webm' });
      if (blob.size === 0) reject(new Error('empty')); else resolve(blob);
    };
    rec.onerror = () => reject(new Error('recorder'));
    rec.start(250);
    setTimeout(() => { if (rec.state !== 'inactive') rec.stop(); }, Math.max(1, seconds) * 1000);
  });
}
