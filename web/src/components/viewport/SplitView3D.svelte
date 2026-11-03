<script lang="ts">
  /**
   * The other half of a split view: the plan of the working level when the main view is in 3D,
   * the model in 3D when it is in plan. Same scene, its own camera and canvas; a drag moves this
   * half only, a click selects as in the main view, and a level in the list becomes the working
   * level (the main plan view follows it too).
   */
  import * as THREE from 'three';
  import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
  import { onMount } from 'svelte';
  import { modelStore, uiStore } from '../../lib/store';
  import { t } from '../../lib/i18n';
  import { sortedLevels } from '../../lib/model/grid';
  import { setCameraUp } from '../../lib/geometry/coordinate-system';
  import { findElementHit, findNodeHit } from '../../lib/viewport3d/picking';

  let { scene, parents }: { scene: THREE.Scene; parents: () => { elements: THREE.Group; nodes: THREE.Group } } = $props();

  const PLAN_CUT_M = 0.15;
  let host: HTMLDivElement | undefined = $state();
  let canvas: HTMLCanvasElement | undefined = $state();
  let renderer: THREE.WebGLRenderer | null = null;
  let controls: OrbitControls | null = null;
  const ortho = new THREE.OrthographicCamera(-10, 10, 10, -10, -1e5, 1e5);
  const persp = new THREE.PerspectiveCamera(45, 1, 0.05, 1e6);
  const mode = $derived(uiStore.planView3D ? '3d' : 'plan');
  const cam = () => (mode === 'plan' ? ortho : persp);

  /** The levels to pick from: the grid's, or else one per height with nodes on it. */
  const levels = $derived.by(() => {
    const g = sortedLevels(modelStore.grid);
    if (g.length) return g.map((l) => ({ id: l.id, name: l.name, z: l.z, color: l.color }));
    const zs = [...new Set([...modelStore.nodes.values()].map((n) => Math.round((n.z ?? 0) * 100) / 100))].sort((a, b) => a - b);
    return zs.map((z, i) => ({ id: `z${i}`, name: `${z.toFixed(2)} m`, z, color: undefined as string | undefined }));
  });
  const level = $derived(levels.reduce<{ z: number } | null>((best, l) => (!best || Math.abs(l.z - uiStore.nodeCreateZ) < Math.abs(best.z - uiStore.nodeCreateZ) ? l : best), null));
  const below = $derived.by(() => {
    if (!level) return -Infinity;
    const under = levels.filter((l) => l.z < level.z - 1e-6);
    return under.length ? under[under.length - 1]!.z : -Infinity;
  });

  const upper = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0);
  const lower = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);

  function bounds(): THREE.Box3 {
    const b = new THREE.Box3();
    for (const n of modelStore.nodes.values()) b.expandByPoint(new THREE.Vector3(n.x, n.y, n.z ?? 0));
    if (b.isEmpty()) b.set(new THREE.Vector3(-5, -5, 0), new THREE.Vector3(5, 5, 3));
    return b;
  }

  function frame() {
    if (!host || !controls) return;
    const b = bounds(), c = b.getCenter(new THREE.Vector3()), s = b.getSize(new THREE.Vector3());
    const w = host.clientWidth || 1, h = host.clientHeight || 1, aspect = w / h;
    if (mode === 'plan') {
      const half = Math.max(s.x / aspect, s.y, 1) * 0.6;
      ortho.left = -half * aspect; ortho.right = half * aspect; ortho.top = half; ortho.bottom = -half;
      ortho.zoom = 1;
      ortho.up.set(0, 1, 0);
      ortho.position.set(c.x, c.y, (level?.z ?? c.z) + 1000);
      controls.target.set(c.x, c.y, level?.z ?? c.z);
      ortho.lookAt(controls.target);
      ortho.updateProjectionMatrix();
      controls.object = ortho;
      controls.enableRotate = false;
      controls.screenSpacePanning = true;
      controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
    } else {
      const r = Math.max(s.length(), 1);
      persp.aspect = aspect;
      setCameraUp(persp);
      persp.position.set(c.x + r * 0.9, c.y - r * 1.1, c.z + r * 0.8);
      controls.target.copy(c);
      persp.lookAt(c);
      persp.updateProjectionMatrix();
      controls.object = persp;
      controls.enableRotate = true;
      controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
    }
    controls.update();
    render();
  }

  /** Draw this half. Called by the main view after each of its frames, and on this half's own moves. */
  export function render() {
    if (!renderer || !host) return;
    const w = host.clientWidth, h = host.clientHeight;
    if (w === 0 || h === 0) return;
    if (mode === 'plan' && level) {
      upper.constant = level.z + PLAN_CUT_M;
      lower.constant = Number.isFinite(below) ? -(below + PLAN_CUT_M) : 1e9;
      renderer.clippingPlanes = [upper, lower];
    } else renderer.clippingPlanes = [];
    renderer.render(scene, cam());
  }

  function resize() {
    if (!renderer || !host) return;
    const w = host.clientWidth, h = host.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    if (mode === 'plan') {
      const half = (ortho.top - ortho.bottom) / 2;
      ortho.left = -half * (w / h); ortho.right = half * (w / h);
      ortho.updateProjectionMatrix();
    } else { persp.aspect = w / h; persp.updateProjectionMatrix(); }
    render();
  }

  let down: { x: number; y: number } | null = null;
  function pick(e: PointerEvent) {
    if (!down || !canvas) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
    down = null;
    if (moved > 4) return;
    const r = canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    const p = parents();
    const add = e.shiftKey || e.ctrlKey || e.metaKey;
    const node = findNodeHit(ray, ndc, cam(), p.nodes);
    if (node !== null) { uiStore.selectNode(node, add); return; }
    const el = findElementHit(ray, ndc, cam(), p.elements);
    if (el !== null) uiStore.selectElement(el, add);
    else if (!add) uiStore.clearSelection();
  }

  onMount(() => {
    if (!canvas || !host) return;
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.localClippingEnabled = true;
    controls = new OrbitControls(ortho, canvas);
    controls.addEventListener('change', render);
    const ro = new ResizeObserver(resize);
    ro.observe(host);
    resize();
    frame();
    return () => { ro.disconnect(); controls?.dispose(); renderer?.dispose(); renderer = null; };
  });

  $effect(() => { void mode; void level?.z; void below; queueMicrotask(frame); });
