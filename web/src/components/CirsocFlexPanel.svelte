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
  import { solveFlex, type FlexInput, type FlexCase } from '../lib/engine/codes/argentina/cirsoc-flex';
  import SectionDrawing from './SectionDrawing.svelte';
  import type { SectionShape } from '../lib/engine/codes/argentina/section-shape';
  import {
    DESIGN_CODES, DEFAULT_DESIGN_CODE, findDesignCode,
  } from '../lib/engine/codes/design-codes';

  /** The five sheets, by the workbook's own names. */
  const CASES: Array<{ id: FlexCase; labelKey: string }> = [
    { id: 'FSR', labelKey: 'flex.case.rectFlexure' },
    { id: 'FST', labelKey: 'flex.case.teeFlexure' },
    { id: 'FCR', labelKey: 'flex.case.rectColumn' },
    { id: 'FCR-CIR', labelKey: 'flex.case.circColumn' },
    { id: 'FCO', labelKey: 'flex.case.rectBiaxial' },
  ];

  /**
   * Sizing or checking, chosen rather than inferred.
   *
   * The workbook keeps them as separate sheets and the split is real: one
   * takes a demand and returns steel, the other takes steel and returns
   * capacity.
   */
  type Mode = 'design' | 'verify';
  /**
   * The code, first, because it governs everything under it.
   *
   * Defaults to CIRSOC 201-2005: this calculator reproduces the CIRSOC_FLEX
   * workbook, that workbook is a 2005 document, and its published examples
   * are what the answers are checked against. See `design-codes.ts` for why
   * that differs from PRO, which designs to the edition in force.
   */
  let codeKey = $state(DEFAULT_DESIGN_CODE);
  const code = $derived(findDesignCode(codeKey));

  let mode = $state<Mode>('design');
  let kase = $state<FlexCase>('FCR');

  /**
   * Each sheet arrives with its own published example loaded.
   *
   * Not decoration: the fastest way to trust a calculator is to open it on a
   * case whose answer is printed somewhere else, and these are the five the
   * workbook ships. Switching case rewrites only the fields that example
   * defines, so a reader who has typed their own section into the shared
   * fields does not lose it silently — they lose it loudly, which is the
   * lesser evil against a form that half-remembers.
   */
  function loadExampleFor(next: FlexCase) {
    if (next === 'FSR') { b = 12; h = 40; dPrime = 3.4; dPrimeS = 3.4; Mu = 52; Pu = 0; }
    if (next === 'FST') { bf = 137; hf = 10; bw = 12; h = 40; dPrime = 3.2; dPrimeS = 3.2; Mu = 52; Pu = 0; }
    if (next === 'FCR') { b = 30; h = 30; dPrime = 5; dPrimeS = 5; ratioAsPrime = 1; Pu = 500; Mu = 100; }
    if (next === 'FCR-CIR') { D = 40; Dint = 0; dPrimeS = 3; barCount = 12; spiral = true; Pu = 1000; Mu = 300; }
    if (next === 'FCO') { b = 30; h = 30; dPrimeH = 5; dPrimeV = 5; pctA1 = 50; pctA2 = 50; pctA3 = 0; nA1 = 4; nA2 = 4; Pu = 500; Mu = 100; Muy = 0; }
    kase = next;
  }

  // ── 1. Datos generales, as the sheet heads them ────────────────────
  let fc = $state(25);
  let fy = $state(420);
  let spiral = $state(false);
  /*
   * Defaults ON. A bar inside the stress block occupies concrete the block
   * is already credited with, so leaving it out counts that area twice and
   * overstates capacity — and it is what makes our answers land on the
   * workbook's.
   */
  let deduct = $state(true);

  // ── 2. Sección ─────────────────────────────────────────────────────
  /* Centimetres in the fields, metres in the engine. One place converts. */
  /*
   * The defaults are the workbook's own worked example for FCR — 30×30,
   * d' = d's = 5 cm, Pu 500, Mu 100 — so opening the panel shows a case a
   * reader can look up rather than an empty form. The other sheets change
   * what they need when picked.
   */
  let b = $state(30);
  let h = $state(30);
  /** To the bar CENTRE, which is what the sheet asks for. */
  let dPrime = $state(5);
  let dPrimeS = $state(5);
  /** FCO carries two covers, horizontal and vertical. */
  let dPrimeH = $state(5);
  let dPrimeV = $state(5);
  /** The sheet's b_h / h_h — a rectangular void. */
  let holeB = $state(0);
  let holeH = $state(0);
  // T
  let bf = $state(137);
  let hf = $state(10);
  let bw = $state(12);
  // Circular
  let D = $state(40);
  let Dint = $state(0);
  let barCount = $state(12);
  let atFibre = $state(true);

  // ── 3. Armaduras y solicitaciones ──────────────────────────────────
  /** The sheet's A's/As. */
  let ratioAsPrime = $state(1);
  let pctA1 = $state(50);
  let pctA2 = $state(50);
  let pctA3 = $state(0);
  let nA1 = $state(4);
  let nA2 = $state(4);
  let nA3 = $state(4);
  /** Verification: the steel already there. */
  let AstGiven = $state(20);
  /**
   * FCR-VERIF's five levels, each a distance from the BOTTOM face and an
   * area. Five because that is what the sheet offers; empty rows are ignored.
   */
  let levels = $state<Array<{ distanceFromBottom: number; areaCm2: number }>>([
    { distanceFromBottom: 5, areaCm2: 0 },
    { distanceFromBottom: 15, areaCm2: 0 },
    { distanceFromBottom: 25, areaCm2: 0 },
    { distanceFromBottom: 0, areaCm2: 0 },
    { distanceFromBottom: 0, areaCm2: 0 },
  ]);

  let Pu = $state(500);
  let Mu = $state(100);
  let Muy = $state(0);

  /*
   * One call, whichever sheet is on screen.
   *
   * `solveFlex` owns which engine each case goes through, so this component
   * holds inputs and formatting and nothing else. That is what let every
   * agreement with the workbook be reached in a unit test rather than in a
   * browser — see `cirsoc-flex-all-sheets.test.ts`.
   */
  const input = $derived<FlexInput>({
    kase, mode,
    fc, fy, confinement: spiral ? 'spiral' : 'ties', deductDisplacedConcrete: deduct,
    b: b / 100, h: h / 100,
    dPrime: dPrime / 100, dPrimeS: dPrimeS / 100,
    dPrimeH: dPrimeH / 100, dPrimeV: dPrimeV / 100,
    holeB: holeB / 100, holeH: holeH / 100,
    bf: bf / 100, hf: hf / 100, bw: bw / 100,
    D: D / 100, Dint: Dint / 100, barCount, barAtExtremeFibre: atFibre,
    ratioAsPrime, pctA1, pctA2, pctA3, nA1, nA2, nA3,
    AstGiven, levels: levels.filter((l) => l.areaCm2 > 0)
      .map((l) => ({ distanceFromBottom: l.distanceFromBottom / 100, areaCm2: l.areaCm2 })),
    Pu, Mu, Muy,
  });

  const out = $derived.by(() => {
    try {
      return { r: solveFlex(input), err: null as string | null };
    } catch (e) {
      /* A half-typed field is an ordinary state, not a stack trace. */
      return { r: null, err: String((e as Error)?.message ?? e) };
    }
  });

  /** The drawing takes the very bars the calculation used. */
  const shape = $derived.by((): SectionShape => {
    const o = out.r?.outline;
    if (!o) return { kind: 'rect', b: b / 100, h: h / 100 };
    if (o.kind === 'tee') return { kind: 'tee', bf: o.bf, hf: o.hf, bw: o.bw, h: o.h };
    if (o.kind === 'circle') return { kind: 'circle', D: o.D };
    return { kind: 'rect', b: o.b, h: o.h };
  });

  const fmt = (v: number | undefined, digits = 2, unit = '') =>
    v === undefined || !Number.isFinite(v) ? '—' : `${v.toFixed(digits)}${unit ? ' ' + unit : ''}`;
  const cmOf = (m: number | undefined) => (m === undefined ? '—' : `${(m * 100).toFixed(2)} cm`);

  /** The rows each sheet prints, in the order it prints them. */
  const rows = $derived.by((): Array<[string, string]> => {
    const r = out.r;
    if (!r) return [];
    const isColumn = kase !== 'FSR' && kase !== 'FST';
    const base: Array<[string, string]> = [];

    if (r.AsPrimeCm2 !== undefined && r.AsCm2 !== undefined && isColumn) {
      base.push([t('flex.out.asComp'), fmt(r.AsPrimeCm2, 3, 'cm²')]);
      base.push([t('flex.out.asTension'), fmt(r.AsCm2, 3, 'cm²')]);
    } else if (!isColumn) {
      base.push([t('flex.out.asFlexural'), fmt(r.AsCm2, 3, 'cm²')]);
      if ((r.AsPrimeCm2 ?? 0) > 0) base.push([t('flex.out.asComp'), fmt(r.AsPrimeCm2, 3, 'cm²')]);
    }
    /*
     * ── The bars, next to the area that asked for them ──────────────
     *
     * An area is not a design. "Ast = 21.35 cm²" leaves the reader with the
     * question they actually came with — does that fit across the face —
     * and the workbook's column sheets stop there too. Putting the count and
     * diameter one row below the area is the whole of the addition, and it
     * is what turns the two composite-flexure cases from a number into
     * something you could draw.
     *
     * Sizing only. In `verify` the bars are an INPUT: echoing back an
     * arrangement the reader typed, as though it were a proposal, would be
     * the panel telling them what they just told it.
     */
    if (mode === 'design' && r.barChoice) {
      const fits = r.barChoice.fitsInOneLayer;
      base.push([
        /*
         * "Ring" only where there IS a ring. FCR's proposal is per LEVEL —
         * this many across the top face and this many across the bottom —
         * and calling that a ring would misdescribe the arrangement the
         * number belongs to.
         */
        kase === 'FCR-CIR' ? t('flex.out.barsRing')
          : kase === 'FCR' ? t('flex.out.barsPerLevel')
          : t('flex.out.bars'),
        /*
         * The chosen bars give slightly MORE than was asked for — bars come
         * in sizes — so the area they deliver is shown beside them. Without
         * it a reader comparing against `As` sees two numbers that disagree
         * and no reason why.
         */
        `${r.barChoice.label} (${r.barChoice.areaCm2.toFixed(2)} cm²)`
          + (fits === false ? ` — ${t('flex.out.barsTight')}` : ''),
      ]);
    }
    if (mode === 'design' && r.barChoiceComp) {
      base.push([
        t('flex.out.barsComp'),
        `${r.barChoiceComp.label} (${r.barChoiceComp.areaCm2.toFixed(2)} cm²)`
          + (r.barChoiceComp.fitsInOneLayer === false ? ` — ${t('flex.out.barsTight')}` : ''),
      ]);
    }
    base.push([t('flex.out.rho'), r.rho.toFixed(6)]);
    base.push([t('flex.out.asMin'), fmt(r.AsMinCm2, 3, 'cm²')]);
    if (r.AstMinCm2 !== undefined) {
      base.push([t('flex.out.astMin'), fmt(r.AstMinCm2, 3, 'cm²')]);
      base.push([t('flex.out.astMax'), fmt(r.AstMaxCm2, 3, 'cm²')]);
    }
    base.push([t('flex.out.aReq'), cmOf(r.a)]);
    base.push([t('flex.out.c'), cmOf(r.c)]);
    if (r.cMax !== undefined) base.push([t('flex.out.cMax'), cmOf(r.cMax)]);
    if (r.epsilonT !== undefined) base.push([t('flex.out.epsT'), `${(r.epsilonT * 1000).toFixed(2)} ‰`]);
    if (r.phi !== undefined) base.push([t('flex.out.phi'), r.phi.toFixed(3)]);
    if (r.phiPn !== undefined && isColumn) base.push([t('flex.out.phiPn'), fmt(r.phiPn, 1, 'kN')]);
    if (r.phiMn !== undefined) base.push([t('flex.out.phiMn'), fmt(r.phiMn, 2, 'kN·m')]);
    return base;
  });

  const headline = $derived.by(() => {
    const r = out.r;
    if (!r) return t('flex.out.checkInputs');
    if (r.impossible) return t('flex.out.sectionTooSmall');
    if (mode === 'verify') return `${t('flex.out.ratio')} = ${r.ratio.toFixed(3)}`;
    return kase === 'FSR' || kase === 'FST'
      ? `As = ${r.AstCm2.toFixed(3)} cm²`
      : `Ast = ${r.AstCm2.toFixed(3)} cm²`;
  });

  const showsAxial = $derived(kase === 'FCR' || kase === 'FCR-CIR' || kase === 'FCO');

