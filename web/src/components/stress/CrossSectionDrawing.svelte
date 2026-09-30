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
  import { stressMapRamp, rampDirection } from '../../lib/section/stress-map';

  interface Props {
    /**
     * Canonical outline the numerical path analysed, centroid-relative.
     *
     * Present only for a geometry-backed section. When it is present the
     * drawing renders THESE polygons — the same ones the stress field was
     * computed on — instead of reconstructing an outline of its own, which is
     * what allowed a renamed profile to draw one shape and compute another.
     * `null` means the section is properties-only and the panel has already
     * refused detailed analysis upstream.
     */
    canonicalGeometry?: import('../../lib/section/drawing').DrawingGeometry | null;
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
    /**
     * Paint the normal-stress field over the section instead of reading it at a
     * single point. Both views answer different questions — "how bad is it
     * here" versus "where is it worst" — so this is a toggle, not a
     * replacement.
     */
    showStressMap: boolean;
    /**
     * Coefficients of the normal-stress plane, `sigma = axial + kz*z - ky*y`,
     * MPa with y/z centroid-relative in metres. Null when the section has no
     * canonical geometry, which is also when the map is not offered.
     */
    stressField: { axial: number; ky: number; kz: number } | null;
    /** Show the eccentric application point and what it induces. */
    showEccentric: boolean;
    /**
     * Where the load is applied, canonical `[y, z]` in metres, centroid-
     * relative. Bound, because dragging the marker is how it is set.
     */
    eccentricPoint: [number, number] | null;
    /**
     * Where the load PARALLEL to the section acts. Distinct from the point
     * above because it is eccentric about the shear centre, not the centroid,
     * and it twists rather than bends.
     */
    eccentricPointV: [number, number] | null;
    /** Whether a parallel load exists, so its marker is only drawn if it does. */
    hasParallelLoad: boolean;
    /** Whether a load normal to the section exists — decides the default marker. */
    hasPerpendicularLoad: boolean;
    /**
     * Shear centre, canonical `[y, z]` in metres. Drawn alongside the centroid
     * because the whole point of the exercise is that they are different
     * points — and for a channel this one sits outside the section entirely.
     */
    shearCentre: [number, number] | null;
    /** Whether the application point lies inside the kern. */
    eccentricInsideKern: boolean;
    /**
     * Torsional shear distribution, when a torque exists.
     *
     * `computeTorsionFlow` produced this from the start and nothing consumed
     * it — the panel showed the peak and the theory but never the field. Half-
     * connected code is worse than either alternative, so it is drawn.
     */
    torsionFlow: import('../../lib/engine/torsion-flow').TorsionFlow | null;
    /** Draw it. Off by default: the figure is already busy. */
    showTorsionFlow: boolean;
  }

  let {
    canonicalGeometry = null,
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
    showStressMap = $bindable(),
    stressField,
    showEccentric = $bindable(),
    eccentricPoint = $bindable(),
    eccentricPointV = $bindable(),
    hasParallelLoad,
    hasPerpendicularLoad,
    shearCentre,
    eccentricInsideKern,
    torsionFlow,
    showTorsionFlow = $bindable(),
  }: Props = $props();

  /**
   * Scale factor from canonical metres to this SVG's units.
   *
   * The outline path derives the same number inline; the overlays below need it
   * as a value, and computing it twice from the same bbox is how the two drift
   * apart. `null` when there is no canonical geometry — which is exactly when
   * the eccentric-load and stress-map overlays are withheld, because both are
   * expressed in canonical coordinates and have nothing to attach to otherwise.
   */
  const canonicalScale = $derived.by((): number | null => {
    if (!canonicalGeometry) return null;
    const [yMin, zMin, yMax, zMax] = canonicalGeometry.bbox;
    const w = Math.max(yMax - yMin, 1e-12);
    const h = Math.max(zMax - zMin, 1e-12);
    return 80 / Math.max(w, h);
  });

  let gEl = $state<SVGGElement | null>(null);
  let dragging = $state(false);

  /** Figure lifted to the centre of the screen. Local: nothing else needs it. */
  let maximized = $state(false);

  /**
   * The area the enlarged figure occupies: the canvas, and only the canvas.
   *
   * Measured from the viewport container rather than from the window. Anchoring
   * to the window put the figure under the header — which then swallowed clicks
   * meant for the toolbar — and over the right panel, whose controls drive this
   * very figure. Both are the same mistake: the figure belongs where the model
   * is drawn, not on top of the chrome around it.
   *
   * Re-measured on resize and on the panel splitter, which fires no window
   * resize event of its own.
   */
  let overlayBox = $state<{ top: number; left: number; width: number; height: number } | null>(null);

  $effect(() => {
    if (!maximized) return;
    const host = document.querySelector('.viewport-container') as HTMLElement | null;
    if (!host) return;
    const measure = () => {
      const r = host.getBoundingClientRect();
      overlayBox = { top: r.top, left: r.left, width: r.width, height: r.height };
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(host);
    window.addEventListener('resize', measure);
    return () => { ro.disconnect(); window.removeEventListener('resize', measure); };
  });

  /**
   * Stroke scale for the enlarged figure.
   *
   * Stroke widths are in viewBox units, so blowing the figure up from 200 to
   * 700 pixels multiplies every line by the same factor — and a 1.5-unit
   * outline that read as a crisp edge at panel size becomes a heavy black band
   * around a large drawing. Thinning the strokes keeps the line weight
   * proportionate to the figure instead of to the coordinate system.
   *
   * Not `non-scaling-stroke`, which would pin the outline to a constant pixel
   * width: at this size that reads as too thin, and the geometry stops being
   * the dominant thing on screen.
   */
  const strokeK = $derived(maximized ? 0.4 : 1);

  /**
   * Type scale for the enlarged figure, and the reason it is not the same
   * number as the strokes.
   *
   * Labels are in viewBox units too, so at three-and-a-half times the size a
   * 4-unit caption becomes 14 device pixels — legible, but shouting, and it
   * crowds the geometry it annotates. Shrinking it as hard as the strokes
   * (0.4) would leave it at 5 px, which is smaller than it is in the panel and
   * unreadable. A label has a floor that a line does not: it must stay
   * readable at any figure size, so it scales less.
   */
  const textK = $derived(maximized ? 0.62 : 1);

  /**
   * Scale for GLYPHS — arrowheads, peak markers — as opposed to the diagram
   * itself.
   *
   * The shear bars and their offsets are part of the plot and should grow with
   * the figure. An arrowhead is not: it says "this way", and a direction
   * indicator four times its normal size stops reading as an annotation and
   * starts competing with the geometry. Sized like the strokes rather than
   * like the plot.
   */
  const glyphK = $derived(maximized ? 0.5 : 1);

  // Escape leaves the maximised view. It is the gesture every overlay teaches,
  // and the toolbar button can end up behind the enlarged figure on a short
  // window, so there has to be a way out that does not depend on hitting it.
  $effect(() => {
    if (!maximized) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') maximized = false; };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  /**
   * Pointer position in canonical section coordinates.
   *
   * Read through the `<g>`'s own screen matrix rather than by arithmetic on the
   * bounding rect: the group carries a rotation, the SVG carries a viewBox, and
   * the page can be scrolled or zoomed. Inverting the actual CTM handles all of
   * those at once, whereas hand-rolled arithmetic handles whichever ones its
   * author happened to think of.
   */
  function pointerToSection(ev: PointerEvent): [number, number] | null {
    const sc = canonicalScale;
    if (!gEl || sc === null) return null;
    const ctm = gEl.getScreenCTM();
    if (!ctm) return null;
    const local = new DOMPoint(ev.clientX, ev.clientY).matrixTransform(ctm.inverse());
    // Undo the two transforms the outline applies: scale, and the sign flip
    // that puts z upward in a coordinate system whose y grows downward.
    return [local.x / sc, -local.y / sc];
  }

  /**
   * Which marker the background click drives.
   *
   * Two markers share one catch surface, so clicking away from both has to mean
   * something specific. It used to always mean the perpendicular one, which
   * produced a silent dead end: a user with only a PARALLEL load would add it,
   * click the drawing to place it, move the wrong marker, and get no torsion —
   * with the panel cheerfully reporting zero because nothing had in fact moved
   * off the shear centre.
   *
   * Now it follows the load that EXISTS. With no axial force there is nothing
   * the perpendicular point can do — moving it cannot change a bending that is
   * N times an arm when N is zero — so the parallel point is what a click means.
   * Grabbing a marker directly still selects it, and the panel shows which is
   * active, so the rule is visible rather than merely sensible.
   */
  let activeMarker = $state<'n' | 'v'>('n');

  $effect(() => {
    // Only steers the DEFAULT: once a marker is grabbed the choice is the
    // user's, and this must not fight it.
    if (!userPickedMarker) activeMarker = hasParallelLoad && !hasPerpendicularLoad ? 'v' : 'n';
  });
  let userPickedMarker = $state(false);

  function setPoint(p: [number, number]) {
    if (activeMarker === 'v') eccentricPointV = p;
    else eccentricPoint = p;
  }

  function startDrag(ev: PointerEvent, which?: 'n' | 'v') {
    if (which) { activeMarker = which; userPickedMarker = true; }
    const p = pointerToSection(ev);
    if (!p) return;
    dragging = true;
    setPoint(p);
    (ev.currentTarget as Element).setPointerCapture?.(ev.pointerId);
    ev.preventDefault();
  }

  function moveDrag(ev: PointerEvent) {
    if (!dragging) return;
    const p = pointerToSection(ev);
    if (p) setPoint(p);
  }

  function endDrag(ev: PointerEvent) {
    dragging = false;
    (ev.currentTarget as Element).releasePointerCapture?.(ev.pointerId);
  }

  /**
   * Nudge the point with the arrow keys, so setting it does not require a
   * mouse. The step is a fiftieth of the section's size, which keeps the
   * gesture proportionate on a 60 mm angle and on a 900 mm girder alike.
   */
  function nudge(ev: KeyboardEvent, which: 'n' | 'v') {
    const current = which === 'v' ? eccentricPointV : eccentricPoint;
    if (!current || !canonicalGeometry) return;
    const [yMin, zMin, yMax, zMax] = canonicalGeometry.bbox;
    const step = Math.max(yMax - yMin, zMax - zMin) / 50;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0], ArrowRight: [step, 0],
      ArrowUp: [0, step], ArrowDown: [0, -step],
    };
    const d = moves[ev.key];
    if (!d) return;
    activeMarker = which;
    setPoint([current[0] + d[0], current[1] + d[1]]);
    ev.preventDefault();
  }

  /**
   * Stops for the stress-map gradient.
   *
   * `sigma` is affine over the section, so a linear gradient reproduces the
   * field EXACTLY — there is nothing being interpolated between samples here.
   * The stops exist only because the stress-to-colour mapping is not linear;
   * eleven of them keep the colour ramp smooth while the underlying values
   * stay exact at every pixel.
   */
  function mapStops(sigmaLo: number, sigmaHi: number, scale: number) {
    const stops: Array<{ offset: number; color: string }> = [];
    for (let i = 0; i <= 10; i++) {
      const f = i / 10;
      stops.push({ offset: f, color: stressColor(sigmaLo + f * (sigmaHi - sigmaLo), scale) });
    }
    return stops;
  }

  // SVG helper
  /**
   * SVG path for the canonical outline, holes included.
   *
   * Canonical geometry arrives centroid-relative, in METRES, with z pointing
   * up — the frame the numerical path works in. This SVG works in the scaled,
   * y-down frame every other overlay here uses (`sc = 80 / max(h, b)`, so the
   * section fills a ±40 box). Emitting the raw metres drew a correct outline
   * roughly 0.3 units wide inside a ~160-unit canvas: present, sub-pixel, and
   * invisible next to a stress plot that was scaled properly.
   *
   * So the same two transforms every sibling applies are applied here:
   * multiply by `sc`, and negate z because SVG y grows downward.
   *
   * Solids and holes stay separate subpaths so the even-odd fill rule punches
   * a tube's bore out rather than painting over it.
   */
  function canonicalPath(g: import('../../lib/section/drawing').DrawingGeometry): string {
    const [yMin, zMin, yMax, zMax] = g.bbox;
    const width = Math.max(yMax - yMin, 1e-12);
    const height = Math.max(zMax - zMin, 1e-12);
    const sc = 80 / Math.max(width, height);
    const ring = (poly: Array<[number, number]>) =>
      poly.map(([y, z], i) => `${i === 0 ? 'M' : 'L'}${(y * sc).toFixed(3)} ${(-z * sc).toFixed(3)}`).join(' ') + ' Z';
    return [...g.solids, ...g.holes].map(ring).join(' ');
  }

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

  // The outline string is hundreds of points for a filleted profile; building
  // it inline in the template would rebuild it on every re-render — and the
  // fibre/station sliders re-render continuously while dragged, though the
  // geometry has not changed.
  const outlinePath = $derived(
    canonicalGeometry ? canonicalPath(canonicalGeometry) : resolved ? sectionPathFromResolved(resolved) : '',
  );
</script>

<!-- Cross section -->
<button class="ssp-section-toggle" onclick={() => showCrossSection = !showCrossSection}>
  <span class="ssp-chevron">{showCrossSection ? '▾' : '▸'}</span>
  {t('stress.crossSection')}
</button>
{#if showCrossSection && resolved}
  <!--
    Maximised, the figure and its own toolbar lift out to the centre of the
    screen while every other control stays in the panel. It is the same markup
    moved by CSS rather than a second copy: the drawing reads the pointer
    through `getScreenCTM`, so dragging keeps working at the new size without
    knowing anything changed, and a duplicate would be one more thing to keep
    in step.

    The wrapper does not capture pointer events, only the figure inside it
    does, so the panel behind stays usable — which is the point of leaving the
    controls there.
  -->
  <div
    class="ssp-cross-wrap"
    class:maximized
    style={maximized && overlayBox
      ? `top:${overlayBox.top}px; left:${overlayBox.left}px; width:${overlayBox.width}px; height:${overlayBox.height}px`
      : ''}
  >
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
      >{t('stress.neutralAxisAbbr')}</button>
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
    {#if stressField}
      <button
        class="ssp-svg-toggle ssp-toggle-map"
        class:active={showStressMap}
        onclick={() => showStressMap = !showStressMap}
        title={showStressMap ? t('stress.stressMapOn') : t('stress.stressMapOff')}
      >{t('stress.mapToggle')}</button>
    {/if}
    {#if torsionFlow}
      <button
        class="ssp-svg-toggle ssp-toggle-tor"
        class:active={showTorsionFlow}
        onclick={() => showTorsionFlow = !showTorsionFlow}
        title={showTorsionFlow ? t('stress.torsionFlowOn') : t('stress.torsionFlowOff')}
      >T</button>
    {/if}
    {#if canonicalGeometry}
      <button
        class="ssp-svg-toggle ssp-toggle-ecc"
        class:active={showEccentric}
        onclick={() => showEccentric = !showEccentric}
        title={showEccentric ? t('stress.eccentricOn') : t('stress.eccentricOff')}
      >CE</button>
    {/if}
    <button
      class="ssp-svg-toggle ssp-toggle-scale"
      class:active={useGlobalScale}
      onclick={() => useGlobalScale = !useGlobalScale}
      title={useGlobalScale ? t('stress.scaleGlobalOn') : t('stress.scaleGlobalOff')}
    >{useGlobalScale ? 'G' : 'L'}</button>
    <button
      class="ssp-svg-toggle ssp-toggle-max"
      class:active={maximized}
      onclick={() => maximized = !maximized}
      title={maximized ? t('stress.minimiseSection') : t('stress.maximiseSection')}
      aria-label={maximized ? t('stress.minimiseSection') : t('stress.maximiseSection')}
    >{maximized ? '⤡' : '⛶'}</button>
  </div>
  <div class="ssp-svg-container">
    <svg viewBox="-90 -90 180 180" class="ssp-cross-svg">
      <g bind:this={gEl} transform="rotate({sectionRotation})">
      <!-- ── Normal-stress map over the whole section ─────────────────
           Painted BEHIND the outline so the outline stays readable on top of
           it. The gradient is the exact field, not a rendering of samples:
           sigma is affine in (y, z), and a linear gradient is affine in the
           coordinates it spans. -->
      {#if showStressMap && stressField && canonicalGeometry && canonicalScale}
        <!-- The ramp geometry comes from `stress-map.ts`, which is where the
             section-axes → SVG sign change lives and where it is tested. It
             was inline here, and one of its two minus signs was missing: the
             map painted the compressed flange red and the tension flange blue,
             opposite to the sigma diagram drawn beside it from the same three
             numbers. -->
        {@const ramp = stressMapRamp(stressField, canonicalGeometry.bbox, canonicalScale, [...canonicalGeometry.solids, ...canonicalGeometry.holes].flat())}
        {@const dir = rampDirection(ramp)}
        <defs>
          {#if !ramp.uniform}
            <linearGradient
              id="ssp-stress-map"
              gradientUnits="userSpaceOnUse"
              x1={ramp.x1} y1={ramp.y1} x2={ramp.x2} y2={ramp.y2}
            >
              {#each mapStops(ramp.sigmaAt1, ramp.sigmaAt2, ramp.sMax) as st}
                <stop offset={st.offset} stop-color={st.color} />
              {/each}
            </linearGradient>
          {:else}
            <!-- Pure axial: one stress everywhere, so no direction to span. -->
            <linearGradient id="ssp-stress-map">
              <stop offset="0" stop-color={stressColor(ramp.sigmaAt1, ramp.sMax)} />
              <stop offset="1" stop-color={stressColor(ramp.sigmaAt1, ramp.sMax)} />
            </linearGradient>
          {/if}
        </defs>
        <path
          d={canonicalPath(canonicalGeometry)}
          fill="url(#ssp-stress-map)"
          fill-rule="evenodd"
          opacity="0.85"
        />
        <!-- Neutral axis: where the plane crosses zero. Drawn only when the
             crossing is actually inside the section, so a fully-compressed
             member does not get a line through empty space. -->
        {#if ramp.neutralInside}
          {@const cx = (canonicalGeometry.bbox[0] + canonicalGeometry.bbox[2]) / 2 * canonicalScale}
          {@const cy = -(canonicalGeometry.bbox[1] + canonicalGeometry.bbox[3]) / 2 * canonicalScale}
          {@const d0 = ramp.neutralOffset}
          {@const span = Math.hypot(ramp.x2 - ramp.x1, ramp.y2 - ramp.y1)}
          <line
            x1={cx + dir.ux * d0 - dir.uy * span / 2} y1={cy + dir.uy * d0 + dir.ux * span / 2}
            x2={cx + dir.ux * d0 + dir.uy * span / 2} y2={cy + dir.uy * d0 - dir.ux * span / 2}
            stroke="var(--st-text-2)" stroke-width={0.9 * strokeK} stroke-dasharray="4,2" opacity="0.75"
          />
          <text
            x={cx + dir.ux * d0 - dir.uy * span / 2} y={cy + dir.uy * d0 + dir.ux * span / 2 - 2}
            fill="var(--st-text-2)" font-size={4.5 * textK} opacity="0.8"
          >{t('stress.neutralAxisAbbr')}</text>
        {/if}
      {/if}

      <!-- Section outline -->
      <path
        d={outlinePath}
        fill="none"
        stroke="var(--st-value)"
        stroke-width={1.5 * strokeK}
        fill-rule="evenodd"
      />

      <!-- Central core (núcleo central) overlay -->
      {#if showCentralCore && centralCore && centralCore.vertices.length >= 3}
        {@const scNC = 80 / Math.max(resolved.h, resolved.b)}
        <!-- Unfilled over the stress map: a translucent orange wash on top of a
             red-to-blue field muddies both, and the core's own tint reads as a
             stress value that is not there. The dashed outline alone carries
             the same information without competing with the field. -->
        <polygon
          points={centralCore.vertices.map(v => `${v.ez * scNC},${-v.ey * scNC}`).join(' ')}
          fill={showStressMap ? 'none' : 'rgba(255, 140, 0, 0.15)'}
          stroke="var(--st-warn)"
          stroke-width={(showStressMap ? 1.1 : 0.8) * strokeK}
          stroke-dasharray="3,2"
        />
        <!-- NC label -->
        <text x="0" y={-centralCore.eyMax * scNC - 3} text-anchor="middle"
          fill="var(--st-warn)" font-size={6 * textK} font-weight="600" opacity="0.85">NC</text>
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
          <circle cx={clampX} cy={clampY} r="8" fill="rgba(42, 168, 105, 0.15)" stroke="var(--st-ok)" stroke-width={0.8 * strokeK} stroke-dasharray="2,1" opacity="0.9" />
        {/if}
        <!-- Crosshair marker -->
        <circle cx={clampX} cy={clampY} r="4" fill="none" stroke="var(--st-value)" stroke-width={1.5 * strokeK} opacity="0.95" />
        <line x1={clampX - 6} y1={clampY} x2={clampX + 6} y2={clampY} stroke="var(--st-value)" stroke-width={1.2 * strokeK} opacity="0.9" />
        <line x1={clampX} y1={clampY - 6} x2={clampX} y2={clampY + 6} stroke="var(--st-value)" stroke-width={1.2 * strokeK} opacity="0.9" />
        <!-- Label -->
        <text x={clampX + 8} y={clampY - 4} fill="var(--st-value)" font-size={5.5 * textK} font-weight="600" text-anchor="start">CP</text>
        {#if pressureCenter.insideCore}
          <text x={clampX + 8} y={clampY + 4} fill="var(--st-ok)" font-size={3.5 * textK} text-anchor="start">{t('stress.cpInKern')}</text>
        {/if}
        {#if isClamped}
          <text x={clampX + 8} y={clampY + (pressureCenter.insideCore ? 11 : 4)} fill="var(--st-value)" font-size={3 * textK} text-anchor="start" opacity="0.7">({t('stress.outOfView')})</text>
        {/if}
      {/if}

      {#if is3D && analysis3D}
        {@const rs = analysis3D.resolved}
        {@const sc = 80 / Math.max(rs.h, rs.b)}
        {@const sigmaN3d = rs.a > 1e-15 ? analysis3D.N / rs.a / 1000 : 0}
        <!-- When EN is active, hide individual σ(y)/σ(z)/τ diagrams and show only the composed perpNA distribution -->
        {#if showSigma && !showPerpNA}
        <!-- 3D: σ(y) distribution along the DEPTH axis (RIGHT side) — signed bars -->
        {@const xBaseR = rs.b / 2 * sc + 4}
        <!-- Moment-only σ on the depth axis — −My·y/Iy term (PR [12] biaxial) -->
        {@const sigmasMyY = analysis3D.distributionY.map(pt => rs.iy > 1e-20 ? -analysis3D.My * pt.y / rs.iy / 1000 : 0)}
        {@const maxBendingY = Math.max(...sigmasMyY.map(s => Math.abs(s)), 1e-6)}
        <!-- Use max of (moment-only max, total max) so both modes share the same visual scale -->
        {@const maxTotalY = showTotalSigma ? Math.max(...analysis3D.distributionY.map(p => Math.abs(p.sigma)), 1e-6) : maxBendingY}
        {@const scaleY = useGlobalScale && globalScales ? Math.max(globalScales.maxSigmaY, globalScales.maxSigmaZ) : Math.max(maxBendingY, maxTotalY)}
        {#if showTotalSigma}
          <!-- Total mode: σ = N/A − My·y/Iy — signed bars -->
          <!-- Baseline (σ = 0) -->
          <line x1={xBaseR} y1={-rs.h / 2 * sc} x2={xBaseR} y2={rs.h / 2 * sc}
            stroke="var(--st-text-2)" stroke-width={0.4 * strokeK} opacity="0.3" />
          <!-- N/A reference line (constant offset from axial) -->
          {#if Math.abs(sigmaN3d) > 0.01}
            {@const naDx = sigmaN3d / scaleY * 30}
            <line x1={xBaseR + naDx} y1={-rs.h / 2 * sc} x2={xBaseR + naDx} y2={rs.h / 2 * sc}
              stroke="var(--st-warn)" stroke-width={0.8 * strokeK} stroke-dasharray="2,2" opacity="0.5" />
            <text x={xBaseR + naDx} y={-rs.h / 2 * sc - 3} fill="var(--st-warn)" font-size={3.5 * textK} text-anchor="middle">N/A</text>
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
            fill="none" stroke="var(--st-text-2)" stroke-width={0.8 * strokeK} opacity="0.5" />
          <!-- Neutral axis (zero-crossing) — EN marker -->
          {@const distY = analysis3D.distributionY}
          {#each distY as pt, i}
            {#if i > 0 && distY[i - 1].sigma * pt.sigma < 0}
              {@const prev = distY[i - 1]}
              {@const yNA = prev.y + (pt.y - prev.y) * (-prev.sigma) / (pt.sigma - prev.sigma)}
              <line x1={xBaseR - 6} y1={-yNA * sc} x2={xBaseR + 6} y2={-yNA * sc}
                stroke="var(--st-value)" stroke-width={1 * strokeK} stroke-dasharray="3,2" opacity="0.8" />
              <text x={xBaseR + 8} y={-yNA * sc + 2} fill="var(--st-value)" font-size={3.5 * textK}>{t('stress.neutralAxisAbbr')}</text>
            {/if}
          {/each}
          <!-- Label with max stress values -->
          <text x={xBaseR} y={-rs.h / 2 * sc - 7} fill="var(--st-text-2)" font-size={4 * textK} text-anchor="start">σ = N/A − My·y/Iy</text>
        {:else}
          <!-- Default: solo −My·y/Iy (sin N/A) — signed bars -->
          <line x1={xBaseR} y1={-rs.h / 2 * sc} x2={xBaseR} y2={rs.h / 2 * sc}
            stroke="var(--st-text-2)" stroke-width={0.4 * strokeK} opacity="0.3" />
          {#each analysis3D.distributionY as pt, i}
            {@const yScreen = -pt.y * sc}
            {@const sMy = sigmasMyY[i]}
            {@const barW = sMy / scaleY * 30}
            <rect
              x={barW >= 0 ? xBaseR : xBaseR + barW}
              y={yScreen - 1.5} width={Math.abs(barW)} height="3"
              fill={stressColor(sMy, scaleY)} opacity="0.8"
            />
          {/each}
          <polyline
            points={analysis3D.distributionY.map((pt, i) => `${xBaseR + sigmasMyY[i] / scaleY * 30},${-pt.y * sc}`).join(' ')}
            fill="none" stroke="var(--st-text-2)" stroke-width={0.8 * strokeK} opacity="0.5" />
          <!-- N/A annotation -->
          {#if Math.abs(sigmaN3d) > 0.001}
            <text x={xBaseR} y={-rs.h / 2 * sc - 4} fill="var(--st-warn)" font-size={4.5 * textK} text-anchor="start">+ N/A = {fmt(sigmaN3d)} MPa</text>
          {/if}
        {/if}

        <!-- 3D: τ(y) Jourawski distribution along Y axis (LEFT side) -->
        {#if showShearOnDrawing}
          {@const maxTauY = useGlobalScale && globalScales ? globalScales.maxTauY : Math.max(...analysis3D.distributionY.map(p => Math.abs(p.tauVz)), 1e-6)}
          {@const xBaseL = -(rs.b / 2 * sc + 4)}
          {#if maxTauY > 0.01}
            {#each analysis3D.distributionY as pt}
              {@const yScreen = -pt.y * sc}
              {@const barW = Math.abs(pt.tauVz) / maxTauY * 35}
              {#if barW > 0.2}
                <rect
                  x={xBaseL - barW} y={yScreen - 1.5} width={barW} height="3"
                  fill="var(--st-accent)" opacity="0.5"
                />
              {/if}
            {/each}
            <!-- Profile contour polyline -->
            <polyline
              points={analysis3D.distributionY
                .map(pt => `${xBaseL - Math.abs(pt.tauVz) / maxTauY * 35},${-pt.y * sc}`)
                .join(' ')}
              fill="none" stroke="var(--st-accent)" stroke-width={1.2 * strokeK} opacity="0.8"
            />
            <!-- Baseline -->
            <line
              x1={xBaseL} y1={-rs.h / 2 * sc}
              x2={xBaseL} y2={rs.h / 2 * sc}
              stroke="var(--st-accent)" stroke-width={0.4 * strokeK} opacity="0.3"
            />
            <!-- Labels -->
            <text x={xBaseL - 2} y={-rs.h / 2 * sc - 6} fill="var(--st-accent)" font-size={5.5 * textK} text-anchor="end">τ(y)</text>
            <text x={xBaseL - 2} y={1} fill="var(--st-accent)" font-size={5 * textK} text-anchor="end">{fmt(maxTauY)} MPa</text>
          {/if}
        {/if}

        <!-- 3D: σ(z) distribution along Z axis (BOTTOM) — signed bars -->
        {@const yBaseBot = rs.h / 2 * sc + 4}
        <!-- Moment-only σ on the WIDTH axis — +Mz·z/Iz term (PR [12] biaxial) -->
        {@const sigmasMzZ = analysis3D.distributionZ.map(pt => analysis3D.Iz > 1e-20 ? analysis3D.Mz * pt.z / analysis3D.Iz / 1000 : 0)}
        {@const maxBendingZ = Math.max(...sigmasMzZ.map(s => Math.abs(s)), 1e-6)}
        {@const maxTotalZ = showTotalSigma ? Math.max(...analysis3D.distributionZ.map(p => Math.abs(p.sigma)), 1e-6) : maxBendingZ}
        {@const scaleZ = useGlobalScale && globalScales ? Math.max(globalScales.maxSigmaY, globalScales.maxSigmaZ) : Math.max(maxBendingZ, maxTotalZ)}
        {#if showTotalSigma}
          <!-- Total mode: σ = N/A + Mz·z/Iz — signed bars (+ down, − up) -->
          <!-- Baseline -->
          <line x1={-rs.b / 2 * sc} y1={yBaseBot} x2={rs.b / 2 * sc} y2={yBaseBot}
            stroke="var(--st-text-2)" stroke-width={0.4 * strokeK} opacity="0.3" />
          <!-- N/A reference line -->
          {#if Math.abs(sigmaN3d) > 0.01}
            {@const naDy = sigmaN3d / scaleZ * 25}
            <line x1={-rs.b / 2 * sc} y1={yBaseBot + naDy} x2={rs.b / 2 * sc} y2={yBaseBot + naDy}
              stroke="var(--st-warn)" stroke-width={0.8 * strokeK} stroke-dasharray="2,2" opacity="0.5" />
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
            fill="none" stroke="var(--st-text-2)" stroke-width={0.8 * strokeK} opacity="0.5" />
          <!-- Neutral axis zero-crossing -->
          {@const distZ = analysis3D.distributionZ}
          {#each distZ as pt, i}
            {#if i > 0 && distZ[i - 1].sigma * pt.sigma < 0}
              {@const prev = distZ[i - 1]}
              {@const zNA = prev.z + (pt.z - prev.z) * (-prev.sigma) / (pt.sigma - prev.sigma)}
              <line x1={zNA * sc} y1={yBaseBot - 6} x2={zNA * sc} y2={yBaseBot + 6}
                stroke="var(--st-value)" stroke-width={1 * strokeK} stroke-dasharray="3,2" opacity="0.8" />
            {/if}
          {/each}
        {:else}
          <!-- Default: solo +Mz·z/Iz (sin N/A) — signed bars -->
          <!-- Baseline -->
          <line x1={-rs.b / 2 * sc} y1={yBaseBot} x2={rs.b / 2 * sc} y2={yBaseBot}
            stroke="var(--st-text-2)" stroke-width={0.4 * strokeK} opacity="0.3" />
          {#each analysis3D.distributionZ as pt, i}
            {@const zScreen = pt.z * sc}
            {@const sMz = sigmasMzZ[i]}
            {@const barH = sMz / scaleZ * 25}
            <rect
              x={zScreen - 1.5}
              y={barH >= 0 ? yBaseBot : yBaseBot + barH}
              width="3" height={Math.abs(barH)}
              fill={stressColor(sMz, scaleZ)} opacity="0.7"
            />
          {/each}
          <!-- Profile contour polyline -->
          <polyline
            points={analysis3D.distributionZ.map((pt, i) => `${pt.z * sc},${yBaseBot + sigmasMzZ[i] / scaleZ * 25}`).join(' ')}
            fill="none" stroke="var(--st-text-2)" stroke-width={0.8 * strokeK} opacity="0.5" />
          <!-- N/A annotation -->
          {#if Math.abs(sigmaN3d) > 0.001}
            <text x={-(rs.b / 2 * sc)} y={yBaseBot + 32} fill="var(--st-warn)" font-size={4.5 * textK} text-anchor="start">+ N/A = {fmt(sigmaN3d)} MPa</text>
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
              stroke="var(--st-value)" stroke-width={2 * strokeK} opacity="0.9"
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
                stroke="var(--st-value)" stroke-width={2 * strokeK} opacity="0.9"
              />
            {/if}
          {/if}
          <text x={rs.b / 2 * sc + 2} y={-rs.h / 2 * sc - 6} fill="var(--st-value)" font-size={6 * textK} font-weight="bold" opacity="0.9">{t('stress.neutralAxisAbbr')}</text>
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
              <stop offset="0%" stop-color="var(--st-danger)" />
              <stop offset="50%" stop-color="var(--st-text-3)" />
              <stop offset="100%" stop-color="var(--st-info)" />
            </linearGradient>
          </defs>
          <!-- Sampling line (perpendicular to NA: baseline for bars) -->
          <line
            x1={firstPt.z * sc} y1={-firstPt.y * sc}
            x2={lastPt.z * sc} y2={-lastPt.y * sc}
            stroke="var(--st-text-3)" stroke-width={0.8 * strokeK} stroke-dasharray="3,2" opacity="0.6"
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
              stroke-width={2 * strokeK} opacity="0.7"
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
            fill="none" stroke="var(--st-value)" stroke-width={1.5 * strokeK} opacity="0.9"
          />
          <!-- σ_max (tension) label -->
          {#if maxTensionPt.sigma > 0.001}
            {@const tBarLen = (maxTensionPt.sigma / maxSigPerp) * barScale}
            {@const tEndX = maxTensionPt.z * sc + tBarLen * parScreenX}
            {@const tEndY = -maxTensionPt.y * sc + tBarLen * parScreenY}
            <text x={tEndX + 3} y={tEndY - 3} fill="var(--st-danger)" font-size={5 * textK} text-anchor="start">&sigma;<tspan font-size={3.5 * textK} dy="1.5">max</tspan><tspan dy="-1.5"> = +{fmt(maxTensionPt.sigma)}</tspan></text>
          {/if}
          <!-- σ_min (compression) label -->
          {#if maxComprPt.sigma < -0.001}
            {@const cBarLen = (maxComprPt.sigma / maxSigPerp) * barScale}
            {@const cEndX = maxComprPt.z * sc + cBarLen * parScreenX}
            {@const cEndY = -maxComprPt.y * sc + cBarLen * parScreenY}
            <text x={cEndX + 3} y={cEndY + 6} fill="var(--st-info)" font-size={5 * textK} text-anchor="start">&sigma;<tspan font-size={3.5 * textK} dy="1.5">min</tspan><tspan dy="-1.5"> = {fmt(maxComprPt.sigma)}</tspan></text>
          {/if}
          <text x="0" y={rs.h / 2 * sc + 46} fill="var(--st-value)" font-size={5.5 * textK} text-anchor="middle">{showTotalSigma ? 'σ total' : 'σ'} &perp; {t('stress.neutralAxisAbbr')}</text>
        {/if}

        <!-- Selected fiber point (y, z) -->
        {@const halfH3 = rs.h / 2}
        {@const halfB3 = rs.b / 2}
        {@const yF3 = -halfH3 + fiberRatioY * rs.h}
        {@const zF3 = -halfB3 + fiberRatioZ * rs.b}
        <circle
          cx={zF3 * sc} cy={-yF3 * sc}
          r="3.5" fill="var(--st-warn)" opacity="0.9"
        />
        <line
          x1={-rs.b / 2 * sc - 5} y1={-yF3 * sc}
          x2={rs.b / 2 * sc + 5} y2={-yF3 * sc}
          stroke="var(--st-warn)" stroke-width={0.8 * strokeK} stroke-dasharray="3,2" opacity="0.5"
        />
        <line
          x1={zF3 * sc} y1={-rs.h / 2 * sc - 5}
          x2={zF3 * sc} y2={rs.h / 2 * sc + 5}
          stroke="var(--st-warn)" stroke-width={0.8 * strokeK} stroke-dasharray="3,2" opacity="0.5"
        />
        <!-- Labels -->
        {#if showSigma && !showPerpNA}
          <text x={rs.b / 2 * sc + 36} y="-60" fill="var(--st-text-2)" font-size={7 * textK} text-anchor="start">&sigma;(y)</text>
          <text x="0" y={rs.h / 2 * sc + 38} fill="var(--st-text-2)" font-size={7 * textK} text-anchor="middle">&sigma;(z)</text>
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
            stroke="var(--st-text-2)" stroke-width={0.4 * strokeK} opacity="0.3" />
          <!-- N/A reference line -->
          {#if Math.abs(sigmaN2d) > 0.01}
            {@const naDx2d = sigmaN2d / scale2d * 30}
            <line x1={xBase2d + naDx2d} y1={-rs2d.h / 2 * sc2d} x2={xBase2d + naDx2d} y2={rs2d.h / 2 * sc2d}
              stroke="var(--st-warn)" stroke-width={0.8 * strokeK} stroke-dasharray="2,2" opacity="0.5" />
            <text x={xBase2d + naDx2d} y={-rs2d.h / 2 * sc2d - 3} fill="var(--st-warn)" font-size={3.5 * textK} text-anchor="middle">N/A</text>
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
            fill="none" stroke="var(--st-text-2)" stroke-width={0.8 * strokeK} opacity="0.6" />
          <!-- Neutral axis marker (where σ crosses zero) — EN -->
          {@const distArr = analysis2D.distribution}
          {#each distArr as pt, i}
            {#if i > 0 && distArr[i - 1].sigma * pt.sigma < 0}
              {@const prev = distArr[i - 1]}
              {@const yNA = prev.y + (pt.y - prev.y) * (-prev.sigma) / (pt.sigma - prev.sigma)}
              <line x1={xBase2d - 8} y1={-yNA * sc2d} x2={xBase2d + 8} y2={-yNA * sc2d}
                stroke="var(--st-value)" stroke-width={1 * strokeK} stroke-dasharray="3,2" opacity="0.8" />
              <text x={xBase2d + 10} y={-yNA * sc2d + 3} fill="var(--st-value)" font-size={4 * textK} text-anchor="start">{t('stress.neutralAxisAbbr')}</text>
            {/if}
          {/each}
          <text x={xBase2d} y={-rs2d.h / 2 * sc2d - 7} fill="var(--st-text-2)" font-size={4 * textK} text-anchor="start">σ = N/A + M·y/I</text>
        {:else}
          <!-- Default: solo M·y/I (sin N/A) — signed bars -->
          <!-- Baseline -->
          <line x1={xBase2d} y1={-rs2d.h / 2 * sc2d} x2={xBase2d} y2={rs2d.h / 2 * sc2d}
            stroke="var(--st-text-2)" stroke-width={0.4 * strokeK} opacity="0.3" />
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
            fill="none" stroke="var(--st-text-2)" stroke-width={0.8 * strokeK} opacity="0.6" />
          <text x={xBase2d} y={-rs2d.h / 2 * sc2d - 4} fill="var(--st-text-2)" font-size={4.5 * textK} text-anchor="start">M·y/I</text>
          {#if Math.abs(sigmaN2d) > 0.001}
            <text x={xBase2d} y={-rs2d.h / 2 * sc2d - 10} fill="var(--st-warn)" font-size={4.5 * textK} text-anchor="start">+ N/A = {fmt(sigmaN2d)} MPa</text>
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
                fill="rgba(229, 72, 42, 0.15)"
                stroke="none"
              />
              <polyline
                points={pts.map(p => {
                  const bx = p.z * sc + gap * pz;
                  const by = -p.y * sc - gap * py;
                  return `${bx + p.tau * tauScale * pz},${by - p.tau * tauScale * py}`;
                }).join(' ')}
                fill="none"
                stroke="var(--st-accent)"
                stroke-width={1.2 * strokeK}
              />
              <polyline
                points={pts.map(p => `${p.z * sc + gap * pz},${-p.y * sc - gap * py}`).join(' ')}
                fill="none"
                stroke="var(--st-accent)"
                stroke-width={0.4 * strokeK}
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
                points="{ax + afw * 5.5 * glyphK},{ay + afh * 5.5 * glyphK} {ax - afw * 2 * glyphK + afh * 3 * glyphK},{ay - afh * 2 * glyphK - afw * 3 * glyphK} {ax - afw * 2 * glyphK - afh * 3 * glyphK},{ay - afh * 2 * glyphK + afw * 3 * glyphK}"
                fill="var(--st-accent)"
                stroke="var(--st-surface-2)"
                stroke-width={0.5 * strokeK}
                opacity="0.95"
              />
            {/if}
          {/each}
          {@const globalMax = shearFlow.flatMap(s => s.points).reduce((best, p) => p.tau > best.tau ? p : best, { z: 0, y: 0, tau: 0 })}
          {#if globalMax.tau > 0.01}
            {@const gmSc = 80 / Math.max(rs.h, rs.b)}
            <circle cx={globalMax.z * gmSc} cy={-globalMax.y * gmSc} r={2.5 * glyphK} fill="var(--st-accent)" opacity="0.9" />
            <text
              x={globalMax.z * gmSc + (globalMax.z >= 0 ? 5 : -5)}
              y={-globalMax.y * gmSc - 4}
              fill="var(--st-accent)" font-size={6.5 * textK}
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
                fill="var(--st-accent)"
                opacity="0.55"
              />
            {/if}
          {/each}
          <!-- τ_max value label -->
          <text
            x={-(rs.b / 2 * sc + 6)}
            y={1}
            fill="var(--st-accent)" font-size={5.5 * textK} text-anchor="end"
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
              stroke="var(--st-value)"
              stroke-width={2 * strokeK}
              opacity="0.9"
            />
            <!-- EN label -->
            <text
              x={-rs2en.b / 2 * sc2en - 10}
              y={enScreenY + 3}
              fill="var(--st-value)" font-size={6 * textK} font-weight="bold" text-anchor="end"
            >{t('stress.neutralAxisAbbr')}</text>
            <!-- Show y-position when σ total shifts the NA -->
            {#if showTotalSigma && analysis2D.neutralAxisY !== null && Math.abs(enY2d) > 0.0001}
              <text
                x={rs2en.b / 2 * sc2en + 10}
                y={enScreenY + 3}
                fill="var(--st-value)" font-size={4 * textK} text-anchor="start" opacity="0.8"
              >y = {fmt(enY2d * 1000, 1)} mm</text>
            {/if}
          {:else}
            <!-- EN outside section: show arrow pointing in direction -->
            {@const arrowDir = enY2d > rs2en.yMax ? -1 : 1}
            <text
              x={-rs2en.b / 2 * sc2en - 10}
              y={arrowDir < 0 ? -rs2en.h / 2 * sc2en + 3 : rs2en.h / 2 * sc2en + 3}
              fill="var(--st-value)" font-size={5 * textK} text-anchor="end" opacity="0.7"
            >{t('stress.naOutside').replace('{arrow}', arrowDir < 0 ? '↑' : '↓')}</text>
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
            stroke="var(--st-warn)"
            stroke-width={1.5 * strokeK}
            stroke-dasharray="3,2"
          />
          {#if showSigma}
            <text x={rs2.b / 2 * sc2 + 36} y="-60" fill="var(--st-text-2)" font-size={8 * textK} text-anchor="start">&sigma;</text>
          {/if}
          {#if showShearOnDrawing}
            <text x={-(rs2.b / 2 * sc2 + 6)} y="-68" fill="var(--st-accent)" font-size={6 * textK} text-anchor="end">{isMassive ? 'τ(y) Jourawski' : t('stress.shearFlow')}</text>
          {/if}
        {/if}
      {/if}
      <!-- ── Torsional shear flow ─────────────────────────────────────
           Drawn from the same distribution the readout summarises, so the
           picture and the number cannot disagree. Each theory has its own
           shape and the drawing shows it: a closed loop for Bredt, a radius
           for a circular bar, and a through-thickness reversal for an open
           wall — which is the whole distinction, made visible. -->
      {#if showTorsionFlow && torsionFlow && resolved}
        {@const scT = 80 / Math.max(resolved.h, resolved.b)}
        {@const peak = Math.max(torsionFlow.tauMax, 1e-9)}
        {#each torsionFlow.segments as seg}
          {#if seg.closed}
            <!-- Bredt: constant around the circuit, so the line itself is the
                 diagram. Arrows say it CIRCULATES, which is the point. -->
            <polyline
              points={seg.points.map(p => `${p.z * scT},${-p.y * scT}`).join(' ')}
              fill="none" stroke="var(--st-accent)" stroke-width={1.6 * strokeK} opacity="0.85"
            />
            {#each seg.points.slice(0, -1) as p, i}
              {@const q = seg.points[i + 1]}
              {@const mx = (p.z + q.z) / 2 * scT}
              {@const my = -(p.y + q.y) / 2 * scT}
              {@const ang = Math.atan2(-(q.y - p.y), q.z - p.z) * 180 / Math.PI}
              <polygon
                points="0,-1.6 4,0 0,1.6"
                fill="var(--st-accent)" opacity="0.9"
                transform="translate({mx},{my}) rotate({ang}) scale({glyphK})"
              />
            {/each}
          {:else}
            <!-- Open wall or radius: plot tau along the segment, so the
                 reversal through the thickness is visible as a sign change. -->
            {@const amp = 26}
            <polyline
              points={seg.points.map(p => `${p.z * scT},${-p.y * scT - (p.tau / peak) * amp}`).join(' ')}
              fill="none" stroke="var(--st-accent)" stroke-width={1.2 * strokeK} opacity="0.9"
            />
            <line
              x1={seg.points[0].z * scT} y1={-seg.points[0].y * scT}
              x2={seg.points[seg.points.length - 1].z * scT} y2={-seg.points[seg.points.length - 1].y * scT}
              stroke="var(--st-text-3)" stroke-width={0.4 * strokeK} opacity="0.5"
            />
          {/if}
        {/each}
        <text
          x="0" y={-84} fill="var(--st-accent)" font-size={5 * textK}
          text-anchor="middle" opacity="0.9"
        >&tau;<tspan font-size={3.6 * textK} dy={1.2 * textK}>T</tspan></text>
      {/if}

      <!-- ── Eccentric application point ──────────────────────────────
           Last in the group, so it draws over every diagram: it is the thing
           being manipulated, and a marker hidden under a stress plot cannot be
           grabbed. -->
      {#if showEccentric && canonicalGeometry && canonicalScale}
        {@const sc = canonicalScale}
        <!-- Catch surface: clicking anywhere on the section moves the point
             there, which is a far more direct gesture than dragging a small
             marker across the drawing. Only present while the overlay is on. -->
        <rect
          x="-90" y="-90" width="180" height="180"
          fill="transparent"
          class="ssp-ecc-catch"
          role="button"
          tabindex="-1"
          aria-label={t('stress.eccentricPlace')}
          onpointerdown={startDrag}
          onpointermove={moveDrag}
          onpointerup={endDrag}
          onpointercancel={endDrag}
        />

        <!-- Centroid: the reference AXIAL force acts about. -->
        <g opacity="0.9">
          <circle cx="0" cy="0" r="2.2" fill="none" stroke="var(--st-text-2)" stroke-width={0.8 * strokeK} />
          <line x1="-3.6" y1="0" x2="3.6" y2="0" stroke="var(--st-text-2)" stroke-width={0.6 * strokeK} />
          <line x1="0" y1="-3.6" x2="0" y2="3.6" stroke="var(--st-text-2)" stroke-width={0.6 * strokeK} />
          <text x="4.5" y="-2.5" fill="var(--st-text-2)" font-size={4 * textK} text-anchor="start">G</text>
        </g>

        <!-- Shear centre: the reference SHEAR acts about. Drawn whenever it is
             a distinct point, because "these two coincide" is only true for a
             doubly-symmetric section and the drawing should say which case
             this is. -->
        {#if shearCentre && Math.hypot(shearCentre[0], shearCentre[1]) * sc > 0.5}
          {@const scx = shearCentre[0] * sc}
          {@const scy = -shearCentre[1] * sc}
          <g opacity="0.95">
            <circle cx={scx} cy={scy} r="2.6" fill="none" stroke="var(--st-accent)" stroke-width={1 * strokeK} stroke-dasharray="1.5,1" />
            <circle cx={scx} cy={scy} r="0.9" fill="var(--st-accent)" />
            <text x={scx + 4.5} y={scy + 1.5} fill="var(--st-accent)" font-size={4 * textK} text-anchor="start">CC</text>
          </g>

          <!-- The torsion arm: from the SHEAR CENTRE to where the PARALLEL
               load acts. Drawing it is the whole lesson — on a channel this
               segment is long precisely when the load looks centred. -->
          {#if eccentricPointV && hasParallelLoad}
            <line
              x1={scx} y1={scy}
              x2={eccentricPointV[0] * sc} y2={-eccentricPointV[1] * sc}
              stroke="var(--st-accent)" stroke-width={0.7 * strokeK} stroke-dasharray="2,1.5" opacity="0.7"
            />
          {/if}
        {/if}

        <!-- P⊥ — the load NORMAL to the section. Eccentric about the centroid,
             so its colour tracks the kern: inside, the section stays in one
             sign; outside, part of it goes into tension. -->
        {#if eccentricPoint}
          {@const px = eccentricPoint[0] * sc}
          {@const py = -eccentricPoint[1] * sc}
          {@const col = eccentricInsideKern ? 'var(--st-ok)' : 'var(--st-warn)'}
          <g
            class="ssp-ecc-marker"
            class:dragging={dragging && activeMarker === 'n'}
            class:inactive={hasParallelLoad && activeMarker !== 'n'}
            role="button"
            tabindex="0"
            aria-label={t('stress.eccentricPointN')}
            onpointerdown={(e) => startDrag(e, 'n')}
            onpointermove={moveDrag}
            onpointerup={endDrag}
            onpointercancel={endDrag}
            onkeydown={(e) => nudge(e, 'n')}
          >
            <circle cx={px} cy={py} r="6.5" fill={col} opacity="0.14" />
            <circle cx={px} cy={py} r="3.2" fill="none" stroke={col} stroke-width={1.4 * strokeK} />
            <circle cx={px} cy={py} r="1" fill={col} />
            <text x={px + 5.5} y={py - 4} fill={col} font-size={4.2 * textK} text-anchor="start" font-weight="600">P⊥</text>
          </g>
        {/if}

        <!-- P∥ — the load PARALLEL to the section. Drawn only when one exists,
             because an arm to a marker carrying no force means nothing. Square,
             not round: at a glance it must not be mistaken for the other. -->
        {#if eccentricPointV && hasParallelLoad}
          {@const qx = eccentricPointV[0] * sc}
          {@const qy = -eccentricPointV[1] * sc}
          <g
            class="ssp-ecc-marker"
            class:dragging={dragging && activeMarker === 'v'}
            class:inactive={activeMarker !== 'v'}
            role="button"
            tabindex="0"
            aria-label={t('stress.eccentricPointV')}
            onpointerdown={(e) => startDrag(e, 'v')}
            onpointermove={moveDrag}
            onpointerup={endDrag}
            onpointercancel={endDrag}
            onkeydown={(e) => nudge(e, 'v')}
          >
            <rect x={qx - 6} y={qy - 6} width="12" height="12" fill="var(--st-accent)" opacity="0.12" />
            <rect
              x={qx - 3} y={qy - 3} width="6" height="6"
              fill="none" stroke="var(--st-accent)" stroke-width={1.4 * strokeK}
            />
            <circle cx={qx} cy={qy} r="1" fill="var(--st-accent)" />
            <text x={qx + 5.5} y={qy + 6} fill="var(--st-accent)" font-size={4.2 * textK} text-anchor="start" font-weight="600">P∥</text>
          </g>
        {/if}
      {/if}
      </g>
    </svg>
  </div>
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
    color: var(--st-text-3);
    font-size: 0.68rem;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    cursor: pointer;
    border-bottom: 1px solid rgba(26, 74, 122, 0.3);
  }

  .ssp-section-toggle:hover {
    color: var(--st-text-2);
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
    border: 1px solid var(--st-surface-3);
    border-radius: 3px;
    background: rgba(19, 33, 45, 0.8);
    color: var(--st-text-3);
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
    color: var(--st-text-2);
    border-color: var(--st-surface-3);
  }

  .ssp-svg-toggle.active {
    color: var(--st-accent);
    border-color: var(--st-accent);
    background: rgba(229, 72, 42, 0.12);
  }

  .ssp-svg-toggle.disabled {
    opacity: 0.3;
    pointer-events: none;
    cursor: default;
  }

  .ssp-toggle-sigma.active {
    color: var(--st-value);
    border-color: var(--st-value);
    background: rgba(127, 212, 204, 0.12);
  }

  .ssp-toggle-cp.active {
    color: var(--st-value);
    border-color: var(--st-value);
    background: rgba(127, 212, 204, 0.12);
  }

  /* ── Maximised figure ─────────────────────────────────────────
     Fixed to the viewport and horizontally centred, but NOT stretched across
     it: the right panel keeps its controls and must stay reachable, so the
     figure is capped and the wrapper lets pointer events through everywhere
     except the figure itself. */
  .ssp-cross-wrap.maximized {
    /* Position and size come from the measured canvas area, inline. The panel
       and the header keep their own colours, their focus and their clicks: the
       panel holds the controls for the very figure on display, so dimming it
       would be backwards. */
    position: fixed;
    z-index: 90;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 24px;
    pointer-events: none;
    /* Enough to lift the figure off the model behind it, with no blur: the
       structure stays readable, and the section belongs to a member on it. */
    background: rgba(8, 16, 22, 0.82);
  }
  /* Give the interactive parts their events back. */
  .ssp-cross-wrap.maximized :global(.ssp-svg-toggles),
  .ssp-cross-wrap.maximized :global(.ssp-svg-container) {
    pointer-events: auto;
  }
  .ssp-cross-wrap.maximized :global(.ssp-cross-svg) {
    /* Square, sized from the height and then capped by the width of the area
       LEFT OF THE PANEL — `100%` here is the wrapper, which already stops at
       the panel edge, so a narrow canvas shrinks the figure instead of sliding
       it under the controls. */
    height: min(78vh, 100%);
    width: auto;
    max-width: 100%;
    aspect-ratio: 1;
  }
  .ssp-cross-wrap.maximized :global(.ssp-svg-container) {
    flex: 1;
    min-height: 0;
    width: 100%;
    justify-content: center;
    align-items: center;
  }
  .ssp-cross-wrap.maximized :global(.ssp-svg-toggles) {
    padding: 4px 8px;
    border-radius: 6px;
    background: rgba(12, 22, 32, 0.9);
    border: 1px solid rgba(26, 74, 122, 0.5);
  }

  .ssp-toggle-max { font-size: 0.62rem; }
  .ssp-toggle-max.active {
    color: var(--st-value);
    border-color: var(--st-value);
    background: rgba(127, 212, 204, 0.12);
  }

  .ssp-toggle-map.active {
    color: var(--st-value);
    border-color: var(--st-value);
    background: rgba(127, 212, 204, 0.12);
  }

  .ssp-toggle-tor.active {
    color: var(--st-accent);
    border-color: var(--st-accent);
    background: rgba(127, 212, 204, 0.1);
  }

  .ssp-toggle-ecc.active {
    color: var(--st-warn);
    border-color: var(--st-warn);
    background: rgba(255, 140, 0, 0.12);
  }

  /* Click-to-place over the whole drawing, so the point can be set without
     first hitting a 3-unit marker. */
  .ssp-ecc-catch { cursor: crosshair; }
  .ssp-ecc-marker { cursor: grab; }
  /* The marker a background click will NOT move, dimmed so the rule is visible
     rather than merely sensible. */
  .ssp-ecc-marker.inactive { opacity: 0.45; }
  .ssp-ecc-marker.dragging { cursor: grabbing; }
  .ssp-ecc-marker:focus-visible { outline: none; }
  .ssp-ecc-marker:focus-visible circle:nth-of-type(2) {
    stroke-width: 2;
    stroke-dasharray: 2, 1;
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
    color: var(--st-warn);
    border-color: var(--st-warn);
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
    color: var(--st-text-2);
    min-width: 42px;
  }

  .ssp-range {
    flex: 1;
    height: 4px;
    -webkit-appearance: none;
    appearance: none;
    background: var(--st-surface-3);
    border-radius: 2px;
    outline: none;
  }

  .ssp-range::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: var(--st-warn);
    cursor: pointer;
    border: none;
  }

  .ssp-range::-moz-range-thumb {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: var(--st-warn);
    cursor: pointer;
    border: none;
  }

  .ssp-range-z::-webkit-slider-thumb {
    background: var(--st-warn);
  }

  .ssp-fiber-val {
    font-size: 0.65rem;
    color: var(--st-text-2);
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
    background: rgba(127, 212, 204, 0.12);
    color: var(--st-value);
    font-size: 0.5rem;
    font-weight: 700;
    cursor: help;
    flex-shrink: 0;
    border: 1px solid rgba(127, 212, 204, 0.25);
    opacity: 0.6;
    transition: opacity 0.15s;
    font-style: normal;
    line-height: 1;
    vertical-align: middle;
  }

  .ssp-help:hover {
    opacity: 1;
    background: rgba(127, 212, 204, 0.25);
  }
</style>