</script>

<div class="split" bind:this={host} data-testid="split-view" data-mode={mode}>
  <canvas bind:this={canvas} onpointerdown={(e) => (down = { x: e.clientX, y: e.clientY })} onpointerup={pick}></canvas>
  <div class="split-head">
    <span class="split-title">{mode === 'plan' ? t('viewport.split.plan') : t('viewport.split.model')}</span>
    <button type="button" class="split-btn" onclick={frame} title={t('view.zoomAll')} data-testid="split-fit">⤢</button>
  </div>
  {#if levels.length}
    <ul class="split-levels" aria-label={t('viewport.split.levels')} data-testid="split-levels">
      {#each [...levels].reverse() as l (l.id)}
        <li><button type="button" class:on={level?.z === l.z} style:border-left-color={l.color ?? 'transparent'} onclick={() => uiStore.setActiveLevel(l.z)} data-testid="split-level-{l.id}">{l.name}</button></li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .split { position: absolute; top: 0; right: 0; bottom: 0; width: 50%; border-left: 1px solid var(--st-hair-strong); background: var(--st-surface); overflow: hidden; }
  canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
  .split-head { position: absolute; top: 8px; left: 8px; display: flex; gap: 6px; align-items: center; font-size: 0.7rem; color: var(--st-text-2); pointer-events: none; }
  .split-head button { pointer-events: auto; }
  .split-btn { border: 1px solid var(--st-hair-strong); background: var(--st-surface); color: var(--st-text-2); border-radius: 4px; padding: 0 6px; cursor: pointer; }
  .split-levels { position: absolute; top: 34px; right: 8px; margin: 0; padding: 4px; list-style: none; display: flex; flex-direction: column; gap: 2px; background: var(--st-surface); border: 1px solid var(--st-hair-strong); border-radius: var(--st-radius); max-height: calc(100% - 50px); overflow-y: auto; }
  .split-levels button { width: 100%; text-align: left; border: 0; border-left: 3px solid transparent; background: none; color: var(--st-text-2); font-size: 0.68rem; padding: 2px 8px; border-radius: 3px; cursor: pointer; white-space: nowrap; }
  .split-levels button.on { background: var(--st-selected-bg); color: var(--st-text); }
</style>
