<script lang="ts">
  import { modelStore, resultsStore, uiStore, tourStore } from '../lib/store';
  import { t } from '../lib/i18n';
  import {
    analyzeSectionStress,
    suggestCriticalSections,
    computeShearFlowPaths,
    isMassiveSection,
    computeCentralCore,
    type SectionStressResult,
    type ShearFlowSegment,
    type CentralCore,
  } from '../lib/engine/section-stress';
  import {
    analyzeSectionStress3D,
    analyzeSectionStressFromForces,
    suggestCriticalSections3D,
    computePerpNADistribution,
    computeNeutralAxisMomentsOnly,
    type SectionStressResult3D,
    type PerpNAPoint,
  } from '../lib/engine/section-stress-3d';
  import { computeDiagramValueAt } from '../lib/engine/diagrams';
  import { fmtForce, isPointInConvexPolygon } from './stress/fmt';
  import CrossSectionDrawing from './stress/CrossSectionDrawing.svelte';
  import StressStateDetails from './stress/StressStateDetails.svelte';
  import MohrCircleDisplay from './stress/MohrCircleDisplay.svelte';
  import CentralCoreDetails from './stress/CentralCoreDetails.svelte';

  // Fiber position sliders: 0 = bottom/left, 1 = top/right
  let fiberRatioY = $state(1.0); // default to top fiber (extreme)
  let fiberRatioZ = $state(0.5); // default to center (z=0)

  // Collapsible sections (only cross-section open by default — issue #13)
  let showCrossSection = $state(true);
  let showTensional = $state(false);
  let showMohr = $state(false);
  let showCritical = $state(false);

  // SVG overlay toggles
  let showSigma = $state(true);               // Master σ toggle (ON by default — controls all sigma visuals)
  let showShearOnDrawing = $state(false);     // τ diagram on section SVG (OFF by default)
  let showTotalSigma = $state(false); // false = solo momento (default), true = σ total (N/A + M·y/I)
  let showPerpNA = $state(false);              // σ perpendicular to neutral axis (3D biaxial, OFF)
  let showCentralCore = $state(false);          // NC: núcleo central overlay
  let showPressureCenter = $state(false);      // CP: centro de presiones overlay
  let showCentralCoreInfo = $state(false);     // NC details section (closed by default)
  let useGlobalScale = $state(true);           // Local/global stress scaling toggle (global by default)

  const is3D = $derived(uiStore.analysisMode === '3d');
  const query = $derived(resultsStore.stressQuery);
  const querySec = $derived.by(() => {
    if (!query) return null;
    const elem = modelStore.elements.get(query.elementId);
    if (!elem) return null;
    return modelStore.sections.get(elem.sectionId) ?? null;
  });
  /** 2D section with rotation → show biaxial decomposition (quasi-3D visualization) */
  const isRotated2D = $derived(!is3D && (querySec?.rotation ?? 0) !== 0);

  // ── Check for amorphous section (no shape → no stress analysis) ──
  const isAmorphous = $derived.by((): boolean => {
    if (!query) return false;
    const elem = modelStore.elements.get(query.elementId);
    if (!elem) return false;
    const sec = modelStore.sections.get(elem.sectionId);
    return !!sec && !sec.shape;
  });

  // ── 2D analysis (skip if section is rotated → uses biaxial path instead) ──
  const analysis2D = $derived.by((): SectionStressResult | null => {
    if (is3D || isRotated2D || !query || !resultsStore.results || isAmorphous) return null;
    const elem = modelStore.elements.get(query.elementId);
    if (!elem) return null;
    const sec = modelStore.sections.get(elem.sectionId);
    const mat = modelStore.materials.get(elem.materialId);
    if (!sec || !mat) return null;
    const ef = resultsStore.getElementForces(query.elementId);
    if (!ef) return null;

    const resolved = analyzeSectionStress(ef, sec, mat.fy, query.t);
    const rs = resolved.resolved;
    const yFiber = rs.yMin + fiberRatioY * (rs.yMax - rs.yMin);
    return analyzeSectionStress(ef, sec, mat.fy, query.t, yFiber);
  });

  // ── 3D analysis (also handles rotated 2D sections via force decomposition) ──
  const analysis3D = $derived.by((): SectionStressResult3D | null => {
    if (isAmorphous || !query) return null;

    // ── True 3D mode ──
    if (is3D) {
      if (!resultsStore.results3D) return null;
      const elem = modelStore.elements.get(query.elementId);
      if (!elem) return null;
      const sec = modelStore.sections.get(elem.sectionId);
      const mat = modelStore.materials.get(elem.materialId);
      if (!sec || !mat) return null;
      const ef = resultsStore.getElementForces3D(query.elementId);
      if (!ef) return null;

      const halfH = ef.length > 0 ? (sec.h ?? Math.sqrt(12 * (sec.iy ?? sec.iz) / sec.a)) / 2 : 0.1;
      const halfB = (sec.b ?? sec.h ?? Math.sqrt(12 * sec.iz / sec.a)) / 2;
      const yFiber = -halfH + fiberRatioY * halfH * 2;
      const zFiber = -halfB + fiberRatioZ * halfB * 2;
      return analyzeSectionStress3D(ef, sec, mat.fy, query.t, yFiber, zFiber);
    }

    // ── Rotated 2D: decompose M, V into biaxial components ──
    if (!isRotated2D || !resultsStore.results) return null;
    const elem = modelStore.elements.get(query.elementId);
    if (!elem) return null;
    const sec = modelStore.sections.get(elem.sectionId);
    const mat = modelStore.materials.get(elem.materialId);
    if (!sec || !mat) return null;
    const ef = resultsStore.getElementForces(query.elementId);
    if (!ef) return null;

    // Get raw 2D forces at position t
    const M_2d = computeDiagramValueAt('moment', query.t, ef);
    const V_2d = computeDiagramValueAt('shear', query.t, ef);
    const N_2d = computeDiagramValueAt('axial', query.t, ef);

    // Decompose into section's rotated local axes
    // My causes σ(y) = -My·y/Iy, so My = -M·cos(α) gives σ = M·cos(α)·y/Iy
    // Mz causes σ(z) = Mz·z/Iz, so Mz = M·sin(α) gives σ = M·sin(α)·z/Iz
    const alpha = (sec.rotation ?? 0) * Math.PI / 180;
    const cosA = Math.cos(alpha);
    const sinA = Math.sin(alpha);
    const My = -M_2d * cosA;
    const Mz =  M_2d * sinA;
    const Vy =  V_2d * cosA;
    const Vz =  V_2d * sinA;

    const halfH = (sec.h ?? Math.sqrt(12 * (sec.iy ?? sec.iz) / sec.a)) / 2;
    const halfB = (sec.b ?? sec.h ?? Math.sqrt(12 * sec.iz / sec.a)) / 2;
    const yFiber = -halfH + fiberRatioY * halfH * 2;
    const zFiber = -halfB + fiberRatioZ * halfB * 2;

    return analyzeSectionStressFromForces(N_2d, Vy, Vz, 0, My, Mz, sec, mat.fy, yFiber, zFiber);
  });

  // Unified accessors (panel uses these)
  // When isRotated2D, analysis3D is populated (from decomposed forces), analysis2D is null
  const uses3DPath = $derived(is3D || isRotated2D);
  const hasAnalysis = $derived(uses3DPath ? analysis3D !== null : analysis2D !== null);
  const resolved = $derived(uses3DPath ? analysis3D?.resolved : analysis2D?.resolved);

  // Shear flow (2D only)
  const shearFlow = $derived<ShearFlowSegment[]>(
    analysis2D ? computeShearFlowPaths(analysis2D.V, analysis2D.resolved) : []
  );

  const isMassive = $derived(resolved ? isMassiveSection(resolved.shape) : false);

  // Bending detection — enables EN button
  const hasBending3D = $derived(
    uses3DPath && analysis3D !== null &&
    (Math.abs(analysis3D.My) > 0.01 || Math.abs(analysis3D.Mz) > 0.01)
  );
  const hasBending2D = $derived(
    !uses3DPath && analysis2D !== null && Math.abs(analysis2D.M) > 0.01
  );

  // Neutral axis for ⊥ distribution: moments-only or full (with N) depending on showTotalSigma
  // When showTotalSigma is off: NA passes through centroid (N=0), classic moment-only view
  // When showTotalSigma is on: NA shifts by (N·Iz)/(A·My), shows combined effect
  const perpNA = $derived.by(() => {
    if (!showPerpNA || !uses3DPath || !analysis3D) return null;
    if (Math.abs(analysis3D.My) < 0.01 && Math.abs(analysis3D.Mz) < 0.01) return null;
    if (showTotalSigma) {
      // Full NA including N (doesn't pass through centroid if N≠0)
      return analysis3D.neutralAxis;
    }
    // Moments-only NA (passes through centroid)
    return computeNeutralAxisMomentsOnly(
      analysis3D.Mz, analysis3D.My,
      analysis3D.resolved.iy, analysis3D.Iz,
    );
  });

  // Perpendicular-to-NA stress distribution
  // When showTotalSigma: σ = N/A - My·y/Iz + Mz·z/Iy (full, with axial)
  // Otherwise: σ = -My·y/Iz + Mz·z/Iy (moments only, N=0)
  const perpNADist = $derived.by((): PerpNAPoint[] => {
    if (!perpNA || !perpNA.exists || !analysis3D) return [];
    return computePerpNADistribution(
      showTotalSigma ? analysis3D.N : 0,
      analysis3D.Mz, analysis3D.My,
      analysis3D.resolved.a, analysis3D.resolved.iy, analysis3D.Iz,
      perpNA, analysis3D.resolved,
    );
  });

  // Central core (núcleo central) — always computed for CP-inside-core check
  const centralCore = $derived.by((): CentralCore | null => {
    if (!resolved) return null;
    return computeCentralCore(resolved);
  });

  // Pressure center (centro de presiones):
  // From σ = N/A - My·y/Iz + Mz·z/Iy, matching eccentric N formula σ = N/A + N·ey·y/Iz + N·ez·z/Iy:
  //   N·ey = -My → ey = -My/N   (y_CP = -My/N)
  //   N·ez = Mz  → ez = Mz/N    (z_CP = Mz/N)
  // Only exists when N ≠ 0 (if N=0, CP is at infinity)
  const pressureCenter = $derived.by((): { y: number; z: number; insideCore: boolean } | null => {
    if (!showPressureCenter) return null;
    if (uses3DPath && analysis3D) {
      if (Math.abs(analysis3D.N) < 0.01) return null; // N ≈ 0 → CP at infinity
      const yCP = -analysis3D.My / analysis3D.N;   // meters — ey = -My/N
      const zCP = analysis3D.Mz / analysis3D.N;    // meters — ez = Mz/N
      const insideCore = centralCore
        ? isPointInConvexPolygon(zCP, yCP, centralCore.vertices)
        : false;
      return { y: yCP, z: zCP, insideCore };
    }
    if (!is3D && analysis2D) {
      if (Math.abs(analysis2D.N) < 0.01) return null;
      const yCP = analysis2D.M / analysis2D.N; // meters — ey = M/N
      const insideCore = centralCore
        ? isPointInConvexPolygon(0, yCP, centralCore.vertices)
        : false;
      return { y: yCP, z: 0, insideCore };
    }
    return null;
  });

  // Mohr circle data (unified for both 2D and 3D / rotated 2D)
  const mohrData = $derived(uses3DPath ? analysis3D?.mohr ?? null : analysis2D?.mohr ?? null);
  const mohrSigma = $derived(uses3DPath ? (analysis3D?.sigmaAtFiber ?? 0) : (analysis2D?.sigmaAtY ?? 0));
  const mohrTau = $derived(uses3DPath ? (analysis3D?.tauTotal ?? 0) : (analysis2D?.tauAtY ?? 0));

  const criticalSections = $derived.by(() => {
    if (!query) return [];
    if (is3D && resultsStore.results3D) {
      const ef = resultsStore.getElementForces3D(query.elementId);
      if (!ef) return [];
      return suggestCriticalSections3D(ef).map(s => ({ t: s.t, reason: s.reason }));
    }
    if (!is3D && resultsStore.results) {
      const ef = resultsStore.getElementForces(query.elementId);
      if (!ef) return [];
      return suggestCriticalSections(ef);
    }
    return [];
  });

  // Global stress scales: max σ and τ across all critical sections of the element (MPa)
  // Used when useGlobalScale is true so stress diagrams scale relative to element-wide max
  const globalScales = $derived.by((): { maxSigmaY: number; maxSigmaZ: number; maxTauY: number } | null => {
    if (!useGlobalScale || !query) return null;
    const elem = modelStore.elements.get(query.elementId);
    if (!elem) return null;
    const sec = modelStore.sections.get(elem.sectionId);
    const mat = modelStore.materials.get(elem.materialId);
    if (!sec || !mat) return null;

    let maxSY = 1e-6, maxSZ = 1e-6, maxTY = 1e-6;

    if (is3D) {
      const ef = resultsStore.getElementForces3D(query.elementId);
      if (!ef) return null;
      const crits = suggestCriticalSections3D(ef);
      for (const cs of crits) {
        const a = analyzeSectionStress3D(ef, sec, mat.fy, cs.t);
        for (const pt of a.distributionY) {
          if (Math.abs(pt.sigma) > maxSY) maxSY = Math.abs(pt.sigma);
          if (Math.abs(pt.tauVy) > maxTY) maxTY = Math.abs(pt.tauVy);
        }
        for (const pt of a.distributionZ) {
          if (Math.abs(pt.sigma) > maxSZ) maxSZ = Math.abs(pt.sigma);
        }
      }
    } else if (isRotated2D) {
      // Rotated 2D: compute biaxial scales at critical sections
      const ef = resultsStore.getElementForces(query.elementId);
      if (!ef) return null;
      const crits = suggestCriticalSections(ef);
      const alpha = (sec.rotation ?? 0) * Math.PI / 180;
      const cosA = Math.cos(alpha), sinA = Math.sin(alpha);
      for (const cs of crits) {
        const M = computeDiagramValueAt('moment', cs.t, ef);
        const V = computeDiagramValueAt('shear', cs.t, ef);
        const N = computeDiagramValueAt('axial', cs.t, ef);
        const a = analyzeSectionStressFromForces(N, V*cosA, V*sinA, 0, -M*cosA, M*sinA, sec, mat.fy);
        for (const pt of a.distributionY) {
          if (Math.abs(pt.sigma) > maxSY) maxSY = Math.abs(pt.sigma);
          if (Math.abs(pt.tauVy) > maxTY) maxTY = Math.abs(pt.tauVy);
        }
        for (const pt of a.distributionZ) {
          if (Math.abs(pt.sigma) > maxSZ) maxSZ = Math.abs(pt.sigma);
        }
      }
    } else {
      const ef = resultsStore.getElementForces(query.elementId);
      if (!ef) return null;
      const crits = suggestCriticalSections(ef);
      for (const cs of crits) {
        const a = analyzeSectionStress(ef, sec, mat.fy, cs.t);
        for (const pt of a.distribution) {
          if (Math.abs(pt.sigma) > maxSY) maxSY = Math.abs(pt.sigma);
          if (Math.abs(pt.tau) > maxTY) maxTY = Math.abs(pt.tau);
        }
        // Also check thin-walled shear flow max tau
        if (!isMassiveSection(a.resolved.shape)) {
          const sf = computeShearFlowPaths(a.V, a.resolved);
          for (const seg of sf) {
            for (const p of seg.points) {
              if (p.tau > maxTY) maxTY = p.tau;
            }
          }
        }
      }
    }

    return { maxSigmaY: maxSY, maxSigmaZ: maxSZ, maxTauY: maxTY };
  });

  function close() {
    resultsStore.stressQuery = null;
  }

  /** Update stressQuery to a new t position, recalculating world coordinates */
  function goToT(elementId: number, t: number) {
    const elem = modelStore.elements.get(elementId);
    if (!elem) return;
    const ni = modelStore.getNode(elem.nodeI);
    const nj = modelStore.getNode(elem.nodeJ);
    if (!ni || !nj) return;
    const niz = ni.z ?? 0;
    const njz = nj.z ?? 0;
    const wx = ni.x + t * (nj.x - ni.x);
    const wy = ni.y + t * (nj.y - ni.y);
    const wz = niz + t * (njz - niz);
    resultsStore.stressQuery = { elementId, t, worldX: wx, worldY: wy, worldZ: is3D ? wz : undefined };
  }

  function goToCritical(cs: { t: number; reason: string }) {
    if (!query) return;
    goToT(query.elementId, cs.t);
  }

  function onSliderInput(e: Event) {
    if (!query) return;
    const val = +(e.target as HTMLInputElement).value;
    goToT(query.elementId, val);
  }
