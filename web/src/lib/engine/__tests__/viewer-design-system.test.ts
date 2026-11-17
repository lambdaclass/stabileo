/**
 * The 3-D workspace belongs to Stabileo's design system, and stays in it.
 *
 * ── The report this pins ───────────────────────────────────────────
 *
 * "El visor 3D parece una aplicación distinta del resto de Stabileo."
 *
 * It was, mechanically. The workspace and its four child panels make thirty `var()` calls
 * against `--text`, `--text-muted`, `--st-border` and `--panel` — and not one of those custom
 * properties was defined anywhere in the application. Every call fell through to a hard-coded
 * fallback, so the whole 3-D surface painted itself from a private literal palette that no
 * token could reach. Not a different palette by choice: a palette that was never written.
 *
 * `.workspace` now defines the four as aliases of the real tokens. Custom properties inherit
 * through the DOM, so every child picks them up without a line changing in any of them.
 *
 * These are source assertions rather than rendered ones on purpose. The defect was invisible at
 * runtime — the fallbacks made it look deliberate — and a screenshot would have agreed with it.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const DESIGN = path.resolve(__dirname, '../../../components/pro/design');
const read = (f: string) => fs.readFileSync(path.join(DESIGN, f), 'utf8');

/** The viewer surfaces that render inside the workspace overlay. */
const VIEWER_PANELS = [
  'RebarWorkspace.svelte',
  'RebarLayersPanel.svelte',
  'RebarStatusPanel.svelte',
  'SelectionDetails.svelte',
  'RebarViewport3D.svelte',
];

/** The namespace that was never defined. */
const PHANTOM = ['--text', '--text-muted', '--st-border', '--panel'];

describe('the 3-D workspace speaks the application design system', () => {
  it('defines every custom property its panels reach for', () => {
    const ws = read('RebarWorkspace.svelte');
    for (const name of PHANTOM) {
      // Declared, not merely consumed: `name:` with a value, inside the workspace rule.
      const declared = new RegExp(`${name}\\s*:\\s*var\\(--st-`).test(ws);
      expect(declared, `${name} is used by the viewer and must be defined on .workspace`)
        .toBe(true);
    }
  });

  it('maps each of them onto a real token, not onto another literal', () => {
    const ws = read('RebarWorkspace.svelte');
    const tokens = fs.readFileSync(path.resolve(__dirname, '../../../styles/tokens.css'), 'utf8');
    for (const name of PHANTOM) {
      const m = ws.match(new RegExp(`${name}\\s*:\\s*var\\((--st-[a-z0-9-]+)\\)`));
      expect(m, `${name} must alias an --st-* token`).not.toBeNull();
      const target = m![1];
      // An alias to a token that does not exist would reinstate the bug one level down.
      expect(tokens, `${target} must be defined in tokens.css`).toContain(`${target}:`);
    }
  });

  it('anchors the overlay itself on tokens rather than on a literal ground', () => {
    const ws = read('RebarWorkspace.svelte');
    const rule = ws.slice(ws.indexOf('.workspace {'), ws.indexOf('.workspace:focus'));
    expect(rule).toContain('background: var(--st-bg)');
    expect(rule).toContain('color: var(--st-text)');
  });

  it('leaves the state colours alone, because Three.js owns them', () => {
    /**
     * Provisional violet is the case that matters. `three/rebar-scene.ts` feeds `0xa066d3` to
     * a material and cannot read a custom property, and `run-summary-reported.test.ts` asserts
     * the overview's provisional chip agrees with it BY VALUE. Aliasing the panel copies would
     * let the picture and the words beside it drift apart, which is the one thing the colour
     * exists to prevent.
     */
    const scene = fs.readFileSync(
      path.resolve(__dirname, '../../three/rebar-scene.ts'), 'utf8');
    expect(scene, 'the authority stays a numeric hex').toContain('0xa066d3');
    // And the surfaces that name the same state still carry the same value.
    expect(read('RebarStatusPanel.svelte')).toContain('#a066d3');
  });

  it('carries no rule for markup that has moved into a child component', () => {
    /**
     * Twenty-six rules in `RebarWorkspace` styled the rail's headings, labels, sliders, tally
     * table and inspector list after that markup had been extracted into child components.
     * Svelte scopes styles to the declaring component, so they matched nothing and were
     * reported as unused on every build — and a rule that outlives its markup is a decoy the
     * next person edits expecting an effect.
     *
     * Checked by NAME rather than by counting warnings, so the assertion says which.
     */
    const ws = read('RebarWorkspace.svelte');
    const style = ws.slice(ws.lastIndexOf('<style>'));
    const moved = [
      '.tally table', '.tally th', '.tally td', '.tally h5',
      '.inspector dt', '.inspector dd', '.sel-status', '.sel-actions',
      '.empty-families', '.section-cut button',
    ];
    for (const sel of moved) {
      expect(style, `${sel} belongs to a child component now`).not.toContain(`${sel} {`);
    }
  });

  it('keeps the fallbacks, so a bypassed overlay degrades rather than breaks', () => {
    // Belt and braces: if this element is ever skipped, the panels render in their old
    // literals — uglier, still legible. Removing the fallbacks would turn a styling
    // regression into unreadable text.
    for (const f of VIEWER_PANELS) {
      const src = read(f);
      const calls = src.match(/var\(--(?:text|text-muted|st-border|panel)\b[^)]*\)/g) ?? [];
      for (const call of calls) {
        expect(call, `${f}: ${call} should keep its fallback`).toMatch(/,\s*[^)]+\)$/);
      }
    }
  });
});
