<script lang="ts">
  /**
   * Foundations — the property surface for footings and the project's ground.
   *
   * This is the editor the footing engine was missing. `checkFooting` has been complete
   * since PR18 opened and unreachable, because the model carried no footing and no soil.
   *
   * Two sections, because they own different things and a footing references rather than
   * copies the ground:
   *
   *   * GEOMETRY per footing — plan dimensions, thickness, cover, founding level, plan
   *     eccentricity, pedestal, and which stratum it bears on;
   *   * the PROJECT's strata — allowable bearing pressure and its provenance, shared by
   *     every footing that references one.
   *
   * Nothing here invents a value that decides an outcome. A new footing arrives at B = L = 0
   * and a new stratum at "not stated", and both say so. The blocking issues are listed
   * verbatim from `validateFooting`/`validateSoilProfile` rather than turned into a disabled
   * control with no explanation.
   */
  import { t, tp } from '../../../lib/i18n';
  import { identifyMessages } from '../../../lib/codes/message';
  import { modelStore } from '../../../lib/store/model.svelte';
  import {
    validateFooting, FOOTING_LAYER_ORDER_PREFERENCES, SUPPORTED_MAT_DIAMETERS_MM,
  } from '../../../lib/model/footing';
  import { validateSoilProfile } from '../../../lib/model/geotechnical';
  import FootingCadHandoffPanel from './FootingCadHandoffPanel.svelte';
  import FootingMatPanel from './FootingMatPanel.svelte';

  const footings = $derived([...modelStore.model.footings.values()].sort((a, b) => a.id - b.id));
  const profiles = $derived(modelStore.model.geotechnical?.profiles ?? []);

  /**
   * The project's bottom-mat preferences.
   *
   * Read through the store's resolver, so a project saved before these existed shows the
   * 16/16 default it is already being designed to rather than an empty control.
   */
  const mat = $derived(modelStore.footingMatPreferences());

  /** Nodes that can take a footing: a support is where a reaction exists to carry. */
  const candidateNodes = $derived(
    [...modelStore.model.supports.values()]
      .map((s) => s.nodeId)
      .filter((id) => modelStore.model.nodes.has(id))
      .sort((a, b) => a - b),
  );

  let selectedId = $state<number | null>(null);
  const selected = $derived(
    selectedId === null ? undefined : modelStore.model.footings.get(selectedId),
  );

  /**
   * Columns landing on a footing's node, so the reference is chosen from what exists.
   *
   * A free-text element id would let a footing point at a beam.
   */
  function columnsAt(nodeId: number): number[] {
    return [...modelStore.model.elements.values()]
      .filter((e) => e.nodeI === nodeId || e.nodeJ === nodeId)
      .map((e) => e.id)
      .sort((a, b) => a - b);
  }

  function addFooting(nodeId: number) {
    selectedId = modelStore.addFooting(nodeId);
  }

  /** Numeric field write-through. Blank clears to 0 rather than to NaN. */
  function num(v: string): number {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }



</script>

