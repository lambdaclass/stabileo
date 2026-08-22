<script lang="ts">
  import { uiStore, resultsStore, modelStore } from '../../lib/store';
  import { activeQuantity, activeRepresentation, representationsFor, showQuantityAs, activeMapMeasure, showStressMap, hasLiveColourScale, type MapMeasure } from '../../lib/store/result-view';
  import { showDiagram } from '../../lib/store/view-mode';
  import ResultsTable from '../tables/ResultsTable.svelte';
  import { t } from '../../lib/i18n';
  import { hasInvalid2DDisplacements, hasInvalid3DDisplacements } from '../../lib/geometry/coordinate-system';
  import { runSolve } from '../../lib/actions/solve';

  // ─── Educational Tooltips (subset used by Results) ─────────────
  const HELP_TEXTS: Record<string, { title: string; desc: string }> = {
    'solve':          { title: 'tooltip.solve.title', desc: 'tooltip.solve.desc' },
    'diag-none':      { title: 'tooltip.diagNone.title', desc: 'tooltip.diagNone.desc' },
    'diag-deformed':  { title: 'tooltip.diagDeformed.title', desc: 'tooltip.diagDeformed.desc' },
    'diag-moment':    { title: 'tooltip.diagMoment.title', desc: 'tooltip.diagMoment.desc' },
    'diag-shear':     { title: 'tooltip.diagShear.title', desc: 'tooltip.diagShear.desc' },
    'diag-axial':     { title: 'tooltip.diagAxial.title', desc: 'tooltip.diagAxial.desc' },
    'diag-axialColor':{ title: 'tooltip.diagAxialColor.title', desc: 'tooltip.diagAxialColor.desc' },
    'diag-colorMap':  { title: 'tooltip.diagColorMap.title', desc: 'tooltip.diagColorMap.desc' },
  };

  function tooltip(node: HTMLElement, key: string) {
    let el: HTMLDivElement | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;

    function show() {
      if (!uiStore.showTooltips) return;
      const info = HELP_TEXTS[key];
      if (!info) return;
      timer = setTimeout(() => {
        el = document.createElement('div');
        el.className = 'edu-tooltip';
        el.innerHTML = `<strong>${t(info.title)}</strong><br/><span>${t(info.desc)}</span>`;
        document.body.appendChild(el);
        // Position to the right of the element
        const rect = node.getBoundingClientRect();
        el.style.top = `${rect.top + window.scrollY}px`;
        el.style.left = `${rect.right + 8}px`;
        // If going off screen right, put on left
        requestAnimationFrame(() => {
          if (!el) return;
          const tr = el.getBoundingClientRect();
          if (tr.right > window.innerWidth - 10) {
            el.style.left = `${rect.left - tr.width - 8}px`;
          }
          if (tr.bottom > window.innerHeight - 10) {
            el.style.top = `${window.innerHeight - tr.height - 10}px`;
          }
        });
      }, 600);
    }

    function hide() {
      if (timer) { clearTimeout(timer); timer = null; }
      if (el) { el.remove(); el = null; }
    }

    node.addEventListener('mouseenter', show);
    node.addEventListener('mouseleave', hide);

    return {
      destroy() {
        hide();
        node.removeEventListener('mouseenter', show);
        node.removeEventListener('mouseleave', hide);
      }
    };
  }

  // ─── Derived ───────────────────────────────────────────────────

  // Pulse the Solve button when model is ready but not yet solved
  const modelReady = $derived(
    modelStore.nodes.size > 0 &&
    modelStore.elements.size > 0 &&
    modelStore.supports.size > 0 &&
    modelStore.model.loads.length > 0 &&
    !resultsStore.results
  );

  // ─── State ─────────────────────────────────────────────────────
  let showResultsPanel = $state(true);
  let showResultsViewSub = $state(false);
  /** The results table, folded away by default: it is long and this is a strip. */
  let showResultsTable = $state(false);

  // ─── Handlers ──────────────────────────────────────────────────
  const handleSolve = () => runSolve();


  /**
   * Hide the diagram buttons when the ribbon is already showing them.
   *
   * In Basic the ribbon owns diagram selection, so repeating the grid here gave
   * two controls for one piece of state — and they disagreed, because this list
   * is mode-aware and the ribbon's was not. The panel keeps what the ribbon has
   * no room for: the scale, the animation and the view options.
   */
  let { hideDiagrams = false, flat = false }: { hideDiagrams?: boolean; flat?: boolean } = $props();

  /**
   * Whether any member's material LACKS a yield strength.
   *
   * Utilisation divides by fy, so those members stay unpainted — and in a
   * mixed steel/concrete model that is most of the picture, not an edge case.
   * Asked of the model rather than inferred from the painting: "some members
   * are missing" has two causes and only one of them is worth telling the
   * user about.
   */
  /** Whether the model contains anything a shell measure could describe. */
  function hasShells(): boolean {
    return modelStore.model.plates.size > 0 || modelStore.model.quads.size > 0;
  }

  function anyMemberLacksYield(): boolean {
    for (const el of modelStore.elements.values()) {
      const m = modelStore.materials.get(el.materialId);
      if (!m?.fy) return true;
    }
    return false;
  }
