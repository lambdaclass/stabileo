import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { findPost } from '..';
import huBody from '../translations/hu/safety-advisories';
import gravity from '../../provenance/result-changes/gravity-physical-regions.json';
import floor from '../../provenance/result-changes/floor-load-region-moments.json';
import type { PublicLocale } from '../../i18n/store.svelte';

for(const locale of ['en','es','pt','de','fr','tr','hu'] as PublicLocale[]) for(const [id,issue,slug,notice] of [
  ['SA-2026-079',2199,'gravity-shell-coverage',gravity],['SA-2026-080',2201,'floor-zone-eccentricity',floor],
] as const) {
  it(`${locale} publishes ${id} with the assigned issue and pending fix`,()=>{
    const post=findPost('safety-advisories')!,blocks=(locale === 'hu' ? huBody : post.i18n[locale]!).blocks,table=blocks.find(b=>b.k==='table');
    if(table?.k!=='table') throw new Error('Missing advisory table');
    const rows=table.rows.filter(row=>row[0]===id);
    expect(rows).toHaveLength(1);
    expect(rows[0]![1]).toContain(`#${issue}`);
    expect(rows[0]![3]).toContain('#2219');
    expect(blocks.filter(b=>b.k==='note' && b.t.startsWith(`${id} — `))).toHaveLength(1);
    expect(blocks.filter(b=>b.k==='ext' && b.label===id && b.href.endsWith(`/docs/advisories/${id}-${slug}.md`))).toHaveLength(1);
    expect(notice.explanation[locale]).toContain(id);
    expect(post.updated).toBe('2026-11-16');
  });
}
for(const [id,slug] of [['SA-2026-079','gravity-shell-coverage'],['SA-2026-080','floor-zone-eccentricity']]) {
  it(`${id} states the assigned fix and complete recovery`,()=>{
    const text=readFileSync(new URL(`../../../../../docs/advisories/${id}-${slug}.md`,import.meta.url),'utf8');
    expect(text).toContain('PR [#2219](https://github.com/lambdaclass/stabileo/pull/2219); pending merge and release');
    expect(text).toContain('regenerate all affected\ngenerated area loads');
    expect(text).toContain('historical release binaries not assessed');
    expect(text).toContain('9d925a78093db05bf8b50eb125aa829fa5dd955d');
  });
}
