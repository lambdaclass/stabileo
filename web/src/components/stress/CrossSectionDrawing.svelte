<script lang="ts">
  import {
    type SectionStressResult,
    type ShearFlowSegment,
    type CentralCore,
    type ResolvedSection,
  } from '../../lib/engine/section-stress';
  import {
    type SectionStressResult3D,
    type PerpNAPoint,
    type NeutralAxisInfo,
  } from '../../lib/engine/section-stress-3d';
  import { crossSectionPath } from '../../lib/utils/section-drawing';
  import type { SectionShape } from '../../lib/data/steel-profiles';
  import { t } from '../../lib/i18n';
  import { fmt, stressColor } from './fmt';

  interface Props {
    showCrossSection: boolean;
    showSigma: boolean;
    showShearOnDrawing: boolean;
    showTotalSigma: boolean;
    showPerpNA: boolean;
    showCentralCore: boolean;
    showPressureCenter: boolean;
    useGlobalScale: boolean;
    fiberRatioY: number;
    fiberRatioZ: number;
    is3D: boolean;
    hasBending3D: boolean;
    hasBending2D: boolean;
    analysis2D: SectionStressResult | null;
    analysis3D: SectionStressResult3D | null;
    resolved: ResolvedSection | undefined;
    shearFlow: ShearFlowSegment[];
    isMassive: boolean;
    centralCore: CentralCore | null;
    perpNADist: PerpNAPoint[];
    perpNA: NeutralAxisInfo | null;
    pressureCenter: { y: number; z: number; insideCore: boolean } | null;
    globalScales: { maxSigmaY: number; maxSigmaZ: number; maxTauY: number } | null;
    sectionRotation: number;
  }

  let {
    showCrossSection = $bindable(),
    showSigma = $bindable(),
    showShearOnDrawing = $bindable(),
    showTotalSigma = $bindable(),
    showPerpNA = $bindable(),
    showCentralCore = $bindable(),
    showPressureCenter = $bindable(),
    useGlobalScale = $bindable(),
    fiberRatioY = $bindable(),
    fiberRatioZ = $bindable(),
    is3D,
    hasBending3D,
    hasBending2D,
    analysis2D,
    analysis3D,
    resolved,
    shearFlow,
    isMassive,
    centralCore,
    perpNADist,
    perpNA,
    pressureCenter,
    globalScales,
    sectionRotation = 0,
  }: Props = $props();

  // SVG helper
  function sectionPathFromResolved(rs: { shape: SectionShape; h: number; b: number; tw: number; tf: number; t: number; tl?: number }): string {
    return crossSectionPath({
      shape: rs.shape,
      h: rs.h,
      b: rs.b,
      tw: rs.tw,
      tf: rs.tf,
      t: rs.t,
      tl: rs.tl,
    });
  }
</script>

<!-- Cross section -->
<button class="ssp-section-toggle" onclick={() => showCrossSection = !showCrossSection}>
  <span class="ssp-chevron">{showCrossSection ? '▾' : '▸'}</span>
  {t('stress.crossSection')}
