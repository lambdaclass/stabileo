<script lang="ts">
  import { t, tp } from '../../lib/i18n';
  import { scalarFieldScale } from './scalar-field-scale';
  /**
   * The 3D viewport's look and navigation showing one scalar field on a 2D mesh, for views that
   * have a mesh and a field but no editor model (research experiments). Shares the app's scene
   * setup, orbit controls, shell contour colours and legend, axis triad, camera menu and status
   * bar styles.
   *
   * Navigation as in the app: left drag orbits (in 3D), right drag pans, the wheel zooms to the
   * pointer. "2D" is the app's plan view: looking down at the XY plane, orbit locked.
   */
  import { onDestroy, onMount, untrack, type Snippet } from 'svelte';
  import * as THREE from 'three';
  import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';
  import '../../styles/viewer-chrome.css';
  import {
    addViewerLights,
    applyDefaultNavigation,
    createViewerControls,
    createViewerPerspectiveCamera,
    createViewerRenderer,
    createViewerScene,
  } from '../../lib/viewport3d/scene-setup';
  import { createFrameCoalescer } from '../../lib/viewport3d/frame-coalesce';
  import { drawAxisGizmoOn } from '../../lib/viewport3d/axis-gizmo';
  import { type ScalarFieldMesh } from '../../lib/three/scalar-field-mesh';
  import { ScalarFieldScene } from '../../lib/three/scalar-field-scene';
  import type { ColourMap } from '../../lib/three/colour-maps';
  import Icon from '../ribbon/Icon.svelte';
  import ContourLegend from './ContourLegend.svelte';

  type Props = {
    /** Node coordinates [x0, y0, x1, y1, ...]. */
    xy: ArrayLike<number>;
    /** Cell connectivity, `cellSize` nodes per cell (counter-clockwise). */
    cells: ArrayLike<number>;
    /** 4 quads, 3 triangles, 2 line elements (bars, springs). */
    cellSize?: 2 | 3 | 4;
    /** Width in pixels of line elements. */
    lineWidth?: number;
    /** The field: one value per node, or per cell with `perCell`. */
    values: ArrayLike<number> | null;
    /** Default hides missing fields; geometry draws a neutral mesh without a legend. */
    displayMode?: 'field' | 'geometry';
    /** Expose actual draw statistics and geometry bounds for rendering regression checks. */
    renderDiagnostics?: boolean;
    perCell?: boolean;
    range: { min: number; max: number };
    title: string;
    unit?: string;
    legendFooter?: string;
    bands?: number;
    /** 'shell' (the app's contours), 'sequential' (viridis) or 'diverging' (symmetric about 0). */
    colourMap?: ColourMap;
    /** Nodal displacements [ux0, uy0, ...] drawn at `deformScale`; null for the undeformed mesh. */
    displacement?: ArrayLike<number> | null;
    deformScale?: number;
    showMesh?: boolean;
    /** Cells to leave out (for instance fully broken elements). */
    hideCell?: ((cell: number) => boolean) | null;
    /** The region [xmin, ymin, xmax, ymax] the camera fits when it changes. */
    view?: [number, number, number, number] | null;
    height?: string;
    ariaLabel?: string;
    /** Items for the status bar under the canvas, after position and zoom. */
    status?: { label: string; value: string }[];
    /** A control row above the canvas (the experiment's results buttons). */
    toolbar?: Snippet;
    /** What "Open in the editor" does; absent shows it as coming. */
    onOpenEditor?: (() => void) | null;
    openEditorNote?: string;
    /** Show the status bar's "Open in the editor" button (false when the page offers its own editor). */
    editorButton?: boolean;
    /** Geometry overlays use colour categories, not a physical scalar field. */
    geometryOnly?: boolean;
  };
  let {
    xy,
    cells,
    cellSize = 4,
    lineWidth = 3,
    values,
    displayMode = 'field',
    renderDiagnostics = false,
    perCell = false,
    range,
    title,
    unit = '',
    legendFooter = '',
    bands = 0,
    colourMap = 'shell',
    displacement = null,
    deformScale = 1,
    showMesh = true,
    hideCell = null,
    view = null,
    height = '28rem',
    ariaLabel = title,
    status = [],
    toolbar,
    onOpenEditor = null,
    openEditorNote,
    editorButton = true,
    geometryOnly = false,
  }: Props = $props();

  let container: HTMLDivElement;
  let gizmo: HTMLCanvasElement;
  let renderer: THREE.WebGLRenderer | null = null;
  let camera: THREE.PerspectiveCamera;
  let controls: OrbitControls;
  let scene: THREE.Scene;
  let meshScene: ScalarFieldScene;
  let field = $state.raw<ScalarFieldMesh | null>(null);
  let mounted = $state(false);
  let ro: ResizeObserver | null = null;
  let damping = 0;
  let pendingFit = true;
  let projection = $state<'plan' | 'orbit'>('plan');
  let menuOpen = $state(false);
  let pointer = $state<string>('—');
  let zoomText = $state<string>('—');
  const frame = createFrameCoalescer<void>(() => render());

  function render() {
    if (!renderer) return;
    controls.update();
    renderer.render(scene, camera);
    if (renderDiagnostics) {
      const canvas = renderer.domElement;
      canvas.dataset.renderedTriangles = String(renderer.info.render.triangles);
      const box = field ? new THREE.Box3().setFromObject(field.group) : new THREE.Box3();
      canvas.dataset.geometryBounds = JSON.stringify([box.min.toArray(), box.max.toArray()]);
    }
    drawAxisGizmoOn(gizmo, camera);
    if (damping > 0) {
      damping -= 1;
      frame.schedule();
    }
  }
  function invalidate() {
    damping = 12;
    frame.schedule();
  }

  function bounds(): [number, number, number, number] {
    if (view) return view;
    let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
    for (let i = 0; i < xy.length; i += 2) {
      const x = xy[i] + deformScale * (displacement?.[i] ?? 0);
      const y = xy[i + 1] + deformScale * (displacement?.[i + 1] ?? 0);
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
    }
    return [x0, y0, x1, y1];
  }

  /** Fit the region: in the plan view the app's top view (tipped 1° so Z stays the orbit axis), in 3D an oblique view. */
  export function fit() {
    if (!renderer) return;
    pendingFit = true;
    if (container.clientWidth <= 0 || container.clientHeight <= 0) return;
    pendingFit = false;
    const [x0, y0, x1, y1] = bounds();
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    const w = Math.max(1e-9, x1 - x0);
    const h = Math.max(1e-9, y1 - y0);
    const aspect = container.clientWidth / Math.max(1, container.clientHeight);
    const fov = THREE.MathUtils.degToRad(camera.fov);
    const dist = (1.08 * Math.max(h, w / aspect)) / 2 / Math.tan(fov / 2);
    if (projection === 'plan') {
      const tip = 0.018;
      camera.position.set(cx, cy - dist * Math.sin(tip), dist * Math.cos(tip));
    } else {
      camera.position.set(cx + dist * 0.45, cy - dist * 0.75, dist * 0.6);
    }
    camera.near = dist / 1000;
    camera.far = dist * 100;
    camera.updateProjectionMatrix();
    controls.target.set(cx, cy, 0);
    controls.enableRotate = projection === 'orbit';
    camera.lookAt(cx, cy, 0);
    updateZoom();
    invalidate();
  }

  function setProjection(m: 'plan' | 'orbit') {
    projection = m;
    menuOpen = false;
    fit();
  }

  function resize() {
    if (!renderer) return;
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h);
    field?.setResolution(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    if (pendingFit) fit();
    updateZoom();
    invalidate();
  }

  const ray = new THREE.Raycaster();
  const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  function onPointerMove(e: PointerEvent) {
    if (!renderer) return;
    const r = renderer.domElement.getBoundingClientRect();
    ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
    const p = new THREE.Vector3();
    if (ray.ray.intersectPlane(plane, p)) pointer = `(${p.x.toFixed(4)}, ${p.y.toFixed(4)})`;
  }

  function updateZoom() {
    if (!renderer) return;
    const d = camera.position.distanceTo(controls.target);
    zoomText = scalarFieldScale(container.clientHeight, d, camera.fov);
  }

  onMount(() => {
    scene = createViewerScene();
    meshScene = new ScalarFieldScene(scene);
    addViewerLights(scene);
    camera = createViewerPerspectiveCamera();
    renderer = createViewerRenderer(container);
    controls = createViewerControls(camera, renderer.domElement);
    applyDefaultNavigation(controls);
    controls.addEventListener('change', () => {
      const d = camera.position.distanceTo(controls.target);
      camera.near = Math.max(1e-9, d / 1000);
      camera.far = d * 100;
      camera.updateProjectionMatrix();
      updateZoom();
      frame.schedule();
    });
    controls.addEventListener('start', invalidate);
    renderer.domElement.addEventListener('pointermove', onPointerMove);
    mounted = true;
    ro = new ResizeObserver(resize);
    ro.observe(container);
    resize();
    fit();
    updateZoom();
  });

  onDestroy(() => {
    ro?.disconnect();
    controls?.dispose();
    renderer?.dispose();
    renderer?.domElement.remove();
    renderer = null;
  });

  $effect(() => {
    if (!mounted) return;
    field = meshScene.rebuild(xy, cells, cellSize, lineWidth);
    untrack(() => { resize(); fit(); });
    return () => meshScene.dispose();
  });

  $effect(() => {
    if (!field) return;
    field.group.visible = displayMode === 'geometry' || values !== null;
    if (displayMode === 'geometry') field.setUncoloured();
    else if (values) field.setField(values, range, { perCell, bands, colourMap });
    invalidate();
  });
  $effect(() => {
    if (!field) return;
    field.setDisplacement(displacement, deformScale);
    invalidate();
  });
  $effect(() => {
    if (!field) return;
    field.setHidden(hideCell);
    invalidate();
  });
  $effect(() => {
    if (!field) return;
    field.setEdgesVisible(showMesh);
    invalidate();
  });
  $effect(() => {
    void view;
    fit();
  });

  const nodeCount = $derived(xy.length / 2);
  const cellCount = $derived(cells.length / cellSize);
