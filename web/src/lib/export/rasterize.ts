import type { Raster } from './report-docx';

const PRINT_DPI = 300;
const MAX_SIDE = 4000;
const PRINT_WIDTH_PX = 1000;

function load(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image'));
    img.src = src;
  });
}

/** A figure as a PNG drawn for print at 300 dpi of the size it prints at, on white. */
export async function rasterizeForPrint(src: string, size: { width?: number; height?: number }): Promise<Raster | null> {
  if (!src.startsWith('data:image/')) return null;
  const img = await load(src);
  const nw = img.naturalWidth || size.width || 800, nh = img.naturalHeight || size.height || 600;
  const fit = Math.min(1, (size.width ?? nw) / nw, (size.height ?? nh) / nh);
  const width = nw * fit, height = nh * fit;
  const scale = Math.min((Math.min(width, PRINT_WIDTH_PX) * PRINT_DPI) / 96 / width, MAX_SIDE / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'));
  canvas.width = canvas.height = 0;
  if (!blob) return null;
  return { png: new Uint8Array(await blob.arrayBuffer()), width, height };
}
