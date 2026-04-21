<script lang="ts">
  import { onMount } from 'svelte';
  import { t } from '../lib/i18n';
  import * as THREE from 'three';
  import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
  import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
  import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
  import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
  import { modelStore, uiStore, resultsStore, historyStore, dsmStepsStore, verificationStore } from '../lib/store';
  import { fatLineResolution } from '../lib/three/create-element-mesh';
  import { COLORS, setMeshColor, setGroupColor, findUserData, disposeObject, createTextSprite } from '../lib/three/selection-helpers';
  import { evaluateDiagramAt, formatDiagramValue3D, type Diagram3DKind } from '../lib/engine/diagrams-3d';
  import { getGroundIntersection as _getGroundIntersection, findNodeHit as _findNodeHit, findElementHit as _findElementHit, segmentIntersectsRect2D } from '../lib/viewport3d/picking';
  import { getModelBounds as _getModelBounds, zoomToFit as _zoomToFit, setView as _setView, handleResize as _handleResize, syncOrthoFrustum as _syncOrthoFrustum } from '../lib/viewport3d/camera';
  import { planeNormal, projectNodeToScene, setCameraUp, shouldProjectModelToXZ, GLOBAL_X, GLOBAL_Y, GLOBAL_Z } from '../lib/geometry/coordinate-system';
  import { updateGrid as _updateGrid, createFatAxes as _createFatAxes, addAxisLabels as _addAxisLabels } from '../lib/viewport3d/grid';
  import { syncNodes as _syncNodes, syncElements as _syncElements, syncSupports as _syncSupports, syncLoads as _syncLoads, syncShells as _syncShells, syncSelection as _syncSelection, type SceneSyncContext } from '../lib/viewport3d/scene-sync';
  import { syncDeformed as _syncDeformed, syncDiagrams3D as _syncDiagrams3D, syncColorMap3D as _syncColorMap3D, syncVerificationLabels as _syncVerificationLabels, syncReactions as _syncReactions, syncConstraintForces as _syncConstraintForces, syncLabels3D as _syncLabels3D, DIAGRAM_3D_TYPES, type ResultsSyncContext } from '../lib/viewport3d/results-sync';
  import { buildProxyPositions } from '../lib/viewport3d/elements-proxy';

  let container: HTMLDivElement;
  let renderer: THREE.WebGLRenderer;
  let scene: THREE.Scene;
  let camera: THREE.PerspectiveCamera | THREE.OrthographicCamera;
  let perspCamera: THREE.PerspectiveCamera;
  let orthoCamera: THREE.OrthographicCamera;
  let controls: OrbitControls;
  let animFrameId: number;
  let initialized = false;

  // ─── Invalidation-based rendering ───────────────────────────
  // Declared here so $effect blocks can call invalidate() from outside onMount.
  // The actual implementation is assigned inside onMount once the renderer exists.
  let invalidate: () => void = () => {};

  // ─── Scene graph maps (reconciled with store) ────────────────
  let nodeMeshes = new Map<number, THREE.Mesh>();
  let elementGroups = new Map<number, THREE.Group>();
  let supportGizmos = new Map<number, THREE.Group>();
  let deformedGroup: THREE.Group | null = null;
  let gridGroup: THREE.Object3D | null = null;
  let measureGroup: THREE.Group | null = null;
  let axesHelper: THREE.Group | null = null;
  let axisLabelSprites: THREE.Sprite[] = [];

  // Dedicated parent groups for raycasting scoping
  let nodesParent: THREE.Group;
  let elementsParent: THREE.Group;
  let supportsParent: THREE.Group;
  let loadsParent: THREE.Group;
  let resultsParent: THREE.Group;
  let shellsParent: THREE.Group;

  // ─── Clipping plane ─────────────────────────────────────────
  const clippingPlane = new THREE.Plane(planeNormal('XY').clone().negate(), 0);

  // ─── Raycaster ───────────────────────────────────────────────
  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();
  let hoveredData: { type: string; id: number } | null = null;
  let hoveredNodeId3D = $state<number | null>(null);
  let mouseDownPos = { x: 0, y: 0 };
  // OrbitControls drag flag: skips per-event hover raycast while the user is
  // actively rotating/panning/zooming (recursive raycasts on large fixtures
  // were the dominant cost of mousemove during orbit).
  let isOrbiting = false;
  // rAF-coalesced hover raycast: a single most-recent MouseEvent is saved and
  // processed on the next animation frame, so fast mousemove streams collapse
  // to one raycast per frame instead of one per event.
  let pendingHoverEvent: MouseEvent | null = null;
  let hoverRafId: number | null = null;

  // ─── Box select state ──────────────────────────────────────
  let boxSelect3D = $state<{ startX: number; startY: number; endX: number; endY: number; additive: boolean } | null>(null);

  // ─── Node dragging state ───────────────────────────────────
  let draggedNodeId3D = $state<number | null>(null);
  let dragMoved3D = false;
  let dragStartWorld3D: THREE.Vector3 | null = null;

  // ─── Hover tooltip state ─────────────────────────────────────
  let hoverTooltip = $state<{ text: string; x: number; y: number } | null>(null);

  // ─── Diagram legend (overlay) ────────────────────────────────
  const DIAGRAM_COLORS: Record<string, string> = {
    momentZ: '#4488ff',
    momentY: '#44bbaa',
    shearY:  '#44bb44',
    shearZ:  '#66aa66',
    axial:   '#aa66dd',
    torsion: '#ee8844',
    deformed:    '#ff8800',
    modeShape:   '#4ecdc4',
    bucklingMode:'#e96941',
  };
  const DIAGRAM_LABEL_KEYS: Record<string, string> = {
    momentZ: 'viewport3d.momentZ',
    momentY: 'viewport3d.momentY',
    shearY:  'viewport3d.shearY',
    shearZ:  'viewport3d.shearZ',
    axial:   'viewport3d.axial',
    torsion: 'viewport3d.torsion',
    deformed:    'viewport3d.deformed',
    modeShape:   'viewport3d.modeShape',
    bucklingMode:'viewport3d.bucklingMode',
  };

  function shouldProject2DModel(): boolean {
    return shouldProjectModelToXZ({
      analysisMode: uiStore.analysisMode,
      viewportPresentation3D: uiStore.viewportPresentation3D,
      nodes: modelStore.nodes.values(),
      supports: modelStore.supports.values(),
      loads: modelStore.loads,
      plateCount: modelStore.plates.size,
      quadCount: modelStore.quads.size,
    });
  }

  function syncResultsProjection(): void {
    if (!resultsParent) return;
    // Results are built in projected scene coordinates (getProjectedNodes handles
    // the 2D→XZ swap), so no parent-level rotation is needed.
    resultsParent.position.set(0, 0, 0);
    resultsParent.rotation.set(0, 0, 0);
  }
  const diagramLegend = $derived.by(() => {
    const dt = resultsStore.diagramType;
    if (dt === 'none' || dt === 'axialColor' || dt === 'colorMap' || dt === 'verification') return null;
    const color = DIAGRAM_COLORS[dt];
    const key = DIAGRAM_LABEL_KEYS[dt];
    if (!color || !key) return null;
    return { name: t(key), color };
  });

  // ─── Tool interaction state ─────────────────────────────────
  let pendingElementNodeI: number | null = null;  // first node for element tool
  let pendingLine: THREE.Line | null = null;       // preview line for element tool

  // ─── Coordinate input dialog state ──────────────────────────
  let showCoordDialog = $state(false);
  let coordX = $state('0');
  let coordY = $state('0');
  let coordZ = $state('0');

  function openCoordDialog() {
    coordX = '0'; coordY = '0'; coordZ = '0';
    showCoordDialog = true;
  }

  function submitCoordDialog() {
    const x = parseFloat(coordX);
    const y = parseFloat(coordY);
    const z = parseFloat(coordZ);
    if (isNaN(x) || isNaN(y) || isNaN(z)) return;
    historyStore.pushState();
    const id = modelStore.addNode(x, y, z);
    uiStore.selectNode(id, false);
    uiStore.toast(t('viewport3d.nodeCreatedAt').replace('{id}', String(id)).replace('{x}', String(x)).replace('{y}', String(y)).replace('{z}', String(z)), 'success');
    showCoordDialog = false;
  }

  function cancelCoordDialog() {
    showCoordDialog = false;
  }

  // Cursor style based on active tool
  let cursorStyle = $derived.by(() => {
    if (uiStore.measureMode) return 'crosshair';
    if (uiStore.selectMode === 'stress') return 'crosshair';
    const tool = uiStore.currentTool;
    if (tool === 'select') {
      if (draggedNodeId3D !== null) return 'grabbing';
      if (hoveredNodeId3D !== null) return 'grab';
      return 'default';
    }
    if (tool === 'node') return 'crosshair';
    if (tool === 'element') return 'crosshair';
    if (tool === 'support') return 'pointer';
    if (tool === 'load') return 'pointer';
    if (tool === 'pan') return 'grab';
    return 'default';
  });

  onMount(() => {
    // Scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(COLORS.background);

    // Parent groups
    nodesParent = new THREE.Group();
    nodesParent.name = 'nodes';
    elementsParent = new THREE.Group();
    elementsParent.name = 'elements';
    supportsParent = new THREE.Group();
    supportsParent.name = 'supports';
    loadsParent = new THREE.Group();
    loadsParent.name = 'loads';
    resultsParent = new THREE.Group();
    resultsParent.name = 'results';
    shellsParent = new THREE.Group();
    shellsParent.name = 'shells';
    scene.add(elementsParent, nodesParent, supportsParent, loadsParent, resultsParent, shellsParent);
    syncResultsProjection();

    // Camera — isometric-ish view looking at origin
    perspCamera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000);
    setCameraUp(perspCamera);
    perspCamera.position.set(12, 8, 12);
    perspCamera.lookAt(0, 0, 0);

    // Orthographic camera (frustum updated on resize)
    orthoCamera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 1000);
    setCameraUp(orthoCamera);
    orthoCamera.position.set(12, 8, 12);
    orthoCamera.lookAt(0, 0, 0);

    camera = uiStore.cameraMode3D === 'orthographic' ? orthoCamera : perspCamera;

    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.localClippingEnabled = true;
    container.appendChild(renderer.domElement);

    // Orbit controls
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.1;
    controls.target.set(0, 0, 0);

    // ── Keyboard camera navigation ──
    // WASD = pan, Arrows = orbit, Q/E = up/down, Shift/Ctrl = speed boost
    const keysPressed = new Set<string>();
    let navShiftHeld = false;

    const onNavKeyDown = (e: KeyboardEvent) => {
      // Skip when typing in inputs
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === 'Shift') navShiftHeld = true;
      const k = e.key.toLowerCase();
      if ('wasdqe'.includes(k) || e.key.startsWith('Arrow')) {
        const wasEmpty = keysPressed.size === 0;
        keysPressed.add(k.startsWith('arrow') ? e.key : k);
        e.preventDefault();
        // Start continuous rendering while navigation keys are held
        if (wasEmpty) invalidate();
      }
      // Disable OrbitControls' shift-pan while select tool is active
      if (e.key === 'Shift' && uiStore.currentTool === 'select') {
        controls.enablePan = false;
      }
    };
    const onNavKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift') navShiftHeld = false;
      const k = e.key.toLowerCase();
      keysPressed.delete(k.startsWith('arrow') ? e.key : k);
      if (e.key === 'Shift') controls.enablePan = true;
    };
    window.addEventListener('keydown', onNavKeyDown);
    window.addEventListener('keyup', onNavKeyUp);

    // Sync camera state to uiStore on orbit change (throttled)
    let cameraSyncTimer: ReturnType<typeof setTimeout> | null = null;
    controls.addEventListener('change', () => {
      invalidate(); // Re-render on orbit/pan/zoom via OrbitControls
      if (cameraSyncTimer) return; // throttle
      cameraSyncTimer = setTimeout(() => {
        cameraSyncTimer = null;
        const pos = camera.position;
        const tgt = controls.target;
        uiStore.cameraPosition3D = { x: pos.x, y: pos.y, z: pos.z };
        uiStore.cameraTarget3D = { x: tgt.x, y: tgt.y, z: tgt.z };
      }, 100);
    });

    // Lighting
    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambient);
    const dir1 = new THREE.DirectionalLight(0xffffff, 0.8);
    dir1.position.set(10, 20, 10);
    scene.add(dir1);
    const dir2 = new THREE.DirectionalLight(0xffffff, 0.3);
    dir2.position.set(-10, 10, -10);
    scene.add(dir2);

    // Grid (reactive — updated by syncGrid effect)
    updateGrid();

    // Axes: fat Line2 lines — R=X, G=Y, B=Z
    axesHelper = createFatAxes();
    scene.add(axesHelper);
    addAxisLabels();

    // Handle resize
    const ro = new ResizeObserver(() => { handleResize(); invalidate(); });
    ro.observe(container);
    handleResize();

    // Initialize sync contexts (must be after parent groups are created)
    initSyncContexts();
    initialized = true;
    sceneCtx.initialized = true;
    resultsCtx.initialized = true;

    // Initial sync
    syncNodes();
    syncElements();
    syncSupports();
    syncLoads();
    syncShells();

    // Set initial camera to match model type (flat 2D → front view, 3D → isometric)
    if (modelStore.nodes.size > 0) zoomToFit();

    // ── Invalidation-based render loop ──
    // Instead of running requestAnimationFrame every frame, we only render when
    // the scene is dirty (needsRender=true) or continuous rendering is required
    // (animations, keyboard navigation, or the user override flag).
    let needsRender = true;
    let dampingFrames = 0; // extra frames for OrbitControls damping to settle

    /** Check if any animation is currently active that requires continuous rendering */
    function isAnimating(): boolean {
      const dt = resultsStore.diagramType;
      const animDeformed = resultsStore.animateDeformed && dt === 'deformed' && !!resultsStore.results3D;
      const animMode = dt === 'modeShape' && !!resultsStore.modalResult3D;
      const animBuckling = dt === 'bucklingMode' && !!resultsStore.bucklingResult3D;
      return animDeformed || animMode || animBuckling;
    }

    /** Whether we need to keep the render loop running continuously */
    function needsContinuous(): boolean {
      return uiStore.continuousRendering || keysPressed.size > 0 || isAnimating() || dampingFrames > 0;
    }

    /** Mark the scene as needing a re-render. Schedules a frame if one isn't pending. */
    function _invalidate() {
      if (!needsRender) {
        needsRender = true;
        animFrameId = requestAnimationFrame(renderOnce);
      }
    }
    // Expose invalidate to the outer scope for use in $effect blocks
    invalidate = _invalidate;

    const _panVec = new THREE.Vector3();
    const _orbitSpherical = new THREE.Spherical();

    function handleKeyboardCamera() {
      if (keysPressed.size === 0) return;
      const dist = camera.position.distanceTo(controls.target);
      const boost = navShiftHeld ? 3 : 1;
      const panSpeed = dist * 0.012 * boost;   // scale with zoom level
      const orbitSpeed = 0.02 * boost;          // radians per frame

      // WASD — pan relative to camera orientation
      const forward = _panVec.set(0, 0, 0);
      if (keysPressed.has('w')) forward.z -= panSpeed;
      if (keysPressed.has('s')) forward.z += panSpeed;
      if (keysPressed.has('a')) forward.x -= panSpeed;
      if (keysPressed.has('d')) forward.x += panSpeed;
      if (forward.lengthSq() > 0) {
        // Transform pan vector from camera-local to world space
        forward.applyQuaternion(camera.quaternion);
        forward.z = 0; // keep horizontal
        controls.target.add(forward);
        camera.position.add(forward);
      }

      // Q/E — vertical movement
      if (keysPressed.has('q')) {
        controls.target.z -= panSpeed;
        camera.position.z -= panSpeed;
      }
      if (keysPressed.has('e')) {
        controls.target.z += panSpeed;
        camera.position.z += panSpeed;
      }

      // Arrow keys — orbit around target
      _orbitSpherical.setFromVector3(
        camera.position.clone().sub(controls.target)
      );
      if (keysPressed.has('ArrowLeft')) _orbitSpherical.theta -= orbitSpeed;
      if (keysPressed.has('ArrowRight')) _orbitSpherical.theta += orbitSpeed;
      if (keysPressed.has('ArrowUp')) _orbitSpherical.phi = Math.max(0.1, _orbitSpherical.phi - orbitSpeed);
      if (keysPressed.has('ArrowDown')) _orbitSpherical.phi = Math.min(Math.PI - 0.1, _orbitSpherical.phi + orbitSpeed);
      if (keysPressed.has('ArrowLeft') || keysPressed.has('ArrowRight') || keysPressed.has('ArrowUp') || keysPressed.has('ArrowDown')) {
        camera.position.copy(controls.target).add(
          _panVec.setFromSpherical(_orbitSpherical)
        );
      }
    }

    function renderOnce() {
      if (!needsRender && !needsContinuous()) return;
      needsRender = false;

      // Keyboard camera movement
      handleKeyboardCamera();

      controls.update();
      // Keep ortho frustum synced when using orthographic camera
      if (camera === orthoCamera) syncOrthoFrustum();
      // Update clipping plane
      updateClippingPlane();

      // Tick down damping frames (OrbitControls damping settles over ~15-20 frames)
      if (dampingFrames > 0) dampingFrames--;

      // Animate deformed shape (oscillating scale like 2D viewport)
      const _dt = resultsStore.diagramType;
      const _animDeformed = resultsStore.animateDeformed && _dt === 'deformed' && resultsStore.results3D;
      const _animMode = _dt === 'modeShape' && resultsStore.modalResult3D;
      const _animBuckling = _dt === 'bucklingMode' && resultsStore.bucklingResult3D;
      if (_animDeformed || _animMode || _animBuckling) {
        if (_animMode || _animBuckling) {
          // Mode shapes always animate — syncDeformed handles the sin() internally
          syncDeformed();
        } else {
          const baseScale = resultsStore.deformedScale;
          const animScale = baseScale * Math.sin(performance.now() / (500 / resultsStore.animSpeed));
          // Only rebuild if scale changed meaningfully (avoid per-frame full rebuild)
          if (resultsCtx.lastDeformedAnimScale === null || Math.abs(animScale - resultsCtx.lastDeformedAnimScale) > baseScale * 0.02) {
            resultsCtx.lastDeformedAnimScale = animScale;
            syncDeformed(animScale);
          }
        }
      } else if (deformedGroup && resultsCtx.lastDeformedAnimScale !== null) {
        // Animation was running but conditions no longer met (model cleared, example changed, etc.)
        // Clean up immediately to avoid ghost deformed shape lingering until reactive effect fires
        resultsParent.remove(deformedGroup);
        disposeObject(deformedGroup);
        deformedGroup = null;
        resultsCtx.lastDeformedAnimScale = null;
      }

      renderer.render(scene, camera);
      drawAxisGizmo();

      // Keep looping if continuous rendering is needed
      if (needsContinuous() || needsRender) {
        animFrameId = requestAnimationFrame(renderOnce);
      }
    }
    // Kick off the first frame
    animFrameId = requestAnimationFrame(renderOnce);

    // When OrbitControls interaction ends, allow damping frames to settle
    // During camera manipulation, drop to pixelRatio=1 so the GPU pushes ~4× fewer
    // pixels on retina displays. Restore on 'end' so the idle frame is crisp.
    // Slight aliasing during drag is acceptable — users perceive smoothness more
    // than pixel fidelity while rotating.
    const idlePixelRatio = window.devicePixelRatio;
    // Level-of-detail during orbit: hide decorative parents AND swap the
    // per-element meshes for a single batched LineSegments2 proxy. On
    // la-bombonera this collapses ~3500 draw calls down to ~5.
    let elementsProxy: LineSegments2 | null = null;
    let elementsProxyVersion = -1;
    function ensureElementsProxy(): void {
      const currentVersion = modelStore.modelVersion;
      // Key the cache on presentation too — flipping upright2dIn3d ↔ native3d
      // changes whether nodes project through (x,y)→(x,0,y), so a proxy built
      // under one presentation is wrong under the other.
      const presentation = uiStore.viewportPresentation3D;
      const cacheKey = currentVersion * 10 + (presentation === 'upright2dIn3d' ? 1 : 0);
      if (elementsProxy && elementsProxyVersion === cacheKey) return;
      const positions = buildProxyPositions(
        modelStore.elements.values(),
        (id) => modelStore.getNode(id),
        shouldProject2DModel(),
      );
      if (elementsProxy) {
        elementsProxy.geometry.dispose();
        (elementsProxy.material as LineMaterial).dispose();
        scene.remove(elementsProxy);
        elementsProxy = null;
      }
      if (positions.length === 0) {
        elementsProxyVersion = cacheKey;
        return;
      }
      const geo = new LineSegmentsGeometry();
      geo.setPositions(positions);
      const mat = new LineMaterial({
        color: COLORS.frame,
        linewidth: 3,
        worldUnits: false,
        resolution: fatLineResolution,
      });
      elementsProxy = new LineSegments2(geo, mat);
      elementsProxy.raycast = () => {}; // never picked — only visible during orbit
      elementsProxy.visible = false;
      scene.add(elementsProxy);
      elementsProxyVersion = cacheKey;
    }
    function setLowDetail(on: boolean): void {
      if (nodesParent) nodesParent.visible = !on;
      if (supportsParent) supportsParent.visible = !on;
      if (loadsParent) loadsParent.visible = !on;
      if (resultsParent) resultsParent.visible = !on;
      if (shellsParent) shellsParent.visible = !on;
      if (on) {
        ensureElementsProxy();
        if (elementsParent) elementsParent.visible = false;
        if (elementsProxy) elementsProxy.visible = true;
      } else {
        if (elementsParent) elementsParent.visible = true;
        if (elementsProxy) elementsProxy.visible = false;
      }
    }
    controls.addEventListener('start', () => {
      isOrbiting = true;
      dampingFrames = 0;
      renderer.setPixelRatio(1);
      setLowDetail(true);
    });
    controls.addEventListener('end', () => {
      isOrbiting = false;
      dampingFrames = 20;
      renderer.setPixelRatio(idlePixelRatio);
      setLowDetail(false);
      invalidate();
    });

    // Listen for global zoom-to-fit event (dispatched by F key from Toolbar)
    const handleZoomToFitEvent = () => { zoomToFit(); }; // zoomToFit() calls invalidate() internally
    window.addEventListener('stabileo-zoom-to-fit', handleZoomToFitEvent);

    // Listen for camera restore event (dispatched on tab switch)
    const handleRestoreCamera = () => {
      const pos = uiStore.cameraPosition3D;
      const tgt = uiStore.cameraTarget3D;
      setCameraUp(camera);
      camera.position.set(pos.x, pos.y, pos.z);
      controls.target.set(tgt.x, tgt.y, tgt.z);
      controls.update();
      invalidate();
    };
    window.addEventListener('stabileo-restore-camera-3d', handleRestoreCamera);

    // Keyboard shortcuts for 3D viewport
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showCoordDialog) { cancelCoordDialog(); return; }
        if (uiStore.measureMode) { clearMeasureVisuals(); }
      }
      // "N" opens coordinate dialog when node tool is active (and no input is focused)
      if (e.key === 'n' && uiStore.currentTool === 'node' && !showCoordDialog) {
        const active = document.activeElement;
        if (!active || (active.tagName !== 'INPUT' && active.tagName !== 'TEXTAREA' && active.tagName !== 'SELECT')) {
          e.preventDefault();
          openCoordDialog();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      initialized = false;
      cancelAnimationFrame(animFrameId);
      ro.disconnect();
      renderer.dispose();
      controls.dispose();
      window.removeEventListener('stabileo-zoom-to-fit', handleZoomToFitEvent);
      window.removeEventListener('stabileo-restore-camera-3d', handleRestoreCamera);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keydown', onNavKeyDown);
      window.removeEventListener('keyup', onNavKeyUp);
      if (renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
    };
  });

  // ═══════════════════════════════════════════════════════════════
  //  SYNC CONTEXT — shared mutable state for scene-sync + results-sync
  // ═══════════════════════════════════════════════════════════════

  // Context objects (initialized in onMount, used by sync functions)
  let sceneCtx: SceneSyncContext;
  let resultsCtx: ResultsSyncContext;

  function initSyncContexts() {
    sceneCtx = {
      initialized: false,
      nodesParent, elementsParent, supportsParent, loadsParent, resultsParent, shellsParent, scene,
      nodeMeshes, elementGroups, supportGizmos,
      shellGroups: new Map(),
      loadGroup: null,
      colorMapApplied: false,
    };
    resultsCtx = {
      initialized: false,
      resultsParent, scene,
      elementGroups,
      shellGroups: sceneCtx.shellGroups,
      deformedGroup: null, diagramGroup: null, overlayDiagramGroup: null,
      reactionGroup: null, constraintForcesGroup: null, nodeLabelsGroup: null, elementLabelsGroup: null, lengthLabelsGroup: null, verificationLabelsGroup: null,
      lastDeformedAnimScale: null,
      colorMapApplied: false,
    };
  }

  // Thin wrappers that delegate to extracted modules + keep local refs in sync
  function syncNodes() { _syncNodes(sceneCtx); }
  function syncElements() { _syncElements(sceneCtx); }
  function syncSupports() { _syncSupports(sceneCtx); }
  function syncLoads() { _syncLoads(sceneCtx); }
  function syncShells() { _syncShells(sceneCtx); }
  function syncSelection() {
    _syncSelection(sceneCtx);
    // Re-apply color map if active (syncSelection overwrites element colors)
    const dt = resultsStore.diagramType;
    if (resultsStore.results3D && (dt === 'axialColor' || dt === 'colorMap' || dt === 'verification')) {
      syncColorMap3D();
    }
  }
  function syncDeformed(scaleOverride?: number) {
    _syncDeformed(resultsCtx, scaleOverride);
    deformedGroup = resultsCtx.deformedGroup;
  }
  function syncDiagrams3D() {
    _syncDiagrams3D(resultsCtx);
  }
  function syncColorMap3D() {
    _syncColorMap3D(resultsCtx);
    sceneCtx.colorMapApplied = resultsCtx.colorMapApplied;
  }
  function syncVerificationLabels() {
    _syncVerificationLabels(resultsCtx);
  }
  function syncReactions() {
    _syncReactions(resultsCtx);
  }
  function syncConstraintForces() {
    _syncConstraintForces(resultsCtx);
  }
  function syncLabels3D() {
    _syncLabels3D(resultsCtx);
  }

  // ─── Clear stress query when leaving stress mode ────────────
  $effect(() => {
    if (uiStore.selectMode !== 'stress') {
      resultsStore.stressQuery = null;
    }
  });
  $effect(() => {
    if (!resultsStore.results3D && uiStore.selectMode === 'stress' && !uiStore.liveCalc) {
      uiStore.selectMode = 'elements';
    }
  });

  // ─── Reactive effects ────────────────────────────────────────
  $effect(() => {
    // Trigger on model changes
    modelStore.nodes;
    syncNodes();
    syncElements(); // elements depend on nodes for position
    syncSupports();
    syncLoads();
    syncShells(); // shells depend on node positions
    invalidate();
  });

  $effect(() => {
    modelStore.elements;
    syncElements();
    syncLoads(); // loads reference elements
    invalidate();
  });

  $effect(() => {
    modelStore.plates;
    modelStore.quads;
    syncShells();
    invalidate();
  });

  $effect(() => {
    uiStore.renderMode3D;
    syncElements();
    invalidate();
  });

  $effect(() => {
    modelStore.modelVersion;
    uiStore.analysisMode;
    syncResultsProjection();
    invalidate();
  });

  $effect(() => {
    modelStore.supports;
    syncSupports();
    invalidate();
  });

  $effect(() => {
    modelStore.loads;
    uiStore.showLoads3D;
    uiStore.hideLoadsWithDiagram;
    uiStore.momentStyle3D;
    resultsStore.diagramType;
    syncLoads();
    invalidate();
  });

  $effect(() => {
    resultsStore.results3D;
    resultsStore.diagramType;
    resultsStore.deformedScale;
    resultsStore.modalResult3D;
    resultsStore.activeModeIndex;
    resultsStore.bucklingResult3D;
    resultsStore.activeBucklingMode;
    const animating = resultsStore.animateDeformed;
    const dt = resultsStore.diagramType;
    if (resultsCtx) resultsCtx.lastDeformedAnimScale = null;
    // Mode shapes and buckling modes always animate from the render loop
    if (dt === 'modeShape' || dt === 'bucklingMode') { invalidate(); return; }
    // Always sync deformed to clean up old geometry when diagram type changes.
    // When animation is active AND we're still showing deformed, the render
    // loop will keep updating — but syncDeformed is idempotent (removes + recreates).
    syncDeformed();
    invalidate();
  });

  // When animation state changes, kick the render loop
  $effect(() => {
    resultsStore.animateDeformed;
    resultsStore.animSpeed;
    invalidate();
  });

  $effect(() => {
    resultsStore.results3D;
    resultsStore.diagramType;
    resultsStore.diagramScale;
    resultsStore.showDiagramValues;
    resultsStore.overlayResults3D;
    resultsStore.isEnvelopeActive;
    resultsStore.fullEnvelope3D;
    syncDiagrams3D();
    invalidate();
  });

  $effect(() => {
    resultsStore.results3D;
    resultsStore.diagramType;
    resultsStore.colorMapKind;
    // Also react to verification store changes for 'verification' color map
    verificationStore.concrete;
    verificationStore.steel;
    syncColorMap3D();
    syncVerificationLabels();
    invalidate();
  });

  $effect(() => {
    resultsStore.results3D;
    resultsStore.showReactions;
    syncReactions();
    invalidate();
  });

  $effect(() => {
    resultsStore.constraintForces3D;
    resultsStore.showConstraintForces;
    syncConstraintForces();
    invalidate();
  });

  $effect(() => {
    uiStore.selectedNodes;
    uiStore.selectedElements;
    uiStore.selectedSupports;
    syncSelection();
    invalidate();
  });

  $effect(() => {
    modelStore.nodes;
    modelStore.elements;
    uiStore.showNodeLabels3D;
    uiStore.showElementLabels3D;
    uiStore.showLengths3D;
    syncLabels3D();
    invalidate();
  });

  // Reactive grid: update when working plane, grid size, nodeCreateZ change
  $effect(() => {
    uiStore.workingPlane;
    uiStore.nodeCreateZ;
    uiStore.gridSize3D;
    uiStore.gridExtent3D;
    uiStore.showGrid3D;
    updateGrid();
    invalidate();
  });

  // Reactive axes visibility: gizmo replaces world-origin axes in Basic 3D and PRO
  $effect(() => {
    const show = uiStore.showAxes3D;
    const mode = uiStore.analysisMode;
    // Hide world-origin axes in Basic 3D and PRO (gizmo replaces them)
    const hideWorldAxes = mode === '3d' || mode === 'pro';
    if (axesHelper) axesHelper.visible = show && !hideWorldAxes;
    for (const s of axisLabelSprites) s.visible = show && !hideWorldAxes;
    // Gizmo visibility follows the setting
    if (gizmoCanvas) gizmoCanvas.style.display = show ? 'block' : 'none';
    invalidate();
  });

  // Reactive clipping plane: invalidate when clipping settings change
  $effect(() => {
    uiStore.clippingEnabled;
    uiStore.clippingAxis;
    uiStore.clippingPosition;
    invalidate();
  });

  // Cancel pending element when tool changes
  $effect(() => {
    uiStore.currentTool;
    cancelPendingElement();
  });

  // ─── Stress query marker in 3D viewport ─────────────────────
  let stressMarkerGroup: THREE.Group | null = null;

  $effect(() => {
    const sq = resultsStore.stressQuery;

    // Remove old marker
    if (stressMarkerGroup) {
      resultsParent.remove(stressMarkerGroup);
      disposeObject(stressMarkerGroup);
      stressMarkerGroup = null;
    }

    if (!sq || !resultsStore.results3D || !initialized) return;

    stressMarkerGroup = new THREE.Group();
    const pos = new THREE.Vector3(sq.worldX, sq.worldY, sq.worldZ ?? 0);

    // Sphere marker at query position
    const sphereGeo = new THREE.SphereGeometry(0.08, 16, 12);
    const sphereMat = new THREE.MeshBasicMaterial({
      color: 0xff4488,
      transparent: true,
      opacity: 0.85,
      depthTest: false,
    });
    const sphere = new THREE.Mesh(sphereGeo, sphereMat);
    sphere.position.copy(pos);
    sphere.renderOrder = 2;
    stressMarkerGroup.add(sphere);

    // Cross lines (3 orthogonal lines through the point)
    const crossLen = 0.15;
    const crossMat = new THREE.LineBasicMaterial({ color: 0xff4488, depthTest: false });
    for (const dir of [GLOBAL_X, GLOBAL_Y, GLOBAL_Z]) {
      const pts = [
        pos.clone().sub(dir.clone().multiplyScalar(crossLen)),
        pos.clone().add(dir.clone().multiplyScalar(crossLen)),
      ];
      const lineGeo = new THREE.BufferGeometry().setFromPoints(pts);
      const line = new THREE.Line(lineGeo, crossMat);
      line.renderOrder = 2;
      stressMarkerGroup.add(line);
    }

    // Label
    const label = createTextSprite('σ', '#ff4488', 32);
    label.position.copy(pos).add(new THREE.Vector3(0.12, 0.12, 0));
    label.renderOrder = 2;
    stressMarkerGroup.add(label);

    resultsParent.add(stressMarkerGroup);
    invalidate();
  });

  // Clean up measurement visuals when measureMode is toggled off
  $effect(() => {
    if (!uiStore.measureMode) {
      clearMeasureVisuals();
      invalidate();
    }
  });

  // ═══════════════════════════════════════════════════════════════
  //  INTERACTION
  // ═══════════════════════════════════════════════════════════════

  function updateMouseNDC(e: MouseEvent) {
    if (!container) return;
    const rect = container.getBoundingClientRect();
    mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  }

  // ─── Context menu (right-click) ──────────────────────────
  function handleContextMenu3D(e: MouseEvent) {
    e.preventDefault();
    updateMouseNDC(e);
    if (!camera) return;
    raycaster.setFromCamera(mouse, camera);
    raycaster.camera = camera;

    // Raycast nodes first, then elements
    const nodeHits = raycaster.intersectObjects(nodesParent.children, true);
    for (const hit of nodeHits) {
      const ud = findUserData(hit.object);
      if (ud?.type === 'node') {
        uiStore.contextMenu = { x: e.clientX, y: e.clientY, nodeId: ud.id };
        return;
      }
    }

    const elemHits = raycaster.intersectObjects(elementsParent.children, true);
    for (const hit of elemHits) {
      const ud = findUserData(hit.object);
      if (ud?.type === 'element') {
        uiStore.contextMenu = { x: e.clientX, y: e.clientY, elementId: ud.id };
        return;
      }
    }

    // Clicked empty space → context menu without specific entity
    uiStore.contextMenu = { x: e.clientX, y: e.clientY };
  }

  function handleMouseDown(e: MouseEvent) {
    if (e.button === 0) {
      mouseDownPos = { x: e.clientX, y: e.clientY };

      const tool = uiStore.currentTool;

      // In select/pan tool: check for node drag or box select initiation
      if (tool === 'select' || tool === 'pan') {
        const nodeId = findNodeHit(e);

        if (nodeId !== null && tool === 'select') {
          // Start dragging this node
          controls.enabled = false;
          historyStore.pushState();
          draggedNodeId3D = nodeId;
          dragMoved3D = false;
          dragStartWorld3D = getGroundIntersection(e);

          // If node isn't selected, select it (with shift for additive)
          if (!uiStore.selectedNodes.has(nodeId) && !e.shiftKey) {
            uiStore.selectNode(nodeId, false);
          } else if (!uiStore.selectedNodes.has(nodeId) && e.shiftKey) {
            uiStore.selectNode(nodeId, true);
          }
        } else if (nodeId === null && tool === 'select') {
          // Always start box select candidate — distinguish click vs drag in mouseUp
          const rect = container.getBoundingClientRect();
          const mx = e.clientX - rect.left;
          const my = e.clientY - rect.top;
          boxSelect3D = { startX: mx, startY: my, endX: mx, endY: my, additive: e.shiftKey };
          controls.enabled = false;
        }
      }
    }
  }

  // ─── Ground plane intersection for node creation ──────────
  function getGroundIntersection(e: MouseEvent): THREE.Vector3 | null {
    updateMouseNDC(e);
    if (!camera) return null;
    return _getGroundIntersection(raycaster, mouse, camera, uiStore.workingPlane, uiStore.nodeCreateZ);
  }

  // ─── Find first node hit by raycast ───────────────────────
  function findNodeHit(e: MouseEvent): number | null {
    updateMouseNDC(e);
    if (!camera) return null;
    return _findNodeHit(raycaster, mouse, camera, nodesParent);
  }

  // ─── Find first element hit by raycast ────────────────────
  function findElementHit(e: MouseEvent): number | null {
    updateMouseNDC(e);
    if (!camera) return null;
    return _findElementHit(raycaster, mouse, camera, elementsParent);
  }

  // ─── Tool handlers ─────────────────────────────────────────

  function handleNodeTool(e: MouseEvent) {
    const pos = getGroundIntersection(e);
    if (!pos) return;

    // Full 3D snap: snap all coordinates to grid
    const snapped = uiStore.snapWorld3D(pos.x, pos.y, pos.z);
    historyStore.pushState();
    const id = modelStore.addNode(snapped.x, snapped.y, snapped.z);
    uiStore.selectNode(id, false);
    uiStore.toast(t('viewport3d.nodeCreated').replace('{id}', String(id)), 'success');
  }

  function handleElementTool(e: MouseEvent) {
    const nodeId = findNodeHit(e);
    if (nodeId === null) {
      // Clicked empty → cancel pending
      cancelPendingElement();
      return;
    }

    if (pendingElementNodeI === null) {
      // First click → set node I
      pendingElementNodeI = nodeId;
      uiStore.selectNode(nodeId, false);

      // Highlight node I
      const mesh = nodeMeshes.get(nodeId);
      if (mesh) setMeshColor(mesh, 0x00ff00);
      uiStore.toast(t('viewport3d.nodeIClickJ').replace('{id}', String(nodeId)), 'info');
    } else {
      // Second click → create element
      if (nodeId === pendingElementNodeI) return; // same node

      historyStore.pushState();
      const elemId = modelStore.addElement(pendingElementNodeI, nodeId, uiStore.elementCreateType);
      uiStore.selectElement(elemId, false);
      uiStore.toast(t('viewport3d.elementCreated').replace('{id}', String(elemId)), 'success');

      // Clean up
      cancelPendingElement();
    }
  }

  function cancelPendingElement() {
    let changed = false;
    if (pendingElementNodeI !== null) {
      // Restore node color
      const mesh = nodeMeshes.get(pendingElementNodeI);
      if (mesh) setMeshColor(mesh, COLORS.node);
      changed = true;
    }
    pendingElementNodeI = null;
    if (pendingLine) {
      scene?.remove(pendingLine);
      pendingLine.geometry?.dispose();
      (pendingLine.material as THREE.Material)?.dispose();
      pendingLine = null;
      changed = true;
    }
    if (changed) invalidate();
  }

  function handleSupportTool(e: MouseEvent) {
    const nodeId = findNodeHit(e);
    if (nodeId === null) return;

    const is3D = uiStore.analysisMode === '3d' || uiStore.analysisMode === 'pro';

    historyStore.pushState();

    if (is3D) {
      // Per-DOF 3D support creation
      const dofRestraints = {
        tx: uiStore.sup3dTx, ty: uiStore.sup3dTy, tz: uiStore.sup3dTz,
        rx: uiStore.sup3dRx, ry: uiStore.sup3dRy, rz: uiStore.sup3dRz,
      };

      // Determine visual type for gizmo
      const allFixed = dofRestraints.tx && dofRestraints.ty && dofRestraints.tz &&
                       dofRestraints.rx && dofRestraints.ry && dofRestraints.rz;
      const onlyTrans = dofRestraints.tx && dofRestraints.ty && dofRestraints.tz &&
                        !dofRestraints.rx && !dofRestraints.ry && !dofRestraints.rz;
      const noneFixed = !dofRestraints.tx && !dofRestraints.ty && !dofRestraints.tz &&
                        !dofRestraints.rx && !dofRestraints.ry && !dofRestraints.rz;

      const type: import('../lib/store/model.svelte.ts').SupportType =
        allFixed ? 'fixed3d' : onlyTrans ? 'pinned3d' : noneFixed ? 'spring3d' : 'custom3d';

      // Collect springs for unchecked DOFs that have stiffness values
      let springs: { kx?: number; ky?: number; kz?: number; krx?: number; kry?: number; krz?: number } | undefined;
      const hasSpring = (!dofRestraints.tx && uiStore.sup3dKx > 0) ||
                        (!dofRestraints.ty && uiStore.sup3dKy > 0) ||
                        (!dofRestraints.tz && uiStore.sup3dKz > 0) ||
                        (!dofRestraints.rx && uiStore.sup3dKrx > 0) ||
                        (!dofRestraints.ry && uiStore.sup3dKry > 0) ||
                        (!dofRestraints.rz && uiStore.sup3dKrz > 0);
      if (hasSpring || noneFixed) {
        springs = {};
        if (!dofRestraints.tx && uiStore.sup3dKx > 0) springs.kx = uiStore.sup3dKx;
        if (!dofRestraints.ty && uiStore.sup3dKy > 0) springs.ky = uiStore.sup3dKy;
        if (!dofRestraints.tz && uiStore.sup3dKz > 0) springs.kz = uiStore.sup3dKz;
        if (!dofRestraints.rx && uiStore.sup3dKrx > 0) springs.krx = uiStore.sup3dKrx;
        if (!dofRestraints.ry && uiStore.sup3dKry > 0) springs.kry = uiStore.sup3dKry;
        if (!dofRestraints.rz && uiStore.sup3dKrz > 0) springs.krz = uiStore.sup3dKrz;
      }

      const opts: any = { dofRestraints, dofFrame: uiStore.supportFrame3D };
      const supId = modelStore.addSupport(nodeId, type, springs, opts);
      uiStore.selectSupport(supId, false);
      uiStore.toast(t('viewport3d.supportCreated').replace('{id}', String(supId)).replace('{nid}', String(nodeId)), 'success');
    } else {
      // 2D support creation (unchanged)
      const type = toSupportType(uiStore.supportType, uiStore.supportDirection);
      let springs: { kx?: number; ky?: number; kz?: number } | undefined;
      if (type === 'spring') {
        springs = { kx: uiStore.springKx, ky: uiStore.springKy, kz: uiStore.springKz };
      }
      const opts: { angle?: number; isGlobal?: boolean; dx?: number; dy?: number; drz?: number } = {};
      opts.angle = uiStore.supportAngle;
      opts.isGlobal = uiStore.supportIsGlobal;
      if (uiStore.supportDx !== 0) opts.dx = uiStore.supportDx;
      if (uiStore.supportDy !== 0) opts.dy = uiStore.supportDy;
      if (uiStore.supportDrz !== 0) opts.drz = uiStore.supportDrz;
      const supId = modelStore.addSupport(nodeId, type as any, springs, opts);
      uiStore.selectSupport(supId, false);
      uiStore.toast(t('viewport3d.supportCreated').replace('{id}', String(supId)).replace('{nid}', String(nodeId)), 'success');
    }
  }

  function handleLoadTool(e: MouseEvent) {
    const is3D = uiStore.analysisMode === '3d' || uiStore.analysisMode === 'pro';

    if (uiStore.loadType === 'nodal') {
      const nodeId = findNodeHit(e);
      if (nodeId === null) return;

      historyStore.pushState();
      if (is3D) {
        // Build 3D nodal load from direction + value
        const dir = uiStore.nodalLoadDir3D;
        const val = uiStore.loadValue;
        const fx = dir === 'fx' ? val : 0;
        const fy = dir === 'fy' ? val : 0;
        const fz = dir === 'fz' ? val : 0;
        const mx = dir === 'mx' ? val : 0;
        const my = dir === 'my' ? val : 0;
        const mz = dir === 'mz' ? val : 0;
        modelStore.addNodalLoad3D(nodeId, fx, fy, fz, mx, my, mz, uiStore.activeLoadCaseId);
      } else {
        // 2D nodal load
        const dir = uiStore.nodalLoadDir;
        const val = uiStore.loadValue;
        const fx = dir === 'fx' ? val : 0;
        const fz = dir === 'fz' ? val : 0;
        const my = dir === 'my' ? val : 0;
        modelStore.addNodalLoad(nodeId, fx, fz, my, uiStore.activeLoadCaseId);
      }
      uiStore.toast(t('viewport3d.pointLoadApplied').replace('{id}', String(nodeId)), 'success');
    } else if (uiStore.loadType === 'distributed') {
      const elemId = findElementHit(e);
      if (elemId === null) return;

      historyStore.pushState();
      if (is3D) {
        const qY = uiStore.loadValue;
        const qZ = uiStore.loadValueZ;
        modelStore.addDistributedLoad3D(elemId, qY, uiStore.loadValueJ, qZ, uiStore.loadValueZJ, undefined, undefined, uiStore.activeLoadCaseId);
      } else {
        modelStore.addDistributedLoad(elemId, uiStore.loadValue, uiStore.loadValueJ, undefined, undefined, uiStore.activeLoadCaseId);
      }
      uiStore.toast(t('viewport3d.distLoadApplied').replace('{id}', String(elemId)), 'success');
    }
  }

  function toSupportType(tool: string, direction: 'x' | 'y'): string {
    if (tool === 'roller') return direction === 'x' ? 'rollerX' : 'rollerZ';
    return tool;
  }


  /** Find nearest existing node within threshold (3D distance) */
  function findNearestNode3D(worldPos: THREE.Vector3, threshold = 0.3): number | null {
    let bestId: number | null = null;
    let bestDist = threshold;
    for (const [id, node] of modelStore.nodes) {
      const dx = node.x - worldPos.x;
      const dy = node.y - worldPos.y;
      const dz = (node.z ?? 0) - worldPos.z;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d < bestDist) {
        bestDist = d;
        bestId = id;
      }
    }
    return bestId;
  }

  // ─── Measurement tool ──────────────────────────────────────

  function clearMeasureVisuals() {
    if (measureGroup) {
      scene?.remove(measureGroup);
      disposeObject(measureGroup);
      measureGroup = null;
    }
    uiStore.measurePoints = [];
  }

  function handleMeasureTool(e: MouseEvent) {
    const currentPoints = uiStore.measurePoints;

    // Third click → reset
    if (currentPoints.length >= 2) {
      clearMeasureVisuals();
      return;
    }

    // Raycast: try to snap to nearest node first
    updateMouseNDC(e);
    if (!camera) return;
    raycaster.setFromCamera(mouse, camera);
    raycaster.camera = camera;

    let worldPoint: THREE.Vector3 | null = null;

    // Check proximity to any node in world space (within 0.5 units)
    const planeHit = getGroundIntersection(e);
    if (planeHit) {
      const nearNodeId = findNearestNode3D(planeHit, 0.5);
      if (nearNodeId !== null) {
        const n = modelStore.nodes.get(nearNodeId);
        if (n) {
          worldPoint = new THREE.Vector3(n.x, n.y, n.z ?? 0);
        }
      }
    }

    // If no node snap, use working plane intersection
    if (!worldPoint) {
      worldPoint = planeHit;
    }

    if (!worldPoint) return;

    const pt = { x: worldPoint.x, y: worldPoint.y, z: worldPoint.z };

    // Ensure measureGroup exists
    if (!measureGroup) {
      measureGroup = new THREE.Group();
      measureGroup.name = 'measurement';
      scene.add(measureGroup);
    }

    // Create red sphere at point
    const sphereGeo = new THREE.SphereGeometry(0.15, 16, 16);
    const sphereMat = new THREE.MeshStandardMaterial({ color: 0xff0000, depthTest: false });
    const sphere = new THREE.Mesh(sphereGeo, sphereMat);
    sphere.position.set(pt.x, pt.y, pt.z);
    sphere.renderOrder = 999;
    measureGroup.add(sphere);

    if (currentPoints.length === 0) {
      // First point (A)
      uiStore.measurePoints = [pt];
    } else {
      // Second point (B)
      const A = currentPoints[0];
      const B = pt;
      uiStore.measurePoints = [A, B];

      // Draw dashed line between A and B
      const lineGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(A.x, A.y, A.z),
        new THREE.Vector3(B.x, B.y, B.z),
      ]);
      const lineMat = new THREE.LineDashedMaterial({
        color: 0xff4444,
        dashSize: 0.2,
        gapSize: 0.1,
        depthTest: false,
      });
      const line = new THREE.Line(lineGeo, lineMat);
      line.computeLineDistances();
      line.renderOrder = 999;
      measureGroup.add(line);

      // Compute distance
      const dx = B.x - A.x;
      const dy = B.y - A.y;
      const dz = B.z - A.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

      // Show distance label at midpoint
      const mx = (A.x + B.x) / 2;
      const my = (A.y + B.y) / 2;
      const mz = (A.z + B.z) / 2;

      // Compute model-size-relative scale for the label
      const box = new THREE.Box3();
      const project2D = shouldProject2DModel();
      for (const [, node] of modelStore.nodes) {
        const pos = projectNodeToScene(node, project2D);
        box.expandByPoint(new THREE.Vector3(pos.x, pos.y, pos.z));
      }
      const size = box.getSize(new THREE.Vector3());
      const modelSize = Math.max(size.x, size.y, size.z, 1);
      const spriteScale = modelSize * 0.04;

      const label = createTextSprite(`${dist.toFixed(3)} m`, '#ff4444', 32);
      label.position.set(mx, my, mz + spriteScale * 0.5);
      label.scale.set(spriteScale, spriteScale, 1);
      label.renderOrder = 1000;
      measureGroup.add(label);

      // Toast with distance
      uiStore.toast(t('viewport3d.distance').replace('{dist}', dist.toFixed(3)), 'info');
    }
    invalidate();
  }

  // ─── Helper: project a 3D world point to screen coords ────
  function projectToScreen(wx: number, wy: number, wz: number): { x: number; y: number } {
    const v = new THREE.Vector3(wx, wy, wz);
    v.project(camera);
    const rect = container.getBoundingClientRect();
    return {
      x: (v.x * 0.5 + 0.5) * rect.width,
      y: (-v.y * 0.5 + 0.5) * rect.height,
    };
  }

  // segmentsIntersect2D & segmentIntersectsRect2D imported from ../lib/viewport3d/picking

  // ─── Main mouse up handler ─────────────────────────────────
  function handleMouseUp(e: MouseEvent) {
    if (e.button !== 0) return;

    // ── Finalize node dragging ──
    if (draggedNodeId3D !== null) {
      if (!dragMoved3D) {
        // No movement → undo the pushState
        historyStore.undo();
      }
      draggedNodeId3D = null;
      dragMoved3D = false;
      dragStartWorld3D = null;
      controls.enabled = true;
      return;
    }

    // ── Finalize box selection (AutoCAD-style Window vs Crossing) ──
    if (boxSelect3D) {
      const x1 = Math.min(boxSelect3D.startX, boxSelect3D.endX);
      const y1 = Math.min(boxSelect3D.startY, boxSelect3D.endY);
      const x2 = Math.max(boxSelect3D.startX, boxSelect3D.endX);
      const y2 = Math.max(boxSelect3D.startY, boxSelect3D.endY);
      const isWindow = boxSelect3D.endX >= boxSelect3D.startX;
      const additive = boxSelect3D.additive; // shift was held at drag start

      // Only count as box select if dragged at least a few pixels
      if (x2 - x1 > 3 || y2 - y1 > 3) {
        // Collect new selection items
        const newNodes = additive ? new Set(uiStore.selectedNodes) : new Set<number>();
        const newElems = additive ? new Set(uiStore.selectedElements) : new Set<number>();

        // Nodes: project to screen, check containment
        const project2D = shouldProject2DModel();
        for (const node of modelStore.nodes.values()) {
          const pos = projectNodeToScene(node, project2D);
          const s = projectToScreen(pos.x, pos.y, pos.z);
          if (s.x >= x1 && s.x <= x2 && s.y >= y1 && s.y <= y2) {
            newNodes.add(node.id);
          }
        }
        // Elements: project both endpoints
        for (const elem of modelStore.elements.values()) {
          const ni = modelStore.getNode(elem.nodeI);
          const nj = modelStore.getNode(elem.nodeJ);
          if (!ni || !nj) continue;
          const siPos = projectNodeToScene(ni, project2D);
          const sjPos = projectNodeToScene(nj, project2D);
          const si = projectToScreen(siPos.x, siPos.y, siPos.z);
          const sj = projectToScreen(sjPos.x, sjPos.y, sjPos.z);
          const iIn = si.x >= x1 && si.x <= x2 && si.y >= y1 && si.y <= y2;
          const jIn = sj.x >= x1 && sj.x <= x2 && sj.y >= y1 && sj.y <= y2;

          if (isWindow) {
            if (iIn && jIn) newElems.add(elem.id);
          } else {
            if ((iIn || jIn) || segmentIntersectsRect2D(si.x, si.y, sj.x, sj.y, x1, y1, x2, y2)) {
              newElems.add(elem.id);
            }
          }
        }

        // Reassign sets to trigger Svelte reactivity
        uiStore.setSelection(newNodes, newElems);
      } else {
        // Small drag = click → delegate to normal click selection
        boxSelect3D = null;
        controls.enabled = true;
        handleSelectionClick(e);
        return;
      }
      boxSelect3D = null;
      controls.enabled = true;
      return;
    }

    // Only count as click if mouse didn't move much (not an orbit drag)
    const dx = e.clientX - mouseDownPos.x;
    const dy = e.clientY - mouseDownPos.y;
    if (Math.abs(dx) > 5 || Math.abs(dy) > 5) return;

    // Measurement tool intercepts all clicks when active
    if (uiStore.measureMode) {
      handleMeasureTool(e);
      return;
    }

    // Dispatch based on active tool
    const tool = uiStore.currentTool;

    if (tool === 'node') {
      handleNodeTool(e);
      return;
    }
    if (tool === 'element') {
      handleElementTool(e);
      return;
    }
    if (tool === 'support') {
      handleSupportTool(e);
      return;
    }
    if (tool === 'load') {
      handleLoadTool(e);
      return;
    }

    // Default: selection (select or pan tool)
    handleSelectionClick(e);
  }

  function handleSelectionClick(e: MouseEvent) {
    updateMouseNDC(e);
    if (!camera) return;

    raycaster.setFromCamera(mouse, camera);
    raycaster.camera = camera;

    // ── Stress mode: click on element → stress query ──
    if (uiStore.selectMode === 'stress' && resultsStore.results3D) {
      const elemHits = raycaster.intersectObjects(elementsParent.children, true);
      for (const hit of elemHits) {
        const ud = findUserData(hit.object);
        if (ud?.type === 'element') {
          const elem = modelStore.elements.get(ud.id);
          if (!elem) continue;
          const ni = modelStore.getNode(elem.nodeI);
          const nj = modelStore.getNode(elem.nodeJ);
          if (!ni || !nj) continue;
          const niz = ni.z ?? 0;
          const njz = nj.z ?? 0;
          const edx = nj.x - ni.x;
          const edy = nj.y - ni.y;
          const edz = njz - niz;
          const lenSq = edx * edx + edy * edy + edz * edz;
          if (lenSq < 1e-12) continue;
          // Project hit point onto element axis to get t
          const p = hit.point;
          let t = ((p.x - ni.x) * edx + (p.y - ni.y) * edy + (p.z - niz) * edz) / lenSq;
          t = Math.max(0, Math.min(1, t));
          const wx = ni.x + t * edx;
          const wy = ni.y + t * edy;
          const wz = niz + t * edz;
          resultsStore.stressQuery = { elementId: ud.id, t, worldX: wx, worldY: wy, worldZ: wz };
          uiStore.selectElement(ud.id);
          return;
        }
      }
      // Clicked empty → clear stress query
      resultsStore.stressQuery = null;
      return;
    }

    // Raycast against model objects (nodes first, then elements, then supports)
    const nodeHits = raycaster.intersectObjects(nodesParent.children, true);
    const elemHits = raycaster.intersectObjects(elementsParent.children, true);
    const supHits = raycaster.intersectObjects(supportsParent.children, true);

    const addToSel = e.shiftKey;

    // Priority: node > element > support
    for (const hit of nodeHits) {
      const ud = findUserData(hit.object);
      if (ud?.type === 'node') {
        uiStore.selectNode(ud.id, addToSel);
        return;
      }
    }

    for (const hit of elemHits) {
      const ud = findUserData(hit.object);
      if (ud?.type === 'element') {
        uiStore.selectElement(ud.id, addToSel);
        // Sync with DSM Matrix Explorer if wizard is open
        if (dsmStepsStore.isOpen) dsmStepsStore.selectElement(ud.id);
        return;
      }
    }

    for (const hit of supHits) {
      const ud = findUserData(hit.object);
      if (ud?.type === 'support') {
        uiStore.selectSupport(ud.id, addToSel);
        return;
      }
    }

    // Clicked on empty space → clear selection
    if (!addToSel) {
      uiStore.clearSelection();
    }
  }

  function handleMouseMove(e: MouseEvent) {
    updateMouseNDC(e);
    if (!camera || !initialized) return;

    // Update status bar with 3D world position (cheap single-plane raycast)
    raycaster.setFromCamera(mouse, camera);
    raycaster.camera = camera;
    const wp = uiStore.workingPlane;
    let groundPlane: THREE.Plane;
    if (wp === 'XY') {
      groundPlane = new THREE.Plane(planeNormal('XY'), -uiStore.nodeCreateZ);
    } else if (wp === 'YZ') {
      groundPlane = new THREE.Plane(planeNormal('YZ'), -uiStore.nodeCreateZ);
    } else {
      groundPlane = new THREE.Plane(planeNormal('XZ'), -uiStore.nodeCreateZ);
    }
    const worldPt = new THREE.Vector3();
    if (raycaster.ray.intersectPlane(groundPlane, worldPt)) {
      const rect = container.getBoundingClientRect();
      uiStore.setMouse(e.clientX - rect.left, e.clientY - rect.top, worldPt.x, worldPt.y);
    }

    // Schedule the expensive hover/diagram raycast on the next animation frame.
    // During orbit we clear any stale hover and skip entirely — recursive raycasts
    // over a large scene are the main cost of orbit on pro fixtures.
    scheduleHoverRaycast(e);

    // ─── Node dragging ────────────────────────────────────────
    if (draggedNodeId3D !== null && dragStartWorld3D) {
      const newWorld = getGroundIntersection(e);
      if (newWorld) {
        const snapped = uiStore.snapWorld3D(newWorld.x, newWorld.y, newWorld.z);
        const snappedVec = new THREE.Vector3(snapped.x, snapped.y, snapped.z);
        const delta = snappedVec.clone().sub(dragStartWorld3D);

        if (uiStore.selectedNodes.size > 1 && uiStore.selectedNodes.has(draggedNodeId3D)) {
          for (const nodeId of uiStore.selectedNodes) {
            const node = modelStore.getNode(nodeId);
            if (node) {
              modelStore.updateNode(nodeId, node.x + delta.x, node.y + delta.y, (node.z ?? 0) + delta.z);
            }
          }
        } else {
          modelStore.updateNode(draggedNodeId3D, snapped.x, snapped.y, snapped.z);
        }

        dragStartWorld3D = snappedVec;
        dragMoved3D = true;
        resultsStore.clear();
        resultsStore.clear3D();
      }
      return;
    }

    // ─── Box selection tracking ───────────────────────────────
    if (boxSelect3D) {
      const rect = container.getBoundingClientRect();
      boxSelect3D = { ...boxSelect3D, endX: e.clientX - rect.left, endY: e.clientY - rect.top };
      return;
    }

    // ─── Preview line for element creation tool ──────────────
    // Uses cached hoveredData (may lag ≤1 frame behind mouse) so this stays cheap.
    if (uiStore.currentTool === 'element' && pendingElementNodeI !== null && scene) {
      const nodeI = modelStore.nodes.get(pendingElementNodeI);
      if (nodeI) {
        const groundPt = getGroundIntersection(e);
        let endPt: THREE.Vector3;
        if (hoveredData?.type === 'node') {
          const nJ = modelStore.nodes.get(hoveredData.id);
          endPt = nJ ? new THREE.Vector3(nJ.x, nJ.y, nJ.z ?? 0) : (groundPt ?? new THREE.Vector3());
        } else {
          endPt = groundPt ?? new THREE.Vector3();
        }

        const startPt = new THREE.Vector3(nodeI.x, nodeI.y, nodeI.z ?? 0);

        if (pendingLine) {
          const pos = pendingLine.geometry.attributes.position as THREE.BufferAttribute;
          pos.setXYZ(0, startPt.x, startPt.y, startPt.z);
          pos.setXYZ(1, endPt.x, endPt.y, endPt.z);
          pos.needsUpdate = true;
          pendingLine.computeLineDistances();
        } else {
          const geo = new THREE.BufferGeometry().setFromPoints([startPt, endPt]);
          const mat = new THREE.LineDashedMaterial({
            color: 0x44ff88,
            dashSize: 0.15,
            gapSize: 0.1,
            depthTest: false,
          });
          pendingLine = new THREE.Line(geo, mat);
          pendingLine.computeLineDistances();
          pendingLine.renderOrder = 999;
          scene.add(pendingLine);
        }
        invalidate();
      }
    }
  }

  /**
   * rAF-coalesce the expensive hover raycast so a burst of mousemove events
   * collapses to one raycast per animation frame. Skips entirely while the user
   * is orbiting — hover is irrelevant during camera manipulation, and the
   * recursive raycast dominates orbit cost on large fixtures.
   */
  function scheduleHoverRaycast(e: MouseEvent) {
    if (isOrbiting) {
      if (hoveredData) {
        restoreColor(hoveredData);
        hoveredData = null;
        hoveredNodeId3D = null;
        invalidate();
      }
      hoverTooltip = null;
      return;
    }
    pendingHoverEvent = e;
    if (hoverRafId !== null) return;
    hoverRafId = requestAnimationFrame(() => {
      hoverRafId = null;
      const ev = pendingHoverEvent;
      pendingHoverEvent = null;
      if (!ev || !camera || !initialized) return;
      // Re-check orbit in case it started between schedule and frame.
      if (isOrbiting) return;
      runHoverRaycast(ev);
    });
  }

  function runHoverRaycast(e: MouseEvent) {
    updateMouseNDC(e);
    raycaster.setFromCamera(mouse, camera);
    raycaster.camera = camera;

    const allPickable = [...nodesParent.children, ...elementsParent.children, ...supportsParent.children];
    const hits = raycaster.intersectObjects(allPickable, true);

    let newHover: { type: string; id: number } | null = null;
    for (const hit of hits) {
      const ud = findUserData(hit.object);
      if (ud) {
        newHover = ud;
        break;
      }
    }

    if (hoveredData && (!newHover || newHover.id !== hoveredData.id || newHover.type !== hoveredData.type)) {
      restoreColor(hoveredData);
    }

    if (newHover && (!hoveredData || newHover.id !== hoveredData.id || newHover.type !== hoveredData.type)) {
      applyHoverColor(newHover);

      const rect = container.getBoundingClientRect();
      let tooltipText = '';
      if (newHover.type === 'node') {
        const n = modelStore.nodes.get(newHover.id);
        if (n) tooltipText = t('viewport3d.nodeTooltip').replace('{id}', String(n.id)).replace('{x}', n.x.toFixed(2)).replace('{y}', n.y.toFixed(2)).replace('{z}', (n.z ?? 0).toFixed(2));
      } else if (newHover.type === 'element') {
        const el = modelStore.elements.get(newHover.id);
        if (el) tooltipText = `Elem ${el.id} [${el.type}] ${el.nodeI}→${el.nodeJ}`;
      } else if (newHover.type === 'support') {
        const s = modelStore.supports.get(newHover.id);
        if (s) tooltipText = t('viewport3d.supportTooltip').replace('{id}', String(s.id)).replace('{type}', s.type);
      }
      if (tooltipText) {
        hoverTooltip = { text: tooltipText, x: e.clientX - rect.left + 15, y: e.clientY - rect.top - 10 };
      }
    }

    if (!newHover) {
      // ─── Diagram hover tooltip ─────────────────────────────────
      const dt = resultsStore.diagramType;
      const r3d = resultsStore.results3D;
      if (r3d && DIAGRAM_3D_TYPES.has(dt) && resultsParent.children.length > 0) {
        const diagramHits = raycaster.intersectObjects(resultsParent.children, true);
        let diagramTooltip: string | null = null;
        for (const hit of diagramHits) {
          const ud = hit.object.userData;
          if (ud?.type === 'diagram3dMesh' || ud?.type === 'diagram3dLine') {
            const elemId: number = ud.elementId;
            const kind: Diagram3DKind = ud.kind;
            const elem = modelStore.elements.get(elemId);
            if (!elem) break;
            const ni = modelStore.getNode(elem.nodeI);
            const nj = modelStore.getNode(elem.nodeJ);
            if (!ni || !nj) break;
            const niz = ni.z ?? 0;
            const njz = nj.z ?? 0;
            // Project hit point onto element axis to get t
            const edx = nj.x - ni.x;
            const edy = nj.y - ni.y;
            const edz = njz - niz;
            const lenSq = edx * edx + edy * edy + edz * edz;
            if (lenSq < 1e-12) break;
            const p = hit.point;
            let t = ((p.x - ni.x) * edx + (p.y - ni.y) * edy + (p.z - niz) * edz) / lenSq;
            t = Math.max(0, Math.min(1, t));
            // Find ElementForces3D for this element
            const ef = r3d.elementForces.find(f => f.elementId === elemId);
            if (!ef) break;
            const val = evaluateDiagramAt(ef, kind, t);
            const formatted = formatDiagramValue3D(val, kind);
            const posLabel = `x=${(t * ef.length).toFixed(2)}m`;
            diagramTooltip = `Elem ${elemId} (${posLabel}): ${formatted}`;
            break;
          }
        }
        if (diagramTooltip) {
          const rect = container.getBoundingClientRect();
          hoverTooltip = { text: diagramTooltip, x: e.clientX - rect.left + 15, y: e.clientY - rect.top - 10 };
        } else {
          hoverTooltip = null;
        }
      } else {
        hoverTooltip = null;
      }
    }

    // Invalidate if hover state changed (material colors were modified)
    if (hoveredData !== newHover) invalidate();
    hoveredData = newHover;
    hoveredNodeId3D = (newHover?.type === 'node') ? newHover.id : null;
  }

  function handleMouseLeave() {
    if (hoverRafId !== null) {
      cancelAnimationFrame(hoverRafId);
      hoverRafId = null;
      pendingHoverEvent = null;
    }
    if (hoveredData) {
      restoreColor(hoveredData);
      hoveredData = null;
      invalidate();
    }
    hoverTooltip = null;
    hoveredNodeId3D = null;

    // Cancel box select / drag on mouse leave
    if (boxSelect3D) {
      boxSelect3D = null;
      controls.enabled = true;
    }
    if (draggedNodeId3D !== null) {
      if (!dragMoved3D) historyStore.undo();
      draggedNodeId3D = null;
      dragMoved3D = false;
      dragStartWorld3D = null;
      controls.enabled = true;
    }
  }

  function restoreColor(data: { type: string; id: number }) {
    if (data.type === 'node') {
      const mesh = nodeMeshes.get(data.id);
      if (mesh) {
        const selected = uiStore.selectedNodes.has(data.id);
        setMeshColor(mesh, selected ? COLORS.nodeSelected : COLORS.node);
      }
    } else if (data.type === 'element') {
      const group = elementGroups.get(data.id);
      if (group) {
        const dt = resultsStore.diagramType;
        if (resultsStore.results3D && (dt === 'axialColor' || dt === 'colorMap' || dt === 'verification')) {
          // Re-apply color map instead of base color
          syncColorMap3D();
        } else {
          const selected = uiStore.selectedElements.has(data.id);
          const elem = modelStore.elements.get(data.id);
          const base = elem?.type === 'truss' ? COLORS.truss : COLORS.frame;
          setGroupColor(group, selected ? COLORS.elementSelected : base);
        }
      }
    } else if (data.type === 'support') {
      const gizmo = supportGizmos.get(data.id);
      if (gizmo) {
        const selected = uiStore.selectedSupports.has(data.id);
        setGroupColor(gizmo, selected ? COLORS.elementSelected : COLORS.support);
      }
    }
  }

  function applyHoverColor(data: { type: string; id: number }) {
    if (data.type === 'node') {
      const mesh = nodeMeshes.get(data.id);
      if (mesh) setMeshColor(mesh, COLORS.nodeHovered);
    } else if (data.type === 'element') {
      const group = elementGroups.get(data.id);
      if (group) {
        // Don't override color map colors with hover
        const dt = resultsStore.diagramType;
        if (dt !== 'axialColor' && dt !== 'colorMap' && dt !== 'verification') {
          setGroupColor(group, COLORS.elementHovered);
        }
      }
    } else if (data.type === 'support') {
      const gizmo = supportGizmos.get(data.id);
      if (gizmo) setGroupColor(gizmo, COLORS.elementHovered);
    }
  }

  // ═══════════════════════════════════════════════════════════════
  //  CAMERA HELPERS
  // ═══════════════════════════════════════════════════════════════


  function zoomToFit() {
    _zoomToFit(camera, controls, modelStore.nodes, orthoCamera, container);
    invalidate();
  }

  function setView(view: 'top' | 'front' | 'side' | 'iso') {
    _setView(view, camera, controls, modelStore.nodes);
    invalidate();
  }

  // ─── 3D Axis gizmo (bottom-left corner) ────────────────────
  let gizmoCanvas: HTMLCanvasElement | null = null;

  function drawAxisGizmo() {
    if (!gizmoCanvas || !camera) return;
    const gc = gizmoCanvas.getContext('2d');
    if (!gc) return;
    const s = gizmoCanvas.width;
    gc.clearRect(0, 0, s, s);

    // Use the rotation part of the view matrix to project world axes to screen
    camera.updateMatrixWorld();
    const viewMat = camera.matrixWorldInverse;
    const axes = [
      { label: 'X', color: '#ff4444', dir: GLOBAL_X.clone() },
      { label: 'Y', color: '#44ff44', dir: GLOBAL_Y.clone() },
      { label: 'Z', color: '#4488ff', dir: GLOBAL_Z.clone() },
    ];

    const cx = s / 2, cy = s / 2, len = s * 0.35;
    const projected = axes.map(a => {
      const d = a.dir.clone().transformDirection(viewMat);
      return { ...a, sx: d.x * len, sy: -d.y * len, depth: d.z };
    }).sort((a, b) => a.depth - b.depth);

    for (const ax of projected) {
      gc.strokeStyle = ax.color;
      gc.lineWidth = 2;
      gc.globalAlpha = ax.depth > 0 ? 1 : 0.3;
      gc.beginPath();
      gc.moveTo(cx, cy);
      gc.lineTo(cx + ax.sx, cy + ax.sy);
      gc.stroke();
      gc.globalAlpha = 1;
      gc.fillStyle = ax.color;
      gc.font = 'bold 12px sans-serif';
      gc.fillText(ax.label, cx + ax.sx * 1.2 - 4, cy + ax.sy * 1.2 + 4);
    }
  }

  function toggleCameraMode() {
    if (!camera || !controls || !renderer) return;
    const isPersp = uiStore.cameraMode3D === 'perspective';
    const newMode = isPersp ? 'orthographic' : 'perspective';
    const from = isPersp ? perspCamera : orthoCamera;
    const to = isPersp ? orthoCamera : perspCamera;

    // Copy position, rotation, up
    to.position.copy(from.position);
    to.up.copy(from.up);
    to.lookAt(controls.target);

    camera = to;
    controls.object = camera;

    // Sync ortho frustum from distance
    if (newMode === 'orthographic') {
      const aspect = container ? container.clientWidth / container.clientHeight : 1;
      syncOrthoFrustum(aspect);
    } else {
      perspCamera.updateProjectionMatrix();
    }

    uiStore.cameraMode3D = newMode;
    invalidate();
  }

  // ─── Utils ──────────────────────────────────────────────────

  function handleResize() {
    if (!container || !renderer || !camera) return;
    _handleResize(container, renderer, perspCamera, orthoCamera, camera, controls);
  }

  function updateClippingPlane() {
    if (!renderer) return;
    if (uiStore.clippingEnabled) {
      // Normal vector: axis direction (clips on negative side of plane)
      const normal = new THREE.Vector3(
        uiStore.clippingAxis === 'x' ? -1 : 0,
        uiStore.clippingAxis === 'y' ? -1 : 0,
        uiStore.clippingAxis === 'z' ? -1 : 0,
      );
      clippingPlane.normal.copy(normal);
      clippingPlane.constant = uiStore.clippingPosition;
      renderer.clippingPlanes = [clippingPlane];
    } else {
      renderer.clippingPlanes = [];
    }
  }

  function syncOrthoFrustum(aspect?: number) {
    if (!orthoCamera || !controls) return;
    const containerAspect = container ? container.clientWidth / container.clientHeight : 1;
    _syncOrthoFrustum(orthoCamera, camera.position, controls.target, containerAspect, aspect);
  }

  function updateGrid() {
    if (!scene) return;
    gridGroup = _updateGrid(scene, gridGroup, uiStore.showGrid3D, uiStore.gridSize3D, uiStore.gridExtent3D, uiStore.workingPlane, uiStore.nodeCreateZ);
  }

  function createFatAxes(): THREE.Group {
    return _createFatAxes(fatLineResolution);
  }

  function addAxisLabels() {
    axisLabelSprites = _addAxisLabels(scene);
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="viewport3d-wrapper"
  bind:this={container}
  style="cursor: {cursorStyle};"
  onmousedown={handleMouseDown}
  onmouseup={handleMouseUp}
  onmousemove={handleMouseMove}
  onmouseleave={handleMouseLeave}
  oncontextmenu={handleContextMenu3D}
>
  <!-- Camera preset buttons -->
  <div class="camera-controls" style="top: {uiStore.floatingToolsTopOffset}px">
    <button onclick={zoomToFit} title={t('viewport3d.zoomToFit')}>⊞</button>
    <button onclick={() => setView('top')} title={t('viewport3d.topView')}>⊤</button>
    <button onclick={() => setView('front')} title={t('viewport3d.frontView')}>⊡</button>
    <button onclick={() => setView('side')} title={t('viewport3d.sideView')}>⊟</button>
    <button
      onclick={toggleCameraMode}
      title={uiStore.cameraMode3D === 'perspective' ? t('viewport3d.switchToOrtho') : t('viewport3d.switchToPersp')}
    >
      {uiStore.cameraMode3D === 'perspective' ? 'P' : 'O'}
    </button>
    <button
      onclick={() => { uiStore.clippingEnabled = !uiStore.clippingEnabled; }}
      title={uiStore.clippingEnabled ? t('viewport3d.disableClipping') : t('viewport3d.enableClipping')}
      class:active-cam={uiStore.clippingEnabled}
    >
      ✂
    </button>
    <button
      onclick={() => { uiStore.measureMode = !uiStore.measureMode; }}
      title={uiStore.measureMode ? t('viewport3d.disableMeasure') : t('viewport3d.enableMeasure')}
      class:active-cam={uiStore.measureMode}
    >
      📏
    </button>
  </div>

  <!-- Clipping plane controls -->
  {#if uiStore.clippingEnabled}
    <div class="clip-controls" style="top: {uiStore.floatingToolsTopOffset}px; left: {uiStore.showFloatingTools ? 12 : 48}px">
      <div class="clip-axis-btns">
        {#each ['x', 'y', 'z'] as ax}
          <button
            class:active-ax={uiStore.clippingAxis === ax}
            onclick={() => { uiStore.clippingAxis = ax as 'x' | 'y' | 'z'; }}
          >{ax.toUpperCase()}</button>
        {/each}
      </div>
      <input
        type="range"
        min="-30"
        max="30"
        step="0.1"
        value={uiStore.clippingPosition}
        oninput={(e) => { uiStore.clippingPosition = +e.currentTarget.value; }}
        class="clip-slider"
      />
      <span class="clip-val">{uiStore.clippingPosition.toFixed(1)}</span>
    </div>
  {/if}

  <!-- Coordinate input dialog -->
  {#if showCoordDialog}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="coord-dialog-overlay" onkeydown={(e) => { if (e.key === 'Escape') cancelCoordDialog(); }}>
      <div class="coord-dialog">
        <div class="coord-title">{t('viewport3d.createNodeCoords')}</div>
        <div class="coord-row">
          <label>X</label>
          <!-- svelte-ignore a11y_autofocus -->
          <input type="number" step="any" bind:value={coordX} autofocus
            onkeydown={(e) => { if (e.key === 'Enter') submitCoordDialog(); }}
          />
        </div>
        <div class="coord-row">
          <label>Y</label>
          <input type="number" step="any" bind:value={coordY}
            onkeydown={(e) => { if (e.key === 'Enter') submitCoordDialog(); }}
          />
        </div>
        <div class="coord-row">
          <label>Z</label>
          <input type="number" step="any" bind:value={coordZ}
            onkeydown={(e) => { if (e.key === 'Enter') submitCoordDialog(); }}
          />
        </div>
        <div class="coord-actions">
          <button class="coord-btn-ok" onclick={submitCoordDialog}>{t('viewport3d.create')}</button>
          <button class="coord-btn-cancel" onclick={cancelCoordDialog}>{t('viewport3d.cancel')}</button>
        </div>
      </div>
    </div>
  {/if}

  <!-- Diagram legend -->
  {#if diagramLegend && resultsStore.results3D}
    <div class="diagram-legend">
      {#if resultsStore.isEnvelopeActive && resultsStore.fullEnvelope3D}
        <span class="legend-color" style="background: #4169E1;"></span>
        <span class="legend-text">{t('viewport3d.envPlus')}</span>
        <span class="legend-color" style="background: #E15041; margin-left: 8px;"></span>
        <span class="legend-text">{t('viewport3d.envMinus')}</span>
      {:else}
        <span class="legend-color" style="background: {diagramLegend.color};"></span>
        <span class="legend-text">{diagramLegend.name}</span>
      {/if}
      {#if resultsStore.overlayResults3D && resultsStore.overlayLabel}
        <span class="legend-color" style="background: #FFA500; margin-left: 8px;"></span>
        <span class="legend-text">{t('viewport3d.overlay').replace('{label}', resultsStore.overlayLabel)}</span>
      {/if}
    </div>
  {/if}

  <!-- Verification color legend -->
  {#if resultsStore.diagramType === 'verification' && verificationStore.hasResults}
    <div class="diagram-legend verification-legend">
      <span class="legend-color" style="background: #22cc66;"></span>
      <span class="legend-text">&le; 0.5</span>
      <span class="legend-color" style="background: #88cc22; margin-left: 6px;"></span>
      <span class="legend-text">&le; 0.9</span>
      <span class="legend-color" style="background: #ddaa00; margin-left: 6px;"></span>
      <span class="legend-text">&le; 1.0</span>
      <span class="legend-color" style="background: #ff6600; margin-left: 6px;"></span>
      <span class="legend-text">&le; 1.1</span>
      <span class="legend-color" style="background: #ee2222; margin-left: 6px;"></span>
      <span class="legend-text">&gt; 1.1</span>
      <span class="legend-color" style="background: #888888; margin-left: 6px;"></span>
      <span class="legend-text">N/V</span>
    </div>
  {/if}

  <!-- Box select overlay (AutoCAD-style) -->
  {#if boxSelect3D}
    {@const x = Math.min(boxSelect3D.startX, boxSelect3D.endX)}
    {@const y = Math.min(boxSelect3D.startY, boxSelect3D.endY)}
    {@const w = Math.abs(boxSelect3D.endX - boxSelect3D.startX)}
    {@const h = Math.abs(boxSelect3D.endY - boxSelect3D.startY)}
    {@const isWindow = boxSelect3D.endX >= boxSelect3D.startX}
    <div
      class="box-select-rect"
      class:window-mode={isWindow}
      class:crossing-mode={!isWindow}
      style="left: {x}px; top: {y}px; width: {w}px; height: {h}px;"
    ></div>
  {/if}

  <!-- Hover tooltip -->
  {#if hoverTooltip}
    <div class="hover-tooltip" style="left: {hoverTooltip.x}px; top: {hoverTooltip.y}px;">
      {hoverTooltip.text}
    </div>
  {/if}
  <canvas
    bind:this={gizmoCanvas}
    class="axis-gizmo"
    width="80"
    height="80"
  ></canvas>
</div>

<style>
  .viewport3d-wrapper {
    width: 100%;
    height: 100%;
    position: relative;
    overflow: hidden;
  }

  .viewport3d-wrapper :global(canvas:not(.axis-gizmo)) {
    display: block;
    width: 100% !important;
    height: 100% !important;
  }
  .axis-gizmo {
    position: absolute;
    bottom: 8px;
    left: 8px;
    width: 80px !important;
    height: 80px !important;
    pointer-events: none;
    z-index: 10;
  }

  .camera-controls {
    position: absolute;
    right: 12px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    z-index: 10;
    transition: top 0.15s ease;
  }

  .camera-controls button {
    width: 32px;
    height: 32px;
    border: 1px solid #445;
    border-radius: 4px;
    background: rgba(22, 33, 62, 0.9);
    color: #aabbcc;
    font-size: 14px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.15s, color 0.15s;
  }

  .camera-controls button:hover {
    background: rgba(40, 60, 100, 0.95);
    color: #ddeeff;
  }

  .camera-controls button.active-cam {
    background: rgba(78, 205, 196, 0.25);
    color: #4ecdc4;
    border-color: #4ecdc4;
  }

  .clip-controls {
    position: absolute;
    transition: top 0.15s ease, left 0.15s ease;
    display: flex;
    align-items: center;
    gap: 6px;
    z-index: 10;
    background: rgba(22, 33, 62, 0.92);
    padding: 4px 8px;
    border-radius: 4px;
    border: 1px solid #445;
  }
  .clip-axis-btns {
    display: flex;
    gap: 2px;
  }
  .clip-axis-btns button {
    width: 24px;
    height: 24px;
    border: 1px solid #445;
    border-radius: 3px;
    background: transparent;
    color: #aabbcc;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
  }
  .clip-axis-btns button.active-ax {
    background: rgba(78, 205, 196, 0.25);
    color: #4ecdc4;
    border-color: #4ecdc4;
  }
  .clip-slider {
    width: 100px;
    accent-color: #4ecdc4;
  }
  .clip-val {
    color: #aabbcc;
    font-size: 0.65rem;
    min-width: 30px;
    text-align: right;
  }

  .coord-dialog-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 50;
    background: rgba(0,0,0,0.35);
  }

  .coord-dialog {
    background: #16213e;
    border: 1px solid #0f3460;
    border-radius: 8px;
    padding: 1rem 1.25rem;
    min-width: 200px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.5);
  }

  .coord-title {
    font-size: 0.85rem;
    color: #4ecdc4;
    margin-bottom: 0.75rem;
    font-weight: 600;
  }

  .coord-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.5rem;
  }

  .coord-row label {
    width: 20px;
    color: #aaa;
    font-size: 0.8rem;
    font-weight: 600;
    text-align: center;
  }

  .coord-row input {
    flex: 1;
    background: #0f3460;
    border: 1px solid #1a4a7a;
    border-radius: 4px;
    color: #eee;
    padding: 0.3rem 0.5rem;
    font-size: 0.85rem;
    text-align: right;
    font-family: monospace;
  }

  .coord-row input:focus {
    outline: none;
    border-color: #4ecdc4;
  }

  .coord-actions {
    display: flex;
    gap: 0.5rem;
    justify-content: flex-end;
    margin-top: 0.75rem;
  }

  .coord-btn-ok {
    padding: 0.3rem 0.8rem;
    background: #e94560;
    border: none;
    border-radius: 4px;
    color: white;
    font-size: 0.8rem;
    cursor: pointer;
  }

  .coord-btn-ok:hover { background: #ff6b6b; }

  .coord-btn-cancel {
    padding: 0.3rem 0.8rem;
    background: #2a2a4e;
    border: none;
    border-radius: 4px;
    color: #aaa;
    font-size: 0.8rem;
    cursor: pointer;
  }

  .coord-btn-cancel:hover { background: #3a3a5e; }

  .diagram-legend {
    position: absolute;
    bottom: 12px;
    left: 12px;
    display: flex;
    align-items: center;
    gap: 6px;
    background: rgba(10, 15, 30, 0.85);
    padding: 5px 12px;
    border-radius: 5px;
    border: 1px solid #334;
    pointer-events: none;
    z-index: 10;
  }

  .legend-color {
    width: 12px;
    height: 12px;
    border-radius: 2px;
    flex-shrink: 0;
  }

  .legend-text {
    color: #ccd;
    font-size: 0.78rem;
    font-family: monospace;
  }

  .hover-tooltip {
    position: absolute;
    background: rgba(10, 15, 30, 0.92);
    color: #ccd;
    padding: 4px 10px;
    border-radius: 4px;
    font-size: 0.75rem;
    font-family: monospace;
    pointer-events: none;
    white-space: nowrap;
    border: 1px solid #334;
    z-index: 20;
  }

  /* ─── Box select overlay ─── */
  .box-select-rect {
    position: absolute;
    pointer-events: none;
    z-index: 15;
  }
  .box-select-rect.window-mode {
    border: 1px solid #4ecdc4;
    background: rgba(78, 205, 196, 0.08);
  }
  .box-select-rect.crossing-mode {
    border: 1px dashed #44bb44;
    background: rgba(68, 187, 68, 0.06);
  }
</style>
