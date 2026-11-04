import { describe, expect, it } from 'vitest';
import { PUBLIC_LOCALES } from '../../../lib/i18n/offered';
import { EXPERIMENTS } from '../experiments';
import { RELATED, RELATED_COPY, relatedPaths } from '../related';
import { LINK_NAMES } from '../related-names';
import { TOOL_IDS } from '../../tools/calculators';
import { BATCH_IDS } from '../../tools/batch';

const papers = EXPERIMENTS.map((e) => e.path);
const tools = [...TOOL_IDS, ...BATCH_IDS].map((id) => `/tools/${id}`);

describe('research and tools link to each other', () => {
  it('every calculator has related research, and every target is a published page', () => {
    expect(Object.keys(RELATED).map((id) => `/tools/${id}`).sort()).toEqual([...tools].sort());
    for (const targets of Object.values(RELATED)) {
      expect(targets.length).toBeGreaterThan(0);
      for (const t of targets) expect(papers).toContain(`/research/${t}`);
    }
  });
  it('the links are reciprocal, with or without a trailing slash', () => {
    for (const [tool, targets] of Object.entries(RELATED)) for (const t of targets) {
      expect(relatedPaths(`/research/${t}`)).toContain(`/tools/${tool}`);
      expect(relatedPaths(`/research/${t}/`)).toContain(`/tools/${tool}`);
      expect(relatedPaths(`/tools/${tool}`)).toContain(`/research/${t}`);
    }
    expect(relatedPaths('/research')).toEqual([]);
    expect(relatedPaths('/tools')).toEqual([]);
  });
  it.each(PUBLIC_LOCALES)('%s names every link target and section', (locale) => {
    expect(RELATED_COPY[locale]).toHaveLength(4);
    for (const label of RELATED_COPY[locale]) expect(label.trim().length).toBeGreaterThan(3);
    const slugs = new Set([...Object.keys(RELATED), ...Object.values(RELATED).flat().map((t) => t.split('/').at(-1)!)]);
    for (const slug of slugs) expect(LINK_NAMES[locale][slug], `${locale} ${slug}`).toBeTruthy();
    if (locale !== 'en') expect(RELATED_COPY[locale][0]).not.toBe(RELATED_COPY.en[0]);
  });
});
