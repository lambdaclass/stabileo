<script lang="ts">
  /**
   * CIRSOC Flex — sizing a concrete section, without a model.
   *
   * ── Why it belongs in Basic ────────────────────────────────────────
   *
   * Every calculation here already existed, and none of it was reachable
   * outside PRO: `checkFlexure` sizes a rectangular beam, `checkColumn` and
   * `interaction-diagram` handle a rectangular column, `checkBiaxial` does
   * skew bending, and the T and circular cases were added beside them. What
   * was missing was somewhere to type five numbers and read the answer.
   *
   * ── It deliberately ignores the model ──────────────────────────────
   *
   * No node, no member, no solve. A reader sizing a beam over a doorway has
   * no structure on screen and should not have to invent one, and a reader
   * who DOES have a solved model is better served by PRO's verification,
   * which knows which member and which combination it is talking about. This
   * is the pocket calculator, and its inputs are typed.
   *
   * ── The memo is the output ─────────────────────────────────────────
   *
   * `steps[]` comes back from every one of these functions and is rendered
   * verbatim. A number on its own is not checkable, and this is a tool people
   * reach for precisely when they want to see the working — the spreadsheet
   * it replaces is read that way, line by line.
   */
  import { t } from '../lib/i18n';
  import {
    checkFlexure, checkColumn, checkBiaxial,
    ASSUMED_FLEXURE_BAR_DIA_MM,
    type ConcreteDesignParams,
  } from '../lib/engine/codes/argentina/cirsoc201';
  import { checkFlexureFlanged } from '../lib/engine/codes/argentina/cirsoc201-flanged';
  import {
    checkColumnCircular, designCircular, generateCircularInteraction,
  } from '../lib/engine/codes/argentina/cirsoc201-circular';

  /** The five cases the workbook offers, in its own order. */
  type Case = 'rect-flexure' | 'tee-flexure' | 'rect-column' | 'circ-column' | 'rect-biaxial';

  const CASES: Array<{ id: Case; labelKey: string }> = [
    { id: 'rect-flexure', labelKey: 'flex.case.rectFlexure' },
    { id: 'tee-flexure', labelKey: 'flex.case.teeFlexure' },
    { id: 'rect-column', labelKey: 'flex.case.rectColumn' },
    { id: 'circ-column', labelKey: 'flex.case.circColumn' },
    { id: 'rect-biaxial', labelKey: 'flex.case.rectBiaxial' },
  ];

  let kase = $state<Case>('rect-flexure');

  // ── Materials ──────────────────────────────────────────────────────
  let fc = $state(25);
  let fy = $state(420);
  let cover = $state(3);      // cm, to the bar centre
  let stirrup = $state(8);    // mm

  // ── Geometry, in centimetres because that is how sections are said ──
  let b = $state(20);
  let h = $state(50);
  let bf = $state(100);
  let hf = $state(10);
  let bw = $state(20);
  let D = $state(50);
  let barCount = $state(8);
  let spiral = $state(false);
  let deductDisplaced = $state(false);

  // ── Demands ────────────────────────────────────────────────────────
  let Mu = $state(80);
  let Pu = $state(600);
  let Muy = $state(60);
  let Muz = $state(40);
  /** For the cases that verify a section rather than size one. */
  let AsGiven = $state(20);

  /*
   * The cover field says "to the bar centre" (`flex.in.cover`), and the
   * circular case uses it exactly that way. The flexure family expects cover
   * to the STIRRUP — `checkFlexure` subtracts the stirrup and half a bar
   * itself — so the same number must be converted once, here. Without the
   * conversion a 3 cm cover to the bar centre is read as 3 cm to the stirrup,
   * d comes out stirrup + half a bar short of what the reader stated, and the
   * printed steps contradict the label the reader filled in.
   */
  const coverToStirrup = $derived(
    Math.max(cover / 100 - stirrup / 1000 - ASSUMED_FLEXURE_BAR_DIA_MM / 2000, 0),
  );

  /** Centimetres in the fields, metres in the engine. One place converts. */
  const params = $derived<ConcreteDesignParams>({
    fc, fy,
    cover: coverToStirrup,
    b: b / 100,
    h: h / 100,
    stirrupDia: stirrup,
  });

  /*
   * Everything is recomputed on every keystroke, and that is affordable: the
   * heaviest case here scans forty points of an interaction curve, which is
   * microseconds. Nothing is cached, so nothing can be stale.
   */
  const result = $derived.by(() => {
    try {
      switch (kase) {
        case 'rect-flexure': {
          const r = checkFlexure(params, Mu);
          return {
            headline: `As = ${r.AsReq.toFixed(2)} cm²`,
            rows: [
              [t('flex.out.asFlexural'), `${r.AsFlexural.toFixed(2)} cm²`],
              [t('flex.out.asMin'), `${r.AsMin.toFixed(2)} cm²`],
              [t('flex.out.asMax'), `${r.AsMax.toFixed(2)} cm²`],
              [t('flex.out.bars'), r.bars],
              [t('flex.out.phiMn'), `${r.phiMn.toFixed(2)} kN·m`],
              [t('flex.out.d'), `${(r.d * 100).toFixed(1)} cm`],
              [t('flex.out.a'), `${(r.a * 100).toFixed(1)} cm`],
              ...(r.isDoublyReinforced
                ? [[t('flex.out.asComp'), `${(r.AsComp ?? 0).toFixed(2)} cm²`] as [string, string]]
                : []),
            ] as Array<[string, string]>,
            ratio: r.ratio,
            ok: r.status !== 'fail',
            steps: r.steps,
          };
        }

        case 'tee-flexure': {
          const r = checkFlexureFlanged(params, { bf: bf / 100, hf: hf / 100, bw: bw / 100 }, Mu);
          return {
            headline: `As = ${r.AsReq.toFixed(2)} cm²`,
            rows: [
              [t('flex.out.blockIn'), r.withinFlange ? t('flex.out.inFlange') : t('flex.out.inWeb')],
              [t('flex.out.asFlange'), `${r.AsFlange.toFixed(2)} cm²`],
              [t('flex.out.asMin'), `${r.AsMin.toFixed(2)} cm²`],
              [t('flex.out.phiMn'), `${r.phiMn.toFixed(2)} kN·m`],
              [t('flex.out.d'), `${(r.d * 100).toFixed(1)} cm`],
            ] as Array<[string, string]>,
            ratio: r.ratio,
            ok: r.status !== 'fail',
            steps: r.steps,
          };
        }

        case 'rect-column': {
          const r = checkColumn(params, Pu, Mu);
          return {
            headline: `Ast = ${r.AsTotal.toFixed(2)} cm²`,
            rows: [
              [t('flex.out.bars'), r.bars],
              [t('flex.out.phiPn'), `${r.phiPn.toFixed(1)} kN`],
              [t('flex.out.phiMn'), `${r.phiMn.toFixed(2)} kN·m`],
              [t('flex.out.stirrups'), `Ø${r.stirrupDia} c/${r.stirrupSpacing.toFixed(0)} cm`],
            ] as Array<[string, string]>,
            ratio: r.ratio,
            ok: r.status !== 'fail',
            steps: r.steps,
          };
        }

        case 'circ-column': {
          const geom = {
            D: D / 100, fc, fy, cover: cover / 100, barCount,
            confinement: (spiral ? 'spiral' : 'ties') as 'spiral' | 'ties',
            deductDisplacedConcrete: deductDisplaced,
          };
          const sized = designCircular(geom, Pu, Mu);
          const diag = generateCircularInteraction({ ...geom, AstCm2: sized?.AstCm2 ?? AsGiven });
          const chk = sized?.check ?? checkColumnCircular({ ...geom, AstCm2: AsGiven }, Pu, Mu);
          return {
            headline: sized
              ? `Ast = ${sized.AstCm2.toFixed(2)} cm²`
              : t('flex.out.sectionTooSmall'),
            rows: [
              [t('flex.out.barsRing'), `${barCount} × ${((sized?.AstCm2 ?? AsGiven) / barCount).toFixed(2)} cm²`],
              [t('flex.out.phiPn'), `${chk.phiPn.toFixed(1)} kN`],
              [t('flex.out.phiMn'), `${chk.phiMn.toFixed(2)} kN·m`],
              [t('flex.out.epsT'), `${(chk.epsT * 1000).toFixed(2)} ‰`],
              [t('flex.out.phi'), chk.phi.toFixed(3)],
              [t('flex.out.balanced'),
                `${diag.balanced.phiPn.toFixed(0)} kN / ${diag.balanced.phiMn.toFixed(1)} kN·m`],
            ] as Array<[string, string]>,
            ratio: chk.ratio,
            ok: sized !== null && chk.status === 'ok',
            steps: chk.steps,
          };
        }

        case 'rect-biaxial': {
          const r = checkBiaxial(params, Pu, Muy, Muz, AsGiven);
          return {
            /*
             * The biaxial case sizes nothing — it asks whether an Ast you
             * already chose is enough — so the headline is the Bresler
             * capacity rather than a repeat of the ratio printed under it.
             */
            headline: `φPn = ${r.phiPn.toFixed(1)} kN`,
            rows: [
              [t('flex.out.phiPn0'), `${r.phiPn0.toFixed(1)} kN`],
              [`φPn (Muz)`, `${r.phiPnx.toFixed(1)} kN`],
              [`φPn (Muy)`, `${r.phiPny.toFixed(1)} kN`],
              [t('flex.out.phiPnBresler'), `${r.phiPn.toFixed(1)} kN`],
            ] as Array<[string, string]>,
            ratio: r.ratio,
            ok: r.status !== 'fail',
            steps: r.steps,
          };
        }
      }
    } catch (err) {
      /*
       * A half-typed field is a normal state, not an error worth a stack
       * trace. Every input below is a number field, so the realistic failure
       * is a geometry that momentarily makes no sense — a cover deeper than
       * the section while somebody is still typing the height.
       */
      return {
        headline: t('flex.out.checkInputs'),
        rows: [] as Array<[string, string]>,
        ratio: NaN,
        ok: false,
        steps: [String((err as Error)?.message ?? err)],
      };
    }
  });

  const showsAxial = $derived(kase === 'rect-column' || kase === 'circ-column' || kase === 'rect-biaxial');
  const showsGivenAs = $derived(kase === 'rect-biaxial');