</script>

<div class="sfv-wrap">
  {#if toolbar}<div class="sfv-toolbar">{@render toolbar()}</div>{/if}
  <div class="sfv viewport-container" style:height>
    <div class="sfv-canvas" bind:this={container} role="img" aria-label={ariaLabel}></div>
    <canvas bind:this={gizmo} class="axis-gizmo" width="80" height="80"></canvas>
    <div class="camera-controls" style="top: 10px">
      <div class="cam-menu-wrap">
        <button class="cam-btn cam-cube" class:on={menuOpen} onclick={() => (menuOpen = !menuOpen)} title={t('scalarViewer.view')} aria-label={t('scalarViewer.viewOptions')} aria-expanded={menuOpen}>
          <Icon name="viewCube" size={17} />
          <span class="cam-caret" aria-hidden="true"></span>
        </button>
        {#if menuOpen}
          <button class="cam-backdrop" onclick={() => (menuOpen = false)} aria-label={t('scalarViewer.close')} tabindex="-1"></button>
          <div class="cam-menu">
            <button class="cam-item" onclick={() => { menuOpen = false; fit(); }}><span class="cam-glyph">⤢</span><span>{t('scalarViewer.fit')}</span></button>
            <div class="cam-sep"></div>
            <button class="cam-item" class:on={projection === 'plan'} onclick={() => setProjection('plan')}><span class="cam-glyph">⊤</span><span>{t('scalarViewer.plan')}</span></button>
            <button class="cam-item" class:on={projection === 'orbit'} onclick={() => setProjection('orbit')}><span class="cam-glyph">◇</span><span>{t('scalarViewer.orbit')}</span></button>
          </div>
        {/if}
      </div>
      <button class="sfv-mode" onclick={() => setProjection(projection === 'plan' ? 'orbit' : 'plan')} title={t('scalarViewer.switchProjection')}>{projection === 'plan' ? '2D' : '3D'}</button>
      <button class="sfv-mode" onclick={() => fit()} title={t('scalarViewer.fit')} aria-label={t('scalarViewer.fit')}>⤢</button>
    </div>
    {#if displayMode === 'field' && values && !geometryOnly}
      <ContourLegend {title} {unit} min={range.min} max={range.max} {bands} footer={legendFooter} {colourMap} />
    {/if}
    <span class="sfv-mark">{t('scalarViewer.viewer')}</span>
  </div>
  <div class="status-bar sfv-status">
    <div class="status-item"><span class="status-label">{t('scalarViewer.position')}</span><span class="status-value">{pointer}</span></div>
    <div class="status-item"><span class="status-label">{t('scalarViewer.zoom')}</span><span class="status-value">{zoomText}</span></div>
    {#if !geometryOnly}<div class="status-item"><span class="status-label">{t('scalarViewer.model')}</span><span class="status-value">{tp(cellSize === 2 ? 'scalarViewer.bars' : 'scalarViewer.elements', { nodes: nodeCount, cells: cellCount })}</span></div>{/if}
    {#each status as s (s.label)}
      <div class="status-item"><span class="status-label">{s.label}:</span><span class="status-value">{s.value}</span></div>
    {/each}
    {#if editorButton}<button class="sfv-editor" disabled={!onOpenEditor} onclick={() => onOpenEditor?.()} title={onOpenEditor ? t('scalarViewer.openEditor') : (openEditorNote ?? t('scalarViewer.editorNote'))}>{t('scalarViewer.openEditor')}{onOpenEditor ? '' : t('scalarViewer.soon')}</button>{/if}
  </div>
</div>

<style>
  .sfv-wrap {
    width: 100%;
    background: var(--st-surface, #0f1e2b);
    border: 1px solid var(--st-hair-strong, rgba(143, 163, 179, 0.38));
    border-radius: var(--st-radius-lg, 6px);
    overflow: hidden;
  }
  .sfv-toolbar {
    padding: 0.4rem 0.5rem;
    border-bottom: 1px solid var(--st-hair, rgba(143, 163, 179, 0.22));
  }
  .sfv {
    position: relative;
    width: 100%;
  }
  .sfv-canvas {
    position: absolute;
    inset: 0;
  }
  .sfv-canvas :global(canvas) {
    display: block;
    max-width: 100%;
    touch-action: none;
  }
  .sfv :global(.shell-legend) {
    bottom: 12px;
  }
  .sfv-mode {
    width: 32px;
    height: 32px;
    border: 1px solid var(--st-hair-strong);
    border-radius: var(--st-radius);
    background: color-mix(in srgb, var(--st-surface) 90%, transparent);
    color: var(--st-text-2);
    font: 600 11px var(--st-sans);
    cursor: pointer;
  }
  .sfv-mode:hover {
    background: var(--st-surface-3);
    color: var(--st-text);
  }
  .sfv-mark {
    position: absolute;
    top: 10px;
    left: 10px;
    font: 600 10px var(--st-sans);
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--st-text-3);
    pointer-events: none;
  }
  .sfv-status :global(.status-value) {
    font-family: var(--st-sans);
    font-variant-numeric: tabular-nums;
  }
  .sfv-status :global(.status-label) {
    color: var(--st-text-2);
    font-size: 0.75rem;
  }
  .sfv-status {
    flex-wrap: wrap;
    row-gap: 0.2rem;
    border-top: 1px solid var(--st-hair, rgba(143, 163, 179, 0.22));
    color: var(--st-text-2);
  }
  .sfv-editor {
    margin-left: auto;
    background: none;
    border: 1px solid var(--st-hair-strong);
    border-radius: 4px;
    color: var(--st-text-2);
    font: 0.7rem var(--st-sans);
    padding: 0.1rem 0.5rem;
    cursor: pointer;
  }
  .sfv-editor:disabled {
    cursor: not-allowed;
    opacity: 0.85;
    color: var(--st-text-3);
  }
</style>