</script>

<div class="flex-panel" data-testid="flex-panel">
  <!--
    The case picks the shape AND the problem, because in this domain they are
    not independent: there is no circular simple-flexure sheet, and a biaxial
    round column is not something CIRSOC 201 offers a method for. Two
    selectors would have offered combinations that do not exist.
  -->
  <!--
    The code, above everything. What follows are its clauses, and a reader
    who has not noticed which edition is selected has not read the answer.
  -->
  <label class="fp-field">
    <span>{t('flex.code.label')}</span>
    <select bind:value={codeKey} data-testid="flex-code">
      {#each DESIGN_CODES as c (c.key)}
        <option value={c.key} disabled={!c.implemented}>
          {c.label}{c.implemented ? '' : ' — ' + t(c.reasonKey ?? 'flex.code.notYet')}
        </option>
      {/each}
    </select>
  </label>

  <!--
    Sizing or checking, then, because it changes what the fields below MEAN:
    in one mode the steel is an answer and in the other it is a question.
  -->
  <div class="fp-modes" role="group" aria-label={t('flex.mode.label')}>
    <button class="fp-mode" class:on={mode === 'design'} onclick={() => (mode = 'design')}
      data-testid="flex-mode-design">{t('flex.mode.design')}</button>
    <button class="fp-mode" class:on={mode === 'verify'} onclick={() => (mode = 'verify')}
      data-testid="flex-mode-verify">{t('flex.mode.verify')}</button>
  </div>

  <label class="fp-field">
    <span>{t('flex.case.label')}</span>
    <select value={kase} onchange={(e) => loadExampleFor(e.currentTarget.value as FlexCase)} data-testid="flex-case">
      {#each CASES as c (c.id)}
        <option value={c.id}>{t(c.labelKey)}</option>
      {/each}
    </select>
  </label>

  <h4 class="fp-heading">{t('flex.section.materials')}</h4>
  <div class="fp-grid">
    <label class="fp-field"><span>f'c [MPa]</span><input type="number" bind:value={fc} min="15" step="1" /></label>
    <label class="fp-field"><span>fy [MPa]</span><input type="number" bind:value={fy} min="220" step="10" /></label>
    {#if kase === 'FCR' || kase === 'FCR-CIR' || kase === 'FCO'}
      <label class="fp-check"><input type="checkbox" bind:checked={spiral} /><span>{t('flex.in.spiral')}</span></label>
    {/if}
    <label class="fp-check"><input type="checkbox" bind:checked={deduct} /><span>{t('flex.in.deduct')}</span></label>
  </div>

  <h4 class="fp-heading">{t('flex.section.geometry')}</h4>
  <div class="fp-grid">
    {#if kase === 'FST'}
      <label class="fp-field"><span>b (ala) [cm]</span><input type="number" bind:value={bf} min="1" step="5" /></label>
      <label class="fp-field"><span>hf [cm]</span><input type="number" bind:value={hf} min="1" step="1" /></label>
      <label class="fp-field"><span>bw [cm]</span><input type="number" bind:value={bw} min="1" step="5" /></label>
      <label class="fp-field"><span>h [cm]</span><input type="number" bind:value={h} min="5" step="5" /></label>
      <label class="fp-field"><span>d′s [cm]</span><input type="number" bind:value={dPrimeS} min="1" step="0.5" /></label>
      <label class="fp-field"><span>d′ [cm]</span><input type="number" bind:value={dPrime} min="1" step="0.5" /></label>
    {:else if kase === 'FCR-CIR'}
      <label class="fp-field"><span>D [cm]</span><input type="number" bind:value={D} min="15" step="5" /></label>
      <!-- The sheet's `D int` — a hollow pier. -->
      <label class="fp-field"><span>D int [cm]</span><input type="number" bind:value={Dint} min="0" step="5" /></label>
      <label class="fp-field"><span>d′s [cm]</span><input type="number" bind:value={dPrimeS} min="1" step="0.5" /></label>
      <label class="fp-field"><span>{t('flex.in.barCount')}</span><input type="number" bind:value={barCount} min="4" max="48" step="1" /></label>
      <label class="fp-check"><input type="checkbox" bind:checked={atFibre} /><span>{t('flex.in.atFibre')}</span></label>
    {:else if kase === 'FCO'}
      <label class="fp-field"><span>b [cm]</span><input type="number" bind:value={b} min="5" step="5" /></label>
      <label class="fp-field"><span>h [cm]</span><input type="number" bind:value={h} min="5" step="5" /></label>
      <label class="fp-field"><span>d′sh [cm]</span><input type="number" bind:value={dPrimeH} min="1" step="0.5" /></label>
      <label class="fp-field"><span>d′sv [cm]</span><input type="number" bind:value={dPrimeV} min="1" step="0.5" /></label>
      <label class="fp-field"><span>b_h [cm]</span><input type="number" bind:value={holeB} min="0" step="5" /></label>
      <label class="fp-field"><span>h_h [cm]</span><input type="number" bind:value={holeH} min="0" step="5" /></label>
    {:else}
      <label class="fp-field"><span>b [cm]</span><input type="number" bind:value={b} min="5" step="5" /></label>
      <label class="fp-field"><span>h [cm]</span><input type="number" bind:value={h} min="5" step="5" /></label>
      <label class="fp-field"><span>d′s [cm]</span><input type="number" bind:value={dPrimeS} min="1" step="0.5" /></label>
      <label class="fp-field"><span>d′ [cm]</span><input type="number" bind:value={dPrime} min="1" step="0.5" /></label>
      {#if kase === 'FCR'}
        <label class="fp-field"><span>b_h [cm]</span><input type="number" bind:value={holeB} min="0" step="5" /></label>
        <label class="fp-field"><span>h_h [cm]</span><input type="number" bind:value={holeH} min="0" step="5" /></label>
      {/if}
    {/if}
  </div>

  {#if kase === 'FCO'}
    <!--
      A1 / A2 / A3 — the sheet's own distribution, and its own rule that the
      three percentages add to 100. Said rather than silently normalised: a
      reader whose numbers do not add up has made a mistake worth seeing.
    -->
    <h4 class="fp-heading">{t('flex.section.distribution')}</h4>
    <div class="fp-grid">
      <label class="fp-field"><span>A1 [%]</span><input type="number" bind:value={pctA1} min="0" max="100" step="5" /></label>
      <label class="fp-field"><span>N° A1</span><input type="number" bind:value={nA1} min="0" max="20" step="1" /></label>
      <label class="fp-field"><span>A2 [%]</span><input type="number" bind:value={pctA2} min="0" max="100" step="5" /></label>
      <label class="fp-field"><span>N° A2</span><input type="number" bind:value={nA2} min="0" max="20" step="1" /></label>
      <label class="fp-field"><span>A3 [%]</span><input type="number" bind:value={pctA3} min="0" max="100" step="5" /></label>
      <label class="fp-field"><span>N° A3</span><input type="number" bind:value={nA3} min="0" max="20" step="1" /></label>
    </div>
    {#if pctA1 + pctA2 + pctA3 !== 100}
      <p class="fp-warn">{t('flex.warn.pct').replace('{n}', String(pctA1 + pctA2 + pctA3))}</p>
    {/if}
  {/if}

  {#if kase === 'FCR' && mode === 'design'}
    <h4 class="fp-heading">{t('flex.section.distribution')}</h4>
    <div class="fp-grid">
      <label class="fp-field"><span>A′s / As</span><input type="number" bind:value={ratioAsPrime} min="0" max="1" step="0.1" /></label>
    </div>
  {/if}

  {#if kase === 'FCR' && mode === 'verify'}
    <!--
      Five levels, each a distance from the BOTTOM face — the sheet's own
      arrangement, and the one thing a two-layer model cannot express. A row
      with zero area is ignored, which is how the sheet treats an empty level.
    -->
    <h4 class="fp-heading">{t('flex.section.levels')}</h4>
    <table class="fp-levels">
      <thead><tr><th></th><th>{t('flex.in.levelDist')} [cm]</th><th>As [cm²]</th></tr></thead>
      <tbody>
        {#each levels as lvl, k}
          <tr>
            <th>{k + 1}</th>
            <td><input type="number" bind:value={lvl.distanceFromBottom} min="0" step="1" /></td>
            <td><input type="number" bind:value={lvl.areaCm2} min="0" step="0.5" /></td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}

  <h4 class="fp-heading">{t('flex.section.demand')}</h4>
  <div class="fp-grid">
    {#if showsAxial}
      <label class="fp-field"><span>Pu [kN]</span><input type="number" bind:value={Pu} step="10" /></label>
    {/if}
    <label class="fp-field"><span>{kase === 'FCO' ? 'Mxu' : 'Mu'} [kN·m]</span><input type="number" bind:value={Mu} step="5" /></label>
    {#if kase === 'FCO'}
      <label class="fp-field"><span>Myu [kN·m]</span><input type="number" bind:value={Muy} step="5" /></label>
    {/if}
    {#if mode === 'verify' && !(kase === 'FCR' && levels.some((l) => l.areaCm2 > 0))}
      <label class="fp-field"><span>{t('flex.in.asGiven')} [cm²]</span><input type="number" bind:value={AstGiven} min="0" step="1" /></label>
    {/if}
  </div>

  <!--
    The drawing sits with the answer, not with the inputs. It is a check on
    what was computed — the block, the neutral axis and the bars the numbers
    beside it describe — so it has to move when they do.
  -->
  <div class="fp-figure">
    <SectionDrawing
      {shape}
      cover={(kase === 'FCR-CIR' ? dPrimeS : kase === 'FCO' ? dPrimeV : dPrimeS) / 100}
      a={out.r?.a}
      c={out.r?.c}
      barCount={out.r?.bars.length ?? 4}
      AsCm2={(out.r?.bars ?? []).reduce((acc, bar) => acc + bar.area, 0) * 1e4}
    />
  </div>

  <div class="fp-result" class:fp-fail={!(out.r?.ok ?? false)} data-testid="flex-result">
    <div class="fp-headline">{headline}</div>
    {#if out.r && Number.isFinite(out.r.ratio)}
      <div class="fp-ratio">
        {t('flex.out.ratio')} = <strong>{out.r.ratio.toFixed(3)}</strong>
        <span class="fp-verdict">{out.r.ok ? t('flex.out.ok') : t('flex.out.notOk')}</span>
      </div>
    {/if}
    {#if rows.length > 0}
      <table class="fp-table">
        <tbody>
          {#each rows as [label, value]}
            <tr><th>{label}</th><td>{value}</td></tr>
          {/each}
        </tbody>
      </table>
    {/if}
  </div>

  <details class="fp-memo">
    <summary>{t('flex.out.memo')}</summary>
    <ol>
      {#each (out.r?.steps ?? [out.err ?? '']) as step}<li>{step}</li>{/each}
    </ol>
  </details>

  <!--
    Whose rules these are, and how far the checking goes.
    ────────────────────────────────────────────────────
    The second line is not hedging. "Tested against the workbook" is a claim
    with edges, and a reader deciding whether to lean on a number needs to
    know where they are: the five design sheets and the three verification
    sheets are reproduced, and the two places our answer is not theirs are
    named. Without it, "tested" reads as "identical", which it is not — and
    the difference matters most exactly where a section sits on the boundary.
  -->
  <p class="fp-attrib">{t('flex.attribution')}</p>
  <p class="fp-attrib">{t('flex.scope')}</p>
</div>

<style>
  .flex-panel {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    font-size: 0.75rem;
  }

  /* ── Sizing / checking ───────────────────────────────────────────
     A segmented pair rather than a dropdown: two exclusive options that
     change the meaning of the form belong where they can both be seen.
     ─────────────────────────────────────────────────────────────── */
  .fp-modes {
    display: flex;
    gap: 2px;
    padding: 2px;
    border: 1px solid var(--st-hair);
    border-radius: 7px;
    background: var(--st-surface-2);
  }
  .fp-mode {
    flex: 1;
    padding: 0.3rem 0;
    background: none;
    border: none;
    border-radius: 5px;
    color: var(--st-text-3);
    font-family: inherit;
    font-size: 0.68rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    cursor: pointer;
  }
  .fp-mode.on {
    background: var(--st-surface-3);
    color: var(--st-text);
    box-shadow: inset 0 -2px 0 -1px var(--st-accent);
  }

  .fp-figure {
    margin-top: 0.4rem;
    padding: 0.4rem;
    border: 1px solid var(--st-hair);
    border-radius: var(--st-radius);
    background: var(--st-surface-2);
  }

  .fp-warn {
    margin: 0.2rem 0 0;
    color: var(--st-warn);
    font-size: 0.66rem;
  }

  /* The five levels, as a compact grid rather than ten loose fields. */
  .fp-levels {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.68rem;
  }
  .fp-levels th {
    color: var(--st-text-3);
    font-weight: 400;
    text-align: left;
    padding: 0.1rem 0.3rem 0.1rem 0;
  }
  .fp-levels td { padding: 0.1rem 0.15rem; }
  .fp-levels input {
    width: 100%;
    padding: 0.2rem 0.3rem;
    background: var(--st-surface-3);
    border: 1px solid var(--st-hair);
    border-radius: var(--st-radius);
    color: var(--st-text);
    font-family: inherit;
    font-size: 0.7rem;
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