</button>
{#if showCrossSection && resolved}
  <!-- Toggle toolbar — outside SVG to avoid overlap with diagram labels -->
  <div class="ssp-svg-toggles">
    <button
      class="ssp-svg-toggle ssp-toggle-sigma"
      class:active={showSigma}
      onclick={() => showSigma = !showSigma}
      title={showSigma ? t('stress.sigmaOn') : t('stress.sigmaOff')}
    >σ</button>
    <button
      class="ssp-svg-toggle"
      class:active={showShearOnDrawing}
      onclick={() => showShearOnDrawing = !showShearOnDrawing}
      title={showShearOnDrawing ? t('stress.tauOn') : t('stress.tauOff')}
    >τ</button>
    <button
      class="ssp-svg-toggle"
      class:active={showTotalSigma}
      class:disabled={!showSigma}
      onclick={() => { if (showSigma) showTotalSigma = !showTotalSigma; }}
      title={!showSigma ? t('stress.activateSigmaFirst') : showTotalSigma ? t('stress.totalSigmaOn') : t('stress.totalSigmaOff')}
    >σ<sub>{showTotalSigma ? 'T' : 'M'}</sub></button>
    {#if hasBending3D || hasBending2D}
      <button
        class="ssp-svg-toggle"
        class:active={showPerpNA}
        class:disabled={!showSigma}
        onclick={() => { if (showSigma) showPerpNA = !showPerpNA; }}
        title={!showSigma ? t('stress.activateSigmaFirst') : showPerpNA
          ? (is3D ? t('stress.perpNA3dOn') : t('stress.perpNA2dOn'))
          : (is3D
            ? t('stress.perpNA3dOff')
            : t('stress.perpNA2dOff'))}
      >EN</button>
    {/if}
    <button
      class="ssp-svg-toggle"
      class:active={showCentralCore}
      onclick={() => showCentralCore = !showCentralCore}
      title={showCentralCore ? t('stress.centralCoreOn') : t('stress.centralCoreOff')}
    >NC</button>
    <button
      class="ssp-svg-toggle ssp-toggle-cp"
      class:active={showPressureCenter}
      onclick={() => showPressureCenter = !showPressureCenter}
      title={showPressureCenter ? t('stress.pressureCenterOn') : t('stress.pressureCenterOff')}
    >CP</button>
    <button
      class="ssp-svg-toggle ssp-toggle-scale"
      class:active={useGlobalScale}
      onclick={() => useGlobalScale = !useGlobalScale}
      title={useGlobalScale ? t('stress.scaleGlobalOn') : t('stress.scaleGlobalOff')}
    >{useGlobalScale ? 'G' : 'L'}</button>
  </div>
  <div class="ssp-svg-container">
    <svg viewBox="-90 -90 180 180" class="ssp-cross-svg">
      <g transform="rotate({sectionRotation})">
      <!-- Section outline -->
      <path
        d={sectionPathFromResolved(resolved)}
        fill="none"
        stroke="#4ecdc4"
        stroke-width="1.5"
        fill-rule="evenodd"
      />

      <!-- Central core (núcleo central) overlay -->
      {#if showCentralCore && centralCore && centralCore.vertices.length >= 3}
        {@const scNC = 80 / Math.max(resolved.h, resolved.b)}
        <polygon
          points={centralCore.vertices.map(v => `${v.ez * scNC},${-v.ey * scNC}`).join(' ')}
          fill="rgba(255, 140, 0, 0.15)"
          stroke="#ff8c00"
          stroke-width="0.8"
          stroke-dasharray="3,2"
        />
        <!-- NC label -->
        <text x="0" y={-centralCore.eyMax * scNC - 3} text-anchor="middle"
          fill="#ff8c00" font-size="6" font-weight="600" opacity="0.85">NC</text>
      {/if}

      <!-- Pressure center (centro de presiones) -->
      {#if showPressureCenter && pressureCenter}
        {@const scCP = 80 / Math.max(resolved.h, resolved.b)}
        {@const cpX = pressureCenter.z * scCP}
        {@const cpY = -pressureCenter.y * scCP}
        <!-- Clamp to viewBox for visibility -->
        {@const clampX = Math.max(-82, Math.min(82, cpX))}
        {@const clampY = Math.max(-82, Math.min(82, cpY))}
        {@const isClamped = Math.abs(clampX - cpX) > 0.5 || Math.abs(clampY - cpY) > 0.5}
        <!-- Inside-NC glow -->
        {#if pressureCenter.insideCore}
          <circle cx={clampX} cy={clampY} r="8" fill="rgba(76, 175, 80, 0.15)" stroke="#4caf50" stroke-width="0.8" stroke-dasharray="2,1" opacity="0.9" />
        {/if}
        <!-- Crosshair marker -->
        <circle cx={clampX} cy={clampY} r="4" fill="none" stroke="#e040fb" stroke-width="1.5" opacity="0.95" />
        <line x1={clampX - 6} y1={clampY} x2={clampX + 6} y2={clampY} stroke="#e040fb" stroke-width="1.2" opacity="0.9" />
        <line x1={clampX} y1={clampY - 6} x2={clampX} y2={clampY + 6} stroke="#e040fb" stroke-width="1.2" opacity="0.9" />
        <!-- Label -->
        <text x={clampX + 8} y={clampY - 4} fill="#e040fb" font-size="5.5" font-weight="600" text-anchor="start">CP</text>
        {#if pressureCenter.insideCore}
          <text x={clampX + 8} y={clampY + 4} fill="#4caf50" font-size="3.5" text-anchor="start">en NC: &sigma; mismo signo</text>
        {/if}
        {#if isClamped}
          <text x={clampX + 8} y={clampY + (pressureCenter.insideCore ? 11 : 4)} fill="#e040fb" font-size="3" text-anchor="start" opacity="0.7">({t('stress.outOfView')})</text>
        {/if}
      {/if}

      {#if is3D && analysis3D}
        {@const rs = analysis3D.resolved}
        {@const sc = 80 / Math.max(rs.h, rs.b)}
        {@const sigmaN3d = rs.a > 1e-15 ? analysis3D.N / rs.a / 1000 : 0}
        <!-- When EN is active, hide individual σ(y)/σ(z)/τ diagrams and show only the composed perpNA distribution -->
        {#if showSigma && !showPerpNA}
        <!-- 3D: σ(y) distribution along Y axis (RIGHT side) — signed bars -->
        {@const xBaseR = rs.b / 2 * sc + 4}
        <!-- Compute moment-only stresses for σ(y) — My·y/Iy term from Navier biaxial -->
        {@const sigmasMzY = analysis3D.distributionY.map(pt => rs.iy > 1e-20 ? -analysis3D.My * pt.y / rs.iy / 1000 : 0)}
        {@const maxBendingY = Math.max(...sigmasMzY.map(s => Math.abs(s)), 1e-6)}
        <!-- Use max of (moment-only max, total max) so both modes share the same visual scale -->
        {@const maxTotalY = showTotalSigma ? Math.max(...analysis3D.distributionY.map(p => Math.abs(p.sigma)), 1e-6) : maxBendingY}
        {@const scaleY = useGlobalScale && globalScales ? Math.max(globalScales.maxSigmaY, globalScales.maxSigmaZ) : Math.max(maxBendingY, maxTotalY)}
        {#if showTotalSigma}
          <!-- Total mode: σ = N/A - My·y/Iy — signed bars -->
          <!-- Baseline (σ = 0) -->
          <line x1={xBaseR} y1={-rs.h / 2 * sc} x2={xBaseR} y2={rs.h / 2 * sc}
            stroke="#ccc" stroke-width="0.4" opacity="0.3" />
          <!-- N/A reference line (constant offset from axial) -->
          {#if Math.abs(sigmaN3d) > 0.01}
            {@const naDx = sigmaN3d / scaleY * 30}
            <line x1={xBaseR + naDx} y1={-rs.h / 2 * sc} x2={xBaseR + naDx} y2={rs.h / 2 * sc}
              stroke="#ff9800" stroke-width="0.8" stroke-dasharray="2,2" opacity="0.5" />
            <text x={xBaseR + naDx} y={-rs.h / 2 * sc - 3} fill="#ff9800" font-size="3.5" text-anchor="middle">N/A</text>
          {/if}
          {#each analysis3D.distributionY as pt}
            {@const yScreen = -pt.y * sc}
            {@const barW = pt.sigma / scaleY * 30}
            <rect
              x={barW >= 0 ? xBaseR : xBaseR + barW}
              y={yScreen - 1.5} width={Math.abs(barW)} height="3"
              fill={stressColor(pt.sigma, scaleY)} opacity="0.8"
            />
          {/each}
          <polyline
            points={analysis3D.distributionY.map(pt => `${xBaseR + pt.sigma / scaleY * 30},${-pt.y * sc}`).join(' ')}
            fill="none" stroke="#ccc" stroke-width="0.8" opacity="0.5" />
          <!-- Neutral axis (zero-crossing) — EN marker -->
          {@const distY = analysis3D.distributionY}
          {#each distY as pt, i}
            {#if i > 0 && distY[i - 1].sigma * pt.sigma < 0}
              {@const prev = distY[i - 1]}
              {@const yNA = prev.y + (pt.y - prev.y) * (-prev.sigma) / (pt.sigma - prev.sigma)}
              <line x1={xBaseR - 6} y1={-yNA * sc} x2={xBaseR + 6} y2={-yNA * sc}
                stroke="#4ecdc4" stroke-width="1" stroke-dasharray="3,2" opacity="0.8" />
              <text x={xBaseR + 8} y={-yNA * sc + 2} fill="#4ecdc4" font-size="3.5">EN</text>
            {/if}
          {/each}
          <!-- Label with max stress values -->
          <text x={xBaseR} y={-rs.h / 2 * sc - 7} fill="#ccc" font-size="4" text-anchor="start">σ = N/A − M·y/I</text>
        {:else}
          <!-- Default: solo -My·y/Iy (sin N/A) — signed bars -->
          <line x1={xBaseR} y1={-rs.h / 2 * sc} x2={xBaseR} y2={rs.h / 2 * sc}
            stroke="#ccc" stroke-width="0.4" opacity="0.3" />
          {#each analysis3D.distributionY as pt, i}
            {@const yScreen = -pt.y * sc}
            {@const sMz = sigmasMzY[i]}
            {@const barW = sMz / scaleY * 30}
            <rect
              x={barW >= 0 ? xBaseR : xBaseR + barW}
              y={yScreen - 1.5} width={Math.abs(barW)} height="3"
              fill={stressColor(sMz, scaleY)} opacity="0.8"
            />
          {/each}
          <polyline
            points={analysis3D.distributionY.map((pt, i) => `${xBaseR + sigmasMzY[i] / scaleY * 30},${-pt.y * sc}`).join(' ')}
            fill="none" stroke="#ccc" stroke-width="0.8" opacity="0.5" />
          <!-- N/A annotation -->
          {#if Math.abs(sigmaN3d) > 0.001}
            <text x={xBaseR} y={-rs.h / 2 * sc - 4} fill="#ff9800" font-size="4.5" text-anchor="start">+ N/A = {fmt(sigmaN3d)} MPa</text>
          {/if}
        {/if}

        <!-- 3D: τ(y) Jourawski distribution along Y axis (LEFT side) -->
        {#if showShearOnDrawing}
          {@const maxTauY = useGlobalScale && globalScales ? globalScales.maxTauY : Math.max(...analysis3D.distributionY.map(p => Math.abs(p.tauVy)), 1e-6)}
          {@const xBaseL = -(rs.b / 2 * sc + 4)}
          {#if maxTauY > 0.01}
            {#each analysis3D.distributionY as pt}
              {@const yScreen = -pt.y * sc}
              {@const barW = Math.abs(pt.tauVy) / maxTauY * 35}
              {#if barW > 0.2}
                <rect
                  x={xBaseL - barW} y={yScreen - 1.5} width={barW} height="3"
                  fill="#e94560" opacity="0.5"
                />
              {/if}
            {/each}
            <!-- Profile contour polyline -->
            <polyline
              points={analysis3D.distributionY
                .map(pt => `${xBaseL - Math.abs(pt.tauVy) / maxTauY * 35},${-pt.y * sc}`)
                .join(' ')}
              fill="none" stroke="#e94560" stroke-width="1.2" opacity="0.8"
            />
            <!-- Baseline -->
            <line
              x1={xBaseL} y1={-rs.h / 2 * sc}
              x2={xBaseL} y2={rs.h / 2 * sc}
              stroke="#e94560" stroke-width="0.4" opacity="0.3"
            />
            <!-- Labels -->
            <text x={xBaseL - 2} y={-rs.h / 2 * sc - 6} fill="#e94560" font-size="5.5" text-anchor="end">τ(y)</text>
            <text x={xBaseL - 2} y={1} fill="#e94560" font-size="5" text-anchor="end">{fmt(maxTauY)} MPa</text>
          {/if}
        {/if}

        <!-- 3D: σ(z) distribution along Z axis (BOTTOM) — signed bars -->
        {@const yBaseBot = rs.h / 2 * sc + 4}
        <!-- Compute moment-only stresses for σ(z) — Mz·z/Iz term from Navier biaxial -->
        {@const sigmasMyZ = analysis3D.distributionZ.map(pt => analysis3D.Iz > 1e-20 ? analysis3D.Mz * pt.z / analysis3D.Iz / 1000 : 0)}
        {@const maxBendingZ = Math.max(...sigmasMyZ.map(s => Math.abs(s)), 1e-6)}
        {@const maxTotalZ = showTotalSigma ? Math.max(...analysis3D.distributionZ.map(p => Math.abs(p.sigma)), 1e-6) : maxBendingZ}
        {@const scaleZ = useGlobalScale && globalScales ? Math.max(globalScales.maxSigmaY, globalScales.maxSigmaZ) : Math.max(maxBendingZ, maxTotalZ)}
        {#if showTotalSigma}
          <!-- Total mode: σ = N/A + Mz·z/Iz — signed bars (+ down, − up) -->
          <!-- Baseline -->
          <line x1={-rs.b / 2 * sc} y1={yBaseBot} x2={rs.b / 2 * sc} y2={yBaseBot}
            stroke="#ccc" stroke-width="0.4" opacity="0.3" />
          <!-- N/A reference line -->
          {#if Math.abs(sigmaN3d) > 0.01}
            {@const naDy = sigmaN3d / scaleZ * 25}
            <line x1={-rs.b / 2 * sc} y1={yBaseBot + naDy} x2={rs.b / 2 * sc} y2={yBaseBot + naDy}
              stroke="#ff9800" stroke-width="0.8" stroke-dasharray="2,2" opacity="0.5" />
          {/if}
          {#each analysis3D.distributionZ as pt}
            {@const zScreen = pt.z * sc}
            {@const barH = pt.sigma / scaleZ * 25}
            <rect
              x={zScreen - 1.5}
              y={barH >= 0 ? yBaseBot : yBaseBot + barH}
              width="3" height={Math.abs(barH)}
              fill={stressColor(pt.sigma, scaleZ)} opacity="0.7"
            />
          {/each}
          <!-- Profile contour polyline -->
          <polyline
            points={analysis3D.distributionZ.map(pt => `${pt.z * sc},${yBaseBot + pt.sigma / scaleZ * 25}`).join(' ')}
            fill="none" stroke="#ccc" stroke-width="0.8" opacity="0.5" />
          <!-- Neutral axis zero-crossing -->
          {@const distZ = analysis3D.distributionZ}
          {#each distZ as pt, i}
            {#if i > 0 && distZ[i - 1].sigma * pt.sigma < 0}
              {@const prev = distZ[i - 1]}
              {@const zNA = prev.z + (pt.z - prev.z) * (-prev.sigma) / (pt.sigma - prev.sigma)}
              <line x1={zNA * sc} y1={yBaseBot - 6} x2={zNA * sc} y2={yBaseBot + 6}
                stroke="#4ecdc4" stroke-width="1" stroke-dasharray="3,2" opacity="0.8" />
            {/if}
          {/each}
        {:else}
          <!-- Default: solo Mz·z/Iz (sin N/A) — signed bars -->
          <!-- Baseline -->
          <line x1={-rs.b / 2 * sc} y1={yBaseBot} x2={rs.b / 2 * sc} y2={yBaseBot}
            stroke="#ccc" stroke-width="0.4" opacity="0.3" />
          {#each analysis3D.distributionZ as pt, i}
            {@const zScreen = pt.z * sc}
            {@const sMy = sigmasMyZ[i]}
            {@const barH = sMy / scaleZ * 25}
            <rect
              x={zScreen - 1.5}
              y={barH >= 0 ? yBaseBot : yBaseBot + barH}
              width="3" height={Math.abs(barH)}
              fill={stressColor(sMy, scaleZ)} opacity="0.7"
            />
          {/each}
          <!-- Profile contour polyline -->
          <polyline
            points={analysis3D.distributionZ.map((pt, i) => `${pt.z * sc},${yBaseBot + sigmasMyZ[i] / scaleZ * 25}`).join(' ')}
            fill="none" stroke="#ccc" stroke-width="0.8" opacity="0.5" />
          <!-- N/A annotation -->
          {#if Math.abs(sigmaN3d) > 0.001}
            <text x={-(rs.b / 2 * sc)} y={yBaseBot + 32} fill="#ff9800" font-size="4.5" text-anchor="start">+ N/A = {fmt(sigmaN3d)} MPa</text>
          {/if}
        {/if}
        {/if}<!-- end showSigma && !showPerpNA -->

        <!-- Neutral axis line — only show when EN button is active and σ is on -->
        {#if showSigma && showPerpNA && perpNA && perpNA.exists}
          {@const na = perpNA}
          {#if na.slope === Infinity}
            {@const zNa = Math.max(-rs.b / 2, Math.min(rs.b / 2, na.intercept))}
            <line
              x1={zNa * sc} y1={-rs.h / 2 * sc}
              x2={zNa * sc} y2={rs.h / 2 * sc}
              stroke="#4ecdc4" stroke-width="2" opacity="0.9"
            />
          {:else}
            <!-- Clip NA line y = slope·z + intercept, but extend beyond section for visibility -->
            {@const halfH = rs.h / 2}
            {@const halfB = rs.b / 2}
            <!-- Extend clip box beyond section so the oblique line is more visible -->
            {@const extH = halfH * 1.6}
            {@const extB = halfB * 1.6}
            {@const candidates = (() => {
              const pts: [number, number][] = [];
              const yAtZmin = na.slope * (-extB) + na.intercept;
              const yAtZmax = na.slope * extB + na.intercept;
              if (yAtZmin >= -extH && yAtZmin <= extH) pts.push([-extB, yAtZmin]);
              if (yAtZmax >= -extH && yAtZmax <= extH) pts.push([extB, yAtZmax]);
              if (Math.abs(na.slope) > 1e-12) {
                const zAtYmin = (-extH - na.intercept) / na.slope;
                const zAtYmax = (extH - na.intercept) / na.slope;
                if (zAtYmin >= -extB && zAtYmin <= extB) pts.push([zAtYmin, -extH]);
                if (zAtYmax >= -extB && zAtYmax <= extB) pts.push([zAtYmax, extH]);
              }
              const unique: [number, number][] = [];
              for (const p of pts) {
                if (!unique.some(u => Math.abs(u[0] - p[0]) < 1e-9 && Math.abs(u[1] - p[1]) < 1e-9)) unique.push(p);
              }
              return unique;
            })()}
            {#if candidates.length >= 2}
              <line
                x1={candidates[0][0] * sc} y1={-candidates[0][1] * sc}
                x2={candidates[1][0] * sc} y2={-candidates[1][1] * sc}
                stroke="#4ecdc4" stroke-width="2" opacity="0.9"
              />
            {/if}
          {/if}
          <text x={rs.b / 2 * sc + 2} y={-rs.h / 2 * sc - 6} fill="#4ecdc4" font-size="6" font-weight="bold" opacity="0.9">EN</text>
        {/if}

        <!-- Perpendicular-to-NA stress distribution (3D, moments only) -->
        {#if showSigma && showPerpNA && perpNADist.length > 0 && perpNA}
          {@const na = perpNA}
          {@const maxSigPerp = Math.max(...perpNADist.map(p => Math.abs(p.sigma)), 1e-6)}
          <!-- NA direction in physical (y,z): (dz=1, dy=slope). In screen (x=z·sc, y=-y·sc):
               screenDir = (1/L, -slope/L). Bars extend parallel to NA in screen coords. -->
          {@const naLen = na.slope === Infinity ? 1 : Math.hypot(1, na.slope)}
          {@const parScreenX = na.slope === Infinity ? 0 : 1 / naLen}
          {@const parScreenY = na.slope === Infinity ? -1 : -na.slope / naLen}
          {@const firstPt = perpNADist[0]}
          {@const lastPt = perpNADist[perpNADist.length - 1]}
          <!-- Find max tension and max compression points -->
          {@const maxTensionPt = perpNADist.reduce((best, pt) => pt.sigma > best.sigma ? pt : best, perpNADist[0])}
          {@const maxComprPt = perpNADist.reduce((best, pt) => pt.sigma < best.sigma ? pt : best, perpNADist[0])}
          {@const barScale = 35}
          <!-- Filled stress polygon: baseline → stress profile → back to baseline -->
          <polygon
            points={[
              ...perpNADist.map(pt => {
                const yScr = -pt.y * sc;
                const zScr = pt.z * sc;
                const barLen = (pt.sigma / maxSigPerp) * barScale;
                return `${zScr + barLen * parScreenX},${yScr + barLen * parScreenY}`;
              }),
              ...perpNADist.slice().reverse().map(pt => {
                return `${pt.z * sc},${-pt.y * sc}`;
              }),
            ].join(' ')}
            fill="url(#perpNAGrad)" opacity="0.3"
          />
          <!-- Gradient for filled area -->
          <defs>
            <linearGradient id="perpNAGrad" gradientUnits="userSpaceOnUse"
              x1={firstPt.z * sc} y1={-firstPt.y * sc}
              x2={lastPt.z * sc} y2={-lastPt.y * sc}>
              <stop offset="0%" stop-color="#ff6b6b" />
              <stop offset="50%" stop-color="#444" />
              <stop offset="100%" stop-color="#6ba3ff" />
            </linearGradient>
          </defs>
          <!-- Sampling line (perpendicular to NA: baseline for bars) -->
          <line
            x1={firstPt.z * sc} y1={-firstPt.y * sc}
            x2={lastPt.z * sc} y2={-lastPt.y * sc}
            stroke="#888" stroke-width="0.8" stroke-dasharray="3,2" opacity="0.6"
          />
          <!-- Stress bars parallel to NA -->
          {#each perpNADist as pt}
            {@const yScr = -pt.y * sc}
            {@const zScr = pt.z * sc}
            {@const barLen = (pt.sigma / maxSigPerp) * barScale}
            {#if Math.abs(barLen) > 0.3}
            <line
              x1={zScr} y1={yScr}
              x2={zScr + barLen * parScreenX} y2={yScr + barLen * parScreenY}
              stroke={stressColor(pt.sigma, maxSigPerp)}
              stroke-width="2" opacity="0.7"
            />
            {/if}
          {/each}
          <!-- Profile contour polyline (stress envelope) -->
          <polyline
            points={perpNADist.map(pt => {
              const yScr = -pt.y * sc;
              const zScr = pt.z * sc;
              const barLen = (pt.sigma / maxSigPerp) * barScale;
              return `${zScr + barLen * parScreenX},${yScr + barLen * parScreenY}`;
            }).join(' ')}
            fill="none" stroke="#4ecdc4" stroke-width="1.5" opacity="0.9"
          />
          <!-- σ_max (tension) label -->
          {#if maxTensionPt.sigma > 0.001}
            {@const tBarLen = (maxTensionPt.sigma / maxSigPerp) * barScale}
            {@const tEndX = maxTensionPt.z * sc + tBarLen * parScreenX}
            {@const tEndY = -maxTensionPt.y * sc + tBarLen * parScreenY}
            <text x={tEndX + 3} y={tEndY - 3} fill="#ff6b6b" font-size="5" text-anchor="start">&sigma;<tspan font-size="3.5" dy="1.5">max</tspan><tspan dy="-1.5"> = +{fmt(maxTensionPt.sigma)}</tspan></text>
          {/if}
          <!-- σ_min (compression) label -->
          {#if maxComprPt.sigma < -0.001}
            {@const cBarLen = (maxComprPt.sigma / maxSigPerp) * barScale}
            {@const cEndX = maxComprPt.z * sc + cBarLen * parScreenX}
            {@const cEndY = -maxComprPt.y * sc + cBarLen * parScreenY}
            <text x={cEndX + 3} y={cEndY + 6} fill="#6ba3ff" font-size="5" text-anchor="start">&sigma;<tspan font-size="3.5" dy="1.5">min</tspan><tspan dy="-1.5"> = {fmt(maxComprPt.sigma)}</tspan></text>
          {/if}
          <text x="0" y={rs.h / 2 * sc + 46} fill="#4ecdc4" font-size="5.5" text-anchor="middle">{showTotalSigma ? 'σ total' : 'σ'} &perp; EN</text>
        {/if}

        <!-- Selected fiber point (y, z) -->
        {@const halfH3 = rs.h / 2}
        {@const halfB3 = rs.b / 2}
        {@const yF3 = -halfH3 + fiberRatioY * rs.h}
        {@const zF3 = -halfB3 + fiberRatioZ * rs.b}
        <circle
          cx={zF3 * sc} cy={-yF3 * sc}
          r="3.5" fill="#ffdd57" opacity="0.9"
        />
        <line
          x1={-rs.b / 2 * sc - 5} y1={-yF3 * sc}
          x2={rs.b / 2 * sc + 5} y2={-yF3 * sc}
          stroke="#ffdd57" stroke-width="0.8" stroke-dasharray="3,2" opacity="0.5"
        />
        <line
          x1={zF3 * sc} y1={-rs.h / 2 * sc - 5}
          x2={zF3 * sc} y2={rs.h / 2 * sc + 5}
          stroke="#ffdd57" stroke-width="0.8" stroke-dasharray="3,2" opacity="0.5"
        />
        <!-- Labels -->
        {#if showSigma && !showPerpNA}
          <text x={rs.b / 2 * sc + 36} y="-60" fill="#ccc" font-size="7" text-anchor="start">&sigma;(y)</text>
          <text x="0" y={rs.h / 2 * sc + 38} fill="#ccc" font-size="7" text-anchor="middle">&sigma;(z)</text>
        {/if}
      {:else if analysis2D}
        <!-- 2D: stress bars along Y (right side) -->
        {@const rs2d = analysis2D.resolved}
        {@const sc2d = 80 / Math.max(rs2d.h, rs2d.b)}
        {@const xBase2d = rs2d.b / 2 * sc2d + 4}
        {@const sigmaN2d = rs2d.a > 1e-15 ? analysis2D.N / rs2d.a / 1000 : 0}
        <!-- Compute moment-only stresses for shared scale -->
        {@const sigmasM2d = analysis2D.distribution.map(pt => rs2d.iy > 1e-20 ? analysis2D.M * pt.y / rs2d.iy / 1000 : 0)}
        {@const maxBending2d = Math.max(...sigmasM2d.map(s => Math.abs(s)), 1e-6)}
        {@const maxTotal2d = showTotalSigma ? Math.max(...analysis2D.distribution.map(p => Math.abs(p.sigma)), 1e-6) : maxBending2d}
        {@const scale2d = useGlobalScale && globalScales ? globalScales.maxSigmaY : Math.max(maxBending2d, maxTotal2d)}
        {#if showSigma}
        {#if showTotalSigma}
          <!-- Total mode: σ = N/A + M·y/I — signed bars (+ right, − left) -->
          <!-- Baseline -->
          <line x1={xBase2d} y1={-rs2d.h / 2 * sc2d} x2={xBase2d} y2={rs2d.h / 2 * sc2d}
            stroke="#ccc" stroke-width="0.4" opacity="0.3" />
          <!-- N/A reference line -->
          {#if Math.abs(sigmaN2d) > 0.01}
            {@const naDx2d = sigmaN2d / scale2d * 30}
            <line x1={xBase2d + naDx2d} y1={-rs2d.h / 2 * sc2d} x2={xBase2d + naDx2d} y2={rs2d.h / 2 * sc2d}
              stroke="#ff9800" stroke-width="0.8" stroke-dasharray="2,2" opacity="0.5" />
            <text x={xBase2d + naDx2d} y={-rs2d.h / 2 * sc2d - 3} fill="#ff9800" font-size="3.5" text-anchor="middle">N/A</text>
          {/if}
          {#each analysis2D.distribution as pt}
            {@const yScreen = -pt.y * sc2d}
            {@const barW = pt.sigma / scale2d * 30}
            <rect
              x={barW >= 0 ? xBase2d : xBase2d + barW}
              y={yScreen - 1.5}
              width={Math.abs(barW)}
              height="3"
              fill={stressColor(pt.sigma, scale2d)} opacity="0.8" />
          {/each}
          <!-- Profile contour polyline -->
          <polyline
            points={analysis2D.distribution
              .map(pt => `${xBase2d + pt.sigma / scale2d * 30},${-pt.y * sc2d}`)
              .join(' ')}
            fill="none" stroke="#ccc" stroke-width="0.8" opacity="0.6" />
          <!-- Neutral axis marker (where σ crosses zero) — EN -->
          {@const distArr = analysis2D.distribution}
          {#each distArr as pt, i}
            {#if i > 0 && distArr[i - 1].sigma * pt.sigma < 0}
              {@const prev = distArr[i - 1]}
              {@const yNA = prev.y + (pt.y - prev.y) * (-prev.sigma) / (pt.sigma - prev.sigma)}
              <line x1={xBase2d - 8} y1={-yNA * sc2d} x2={xBase2d + 8} y2={-yNA * sc2d}
                stroke="#4ecdc4" stroke-width="1" stroke-dasharray="3,2" opacity="0.8" />
              <text x={xBase2d + 10} y={-yNA * sc2d + 3} fill="#4ecdc4" font-size="4" text-anchor="start">EN</text>
            {/if}
          {/each}
          <text x={xBase2d} y={-rs2d.h / 2 * sc2d - 7} fill="#ccc" font-size="4" text-anchor="start">σ = N/A + M·y/I</text>
        {:else}
          <!-- Default: solo M·y/I (sin N/A) — signed bars -->
          <!-- Baseline -->
          <line x1={xBase2d} y1={-rs2d.h / 2 * sc2d} x2={xBase2d} y2={rs2d.h / 2 * sc2d}
            stroke="#ccc" stroke-width="0.4" opacity="0.3" />
          {#each analysis2D.distribution as pt, i}
            {@const yScreen = -pt.y * sc2d}
            {@const sM = sigmasM2d[i]}
            {@const barW = sM / scale2d * 30}
            <rect
              x={barW >= 0 ? xBase2d : xBase2d + barW}
              y={yScreen - 1.5}
              width={Math.abs(barW)}
              height="3"
              fill={stressColor(sM, scale2d)} opacity="0.8" />
          {/each}
          <!-- Profile contour polyline -->
          <polyline
            points={analysis2D.distribution
              .map((pt, i) => `${xBase2d + sigmasM2d[i] / scale2d * 30},${-pt.y * sc2d}`)
              .join(' ')}
            fill="none" stroke="#ccc" stroke-width="0.8" opacity="0.6" />
          <text x={xBase2d} y={-rs2d.h / 2 * sc2d - 4} fill="#ccc" font-size="4.5" text-anchor="start">M·y/I</text>
          {#if Math.abs(sigmaN2d) > 0.001}
            <text x={xBase2d} y={-rs2d.h / 2 * sc2d - 10} fill="#ff9800" font-size="4.5" text-anchor="start">+ N/A = {fmt(sigmaN2d)} MPa</text>
          {/if}
        {/if}
        {/if}<!-- end showSigma (2D) -->
        <!-- Shear flow diagram (2D, thin-walled sections) -->
        {#if showShearOnDrawing && !isMassive && shearFlow.length > 0}
          {@const rs = analysis2D.resolved}
          {@const sc = 80 / Math.max(rs.h, rs.b)}
          {@const allTaus = shearFlow.flatMap(seg => seg.points.map(p => p.tau))}
          {@const maxTau = useGlobalScale && globalScales ? globalScales.maxTauY : Math.max(...allTaus, 1e-6)}
          {@const tauScale = 20 / maxTau}
          {@const gap = 4}
          {@const vSign = analysis2D.V >= 0 ? 1 : -1}
          {#each shearFlow as seg}
            {@const pts = seg.points}
            {#if pts.length >= 2}
              {@const dz = pts[pts.length - 1].z - pts[0].z}
              {@const dy = pts[pts.length - 1].y - pts[0].y}
              {@const len = Math.hypot(dz, dy) || 1}
              {@const midZ = (pts[0].z + pts[pts.length - 1].z) / 2}
              {@const midY = (pts[0].y + pts[pts.length - 1].y) / 2}
              {@const pAz = -dy / len}
              {@const pAy = dz / len}
              {@const dotA = (midZ + pAz) * (midZ + pAz) + (midY + pAy) * (midY + pAy)}
              {@const dotB = (midZ - pAz) * (midZ - pAz) + (midY - pAy) * (midY - pAy)}
              <!-- For predominantly vertical segments (web), force normal LEFT to avoid overlap with σ bars on RIGHT -->
              {@const isVertical = Math.abs(dy) > Math.abs(dz) * 2}
              {@const rawPz = dotA >= dotB ? pAz : -pAz}
              {@const rawPy = dotA >= dotB ? pAy : -pAy}
              {@const pz = isVertical && rawPz > 0 ? -rawPz : rawPz}
              {@const py = isVertical && rawPz > 0 ? -rawPy : rawPy}
              <polygon
                points={[
                  ...pts.map(p => {
                    const bx = p.z * sc + gap * pz;
                    const by = -p.y * sc - gap * py;
                    return `${bx + p.tau * tauScale * pz},${by - p.tau * tauScale * py}`;
                  }),
                  ...pts.slice().reverse().map(p => {
                    return `${p.z * sc + gap * pz},${-p.y * sc - gap * py}`;
                  }),
                ].join(' ')}
                fill="rgba(233, 69, 96, 0.15)"
                stroke="none"
              />
              <polyline
                points={pts.map(p => {
                  const bx = p.z * sc + gap * pz;
                  const by = -p.y * sc - gap * py;
                  return `${bx + p.tau * tauScale * pz},${by - p.tau * tauScale * py}`;
                }).join(' ')}
                fill="none"
                stroke="#e94560"
                stroke-width="1.2"
              />
              <polyline
                points={pts.map(p => `${p.z * sc + gap * pz},${-p.y * sc - gap * py}`).join(' ')}
                fill="none"
                stroke="#e94560"
                stroke-width="0.4"
                opacity="0.35"
              />
              {@const ai = Math.round(pts.length * 0.55)}
              {@const ap = pts[ai]}
              {@const aiNext = vSign >= 0 ? Math.min(ai + 1, pts.length - 1) : Math.max(ai - 1, 0)}
              {@const ap2 = pts[aiNext]}
              {@const adz = (ap2.z - ap.z) || (dz / len) * 0.001}
              {@const ady = (ap2.y - ap.y) || (dy / len) * 0.001}
              {@const alen = Math.hypot(adz, ady) || 1}
              {@const ax = ap.z * sc}
              {@const ay = -ap.y * sc}
              {@const afw = adz / alen}
              {@const afh = -ady / alen}
              <polygon
                points="{ax + afw * 5.5},{ay + afh * 5.5} {ax - afw * 2 + afh * 3},{ay - afh * 2 - afw * 3} {ax - afw * 2 - afh * 3},{ay - afh * 2 + afw * 3}"
                fill="#e94560"
                stroke="#16213e"
                stroke-width="0.5"
                opacity="0.95"
              />
            {/if}
          {/each}
          {@const globalMax = shearFlow.flatMap(s => s.points).reduce((best, p) => p.tau > best.tau ? p : best, { z: 0, y: 0, tau: 0 })}
          {#if globalMax.tau > 0.01}
            {@const gmSc = 80 / Math.max(rs.h, rs.b)}
            <circle cx={globalMax.z * gmSc} cy={-globalMax.y * gmSc} r="2.5" fill="#e94560" opacity="0.9" />
            <text
              x={globalMax.z * gmSc + (globalMax.z >= 0 ? 5 : -5)}
              y={-globalMax.y * gmSc - 4}
              fill="#e94560" font-size="6.5"
              text-anchor={globalMax.z >= 0 ? 'start' : 'end'}
            >{globalMax.tau.toFixed(1)}</text>
          {/if}
        {/if}
        <!-- Jourawski τ(y) bars for massive sections (LEFT side) -->
        {#if showShearOnDrawing && isMassive && analysis2D}
          {@const rs = analysis2D.resolved}
          {@const sc = 80 / Math.max(rs.h, rs.b)}
          {@const maxAbsTau = useGlobalScale && globalScales ? globalScales.maxTauY : Math.max(...analysis2D.distribution.map(p => Math.abs(p.tau)), 1e-6)}
          {#each analysis2D.distribution as pt}
            {@const yScreen = -pt.y * sc}
            {@const barW = Math.abs(pt.tau) / maxAbsTau * 25}
            {#if barW > 0.2}
              <rect
                x={-(rs.b / 2 * sc + 4 + barW)}
                y={yScreen - 1.5}
                width={barW}
                height="3"
                fill="#e94560"
                opacity="0.55"
              />
            {/if}
          {/each}
          <!-- τ_max value label -->
          <text
            x={-(rs.b / 2 * sc + 6)}
            y={1}
            fill="#e94560" font-size="5.5" text-anchor="end"
          >{fmt(maxAbsTau)} MPa</text>
        {/if}
        <!-- 2D: Neutral axis line (EN button active, requires σ on) -->
        {#if showSigma && showPerpNA && analysis2D.resolved}
          {@const rs2en = analysis2D.resolved}
          {@const sc2en = 80 / Math.max(rs2en.h, rs2en.b)}
          <!-- EN position: with σ total → y = -N·Iz/(A·M) (shifts with N), else → y = 0 (centroid) -->
          {@const enY2d = (showTotalSigma && analysis2D.neutralAxisY !== null) ? analysis2D.neutralAxisY : 0}
          <!-- Check if EN is within section bounds -->
          {@const enInSection = enY2d >= rs2en.yMin && enY2d <= rs2en.yMax}
          {#if enInSection}
            {@const enScreenY = -enY2d * sc2en}
            <!-- Prominent horizontal line -->
            <line
              x1={-rs2en.b / 2 * sc2en - 8}
              y1={enScreenY}
              x2={rs2en.b / 2 * sc2en + 8}
              y2={enScreenY}
              stroke="#4ecdc4"
              stroke-width="2"
              opacity="0.9"
            />
            <!-- EN label -->
            <text
              x={-rs2en.b / 2 * sc2en - 10}
              y={enScreenY + 3}
              fill="#4ecdc4" font-size="6" font-weight="bold" text-anchor="end"
            >EN</text>
            <!-- Show y-position when σ total shifts the NA -->
            {#if showTotalSigma && analysis2D.neutralAxisY !== null && Math.abs(enY2d) > 0.0001}
              <text
                x={rs2en.b / 2 * sc2en + 10}
                y={enScreenY + 3}
                fill="#4ecdc4" font-size="4" text-anchor="start" opacity="0.8"
              >y = {fmt(enY2d * 1000, 1)} mm</text>
            {/if}
          {:else}
            <!-- EN outside section: show arrow pointing in direction -->
            {@const arrowDir = enY2d > rs2en.yMax ? -1 : 1}
            <text
              x={-rs2en.b / 2 * sc2en - 10}
              y={arrowDir < 0 ? -rs2en.h / 2 * sc2en + 3 : rs2en.h / 2 * sc2en + 3}
              fill="#4ecdc4" font-size="5" text-anchor="end" opacity="0.7"
            >EN {arrowDir < 0 ? '↑' : '↓'} fuera</text>
          {/if}
        {/if}

        <!-- 2D: fiber line -->
        {#if analysis2D.resolved}
          {@const rs2 = analysis2D.resolved}
          {@const sc2 = 80 / Math.max(rs2.h, rs2.b)}
          {@const fiberY = -(rs2.yMin + fiberRatioY * (rs2.yMax - rs2.yMin)) * sc2}
          <line
            x1={-rs2.b / 2 * sc2 - 5}
            y1={fiberY}
            x2={rs2.b / 2 * sc2 + 5}
            y2={fiberY}
            stroke="#ffdd57"
            stroke-width="1.5"
            stroke-dasharray="3,2"
          />
          {#if showSigma}
            <text x={rs2.b / 2 * sc2 + 36} y="-60" fill="#ccc" font-size="8" text-anchor="start">&sigma;</text>
          {/if}
          {#if showShearOnDrawing}
            <text x={-(rs2.b / 2 * sc2 + 6)} y="-68" fill="#e94560" font-size="6" text-anchor="end">{isMassive ? 'τ(y) Jourawski' : t('stress.shearFlow')}</text>
          {/if}
        {/if}
      {/if}
      </g>
    </svg>
  </div>

  <!-- Fiber sliders -->
  {#if is3D && analysis3D}
    <div class="ssp-fiber-row">
      <span class="ssp-fiber-label">{t('stress.fiberY')}</span>
      <input
        type="range"
        class="ssp-range"
        min="0" max="1" step="0.02"
        bind:value={fiberRatioY}
      />
      <span class="ssp-fiber-val">{fmt((-analysis3D.resolved.h / 2 + fiberRatioY * analysis3D.resolved.h) * 1000, 1)} mm</span>
    </div>
    <div class="ssp-fiber-row">
      <span class="ssp-fiber-label">{t('stress.fiberZ')}</span>
      <input
        type="range"
        class="ssp-range ssp-range-z"
        min="0" max="1" step="0.02"
        bind:value={fiberRatioZ}
      />
      <span class="ssp-fiber-val">{fmt((-analysis3D.resolved.b / 2 + fiberRatioZ * analysis3D.resolved.b) * 1000, 1)} mm</span>
      <span class="ssp-help" title={t('stress.fiberYZ3dHelp')}>?</span>
    </div>
  {:else if analysis2D}
    <div class="ssp-fiber-row">
      <span class="ssp-fiber-label">{t('stress.fiberY')}</span>
      <input
        type="range"
        class="ssp-range"
        min="0" max="1" step="0.02"
        bind:value={fiberRatioY}
      />
      <span class="ssp-fiber-val">{fmt((analysis2D.resolved.yMin + fiberRatioY * (analysis2D.resolved.yMax - analysis2D.resolved.yMin)) * 1000, 1)} mm</span>
      <span class="ssp-help" title={t('stress.fiberY2dHelp')}>?</span>
    </div>
  {/if}
{/if}

<style>
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

  .ssp-svg-container {
    display: flex;
    justify-content: center;
    margin: 4px 0;
  }

  .ssp-cross-svg {
    width: 200px;
    height: 160px;
  }

  /* Toggle button toolbar */
  .ssp-svg-toggles {
    display: flex;
    flex-wrap: wrap;
    gap: 2px;
    padding: 2px 0;
    align-items: center;
  }

  .ssp-svg-toggle {
    width: 20px;
    height: 18px;
    font-size: 0.55rem;
    border: 1px solid #1a4a7a;
    border-radius: 3px;
    background: rgba(22, 33, 62, 0.8);
    color: #666;
    cursor: pointer;
    padding: 0;
    font-family: serif;
    font-style: italic;
    transition: all 0.15s;
    display: flex;
    align-items: center;
    justify-content: center;
    line-height: 1;
  }

  .ssp-svg-toggle:hover {
    color: #aaa;
    border-color: #2a5a8a;
  }

  .ssp-svg-toggle.active {
    color: #e94560;
    border-color: #e94560;
    background: rgba(233, 69, 96, 0.12);
  }

  .ssp-svg-toggle.disabled {
    opacity: 0.3;
    pointer-events: none;
    cursor: default;
  }

  .ssp-toggle-sigma.active {
    color: #4ecdc4;
    border-color: #4ecdc4;
    background: rgba(78, 205, 196, 0.12);
  }

  .ssp-toggle-cp.active {
    color: #e040fb;
    border-color: #e040fb;
    background: rgba(224, 64, 251, 0.12);
  }

  .ssp-toggle-scale {
    margin-left: auto;
    font-family: 'Courier New', monospace;
    font-style: normal;
    font-weight: 700;
    font-size: 0.55rem;
    letter-spacing: 0.5px;
  }

  .ssp-toggle-scale.active {
    color: #ff9800;
    border-color: #ff9800;
    background: rgba(255, 152, 0, 0.12);
  }

  .ssp-fiber-row {
    display: flex;
    align-items: center;
    gap: 4px;
    margin: 4px 0 6px;
  }

  .ssp-fiber-label {
    font-size: 0.65rem;
    color: #aaa;
    min-width: 42px;
  }

  .ssp-range {
    flex: 1;
    height: 4px;
    -webkit-appearance: none;
    appearance: none;
    background: #1a4a7a;
    border-radius: 2px;
    outline: none;
  }

  .ssp-range::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: #ffdd57;
    cursor: pointer;
    border: none;
  }

  .ssp-range::-moz-range-thumb {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: #ffdd57;
    cursor: pointer;
    border: none;
  }

  .ssp-range-z::-webkit-slider-thumb {
    background: #ffdd57;
  }

  .ssp-fiber-val {
    font-size: 0.65rem;
    color: #ccc;
    min-width: 42px;
    text-align: right;
    font-family: 'Courier New', monospace;
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
</style>
