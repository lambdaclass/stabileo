/**
 * Listings carry the results' provenance and stale status as every export of results does, and the
 * bending-machine schedule, which can carry none, is refused for a document never to be built from.
 */
import { describe, it, expect, vi } from 'vitest';
import { listingBytes, exportBvbs } from '../listing-export';
import { LISTING_IDS } from '../listings';
import { currentResultProvenance } from '../result-provenance';
import { provenanceLines } from '../../export/provenance-attach';
import { uiStore } from '../ui.svelte';

describe('listings and their provenance', () => {
  const record = currentResultProvenance();
  const status = provenanceLines(record)[0]![1];

  it('CSV and HTML open with the record when one is given', async () => {
    const id = LISTING_IDS[0]!;
    const csv = String(await listingBytes(id, 'csv', 'es', record));
    expect(csv.startsWith('# ')).toBe(true);
    expect(csv).toContain(status.replace(/[\r\n]+/g, ' '));
    expect(String(await listingBytes(id, 'csv', 'es'))).not.toContain('# ');
    expect(String(await listingBytes(id, 'html', 'es', record))).toContain('stabileo-provenance');
  });

  it('BVBS is refused for an outdated document, and said', () => {
    const toast = vi.spyOn(uiStore, 'toast').mockImplementation(() => {});
    expect(exportBvbs({ readiness: 'OUTDATED', revision: { number: 1 }, assemblies: [] } as never, '2026-10-24T00:00:00Z')).toBe(false);
    expect(toast).toHaveBeenCalledWith(expect.any(String), 'error');
    toast.mockRestore();
  });
});
