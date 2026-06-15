/**
 * PR [12] Basic-mode UX gates.
 *
 * Covers:
 *  - Task 1: Basic "Local axes" config (one control in Basic, member+shell only in PRO)
 *            + the projected-2D member-axes basis used by the viewport.
 *  - Task 2: Select → Stresses button removed; Advanced → Section Analysis kept.
 *  - Task 4: smoke — Section Analysis remains reachable via Advanced Analysis.
 *
 * UI structure is asserted via source inspection (this repo has no DOM/component
 * test harness; see convention-regression-gates.test.ts for the same pattern).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeLocalAxes3D } from '../local-axes-3d';

const __dirname = dirname(fileURLToPath(import.meta.url));
const read = (p: string) => readFileSync(resolve(__dirname, p), 'utf8');

// ─── Task 1: config UI ────────────────────────────────────────────
describe('Task 1 — Basic Local axes config', () => {
  const cfg = read('../../../components/toolbar/ToolbarConfig.svelte');

  it('Basic shows a single "Local axes" control; PRO keeps the members label', () => {
    expect(cfg).toContain("isPro ? t('config.localAxesMembers') : t('config.localAxes')");
  });

  it('the shells control is gated to PRO only', () => {
    expect(cfg).toContain('{#if isPro}');
    expect(cfg).toContain("t('config.localAxesShells')");
    // shells select must live inside the isPro branch (after the gate)
    expect(cfg.indexOf('{#if isPro}')).toBeLessThan(cfg.indexOf("t('config.localAxesShells')"));
  });

  it('the member Local-axes control is no longer gated behind {#if is3D} (works in Basic 2D)', () => {
    // The members <select> binds localAxesMode3D and must appear OUTSIDE an is3D gate.
    // (is3D still gates the grid/axes 3D specifics, but not the local-axes control.)
    const membersIdx = cfg.indexOf('uiStore.localAxesMode3D');
    const is3dGateIdx = cfg.indexOf('{#if is3D}');
    // Either there is no is3D gate at all, or the members control precedes any such gate.
    expect(is3dGateIdx === -1 || membersIdx < is3dGateIdx).toBe(true);
  });
});

// ─── Task 1: scene-sync projected wiring + 2D canvas drawing ───────
describe('Task 1 — local-axes display wiring', () => {
  it('syncLocalAxes builds triads from PROJECTED scene coords (no projected-model bail)', () => {
    const ss = read('../../viewport3d/scene-sync.ts');
    expect(ss).toContain('projectNodeToScene(nI, project2D)');
    expect(ss).toContain('projectNodeToScene(nJ, project2D)');
    // The old early-return that hid triads on projected (2D-in-3D) models is gone.
    expect(ss).not.toContain('restrict triads to genuine (non-projected) 3D views');
  });

  it('Viewport 2D draws member local axes (x + z, NOT y) from the unified setting', () => {
    const vp = read('../../../components/Viewport.svelte');
    expect(vp).toContain('drawLocalAxes2D');
    expect(vp).toContain('uiStore.localAxesMode3D');
    // Uses the same 3D basis as the triad, projected to X-Z.
    expect(vp).toContain('computeLocalAxes3D');
    // The two in-plane labels are x and z (the vertical/perpendicular axis is z).
    expect(vp).toContain("showLabel ? 'x' : ''");
    expect(vp).toContain("showLabel ? 'z' : ''");
    // Readable label font (≥12px), not the old tiny 9px.
    expect(vp).toContain("'bold 13px sans-serif'");
    expect(vp).not.toContain("'bold 9px sans-serif'");
  });

  it('projected 2D horizontal member → x along member, z is up (+world-y / 3D z)', () => {
    // 2D (0,0)→(8,0) embeds to 3D (0,0,0)→(8,0,0). Canvas dirs use (ex.x, ex.z) & (ez.x, ez.z).
    const ax = computeLocalAxes3D({ id: 0, x: 0, y: 0, z: 0 }, { id: 0, x: 8, y: 0, z: 0 }, undefined, undefined, false);
    // x along member (canvas +x), z vertical (canvas +up)
    expect([ax.ex[0], ax.ex[2]]).toEqual([expect.closeTo(1, 6), expect.closeTo(0, 6)]);
    expect([ax.ez[0], ax.ez[2]]).toEqual([expect.closeTo(0, 6), expect.closeTo(1, 6)]);
  });

  it('projected 2D vertical member → x follows member (up), z perpendicular (horizontal)', () => {
    // 2D column (0,0)→(0,5) embeds to 3D (0,0,0)→(0,0,5): ex = +Z.
    const ax = computeLocalAxes3D({ id: 0, x: 0, y: 0, z: 0 }, { id: 0, x: 0, y: 0, z: 5 }, undefined, undefined, false);
    const exCanvas = [ax.ex[0], ax.ex[2]]; // along member → vertical on canvas
    const ezCanvas = [ax.ez[0], ax.ez[2]]; // perpendicular → horizontal on canvas
    expect(Math.abs(exCanvas[1])).toBeCloseTo(1, 6); // x is vertical (along the column)
    expect(Math.abs(exCanvas[0])).toBeCloseTo(0, 6);
    expect(Math.abs(ezCanvas[0])).toBeCloseTo(1, 6); // z is horizontal (in-plane perpendicular)
    expect(Math.abs(ezCanvas[1])).toBeCloseTo(0, 6);
  });

  it('projected 2D diagonal member → ez stays in the X-Z plane (in-plane perpendicular)', () => {
    // 2D (0,0)→(3,4) → 3D (0,0,0)→(3,0,4). ez must have no out-of-plane (global Y) part.
    const ax = computeLocalAxes3D({ id: 0, x: 0, y: 0, z: 0 }, { id: 0, x: 3, y: 0, z: 4 }, undefined, undefined, false);
    expect(Math.abs(ax.ez[1])).toBeLessThan(1e-6); // in-plane (no global-Y component)
    expect(Math.abs(ax.ex[1])).toBeLessThan(1e-6); // member also in-plane
    // ez perpendicular to ex
    expect(ax.ex[0] * ax.ez[0] + ax.ex[2] * ax.ez[2]).toBeCloseTo(0, 6);
  });
});

// ─── Task 2 + Task 4 smoke: stress entry points ───────────────────
describe('Task 2 — Select→Stresses removed, Advanced→Section Analysis kept', () => {
  it('the Select sub-tool no longer offers a stress option', () => {
    const sel = read('../../../components/floating-tools/ToolSelectOptions.svelte');
    expect(sel).not.toContain("id: 'stress'");
    expect(sel).not.toContain("'float.selectStress'");
  });

  it("Advanced Analysis → Section Analysis still activates stress mode (selectMode='stress')", () => {
    const adv = read('../../../components/toolbar/ToolbarAdvanced.svelte');
    expect(adv).toContain("t('advanced.sectionAnalysis')");
    expect(adv).toContain("uiStore.selectMode = 'stress'");
  });

  it("SelectMode type still includes 'stress' (used by the Advanced path)", () => {
    const ui = read('../../store/ui.svelte.ts');
    expect(ui).toMatch(/SelectMode\s*=[^;]*'stress'/);
  });
});
