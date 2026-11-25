import { afterEach, describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import ViewMenu3D from '../ViewMenu3D.svelte';
import { setLocale } from '../../lib/i18n';
import { uiStore } from '../../lib/store/ui.svelte';
import { barStyle } from '../../lib/viewport3d/view-menu';

const noop = () => {};
const menu = (pro: boolean) => render(ViewMenu3D, { props: { pro, onfit: noop, onview: noop, onprojection: noop, onclose: noop } }).body;
const ids = (html: string) => [...html.matchAll(/data-testid="([^"]+)"/g)].map((m) => m[1]);
const text = (html: string) => html.replace(/<!--[^>]*-->/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const CAMERA = ['cam-menu-pop', 'cam-fit', 'cam-view-top', 'cam-view-front', 'cam-view-side', 'cam-projection-perspective', 'cam-projection-orthographic', 'nav-plan-view', 'cam-clipping', 'cam-measure', 'cam-build-timelapse', 'cam-render', 'cam-bars-lines', 'cam-bars-sections'];

afterEach(() => { setLocale('en'); uiStore.analysisMode = '3d'; uiStore.renderMode3D = 'wireframe'; });

describe('the view menu', () => {
  it('in Basic, offers the bars once, as lines or with their sections', () => {
    setLocale('es');
    uiStore.analysisMode = '3d';
    const html = menu(false);
    expect(ids(html)).toEqual(CAMERA);
    const words = text(html);
    for (const gone of ['Modelo de barras gruesas', 'Geometría física', 'Cambiar a ortográfica', 'Activar plano de corte']) expect(words).not.toContain(gone);
    expect(words).toContain('Perspectiva');
    expect(words).toContain('Plano de corte');
    expect(words).toContain('Barras');
  });

  it('in PRO, offers the bars and plates as lines or with their sections, and opens the View panel for the rest', () => {
    setLocale('es');
    uiStore.analysisMode = 'pro';
    const html = menu(true);
    expect(ids(html)).toEqual([...CAMERA, 'cam-more-view']);
    expect(text(html)).toContain('Barras y placas');
    expect(text(html)).not.toMatch(/Geometría física|barras gruesas/);
  });

  it('marks the thick lines as lines', () => {
    uiStore.analysisMode = '3d';
    expect([barStyle('wireframe'), barStyle('solid'), barStyle('sections')]).toEqual(['lines', 'lines', 'sections']);
    uiStore.renderMode3D = 'solid';
    expect(menu(false)).toMatch(/aria-checked="true"[^>]*data-testid="cam-bars-lines"/);
  });
});
