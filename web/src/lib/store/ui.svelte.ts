// UI state store

import type { UnitSystem } from '../utils/units';

export type Tool = 'select' | 'node' | 'element' | 'support' | 'load' | 'pan' | 'influenceLine';
export type ILQuantity = 'Ry' | 'Rx' | 'Mz' | 'V' | 'M';
export type SupportTool = 'fixed' | 'pinned' | 'roller' | 'spring';
export type LoadTool = 'nodal' | 'distributed' | 'thermal';
export type NodalLoadDir = 'fy' | 'fx' | 'mz';
export type SelectMode = 'nodes' | 'elements' | 'loads' | 'stress' | 'supports';
export type ElementMode = 'create' | 'hinge';
export type NodeMode = 'create' | 'hinge';
export type ElementColorMode = 'uniform' | 'byMaterial' | 'bySection';
export type SupportType = 'fixed' | 'pinned' | 'rollerX' | 'rollerY' | 'spring';

// 3D-specific types
export type NodalLoadDir3D = 'fx' | 'fy' | 'fz' | 'mx' | 'my' | 'mz';
export type SupportTool3D = 'fixed3d' | 'pinned3d' | 'rollerXZ' | 'rollerXY' | 'rollerYZ' | 'spring3d' | 'custom3d';

export interface ClipboardData {
  nodes: Array<{ origId: number; x: number; y: number; z?: number }>;
  elements: Array<{ origNodeI: number; origNodeJ: number; type: 'frame' | 'truss'; materialId: number; sectionId: number; hingeStart?: boolean; hingeEnd?: boolean }>;
  supports: Array<{ origNodeId: number; type: SupportType }>;
}

// Migrate old storage keys
if (typeof localStorage !== 'undefined') {
  for (const key of ['floating-tools', 'tooltips', 'help-panel', 'unitSystem']) {
    const old = localStorage.getItem(`dedaliano-${key}`);
    if (old !== null && localStorage.getItem(`stabileo-${key}`) === null) {
      localStorage.setItem(`stabileo-${key}`, old);
      localStorage.removeItem(`dedaliano-${key}`);
    }
  }
}

