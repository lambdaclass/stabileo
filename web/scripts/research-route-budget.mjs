export function compareRouteSizes(baseline, measured) {
  if (JSON.stringify(Object.keys(baseline).sort()) !== JSON.stringify(Object.keys(measured).sort())) throw new Error('route baseline coverage differs');
  for (const [route, bytes] of Object.entries(measured)) {
    if (!Number.isFinite(baseline[route]) || !Number.isFinite(bytes) || bytes > baseline[route] + 128) {
      throw new Error(`${route} grew: ${baseline[route]} -> ${bytes} bytes (128 byte tolerance)`);
    }
  }
}

// Product features have a separately reviewed growth allowance. This never changes
// the research isolation comparator's fixed 128-byte tolerance above.
export function compareProductRouteSizes(baseline, measured, budget) {
  const allowance = budget.max_growth_bytes;
  if (!Number.isSafeInteger(allowance) || allowance < 0) throw new Error('invalid product growth budget');
  if (JSON.stringify(Object.keys(baseline).sort()) !== JSON.stringify(Object.keys(measured).sort())) throw new Error('route baseline coverage differs');
  for (const [route, bytes] of Object.entries(measured)) {
    if (!Number.isFinite(baseline[route]) || !Number.isFinite(bytes) || bytes > baseline[route] + allowance) {
      throw new Error(`${route} grew: ${baseline[route]} -> ${bytes} bytes (product growth budget ${allowance})`);
    }
  }
}
