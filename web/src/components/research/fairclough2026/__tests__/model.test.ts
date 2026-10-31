import { describe, expect, it } from 'vitest';
import { decompressSnapshot } from '../../../../lib/utils/url-sharing';
import { inflateSync } from 'fflate';
import { editorHash, editorModel, validateLayout, viewerData } from '../model';
import { PUBLIC_LOCALES } from '../../../../lib/i18n/store.svelte';
import { translations } from '../i18n';
import result from '../../../../../../research/optimisation/fairclough-2026/results/stabileo_results.json';

describe('Fairclough five-node data contract', () => {
  it('accepts the measured conic solution and rejects corrupt or unconverged results', () => {
    expect(validateLayout(result.layout).volume).toBeCloseTo(13.8394,4);
    for (const bad of [null, {}, {...result.layout,volume:NaN}, {...result.layout,primal_residual:1}, {...result.layout,curves:[]}]) {
      expect(()=>validateLayout(bad)).toThrow();
    }
  });
  it('rejects altered geometry and negative residuals but accepts signed end forces', () => {
    for (const field of ['nodes','edges','forces','curves'] as const) {
      const value = structuredClone(result.layout);
      if (field === 'curves') value.curves[0][0][3] = -1;
      else value[field][0][0] += 1;
      expect(()=>validateLayout(value)).toThrow();
    }
    for (const field of ['primal_residual','dual_residual']) expect(()=>validateLayout({...result.layout,[field]:-1})).toThrow();
    expect(result.layout.forces.some(f=>f[2]<0)).toBe(true);
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
    expect(compact.mt).toEqual([[1,'Research',input.materials['1'].e,input.materials['1'].nu,0]]);
    expect(compact.sc).toEqual(Object.values(input.sections).map(s=>[s.id,'Research',s.a,s.iz,{iy:s.iy,j:s.j}]));
    expect(compact.e).toEqual(Object.values(input.elements).map(e=>[e.id,0,e.nodeI,e.nodeJ,e.materialId,e.sectionId]));
    expect(Object.values(input.elements).every(e=>e.type==='frame')).toBe(true);
    expect(compact.s).toEqual(Object.values(input.supports).map((s,i)=>[i+1,s.nodeId,'pinned']));
    expect(Object.values(input.supports).every(s=>s.rx && s.ry && s.rz && !s.rrx && !s.rry && !s.rrz)).toBe(true);
    expect(compact.l).toEqual(input.loads.map((l,i)=>({type:'nodal3d',data:{...l.data,id:i+1,caseId:1}})));
    const hash=await editorHash(input,'Research');
    const bytes=Uint8Array.from(atob(hash.slice(8).replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
    expect(JSON.parse(new TextDecoder().decode(inflateSync(bytes)))).toEqual(compact);
    const snapshot=decompressSnapshot(hash.slice('#data='.length));
    expect(snapshot?.nodes).toHaveLength(129);
    expect(snapshot?.elements).toHaveLength(128);
    expect(snapshot?.nodes).toEqual(Object.values(input.nodes).map(n=>[n.id,n]));
    expect(snapshot?.materials).toEqual([[1,{...input.materials['1'],name:'Research',rho:0}]]);
    expect(snapshot?.sections).toEqual(Object.values(input.sections).map(s=>[s.id,{...s,name:'Research'}]));
    const release = {t:false,my:false,mz:false};
    expect(snapshot?.elements).toEqual(Object.values(input.elements).map(e=>[e.id,{...e,releaseI:release,releaseJ:release}]));
    expect(snapshot?.supports).toEqual(Object.values(input.supports).map((s,i)=>[i+1,{id:i+1,nodeId:s.nodeId,type:'pinned'}]));
    expect(snapshot?.loads).toEqual(compact.l);
    expect(snapshot?.loadCases).toEqual(compact.lc);
  });
  it('provides all article and control text in all public locales', () => {
    for (const locale of PUBLIC_LOCALES) {
      expect(Object.keys(translations[locale]).sort()).toEqual(Object.keys(translations.en).sort());
      for (const key of Object.keys(translations.en) as (keyof typeof translations.en)[]) expect(translations[locale][key].length).toBeGreaterThan(0);
      if (locale !== 'en') expect(translations[locale].missing).not.toBe(translations.en.missing);
    }
  });
});

it('uses the selected public language for the page and its shared shell', async () => {
  const { setLocale, publicI18n } = await import('../../../../lib/i18n/store.svelte');
  const { researchLocale, rs } = await import('../../i18n');
  const { fs } = await import('../i18n');
  const original = publicI18n.locale;
  try {
    for (const locale of PUBLIC_LOCALES) {
      setLocale(locale);
      expect(researchLocale()).toBe(locale);
      expect(fs()).toBe(translations[locale]);
      expect(rs().notDesign).not.toBe('');
      if (locale !== 'en') expect(rs().notDesign).not.toBe('Research, not a design tool');
    }
  } finally { setLocale(original); }
});