function createUIStore() {
  let currentTool = $state<Tool>('pan');
  let supportType = $state<SupportTool>('pinned');
  let loadType = $state<LoadTool>('nodal');
  let nodalLoadDir = $state<NodalLoadDir>('fy'); // direction for nodal load placement
  let loadValue = $state<number>(-10); // kN, negative = downward
  let loadValueJ = $state<number>(-10); // kN/m at node J (for trapezoidal)

  // Spring stiffnesses for spring support tool
  let springKx = $state<number>(1000); // kN/m
  let springKy = $state<number>(1000); // kN/m
  let springKz = $state<number>(0);    // kN·m/rad

  // Prescribed displacements for support tool
  let supportDx = $state<number>(0); // m
  let supportDy = $state<number>(0); // m
  let supportDrz = $state<number>(0); // rad

  // Thermal load defaults
  let thermalDT = $state<number>(30);  // °C uniform
  let thermalDTg = $state<number>(0);  // °C gradient

  // Load angle & coordinate system
  let loadAngle = $state<number>(0);       // degrees, default 0
  let loadIsGlobal = $state<boolean>(false); // false = local/perpendicular (default), true = global Y

  // Roller support configuration
  let supportIsGlobal = $state<boolean>(true); // true = ejes globales (default)
  let supportDirection = $state<'x' | 'y'>('x'); // x/y en global, i/j en local
  let supportAngle = $state<number>(0); // ángulo custom en grados

  let gridSize = $state<number>(1); // meters
  let snapToGrid = $state<boolean>(true);
  let showGrid = $state<boolean>(true);

  let zoom = $state<number>(50); // pixels per meter
  let panX = $state<number>(400);
  let panY = $state<number>(300);

  let selectMode = $state<SelectMode>('elements');
  let selectedNodes = $state<Set<number>>(new Set());
  let selectedElements = $state<Set<number>>(new Set());
  let selectedLoads = $state<Set<number>>(new Set());
  let selectedSupports = $state<Set<number>>(new Set());

  let mouseX = $state<number>(0);
  let mouseY = $state<number>(0);
  let worldX = $state<number>(0);
  let worldY = $state<number>(0);

  // Inline editing state
  let editingNodeId = $state<number | null>(null);
  let editingElementId = $state<number | null>(null);
  let editScreenPos = $state<{ x: number; y: number }>({ x: 0, y: 0 });

  // Data table
  let showDataTable = $state<boolean>(true);

  // Material/Section editing
  let editingMaterialId = $state<number | null>(null);
  let editingSectionId = $state<number | null>(null);

  // Visualization toggles
  let showNodeLabels = $state<boolean>(true);
  let showElementLabels = $state<boolean>(false);
  let showLengths = $state<boolean>(false);
  let elementColorMode = $state<ElementColorMode>('uniform');
  let showLoads = $state<boolean>(true);
  let hideLoadsWithDiagram = $state<boolean>(true);

  // Result selector visibility
  let showPrimarySelector = $state<boolean>(true);
  let showSecondarySelector = $state<boolean>(true);

  // 3D rendering mode
  let renderMode3D = $state<'wireframe' | 'solid' | 'sections'>('wireframe');

  // 3D moment visualization style
  let momentStyle3D = $state<'double-arrow' | 'curved'>('curved');

  // 3D camera mode
  let cameraMode3D = $state<'perspective' | 'orthographic'>('perspective');

  // 3D clipping plane
  let clippingEnabled = $state<boolean>(false);
  let clippingAxis = $state<'x' | 'y' | 'z'>('y');
  let clippingPosition = $state<number>(0);

  // 3D working plane and snap
  let workingPlane = $state<'XZ' | 'XY' | 'YZ'>('XZ');

  // Duplicate along axis
  let duplicateAxis = $state<'x' | 'y' | 'z'>('z');
  let duplicateDistance = $state<number>(3);

  // Clipboard
  let clipboard = $state<ClipboardData | null>(null);

  // Self-weight
  let includeSelfWeight = $state<boolean>(false);

  // Element creation type
  let elementCreateType = $state<'frame' | 'truss'>('frame');
  let elementMode = $state<ElementMode>('create');
  let nodeMode = $state<NodeMode>('create');

  // Active load case for load tool
  let activeLoadCaseId = $state<number>(1);

  // Influence line quantity
  let ilQuantity = $state<ILQuantity>('Ry');

  // Help overlay
  let showHelp = $state<boolean>(false);

  // Embed mode (hides header, sidebars, footer when loaded via #embed= URL)
  let embedMode = $state<boolean>(false);

  // Floating tools bar (persisted in localStorage)
  const savedFloatingTools = typeof localStorage !== 'undefined' ? localStorage.getItem('stabileo-floating-tools') : null;
  let showFloatingTools = $state<boolean>(savedFloatingTools !== 'false'); // default true

  // How many rows the floating tools bar currently has (1=main, 2=main+options, 3=main+options+load-edit)
  // Updated by FloatingTools.svelte via $effect
  let floatingToolsRows = $state<number>(1);

  // Educational tooltips (persisted in localStorage)
  const savedTooltips = typeof localStorage !== 'undefined' ? localStorage.getItem('stabileo-tooltips') : null;
  let showTooltips = $state<boolean>(savedTooltips !== 'false'); // default true

  // Contextual help panel (persisted in localStorage)
  const savedHelpPanel = typeof localStorage !== 'undefined' ? localStorage.getItem('stabileo-help-panel') : null;
  let showHelpPanel = $state<boolean>(savedHelpPanel === 'true'); // default false

  // Unit system — persisted in localStorage
  const savedUnitSystem = typeof localStorage !== 'undefined' ? localStorage.getItem('stabileo-unitSystem') : null;
  let unitSystem = $state<UnitSystem>((savedUnitSystem === 'Imperial' ? 'Imperial' : 'SI') as UnitSystem);

  // What-If exploration mode (not persisted — temporary)
  let showWhatIf = $state<boolean>(false);

  // Kinematic analysis panel (not persisted — temporary)
  let showKinematicPanel = $state<boolean>(false);

  // Mobile responsive
  let windowWidth = $state(window.innerWidth);
  let leftDrawerOpen = $state(false);
  let rightDrawerOpen = $state(false);
  let mobileResultsPanelOpen = $state(false);

  // Desktop sidebar toggles
  let rightSidebarOpen = $state(false);
  let leftSidebarOpen = $state(true);

  // Context menu
  let contextMenu = $state<{ x: number; y: number; nodeId?: number; elementId?: number } | null>(null);

  // Toast notifications
  // actionId: optional string identifier for an in-toast button (e.g. 'kinematic')
  // Action handlers are defined in the component that renders toasts (App.svelte)
  let toasts = $state<Array<{ id: number; message: string; type: 'success' | 'error' | 'info'; actionId?: string }>>([]);
  let toastCounter = 0;

  // Live calculation
  let liveCalc = $state(typeof localStorage !== 'undefined' && localStorage.getItem('liveCalc') === 'true');
  let liveCalcError = $state<string | null>(null);

  // Analysis mode: 2D, 3D, PRO or EDU (educational)
  let analysisMode = $state<'2d' | '3d' | 'pro' | 'edu'>('2d');

  // === 3D-specific state ===
  // 3D load direction (6 DOF)
  let nodalLoadDir3D = $state<NodalLoadDir3D>('fy');
  let loadValueZ = $state<number>(0); // For Fz or qZI components
  let loadValueZJ = $state<number>(0); // For qZJ components (3D distributed)

  // 3D support type
  let supportType3D = $state<SupportTool3D>('pinned3d');

  // 3D spring rotational stiffnesses
  let springKrx = $state<number>(0); // kN·m/rad
  let springKry = $state<number>(0); // kN·m/rad
  let springKrz = $state<number>(0); // kN·m/rad

  // 3D support prescribed displacements (additional DOFs)
  let supportDz = $state<number>(0);  // m
  let supportDrx = $state<number>(0); // rad
  let supportDry = $state<number>(0); // rad

  // 3D per-DOF support creation state
  let supportFrame3D = $state<'global' | 'local'>('global');
  let sup3dTx = $state(true);
  let sup3dTy = $state(true);
  let sup3dTz = $state(true);
  let sup3dRx = $state(false);
  let sup3dRy = $state(false);
  let sup3dRz = $state(false);
  // Spring stiffnesses per DOF (used when DOF unchecked and user wants spring)
  let sup3dKx = $state(0);
  let sup3dKy = $state(0);
  let sup3dKz = $state(0);
  let sup3dKrx = $state(0);
  let sup3dKry = $state(0);
  let sup3dKrz = $state(0);

  // Node creation Y level for 3D (ground plane height)
  let nodeCreateZ = $state<number>(0);

  // Measurement tool
  let measureMode = $state<boolean>(false);
  let measurePoints = $state<Array<{x: number; y: number; z: number}>>([]);

  // Show axes (2D)
  let showAxes = $state<boolean>(true);

  // Independent 3D visualization config
  let showGrid3D = $state<boolean>(true);
  let snapToGrid3D = $state<boolean>(true);
  let gridSize3D = $state<number>(1);
  let showNodeLabels3D = $state<boolean>(true);
  let showElementLabels3D = $state<boolean>(false);
  let showLengths3D = $state<boolean>(false);
  let showLoads3D = $state<boolean>(true);
  let showAxes3D = $state<boolean>(true);

  // 3D axis convention: terna derecha (right-hand, default) or terna izquierda (left-hand)
  let axisConvention3D = $state<'rightHand' | 'leftHand'>('rightHand');

  // 3D camera state (synced from Viewport3D via saveCameraState, restored on tab switch)
  let cameraPosition3D = $state<{ x: number; y: number; z: number }>({ x: 10, y: 6, z: 10 });
  let cameraTarget3D = $state<{ x: number; y: number; z: number }>({ x: 0, y: 0, z: 0 });

  // Pending auto-solve from URL sharing (stores the diagramType to restore after solve)
  let pendingSolveFromURL = $state<string | null>(null);

  return {
    get currentTool() { return currentTool; },
    set currentTool(v: Tool) { currentTool = v; },

    get supportType() { return supportType; },
    set supportType(v: SupportTool) { supportType = v; },

    get loadType() { return loadType; },
    set loadType(v: LoadTool) { loadType = v; },

    get nodalLoadDir() { return nodalLoadDir; },
    set nodalLoadDir(v: NodalLoadDir) { nodalLoadDir = v; },

    get loadValue() { return loadValue; },
    set loadValue(v: number) { loadValue = v; },

    get loadValueJ() { return loadValueJ; },
    set loadValueJ(v: number) { loadValueJ = v; },

    get springKx() { return springKx; },
    set springKx(v: number) { springKx = v; },
    get springKy() { return springKy; },
    set springKy(v: number) { springKy = v; },
    get springKz() { return springKz; },
    set springKz(v: number) { springKz = v; },

    get supportDx() { return supportDx; },
    set supportDx(v: number) { supportDx = v; },
    get supportDy() { return supportDy; },
    set supportDy(v: number) { supportDy = v; },
    get supportDrz() { return supportDrz; },
    set supportDrz(v: number) { supportDrz = v; },

    get supportIsGlobal() { return supportIsGlobal; },
    set supportIsGlobal(v: boolean) { supportIsGlobal = v; },
    get supportDirection() { return supportDirection; },
    set supportDirection(v: 'x' | 'y') { supportDirection = v; },
    get supportAngle() { return supportAngle; },
    set supportAngle(v: number) { supportAngle = v; },

    get thermalDT() { return thermalDT; },
    set thermalDT(v: number) { thermalDT = v; },
    get thermalDTg() { return thermalDTg; },
    set thermalDTg(v: number) { thermalDTg = v; },

    get loadAngle() { return loadAngle; },
    set loadAngle(v: number) { loadAngle = v; },
    get loadIsGlobal() { return loadIsGlobal; },
    set loadIsGlobal(v: boolean) { loadIsGlobal = v; },

    get gridSize() { return gridSize; },
    set gridSize(v: number) { gridSize = v; },

    get snapToGrid() { return snapToGrid; },
    set snapToGrid(v: boolean) { snapToGrid = v; },

    get showGrid() { return showGrid; },
    set showGrid(v: boolean) { showGrid = v; },

    get zoom() { return zoom; },
    set zoom(v: number) { zoom = Math.max(10, Math.min(200, v)); },

    get panX() { return panX; },
    set panX(v: number) { panX = v; },

    get panY() { return panY; },
    set panY(v: number) { panY = v; },

    get selectMode() { return selectMode; },
    set selectMode(v: SelectMode) { selectMode = v; },

    get selectedNodes() { return selectedNodes; },
    get selectedElements() { return selectedElements; },
    get selectedLoads() { return selectedLoads; },
    set selectedLoads(v: Set<number>) { selectedLoads = v; },
    clearSelectedLoads() { selectedLoads = new Set(); },
    deleteSelectedLoad(id: number) {
      const s = new Set(selectedLoads);
      s.delete(id);
      selectedLoads = s;
    },

    get selectedSupports() { return selectedSupports; },
    clearSelectedSupports() { selectedSupports = new Set(); },

    get mouseX() { return mouseX; },
    get mouseY() { return mouseY; },
    get worldX() { return worldX; },
    get worldY() { return worldY; },

    get editingNodeId() { return editingNodeId; },
    set editingNodeId(v: number | null) { editingNodeId = v; },
    get editingElementId() { return editingElementId; },
    set editingElementId(v: number | null) { editingElementId = v; },
    get editScreenPos() { return editScreenPos; },
    set editScreenPos(v: { x: number; y: number }) { editScreenPos = v; },
    get showDataTable() { return showDataTable; },
    set showDataTable(v: boolean) { showDataTable = v; },

    get editingMaterialId() { return editingMaterialId; },
    set editingMaterialId(v: number | null) { editingMaterialId = v; },
    get editingSectionId() { return editingSectionId; },
    set editingSectionId(v: number | null) { editingSectionId = v; },

    get workingPlane() { return workingPlane; },
    set workingPlane(v: 'XZ' | 'XY' | 'YZ') { workingPlane = v; },

    /** Snap world coordinates to 3D grid */
    snapWorld3D(wx: number, wy: number, wz: number): { x: number; y: number; z: number } {
      if (!snapToGrid3D || !showGrid3D) return { x: wx, y: wy, z: wz };
      const g = gridSize3D;
      return {
        x: Math.round(wx / g) * g,
        y: Math.round(wy / g) * g,
        z: Math.round(wz / g) * g,
      };
    },

    get duplicateAxis() { return duplicateAxis; },
    set duplicateAxis(v: 'x' | 'y' | 'z') { duplicateAxis = v; },
    get duplicateDistance() { return duplicateDistance; },
    set duplicateDistance(v: number) { duplicateDistance = v; },

    get showNodeLabels() { return showNodeLabels; },
    set showNodeLabels(v: boolean) { showNodeLabels = v; },
    get showElementLabels() { return showElementLabels; },
    set showElementLabels(v: boolean) { showElementLabels = v; },
    get showLengths() { return showLengths; },
    set showLengths(v: boolean) { showLengths = v; },
    get elementColorMode() { return elementColorMode; },
    set elementColorMode(v: ElementColorMode) { elementColorMode = v; },
    get showLoads() { return showLoads; },
    set showLoads(v: boolean) { showLoads = v; },
    get hideLoadsWithDiagram() { return hideLoadsWithDiagram; },
    set hideLoadsWithDiagram(v: boolean) { hideLoadsWithDiagram = v; },

    get showPrimarySelector() { return showPrimarySelector; },
    set showPrimarySelector(v: boolean) { showPrimarySelector = v; },
    get showSecondarySelector() { return showSecondarySelector; },
    set showSecondarySelector(v: boolean) { showSecondarySelector = v; },

    get renderMode3D() { return renderMode3D; },
    set renderMode3D(v: 'wireframe' | 'solid' | 'sections') { renderMode3D = v; },

    get momentStyle3D() { return momentStyle3D; },
    set momentStyle3D(v: 'double-arrow' | 'curved') { momentStyle3D = v; },

    get cameraMode3D() { return cameraMode3D; },
    set cameraMode3D(v: 'perspective' | 'orthographic') { cameraMode3D = v; },

    get clippingEnabled() { return clippingEnabled; },
    set clippingEnabled(v: boolean) { clippingEnabled = v; },
    get clippingAxis() { return clippingAxis; },
    set clippingAxis(v: 'x' | 'y' | 'z') { clippingAxis = v; },
    get clippingPosition() { return clippingPosition; },
    set clippingPosition(v: number) { clippingPosition = v; },

    get clipboard() { return clipboard; },
    set clipboard(v: ClipboardData | null) { clipboard = v; },

    get includeSelfWeight() { return includeSelfWeight; },
    set includeSelfWeight(v: boolean) { includeSelfWeight = v; },

    get elementCreateType() { return elementCreateType; },
    set elementCreateType(v: 'frame' | 'truss') { elementCreateType = v; },

    get elementMode() { return elementMode; },
    set elementMode(v: ElementMode) { elementMode = v; },

    get nodeMode() { return nodeMode; },
    set nodeMode(v: NodeMode) { nodeMode = v; },

    get activeLoadCaseId() { return activeLoadCaseId; },
    set activeLoadCaseId(v: number) { activeLoadCaseId = v; },

    get ilQuantity() { return ilQuantity; },
    set ilQuantity(v: ILQuantity) { ilQuantity = v; },

    get showHelp() { return showHelp; },
    set showHelp(v: boolean) { showHelp = v; },

    get embedMode() { return embedMode; },
    set embedMode(v: boolean) { embedMode = v; },

    get showFloatingTools() { return showFloatingTools; },
    set showFloatingTools(v: boolean) {
      showFloatingTools = v;
      if (typeof localStorage !== 'undefined') localStorage.setItem('stabileo-floating-tools', String(v));
    },

    get floatingToolsRows() { return floatingToolsRows; },
    set floatingToolsRows(v: number) { floatingToolsRows = v; },

    /** Top offset (px) for viewport overlay buttons (zoom, camera controls, clip panel) */
    get floatingToolsTopOffset(): number {
      if (!showFloatingTools) return 12;
      // rows=1 → 56px (main bar only), rows=2 → 86px, rows=3 → 116px
      return 12 + 44 + (floatingToolsRows - 1) * 30;
    },

    get showTooltips() { return showTooltips; },
    set showTooltips(v: boolean) {
      showTooltips = v;
      if (typeof localStorage !== 'undefined') localStorage.setItem('stabileo-tooltips', String(v));
    },

    get showHelpPanel() { return showHelpPanel; },
    set showHelpPanel(v: boolean) {
      showHelpPanel = v;
      if (typeof localStorage !== 'undefined') localStorage.setItem('stabileo-help-panel', String(v));
    },

    get showWhatIf() { return showWhatIf; },
    set showWhatIf(v: boolean) { showWhatIf = v; },

    get showKinematicPanel() { return showKinematicPanel; },
    set showKinematicPanel(v: boolean) { showKinematicPanel = v; },

    get unitSystem() { return unitSystem; },
    set unitSystem(v: UnitSystem) {
      unitSystem = v;
      try { localStorage.setItem('stabileo-unitSystem', v); } catch {}
    },

    // Mobile responsive
    get isMobile() { return windowWidth < 768; },
    get windowWidth() { return windowWidth; },
    set windowWidth(w: number) { windowWidth = w; },
    get leftDrawerOpen() { return leftDrawerOpen; },
    set leftDrawerOpen(v: boolean) { leftDrawerOpen = v; },
    get rightDrawerOpen() { return rightDrawerOpen; },
    set rightDrawerOpen(v: boolean) { rightDrawerOpen = v; },
    get mobileResultsPanelOpen() { return mobileResultsPanelOpen; },
    set mobileResultsPanelOpen(v: boolean) { mobileResultsPanelOpen = v; },
    get rightSidebarOpen() { return rightSidebarOpen; },
    set rightSidebarOpen(v: boolean) { rightSidebarOpen = v; },
    get leftSidebarOpen() { return leftSidebarOpen; },
    set leftSidebarOpen(v: boolean) { leftSidebarOpen = v; },

    get contextMenu() { return contextMenu; },
    set contextMenu(v: { x: number; y: number; nodeId?: number; elementId?: number } | null) { contextMenu = v; },

    get toasts() { return toasts; },
    toast(message: string, type: 'success' | 'error' | 'info' = 'info', actionId?: string) {
      const id = ++toastCounter;
      toasts.push({ id, message, type, actionId });
      setTimeout(() => {
        const idx = toasts.findIndex(t => t.id === id);
        if (idx >= 0) toasts.splice(idx, 1);
      }, actionId ? 8000 : 4000); // Longer timeout when there's an action button
    },

    get liveCalc() { return liveCalc; },
    set liveCalc(v: boolean) {
      liveCalc = v;
      if (typeof localStorage !== 'undefined') localStorage.setItem('liveCalc', String(v));
    },
    get liveCalcError() { return liveCalcError; },
    set liveCalcError(v: string | null) { liveCalcError = v; },

    get analysisMode() { return analysisMode; },
    set analysisMode(v: '2d' | '3d' | 'pro' | 'edu') { analysisMode = v; },

    /** Top-level app mode derived from analysisMode */
    get appMode(): 'basico' | 'educativo' | 'pro' {
      if (analysisMode === 'pro') return 'pro';
      if (analysisMode === 'edu') return 'educativo';
      return 'basico';
    },

    // 3D-specific getters/setters
    get nodalLoadDir3D() { return nodalLoadDir3D; },
    set nodalLoadDir3D(v: NodalLoadDir3D) { nodalLoadDir3D = v; },
    get loadValueZ() { return loadValueZ; },
    set loadValueZ(v: number) { loadValueZ = v; },
    get loadValueZJ() { return loadValueZJ; },
    set loadValueZJ(v: number) { loadValueZJ = v; },
    get supportType3D() { return supportType3D; },
    set supportType3D(v: SupportTool3D) { supportType3D = v; },
    get springKrx() { return springKrx; },
    set springKrx(v: number) { springKrx = v; },
    get springKry() { return springKry; },
    set springKry(v: number) { springKry = v; },
    get springKrz() { return springKrz; },
    set springKrz(v: number) { springKrz = v; },
    get supportDz() { return supportDz; },
    set supportDz(v: number) { supportDz = v; },
    get supportDrx() { return supportDrx; },
    set supportDrx(v: number) { supportDrx = v; },
    get supportDry() { return supportDry; },
    set supportDry(v: number) { supportDry = v; },
    // Per-DOF support creation state (3D)
    get supportFrame3D() { return supportFrame3D; },
    set supportFrame3D(v: 'global' | 'local') { supportFrame3D = v; },
    get sup3dTx() { return sup3dTx; },
    set sup3dTx(v: boolean) { sup3dTx = v; },
    get sup3dTy() { return sup3dTy; },
    set sup3dTy(v: boolean) { sup3dTy = v; },
    get sup3dTz() { return sup3dTz; },
    set sup3dTz(v: boolean) { sup3dTz = v; },
    get sup3dRx() { return sup3dRx; },
    set sup3dRx(v: boolean) { sup3dRx = v; },
    get sup3dRy() { return sup3dRy; },
    set sup3dRy(v: boolean) { sup3dRy = v; },
    get sup3dRz() { return sup3dRz; },
    set sup3dRz(v: boolean) { sup3dRz = v; },
    get sup3dKx() { return sup3dKx; },
    set sup3dKx(v: number) { sup3dKx = v; },
    get sup3dKy() { return sup3dKy; },
    set sup3dKy(v: number) { sup3dKy = v; },
    get sup3dKz() { return sup3dKz; },
    set sup3dKz(v: number) { sup3dKz = v; },
    get sup3dKrx() { return sup3dKrx; },
    set sup3dKrx(v: number) { sup3dKrx = v; },
    get sup3dKry() { return sup3dKry; },
    set sup3dKry(v: number) { sup3dKry = v; },
    get sup3dKrz() { return sup3dKrz; },
    set sup3dKrz(v: number) { sup3dKrz = v; },
    /** Set per-DOF preset for 3D support creation */
    setSupport3DPreset(preset: 'fixed' | 'pinned' | 'spring') {
      if (preset === 'fixed') {
        sup3dTx = true; sup3dTy = true; sup3dTz = true;
        sup3dRx = true; sup3dRy = true; sup3dRz = true;
      } else if (preset === 'pinned') {
        sup3dTx = true; sup3dTy = true; sup3dTz = true;
        sup3dRx = false; sup3dRy = false; sup3dRz = false;
      } else {
        sup3dTx = false; sup3dTy = false; sup3dTz = false;
        sup3dRx = false; sup3dRy = false; sup3dRz = false;
      }
    },
    get nodeCreateZ() { return nodeCreateZ; },
    set nodeCreateZ(v: number) { nodeCreateZ = v; },

    get measureMode() { return measureMode; },
    set measureMode(v: boolean) { measureMode = v; },
    get measurePoints() { return measurePoints; },
    set measurePoints(v: Array<{x: number; y: number; z: number}>) { measurePoints = v; },

    get showAxes() { return showAxes; },
    set showAxes(v: boolean) { showAxes = v; },

    // Independent 3D visualization config
    get showGrid3D() { return showGrid3D; },
    set showGrid3D(v: boolean) { showGrid3D = v; },
    get snapToGrid3D() { return snapToGrid3D; },
    set snapToGrid3D(v: boolean) { snapToGrid3D = v; },
    get gridSize3D() { return gridSize3D; },
    set gridSize3D(v: number) { gridSize3D = v; },
    get showNodeLabels3D() { return showNodeLabels3D; },
    set showNodeLabels3D(v: boolean) { showNodeLabels3D = v; },
    get showElementLabels3D() { return showElementLabels3D; },
    set showElementLabels3D(v: boolean) { showElementLabels3D = v; },
    get showLengths3D() { return showLengths3D; },
    set showLengths3D(v: boolean) { showLengths3D = v; },
    get showLoads3D() { return showLoads3D; },
    set showLoads3D(v: boolean) { showLoads3D = v; },
    get showAxes3D() { return showAxes3D; },
    set showAxes3D(v: boolean) { showAxes3D = v; },

    get axisConvention3D() { return axisConvention3D; },
    set axisConvention3D(v: 'rightHand' | 'leftHand') { axisConvention3D = v; },

    // 3D camera state (persisted for tab switching)
    get cameraPosition3D() { return cameraPosition3D; },
    set cameraPosition3D(v: { x: number; y: number; z: number }) { cameraPosition3D = v; },
    get cameraTarget3D() { return cameraTarget3D; },
    set cameraTarget3D(v: { x: number; y: number; z: number }) { cameraTarget3D = v; },

    get pendingSolveFromURL() { return pendingSolveFromURL; },
    set pendingSolveFromURL(v: string | null) { pendingSolveFromURL = v; },

    setMouse(mx: number, my: number, wx: number, wy: number) {
      mouseX = mx;
      mouseY = my;
      worldX = wx;
      worldY = wy;
    },

    selectNode(id: number, addToSelection = false) {
      if (addToSelection) {
        selectedNodes = new Set([...selectedNodes, id]);
      } else {
        selectedNodes = new Set([id]);
        selectedElements = new Set();
      }
    },

    selectElement(id: number, addToSelection = false) {
      if (addToSelection) {
        selectedElements = new Set([...selectedElements, id]);
      } else {
        selectedNodes = new Set();
        selectedElements = new Set([id]);
      }
    },

    selectLoad(id: number, addToSelection = false) {
      if (!addToSelection) {
        selectedLoads = new Set([id]);
        selectedNodes = new Set();
        selectedElements = new Set();
        selectedSupports = new Set();
      } else {
        selectedLoads = new Set([...selectedLoads, id]);
      }
    },

    selectSupport(id: number, addToSelection = false) {
      if (!addToSelection) {
        selectedSupports = new Set([id]);
        selectedNodes = new Set();
        selectedElements = new Set();
        selectedLoads = new Set();
      } else {
        selectedSupports = new Set([...selectedSupports, id]);
      }
    },

    clearSelection() {
      selectedNodes = new Set();
      selectedElements = new Set();
      selectedLoads = new Set();
      selectedSupports = new Set();
    },

    /** Bulk-set node and element selection (triggers reactivity via reassignment) */
    setSelection(nodes: Set<number>, elements: Set<number>) {
      selectedNodes = nodes;
      selectedElements = elements;
    },

    /** Reset all transient/session state while preserving visualization settings */
    resetSession() {
      // Transient editing state → reset
      editingNodeId = null;
      editingElementId = null;
      editingMaterialId = null;
      editingSectionId = null;
      editScreenPos = { x: 0, y: 0 };
      contextMenu = null;
      showWhatIf = false;
      showKinematicPanel = false;
      mobileResultsPanelOpen = false;
      measureMode = false;
      measurePoints = [];
      liveCalcError = null;
      toasts = [];
      showHelp = false;
      currentTool = 'pan';
      clipboard = null;
      pendingSolveFromURL = null;
      // Clear selection
      selectedNodes = new Set();
      selectedElements = new Set();
      selectedLoads = new Set();
      selectedSupports = new Set();
      // NOT reset: grid, showGrid, snapToGrid, zoom/pan, labels, analysisMode,
      // showNodeLabels, showElementLabels, showLengths, elementColorMode, showLoads,
      // unitSystem, embedMode, showFloatingTools, showTooltips, showHelpPanel, etc.
    },

    // Convert screen to world coordinates
    screenToWorld(sx: number, sy: number): { x: number; y: number } {
      const x = (sx - panX) / zoom;
      const y = -(sy - panY) / zoom; // Y is inverted
      return { x, y };
    },

    // Convert world to screen coordinates
    worldToScreen(wx: number, wy: number): { x: number; y: number } {
      const x = wx * zoom + panX;
      const y = -wy * zoom + panY; // Y is inverted
      return { x, y };
    },

    // Snap world coordinates to grid
    snapWorld(wx: number, wy: number): { x: number; y: number } {
      if (!snapToGrid || !showGrid) return { x: wx, y: wy };
      return {
        x: Math.round(wx / gridSize) * gridSize,
        y: Math.round(wy / gridSize) * gridSize,
      };
    },

    // Zoom to fit all nodes with padding
    zoomToFit(nodes: Iterable<{ x: number; y: number }>, canvasWidth: number, canvasHeight: number): void {
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      let count = 0;
      for (const n of nodes) {
        if (n.x < minX) minX = n.x;
        if (n.x > maxX) maxX = n.x;
        if (n.y < minY) minY = n.y;
        if (n.y > maxY) maxY = n.y;
        count++;
      }
      if (count === 0) return;

      const padding = 120; // pixels — margin for distributed loads and labels
      const worldW = maxX - minX || 1;
      const worldH = maxY - minY || 1;
      const availW = canvasWidth - padding * 2;
      const availH = canvasHeight - padding * 2;

      const newZoom = Math.min(availW / worldW, availH / worldH, 200);
      zoom = Math.max(10, newZoom);

      const cx = (minX + maxX) / 2;
      const cy = (minY + maxY) / 2;
      panX = canvasWidth / 2 - cx * zoom;
      panY = canvasHeight / 2 + cy * zoom; // Y inverted
    },
  };
}

export const uiStore = createUIStore();
