export function compareRouteSizes(baseline, measured) {
  if (JSON.stringify(Object.keys(baseline).sort()) !== JSON.stringify(Object.keys(measured).sort())) throw new Error('route baseline coverage differs');
  for (const [route, bytes] of Object.entries(measured)) {
    if (!Number.isFinite(baseline[route]) || !Number.isFinite(bytes) || bytes > baseline[route] + 128) {
      throw new Error(`${route} grew: ${baseline[route]} -> ${bytes} bytes (128 byte tolerance)`);
    }
  }
}
