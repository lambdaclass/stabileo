import { describe, expect, it } from 'vitest';
import { decompressSnapshot } from '../../../../lib/utils/url-sharing';
import { inflateSync } from 'fflate';
import { editorHash, editorModel, validateLayout, viewerData } from '../model';
import { translations } from '../i18n';
import result from '../../../../../../research/optimisation/fairclough-2026/results/stabileo_results.json';

describe('Fairclough five-node data contract', () => {
  it('accepts the measured conic solution and rejects corrupt or unconverged results', () => {
    expect(validateLayout(result.layout).volume).toBeCloseTo(13.8394,4);
    for (const bad of [null, {}, {...result.layout,volume:NaN}, {...result.layout,primal_residual:1}, {...result.layout,curves:[]}]) {
      expect(()=>validateLayout(bad)).toThrow();
    }
  });
  it('shows the computed section and plan without changing the layout', () => {
    for (const plan of [true,false]) {
      const view=viewerData(result.layout.curves,plan);
      expect(view.xy).toHaveLength(264);
      expect(view.cells).toHaveLength(256);
      expect(view.values).toHaveLength(132);
      expect(view.range.min).toBeGreaterThan(0);
      expect(Math.max(...view.cells)).toBe(131);
    }
    expect(Math.max(...viewerData(result.layout.curves,false).xy.filter((_,i)=>i%2))).toBeCloseTo(result.layout.nodes[4][2],5);
  });
  it('exports the exact production-engine geometry, sections and explicit weight loads', async () => {
    const input=result.engine_input;
    const compact=editorModel(input,'Research');
    expect(compact.n).toHaveLength(129);
    expect(compact.e).toHaveLength(128);
    expect(compact.s).toHaveLength(4);
    expect(compact.mt[0][4]).toBe(0);
    for (const node of compact.n) expect(node.slice(1)).toEqual([input.nodes[String(node[0]) as keyof typeof input.nodes].x,input.nodes[String(node[0]) as keyof typeof input.nodes].y,input.nodes[String(node[0]) as keyof typeof input.nodes].z]);
    const sum=compact.l.reduce((n,l)=>n+l.data.fz,0);
    expect(sum).toBeCloseTo(result.engine.vertical_load,10);
    expect(compact.l.every(l=>l.type==='nodal3d' && l.data.caseId===1)).toBe(true);
    const hash=await editorHash(input,'Research');
    const bytes=Uint8Array.from(atob(hash.slice(8).replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
    expect(JSON.parse(new TextDecoder().decode(inflateSync(bytes)))).toEqual(compact);
    const snapshot=decompressSnapshot(hash.slice('#data='.length));
    expect(snapshot?.nodes).toHaveLength(129);
    expect(snapshot?.elements).toHaveLength(128);
    expect(snapshot?.loads).toEqual(compact.l);
    expect(snapshot?.loadCases).toEqual(compact.lc);
  });
  it('provides all article and control text in three locales', () => {
    for (const locale of ['es','pt'] as const) {
      expect(Object.keys(translations[locale]).sort()).toEqual(Object.keys(translations.en).sort());
      for (const key of Object.keys(translations.en) as (keyof typeof translations.en)[]) expect(translations[locale][key].length).toBeGreaterThan(0);
      expect(translations[locale].missing).not.toBe(translations.en.missing);
    }
  });
});
