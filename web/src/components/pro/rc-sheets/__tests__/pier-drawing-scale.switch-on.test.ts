import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import RcWallDetail from '../RcWallDetail.svelte';
import RcPierSection from '../RcPierSection.svelte';
import type { WallRow } from '../../../../lib/rc-sheets/wall-row';
import type { WallAdopted } from '../../../../lib/rc-sheets/types';

const adopted: WallAdopted = { vertical: { diameter: 10, spacing: 0.2 }, horizontal: { diameter: 8, spacing: 0.2 }, curtains: 2 };
const B = 0.4, H = 0.6, L = 3, T = 0.2;
const outline = [{ x: -B / 2, y: T / 2 - H / 2 }, { x: B / 2, y: T / 2 - H / 2 }, { x: B / 2, y: T / 2 + H / 2 }, { x: -B / 2, y: T / 2 + H / 2 }];
const bars = [[-0.15, -0.15], [0.15, -0.15], [0.15, 0.35], [-0.15, 0.35]].map(([x, y]) => ({ x: x!, y: y!, dia: 16 }));
const row = {
  family: 'wall', key: 'wall:1:0', name: 'M1', level: 'N0', length: L, height: 3, thickness: T, cover: 0.025, hLap: 0.4, adopted,
  demand: { key: 'wall:1:0', name: 'M1', length: L, height: 3, thickness: T, combos: [], plan: { x1: 2, y1: 5, x2: 2, y2: 5 + L } },
  pier: { key: 'pier:wall:1:0', name: 'M1 + C1', ratio: 0.4, ok: true, combo: 'U1', columns: [{ key: 'column:1:0', name: 'C1', host: true, outline, bars, tieDia: 8, tieSpacing: 0.15, label: '4 Ø16' }] },
} as unknown as WallRow;

const num = (s: string, attr: string) => Number(new RegExp(`\\b${attr}="([-\\d.e]+)"`).exec(s)![1]);
const svgs = (html: string, testid: string) => [...html.matchAll(new RegExp(`<svg[^>]*data-testid="${testid}"[\\s\\S]*?</svg>`, 'g'))].map((m) => m[0]);
const polygon = (svg: string, testid: string) => {
  const pts = /<polygon points="([^"]+)"[^>]*data-testid="([^"]+)"/g;
  for (let m = pts.exec(svg); m; m = pts.exec(svg)) if (m[2] === testid) return m[1]!.trim().split(' ').map((p) => p.split(',').map(Number) as [number, number]);
  throw new Error(`no ${testid}`);
};
const extent = (ps: Array<[number, number]>) => ({ w: Math.max(...ps.map((p) => p[0])) - Math.min(...ps.map((p) => p[0])), h: Math.max(...ps.map((p) => p[1])) - Math.min(...ps.map((p) => p[1])) });

describe('a pier\'s wall drawn in plan', () => {
  const html = render(RcWallDetail, { props: { row, code: 'aci318-19' } }).body;

  it('draws its length and thickness and the column inside it at one scale, the column b × h as it is', () => {
    const views = [...svgs(html, 'rc-wall-plan'), ...svgs(html, 'rc-wall-plan-detail')];
    expect(views.length).toBeGreaterThan(1);
    for (const svg of views) {
      const k = num(svg, 'data-scale');
      const wall = /<rect x="[^"]+" y="[^"]+" width="([^"]+)" height="([^"]+)" class="conc[^"]*"/.exec(svg)!;
      expect(Number(wall[1]) / k).toBeCloseTo(L, 6);
      expect(Number(wall[2]) / k).toBeCloseTo(T, 6);
      const c = extent(polygon(svg, 'rc-wall-plan-column'));
      expect(c.w / c.h).toBeCloseTo(B / H, 6);
      expect(c.w / k).toBeCloseTo(B, 6);
      expect(c.h / k).toBeCloseTo(H, 6);
    }
  });

  it('names the column with its size', () => {
    expect(html).toContain('C1 40×60');
  });

  it('magnifies a thin wall in a detail at a larger scale, never in one direction', () => {
    const [all] = svgs(html, 'rc-wall-plan'), [detail] = svgs(html, 'rc-wall-plan-detail');
    expect(num(detail!, 'data-scale')).toBeGreaterThan(1.3 * num(all!, 'data-scale'));
  });
});

describe('a pier drawn whole', () => {
  it('draws the column at its b × h and the walls at the same scale, where the model has them', () => {
    const html = render(RcPierSection, { props: { name: 'M1 + C1', walls: [row], code: 'aci318-19' } }).body;
    const k = num(html, 'data-scale');
    const c = extent(polygon(html, 'rc-pier-section-column'));
    const w = extent(polygon(html, 'rc-pier-section-wall'));
    expect(c.w / k).toBeCloseTo(H, 6);
    expect(c.h / k).toBeCloseTo(B, 6);
    expect(w.w / k).toBeCloseTo(T, 6);
    expect(w.h / k).toBeCloseTo(L, 6);
    expect(html).toContain('C1 40×60');
  });
});