</script>

{#if query && hasAnalysis}
  <div class="ssp-panel"
    style="{uiStore.isMobile && tourStore.isActive ? `bottom:auto; top:${uiStore.floatingToolsTopOffset}px; max-height:calc(100vh - ${uiStore.floatingToolsTopOffset}px - 45vh - 16px)` : ''}"
  >
    <div class="ssp-header">
      <span class="ssp-title">{t('stress.panelTitle')} {is3D ? '3D ' : ''}{isRotated2D ? `(rot ${querySec?.rotation}°) ` : ''}</span>
      <button class="ssp-close" onclick={close} title={t('stress.close')}>&#x2715;</button>
    </div>

    <div class="ssp-body">
      <!-- Element info + position slider (issue #12) -->
      <div class="ssp-info">
        <span class="ssp-elem">Elem #{query.elementId}</span>
        <span class="ssp-pos">x/L = {(query.t * 100).toFixed(1)}%</span>
      </div>
      <div class="ssp-slider-row">
        <span class="ssp-slider-label">I</span>
        <input
          type="range" class="ssp-slider-xl" min="0" max="1" step="0.005"
          value={query.t}
          oninput={onSliderInput}
          title={t('stress.moveAlongElem')}
        />
        <span class="ssp-slider-label">J</span>
      </div>

      <!-- Internal forces -->
      {#if is3D && analysis3D}
        <!-- 3D: 6 internal forces in 2 rows -->
        <div class="ssp-forces">
          <div class="ssp-force">
            <span class="ssp-force-label">N</span>
            <span class="ssp-force-value">{fmtForce(analysis3D.N)} kN</span>
          </div>
          <div class="ssp-force">
            <span class="ssp-force-label">V<sub>y</sub></span>
            <span class="ssp-force-value">{fmtForce(analysis3D.Vy)} kN</span>
          </div>
          <div class="ssp-force">
            <span class="ssp-force-label">V<sub>z</sub></span>
            <span class="ssp-force-value">{fmtForce(analysis3D.Vz)} kN</span>
          </div>
          <span class="ssp-help" title={t('stress.forces3dHelp')}>?</span>
        </div>
        <div class="ssp-forces ssp-forces-moments">
          <div class="ssp-force">
            <span class="ssp-force-label">M<sub>x</sub></span>
            <span class="ssp-force-value">{fmtForce(-analysis3D.Mx)} kN·m</span>
          </div>
          <div class="ssp-force">
            <span class="ssp-force-label">M<sub>y</sub></span>
            <span class="ssp-force-value">{fmtForce(-analysis3D.My)} kN·m</span>
          </div>
          <div class="ssp-force">
            <span class="ssp-force-label">M<sub>z</sub></span>
            <span class="ssp-force-value">{fmtForce(-analysis3D.Mz)} kN·m</span>
          </div>
          <span class="ssp-help" title={t('stress.moments3dHelp')}>?</span>
        </div>
      {:else if isRotated2D && analysis3D}
        <!-- Rotated 2D: show decomposed biaxial forces -->
        <div class="ssp-forces">
          <div class="ssp-force">
            <span class="ssp-force-label">N</span>
            <span class="ssp-force-value">{fmtForce(analysis3D.N)} kN</span>
          </div>
          <div class="ssp-force">
            <span class="ssp-force-label">V<sub>y</sub></span>
            <span class="ssp-force-value">{fmtForce(analysis3D.Vy)} kN</span>
          </div>
          <div class="ssp-force">
            <span class="ssp-force-label">V<sub>z</sub></span>
            <span class="ssp-force-value">{fmtForce(analysis3D.Vz)} kN</span>
          </div>
          <span class="ssp-help" title={t('stress.rotDecompHelp').replace('{angle}', String(querySec?.rotation ?? 0))}>?</span>
        </div>
        <div class="ssp-forces ssp-forces-moments">
          <div class="ssp-force">
            <span class="ssp-force-label">M<sub>y</sub></span>
            <span class="ssp-force-value">{fmtForce(-analysis3D.My)} kN·m</span>
          </div>
          <div class="ssp-force">
            <span class="ssp-force-label">M<sub>z</sub></span>
            <span class="ssp-force-value">{fmtForce(-analysis3D.Mz)} kN·m</span>
          </div>
          <span class="ssp-help" title={t('stress.rotMomentHelp').replace('{angle}', String(querySec?.rotation ?? 0))}>?</span>
        </div>
      {:else if analysis2D}
        <div class="ssp-forces">
          <div class="ssp-force">
            <span class="ssp-force-label">N</span>
            <span class="ssp-force-value">{fmtForce(analysis2D.N)} kN</span>
          </div>
          <div class="ssp-force">
            <span class="ssp-force-label">V</span>
            <span class="ssp-force-value">{fmtForce(analysis2D.V)} kN</span>
          </div>
          <div class="ssp-force">
            <span class="ssp-force-label">M</span>
            <span class="ssp-force-value">{fmtForce(-analysis2D.M)} kN·m</span>
          </div>
          <span class="ssp-help" title={t('stress.forces2dHelp')}>?</span>
        </div>
      {/if}

      <!-- Cross section drawing -->
      <CrossSectionDrawing
        bind:showCrossSection
        bind:showSigma
        bind:showShearOnDrawing
        bind:showTotalSigma
        bind:showPerpNA
        bind:showCentralCore
        bind:showPressureCenter
        bind:useGlobalScale
        bind:fiberRatioY
        bind:fiberRatioZ
        is3D={uses3DPath}
        {hasBending3D}
        {hasBending2D}
        {analysis2D}
        {analysis3D}
        {resolved}
        {shearFlow}
        {isMassive}
        {centralCore}
        {perpNADist}
        {perpNA}
        {pressureCenter}
        {globalScales}
        sectionRotation={is3D ? 0 : (querySec?.rotation ?? 0)}
      />

      <!-- Stress state details -->
      <StressStateDetails
        bind:showTensional
        is3D={uses3DPath}
        {isMassive}
        {analysis2D}
        {analysis3D}
      />

      <!-- Mohr's circle -->
      <MohrCircleDisplay
        bind:showMohr
        {mohrData}
        {mohrSigma}
        {mohrTau}
      />

      <!-- Central core details -->
      <CentralCoreDetails
        bind:showCentralCoreInfo
        {centralCore}
        {resolved}
      />

      <!-- Critical sections -->
      <button class="ssp-section-toggle" onclick={() => showCritical = !showCritical}>
        <span class="ssp-chevron">{showCritical ? '▾' : '▸'}</span>
        {t('stress.criticalSections')}
        <span class="ssp-help ssp-help-inline" title={t('stress.criticalSectionsHelp')}>?</span>
      </button>
      {#if showCritical && criticalSections.length > 0}
        <div class="ssp-critical">
          {#each criticalSections as cs}
            <button
              class="ssp-critical-chip"
              class:active={Math.abs(cs.t - query.t) < 0.02}
              onclick={() => goToCritical(cs)}
            >
              {cs.reason}
              <span class="ssp-critical-t">({(cs.t * 100).toFixed(0)}%)</span>
            </button>
          {/each}
        </div>
      {/if}
    </div>
  </div>
{:else if query && isAmorphous}
  <div class="ssp-panel ssp-amorphous-warning"
    style="{uiStore.isMobile && tourStore.isActive ? `bottom:auto; top:${uiStore.floatingToolsTopOffset}px` : ''}"
  >
    <div class="ssp-header">
      <span class="ssp-title">{t('stress.panelTitle')}</span>
      <button class="ssp-close" onclick={() => resultsStore.clearStressQuery()}>&#x2715;</button>
    </div>
    <div class="ssp-amorph-msg">
      <span class="ssp-amorph-icon">⚠</span>
      <p>{@html t('stress.amorphMsg1')}</p>
      <p>{t('stress.amorphMsg2')}</p>
      <p>{t('stress.amorphMsg3')}</p>
    </div>
  </div>
{/if}

<style>
  .ssp-panel {
    position: absolute;
    bottom: 8px;
    left: 8px;
    z-index: 105;
    width: 280px;
    background: rgba(22, 33, 62, 0.96);
    border: 1px solid #1a4a7a;
    border-radius: 8px;
    backdrop-filter: blur(8px);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
    display: flex;
    flex-direction: column;
    max-height: calc(100% - 90px);
    font-size: 0.75rem;
  }

  .ssp-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 10px;
    border-bottom: 1px solid #1a4a7a;
  }

  .ssp-title {
    font-size: 0.78rem;
    font-weight: 600;
    color: #4ecdc4;
  }

  .ssp-close {
    width: 20px;
    height: 20px;
    background: transparent;
    border: none;
    border-radius: 3px;
    color: #666;
    cursor: pointer;
    font-size: 0.7rem;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .ssp-close:hover {
    background: #e94560;
    color: white;
  }

  .ssp-body {
    overflow-y: auto;
    padding: 6px 10px 10px;
  }

  .ssp-info {
    display: flex;
    justify-content: space-between;
    margin-bottom: 4px;
    color: #aaa;
    font-size: 0.7rem;
  }

  .ssp-elem {
    color: #ccc;
    font-weight: 600;
  }

  .ssp-pos {
    font-family: 'Courier New', monospace;
    color: #888;
  }

  .ssp-slider-row {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-bottom: 6px;
  }

  .ssp-slider-label {
    font-size: 0.6rem;
    color: #666;
    font-weight: 600;
    flex-shrink: 0;
    width: 10px;
    text-align: center;
  }

  .ssp-slider-xl {
    flex: 1;
    height: 4px;
    -webkit-appearance: none;
    appearance: none;
    background: #1a1a2e;
    border-radius: 2px;
    outline: none;
    cursor: pointer;
  }

  .ssp-slider-xl::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: #e94560;
    cursor: pointer;
    border: none;
  }

  .ssp-slider-xl::-moz-range-thumb {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: #e94560;
    cursor: pointer;
    border: none;
  }

  .ssp-forces {
    display: flex;
    gap: 6px;
    margin-bottom: 8px;
    padding: 4px 0;
    border-bottom: 1px solid rgba(26, 74, 122, 0.4);
    align-items: center;
    flex-wrap: wrap;
  }

  .ssp-forces-moments {
    margin-top: -4px;
  }

  .ssp-force {
    flex: 1;
    text-align: center;
    min-width: 55px;
  }

  .ssp-force-label {
    display: block;
    font-size: 0.65rem;
    color: #888;
    text-transform: uppercase;
  }

  .ssp-force-value {
    display: block;
    font-family: 'Courier New', monospace;
    font-size: 0.72rem;
    color: #eee;
  }

  .ssp-section-toggle {
    display: flex;
    align-items: center;
    gap: 4px;
    width: 100%;
    padding: 3px 0;
    background: none;
    border: none;
    color: #888;
    font-size: 0.68rem;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    cursor: pointer;
    border-bottom: 1px solid rgba(26, 74, 122, 0.3);
  }

  .ssp-section-toggle:hover {
    color: #ccc;
  }

  .ssp-chevron {
    font-size: 0.6rem;
    width: 10px;
  }

  .ssp-critical {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    padding: 4px 0;
  }

  .ssp-critical-chip {
    padding: 3px 8px;
    background: #0f3460;
    border: 1px solid #1a4a7a;
    border-radius: 10px;
    color: #aaa;
    font-size: 0.65rem;
    cursor: pointer;
    transition: all 0.15s;
  }

  .ssp-critical-chip:hover {
    background: #1a4a7a;
    color: #eee;
  }

  .ssp-critical-chip.active {
    background: #1a4a7a;
    border-color: #4ecdc4;
    color: #4ecdc4;
  }

  .ssp-critical-t {
    font-family: 'Courier New', monospace;
    opacity: 0.7;
  }

  /* ── Help tooltips ── */
  .ssp-help {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 13px;
    height: 13px;
    border-radius: 50%;
    background: rgba(78, 205, 196, 0.12);
    color: #4ecdc4;
    font-size: 0.5rem;
    font-weight: 700;
    cursor: help;
    flex-shrink: 0;
    border: 1px solid rgba(78, 205, 196, 0.25);
    opacity: 0.6;
    transition: opacity 0.15s;
    font-style: normal;
    line-height: 1;
    vertical-align: middle;
  }

  .ssp-help:hover {
    opacity: 1;
    background: rgba(78, 205, 196, 0.25);
  }

  .ssp-help-inline {
    margin-left: auto;
  }

  /* During tour on mobile: positioning is handled by inline style (uses floatingToolsTopOffset) */

  .ssp-amorphous-warning {
    max-height: none;
  }

  .ssp-amorph-msg {
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .ssp-amorph-msg p {
    font-size: 0.78rem;
    color: #aaa;
    margin: 0;
    line-height: 1.4;
  }

  .ssp-amorph-icon {
    font-size: 1.5rem;
    text-align: center;
  }
</style>