</script>

<!--
  The solve button belongs to the ribbon now. Keeping a second one here meant a
  panel opened BY solving still offered to solve, and the two would have needed
  to agree about 3D, readiness and disabled state forever.
-->
{#if !flat}
<div class="toolbar-section">
  {#if !flat}<h3>{t('results.solve')}</h3>{/if}
  <button class="solve-btn" data-tour="calcular-btn" class:ready={modelReady} onclick={handleSolve} use:tooltip={'solve'} title={uiStore.analysisMode === '3d' ? t('results.analysis3dTooltip') : ''}>
    {uiStore.analysisMode === '3d' ? t('results.solve3d') : t('results.solve')}
  </button>
</div>
{/if}

<div class="toolbar-section" data-tour="results-section">
  <!--
    The header is a real toggle only where it toggles something. In the right
    panel the body below renders regardless (`|| flat`), so this was a chevron
    that changed direction and did nothing else — the panel already carries the
    heading "RESULTS" two lines above it.
  -->
  {#if !flat}
    <button class="section-toggle" onclick={() => showResultsPanel = !showResultsPanel}>
      {showResultsPanel ? '▾' : '▸'} {t('results.results')}
    </button>
  {/if}
  {#if showResultsPanel || flat}
    {#if resultsStore.results || resultsStore.results3D || resultsStore.influenceLine}
      {#if !hideDiagrams}
      <div class="diagram-grid">
        <button class="diagram-btn" class:active={resultsStore.diagramType === 'none'} onclick={() => showDiagram('none')} title={t('results.noDiagramTooltip')} use:tooltip={'diag-none'}>{t('results.none')}</button>
        <button class="diagram-btn" class:active={resultsStore.diagramType === 'deformed'} onclick={() => showDiagram('deformed')} title={t('results.deformedTooltip')} use:tooltip={'diag-deformed'}>{t('results.deformed')}</button>
        {#if uiStore.analysisMode !== '3d'}
          <button class="diagram-btn" class:active={resultsStore.diagramType === 'moment'} onclick={() => showDiagram('moment')} title={t('results.momentTooltip')} use:tooltip={'diag-moment'}>{t('results.moment')}</button>
          <button class="diagram-btn" class:active={resultsStore.diagramType === 'shear'} onclick={() => showDiagram('shear')} title={t('results.shearTooltip')} use:tooltip={'diag-shear'}>{t('results.shear')}</button>
          <button class="diagram-btn" class:active={resultsStore.diagramType === 'axial'} onclick={() => showDiagram('axial')} title={t('results.axialTooltip')} use:tooltip={'diag-axial'}>{t('results.axial')}</button>
          <button class="diagram-btn" class:active={resultsStore.diagramType === 'axialColor'} onclick={() => showDiagram('axialColor')} title={t('results.axialColorTooltip')} use:tooltip={'diag-axialColor'}>{t('results.axialColors')}</button>
        {:else}
          <button class="diagram-btn" class:active={resultsStore.diagramType === 'shearZ'} onclick={() => showDiagram('shearZ')} title={t('results.shearZTooltip')}>{t('results.shearZ')}</button>
          <button class="diagram-btn" class:active={resultsStore.diagramType === 'momentY'} onclick={() => showDiagram('momentY')} title={t('results.momentYTooltip')}>{t('results.momentY')}</button>
          <button class="diagram-btn" class:active={resultsStore.diagramType === 'shearY'} onclick={() => showDiagram('shearY')} title={t('results.shearYTooltip')}>{t('results.shearY')}</button>
          <button class="diagram-btn" class:active={resultsStore.diagramType === 'momentZ'} onclick={() => showDiagram('momentZ')} title={t('results.momentZTooltip')}>{t('results.momentZ')}</button>
          <button class="diagram-btn" class:active={resultsStore.diagramType === 'axial'} onclick={() => showDiagram('axial')} title={t('results.axialNTooltip')}>{t('results.axial')}</button>
          <button class="diagram-btn" class:active={resultsStore.diagramType === 'torsion'} onclick={() => showDiagram('torsion')} title={t('results.torsionTooltip')}>{t('results.torsion')}</button>
          <button class="diagram-btn" class:active={resultsStore.diagramType === 'axialColor'} onclick={() => showDiagram('axialColor')} title={t('results.axialColor3dTooltip')}>{t('results.axialColors')}</button>
          <button class="diagram-btn" class:active={resultsStore.diagramType === 'colorMap'} onclick={() => showDiagram('colorMap')} title={t('results.colorMapTooltip')}>{t('results.colorMap')}</button>
        {/if}
      </div>
      {/if}
      {#if resultsStore.diagramType === 'deformed'}
        <div class="input-group">
          <label>{t('results.diagramScale')}:</label>
          <button class="scale-step-btn" onclick={() => resultsStore.deformedScale = Math.max(1, resultsStore.deformedScale - (resultsStore.deformedScale <= 10 ? 1 : resultsStore.deformedScale <= 100 ? 5 : 50))} title={t('results.decreaseScale')}>◀</button>
          <input type="range" min="1" max="1000" step="1" bind:value={resultsStore.deformedScale} style="width: 80px" />
          <button class="scale-step-btn" onclick={() => resultsStore.deformedScale = Math.min(1000, resultsStore.deformedScale + (resultsStore.deformedScale < 10 ? 1 : resultsStore.deformedScale < 100 ? 5 : 50))} title={t('results.increaseScale')}>▶</button>
          <span style="font-size: 0.7rem; color: #888">{Math.round(resultsStore.deformedScale)}×</span>
        </div>
      {:else if resultsStore.diagramType !== 'none' && resultsStore.diagramType !== 'colorMap' && resultsStore.diagramType !== 'axialColor'}
        <div class="input-group">
          <label>{t('results.diagramScale')}:</label>
          <button class="scale-step-btn" onclick={() => resultsStore.diagramScale = Math.max(0.1, +(resultsStore.diagramScale - 0.1).toFixed(1))} title={t('results.decreaseScale')}>◀</button>
          <input type="range" min="0.1" max="5" step="0.1" bind:value={resultsStore.diagramScale} style="width: 80px" />
          <button class="scale-step-btn" onclick={() => resultsStore.diagramScale = Math.min(5, +(resultsStore.diagramScale + 0.1).toFixed(1))} title={t('results.increaseScale')}>▶</button>
          <span style="font-size: 0.7rem; color: #888">{resultsStore.diagramScale.toFixed(1)}x</span>
        </div>
      {/if}
      {#if resultsStore.diagramType === 'deformed'}
        <label class="checkbox-item">
          <input type="checkbox" bind:checked={resultsStore.animateDeformed} />
          <span>{t('results.animate')}</span>
        </label>
        {#if resultsStore.animateDeformed}
          <div class="input-group">
            <label>{t('results.speed')}:</label>
            <input type="range" min="0.25" max="3" step="0.25" bind:value={resultsStore.animSpeed} style="width: 80px" />
            <span style="font-size: 0.7rem; color: #888">{resultsStore.animSpeed.toFixed(2)}x</span>
          </div>
        {/if}
      {/if}
      {#if resultsStore.diagramType === 'influenceLine' && resultsStore.influenceLine}
        <label class="checkbox-item">
          <input type="checkbox" bind:checked={resultsStore.ilAnimating} />
          <span>{t('results.animateLoad')}</span>
        </label>
        {#if resultsStore.ilAnimating}
          <div class="input-group">
            <label>{t('results.speed')}:</label>
            <input type="range" min="0.25" max="3" step="0.25" bind:value={resultsStore.ilAnimSpeed} style="width: 80px" />
            <span style="font-size: 0.7rem; color: #888">{resultsStore.ilAnimSpeed.toFixed(2)}x</span>
          </div>
        {/if}
      {/if}
      <!--
        The DERIVED measures only.
        
        This used to list the internal forces too, which is now where the
        contradiction would be: the quantity is chosen in the ribbon and its
        representation right below, so a second control offering "moment" while
        the ribbon says Vz would be two answers to one question. Resistance and
        Von Mises are not internal forces — they are computed FROM all of them,
        carry their own scale, and belong to no single ribbon command, so this
        is the only place they can be picked.
      -->
      <!--
        Which stress the map is painting.
        
        Four measures out of one section-stress evaluation. Utilisation is the
        default because it is the only one that means something on its own —
        1.00 is the limit, whatever the steel and whatever the section. The
        other three are absolute stresses, and an absolute stress says nothing
        until you know what it is being compared against.

        The select stays mounted for the SHELL contours too: they are offered
        inside it, so gating it on the stress measures alone made choosing one
        unmount the very control that was used — and left no ribbon command
        lit over a map that was plainly on screen.
      -->
      {#if activeMapMeasure()}
        {@const measure = activeMapMeasure()!}
        <div class="input-group">
          <label>{t('results.stressMeasure')}:</label>
          <select value={measure} onchange={(e) => showStressMap(e.currentTarget.value as MapMeasure)}>
            <option value="stressRatio">{t('results.measureUtilisation')}</option>
            <option value="vonMises">{t('results.measureVonMises')}</option>
            <option value="sigmaMax">{t('results.measureSigmaMax')}</option>
            <option value="tauMax">{t('results.measureTauMax')}</option>
            <!--
              Offered by the MODEL, not by the mode. It was gated on 3D alone,
              so Basic — which has no way to create a plate or a quad — listed
              a shell measure in every 3D model and painted nothing when it was
              chosen. A measure for elements the model does not contain is not
              a disabled option, it is a wrong one.
            -->
            {#if hasShells()}
              <option value="shellVonMises">{t('results.shellVonMises')}</option>
            {/if}
          </select>
        </div>
        <!--
          Utilisation divides by fy, so a member whose material has no yield
          strength — every concrete member, or any material with fy left blank —
          stays unpainted. Left alone the gap simply read as "no stress there",
          and gating the warning on NO member having fy hid it in exactly the
          mixed steel/concrete models where it matters most.
        -->
        {#if measure === 'stressRatio' && anyMemberLacksYield()}
          <p class="rep-help rep-warn">{t('results.noYield')}</p>
        {/if}
        {#if measure !== 'shellVonMises' && measure !== 'shellBending'}
          <p class="rep-help">
            {measure === 'stressRatio' ? t('results.measureUtilisationHelp')
              : measure === 'vonMises' ? t('results.measureVonMisesHelp')
              : measure === 'sigmaMax' ? t('results.measureSigmaMaxHelp')
              : t('results.measureTauMaxHelp')}
          </p>
        {/if}
      {/if}
        <!--
          How the axial result is DRAWN, next to the result itself.
          ──────────────────────────────────────────────────────────
          Axial has two presentations: the diagram plotted along each member,
          and the members themselves coloured by sign — red in tension, blue in
          compression — which for a truss is the reading most engineers want
          first. They used to be two separate entries in a diagram grid, so the
          ribbon, which lists QUANTITIES, had nowhere to put the second one and
          it became unreachable.

          It is not a quantity, it is a way of showing one, so it belongs here
          beside the scale rather than up in the ribbon. Only axial has it, so
          it only appears for axial.
        -->
        <!--
          Every quantity, not only axial.
          
          This offered Diagram / Member colour for axial alone, because member
          colour existed for axial alone. A colour map is available for all of
          them — it is a magnitude painted along the member — so the control is
          now per-quantity and lists whatever that quantity supports. Member
          colour stays axial-only on purpose: it is red/blue by SIGN, and a
          moment's sign is a convention about which fibre is in tension, not
          something a reader should decode from a colour.
        -->
        {@const shownQuantity = activeQuantity()}
        {#if shownQuantity}
          {@const how = activeRepresentation()}
          <div class="input-group">
            <label>{t('results.shownAs')}:</label>
            <div class="seg" role="group" aria-label={t('results.shownAs')}>
              {#each representationsFor(shownQuantity) as rep}
                <button
                  class="seg-btn"
                  class:on={how === rep}
                  onclick={() => showQuantityAs(shownQuantity, rep)}
                  data-testid={rep === 'diagram' ? 'shown-as-diagram'
                    : rep === 'memberColour' ? 'shown-as-colour' : 'shown-as-map'}
                >{rep === 'diagram' ? t('results.asDiagram')
                  : rep === 'memberColour' ? t('results.asMemberColour')
                  : t('results.asColourMap')}</button>
              {/each}
            </div>
          </div>
          <!--
            What the chosen representation actually shows.
            
            OUTSIDE the input-group, which lays its children out in a row: put
            inside, the sentence competed with the buttons for the panel's
            width and squeezed two of the three out of sight.
            
            The pair that needs explaining is axial. Member colour and a colour
            map look alike and answer different questions — one is SIGN, the
            other MAGNITUDE — so the same member can be red in one and blue in
            the other with both being right. A line of text costs less than a
            reader reaching that conclusion the hard way.
          -->
          <p class="rep-help">
            {how === 'diagram' ? t('results.repDiagramHelp')
              : how === 'memberColour' ? t('results.repMemberColourHelp')
              : t('results.repColourMapHelp')}
          </p>
        {/if}
      <!--
        The scale is only worth a switch when there is one on screen, so the
        control appears with it rather than sitting greyed out the rest of the
        time.
      -->
      {#if hasLiveColourScale()}
        <label class="checkbox-item">
          <input type="checkbox" bind:checked={uiStore.showColourScale} />
          {t('results.showScale')}
        </label>
      {/if}
      <!--
        Shown whenever a RESULT is on screen, whatever way it is drawn.
        
        This was a list of ten diagram names, and a list is a thing you forget
        to add to: `colorMap` was missing, so choosing a colour map emptied the
        panel — the load-case selector and the results table vanished together,
        as if the model had stopped being solved. Asking whether a quantity is
        being shown cannot go out of date when a representation is added.
      -->
      <!--
        The heading only appears with something under it.
        ──────────────────────────────────────────────────────────
        Both selectors can be switched off in Settings, and when they were the
        section still drew "Change results view" over an empty box — a heading
        for nothing, which reads as a panel that failed to load rather than as
        a setting the reader chose. What the section shows is now part of
        whether it is shown at all.

        The secondary carries its own conditions because it overlays a second
        DIAGRAM: there is nothing to overlay on a deformed shape or on members
        painted by value, so it is absent there whatever the setting says. It
        also depends on the primary, which is how the markup nests it and how
        Settings presents it — the checkbox is disabled while the primary is
        off, but the stored value survives, so the dependency has to be stated
        here too rather than assumed from the UI.
      -->
      {@const showsPrimary = uiStore.showPrimarySelector}
      {@const showsSecondary = showsPrimary
        && uiStore.showSecondarySelector
        && resultsStore.diagramType !== 'deformed'
        && activeRepresentation() === 'diagram'}
      {#if resultsStore.hasCombinations && (showsPrimary || showsSecondary)
        && (activeQuantity() !== null || resultsStore.diagramType === 'deformed')}
        {@const is3D = uiStore.analysisMode === '3d'}
        {@const caseKeys = is3D ? [...resultsStore.perCase3D.keys()] : [...resultsStore.perCase.keys()]}
        {@const comboKeys = is3D ? [...resultsStore.perCombo3D.keys()] : [...resultsStore.perCombo.keys()]}
        {@const hasEnvelope = is3D ? resultsStore.fullEnvelope3D !== null : resultsStore.fullEnvelope !== null}
        <!-- Open in the panel: no accordions there. -->
        {#if !flat}
          <button class="sub-toggle" onclick={() => showResultsViewSub = !showResultsViewSub}>
            {showResultsViewSub ? '▾' : '▸'} {t('results.changeResultsView')}
          </button>
        {:else}
          <span class="sub-heading">{t('results.changeResultsView')}</span>
        {/if}
        {#if showResultsViewSub || flat}
          <div class="sub-content">
            {#if showsPrimary}
              <div class="input-group">
                <!--
                  No visible label: every option names itself ("Simple loads",
                  a case, a combination), so the word in front of them spent a
                  third of a narrow panel's width restating the obvious. The
                  accessible name stays for anyone who cannot see that.
                -->
                <select
                  aria-label={t('results.primary')}
                  value={resultsStore.activeView === 'envelope' ? 'envelope'
                             : resultsStore.activeCaseId !== null ? `case_${resultsStore.activeCaseId}`
                             : resultsStore.activeView === 'combo' ? `combo_${resultsStore.activeComboId ?? ''}`
                             : 'single'}
                  onchange={(e) => {
                    const val = (e.target as HTMLSelectElement).value;
                    const clearOverlay = () => { if (is3D) resultsStore.setOverlay3D(null); else resultsStore.setOverlay(null); };
                    if (val === 'single') {
                      resultsStore.activeCaseId = null;
                      resultsStore.activeView = 'single';
                      clearOverlay();
                    } else if (val === 'envelope') {
                      resultsStore.activeCaseId = null;
                      resultsStore.activeView = 'envelope';
                      clearOverlay();
                    } else if (val.startsWith('case_')) {
                      resultsStore.activeCaseId = Number(val.replace('case_', ''));
                      clearOverlay();
                    } else if (val.startsWith('combo_')) {
                      resultsStore.activeCaseId = null;
                      resultsStore.activeView = 'combo';
                      resultsStore.activeComboId = Number(val.replace('combo_', ''));
                    }
                  }}>
                  <option value="single">{t('results.simpleLoads')}</option>
                  {#each caseKeys as caseId}
                    {@const lc = modelStore.model.loadCases.find(c => c.id === caseId)}
                    <option value={`case_${caseId}`}>{lc?.name ?? `${t('results.caseFallback')} ${caseId}`}</option>
                  {/each}
                  {#each comboKeys as comboId}
                    {@const combo = modelStore.model.combinations.find(c => c.id === comboId)}
                    <option value={`combo_${comboId}`}>{combo?.name ?? `${t('results.comboFallback')} ${comboId}`}</option>
                  {/each}
                  <option value="envelope">{t('results.envelope')}</option>
                </select>
              </div>
              <!--
                Comparison overlays a second DIAGRAM on the first. There is
                nothing to overlay when the result is painted onto the members
                themselves: two colours on one bar is one colour.
              -->
              {#if showsSecondary}
                <div class="input-group">
                  <label>{t('results.compare')}:</label>
                  <select onchange={(e) => {
                    const val = (e.target as HTMLSelectElement).value;
                    if (val === 'none') {
                      if (is3D) resultsStore.setOverlay3D(null);
                      else resultsStore.setOverlay(null);
                    } else if (val === 'single') {
                      if (is3D) resultsStore.setOverlay3D(resultsStore.singleResults3D, t('results.simpleLoads'));
                      else resultsStore.setOverlay(resultsStore.singleResults, t('results.simpleLoads'));
                    } else if (val === 'envelope') {
                      if (is3D) resultsStore.setOverlay3D(resultsStore.fullEnvelope3D?.maxAbsResults3D ?? null, t('results.envelope'));
                      else resultsStore.setOverlay(resultsStore.fullEnvelope?.maxAbsResults ?? null, t('results.envelope'));
                    } else if (val.startsWith('case_')) {
                      const id = Number(val.replace('case_', ''));
                      const lc = modelStore.model.loadCases.find(c => c.id === id);
                      const label = lc?.name ?? `${t('results.caseFallback')} ${id}`;
                      if (is3D) {
                        const r3d = resultsStore.perCase3D.get(id);
                        if (r3d) resultsStore.setOverlay3D(r3d, label);
                      } else {
                        const r = resultsStore.perCase.get(id);
                        if (r) resultsStore.setOverlay(r, label);
                      }
                    } else if (val.startsWith('combo_')) {
                      const id = Number(val.replace('combo_', ''));
                      const combo = modelStore.model.combinations.find(c => c.id === id);
                      const label = combo?.name ?? `${t('results.comboFallback')} ${id}`;
                      if (is3D) {
                        const r3d = resultsStore.perCombo3D.get(id);
                        if (r3d) resultsStore.setOverlay3D(r3d, label);
                      } else {
                        const r = resultsStore.perCombo.get(id);
                        if (r) resultsStore.setOverlay(r, label);
                      }
                    }
                  }}>
                    <option value="none">{t('results.noComparison')}</option>
                    <option value="single">{t('results.simpleLoads')}</option>
                    {#each caseKeys as caseId}
                      {@const lc = modelStore.model.loadCases.find(c => c.id === caseId)}
                      <option value={`case_${caseId}`}>{lc?.name ?? `${t('results.caseFallback')} ${caseId}`}</option>
                    {/each}
                    {#each comboKeys as comboId}
                      {@const combo = modelStore.model.combinations.find(c => c.id === comboId)}
                      <option value={`combo_${comboId}`}>{combo?.name ?? `${t('results.comboFallback')} ${comboId}`}</option>
                    {/each}
                    {#if hasEnvelope}
                      <option value="envelope">{t('results.envelope')}</option>
                    {/if}
                  </select>
                </div>
              {/if}
            {/if}

            <!--
              The results TABLE, where the controls that choose a result are.
              
              It used to be a tab in the model-data panel, beside nodes and
              loads — which put "what the structure is" and "what it did" in one
              place and let the ribbon light a drawing tool and a diagram at
              once. A result is not part of the model; it is the answer to it.
            -->
          </div>
        {/if}

        <!--
          A SIBLING of "change results view", not a child of it.
          
          It was nested inside, which said the table was a way of changing what
          you are looking at. It is not — it is the numbers behind whatever is
          already on screen. Same level, same weight, and the reader can tell
          the two apart.
        -->
        <!-- Same treatment as its sibling above: a heading in the panel, a
             toggle in the compact bar. Matching form is what makes them read
             as the same level rather than one nested in the other. -->
        {#if !flat}
          <button class="sub-toggle" onclick={() => showResultsTable = !showResultsTable}>
            {showResultsTable ? '▾' : '▸'} {t('data.results')}
          </button>
        {:else}
          <span class="sub-heading">{t('data.results')}</span>
        {/if}
        {#if showResultsTable || flat}
          <div class="sub-content">
            <div class="results-table-wrap">
              <ResultsTable />
            </div>
          </div>
        {/if}
      {/if}

    {:else}
      <p class="no-results-msg">{t('results.noResultsMsg')}</p>
    {/if}
  {/if}
</div>

<style>
  .rep-warn { color: var(--st-warn); }

  .rep-help {
    margin: 3px 0 0;
    font-size: 0.66rem;
    line-height: 1.4;
    color: var(--st-text-3);
    max-width: 300px;
  }

  .results-table-block { margin-top: 6px; }
  /* The table brings its own scroll: the toolbar is a strip and a hundred rows
     of member forces must not stretch it. */
  .results-table-wrap {
    max-height: 320px;
    overflow: auto;
    margin-top: 4px;
    border-radius: var(--st-radius, 3px);
    border: 1px solid var(--st-border);
  }

  .toolbar-section {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .toolbar-section h3 {
    font-size: 0.75rem;
    text-transform: uppercase;
    color: var(--st-text-3);
    letter-spacing: 0.05em;
  }

  .checkbox-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.875rem;
    cursor: pointer;
  }

  .input-group {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.875rem;
  }

  .input-group input {
    width: 70px;
    padding: 0.25rem;
    background: var(--st-surface-2);
    border: 1px solid var(--st-hair-strong);
    border-radius: 4px;
    color: var(--st-text);
  }

  .input-group input[type="range"] {
    -webkit-appearance: auto;
    appearance: auto;
    accent-color: var(--st-accent);
    background: transparent;
    border: none;
  }

  .input-group select {
    padding: 0.25rem;
    background: var(--st-surface-2);
    border: 1px solid var(--st-hair-strong);
    border-radius: 4px;
    color: var(--st-text);
  }

  .diagram-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 0.2rem;
  }

  .diagram-btn {
    padding: 0.3rem 0.25rem;
    background: var(--st-surface-2);
    border: 1px solid var(--st-hair-strong);
    border-radius: 4px;
    color: var(--st-text);
    cursor: pointer;
    font-size: 0.75rem;
    font-weight: 600;
    text-align: center;
    transition: all 0.2s;
  }

  .diagram-btn:hover {
    background: var(--st-surface-3);
    color: white;
  }

  .diagram-btn.active {
    background: var(--st-accent);
    border-color: var(--st-danger);
    color: white;
  }

  .no-results-msg {
    font-size: 0.72rem;
    color: var(--st-text-3);
    font-style: italic;
    padding: 0.4rem 0.2rem;
    margin: 0;
    line-height: 1.4;
  }

  .scale-step-btn {
    padding: 1px 4px;
    border: 1px solid var(--st-hair);
    border-radius: 3px;
    background: transparent;
    color: var(--st-text-3);
    font-size: 0.55rem;
    cursor: pointer;
    line-height: 1;
    transition: all 0.12s;
  }
  .scale-step-btn:hover {
    background: var(--st-surface-3);
    color: var(--st-value);
    border-color: var(--st-interactive);
  }

  .solve-btn {
    width: 100%;
    padding: 0.5rem 0.5rem;
    background: var(--st-accent);
    border: 1px solid var(--st-danger);
    border-radius: 4px;
    color: white;
    cursor: pointer;
    font-size: 0.8rem;
    font-weight: 600;
    text-align: center;
    transition: all 0.2s;
  }

  .solve-btn:hover:not(:disabled) {
    background: var(--st-danger);
  }

  .solve-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .solve-btn.ready {
    animation: gentle-pulse 3s ease-in-out infinite;
  }

  @keyframes gentle-pulse {
    0%, 100% {
      box-shadow: 0 0 0 0 rgba(233, 69, 96, 0);
    }
    50% {
      box-shadow: 0 0 8px 2px rgba(233, 69, 96, 0.4);
    }
  }

  /* A two-state choice reads as one control, not two buttons. */
  .seg {
    display: inline-flex;
    border: 1px solid var(--st-hair);
    border-radius: var(--st-radius);
    overflow: hidden;
  }

  .seg-btn {
    background: none;
    border: none;
    color: var(--st-text-2);
    font-family: var(--st-sans);
    font-size: 0.72rem;
    padding: 0.22rem 0.5rem;
    cursor: pointer;
    white-space: nowrap;
    transition: background 0.12s, color 0.12s;
  }

  .seg-btn + .seg-btn { border-left: 1px solid var(--st-hair); }
  .seg-btn:hover { background: var(--st-surface-3); color: var(--st-text); }
  .seg-btn.on { background: var(--st-selected-bg); color: var(--st-accent); }

  .sub-heading {
    display: block;
    font-family: var(--st-mono);
    font-size: 0.66rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--st-text-3);
    padding: 0.4rem 0 0.25rem;
  }

  .section-toggle {
    width: 100%;
    padding: 0.4rem 0.5rem;
    background: none;
    border: 1px solid var(--st-hair);
    border-radius: 4px;
    color: var(--st-text-2);
    cursor: pointer;
    font-size: 0.75rem;
    font-weight: 600;
    text-align: left;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    transition: all 0.2s;
  }

  .section-toggle:hover {
    background: var(--st-bg);
    color: var(--st-text);
    border-color: var(--st-hair-strong);
  }

  .sub-toggle {
    width: 100%;
    padding: 0.25rem 0.4rem;
    background: none;
    border: 1px solid var(--st-hair);
    border-radius: 3px;
    color: var(--st-text-2);
    cursor: pointer;
    font-size: 0.68rem;
    font-weight: 500;
    text-align: left;
    letter-spacing: 0.03em;
    transition: all 0.2s;
  }
  .sub-toggle:hover {
    background: var(--st-bg);
    color: var(--st-text);
    border-color: var(--st-hair-strong);
  }

  .sub-content {
    padding: 0.4rem 0.5rem;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    border: 1px solid var(--st-hair);
    border-radius: 4px;
    margin-top: 0.15rem;
    overflow: hidden;
  }

  .sub-content select {
    font-size: 0.68rem;
    padding: 0.2rem 0.3rem;
  }
  .sub-content .input-group label {
    font-size: 0.65rem;
  }
</style>
