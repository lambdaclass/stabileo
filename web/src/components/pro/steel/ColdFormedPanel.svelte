<script lang="ts">
  /**
   * Perfiles conformados en frío — the parametric selector.
   *
   * ── Why a selector with nothing to select from ─────────────────────
   *
   * The tabulated series ships empty and will stay that way until a mill catalogue or a
   * dimensional standard can be cited. That would normally leave a picker with nothing to show —
   * except that a cold-formed designation IS its specification: `C 100x50x15x2.0` carries depth,
   * flange, lip and thickness, so a section can be built from the identifier alone with no table
   * consulted. This screen is that path, made reachable.
   *
   * So the two halves of a picker come apart here. «Choose from a list» is unavailable and says
   * so. «Specify a section» works completely.
   *
   * ── What it must never imply ──────────────────────────────────────
   *
   * That a section it produces has been checked. It has not, and cannot be: CIRSOC 301 excludes
   * cold-formed open sections by name and defers to CIRSOC 303, which this app does not carry.
   * The five facts of `COLD_FORMED_SCOPE` are rendered at the top for that reason — capability
   * first so the reader does not lose it among the limits, then the two absences, then the
   * exclusion, then the conclusion that follows.
   *
   * ── The zed warning is not decoration ─────────────────────────────
   *
   * A zed's principal axes are rotated and this app has nowhere to store a product of inertia, so
   * the numbers shown for one are about axes it will not actually bend about unless the member is
   * restrained. The angle is computed and displayed rather than described, because «rotated» and
   * «rotated 23 degrees» are different warnings.
   */
  import { t, tp } from '../../../lib/i18n';
  import { modelStore } from '../../../lib/store/model.svelte';
  import {
    coldFormedGeometry, validateColdFormed, parseColdFormedDesignation,
    formatColdFormedDesignation, type ColdFormedShape, type ColdFormedSpec,
  } from '../../../lib/profiles/cold-formed';
  import {
    coldFormedSource, coldFormedSectionFields, COLD_FORMED_BASIS,
  } from '../../../lib/profiles/cold-formed-catalogue';
  import {
    COLD_FORMED_SCOPE, COLD_FORMED_ZED_AXES_KEY,
  } from '../../../lib/profiles/cold-formed-scope';
  import { crossSectionPath } from '../../../lib/utils/section-drawing';

  /**
   * The four dimensions, in mm — the unit a designation is written in.
   *
   * Held as the source of truth rather than the designation string, so a half-typed number never
   * has to round-trip through a parser. The designation is derived from these; typing one writes
   * back into them.
   */
  let shape = $state<ColdFormedShape>('C');
  let hMm = $state(100);
  let bMm = $state(50);
  let cMm = $state(15);
  let tMm = $state(2);

  const spec = $derived<ColdFormedSpec>({ shape, hMm, bMm, cMm, tMm });
  const validation = $derived(validateColdFormed(spec));
  const geometry = $derived(coldFormedGeometry(spec));
  /** Empty while the spec is invalid: a designation for an unbuildable section is not one. */
  const designation = $derived(validation.ok ? formatColdFormedDesignation(spec) : '');

  /** What the user typed into the designation box, when they are typing into it. */
  let typed = $state('');
  let typedError = $state(false);

  function applyTyped() {
    const parsed = parseColdFormedDesignation(typed);
    if (!parsed) { typedError = true; return; }
    typedError = false;
    shape = parsed.shape;
    hMm = parsed.hMm;
    bMm = parsed.bMm;
    cMm = parsed.cMm;
    tMm = parsed.tMm;
    typed = '';
  }

  /**
   * The square-corner overestimate, as a percentage of the section's own area.
   *
   * Computed rather than quoted: it scales as `t²/A`, so a single figure written into a sentence
   * would be right for one section and wrong for the rest. Four corners either way — a channel
   * and a zed both have two web-to-flange bends and two flange-to-lip ones.
   */
  const cornerPct = $derived(
    geometry ? ((4 * tMm ** 2 * (1 - Math.PI / 4)) / geometry.areaMm2) * 100 : 0,
  );

  /** Rows for the property table. Formatted here; the numbers come from the geometry. */
  const rows = $derived(geometry ? [
    { key: 'A', value: `${(geometry.areaMm2 / 100).toFixed(2)} cm²` },
    { key: 'Iy', value: `${(geometry.iyMm4 / 1e4).toFixed(1)} cm⁴` },
    { key: 'Iz', value: `${(geometry.izMm4 / 1e4).toFixed(1)} cm⁴` },
    { key: 'Ixy', value: `${(geometry.ixyMm4 / 1e4).toFixed(1)} cm⁴` },
    { key: 'J', value: `${(geometry.jMm4 / 1e4).toFixed(2)} cm⁴` },
    { key: 'kg/m', value: geometry.massKgPerM.toFixed(2) },
  ] : []);

  /** The outline, through the same 2D path every other section preview uses. */
  const outline = $derived(geometry ? crossSectionPath({
    shape,
    h: hMm / 1000, b: bMm / 1000, tw: tMm / 1000, tf: tMm / 1000,
    t: cMm / 1000, tl: tMm / 1000,
  }) : null);

  let added = $state<string | null>(null);

  function add() {
    const entry = coldFormedSource.bySpec(spec);
    if (!entry) return;
    modelStore.addSection(coldFormedSectionFields(entry));
    added = entry.id;
  }