</script>

<div class="flex-panel" data-testid="flex-panel">
  <!--
    The case picks the shape AND the problem, because in this domain they are
    not independent: there is no circular simple-flexure sheet, and a biaxial
    round column is not something CIRSOC 201 offers a method for. Two
    selectors would have offered combinations that do not exist.
  -->
  <label class="fp-field">
    <span>{t('flex.case.label')}</span>
    <select bind:value={kase} data-testid="flex-case">
      {#each CASES as c (c.id)}
        <option value={c.id}>{t(c.labelKey)}</option>
      {/each}
    </select>
  </label>

  <h4 class="fp-heading">{t('flex.section.materials')}</h4>
  <div class="fp-grid">
    <label class="fp-field"><span>f'c [MPa]</span><input type="number" bind:value={fc} min="15" step="1" /></label>
    <label class="fp-field"><span>fy [MPa]</span><input type="number" bind:value={fy} min="220" step="10" /></label>
    <label class="fp-field"><span>{t('flex.in.cover')} [cm]</span><input type="number" bind:value={cover} min="1" step="0.5" /></label>
    <label class="fp-field"><span>{t('flex.in.stirrup')} [mm]</span><input type="number" bind:value={stirrup} min="6" step="2" /></label>
  </div>

  <h4 class="fp-heading">{t('flex.section.geometry')}</h4>
  <div class="fp-grid">
    {#if kase === 'tee-flexure'}
      <label class="fp-field"><span>bf [cm]</span><input type="number" bind:value={bf} min="1" step="5" /></label>
      <label class="fp-field"><span>hf [cm]</span><input type="number" bind:value={hf} min="1" step="1" /></label>
      <label class="fp-field"><span>bw [cm]</span><input type="number" bind:value={bw} min="1" step="5" /></label>
      <label class="fp-field"><span>h [cm]</span><input type="number" bind:value={h} min="5" step="5" /></label>
    {:else if kase === 'circ-column'}
      <label class="fp-field"><span>D [cm]</span><input type="number" bind:value={D} min="15" step="5" /></label>
      <label class="fp-field"><span>{t('flex.in.barCount')}</span><input type="number" bind:value={barCount} min="4" max="48" step="1" /></label>
      <label class="fp-check"><input type="checkbox" bind:checked={spiral} /><span>{t('flex.in.spiral')}</span></label>
      <label class="fp-check"><input type="checkbox" bind:checked={deductDisplaced} /><span>{t('flex.in.deduct')}</span></label>
    {:else}
      <label class="fp-field"><span>b [cm]</span><input type="number" bind:value={b} min="5" step="5" /></label>
      <label class="fp-field"><span>h [cm]</span><input type="number" bind:value={h} min="5" step="5" /></label>
    {/if}
  </div>

  <h4 class="fp-heading">{t('flex.section.demand')}</h4>
  <div class="fp-grid">
    {#if kase === 'rect-biaxial'}
      <label class="fp-field"><span>Pu [kN]</span><input type="number" bind:value={Pu} step="10" /></label>
      <label class="fp-field"><span>Muy [kN·m]</span><input type="number" bind:value={Muy} step="5" /></label>
      <label class="fp-field"><span>Muz [kN·m]</span><input type="number" bind:value={Muz} step="5" /></label>
    {:else}
      <label class="fp-field"><span>Mu [kN·m]</span><input type="number" bind:value={Mu} step="5" /></label>
      {#if showsAxial}
        <label class="fp-field"><span>Pu [kN]</span><input type="number" bind:value={Pu} step="10" /></label>
      {/if}
    {/if}
    {#if showsGivenAs}
      <label class="fp-field"><span>{t('flex.in.asGiven')} [cm²]</span><input type="number" bind:value={AsGiven} min="0" step="1" /></label>
    {/if}
  </div>

  <!--
    The answer, then the working. A headline anybody can copy onto a drawing,
    a table of the numbers that produced it, and the code's own steps below —
    which is the order the spreadsheet this replaces is read in.
  -->
  <div class="fp-result" class:fp-fail={!result.ok} data-testid="flex-result">
    <div class="fp-headline">{result.headline}</div>
    {#if Number.isFinite(result.ratio)}
      <div class="fp-ratio">
        {t('flex.out.ratio')} = <strong>{result.ratio.toFixed(3)}</strong>
        <span class="fp-verdict">{result.ok ? t('flex.out.ok') : t('flex.out.notOk')}</span>
      </div>
    {/if}
    {#if result.rows.length > 0}
      <table class="fp-table">
        <tbody>
          {#each result.rows as [label, value]}
            <tr><th>{label}</th><td>{value}</td></tr>
          {/each}
        </tbody>
      </table>
    {/if}
  </div>

  <details class="fp-memo">
    <summary>{t('flex.out.memo')}</summary>
    <ol>
      {#each result.steps as step}<li>{step}</li>{/each}
    </ol>
  </details>

  <!--
    Whose rules these are, and whose they are not.
    ─────────────────────────────────────────────
    The clauses implemented here are CIRSOC 201-2005's. The spreadsheet most
    people know this calculation from is INTI-CIRSOC's, by Daniel A. Ortega,
    and none of it is reproduced — not its sheets, not its layout, not its
    macros. Saying so is worth two lines: a reader who knows that workbook
    should be able to tell at a glance which of the two they are looking at,
    and a reader who does not should know which document to argue with.
  -->
  <!--
    Two small lines, and they say different things. The first is about the
    tool's maturity, the second about whose rules it implements — a reader who
    conflates them would think the CODE is provisional, which it is not.
  -->
  <p class="fp-attrib">{t('flex.betaNote')}</p>
  <p class="fp-attrib">{t('flex.attribution')}</p>
</div>

<style>
  .flex-panel {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    font-size: 0.75rem;
  }

  .fp-heading {
    margin: 0.3rem 0 0;
    font-size: 0.65rem;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--st-text-3);
  }

  .fp-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.35rem 0.5rem;
  }

  .fp-field {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    min-width: 0;
  }
  .fp-field > span { color: var(--st-text-3); font-size: 0.68rem; }

  .fp-field input,
  .fp-field select {
    width: 100%;
    padding: 0.25rem 0.35rem;
    background: var(--st-surface-3);
    border: 1px solid var(--st-hair);
    border-radius: var(--st-radius);
    color: var(--st-text);
    font-family: inherit;
    font-size: 0.75rem;
  }
  .fp-field input:focus,
  .fp-field select:focus { outline: none; border-color: var(--st-accent); }

  .fp-check {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    color: var(--st-text-2);
    font-size: 0.68rem;
  }

  /* ── The answer ──────────────────────────────────────────────────
     Bordered rather than filled, and the accent is spent on the number
     itself. A failing check turns the border and the verdict, not the
     whole box — the numbers beside it are still correct and still worth
     reading.
     ─────────────────────────────────────────────────────────────── */
  .fp-result {
    margin-top: 0.3rem;
    padding: 0.5rem 0.6rem;
    border: 1px solid var(--st-hair-strong);
    border-radius: var(--st-radius);
    background: var(--st-surface-2);
  }
  .fp-result.fp-fail { border-color: var(--st-danger); }

  .fp-headline {
    font-size: 0.95rem;
    font-weight: 700;
    color: var(--st-accent);
    font-variant-numeric: tabular-nums;
  }
  .fp-ratio { margin-top: 0.15rem; color: var(--st-text-2); font-variant-numeric: tabular-nums; }
  .fp-ratio strong { color: var(--st-text); }
  .fp-verdict { margin-left: 0.4rem; color: var(--st-ok); }
  .fp-result.fp-fail .fp-verdict { color: var(--st-danger); }

  .fp-table {
    width: 100%;
    margin-top: 0.4rem;
    border-collapse: collapse;
    font-variant-numeric: tabular-nums;
  }
  .fp-table th {
    text-align: left;
    font-weight: 400;
    color: var(--st-text-3);
    padding: 0.12rem 0.4rem 0.12rem 0;
  }
  .fp-table td { text-align: right; color: var(--st-text); padding: 0.12rem 0; }

  .fp-memo { color: var(--st-text-2); }
  .fp-memo summary { cursor: pointer; color: var(--st-text-3); font-size: 0.7rem; }
  .fp-memo ol {
    margin: 0.3rem 0 0;
    padding-left: 1.1rem;
    max-height: 220px;
    overflow-y: auto;
    font-size: 0.68rem;
    line-height: 1.5;
  }

  .fp-attrib {
    margin: 0.2rem 0 0;
    color: var(--st-text-3);
    font-size: 0.62rem;
    line-height: 1.4;
  }
</style>
