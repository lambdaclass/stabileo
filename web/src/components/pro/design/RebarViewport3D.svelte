<script lang="ts">
  /**
   * The WebGL surface for the reinforcement scene.
   *
   * Deliberately thin. It owns a renderer, a camera, controls and a light rig, and it knows
   * how to turn a `SceneModel` into meshes and a click into a bar id. It knows nothing about
   * documents, filters, stores or exports — those live in the panel above it, so this file
   * can be reasoned about as "does the picture appear and can you click it".
   *
   * ── Rendering is on demand ─────────────────────────────────────────
   *
   * No permanent animation loop. A cage does not move on its own, and a `requestAnimationFrame`
   * spinning at 60 Hz over a static scene is a laptop fan running for nothing — this panel sits
   * inside a workflow a user leaves open for hours. Frames are drawn when something changes:
   * the scene, an option, an orbit, a resize. `OrbitControls` damping needs a short tail of
   * frames after the pointer leaves, and that tail is counted rather than guessed at.
   */
  import { onMount } from 'svelte';
  import * as THREE from 'three';
  import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
  import {
    createRebarScene, frameExtent, elementExtent, setLiveRebarScene, type RebarScene,
  } from '../../../lib/three/rebar-scene';
  import {
    barMatchesFilter, kindByElement, sceneSignature, visibleBounds,
    type SceneFilter, type SceneModel,
  } from '../../../lib/engine/detailing/scene-model';
  import { resolvePick } from '../../../lib/three/rebar-pick';
  import { t } from '../../../lib/i18n';
  import { markOpenPhase } from '../../../lib/utils/open-timeline';

  /** What the user clicked: a bar, a piece of concrete, or empty space. */
  export type { ScenePick } from '../../../lib/three/rebar-pick';

  interface Props {
    /**
     * The WHOLE model, not what the user has chosen to see.
     *
     * ── Why this is the unfiltered scene ──────────────────────────
     *
     * It used to be the filtered one, and that is what made a layer switch cost seconds:
     * `filterScene` returns a smaller scene, a smaller scene has a different signature, and a
     * different signature meant re-tubing all 20 917 bars to answer a checkbox.
     *
     * Geometry is built once from everything the document contains. `filter` then decides what
     * is VISIBLE, which is a flag per batch and not a vertex anywhere.
     */
    scene: SceneModel;
    /** What the user has chosen to see. Applied as visibility; never rebuilds geometry. */
    filter?: SceneFilter;
    diameterScale?: number;
    showConcrete?: boolean;
    showConflicts?: boolean;
    concreteOpacity?: number;
    selectedBarId?: string | null;
    /** A section plane through the model, in model coordinates. */
    section?: { axis: 'x' | 'y' | 'z'; at: number; flip?: boolean } | null;
    onselect?: (pick: ScenePick | null) => void;
    /**
     * Called `true` when the first geometry build is pending and `false` once it is on screen.
     *
     * The workspace uses it to say the scene is still being built. Reported rather than
     * inferred from a timer, because "is the cage there yet" is a fact this component holds
     * and nothing outside it can observe without guessing.
     */
    onbuildstate?: (building: boolean) => void;
    height?: string;
  }

  const {
    scene, filter = {}, diameterScale = 1, showConcrete = true, showConflicts = true,
    concreteOpacity = 1, selectedBarId = null, section = null, onselect, onbuildstate,
    height = '460px',
  }: Props = $props();

  /**
   * Which family owns each member, memoised against the scene.
   *
   * The same map the filter and the tally use, from the same function, so this file cannot form
   * a second opinion about whether a bar is a slab's or a column's.
   */
  const kindOfElement = $derived(kindByElement(scene.solids));

  let host = $state<HTMLDivElement | null>(null);
  let failed = $state(false);

  let renderer: THREE.WebGLRenderer | null = null;
  let camera: THREE.PerspectiveCamera | null = null;
  let controls: OrbitControls | null = null;
  let root: THREE.Scene | null = null;
  let built: RebarScene | null = null;
  let highlight: THREE.Mesh | null = null;

  /** Marked once per mount: the first frame is the one the user waited for. */
  let firstFrameMarked = false;
  /** Frames still owed to damping. Counted, so the tail ends rather than running forever. */
  let pending = 0;
  let running = false;

  function invalidate(frames = 1) {
    pending = Math.max(pending, frames);
    if (running || !renderer) return;
    running = true;
    requestAnimationFrame(tick);
  }

  function tick() {
    if (!renderer || !camera || !root) { running = false; return; }
    controls?.update();
    renderer.render(root, camera);
    // The first frame that shows the CAGE, not the first frame at all: the resize observer
    // draws an empty scene before the geometry exists, and marking that one would report the
    // open as finished while the window was still blank.
    if (!firstFrameMarked && built) { firstFrameMarked = true; markOpenPhase('frame'); }
    pending -= 1;
    if (pending > 0) requestAnimationFrame(tick);
    else running = false;
  }

  function fit() {
    if (!camera || !controls) return;
    /**
     * Framed on what is VISIBLE, not on everything built.
     *
     * The geometry is now the whole model whatever the switches say, so framing `scene.bounds`
     * would back the camera off far enough to see a building the user has narrowed to one
     * footing. `visibleBounds` answers the same question `filterScene` used to answer on the way
     * past, without allocating a filtered scene to read six numbers off it.
     */
    const f = frameExtent(visibleBounds(scene, filter), camera.fov, camera.aspect);
    if (!f) return;
    controls.target.copy(f.centre);
    // Down the long diagonal: a cage read straight down an axis hides every bar behind the
    // one in front of it.
    camera.position.set(
      f.centre.x + f.distance * 0.7,
      f.centre.y - f.distance * 0.7,
      f.centre.z + f.distance * 0.55,
    );
    camera.near = Math.max(0.01, f.distance / 500);
    camera.far = f.distance * 40;
    camera.updateProjectionMatrix();
    controls.update();
    invalidate(20);
  }

  export function fitView() { fit(); }

  /**
   * Build the geometry, then re-apply everything that is not geometry.
   *
   * The concrete and the conflict markers are built UNCONDITIONALLY and switched with visibility,
   * so their checkboxes cost a flag rather than a rebuild. Only `diameterScale` reaches the
   * builder, because only it changes where a vertex is.
   *
   * A rebuild is a new set of meshes, so the visibility, the opacity and the section have to be
   * re-applied to them. Forgetting one of those is how a rebuild silently resets a filter the
   * user set — the failure mode that made "it forgets my layers" a bug report.
   */
  function rebuild() {
    if (!root) return;
    /**
     * The bookkeeping lives HERE, not only in the effect that usually calls it.
     *
     * `onMount` builds the scene and the rebuild effect then runs for the first time with no
     * recorded signature — so it built everything a second time, immediately, before the user
     * had touched anything. On the 7-storey building that is a second full pass over 20 917
     * bars to arrive at the geometry already on the GPU. Recording the state inside the build
     * makes the effect's own guard cover the mount as well.
     */
    lastSignature = sceneSignature(scene);
    lastGeometryOptions = `${diameterScale}`;
    if (built) { root.remove(built.group); built.dispose(); built = null; }
    built = createRebarScene(scene, { diameterScale });
    built.setVisibility({ filter, concrete: showConcrete, conflicts: showConflicts });
    built.setConcreteOpacity(concreteOpacity);
    built.setSection(section ?? undefined);
    root.add(built.group);
    // Published so a browser test can ask the RENDERER what it draws rather than asking the
    // panel what it filtered. Those two agreed for months while one of them was doing nothing.
    setLiveRebarScene(built);
    invalidate(2);
  }

  /** Resolve a click. The ordering rules live in `rebar-pick.ts`, where they are testable. */
  function pick(ev: PointerEvent) {
    if (!renderer || !camera || !built || !onselect) return;
    const rect = renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((ev.clientX - rect.left) / rect.width) * 2 - 1,
      -((ev.clientY - rect.top) / rect.height) * 2 + 1,
    );
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, camera);
    onselect(resolvePick(built, scene, ray));
  }

  /**
   * Centre the camera on one member without changing the viewing direction.
   *
   * Keeping the direction is the point: a user who has orbited to look along a beam line and
   * then clicks the next member expects to arrive there facing the same way. Re-deriving an
   * isometric each time throws away the orientation they just chose.
   */
  export function focusElement(elementId: number): boolean {
    if (!camera || !controls) return false;
    // Restricted to what is visible: a request for a member the user has switched off cannot be
    // served, and reporting a move that never happened is worse than not moving.
    const extent = elementExtent(scene, elementId, filter);
    const f = frameExtent(extent, camera.fov, camera.aspect);
    if (!f) return false;
    const dir = new THREE.Vector3()
      .subVectors(camera.position, controls.target).normalize();
    controls.target.copy(f.centre);
    camera.position.copy(f.centre).addScaledVector(dir, Math.max(f.distance, 0.5));
    camera.updateProjectionMatrix();
    controls.update();
    invalidate(20);
    return true;
  }

  /**
   * Mark the selected bar with a ring rather than by recolouring it.
   *
   * Recolouring would mean splitting the merged mesh, which is the batching this view exists
   * to keep. A ring at the bar's midpoint is cheap, survives the merge, and stays visible
   * when the bar itself is behind concrete.
   */
  function syncHighlight() {
    if (!root) return;
    if (highlight) {
      root.remove(highlight);
      highlight.geometry.dispose();
      (highlight.material as THREE.Material).dispose();
      highlight = null;
    }
    /**
     * No ring on a bar that is not being drawn.
     *
     * The scene here is the whole model, so a selected bar survives its own layer being switched
     * off — and a yellow ring floating where a hidden bar used to be says "this is selected and
     * it is here", which is half true in the worst way. The filter decides, using the same
     * predicate the batches were switched with.
     */
    const found = selectedBarId ? scene.bars.find((b) => b.barId === selectedBarId) : null;
    const bar = found && barMatchesFilter(found, filter, kindOfElement) ? found : null;
    if (bar && bar.polyline.length > 0) {
      const p = bar.polyline[Math.floor(bar.polyline.length / 2)];
      const r = Math.max(0.05, (bar.diameterMm / 2000) * 6);
      highlight = new THREE.Mesh(
        new THREE.SphereGeometry(r, 16, 12),
        new THREE.MeshBasicMaterial({
          color: 0xffd400, transparent: true, opacity: 0.55, depthTest: false,
        }),
      );
      highlight.position.set(p.x, p.y, p.z);
      highlight.renderOrder = 3;
      root.add(highlight);
    }
    invalidate(2);
  }

  onMount(() => {
    if (!host) return;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      // A machine with no WebGL gets a sentence, not a blank rectangle.
      failed = true;
      return;
    }
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    // Material-level clipping planes do nothing unless the renderer opts in. Local rather
    // than global so the section belongs to this scene and cannot leak into another view.
    renderer.localClippingEnabled = true;
    host.appendChild(renderer.domElement);
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.display = 'block';

    root = new THREE.Scene();
    // Z up, to match the structural model rather than Three's default Y up. Every coordinate
    // in the scene model is the analysis model's own.
    root.up.set(0, 0, 1);

    camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000);
    camera.up.set(0, 0, 1);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.addEventListener('change', () => invalidate(2));

    root.add(new THREE.AmbientLight(0xffffff, 0.72));
    const key = new THREE.DirectionalLight(0xffffff, 0.75);
    key.position.set(1, -1, 1.4);
    root.add(key);
    const fill = new THREE.DirectionalLight(0xffffff, 0.3);
    fill.position.set(-1, 1, 0.6);
    root.add(fill);

    /**
     * The first measurement refits.
     *
     * `onMount` runs before the element has been laid out, so the camera's aspect is still
     * the constructor's 1 and its size is 0×0. Framing there and never again computed the
     * distance for a square viewport and applied it to this panel's wide, short one — the
     * scene fitted vertically and ran off both sides. Every LATER resize keeps the user's
     * camera where they put it; only the first one, which is really "the canvas now exists",
     * is allowed to move it.
     */
    let measured = false;
    /**
     * The size the drawing buffer is currently at.
     *
     * ── Why a resize that changes nothing must do nothing ──────────────
     *
     * `ResizeObserver` fires on OBSERVE and again for every layout pass the overlay's own
     * appearance provokes, so opening the workspace delivers several callbacks — most of them
     * reporting the size the canvas already has. `setSize` assigns `canvas.width`/
     * `canvas.height`, and assigning either RESETS and reallocates the drawing buffer even
     * when the value is identical, which then costs a full redraw of whatever is in the scene.
     *
     * Honest about what this did and did not buy: a profile of the open blamed
     * `WebGLRenderer.setSize` for 1 694 ms, and the guard did not remove them — the marks
     * added afterwards showed a SINGLE call, and that time was the driver flushing the newly
     * uploaded geometry inside the first GL call that forced it. What the guard removes is the
     * reallocation on every LATER no-op callback, which is real but was never the reported
     * failure. It stays because reallocating a framebuffer to arrive at the same framebuffer
     * cannot be right, and it costs two integer reads to avoid.
     *
     * The guard is on the SIZE, not on a "first time" flag, because a genuine resize must
     * still be honoured: dragging the rail, rotating a tablet, or opening the console all
     * change these numbers and all must re-fit the buffer.
     */
    let bufferW = 0;
    let bufferH = 0;
    const resize = new ResizeObserver(() => {
      if (!renderer || !camera || !host) return;
      const w = host.clientWidth || 1;
      const h = host.clientHeight || 1;
      const changed = w !== bufferW || h !== bufferH;
      if (changed) {
        bufferW = w;
        bufferH = h;
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
      }
      const firstMeasure = !measured && host.clientWidth > 0;
      if (firstMeasure) { measured = true; fit(); }
      // Redraw on a real resize, and on the first callback — that one is "the canvas now
      // exists", and the frame it asks for is the first one the user sees.
      if (changed || firstMeasure) invalidate(2);
    });
    resize.observe(host);

    /**
     * Build AFTER the browser has painted the workspace once.
     *
     * ── Why the first build is deferred by two frames ──────────────────
     *
     * Building the cage is not free and cannot be made free: on the 7-storey building with its
     * floors designed it is 20 917 tubes and 39 240 conflict markers, and materialising them on
     * the GPU costs a couple of seconds on a software rasteriser. Doing that inside `onMount` —
     * which runs before the browser paints — meant the click on "3-D" produced NOTHING on
     * screen until it was over. The button looked dead, the app looked hung, and a user who
     * clicked again got a second open queued behind the first.
     *
     * Two `requestAnimationFrame`s, not one: the first is scheduled before the paint that
     * follows this mount, so its callback still lands in the frame the user is waiting on. The
     * second is guaranteed to run after that paint has happened, which is the property being
     * bought here — the overlay, its rail and its "building" state are on screen before the
     * expensive work starts.
     *
     * This changes WHEN the geometry is built, never WHETHER: `building` is reported so the
     * workspace can say the scene is still coming, so nothing incomplete is presented as
     * final, and `rebuild()` is the same single build it always was — no second pass, no second
     * scene, no second context. A cancelled mount clears the handle so a workspace closed
     * inside those two frames never builds into a torn-down renderer.
     */
    markOpenPhase('renderer');
    onbuildstate?.(true);
    initialBuildPending = true;
    let firstBuild: number | null = requestAnimationFrame(() => {
      firstBuild = requestAnimationFrame(() => {
        firstBuild = null;
        initialBuildPending = false;
        if (!root) return;
        rebuild();
        markOpenPhase('geometry');
        fit();
        onbuildstate?.(false);
      });
    });

    return () => {
      if (firstBuild !== null) {
        cancelAnimationFrame(firstBuild);
        initialBuildPending = false;
        onbuildstate?.(false);
      }
      resize.disconnect();
      controls?.dispose();
      // Cleared BEFORE the dispose, so nothing can read a census off meshes that are being
      // torn down. A closed workspace answers "no scene", which is the truth.
      setLiveRebarScene(null);
      built?.dispose();
      /**
       * Release the GPU context, not just the JS objects.
       *
       * `dispose()` frees the renderer's own resources and leaves the WebGL context alive.
       * A browser allows a small number of live contexts — around sixteen in Chromium — and
       * drops the oldest without warning once that is exceeded. This workspace is an overlay
       * the user opens and closes repeatedly, so a leaked context per open is a viewport that
       * silently stops rendering after a dozen visits, and a test run that starts failing
       * partway through for no reason visible in the test that fails.
       */
      renderer?.forceContextLoss();
      renderer?.dispose();
      renderer?.domElement.remove();
      renderer = null;
      camera = null;
      root = null;
      built = null;
      highlight = null;
    };
  });

  /**
   * Rebuild only when the CONTENT changed, not when the object did.
   *
   * ── The three-second freeze ────────────────────────────────────
   *
   * This used to compare `lastScene !== scene`, and `filterScene` returns a fresh object on
   * every recompute — so any reactive touch anywhere rebuilt all 20 917 tubes. Returning from
   * another browser tab was the worst case: the browser had suspended `requestAnimationFrame`
   * while hidden, Svelte flushed the pending effects the moment the tab became visible, and
   * the user got a frozen camera and dead controls for about three seconds.
   *
   * The signature answers the question the renderer actually has — did the steel change —
   * for about a millisecond. The on-demand render loop is untouched: this decides whether to
   * REBUILD, not whether to draw.
   *
   * The camera refits only when the signature changes, so toggling opacity or moving a
   * section plane never yanks the view away from where the user put it.
   */
  let lastSignature: string | null = null;
  let lastGeometryOptions = '';
  /**
   * True between the mount and the deferred first build.
   *
   * Without it this effect wins the race and builds the cage itself — it runs before the
   * deferred callback and has no recorded signature, so it sees "the scene changed" and does
   * the whole 20 917-tube pass, which the deferred build then repeats. That is not a slower
   * open, it is TWO opens: `rebarSceneBuilds` moved by two per visit, measured.
   *
   * Suppressing rather than reordering, because the deferred build must stay deferred — the
   * whole point is that the browser paints before it starts. The scene the deferred build reads
   * is whatever the props say at that moment, so an edit landing inside those two frames is
   * picked up by it rather than lost.
   */
  let initialBuildPending = false;
  $effect(() => {
    /**
     * Only the options that change VERTICES belong here — and by now there is one.
     *
     * Opacity and the section plane never did: one is a material property and the other is a
     * plane the material clips against, and both used to re-tube 20 917 bars to arrive at
     * geometry byte-identical to the one already on the GPU — 1,6 s per slider step, measured
     * on the 7-storey building.
     *
     * `showConcrete` and `showConflicts` have now joined them, because "draw this or not" is a
     * flag on a mesh and was costing a full rebuild for no reason at all. What is left is
     * `diameterScale`, which genuinely moves every ring off its centreline.
     *
     * The scene's own signature is the other trigger, and it changes when the DOCUMENT does —
     * which is the one case where the tubes really are wrong and must be rebuilt.
     */
    const geometryOptions = `${diameterScale}`;
    // Read BEFORE any early return. An effect only re-runs for the dependencies it actually
    // read on its last pass, so returning above this line would unsubscribe the effect from
    // the scene — and a document rebuilt while the first build was still pending would then
    // never re-tube. Costs about a millisecond.
    const signature = sceneSignature(scene);
    if (!root || initialBuildPending) return;
    if (signature === lastSignature && geometryOptions === lastGeometryOptions) return;
    const sceneChanged = signature !== lastSignature;
    rebuild();
    if (sceneChanged) fit();
  });

  /**
   * Visibility. No vertex is touched, no buffer is reallocated, no picking map is rebuilt.
   *
   * This is the effect that used to be a rebuild. A family switch reaches `mesh.visible`; an
   * isolate or a status filter re-selects which of the already-built triangles are drawn.
   *
   * ── Why the three inputs are read into a local FIRST ───────────────
   *
   * Because they were not, and that is why every switch in the rail stopped working.
   *
   * This body used to be one line: `built?.setVisibility({ filter, concrete: showConcrete,
   * conflicts: showConflicts })`. `a?.b(c)` short-circuits the WHOLE call expression when `a`
   * is nullish — the arguments are never evaluated — and `built` is nullish on this effect's
   * first run, because the first geometry build is deliberately deferred by two frames so the
   * browser paints the workspace before the cage is materialised.
   *
   * A Svelte effect subscribes to what it actually READ on its last pass. Having read nothing,
   * this one had no dependencies and was never re-run again for the life of the workspace. The
   * initial picture was still right — `rebuild()` applies the visibility itself — so the scene
   * came up correct and then froze: the checkbox flipped, the store changed, the derived filter
   * recomputed, the tally beside the canvas updated, and `mesh.visible` was never touched. All
   * eight switches, one line, no error anywhere.
   *
   * It survived the unit suite because every one of those tests calls `setVisibility` directly,
   * and it survived the browser suite because those assertions read the TALLY — which is derived
   * in Svelte and was updating perfectly. What nothing asserted was the scene.
   *
   * Reading into `next` first is not a style preference: it is the subscription. The two effects
   * below already do the same thing with a bare `void`, which is what made the omission here a
   * single missing line rather than an unknown mechanism.
   */
  $effect(() => {
    const next = { filter, concrete: showConcrete, conflicts: showConflicts };
    built?.setVisibility(next);
    invalidate(2);
  });

  // Material-only updates. No vertex is touched and no buffer is reallocated.
  $effect(() => {
    void concreteOpacity;
    built?.setConcreteOpacity(concreteOpacity);
    invalidate(2);
  });

  $effect(() => {
    void section;
    built?.setSection(section ?? undefined);
    invalidate(2);
  });

  $effect(() => {
    /**
     * The filter is a dependency of the RING as much as the selection is.
     *
     * `syncHighlight` reads it — a ring is not drawn on a bar the user has switched off — but it
     * reads it INSIDE a conditional, so with nothing selected the effect subscribed only to
     * `selectedBarId`. That happened to be harmless, because with no selection there is no ring
     * to take down. Stating the dependency here makes it a property rather than a coincidence:
     * the same conditional-read shape one line up is what broke every switch in the rail.
     */
    void selectedBarId;
    void filter;
    syncHighlight();
  });
</script>

<div class="rebar-viewport" style:height>
  {#if failed}
    <p class="fallback">{t('detailing.scene.noWebgl')}</p>
  {:else}
    <div
      class="host"
      data-testid="rebar-canvas"
      bind:this={host}
      onpointerdown={(e) => { if (e.button === 0) pick(e); }}
    ></div>
  {/if}
</div>

<style>
  .rebar-viewport {
    position: relative;
    width: 100%;
    border: 1px solid var(--border, #2a2f3a);
    border-radius: 6px;
    overflow: hidden;
    background: linear-gradient(160deg, #12161d 0%, #1a2029 100%);
  }
  .host { width: 100%; height: 100%; }
  .fallback {
    margin: 0;
    padding: 1.5rem;
    text-align: center;
    color: var(--text-muted, #8b93a3);
    font-size: 0.85rem;
  }
</style>