</script>

<section class="cf" data-testid="cold-formed-panel">
  <h3>{t('steel.coldFormed.title')}</h3>

  <!--
    The five facts. Ordered by the module, not by this template: capability, the two absences, the
    exclusion, the conclusion. Rendering them from the list is what makes it impossible to show
    four limits and drop the one capability.
  -->
  <ul class="scope" data-testid="cold-formed-scope">
    {#each COLD_FORMED_SCOPE as entry (entry.fact)}
      <li class={entry.kind} data-testid={`cf-scope-${entry.fact}`}>
        <span class="mark" aria-hidden="true">{entry.kind === 'available' ? '+' : '—'}</span>
        <span>{t(entry.key)}</span>
        {#if entry.clause}<span class="clause">{entry.clause}</span>{/if}
      </li>
    {/each}
  </ul>

  <div class="grid">
    <div class="specify">
      <label class="field wide">
        <span>{t('steel.coldFormed.designation')}</span>
        <input
          type="text"
          data-testid="cf-designation-input"
          placeholder="C 100x50x15x2.0"
          bind:value={typed}
          onchange={applyTyped}
          onkeydown={(e) => { if (e.key === 'Enter') applyTyped(); }} />
      </label>
      <p class="hint" class:error={typedError}>{t('steel.coldFormed.designationHint')}</p>

      <div class="shapes" role="group">
        {#each ['C', 'Z'] as const as s (s)}
          <button
            type="button"
            class="shape-btn"
            class:active={shape === s}
            data-testid={`cf-shape-${s}`}
            onclick={() => { shape = s; }}>{s}</button>
        {/each}
      </div>

      <div class="dims">
        <label class="field">
          <span>{t('steel.coldFormed.depth')}</span>
          <input type="number" step="1" min="1" data-testid="cf-h" bind:value={hMm} />
        </label>
        <label class="field">
          <span>{t('steel.coldFormed.flange')}</span>
          <input type="number" step="1" min="1" data-testid="cf-b" bind:value={bMm} />
        </label>
        <label class="field">
          <span>{t('steel.coldFormed.lip')}</span>
          <input type="number" step="1" min="1" data-testid="cf-c" bind:value={cMm} />
        </label>
        <label class="field">
          <span>{t('steel.coldFormed.thickness')}</span>
          <input type="number" step="0.1" min="0.1" data-testid="cf-t" bind:value={tMm} />
        </label>
      </div>
      <p class="hint">{t('steel.coldFormed.oneThickness')}</p>
      <p class="hint">{t('steel.coldFormed.seriesEmpty')}</p>
    </div>

    <div class="result">
      {#if !validation.ok}
        <!-- Which number to change, not merely "invalid". -->
        <p class="reject" data-testid="cf-reject">
          {t(`steel.coldFormed.reject.${validation.reason}`)}
        </p>
      {:else if geometry}
        <p class="designation" data-testid="cf-designation">{designation}</p>

        {#if outline}
          <svg class="preview" viewBox="-90 -90 180 180" data-testid="cf-preview" aria-hidden="true">
            <path d={outline} />
          </svg>
        {/if}

        <table data-testid="cf-properties">
          <tbody>
            {#each rows as row (row.key)}
              <tr><th>{row.key}</th><td>{row.value}</td></tr>
            {/each}
          </tbody>
        </table>
        <p class="basis" data-testid="cf-basis">{t('steel.coldFormed.derived')} · {COLD_FORMED_BASIS}</p>

        <!--
          The zed's rotated axes. Shown only for a zed, because beside a channel — whose geometric
          axes ARE principal — it would be a warning about nothing.
        -->
        {#if shape === 'Z'}
          <p class="warn" data-testid="cf-zed-axes">
            {tp(COLD_FORMED_ZED_AXES_KEY, { angle: geometry.principalAngleDeg.toFixed(1) })}
          </p>
        {/if}

        <p class="hint" data-testid="cf-corners">
          {tp('steel.coldFormed.sharpCorners', { pct: cornerPct.toFixed(2) })}
        </p>

        <button type="button" class="add" data-testid="cf-add" onclick={add}>
          {t('steel.coldFormed.add')}
        </button>
        {#if added}
          <p class="added" data-testid="cf-added">{tp('steel.coldFormed.added', { name: added })}</p>
        {/if}
      {/if}
    </div>
  </div>
</section>

<style>
  .cf { border-top: 1px solid var(--st-hair); margin-top: 1rem; padding-top: 0.75rem; }
  h3 { font-size: 0.85rem; margin: 0 0 0.5rem; color: var(--st-text); }

  .scope { list-style: none; margin: 0 0 0.75rem; padding: 0; font-size: 0.72rem; }
  .scope li { display: flex; gap: 0.4rem; align-items: baseline; padding: 0.15rem 0; }
  .mark { flex: none; width: 0.7rem; font-weight: 600; }
  /*
    The capability is not styled as a warning. Two kinds, two treatments — the whole reason
    `kind` is on the entry.
  */
  .scope li.available { color: var(--st-text); }
  .scope li.unavailable { color: var(--st-muted, var(--st-text)); }
  .clause { font-variant-numeric: tabular-nums; opacity: 0.75; white-space: nowrap; }

  .grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 1rem; }
  @media (max-width: 640px) { .grid { grid-template-columns: minmax(0, 1fr); } }

  .field { display: flex; flex-direction: column; gap: 0.15rem; font-size: 0.72rem; }
  .field.wide { margin-bottom: 0.3rem; }
  .field input {
    background: transparent; color: var(--st-text);
    border: 1px solid var(--st-hair); border-radius: 3px; padding: 0.25rem 0.35rem;
    font: inherit; font-size: 0.75rem; min-width: 0;
  }
  .dims { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.4rem; }

  .shapes { display: flex; gap: 0.3rem; margin: 0.4rem 0; }
  .shape-btn {
    background: transparent; color: var(--st-text);
    border: 1px solid var(--st-hair); border-radius: 3px;
    padding: 0.2rem 0.6rem; font: inherit; font-size: 0.75rem; cursor: pointer;
  }
  .shape-btn.active { border-color: var(--st-interactive); color: var(--st-interactive); }

  .hint { font-size: 0.68rem; opacity: 0.75; margin: 0.3rem 0 0; }
  .hint.error { color: var(--st-warn); opacity: 1; }
  .reject { font-size: 0.72rem; color: var(--st-warn); margin: 0; }
  .warn { font-size: 0.68rem; color: var(--st-warn); margin: 0.4rem 0 0; }

  .designation { font-size: 0.8rem; font-weight: 600; margin: 0 0 0.4rem; color: var(--st-value); }
  .preview { width: 100%; max-width: 140px; height: auto; display: block; margin: 0 auto 0.4rem; }
  .preview path { fill: none; stroke: var(--st-text); stroke-width: 2.5; }

  table { border-collapse: collapse; font-size: 0.72rem; width: 100%; }
  th { text-align: left; font-weight: 400; opacity: 0.75; padding: 0.1rem 0.5rem 0.1rem 0; }
  td { text-align: right; font-variant-numeric: tabular-nums; color: var(--st-value); }
  .basis { font-size: 0.66rem; opacity: 0.7; margin: 0.25rem 0 0; }

  .add {
    margin-top: 0.6rem; background: transparent; color: var(--st-interactive);
    border: 1px solid var(--st-interactive); border-radius: 3px;
    padding: 0.25rem 0.7rem; font: inherit; font-size: 0.75rem; cursor: pointer;
  }
  .added { font-size: 0.68rem; margin: 0.3rem 0 0; color: var(--st-value); }
</style>