<div class="foundations" data-testid="foundations-panel">
  <section class="footings">
    <header>
      <h4>{t('footing.ui.title')}</h4>
      <span class="count" data-testid="footing-count">{footings.length}</span>
    </header>

    {#if candidateNodes.length === 0}
      <p class="empty" data-testid="footing-no-supports">{t('footing.ui.noSupports')}</p>
    {:else}
      <div class="add-row">
        <label for="footing-add-node">{t('footing.ui.addOnNode')}</label>
        <select id="footing-add-node" data-testid="footing-add-node"
                onchange={(e) => {
                  const v = (e.currentTarget as HTMLSelectElement).value;
                  if (v !== '') addFooting(Number(v));
                  (e.currentTarget as HTMLSelectElement).value = '';
                }}>
          <option value="">{t('footing.ui.chooseNode')}</option>
          {#each candidateNodes as n (n)}
            <option value={n}>{tp('footing.ui.nodeOption', { node: n })}</option>
          {/each}
        </select>
      </div>
    {/if}

    {#if footings.length === 0}
      <p class="empty" data-testid="footing-empty">{t('footing.ui.empty')}</p>
    {:else}
      <ul role="listbox" aria-label={t('footing.ui.title')}>
        {#each footings as f (f.id)}
          {@const issues = validateFooting(f).filter((i) => i.severity === 'blocking')}
          <li>
            <button role="option" aria-selected={f.id === selectedId}
                    class:selected={f.id === selectedId}
                    data-testid={`footing-${f.id}`}
                    onclick={() => (selectedId = f.id)}>
              <span class="label">{f.name || tp('footing.ui.unnamed', { id: f.id })}</span>
              <span class="dims">{f.B.toFixed(2)} × {f.L.toFixed(2)} × {f.thickness.toFixed(2)} m</span>
              {#if issues.length > 0}
                <!-- Incomplete is never green. -->
                <span class="badge incomplete" data-testid={`footing-${f.id}-incomplete`}>
                  {t('footing.ui.incomplete')}
                </span>
              {/if}
            </button>
          </li>
        {/each}
      </ul>
    {/if}

    {#if selected}
      {@const f = selected}
      <div class="editor" data-testid="footing-editor">
        <div class="grid">
          <label>{t('footing.ui.name')}
            <input type="text" value={f.name} data-testid="footing-name"
                   oninput={(e) => modelStore.updateFooting(f.id, { name: e.currentTarget.value })} />
          </label>
          <label>{t('footing.ui.B')}
            <input type="number" step="0.05" min="0" value={f.B} data-testid="footing-B"
                   oninput={(e) => modelStore.updateFooting(f.id, { B: num(e.currentTarget.value) })} />
          </label>
          <label>{t('footing.ui.L')}
            <input type="number" step="0.05" min="0" value={f.L} data-testid="footing-L"
                   oninput={(e) => modelStore.updateFooting(f.id, { L: num(e.currentTarget.value) })} />
          </label>
          <label>{t('footing.ui.thickness')}
            <input type="number" step="0.05" min="0" value={f.thickness} data-testid="footing-thickness"
                   oninput={(e) => modelStore.updateFooting(f.id, { thickness: num(e.currentTarget.value) })} />
          </label>
          <label>{t('footing.ui.cover')}
            <input type="number" step="0.005" min="0" value={f.cover} data-testid="footing-cover"
                   oninput={(e) => modelStore.updateFooting(f.id, { cover: num(e.currentTarget.value) })} />
          </label>
          <label>{t('footing.ui.foundingElevation')}
            <input type="number" step="0.05" value={f.foundingElevation} data-testid="footing-elevation"
                   oninput={(e) => modelStore.updateFooting(f.id, { foundingElevation: num(e.currentTarget.value) })} />
          </label>
          <label>{t('footing.ui.rotation')}
            <input type="number" step="5" value={f.rotationDeg} data-testid="footing-rotation"
                   oninput={(e) => modelStore.updateFooting(f.id, { rotationDeg: num(e.currentTarget.value) })} />
          </label>
          <label>{t('footing.ui.eccentricityB')}
            <input type="number" step="0.05" value={f.eccentricityB} data-testid="footing-ecc-b"
                   oninput={(e) => modelStore.updateFooting(f.id, { eccentricityB: num(e.currentTarget.value) })} />
          </label>
          <label>{t('footing.ui.eccentricityL')}
            <input type="number" step="0.05" value={f.eccentricityL} data-testid="footing-ecc-l"
                   oninput={(e) => modelStore.updateFooting(f.id, { eccentricityL: num(e.currentTarget.value) })} />
          </label>
          <label>{t('footing.ui.column')}
            <select data-testid="footing-column"
                    onchange={(e) => {
                      const v = e.currentTarget.value;
                      modelStore.updateFooting(f.id, {
                        columnElementId: v === '' ? undefined : Number(v),
                      });
                    }}>
              <option value="" selected={f.columnElementId === undefined}>
                {t('footing.ui.noColumn')}
              </option>
              {#each columnsAt(f.nodeId) as e (e)}
                <option value={e} selected={f.columnElementId === e}>
                  {tp('footing.ui.elementOption', { element: e })}
                </option>
              {/each}
            </select>
          </label>
          <label>{t('footing.ui.soilProfile')}
            <select data-testid="footing-soil"
                    onchange={(e) => {
                      const v = e.currentTarget.value;
                      modelStore.updateFooting(f.id, {
                        soilProfileId: v === '' ? null : Number(v),
                      });
                    }}>
              <option value="" selected={f.soilProfileId === null}>
                {t('footing.ui.noSoilProfile')}
              </option>
              {#each profiles as p (p.id)}
                <option value={p.id} selected={f.soilProfileId === p.id}>{p.name}</option>
              {/each}
            </select>
          </label>
        </div>

        <!--
          The pedestal is optional, so it is opt-in rather than a set of zeroed fields that
          would fail validation for a footing that simply does not have one.
        -->
        <label class="check">
          <input type="checkbox" checked={f.pedestal !== undefined} data-testid="footing-pedestal-on"
                 onchange={(e) => modelStore.updateFooting(f.id, {
                   pedestal: e.currentTarget.checked
                     ? { B: f.B > 0 ? Math.min(0.5, f.B) : 0.5, L: f.L > 0 ? Math.min(0.5, f.L) : 0.5, height: 0.5 }
                     : undefined,
                 })} />
          {t('footing.ui.hasPedestal')}
        </label>
        {#if f.pedestal}
          {@const p = f.pedestal}
          <div class="grid">
            <label>{t('footing.ui.pedestalB')}
              <input type="number" step="0.05" min="0" value={p.B} data-testid="footing-pedestal-b"
                     oninput={(e) => modelStore.updateFooting(f.id, { pedestal: { ...p, B: num(e.currentTarget.value) } })} />
            </label>
            <label>{t('footing.ui.pedestalL')}
              <input type="number" step="0.05" min="0" value={p.L} data-testid="footing-pedestal-l"
                     oninput={(e) => modelStore.updateFooting(f.id, { pedestal: { ...p, L: num(e.currentTarget.value) } })} />
            </label>
            <label>{t('footing.ui.pedestalHeight')}
              <input type="number" step="0.05" min="0" value={p.height} data-testid="footing-pedestal-h"
                     oninput={(e) => modelStore.updateFooting(f.id, { pedestal: { ...p, height: num(e.currentTarget.value) } })} />
            </label>
          </div>
        {/if}

        {#each [validateFooting(f)] as issues (f.id)}
          {#if issues.length > 0}
            <ul class="issues" data-testid="footing-issues">
              {#each identifyMessages(issues.map((i) => i.message)) as m, ix (m.id)}
                <li class={issues[ix].severity}>
                  {tp(m.message.key, m.message.params ?? {})}
                </li>
              {/each}
            </ul>
          {/if}
        {/each}


        <!--
          The designed bottom mat, in its own component. See `FootingMatPanel.svelte`: the
          footing editor owns geometry and the ground, that owns the design that follows from
          them, and the split is what keeps both inside the design-tab size ceiling.
        -->
        <!--
          The CAD handoff, in its own component.
          `FootingCadHandoffPanel.svelte` owns the export attempt, the refusal that must not
          outlive its cause, and the link to the RC CAD handoff tool. Split out when this file
          crossed the 600-line component ceiling the suite enforces — the same reason
          `FootingMatPanel` was split out before it, and the same boundary: this file owns footing
          geometry and the ground, that one owns what follows from them.
        -->
        <FootingCadHandoffPanel footingId={f.id} />

        <FootingMatPanel footingId={f.id} />

        <button class="danger" data-testid="footing-delete"
                onclick={() => { modelStore.removeFooting(f.id); selectedId = null; }}>
          {t('footing.ui.delete')}
        </button>
      </div>
    {/if}
  </section>

  <!--
    The bottom-mat convention. A PROJECT preference, in its own section for the same reason the
    ground has one: it is shared by every footing rather than owned by any.

    It exists as a control at all because it used to be `DEFAULT_FOOTING_BAR_DIA_MM = 16`, a
    private constant in the detailing store that fixed the effective depth of every footing
    check in the project and that no user could see. The note says out loud what it is — a
    preference — so nobody reads Ø16 as something the design chose.
  -->
  <section class="mat-prefs" data-testid="footing-mat-prefs">
    <header><h4>{t('footing.ui.matTitle')}</h4></header>
    <p class="note">{t('footing.ui.matNote')}</p>
    <div class="grid">
      <label>{t('footing.ui.matDiameterX')}
        <select data-testid="footing-mat-dia-x"
                onchange={(e) => modelStore.setFootingMatPreferences({
                  bottomMatDiameterXmm: num(e.currentTarget.value),
                })}>
          {#each SUPPORTED_MAT_DIAMETERS_MM as d (d)}
            <option value={d} selected={mat.bottomMatDiameterXmm === d}>Ø{d}</option>
          {/each}
        </select>
      </label>
      <label>{t('footing.ui.matDiameterY')}
        <select data-testid="footing-mat-dia-y"
                onchange={(e) => modelStore.setFootingMatPreferences({
                  bottomMatDiameterYmm: num(e.currentTarget.value),
                })}>
          {#each SUPPORTED_MAT_DIAMETERS_MM as d (d)}
            <option value={d} selected={mat.bottomMatDiameterYmm === d}>Ø{d}</option>
          {/each}
        </select>
      </label>
      <!--
        Which perpendicular mat physically goes down.

        A real design decision with a real cost — the lower layer is worth a full bar diameter
        of effective depth — and no clause makes it: §13.3.3 governs distribution, §13.2.8 and
        §25.4 govern anchorage, and neither says which mat goes first. So it is the engineer's,
        and AUTO is an instruction to evaluate BOTH arrangements completely and select by a
        stated rule rather than an absence of one.
      -->
      <label>{t('footing.ui.matLayerOrder')}
        <select data-testid="footing-mat-layer-order"
                onchange={(e) => modelStore.setFootingMatPreferences({
                  bottomMatLayerOrder:
                    e.currentTarget.value as (typeof FOOTING_LAYER_ORDER_PREFERENCES)[number],
                })}>
          {#each FOOTING_LAYER_ORDER_PREFERENCES as o (o)}
            <option value={o} selected={mat.bottomMatLayerOrder === o}>
              {t(`footing.ui.matLayerOrder.${o}`)}
            </option>
          {/each}
        </select>
      </label>
      <label>{t('footing.ui.matSpacingPolicy')}
        <!--
          One option, and it is still a control rather than a caption: the project RECORDS that
          its spacings were derived from the code. A future hand-entered mode becomes another
          option here, not a reinterpretation of a missing field.
        -->
        <select data-testid="footing-mat-spacing-policy"
                onchange={(e) => modelStore.setFootingMatPreferences({
                  bottomMatSpacingPolicy: e.currentTarget.value as 'AUTO_CODE_COMPLIANT',
                })}>
          <option value="AUTO_CODE_COMPLIANT"
                  selected={mat.bottomMatSpacingPolicy === 'AUTO_CODE_COMPLIANT'}>
            {t('footing.ui.matSpacingPolicyAuto')}
          </option>
        </select>
      </label>
    </div>
  </section>

  <!--
    The ground. A PROJECT entity referenced by footings, never copied into them: a bearing
    pressure belongs to a stratum shared by many footings, and two copies is how two
    footings end up verified against different soils by accident.
  -->
  <section class="geotechnical">
    <header>
      <h4>{t('geotechnical.ui.title')}</h4>
      <button data-testid="soil-add" onclick={() => modelStore.addSoilProfile()}>
        {t('geotechnical.ui.add')}
      </button>
    </header>
    <p class="note">{t('geotechnical.ui.noRegulatoryDefault')}</p>

    {#if profiles.length === 0}
      <p class="empty" data-testid="soil-empty">{t('geotechnical.ui.empty')}</p>
    {:else}
      <ul class="profiles">
        {#each profiles as p (p.id)}
          <li data-testid={`soil-${p.id}`}>
            <div class="grid">
              <label>{t('geotechnical.ui.name')}
                <input type="text" value={p.name} data-testid={`soil-${p.id}-name`}
                       oninput={(e) => modelStore.updateSoilProfile(p.id, { name: e.currentTarget.value })} />
              </label>
              <label>{t('geotechnical.ui.allowableBearing')}
                <input type="number" step="10" min="0"
                       data-testid={`soil-${p.id}-bearing`}
                       value={p.bearing.kind === 'allowablePressure' ? p.bearing.allowableBearingKPa : ''}
                       placeholder={t('geotechnical.ui.notStated')}
                       oninput={(e) => {
                         const raw = e.currentTarget.value.trim();
                         modelStore.updateSoilProfile(p.id, {
                           bearing: raw === ''
                             ? { kind: 'unstated' }
                             : { kind: 'allowablePressure', allowableBearingKPa: num(raw) },
                         });
                       }} />
              </label>
              <label>{t('geotechnical.ui.source')}
                <select data-testid={`soil-${p.id}-source`}
                        onchange={(e) => modelStore.updateSoilProfile(p.id, {
                          provenance: { ...p.provenance, source: e.currentTarget.value as never },
                        })}>
                  {#each ['report', 'assumed', 'unstated'] as s (s)}
                    <option value={s} selected={p.provenance.source === s}>
                      {t(`geotechnical.ui.source.${s}`)}
                    </option>
                  {/each}
                </select>
              </label>
              <label class="wide">{t('geotechnical.ui.reference')}
                <input type="text" value={p.provenance.reference}
                       data-testid={`soil-${p.id}-reference`}
                       placeholder={t('geotechnical.ui.referencePlaceholder')}
                       oninput={(e) => modelStore.updateSoilProfile(p.id, {
                         provenance: { ...p.provenance, reference: e.currentTarget.value },
                       })} />
              </label>
              <label>{t('geotechnical.ui.unitWeight')}
                <input type="number" step="0.5" min="0" value={p.unitWeightKNm3 ?? ''}
                       placeholder={t('geotechnical.ui.notStated')}
                       data-testid={`soil-${p.id}-unit-weight`}
                       oninput={(e) => modelStore.updateSoilProfile(p.id, {
                         unitWeightKNm3: e.currentTarget.value.trim() === '' ? null : num(e.currentTarget.value),
                       })} />
              </label>
              <label>{t('geotechnical.ui.subgradeModulus')}
                <input type="number" step="1000" min="0" value={p.subgradeModulusKNm3 ?? ''}
                       placeholder={t('geotechnical.ui.onlyWinkler')}
                       data-testid={`soil-${p.id}-subgrade`}
                       oninput={(e) => modelStore.updateSoilProfile(p.id, {
                         subgradeModulusKNm3: e.currentTarget.value.trim() === '' ? null : num(e.currentTarget.value),
                       })} />
              </label>
              <label>{t('geotechnical.ui.groundwater')}
                <input type="number" step="0.5" value={p.groundwaterDepthM ?? ''}
                       placeholder={t('geotechnical.ui.notStated')}
                       data-testid={`soil-${p.id}-groundwater`}
                       oninput={(e) => modelStore.updateSoilProfile(p.id, {
                         groundwaterDepthM: e.currentTarget.value.trim() === '' ? null : num(e.currentTarget.value),
                       })} />
              </label>
            </div>
            {#each [validateSoilProfile(p)] as issues (p.id)}
              {#if issues.length > 0}
                <ul class="issues" data-testid={`soil-${p.id}-issues`}>
                  {#each identifyMessages(issues.map((i) => i.message)) as m, ix (m.id)}
                    <li class={issues[ix].severity}>
                      {tp(m.message.key, m.message.params ?? {})}
                    </li>
                  {/each}
                </ul>
              {/if}
            {/each}
            <button class="danger" data-testid={`soil-${p.id}-delete`}
                    onclick={() => modelStore.removeSoilProfile(p.id)}>
              {t('geotechnical.ui.delete')}
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  </section>
</div>

<style>
  .foundations { display: flex; flex-direction: column; gap: 1rem; padding: 0.75rem 1rem; font-size: 0.82rem; }
  header { display: flex; align-items: center; gap: 0.5rem; }
  h4 { margin: 0; font-size: 0.85rem; }
  .count { font-size: 0.72rem; font-weight: 600; padding: 0.1rem 0.4rem; border-radius: 3px; background: rgba(128,128,128,0.3); }
  .note { margin: 0.2rem 0 0.4rem; font-size: 0.75rem; opacity: 0.85; }
  .empty { opacity: 0.75; font-style: italic; }
  ul { list-style: none; margin: 0.4rem 0; padding: 0; display: flex; flex-direction: column; gap: 0.3rem; }
  .profiles > li { border: 1px solid rgba(128,128,128,0.3); border-radius: 4px; padding: 0.5rem; }
  [role='option'] {
    width: 100%; display: flex; align-items: center; gap: 0.5rem; text-align: left;
    padding: 0.3rem 0.45rem; background: none; border: 1px solid transparent; border-radius: 3px;
    cursor: pointer; color: inherit; font: inherit;
  }
  [role='option'].selected { border-color: currentColor; background: rgba(128,128,128,0.15); }
  .label { font-weight: 600; }
  .dims { opacity: 0.8; font-variant-numeric: tabular-nums; }
  .add-row { display: flex; align-items: center; gap: 0.5rem; }
  .editor { border: 1px solid rgba(128,128,128,0.3); border-radius: 4px; padding: 0.6rem; margin-top: 0.4rem; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr)); gap: 0.45rem; }
  label { display: flex; flex-direction: column; gap: 0.15rem; font-size: 0.75rem; }
  label.wide { grid-column: 1 / -1; }
  label.check { flex-direction: row; align-items: center; gap: 0.35rem; margin-top: 0.5rem; }
  input, select { font: inherit; padding: 0.2rem 0.3rem; }
  .issues { margin-top: 0.5rem; gap: 0.15rem; }
  .issues li { font-size: 0.74rem; padding: 0.15rem 0.4rem; border-radius: 3px; }
  /* Blocking is never green; advisory is never red. */
  .issues li.blocking { background: #5c1a1a; color: #ffe4e4; }
  .issues li.advisory { background: #7a5b00; color: #fff6dd; }
  .badge.incomplete {
    margin-left: auto; font-size: 0.7rem; font-weight: 600; padding: 0.1rem 0.35rem;
    border-radius: 3px; background: #7a5b00; color: #fff6dd;
  }
  button { font: inherit; cursor: pointer; }
  .danger { margin-top: 0.5rem; }

  /* A refusal reads as a refusal. Nothing here is styled as a success. */
</style>
