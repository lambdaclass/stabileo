/**
 * The cube's menu: the camera, the view's tools and, in Basic, the bars as lines or with their
 * sections, each a choice once; PRO draws the bars from its View panel, which the menu opens.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import ViewMenu3D from '../ViewMenu3D.svelte';
import { setLocale } from '../../lib/i18n';
import { uiStore } from '../../lib/store/ui.svelte';
import { basicBarStyle } from '../../lib/viewport3d/view-menu';

const noop = () => {};
const menu = (pro: boolean) => render(ViewMenu3D, { props: { pro, onfit: noop, onview: noop, onprojection: noop, onclose: noop } }).body;
const ids = (html: string) => [...html.matchAll(/data-testid="([^"]+)"/g)].map((m) => m[1]);
const text = (html: string) => html.replace(/<!--[^>]*-->/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

afterEach(() => { setLocale('en'); uiStore.analysisMode = '3d'; uiStore.renderMode3D = 'wireframe'; });

describe('the view menu', () => {
  it('in Basic, offers the bars once, as lines or with their sections', () => {
    setLocale('es');
    uiStore.analysisMode = '3d';
    const html = menu(false);
    expect(ids(html)).toEqual(['cam-menu-pop', 'cam-fit', 'cam-view-top', 'cam-view-front', 'cam-view-side', 'cam-projection-perspective', 'cam-projection-orthographic', 'nav-plan-view', 'cam-clipping', 'cam-measure', 'cam-build-timelapse', 'cam-render', 'cam-bars-lines', 'cam-bars-sections']);
    const words = text(html);
    for (const gone of ['Modelo de barras gruesas', 'Geometría física', 'Cambiar a ortográfica', 'Activar plano de corte']) expect(words).not.toContain(gone);
    expect(words).toContain('Perspectiva');
    expect(words).toContain('Plano de corte');
  });

  it('in PRO, leaves how the bars are drawn to its View panel and opens it', () => {
    uiStore.analysisMode = 'pro';
    const html = menu(true);
    expect(ids(html)).not.toContain('cam-render');
    expect(ids(html)).toContain('cam-more-view');
    expect(text(html)).not.toMatch(/Physical geometry|Thick bar model/);
  });

  it('marks the bar choice the model is shown in, the thick lines as lines and the physical geometry as sections', () => {
    uiStore.analysisMode = '3d';
    expect([basicBarStyle('wireframe'), basicBarStyle('solid'), basicBarStyle('sections'), basicBarStyle('physical')]).toEqual(['lines', 'lines', 'sections', 'sections']);
    uiStore.renderMode3D = 'physical';
    expect(menu(false)).toMatch(/aria-checked="true"[^>]*data-testid="cam-bars-sections"/);
  });
});
