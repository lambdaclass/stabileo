<script lang="ts">
  import { onMount } from 'svelte';
  import { t } from '../lib/i18n';
  import { modelStore, uiStore, resultsStore, historyStore, dsmStepsStore } from '../lib/store';
  import { drawDiagrams, drawEnvelopeDiagrams, computeDiagramGlobalMax, setDiagramUnitSystem, type DiagramKind } from '../lib/canvas/draw-diagrams';
  import { computeDiagramValueAt, computeDisplacementAt } from '../lib/engine/diagrams';
  import { effectiveBendingInertia } from '../lib/engine/solver-service';
  import { drawDeformed } from '../lib/canvas/draw-deformed';
  import { drawDistributedLoads, drawPointLoadsOnElements, drawThermalLoads, drawMovingLoadAxles } from '../lib/canvas/draw-loads';
  import { computeAxleWorldPositions } from '../lib/engine/moving-loads';
  import { drawInfluenceLine } from '../lib/canvas/draw-influence';
  import { drawModeShape, drawPlasticHinges } from '../lib/canvas/draw-modes';
  import { computeElementStress } from '../lib/store/results.svelte';
  import {
    drawGrid as _drawGrid,
    drawAxes as _drawAxes,
    drawNode as _drawNode,
    drawElement as _drawElement,
    drawSupport as _drawSupport,
    drawNodalLoad as _drawNodalLoad,
    drawReactions as _drawReactions,
    drawConstraintForces as _drawConstraintForces,
    drawTooltip as _drawTooltip,
    type DrawElementOpts,
    type ReactionData,
    type ConstraintForceData,
  } from '../lib/viewport/draw-entities';
  import {
    findNearestNode as _findNearestNode,
    findNearestElement as _findNearestElement,
    findNearestSupport as _findNearestSupport,
    findNearestMidpoint as _findNearestMidpoint,
    findAllLoadsNear as _findAllLoadsNear,
    findNearestLoad as _findNearestLoad,
    snapWithMidpoint as _snapWithMidpoint,
    segmentsIntersect,
    segmentIntersectsRect,
  } from '../lib/viewport/spatial-queries';

  let { showResults = false } = $props();

  let canvas: HTMLCanvasElement;
  let ctx: CanvasRenderingContext2D | null = null;
  let width = 800;
  let height = 600;

  // Pan state
  let isPanning = false;
  let panStartX = 0;
  let panStartY = 0;

  // Element creation chain mode
  let pendingNode: { x: number; y: number } | null = null;

  // Node drag state
  let draggedNodeId: number | null = null;
  let dragMoved = false;
  let dragStartWorld: { x: number; y: number } | null = null;

  // Box selection state
  let boxSelect: { startX: number; startY: number; endX: number; endY: number } | null = null;

  // Diagram query state (click on diagram to see value)
  let diagramQuery: { elementId: number; t: number; value: number; worldX: number; worldY: number } | null = null;

  // Diagram hover state (real-time value as mouse moves)
  let diagramHover: { elementId: number; t: number; value: number; worldX: number; worldY: number; label?: string; unit?: string; lines?: string[] } | null = null;

  // Clear pending node when tool changes away from element
  $effect(() => {
    if (uiStore.currentTool !== 'element') {
      pendingNode = null;
      uiStore.elementMode = 'create';
    }
    if (uiStore.currentTool !== 'node') {
      uiStore.nodeMode = 'create';
    }
  });
  $effect(() => {
    if (uiStore.elementMode === 'hinge') {
      pendingNode = null;
    }
  });

  // Clear selected supports/loads when switching away from select tool
  $effect(() => {
    if (uiStore.currentTool !== 'select') {
      uiStore.clearSelectedSupports();
      uiStore.clearSelectedLoads();
    }
  });

  // Clear diagram query/hover when results or diagram type changes
  $effect(() => {
    resultsStore.diagramType;
    resultsStore.results;
    diagramQuery = null;
    diagramHover = null;
  });

  // Clear stressQuery when leaving stress mode; auto-switch to elements if results cleared
  $effect(() => {
    if (uiStore.selectMode !== 'stress') {
      resultsStore.stressQuery = null;
    }
  });
  $effect(() => {
    if (!resultsStore.results && uiStore.selectMode === 'stress' && !uiStore.liveCalc) {
      uiStore.selectMode = 'elements';
    }
  });

  // Draw context helper for canvas renderers
  function makeDrawContext() {
    return {
      ctx: ctx!,
      worldToScreen: (wx: number, wy: number) => uiStore.worldToScreen(wx, wy),
      getNode: (id: number) => modelStore.getNode(id),
      getElement: (id: number) => {
        const elem = modelStore.elements.get(id);
        return elem ? { nodeI: elem.nodeI, nodeJ: elem.nodeJ, materialId: elem.materialId, sectionId: elem.sectionId } : undefined;
      },
      getMaterial: (id: number) => {
        const mat = modelStore.materials.get(id);
        return mat ? { e: mat.e } : undefined;
      },
      getSection: (id: number) => {
        const sec = modelStore.sections.get(id);
        // 2D bending uses effective inertia (accounts for section rotation via Mohr)
        return sec ? { iz: effectiveBendingInertia(sec) } : undefined;
      },
    };
  }

  onMount(() => {
    ctx = canvas.getContext('2d')!;
    resizeCanvas();

    // Use ResizeObserver to detect any container size changes
    // (sidebar open/close, window resize, etc.)
    // Also schedule a delayed re-check in case CSS transitions cause intermediate sizes
    let resizeTimer: ReturnType<typeof setTimeout> | null = null;
    const ro = new ResizeObserver(() => {
      resizeCanvas();
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => resizeCanvas(), 300);
    });
    ro.observe(canvas.parentElement!);

    // Listen for zoom-to-fit events (same mechanism as Viewport3D)
    const handleZoomToFitEvent = () => {
      if (modelStore.nodes.size === 0) return;
      uiStore.zoomToFit(modelStore.nodes.values(), canvas.width, canvas.height);
    };
    window.addEventListener('stabileo-zoom-to-fit', handleZoomToFitEvent);

    // Render loop
    let raf: number;
    function loop() {
      draw();
      raf = requestAnimationFrame(loop);
    }
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      if (resizeTimer) clearTimeout(resizeTimer);
      window.removeEventListener('stabileo-zoom-to-fit', handleZoomToFitEvent);
    };
  });

  function resizeCanvas() {
    const rect = canvas.parentElement!.getBoundingClientRect();
    // Guard: skip if container has zero/tiny dimensions (layout reflow in progress)
    if (rect.width < 1 || rect.height < 1) return;
    width = rect.width;
    height = rect.height;
    canvas.width = width;
    canvas.height = height;
  }

  let lastFrameTime = 0;

  function draw() {
    if (!ctx) return;

    // Advance IL animation
    const now = performance.now();
    if (resultsStore.ilAnimating && resultsStore.influenceLine && lastFrameTime > 0) {
      const dt = (now - lastFrameTime) / 1000; // seconds
      const speed = resultsStore.ilAnimSpeed * 0.3; // base: ~3.3s to traverse
      resultsStore.ilAnimProgress += dt * speed;
      if (resultsStore.ilAnimProgress >= 1) {
        resultsStore.ilAnimProgress = 0; // loop
      }
    }
    lastFrameTime = now;

    ctx.clearRect(0, 0, width, height);

    // Background
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, width, height);

    // Draw grid
    if (uiStore.showGrid) {
      drawGrid();
    }

    // Draw axes
    if (uiStore.showAxes) {
      drawAxes();
    }

    // Compute color map for elements if active
    const colorMapOverrides = new Map<number, string>();
    if (resultsStore.results && resultsStore.diagramType === 'axialColor') {
      // Axial color: blue = compression, red = tension, intensity by magnitude
      let globalMaxN = 0;
      for (const ef of resultsStore.results.elementForces) {
        const absN = Math.max(Math.abs(ef.nStart), Math.abs(ef.nEnd));
        if (absN > globalMaxN) globalMaxN = absN;
      }
      if (globalMaxN > 1e-10) {
        for (const ef of resultsStore.results.elementForces) {
          const avgN = (ef.nStart + ef.nEnd) / 2;
          const intensity = Math.min(Math.abs(avgN) / globalMaxN, 1.0);
          const bright = Math.round(100 + intensity * 155); // 100..255
          if (avgN > 0.001) {
            // Tension → red
            colorMapOverrides.set(ef.elementId, `rgb(${bright},${Math.round(40 * (1 - intensity))},${Math.round(40 * (1 - intensity))})`);
          } else if (avgN < -0.001) {
            // Compression → blue
            colorMapOverrides.set(ef.elementId, `rgb(${Math.round(40 * (1 - intensity))},${Math.round(80 * (1 - intensity))},${bright})`);
          } else {
            colorMapOverrides.set(ef.elementId, '#ccc'); // ~zero → white/light
          }
        }
      }
    } else if (resultsStore.results && resultsStore.diagramType === 'colorMap') {
      const kind = resultsStore.colorMapKind;
      let globalMax = 0;
      const elemMaxes = new Map<number, number>();

      if (kind === 'stressRatio' || kind === 'vonMises') {
        // Stress ratio: σ_vm / fy — or absolute Von Mises
        for (const ef of resultsStore.results.elementForces) {
          const elem = modelStore.elements.get(ef.elementId);
          if (!elem) continue;
          const sec = modelStore.sections.get(elem.sectionId);
          const mat = modelStore.materials.get(elem.materialId);
          if (!sec || !mat || !mat.fy) continue;
          const stress = computeElementStress(ef, sec, mat);
          const val = kind === 'stressRatio' ? (stress.ratio ?? 0) : (stress.vonMises ?? 0);
          elemMaxes.set(ef.elementId, val);
          if (kind === 'vonMises' && val > globalMax) globalMax = val;
        }
        if (kind === 'stressRatio') globalMax = 1.0; // fixed scale: 0% → 100%+ of fy
      } else {
        for (const ef of resultsStore.results.elementForces) {
          let val: number;
          if (kind === 'moment') val = Math.max(Math.abs(ef.mStart), Math.abs(ef.mEnd));
          else if (kind === 'shear') val = Math.max(Math.abs(ef.vStart), Math.abs(ef.vEnd));
          else val = Math.max(Math.abs(ef.nStart), Math.abs(ef.nEnd));
          elemMaxes.set(ef.elementId, val);
          if (val > globalMax) globalMax = val;
        }
      }

      if (globalMax > 1e-10) {
        for (const [eid, val] of elemMaxes) {
          const ratio = Math.min(val / globalMax, 1.5); // clamp for stress ratio overflow
          const norm = Math.min(ratio, 1.0);
          // Blue (low) → Green → Yellow → Red (high)
          const r = norm < 0.5 ? Math.round(norm * 2 * 255) : 255;
          const g = norm < 0.5 ? 255 : Math.round((1 - (norm - 0.5) * 2) * 255);
          const b = norm < 0.25 ? Math.round((1 - norm * 4) * 200) : 0;
          colorMapOverrides.set(eid, ratio > 1.0 ? `rgb(255,0,255)` : `rgb(${r},${g},${b})`);
        }
      }
    }

    // Pre-compute bar count per node (for hinge offset logic)
    const nodeBarCount = new Map<number, number>();
    for (const elem of modelStore.elements.values()) {
      nodeBarCount.set(elem.nodeI, (nodeBarCount.get(elem.nodeI) ?? 0) + 1);
      nodeBarCount.set(elem.nodeJ, (nodeBarCount.get(elem.nodeJ) ?? 0) + 1);
    }

    // Draw elements
    for (const elem of modelStore.elements.values()) {
      drawElement(elem, colorMapOverrides.get(elem.id), nodeBarCount);
    }

    // Draw axial value labels when axialColor mode is active
    if (resultsStore.results && resultsStore.diagramType === 'axialColor') {
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'center';
      for (const ef of resultsStore.results.elementForces) {
        const elem = modelStore.elements.get(ef.elementId);
        if (!elem) continue;
        const ni = modelStore.getNode(elem.nodeI);
        const nj = modelStore.getNode(elem.nodeJ);
        if (!ni || !nj) continue;
        const si = uiStore.worldToScreen(ni.x, ni.y);
        const sj = uiStore.worldToScreen(nj.x, nj.y);
        const mx = (si.x + sj.x) / 2;
        const my = (si.y + sj.y) / 2;
        const dx = sj.x - si.x;
        const dy = sj.y - si.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len < 1) continue;
        // Offset perpendicular to the element
        const nx = -dy / len * 16;
        const ny = dx / len * 16;
        const avgN = (ef.nStart + ef.nEnd) / 2;
        if (Math.abs(avgN) < 0.001) continue;
        const sign = avgN > 0 ? '+' : '';
        const label = `${sign}${avgN.toFixed(1)}`;
        // Background for readability
        const tw = ctx.measureText(label).width;
        ctx.fillStyle = 'rgba(10, 10, 30, 0.85)';
        ctx.fillRect(mx + nx - tw / 2 - 3, my + ny - 8, tw + 6, 14);
        // High-contrast text: bright red for tension, bright cyan for compression
        if (avgN > 0) {
          ctx.fillStyle = '#ff6b6b'; // bright red for tension
        } else {
          ctx.fillStyle = '#6bc5ff'; // bright cyan-blue for compression
        }
        ctx.fillText(label, mx + nx, my + ny + 3);
      }
      ctx.textAlign = 'left';
    }

    // Draw supports
    for (const sup of modelStore.supports.values()) {
      drawSupport(sup);
    }

    // Compute effective load visibility
    const diagramActive = !!(resultsStore.results && resultsStore.diagramType !== 'none');
    const loadsVisible = uiStore.showLoads && !(uiStore.hideLoadsWithDiagram && diagramActive);

    // Draw all loads (nodal, distributed, point, thermal) if visible
    if (loadsVisible) {

    // Draw nodal loads (grouped by node for stacked labels)
    {
      const nodalByNode = new Map<number, Array<{ type: string; data: any }>>();
      for (const load of modelStore.loads) {
        if (load.type !== 'nodal') continue;
        const nid = (load.data as any).nodeId;
        if (!nodalByNode.has(nid)) nodalByNode.set(nid, []);
        nodalByNode.get(nid)!.push(load);
      }
      for (const [_, loadsAtNode] of nodalByNode) {
        for (let i = 0; i < loadsAtNode.length; i++) {
          const ld = loadsAtNode[i];
          const caseId = (ld.data as any).caseId ?? 1;
          drawNodalLoad(
            ld,
            modelStore.getLoadCaseColor(caseId),
            modelStore.getLoadCaseName(caseId),
            i * 16,
          );
        }
      }
    }

    // Draw distributed loads (with case colors and stacked labels)
    {
      const distLoads = modelStore.loads
        .filter(l => l.type === 'distributed')
        .map(l => {
          const d = l.data as any;
          const caseId = d.caseId ?? 1;
          return {
            elementId: d.elementId, qI: d.qI, qJ: d.qJ,
            angle: d.angle, isGlobal: d.isGlobal,
            a: d.a, b: d.b,
            caseColor: modelStore.getLoadCaseColor(caseId),
            caseName: modelStore.getLoadCaseName(caseId),
            labelYOffset: 0,
          };
        });
      // Stack labels for same element
      const elemCount = new Map<number, number>();
      for (const d of distLoads) {
        const c = elemCount.get(d.elementId) ?? 0;
        d.labelYOffset = c * 16;
        elemCount.set(d.elementId, c + 1);
      }
      if (distLoads.length > 0) {
        drawDistributedLoads(distLoads, makeDrawContext());
      }
    }

    // Draw point loads on elements (with case colors and stacked labels)
    {
      const ptLoads = modelStore.loads
        .filter(l => l.type === 'pointOnElement')
        .map(l => {
          const d = l.data as any;
          const caseId = d.caseId ?? 1;
          return {
            elementId: d.elementId, a: d.a, p: d.p,
            px: d.px, mz: d.mz,
            angle: d.angle, isGlobal: d.isGlobal,
            caseColor: modelStore.getLoadCaseColor(caseId),
            caseName: modelStore.getLoadCaseName(caseId),
            labelYOffset: 0,
          };
        });
      // Stack labels for same element
      const elemCount = new Map<number, number>();
      for (const d of ptLoads) {
        const c = elemCount.get(d.elementId) ?? 0;
        d.labelYOffset = c * 16;
        elemCount.set(d.elementId, c + 1);
      }
      if (ptLoads.length > 0) {
        drawPointLoadsOnElements(ptLoads, makeDrawContext());
      }
    }

    // Draw thermal loads (with case name prefixes and stacked labels)
    {
      const thermLoads = modelStore.loads
        .filter(l => l.type === 'thermal')
        .map(l => {
          const d = l.data as any;
          const caseId = d.caseId ?? 1;
          return {
            elementId: d.elementId, dtUniform: d.dtUniform, dtGradient: d.dtGradient,
            caseName: modelStore.getLoadCaseName(caseId),
            labelYOffset: 0,
          };
        });
      const elemCount = new Map<number, number>();
      for (const d of thermLoads) {
        const c = elemCount.get(d.elementId) ?? 0;
        d.labelYOffset = c * 16;
        elemCount.set(d.elementId, c + 1);
      }
      if (thermLoads.length > 0) {
        drawThermalLoads(thermLoads, makeDrawContext());
      }
    }
    } // end loadsVisible

    // Draw moving load train axles for the current position
    if (resultsStore.movingLoadEnvelope && !resultsStore.movingLoadShowEnvelope) {
      const env = resultsStore.movingLoadEnvelope;
      const pos = env.positions[resultsStore.activeMovingLoadPosition];
      if (pos && env.path && env.train) {
        const axlePositions = computeAxleWorldPositions(
          pos.refPosition,
          env.train,
          env.path,
          (id: number) => modelStore.getNode(id),
        );
        if (axlePositions.length > 0) {
          drawMovingLoadAxles(axlePositions, makeDrawContext());
        }
      }
    }

    // Draw selected load highlights
    if (uiStore.selectedLoads.size > 0) {
      for (const loadId of uiStore.selectedLoads) {
        const load = modelStore.model.loads.find(l => l.data.id === loadId);
        if (!load) continue;
        let hx = 0, hy = 0;
        if (load.type === 'nodal') {
          const d = load.data as { nodeId: number };
          const node = modelStore.getNode(d.nodeId);
          if (!node) continue;
          hx = node.x; hy = node.y;
        } else {
          const d = load.data as { elementId: number; a?: number };
          const elem = modelStore.elements.get(d.elementId);
          if (!elem) continue;
          const ni = modelStore.getNode(elem.nodeI);
          const nj = modelStore.getNode(elem.nodeJ);
          if (!ni || !nj) continue;
          if (load.type === 'pointOnElement' && d.a != null) {
            const L = Math.sqrt((nj.x - ni.x) ** 2 + (nj.y - ni.y) ** 2);
            const t = L > 0 ? d.a / L : 0.5;
            hx = ni.x + t * (nj.x - ni.x);
            hy = ni.y + t * (nj.y - ni.y);
          } else {
            hx = (ni.x + nj.x) / 2;
            hy = (ni.y + nj.y) / 2;
          }
        }
        const sp = uiStore.worldToScreen(hx, hy);
        ctx!.save();
        ctx!.strokeStyle = '#4ecdc4';
        ctx!.lineWidth = 2;
        ctx!.setLineDash([4, 3]);
        ctx!.beginPath();
        ctx!.arc(sp.x, sp.y, 14, 0, Math.PI * 2);
        ctx!.stroke();
        ctx!.setLineDash([]);
        ctx!.fillStyle = 'rgba(78, 205, 196, 0.15)';
        ctx!.fill();
        ctx!.restore();
      }
    }

    // Draw nodes
    for (const node of modelStore.nodes.values()) {
      drawNode(node);
    }

    // Draw snap highlight when using tools that target nodes/elements
    const tool = uiStore.currentTool;
    if ((tool === 'element' && uiStore.elementMode === 'create') || tool === 'support' || tool === 'load') {
      const nearNode = findNearestNode(uiStore.worldX, uiStore.worldY, 0.5);
      if (nearNode) {
        const s = uiStore.worldToScreen(nearNode.x, nearNode.y);
        ctx.beginPath();
        ctx.arc(s.x, s.y, 12, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(78, 205, 196, 0.6)';
        ctx.lineWidth = 2;
        ctx.stroke();
      } else {
        // Check midpoint snap
        const midSnap = findNearestMidpoint(uiStore.worldX, uiStore.worldY, 0.4);
        if (midSnap) {
          const s = uiStore.worldToScreen(midSnap.x, midSnap.y);
          const d = 8;
          ctx.beginPath();
          ctx.moveTo(s.x, s.y - d);
          ctx.lineTo(s.x + d, s.y);
          ctx.lineTo(s.x, s.y + d);
          ctx.lineTo(s.x - d, s.y);
          ctx.closePath();
          ctx.strokeStyle = 'rgba(233, 196, 106, 0.8)';
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      }
    }

    // Draw node tool hinge mode hover highlight
    if (uiStore.currentTool === 'node' && uiStore.nodeMode === 'hinge') {
      const nearNode = findNearestNode(uiStore.worldX, uiStore.worldY, 0.3);
      if (nearNode) {
        // Hovering over a node: teal circle
        const sp = uiStore.worldToScreen(nearNode.x, nearNode.y);
        ctx!.save();
        ctx!.beginPath();
        ctx!.arc(sp.x, sp.y, 12, 0, Math.PI * 2);
        ctx!.strokeStyle = '#4ecdc4';
        ctx!.fillStyle = 'rgba(78, 205, 196, 0.15)';
        ctx!.lineWidth = 2.5;
        ctx!.fill();
        ctx!.stroke();
        ctx!.restore();
      } else {
        // Hovering over a bar: golden indicator at cut point
        const nearElem = findNearestElement(uiStore.worldX, uiStore.worldY, 0.5);
        if (nearElem) {
          const ni = modelStore.getNode(nearElem.nodeI);
          const nj = modelStore.getNode(nearElem.nodeJ);
          if (ni && nj) {
            const edx = nj.x - ni.x;
            const edy = nj.y - ni.y;
            const lenSq = edx * edx + edy * edy;
            let t = ((uiStore.worldX - ni.x) * edx + (uiStore.worldY - ni.y) * edy) / lenSq;
            t = Math.max(0.05, Math.min(0.95, t));
            const cutX = ni.x + t * edx;
            const cutY = ni.y + t * edy;
            const sp = uiStore.worldToScreen(cutX, cutY);
            ctx!.save();
            // Golden circle at cut point
            ctx!.beginPath();
            ctx!.arc(sp.x, sp.y, 10, 0, Math.PI * 2);
            ctx!.strokeStyle = '#e9c46a';
            ctx!.fillStyle = 'rgba(233, 196, 106, 0.2)';
            ctx!.lineWidth = 2.5;
            ctx!.fill();
            ctx!.stroke();
            // Cross (+) inside
            ctx!.beginPath();
            ctx!.moveTo(sp.x - 5, sp.y);
            ctx!.lineTo(sp.x + 5, sp.y);
            ctx!.moveTo(sp.x, sp.y - 5);
            ctx!.lineTo(sp.x, sp.y + 5);
            ctx!.strokeStyle = '#e9c46a';
            ctx!.lineWidth = 1.5;
            ctx!.stroke();
            ctx!.restore();
          }
        }
      }
    }

    // Draw pending node + rubber band line
    if (pendingNode) {
      const screen = uiStore.worldToScreen(pendingNode.x, pendingNode.y);
      ctx.beginPath();
      ctx.arc(screen.x, screen.y, 6, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(233, 69, 96, 0.5)';
      ctx.fill();

      // Rubber band line to current mouse position
      if (uiStore.currentTool === 'element') {
        const mouseScreen = uiStore.worldToScreen(uiStore.worldX, uiStore.worldY);
        ctx.beginPath();
        ctx.moveTo(screen.x, screen.y);
        ctx.lineTo(mouseScreen.x, mouseScreen.y);
        ctx.strokeStyle = 'rgba(233, 69, 96, 0.4)';
        ctx.setLineDash([6, 4]);
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // Draw results
    if (resultsStore.results) {
      const dt = resultsStore.diagramType;
      setDiagramUnitSystem(uiStore.unitSystem);

      const lh = uiStore.axisConvention3D === 'leftHand';
      if (dt === 'deformed') {
        const baseScale = resultsStore.deformedScale;
        const animScale = resultsStore.animateDeformed
          ? baseScale * Math.sin(performance.now() / (500 / resultsStore.animSpeed))
          : baseScale;
        drawDeformed(resultsStore.results, makeDrawContext(), uiStore.zoom, animScale);
      } else if (dt === 'moment' || dt === 'shear' || dt === 'axial') {
        const dkind = dt as DiagramKind;
        // Check if we should render envelope dual curves
        const showEnvelopeDual = (resultsStore.isEnvelopeActive || resultsStore.movingLoadShowEnvelope) && (
          resultsStore.isEnvelopeActive ? resultsStore.fullEnvelope : resultsStore.movingLoadEnvelope?.fullEnvelope
        );
        if (showEnvelopeDual) {
          const envSrc = resultsStore.isEnvelopeActive ? resultsStore.fullEnvelope! : resultsStore.movingLoadEnvelope!.fullEnvelope!;
          const envData = dkind === 'moment' ? envSrc.moment
                        : dkind === 'shear'  ? envSrc.shear
                        :                       envSrc.axial;
          drawEnvelopeDiagrams(envData, makeDrawContext(), resultsStore.diagramScale, resultsStore.showDiagramValues, lh);
          // Draw envelope legend
          ctx.save();
          ctx.font = '11px sans-serif';
          const legendX = 10;
          const legendY = canvas.height - 40;
          // Positive line
          ctx.strokeStyle = dkind === 'moment' ? '#4169E1' : dkind === 'shear' ? '#32CD32' : '#BA55D3';
          ctx.lineWidth = 3;
          ctx.beginPath(); ctx.moveTo(legendX, legendY); ctx.lineTo(legendX + 20, legendY); ctx.stroke();
          ctx.fillStyle = '#ccc';
          ctx.fillText(t('viewport.envPlus'), legendX + 24, legendY + 4);
          // Negative line
          ctx.strokeStyle = dkind === 'moment' ? '#E15041' : dkind === 'shear' ? '#CD3232' : '#D35565';
          ctx.beginPath(); ctx.moveTo(legendX, legendY + 16); ctx.lineTo(legendX + 20, legendY + 16); ctx.stroke();
          ctx.fillText(t('viewport.envMinus'), legendX + 24, legendY + 20);
          ctx.restore();
        } else {
          // Normal mode: overlay + main diagram
          if (resultsStore.overlayResults) {
            // Compute shared globalMax so both diagrams use the same scale
            const sharedMax = Math.max(
              computeDiagramGlobalMax(resultsStore.results, dkind),
              computeDiagramGlobalMax(resultsStore.overlayResults, dkind),
            );
            const overlayColors = { fill: 'rgba(255, 165, 0, 0.12)', stroke: 'rgba(255, 165, 0, 0.5)', text: 'rgba(255, 165, 0, 0.6)' };
            drawDiagrams(resultsStore.overlayResults, dkind, makeDrawContext(), resultsStore.diagramScale, false, overlayColors, sharedMax, lh);
            drawDiagrams(resultsStore.results, dkind, makeDrawContext(), resultsStore.diagramScale, resultsStore.showDiagramValues, undefined, sharedMax, lh);
          } else {
            drawDiagrams(resultsStore.results, dkind, makeDrawContext(), resultsStore.diagramScale, resultsStore.showDiagramValues, undefined, undefined, lh);
          }
        }
      } else if (dt === 'influenceLine' && resultsStore.influenceLine) {
        drawInfluenceLine(resultsStore.influenceLine, makeDrawContext(), uiStore.zoom, resultsStore.ilAnimating ? resultsStore.ilAnimProgress : undefined);
      } else if (dt === 'modeShape' && resultsStore.modalResult) {
        const mode = resultsStore.modalResult.modes[resultsStore.activeModeIndex];
        if (mode) {
          const animScale = 50 / uiStore.zoom * Math.sin(performance.now() / 500);
          const mdc = {
            ctx,
            worldToScreen: (wx: number, wy: number) => uiStore.worldToScreen(wx, wy),
            nodes: modelStore.nodes as Map<number, { x: number; y: number }>,
            elements: modelStore.elements as Map<number, { nodeI: number; nodeJ: number }>,
          };
          drawModeShape(mode.displacements, mdc, uiStore.zoom, animScale, '#4ecdc4');
        }
      } else if (dt === 'bucklingMode' && resultsStore.bucklingResult) {
        const mode = resultsStore.bucklingResult.modes[resultsStore.activeBucklingMode];
        if (mode) {
          const animScale = 50 / uiStore.zoom * Math.sin(performance.now() / 500);
          const mdc = {
            ctx,
            worldToScreen: (wx: number, wy: number) => uiStore.worldToScreen(wx, wy),
            nodes: modelStore.nodes as Map<number, { x: number; y: number }>,
            elements: modelStore.elements as Map<number, { nodeI: number; nodeJ: number }>,
          };
          drawModeShape(mode.displacements, mdc, uiStore.zoom, animScale, '#e96941');
        }
      } else if (dt === 'plasticHinges' && resultsStore.plasticResult) {
        const mdc = {
          ctx,
          worldToScreen: (wx: number, wy: number) => uiStore.worldToScreen(wx, wy),
          nodes: modelStore.nodes as Map<number, { x: number; y: number }>,
          elements: modelStore.elements as Map<number, { nodeI: number; nodeJ: number }>,
        };
        drawPlasticHinges(resultsStore.plasticResult, resultsStore.plasticStep, mdc, uiStore.zoom);
      }

      // Draw reactions when results exist and toggle is on
      if (resultsStore.showReactions) drawReactions();
      if (resultsStore.showConstraintForces) drawConstraintForces();

      // Overlay label
      if (resultsStore.overlayResults && resultsStore.overlayLabel) {
        const dt = resultsStore.diagramType;
        if (dt === 'moment' || dt === 'shear' || dt === 'axial') {
          ctx.fillStyle = 'rgba(255, 165, 0, 0.7)';
          ctx.font = 'bold 11px sans-serif';
          ctx.textAlign = 'left';
          ctx.fillText(t('viewport.overlay').replace('{label}', resultsStore.overlayLabel), 10, height - 15);
          ctx.textAlign = 'left';
        }
      }

      // Color legend for stressRatio and axialColor
      if (resultsStore.diagramType === 'colorMap' && resultsStore.colorMapKind === 'stressRatio') {
        const lx = 12, ly = height - 110, lw = 16, lh = 90;
        // Gradient bar
        for (let i = 0; i < lh; i++) {
          const norm = 1.0 - i / lh; // top=1 (red), bottom=0 (green/blue)
          const r = norm < 0.5 ? Math.round(norm * 2 * 255) : 255;
          const g = norm < 0.5 ? 255 : Math.round((1 - (norm - 0.5) * 2) * 255);
          const b = norm < 0.25 ? Math.round((1 - norm * 4) * 200) : 0;
          ctx.fillStyle = `rgb(${r},${g},${b})`;
          ctx.fillRect(lx, ly + i, lw, 1);
        }
        // Magenta cap for >100%
        ctx.fillStyle = 'rgb(255,0,255)';
        ctx.fillRect(lx, ly - 10, lw, 10);
        // Border
        ctx.strokeStyle = 'rgba(255,255,255,0.3)';
        ctx.lineWidth = 1;
        ctx.strokeRect(lx, ly - 10, lw, lh + 10);
        // Labels
        ctx.fillStyle = '#ccc';
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText('>100%', lx + lw + 4, ly - 3);
        ctx.fillText('100%', lx + lw + 4, ly + 4);
        ctx.fillText('50%', lx + lw + 4, ly + lh / 2 + 3);
        ctx.fillText('0%', lx + lw + 4, ly + lh + 3);
        ctx.font = 'bold 10px sans-serif';
        ctx.fillStyle = '#aaa';
        ctx.fillText(t('viewport.resistance'), lx, ly - 16);
      } else if (resultsStore.diagramType === 'axialColor') {
        const lx = 12, ly = height - 80;
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillStyle = '#aaa';
        ctx.font = 'bold 10px sans-serif';
        ctx.fillText(t('viewport.axial'), lx, ly);
        ctx.font = '10px sans-serif';
        ctx.fillStyle = 'rgb(255,40,40)';
        ctx.fillRect(lx, ly + 6, 12, 12);
        ctx.fillStyle = '#ccc';
        ctx.fillText(t('viewport.tension'), lx + 16, ly + 16);
        ctx.fillStyle = 'rgb(40,80,255)';
        ctx.fillRect(lx, ly + 22, 12, 12);
        ctx.fillStyle = '#ccc';
        ctx.fillText(t('viewport.compression'), lx + 16, ly + 32);
      }
    }

    // Draw diagram query marker
    if (diagramQuery && resultsStore.results) {
      const dt = resultsStore.diagramType;
      if (dt === 'moment' || dt === 'shear' || dt === 'axial') {
        const s = uiStore.worldToScreen(diagramQuery.worldX, diagramQuery.worldY);
        // Cross marker
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(s.x - 6, s.y - 6); ctx.lineTo(s.x + 6, s.y + 6);
        ctx.moveTo(s.x + 6, s.y - 6); ctx.lineTo(s.x - 6, s.y + 6);
        ctx.stroke();

        const unit = dt === 'moment' ? 'kN·m' : 'kN';
        const label = dt === 'moment' ? 'M' : dt === 'shear' ? 'V' : 'N';
        // Negate moment for display (internal: hogging=+, display: sagging=+)
        const displayVal = dt === 'moment' ? -diagramQuery.value : diagramQuery.value;
        const abs = Math.abs(displayVal);
        const formatted = abs >= 100 ? abs.toFixed(1) : abs >= 1 ? abs.toFixed(2) : abs.toFixed(3);
        const sign = displayVal < 0 ? '-' : '';
        const xPos = (diagramQuery.t * 100).toFixed(1);
        drawTooltip(s.x + 12, s.y - 25, [
          `${label} = ${sign}${formatted} ${unit}`,
          `x/L = ${xPos}%`,
        ]);
      }
    }

    // Draw stress query marker (section analysis point)
    if (resultsStore.stressQuery && resultsStore.results) {
      const sq = resultsStore.stressQuery;
      const s = uiStore.worldToScreen(sq.worldX, sq.worldY);

      // Find element direction for perpendicular line
      const elem = modelStore.elements.get(sq.elementId);
      if (elem) {
        const ni = modelStore.getNode(elem.nodeI);
        const nj = modelStore.getNode(elem.nodeJ);
        if (ni && nj) {
          const edx = nj.x - ni.x;
          const edy = nj.y - ni.y;
          const len = Math.sqrt(edx * edx + edy * edy);
          // Perpendicular direction (in screen space, Y inverted)
          const px = -edy / len;
          const py = edx / len;
          const markLen = 18;

          // Perpendicular line
          ctx.strokeStyle = '#4ecdc4';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(s.x - px * markLen, s.y + py * markLen);
          ctx.lineTo(s.x + px * markLen, s.y - py * markLen);
          ctx.stroke();

          // Circle at point
          ctx.beginPath();
          ctx.arc(s.x, s.y, 4, 0, Math.PI * 2);
          ctx.fillStyle = '#4ecdc4';
          ctx.fill();
          ctx.strokeStyle = '#16213e';
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
      }
    }

    // Draw diagram hover crosshair + tooltip (only if no click query active)
    if (diagramHover && resultsStore.results && !diagramQuery) {
      const dt = resultsStore.diagramType;
      if (dt === 'moment' || dt === 'shear' || dt === 'axial' || dt === 'deformed' || dt === 'colorMap') {
        const s = uiStore.worldToScreen(diagramHover.worldX, diagramHover.worldY);

        // Dashed crosshair line perpendicular to element
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(s.x, s.y - 30);
        ctx.lineTo(s.x, s.y + 30);
        ctx.stroke();
        ctx.setLineDash([]);

        // Small dot at projected position
        ctx.beginPath();
        ctx.arc(s.x, s.y, 3, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.fill();

        const xPos = (diagramHover.t * 100).toFixed(1);
        if (diagramHover.lines) {
          // Multi-line tooltip (e.g. deformed mode: ux, uy, θ)
          drawTooltip(s.x + 12, s.y - 25, [
            ...diagramHover.lines,
            `x/L = ${xPos}%`,
          ]);
        } else {
          // Determine label/unit from type or from hover data
          const label = diagramHover.label ?? (dt === 'moment' ? 'M' : dt === 'shear' ? 'V' : 'N');
          const unit = diagramHover.unit ?? (dt === 'moment' ? 'kN·m' : 'kN');
          // Negate moment for display (internal: hogging=+, display: sagging=+)
          const isMomentHover = (diagramHover.label === 'M' || diagramHover.label == null) && (dt === 'moment' || (dt === 'colorMap' && label === 'M'));
          const displayVal = isMomentHover ? -diagramHover.value : diagramHover.value;
          const abs = Math.abs(displayVal);
          const formatted = abs >= 100 ? abs.toFixed(1) : abs >= 1 ? abs.toFixed(2) : abs.toFixed(3);
          const sign = displayVal < 0 ? '-' : '';
          drawTooltip(s.x + 12, s.y - 25, [
            `${label} = ${sign}${formatted} ${unit}`,
            `x/L = ${xPos}%`,
          ]);
        }
      }
    }

    // Draw hover tooltip (suppress when diagram hover or diagram query is active to avoid overlap)
    if (uiStore.currentTool === 'select' && !boxSelect && draggedNodeId === null && !diagramHover && !diagramQuery) {
      const hoverNode = findNearestNode(uiStore.worldX, uiStore.worldY, 0.3);
      if (hoverNode) {
        const lines: string[] = [t('viewport.nodeTooltip').replace('{id}', String(hoverNode.id))];
        lines.push(`(${hoverNode.x.toFixed(2)}, ${hoverNode.y.toFixed(2)}) m`);
        // Show displacement if results exist
        if (resultsStore.results) {
          const d = resultsStore.getDisplacement(hoverNode.id);
          if (d) {
            lines.push(`δ: ${(Math.sqrt(d.ux**2 + d.uy**2) * 1000).toFixed(3)} mm`);
          }
        }
        drawTooltip(uiStore.mouseX + 15, uiStore.mouseY - 10, lines);
      } else {
        const hoverElem = findNearestElement(uiStore.worldX, uiStore.worldY, 0.3);
        if (hoverElem) {
          const lines: string[] = [t('viewport.elemTooltip').replace('{id}', String(hoverElem.id)).replace('{type}', hoverElem.type)];
          const L = modelStore.getElementLength(hoverElem.id);
          lines.push(`L: ${L.toFixed(3)} m`);
          if (resultsStore.results) {
            const f = resultsStore.getElementForces(hoverElem.id);
            if (f) {
              lines.push(`M: ${f.mStart.toFixed(2)}/${f.mEnd.toFixed(2)} kN·m`);
              lines.push(`V: ${f.vStart.toFixed(2)}/${f.vEnd.toFixed(2)} kN`);
              lines.push(`N: ${f.nStart.toFixed(2)}/${f.nEnd.toFixed(2)} kN`);
            }
          }
          drawTooltip(uiStore.mouseX + 15, uiStore.mouseY - 10, lines);
        }
      }
    }

    // Draw box selection rectangle (AutoCAD-style: Window vs Crossing)
    if (boxSelect) {
      const x = Math.min(boxSelect.startX, boxSelect.endX);
      const y = Math.min(boxSelect.startY, boxSelect.endY);
      const w = Math.abs(boxSelect.endX - boxSelect.startX);
      const h = Math.abs(boxSelect.endY - boxSelect.startY);
      const isWindow = boxSelect.endX >= boxSelect.startX;

      if (isWindow) {
        // Window (left→right): solid border, teal — only fully contained
        ctx.strokeStyle = '#4ecdc4';
        ctx.lineWidth = 1;
        ctx.setLineDash([]);
        ctx.strokeRect(x, y, w, h);
        ctx.fillStyle = 'rgba(78, 205, 196, 0.08)';
        ctx.fillRect(x, y, w, h);
      } else {
        // Crossing (right→left): dashed border, green — touching counts
        ctx.strokeStyle = '#77dd77';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.strokeRect(x, y, w, h);
        ctx.fillStyle = 'rgba(119, 221, 119, 0.08)';
        ctx.fillRect(x, y, w, h);
        ctx.setLineDash([]);
      }
    }
  }

  function drawGrid() {
    _drawGrid(ctx!, width, height, uiStore.gridSize, (wx, wy) => uiStore.worldToScreen(wx, wy), (sx, sy) => uiStore.screenToWorld(sx, sy));
  }

  function drawAxes() {
    _drawAxes(ctx!, width, height, (wx, wy) => uiStore.worldToScreen(wx, wy));
  }

  function drawNode(node: { id: number; x: number; y: number }) {
    _drawNode(ctx!, node, (wx, wy) => uiStore.worldToScreen(wx, wy), uiStore.selectedNodes.has(node.id), uiStore.showNodeLabels);
  }

  function drawElement(elem: { id: number; type: string; nodeI: number; nodeJ: number; materialId: number; sectionId: number; hingeStart?: boolean; hingeEnd?: boolean }, colorOverride?: string, nodeBarCount?: Map<number, number>) {
    const ni = modelStore.getNode(elem.nodeI);
    const nj = modelStore.getNode(elem.nodeJ);
    if (!ni || !nj) return;

    const opts: DrawElementOpts = {
      worldToScreen: (wx, wy) => uiStore.worldToScreen(wx, wy),
      isSelected: uiStore.selectedElements.has(elem.id),
      elementColorMode: uiStore.elementColorMode,
      showElementLabels: uiStore.showElementLabels,
      showLengths: uiStore.showLengths,
      zoom: uiStore.zoom,
      diagramType: resultsStore.diagramType,
      worldLength: modelStore.getElementLength(elem.id),
    };
    _drawElement(ctx!, elem, ni, nj, opts, colorOverride, nodeBarCount);
  }

  function drawSupport(sup: { id: number; nodeId: number; type: string; dx?: number; dy?: number; drz?: number; angle?: number; isGlobal?: boolean }) {
    const node = modelStore.getNode(sup.nodeId);
    if (!node) return;
    const screen = uiStore.worldToScreen(node.x, node.y);
    _drawSupport(ctx!, sup, screen, uiStore.selectedSupports.has(sup.id), (nid) => modelStore.getElementAngleAtNode(nid));
  }

  function drawNodalLoad(load: { type: string; data: any }, caseColor?: string, caseName?: string, labelYOffset?: number) {
    const node = modelStore.getNode(load.data.nodeId);
    if (!node) return;
    const screen = uiStore.worldToScreen(node.x, node.y);
    _drawNodalLoad(ctx!, screen, load.data, caseColor, caseName, labelYOffset);
  }

  function drawReactions() {
    if (!resultsStore.results) return;
    _drawReactions(ctx!, resultsStore.results.reactions as ReactionData[], (nodeId) => {
      const node = modelStore.getNode(nodeId);
      if (!node) return null;
      return uiStore.worldToScreen(node.x, node.y);
    });
  }

  function drawConstraintForces() {
    const forces = resultsStore.constraintForces;
    if (!forces || forces.length === 0) return;
    _drawConstraintForces(ctx!, forces as ConstraintForceData[], (nodeId) => {
      const node = modelStore.getNode(nodeId);
      if (!node) return null;
      return uiStore.worldToScreen(node.x, node.y);
    });
  }

  function handleMouseDown(e: MouseEvent) {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const world = uiStore.screenToWorld(mx, my);
    const snapped = uiStore.snapWorld(world.x, world.y);

    // Close context menu on any click
    uiStore.contextMenu = null;

    // Pan: middle mouse or pan tool
    if (uiStore.currentTool === 'pan' || e.button === 1) {
      isPanning = true;
      panStartX = mx;
      panStartY = my;
      return;
    }

    if (uiStore.currentTool === 'node') {
      if (uiStore.nodeMode === 'hinge') {
        // Hinge mode: click on node → select + show hinges; click on bar → split + hinge
        const nearNode = findNearestNode(world.x, world.y, 0.3);
        if (nearNode) {
          // Click on existing node → toggle all hinges at that node
          const hinges = modelStore.getHingesAtNode(nearNode.id);
          if (hinges.length > 0) {
            const anyRigid = hinges.some(h => !h.hasHinge);
            modelStore.batch(() => {
              for (const h of hinges) {
                if (anyRigid && !h.hasHinge) modelStore.toggleHinge(h.elementId, h.end);
                else if (!anyRigid && h.hasHinge) modelStore.toggleHinge(h.elementId, h.end);
              }
            });
            resultsStore.clear();
            uiStore.selectNode(nearNode.id);
            uiStore.toast(anyRigid ? t('viewport.nodeHinged') : t('viewport.hingesRemoved'), 'info');
          }
          // Stay in hinge mode to continue articulating other nodes
        } else {
          // Click on bar → split and add hinges at the split point
          const nearElem = findNearestElement(world.x, world.y, 0.5);
          if (nearElem) {
            const ni = modelStore.getNode(nearElem.nodeI);
            const nj = modelStore.getNode(nearElem.nodeJ);
            if (ni && nj) {
              const edx = nj.x - ni.x;
              const edy = nj.y - ni.y;
              const lenSq = edx * edx + edy * edy;
              let t = ((world.x - ni.x) * edx + (world.y - ni.y) * edy) / lenSq;
              t = Math.max(0.05, Math.min(0.95, t));
              const result = modelStore.splitElementAtPoint(nearElem.id, t);
              if (result) {
                modelStore.toggleHinge(result.elemA, 'end');
                modelStore.toggleHinge(result.elemB, 'start');
                resultsStore.clear();
                uiStore.selectNode(result.nodeId);
                uiStore.toast(t('viewport.barSubdividedWithHinge'), 'info');
              }
            }
          }
        }
      } else {
        // Create node mode (default)
        const ms = snapWithMidpoint(world.x, world.y);
        modelStore.addNode(ms.x, ms.y);
      }
    } else if (uiStore.currentTool === 'element') {
      // For element tool: snap to existing node, or midpoint (create node there), or grid
      const nearNode = findNearestNode(snapped.x, snapped.y, 0.5);
      const targetNode = nearNode ?? (() => {
        const mid = findNearestMidpoint(world.x, world.y, 0.4);
        if (mid) {
          // Check if a node already exists at midpoint
          const existing = findNearestNode(mid.x, mid.y, 0.01);
          if (existing) return existing;
          // Create a new node at midpoint
          const id = modelStore.addNode(mid.x, mid.y);
          return modelStore.getNode(id) ?? null;
        }
        return null;
      })();
      if (targetNode) {
        if (!pendingNode) {
          pendingNode = { x: targetNode.x, y: targetNode.y };
          uiStore.selectNode(targetNode.id);
        } else {
          const startNode = findNearestNode(pendingNode.x, pendingNode.y, 0.1);
          if (startNode && startNode.id !== targetNode.id) {
            modelStore.addElement(startNode.id, targetNode.id, uiStore.elementCreateType);
          }
          pendingNode = { x: targetNode.x, y: targetNode.y };
          uiStore.selectNode(targetNode.id);
        }
      }
    } else if (uiStore.currentTool === 'support') {
      // Support: find nearest existing node using raw world coords (not snapped,
      // to avoid grid-snapping moving the search point away from the actual node)
      const nearNode = findNearestNode(world.x, world.y, 0.5);
      if (nearNode) {
        if (uiStore.supportType === 'spring') {
          const springAngle = uiStore.supportAngle;
          const springIsGlobal = uiStore.supportIsGlobal;
          const springOpts: { angle?: number; isGlobal?: boolean } = {};
          if (springAngle !== 0) springOpts.angle = springAngle;
          if (!springIsGlobal) springOpts.isGlobal = false;
          const springId = modelStore.addSupport(nearNode.id, 'spring', {
            kx: uiStore.springKx,
            ky: uiStore.springKy,
            kz: uiStore.springKz || undefined,
          }, (springOpts.angle !== undefined || springOpts.isGlobal !== undefined) ? springOpts : undefined);
          // Reset angle to 0 after placing
          uiStore.supportAngle = 0;
        } else if (uiStore.supportType === 'roller') {
          // Deduce actual roller type based on direction setting
          const rollerType = uiStore.supportDirection === 'x' ? 'rollerX' : 'rollerY';
          const angle = uiStore.supportAngle;
          const isGlobal = uiStore.supportIsGlobal;
          const opts: { angle?: number; isGlobal?: boolean } = {};
          if (angle !== 0) opts.angle = angle;
          if (!isGlobal) opts.isGlobal = false;
          const rollerId = modelStore.addSupport(nearNode.id, rollerType, undefined, (opts.angle !== undefined || opts.isGlobal !== undefined) ? opts : undefined);
          // Apply prescribed displacement di (always in restrained direction, stored as dx)
          if (uiStore.supportDx !== 0) {
            modelStore.updateSupport(rollerId, { dx: uiStore.supportDx });
          }
          // Reset angle to 0 after placing
          uiStore.supportAngle = 0;
        } else {
          // fixed or pinned
          const angle = uiStore.supportAngle;
          const opts: { angle?: number } = {};
          if (angle !== 0) opts.angle = angle;
          const supId = modelStore.addSupport(nearNode.id, uiStore.supportType as any, undefined, opts.angle !== undefined ? opts : undefined);
          // Apply prescribed displacements if any are non-zero
          const presc: Record<string, number> = {};
          if (uiStore.supportDx !== 0) presc.dx = uiStore.supportDx;
          if (uiStore.supportDy !== 0) presc.dy = uiStore.supportDy;
          if (uiStore.supportDrz !== 0) presc.drz = uiStore.supportDrz;
          if (Object.keys(presc).length > 0) {
            modelStore.updateSupport(supId, presc);
          }
          // Reset angle to 0 after placing
          uiStore.supportAngle = 0;
        }
      }
    } else if (uiStore.currentTool === 'load') {
      // Use raw world coords for hit-testing (not grid-snapped) so loads
      // can be placed on nodes/elements that are off-grid.
      // Always create new loads — selection only from select tool in 'loads' mode.

      const activeCaseId = uiStore.activeLoadCaseId;

      if (uiStore.loadType === 'nodal') {
        // Nodal: click node → NodalLoad; click bar → PointLoadOnElement
        const nearNode = findNearestNode(world.x, world.y, 0.5);
        if (nearNode) {
          const v = uiStore.loadValue;
          const dir = uiStore.nodalLoadDir;
          const fx = dir === 'fx' ? v : 0;
          const fy = dir === 'fy' ? v : 0;
          const mz = dir === 'mz' ? v : 0;
          modelStore.addNodalLoad(nearNode.id, fx, fy, mz, activeCaseId);
        } else {
          // No node nearby — try element for PointLoadOnElement
          const nearElem = findNearestElement(world.x, world.y, 0.5);
          if (nearElem) {
            const ni = modelStore.getNode(nearElem.nodeI);
            const nj = modelStore.getNode(nearElem.nodeJ);
            if (ni && nj) {
              const dx = nj.x - ni.x;
              const dy = nj.y - ni.y;
              const lenSq = dx * dx + dy * dy;
              let t = ((world.x - ni.x) * dx + (world.y - ni.y) * dy) / lenSq;
              t = Math.max(0.01, Math.min(0.99, t));
              const a = t * Math.sqrt(lenSq);

              const angle = uiStore.loadAngle !== 0 ? uiStore.loadAngle : undefined;
              const isGlobal = uiStore.loadIsGlobal ? true : undefined;
              const dir = uiStore.nodalLoadDir;
              const v = uiStore.loadValue;
              // Map direction to the correct component:
              // fx/fi → axial (px), fy/fj → perpendicular (p), mz → moment
              const p = dir === 'fy' ? v : 0;
              const px = dir === 'fx' ? v : 0;
              const mz = dir === 'mz' ? v : 0;
              modelStore.addPointLoadOnElement(nearElem.id, a, p, { px: px || undefined, mz: mz || undefined, angle, isGlobal, caseId: activeCaseId });
            }
          }
        }
      } else if (uiStore.loadType === 'distributed') {
        const nearElem = findNearestElement(world.x, world.y, 0.5);
        if (nearElem) {
          const angle = uiStore.loadAngle !== 0 ? uiStore.loadAngle : undefined;
          const isGlobal = uiStore.loadIsGlobal ? true : undefined;
          modelStore.addDistributedLoad(nearElem.id, uiStore.loadValue, uiStore.loadValueJ, angle, isGlobal, activeCaseId);
        }
      } else if (uiStore.loadType === 'thermal') {
        const nearElem = findNearestElement(world.x, world.y, 0.5);
        if (nearElem) {
          modelStore.addThermalLoad(nearElem.id, uiStore.thermalDT, uiStore.thermalDTg, activeCaseId);
        }
      }
    } else if (uiStore.currentTool === 'influenceLine') {
      // Influence line: click node for Ry/Rx/Mz, click element for V/M
      const q = uiStore.ilQuantity;
      const nearNode = findNearestNode(world.x, world.y, 0.5);
      const nearElem = findNearestElement(world.x, world.y, 0.5);

      let result: any;
      if ((q === 'Ry' || q === 'Rx' || q === 'Mz') && nearNode) {
        result = modelStore.computeInfluenceLine(q, nearNode.id);
      } else if ((q === 'V' || q === 'M') && nearElem) {
        result = modelStore.computeInfluenceLine(q, undefined, nearElem.id, 0.5);
      } else if (nearNode) {
        // Clicked node but quantity is V/M → switch to Ry
        result = modelStore.computeInfluenceLine('Ry', nearNode.id);
        uiStore.ilQuantity = 'Ry';
      } else if (nearElem) {
        // Clicked element but quantity is Ry/Rx/Mz → switch to M
        result = modelStore.computeInfluenceLine('M', undefined, nearElem.id, 0.5);
        uiStore.ilQuantity = 'M';
      } else {
        uiStore.toast(t('viewport.ilClickHint'), 'info');
      }

      if (result) {
        if (typeof result === 'string') {
          uiStore.toast(result, 'error');
        } else {
          resultsStore.setInfluenceLine(result);
          uiStore.toast(t('viewport.ilCalculated'), 'success');
        }
      }
    } else if (uiStore.currentTool === 'select') {
      const sm = uiStore.selectMode;

      if (sm === 'stress') {
        // ── Stress mode: click on element → stress query + diagram query ──
        const dt = resultsStore.diagramType;
        if (resultsStore.results) {
          const nearElem = findNearestElement(world.x, world.y, 0.3);
          if (nearElem) {
            const ni = modelStore.getNode(nearElem.nodeI);
            const nj = modelStore.getNode(nearElem.nodeJ);
            if (ni && nj) {
              const edx = nj.x - ni.x;
              const edy = nj.y - ni.y;
              const lenSq = edx * edx + edy * edy;
              let t = ((world.x - ni.x) * edx + (world.y - ni.y) * edy) / lenSq;
              t = Math.max(0, Math.min(1, t));
              const wx = ni.x + t * edx;
              const wy = ni.y + t * edy;
              resultsStore.stressQuery = { elementId: nearElem.id, t, worldX: wx, worldY: wy };
              if (dt === 'moment' || dt === 'shear' || dt === 'axial') {
                const ef = resultsStore.getElementForces(nearElem.id);
                if (ef) {
                  const value = computeDiagramValueAt(dt as 'moment' | 'shear' | 'axial', t, ef);
                  diagramQuery = { elementId: nearElem.id, t, value, worldX: wx, worldY: wy };
                }
              }
            }
          } else {
            resultsStore.stressQuery = null;
            diagramQuery = null;
          }
        }
      } else if (sm === 'supports') {
        // ── Supports mode: click to select a support ──
        const nearSup = findNearestSupport(world.x, world.y, 0.5);
        if (nearSup) {
          uiStore.selectSupport(nearSup.id, e.shiftKey);
        } else {
          if (!e.shiftKey) uiStore.clearSelectedSupports();
        }
      } else if (sm === 'loads') {
        // ── Loads mode: click to select a load with cycling for overlapping loads ──
        const allNear = findAllLoadsNear(world.x, world.y, 0.5);
        if (allNear.length > 0) {
          if (e.shiftKey) {
            // Shift: add next unselected to selection, or toggle first
            const first = allNear.find(id => !uiStore.selectedLoads.has(id)) ?? allNear[0];
            uiStore.selectLoad(first, true);
          } else if (allNear.length > 1 && uiStore.selectedLoads.size === 1 && uiStore.selectedLoads.has(allNear[0])) {
            // Click same spot with one already selected → cycle to next
            uiStore.selectLoad(allNear[1], false);
          } else {
            uiStore.selectLoad(allNear[0], false);
          }
        } else {
          if (!e.shiftKey) uiStore.clearSelectedLoads();
        }
      } else if (sm === 'nodes') {
        // ── Nodes mode: select nodes for hinge management ──
        const nearNode = findNearestNode(snapped.x, snapped.y, 0.3);
        if (nearNode) {
          uiStore.selectNode(nearNode.id, e.shiftKey);
        } else {
          if (!e.shiftKey) uiStore.clearSelection();
        }
      } else {
        // ── Elements mode (default): select nodes/bars, drag, box select ──
        diagramQuery = null;

        // Diagram query still works for reading values (but no stress query)
        const dt = resultsStore.diagramType;
        if (resultsStore.results && (dt === 'moment' || dt === 'shear' || dt === 'axial')) {
          const nearElem = findNearestElement(world.x, world.y, 0.3);
          if (nearElem) {
            const ni = modelStore.getNode(nearElem.nodeI);
            const nj = modelStore.getNode(nearElem.nodeJ);
            if (ni && nj) {
              const edx = nj.x - ni.x;
              const edy = nj.y - ni.y;
              const lenSq = edx * edx + edy * edy;
              let t = ((world.x - ni.x) * edx + (world.y - ni.y) * edy) / lenSq;
              t = Math.max(0, Math.min(1, t));
              const ef = resultsStore.getElementForces(nearElem.id);
              if (ef) {
                const value = computeDiagramValueAt(dt as 'moment' | 'shear' | 'axial', t, ef);
                const wx = ni.x + t * edx;
                const wy = ni.y + t * edy;
                diagramQuery = { elementId: nearElem.id, t, value, worldX: wx, worldY: wy };
              }
            }
          }
        }

        // Try to select/drag a node
        const nearNode = findNearestNode(snapped.x, snapped.y, 0.3);
        if (nearNode) {
          if (!uiStore.selectedNodes.has(nearNode.id)) {
            uiStore.selectNode(nearNode.id, e.shiftKey);
          }
          historyStore.pushState();
          draggedNodeId = nearNode.id;
          dragMoved = false;
          dragStartWorld = { x: snapped.x, y: snapped.y };
        } else {
          const nearElem = findNearestElement(world.x, world.y, 0.3);
          if (nearElem) {
            uiStore.selectElement(nearElem.id, e.shiftKey);
            // Sync with DSM Matrix Explorer if wizard is open
            if (dsmStepsStore.isOpen) dsmStepsStore.selectElement(nearElem.id);
          } else {
            if (!e.shiftKey) uiStore.clearSelection();
            boxSelect = { startX: mx, startY: my, endX: mx, endY: my };
          }
        }
      }
    }
  }

  function handleMouseMove(e: MouseEvent) {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const world = uiStore.screenToWorld(mx, my);
    const snapped = uiStore.snapWorld(world.x, world.y);

    // For tools that benefit from midpoint snap, update world coords accordingly
    const toolNow = uiStore.currentTool;
    if (toolNow === 'element' || toolNow === 'node' || toolNow === 'load') {
      const ms = snapWithMidpoint(world.x, world.y);
      uiStore.setMouse(mx, my, ms.x, ms.y);
    } else {
      uiStore.setMouse(mx, my, snapped.x, snapped.y);
    }

    if (isPanning) {
      uiStore.panX += mx - panStartX;
      uiStore.panY += my - panStartY;
      panStartX = mx;
      panStartY = my;
      return;
    }

    // Node dragging (multi-node support)
    if (draggedNodeId !== null && dragStartWorld) {
      const dx = snapped.x - dragStartWorld.x;
      const dy = snapped.y - dragStartWorld.y;

      if (uiStore.selectedNodes.size > 1 && uiStore.selectedNodes.has(draggedNodeId)) {
        // Move all selected nodes by delta
        for (const nodeId of uiStore.selectedNodes) {
          const node = modelStore.getNode(nodeId);
          if (node) {
            modelStore.updateNode(nodeId, node.x + dx, node.y + dy);
          }
        }
      } else {
        modelStore.updateNode(draggedNodeId, snapped.x, snapped.y);
      }

      dragStartWorld = { x: snapped.x, y: snapped.y };
      dragMoved = true;
      resultsStore.clear();
    }

    // Box selection tracking
    if (boxSelect) {
      boxSelect.endX = mx;
      boxSelect.endY = my;
    }

    // Diagram hover: compute value at mouse projection on nearest element
    if (resultsStore.results && !isPanning && draggedNodeId === null) {
      const dt = resultsStore.diagramType;
      if (dt === 'moment' || dt === 'shear' || dt === 'axial' || dt === 'deformed' || dt === 'colorMap') {
        const nearElem = findNearestElement(world.x, world.y, 0.5);
        if (nearElem) {
          const ni = modelStore.getNode(nearElem.nodeI);
          const nj = modelStore.getNode(nearElem.nodeJ);
          if (ni && nj) {
            const edx = nj.x - ni.x;
            const edy = nj.y - ni.y;
            const lenSq = edx * edx + edy * edy;
            let t = ((world.x - ni.x) * edx + (world.y - ni.y) * edy) / lenSq;
            t = Math.max(0, Math.min(1, t));
            const wx = ni.x + t * edx;
            const wy = ni.y + t * edy;

            if (dt === 'moment' || dt === 'shear' || dt === 'axial') {
              const ef = resultsStore.getElementForces(nearElem.id);
              if (ef) {
                const value = computeDiagramValueAt(dt as 'moment' | 'shear' | 'axial', t, ef);
                diagramHover = { elementId: nearElem.id, t, value, worldX: wx, worldY: wy };
              } else {
                diagramHover = null;
              }
            } else if (dt === 'deformed') {
              // Compute displacement using Hermite cubic interpolation (same as drawDeformed)
              // Linear interpolation gives wrong values when both end nodes have zero displacement
              // (e.g. simply supported beam: uy=0 at both ends, but deflects at midspan)
              const di = resultsStore.getDisplacement(nearElem.nodeI);
              const dj = resultsStore.getDisplacement(nearElem.nodeJ);
              const ef = resultsStore.getElementForces(nearElem.id);
              if (di && dj && ef && ni && nj) {
                // Get EI for particular solution
                const elem = modelStore.elements.get(nearElem.id);
                let EI: number | undefined;
                if (elem) {
                  const mat = modelStore.materials.get(elem.materialId);
                  const sec = modelStore.sections.get(elem.sectionId);
                  if (mat && sec) EI = mat.e * 1000 * effectiveBendingInertia(sec); // kN·m²
                }
                const disp = computeDisplacementAt(
                  t,
                  ni.x, ni.y, nj.x, nj.y,
                  di.ux, di.uy, di.rz,
                  dj.ux, dj.uy, dj.rz,
                  ef.length,
                  ef.hingeStart, ef.hingeEnd,
                  EI, ef.qI, ef.qJ, ef.pointLoads, ef.distributedLoads,
                );
                const ux = disp.ux * 1000; // mm
                const uy = disp.uy * 1000; // mm
                // Rotation: interpolate linearly between end rotations (good enough for display)
                const rz = di.rz + t * (dj.rz - di.rz);
                const totalDisp = Math.sqrt(ux * ux + uy * uy);
                diagramHover = {
                  elementId: nearElem.id, t, value: totalDisp, worldX: wx, worldY: wy,
                  lines: [
                    `ux: ${ux.toFixed(3)} mm`,
                    `uy: ${uy.toFixed(3)} mm`,
                    `θ: ${rz.toFixed(4)} rad`,
                  ],
                };
              } else {
                diagramHover = null;
              }
            } else if (dt === 'colorMap') {
              // Show the colorMap kind's value
              const ef = resultsStore.getElementForces(nearElem.id);
              if (ef) {
                const cmKind = resultsStore.colorMapKind;
                let value: number;
                let label: string;
                let unit: string;
                if (cmKind === 'moment') {
                  value = computeDiagramValueAt('moment', t, ef);
                  label = 'M'; unit = 'kN·m';
                } else if (cmKind === 'shear') {
                  value = computeDiagramValueAt('shear', t, ef);
                  label = 'V'; unit = 'kN';
                } else if (cmKind === 'axial') {
                  value = computeDiagramValueAt('axial', t, ef);
                  label = 'N'; unit = 'kN';
                } else {
                  // stressRatio — approximate with max of endpoint ratios interpolated
                  const nAvg = (ef.nStart + ef.nEnd) / 2;
                  const mMax = Math.max(Math.abs(ef.mStart), Math.abs(ef.mEnd));
                  const vMax = Math.max(Math.abs(ef.vStart), Math.abs(ef.vEnd));
                  value = Math.abs(nAvg) + mMax + vMax; // rough combined
                  label = 'ratio'; unit = '';
                }
                diagramHover = { elementId: nearElem.id, t, value, worldX: wx, worldY: wy, label, unit };
              } else {
                diagramHover = null;
              }
            }
          } else {
            diagramHover = null;
          }
        } else {
          diagramHover = null;
        }
      } else {
        diagramHover = null;
      }
    } else {
      diagramHover = null;
    }
  }

  function handleMouseUp() {
    isPanning = false;

    if (draggedNodeId !== null) {
      if (!dragMoved) {
        historyStore.undo();
      }
      draggedNodeId = null;
      dragMoved = false;
      dragStartWorld = null;
    }

    // Finalize box selection (AutoCAD-style: Window vs Crossing)
    if (boxSelect) {
      const x1 = Math.min(boxSelect.startX, boxSelect.endX);
      const y1 = Math.min(boxSelect.startY, boxSelect.endY);
      const x2 = Math.max(boxSelect.startX, boxSelect.endX);
      const y2 = Math.max(boxSelect.startY, boxSelect.endY);
      const isWindow = boxSelect.endX >= boxSelect.startX;

      // Only count as box select if dragged at least a few pixels
      if (x2 - x1 > 3 || y2 - y1 > 3) {
        const newNodes = new Set(uiStore.selectedNodes);
        const newElems = new Set(uiStore.selectedElements);

        // Nodes: always selected by containment (both modes)
        for (const node of modelStore.nodes.values()) {
          const s = uiStore.worldToScreen(node.x, node.y);
          if (s.x >= x1 && s.x <= x2 && s.y >= y1 && s.y <= y2) {
            newNodes.add(node.id);
          }
        }
        for (const elem of modelStore.elements.values()) {
          const ni = modelStore.getNode(elem.nodeI);
          const nj = modelStore.getNode(elem.nodeJ);
          if (!ni || !nj) continue;
          const si = uiStore.worldToScreen(ni.x, ni.y);
          const sj = uiStore.worldToScreen(nj.x, nj.y);
          const iInside = si.x >= x1 && si.x <= x2 && si.y >= y1 && si.y <= y2;
          const jInside = sj.x >= x1 && sj.x <= x2 && sj.y >= y1 && sj.y <= y2;

          if (isWindow) {
            // Window (left→right): element selected only if BOTH endpoints inside
            if (iInside && jInside) {
              newElems.add(elem.id);
            }
          } else {
            // Crossing (right→left): contained OR intersecting the rectangle
            if ((iInside || jInside) ||
                segmentIntersectsRect(si.x, si.y, sj.x, sj.y, x1, y1, x2, y2)) {
              newElems.add(elem.id);
            }
          }
        }

        // Reassign sets to trigger Svelte reactivity
        uiStore.setSelection(newNodes, newElems);
      }
      boxSelect = null;
    }
  }

  function handleDblClick(e: MouseEvent) {
    if (uiStore.currentTool !== 'select') return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const world = uiStore.screenToWorld(mx, my);
    const snapped = uiStore.snapWorld(world.x, world.y);

    const nearNode = findNearestNode(snapped.x, snapped.y, 0.3);
    if (nearNode) {
      uiStore.editingNodeId = nearNode.id;
      uiStore.editScreenPos = { x: e.clientX, y: e.clientY };
      return;
    }

    const nearElem = findNearestElement(world.x, world.y, 0.3);
    if (nearElem) {
      uiStore.editingElementId = nearElem.id;
      uiStore.editScreenPos = { x: e.clientX, y: e.clientY };
    }
  }

  function getCursor(): string {
    switch (uiStore.currentTool) {
      case 'pan': return isPanning ? 'grabbing' : 'grab';
      case 'select':
        if (draggedNodeId !== null) return 'grabbing';
        if (uiStore.selectMode === 'stress') return 'crosshair';
        return 'default';
      case 'node': return uiStore.nodeMode === 'hinge' ? 'pointer' : 'cell';
      case 'element': return 'crosshair';
      case 'support': return 'crosshair';
      case 'load': return 'crosshair';
      case 'influenceLine': return 'crosshair';
      default: return 'default';
    }
  }

  function handleContextMenu(e: MouseEvent) {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const world = uiStore.screenToWorld(mx, my);
    const snapped = uiStore.snapWorld(world.x, world.y);

    const nearNode = findNearestNode(world.x, world.y, 0.3);
    const nearElem = nearNode ? null : findNearestElement(world.x, world.y, 0.3);

    uiStore.contextMenu = {
      x: e.clientX,
      y: e.clientY,
      nodeId: nearNode?.id,
      elementId: nearElem?.id,
    };
  }

  // ===== Touch event handlers (mobile) =====
  let touchState: {
    startTouches: Array<{ x: number; y: number }>;
    lastDist: number;
    lastCenter: { x: number; y: number };
    isPinch: boolean;
    longPressTimer: ReturnType<typeof setTimeout> | null;
    moved: boolean;
  } | null = null;

  function handleTouchStart(e: TouchEvent) {
    e.preventDefault();
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const touches = Array.from(e.touches).map(t => ({
      x: t.clientX - rect.left,
      y: t.clientY - rect.top,
    }));

    if (touches.length === 1) {
      // Single touch — treat as mousedown + setup long-press
      touchState = {
        startTouches: touches,
        lastDist: 0,
        lastCenter: touches[0],
        isPinch: false,
        longPressTimer: null,
        moved: false,
      };
      touchState.longPressTimer = setTimeout(() => {
        // Long press → context menu
        if (touchState && !touchState.moved) {
          const world = uiStore.screenToWorld(touches[0].x, touches[0].y);
          const nearNode = findNearestNode(world.x, world.y, 0.5);
          const nearElem = nearNode ? null : findNearestElement(world.x, world.y, 0.5);
          uiStore.contextMenu = {
            x: touches[0].x + rect.left,
            y: touches[0].y + rect.top,
            nodeId: nearNode?.id,
            elementId: nearElem?.id,
          };
        }
      }, 500);

      // Dispatch as mousedown
      const synth = {
        clientX: touches[0].x + rect.left,
        clientY: touches[0].y + rect.top,
        button: 0,
        shiftKey: false,
        preventDefault: () => {},
      } as MouseEvent;
      handleMouseDown(synth);
    } else if (touches.length === 2) {
      // Two fingers — pinch/pan
      cancelLongPress();
      const dist = Math.hypot(touches[1].x - touches[0].x, touches[1].y - touches[0].y);
      const center = {
        x: (touches[0].x + touches[1].x) / 2,
        y: (touches[0].y + touches[1].y) / 2,
      };
      touchState = {
        startTouches: touches,
        lastDist: dist,
        lastCenter: center,
        isPinch: true,
        longPressTimer: null,
        moved: false,
      };
      // Cancel any ongoing single-touch interaction
      isPanning = false;
      draggedNodeId = null;
      boxSelect = null;
    }
  }

  function handleTouchMove(e: TouchEvent) {
    e.preventDefault();
    if (!touchState || !canvas) return;
    const rect = canvas.getBoundingClientRect();
    const touches = Array.from(e.touches).map(t => ({
      x: t.clientX - rect.left,
      y: t.clientY - rect.top,
    }));

    touchState.moved = true;
    cancelLongPress();

    if (touches.length === 1 && !touchState.isPinch) {
      // Single finger drag → mousemove
      const synth = {
        clientX: touches[0].x + rect.left,
        clientY: touches[0].y + rect.top,
        button: 0,
        shiftKey: false,
        buttons: 1,
        preventDefault: () => {},
      } as MouseEvent;
      handleMouseMove(synth);
    } else if (touches.length === 2 && touchState.isPinch) {
      // Pinch-to-zoom + two-finger pan
      const dist = Math.hypot(touches[1].x - touches[0].x, touches[1].y - touches[0].y);
      const center = {
        x: (touches[0].x + touches[1].x) / 2,
        y: (touches[0].y + touches[1].y) / 2,
      };

      // Zoom
      if (touchState.lastDist > 0) {
        const scale = dist / touchState.lastDist;
        const worldBefore = uiStore.screenToWorld(center.x, center.y);
        uiStore.zoom *= scale;
        const worldAfter = uiStore.screenToWorld(center.x, center.y);
        uiStore.panX += (worldAfter.x - worldBefore.x) * uiStore.zoom;
        uiStore.panY -= (worldAfter.y - worldBefore.y) * uiStore.zoom;
      }

      // Pan
      uiStore.panX += center.x - touchState.lastCenter.x;
      uiStore.panY += center.y - touchState.lastCenter.y;

      touchState.lastDist = dist;
      touchState.lastCenter = center;
    }
  }

  function handleTouchEnd(e: TouchEvent) {
    e.preventDefault();
    cancelLongPress();
    if (touchState && !touchState.isPinch && e.touches.length === 0) {
      handleMouseUp();
    }
    if (e.touches.length === 0) {
      touchState = null;
    }
  }

  function cancelLongPress() {
    if (touchState?.longPressTimer) {
      clearTimeout(touchState.longPressTimer);
      touchState.longPressTimer = null;
    }
  }

  function handleWheel(e: WheelEvent) {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    const worldBefore = uiStore.screenToWorld(mx, my);
    uiStore.zoom *= e.deltaY < 0 ? 1.1 : 0.9;
    const worldAfter = uiStore.screenToWorld(mx, my);

    uiStore.panX += (worldAfter.x - worldBefore.x) * uiStore.zoom;
    uiStore.panY -= (worldAfter.y - worldBefore.y) * uiStore.zoom;
  }

  function drawTooltip(sx: number, sy: number, lines: string[]) {
    if (!ctx) return;
    _drawTooltip(ctx, sx, sy, lines, width, height);
  }

  // ── Thin wrappers that delegate to spatial-queries.ts, passing store data ──

  function findNearestNode(x: number, y: number, maxDist: number) {
    return _findNearestNode(x, y, maxDist, modelStore.nodes);
  }

  function findNearestElement(x: number, y: number, maxDist: number) {
    return _findNearestElement(x, y, maxDist, modelStore.elements, modelStore.nodes);
  }

  function findNearestSupport(x: number, y: number, maxDist: number) {
    return _findNearestSupport(x, y, maxDist, modelStore.supports, modelStore.nodes);
  }

  function findNearestMidpoint(x: number, y: number, maxDist: number) {
    return _findNearestMidpoint(x, y, maxDist, modelStore.elements, modelStore.nodes);
  }

  function snapWithMidpoint(worldX: number, worldY: number): { x: number; y: number } {
    return _snapWithMidpoint(worldX, worldY, (x, y) => uiStore.snapWorld(x, y), modelStore.nodes, modelStore.elements);
  }

  function findAllLoadsNear(wx: number, wy: number, maxDist: number): number[] {
    return _findAllLoadsNear(wx, wy, maxDist, modelStore.model.loads, modelStore.elements, modelStore.nodes);
  }

  function findNearestLoad(wx: number, wy: number, maxDist: number, excludeIds?: Set<number>) {
    return _findNearestLoad(wx, wy, maxDist, modelStore.model.loads, modelStore.elements, modelStore.nodes, excludeIds);
  }
</script>

<div class="viewport2d-wrapper">
  <canvas
    bind:this={canvas}
    onmousedown={handleMouseDown}
    onmousemove={handleMouseMove}
    onmouseup={handleMouseUp}
    onmouseleave={handleMouseUp}
    ondblclick={handleDblClick}
    onwheel={handleWheel}
    oncontextmenu={handleContextMenu}
    ontouchstart={handleTouchStart}
    ontouchmove={handleTouchMove}
    ontouchend={handleTouchEnd}
    ondragover={(e) => { e.preventDefault(); if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'; }}
    ondrop={(e) => {
      e.preventDefault();
      const file = e.dataTransfer?.files[0];
      if (file && file.name.toLowerCase().endsWith('.dxf')) {
        window.dispatchEvent(new CustomEvent('stabileo-dxf-drop', { detail: file }));
      }
    }}
    style="cursor: {getCursor()}"
  ></canvas>

  <div class="viewport-controls" style="top: {uiStore.floatingToolsTopOffset}px">
    <button onclick={() => {
      if (modelStore.nodes.size === 0) return;
      uiStore.zoomToFit(modelStore.nodes.values(), canvas.width, canvas.height);
    }} title={t('viewport.zoomToFit')}>⊞</button>
  </div>
</div>

<style>
  .viewport2d-wrapper {
    width: 100%;
    height: 100%;
    position: relative;
    overflow: hidden;
  }

  canvas {
    width: 100%;
    height: 100%;
    display: block;
    touch-action: none;
  }

  .viewport-controls {
    position: absolute;
    right: 12px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    z-index: 10;
    transition: top 0.15s ease;
  }

  .viewport-controls button {
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

  .viewport-controls button:hover {
    background: rgba(40, 60, 100, 0.95);
    color: #ddeeff;
  }
</style>
