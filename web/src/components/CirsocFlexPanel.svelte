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
  import { teAll } from '../lib/i18n/engine-text';
  import { solveFlex, type FlexInput, type FlexCase } from '../lib/engine/codes/argentina/cirsoc-flex';
  import { axialCap } from '../lib/engine/codes/argentina/cirsoc201-basis';
  import SectionDrawing from './SectionDrawing.svelte';
  import { REBAR_DB } from '../lib/engine/codes/argentina/cirsoc201';
  import { uiStore, resultsStore, modelStore } from '../lib/store';
  import { stationForces2D, stationForces3D } from '../lib/section/panel';
  import { demandForCase } from '../lib/engine/codes/argentina/flex-demand-from-model';
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
  /*
   * Simple bending on a rectangle, because it is the case people come for.
   * It opened on FCR — a rectangular column under axial load and moment —
   * which is the workbook's own first sheet order but not the first thing
   * anyone asks a concrete calculator. A reader who wanted a beam had to
   * notice the case selector before the answer on screen made sense.
   */
  let kase = $state<FlexCase>('FSR');

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
  let b = $state(12);
  let h = $state(40);
  /** To the bar CENTRE, which is what the sheet asks for. */
  let dPrime = $state(3.4);
  let dPrimeS = $state(3.4);
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

  /*
   * ── Bars, because nobody checks a section in cm² ────────────────
   *
   * The workbook asks for an AREA per level and says outright that the bar
   * count it draws is "indicativo" — the schematic shows whether a level
   * exists, not what is in it. So area is the honest input and it stays the
   * one the calculation reads.
   *
   * But nobody arrives at a check holding 10.668 cm². They arrive holding a
   * drawing that says 6 Ø15, and converting by hand is both a chore and a
   * place to slip a digit. These two fields do that conversion and write
   * the result into the area beside them; typing an area directly still
   * works, which is what you want for a section that was never detailed in
   * round bar counts.
   */
  const DIAMETERS = REBAR_DB.filter((r) => r.diameter >= 6).map((r) => r.diameter);
  const areaOf = (n: number, dia: number) =>
    n * (REBAR_DB.find((r) => r.diameter === dia)?.area ?? 0);

  let levelBars = $state(
    Array.from({ length: 5 }, () => ({ n: 0, dia: 16 })),
  );
  let astBars = $state({ n: 0, dia: 16 });
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

  let Pu = $state(0);
  let Mu = $state(52);
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
  /**
   * The results, in the workbook's own set and order.
   *
   * ── Why it is written sheet by sheet ───────────────────────────
   *
   * This panel exists so a reader can check it against CIRSOC FLEX, and that
   * only works if the two print the same rows under the same names. They did
   * not: A′s was dropped whenever it came out zero — which is every singly
   * reinforced beam, so the row a reader went looking for was missing exactly
   * when its answer was "none" — Ast was in the headline but never in the
   * table, the circular sheet's Asi was nowhere, and the biaxial sheet's bar
   * table and Pu(max) did not exist.
   *
   * What the sheets do NOT print is not printed here either. The bar count and
   * diameter proposal is gone: the workbook sizes an AREA and stops, and a
   * suggestion of "6 Ø16" beside it invited a comparison that has no other
   * side. Anything this tool computes beyond the sheet goes below, under its
   * own heading, so it can never be mistaken for the sheet's answer.
   */
  type Row = [string, string];

  const cmOfRow = (label: string, v: number | undefined): Row => [label, cmOf(v)];

  /** The rows the workbook's own sheet prints, in its order. */
  const sheetRows = $derived.by((): Row[] => {
    const r = out.r;
    if (!r) return [];
    const isBeam = kase === 'FSR' || kase === 'FST';
    const rows: Row[] = [];

    if (isBeam) {
      /*
       * FSR and FST print, in this order: A′s, As, As mín, a, c, c máx, εt.
       * A′s ALWAYS — a singly reinforced beam answers 0,00, and that is an
       * answer rather than a reason to leave the row out.
       */
      rows.push([t('flex.out.asComp'), fmt(r.AsPrimeCm2 ?? 0, 3, 'cm²')]);
      rows.push([
        mode === 'verify' ? t('flex.in.asGiven') : t('flex.out.asTension'),
        fmt(r.AsCm2 ?? r.AstCm2, 3, 'cm²'),
      ]);
      if (Number.isFinite(r.AsMinCm2)) rows.push([t('flex.out.asMin'), fmt(r.AsMinCm2!, 3, 'cm²')]);
      rows.push(cmOfRow(t('flex.out.aReq'), r.a));
      rows.push(cmOfRow(t('flex.out.c'), r.c));
      if (r.cMax !== undefined) rows.push(cmOfRow(t('flex.out.cMax'), r.cMax));
      if (r.epsilonT !== undefined) {
        rows.push([t('flex.out.epsT'), `${(r.epsilonT * 1000).toFixed(2)} ‰`]);
      }
      return rows;
    }

    /* The column sheets: needed steel first, then the minima and maxima. */
    if (kase === 'FCR') {
      rows.push([t('flex.out.asComp'), fmt(r.AsPrimeCm2 ?? 0, 3, 'cm²')]);
      rows.push([t('flex.out.asTension'), fmt(r.AsCm2 ?? 0, 3, 'cm²')]);
    }
    rows.push([t('flex.out.astTotal'), fmt(r.AstCm2, 3, 'cm²')]);
    if (kase === 'FCR-CIR' && barCount > 0) {
      /* The sheet prints the area of ONE bar of the ring beside the total. */
      rows.push([t('flex.out.asiBar'), fmt(r.AstCm2 / barCount, 3, 'cm²')]);
    }
    rows.push([t('flex.out.rho'), r.rho.toFixed(6)]);
    if (Number.isFinite(r.AsMinCm2)) rows.push([t('flex.out.asMin'), fmt(r.AsMinCm2!, 3, 'cm²')]);
    if (r.AstMinCm2 !== undefined) rows.push([t('flex.out.astMin'), fmt(r.AstMinCm2, 3, 'cm²')]);
    if (r.AstMaxCm2 !== undefined) rows.push([t('flex.out.astMax'), fmt(r.AstMaxCm2, 3, 'cm²')]);
    if (kase === 'FCO') {
      /* Pu(max) = φ · 0,80 · Po, the sheet's own axial ceiling for a column. */
      const Ag = (b / 100) * (h / 100) - (holeB / 100) * (holeH / 100);
      const cap = axialCap(fc, fy, Ag, r.AstCm2 / 1e4, spiral ? 'spiral' : 'ties');
      rows.push([t('flex.out.puMax'), fmt(cap, 1, 'kN')]);
      if (mode === 'verify' && r.phiMn !== undefined && Math.abs(Mu) > 1e-9) {
        rows.push([t('flex.out.phiMnOverMu'), (r.phiMn / Math.abs(Mu)).toFixed(3)]);
      }
    }
    return rows;
  });

  /**
   * What this tool has in hand and the sheet does not print.
   *
   * Kept, and kept SEPARATE. Deleting φ and the state at the answer would
   * throw away the part a reader uses to see why the number came out as it
   * did; mixing them into the table above would make the comparison with the
   * workbook a matter of knowing which rows to skip.
   */
  const extraRows = $derived.by((): Row[] => {
    const r = out.r;
    if (!r) return [];
    const isBeam = kase === 'FSR' || kase === 'FST';
    const rows: Row[] = [];
    if (!isBeam) {
      rows.push(cmOfRow(t('flex.out.aReq'), r.a));
      rows.push(cmOfRow(t('flex.out.c'), r.c));
      if (r.cMax !== undefined) rows.push(cmOfRow(t('flex.out.cMax'), r.cMax));
      if (r.epsilonT !== undefined) {
        rows.push([t('flex.out.epsT'), `${(r.epsilonT * 1000).toFixed(2)} ‰`]);
      }
    }
    if (r.phi !== undefined) rows.push([t('flex.out.phi'), r.phi.toFixed(3)]);
    if (r.phiPn !== undefined && !isBeam) rows.push([t('flex.out.phiPn'), fmt(r.phiPn, 1, 'kN')]);
    if (r.phiMn !== undefined) rows.push([t('flex.out.phiMn'), fmt(r.phiMn, 2, 'kN·m')]);
    return rows;
  });

  /** The bar layout the biaxial sheet tabulates: one row per bar, with its place. */
  const barTable = $derived.by(() => {
    const r = out.r;
    if (!r || kase !== 'FCO') return [];
    return r.bars.map((bar, i) => ({
      n: i + 1,
      area: bar.area * 1e4,     // m² → cm²
      x: bar.x,
      y: bar.y,
    }));
  });

  const headline = $derived.by(() => {
    const r = out.r;
    if (!r) return t('flex.out.checkInputs');
    if (r.impossible) return t('flex.out.sectionTooSmall');
    /*
     * In `verify` the ratio already has its own row right below, with the
     * verdict beside it. Repeating it as the headline printed the same
     * number twice in a row and said nothing new. The capacity is the other
     * half of that comparison, and the number a reader wants next.
     */
    if (mode === 'verify') return `φMn = ${(r.phiMn ?? 0).toFixed(2)} kN·m`;
    return kase === 'FSR' || kase === 'FST'
      ? `As = ${r.AstCm2.toFixed(3)} cm²`
      : `Ast = ${r.AstCm2.toFixed(3)} cm²`;
  });

  const showsAxial = $derived(kase === 'FCR' || kase === 'FCR-CIR' || kase === 'FCO');

  /*
   * ── Taking the demand off the model ─────────────────────────────
   *
   * The geometry here is deliberately NOT the model's — the Case picks the
   * shape and these fields size it. The LOADS are a different matter: they
   * are the one thing a reader has already computed next door, and copying
   * three numbers off a diagram by hand is both tedious and a place to drop
   * a sign.
   *
   * So the picker is borrowed rather than rebuilt: `selectMode = 'stress'`
   * is the same crosshair Section Analysis arms, and the viewport already
   * answers it by writing the element and the station into `stressQuery`.
   * This watches for that answer, reads the resultants there, and fills in
   * only what the current Case can use.
   */
  let picking = $state(false);
  let pickNote = $state<string | null>(null);
  /** The tool the reader had armed, to give back when the pick ends. */
  let toolBeforePick: string | null = null;

  function startPicking() {
    if (!resultsStore.results && !resultsStore.results3D) {
      pickNote = t('flex.pick.needsResults');
      return;
    }
    pickNote = null;
    picking = true;
    resultsStore.stressQuery = null;
    /*
     * Both halves, or neither works. `selectMode = 'stress'` says what a
     * click MEANS; the viewport only reaches that branch when the SELECT
     * tool is the one armed — in pan a click drags the view and nothing
     * else. Setting the mode alone left the crosshair showing and every
     * click doing nothing, which is the worst of the three states.
     */
    toolBeforePick = String(uiStore.currentTool);
    uiStore.currentTool = 'select';
    uiStore.selectMode = 'stress';
  }

  function stopPicking() {
    picking = false;
    if (uiStore.selectMode === 'stress') uiStore.selectMode = 'elements';
    /* Give back the pointer the reader had, not an arbitrary one. */
    if (toolBeforePick) uiStore.currentTool = toolBeforePick as typeof uiStore.currentTool;
    toolBeforePick = null;
  }

  $effect(() => {
    if (!picking) return;
    const q = resultsStore.stressQuery;
    if (!q) return;

    const is3D = uiStore.analysisMode === '3d';
    const ef = is3D
      ? resultsStore.getElementForces3D(q.elementId)
      : resultsStore.getElementForces(q.elementId);
    if (!ef) { pickNote = t('flex.pick.noForces'); stopPicking(); return; }

    const f = is3D
      ? stationForces3D(ef as never, q.t)
      : stationForces2D(ef as never, q.t);

    /*
     * The sign flip and the per-Case restraint both live in
     * `demandForCase`, where they can be tested without a viewport. See the
     * note there for why they are worth isolating.
     */
    const d = demandForCase(f, kase);
    Mu = d.Mu;
    if (d.Pu !== undefined) Pu = d.Pu;
    if (d.Muy !== undefined) Muy = d.Muy;

    const el = modelStore.elements.get(q.elementId);
    pickNote = t('flex.pick.took')
      .replace('{el}', String(el?.id ?? q.elementId))
      .replace('{pct}', String(Math.round(q.t * 100)));
    stopPicking();
  });

  /* Leaving the panel must not strand the pointer in a mode with no answer. */
  $effect(() => () => { if (picking) stopPicking(); });

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
  <!--
    A calculator inside a modelling app invites one specific wrong
    assumption: that the section on screen is the section of whatever member
    is selected. It is not, and never was — the shape comes from the Case and
    the numbers from these fields. One line, because the assumption is cheap
    to form and expensive to discover.
  -->
  <p class="fp-note">{t('flex.geometryNote')}</p>
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
      <!--
        Two covers, and the only way to be sure which is which is to see them.
        d′sh runs in from the side face and d′sv down from the top, both to the
        CENTRE of the corner bar — the sheet says so with a sketch, and a reader
        transcribing numbers into the wrong one of two similarly named boxes
        gets a section that is subtly not theirs.
      -->
      <svg class="fp-scheme" viewBox="0 0 150 110" role="img"
        aria-label={t('flex.fco.schemeAlt')} data-testid="fco-scheme">
        <rect x="8" y="8" width="134" height="94" fill="none"
          stroke="currentColor" stroke-width="1.5" />
        <circle cx="52" cy="46" r="9" fill="none" stroke="currentColor" stroke-width="1.5" />
        <line x1="38" y1="46" x2="66" y2="46" stroke="currentColor" stroke-width="0.8" />
        <line x1="52" y1="32" x2="52" y2="60" stroke="currentColor" stroke-width="0.8" />
        <!-- d′sv: down from the top face to the bar centre -->
        <line x1="104" y1="9" x2="104" y2="45" stroke="currentColor" stroke-width="1"
          marker-start="url(#fpArrowUp)" marker-end="url(#fpArrowDown)" />
        <line x1="52" y1="46" x2="118" y2="46" stroke="currentColor"
          stroke-width="0.6" stroke-dasharray="3 3" />
        <text x="110" y="30" font-size="13" fill="currentColor">d′sv</text>
        <!-- d′sh: in from the left face to the bar centre -->
        <line x1="9" y1="82" x2="51" y2="82" stroke="currentColor" stroke-width="1"
          marker-start="url(#fpArrowUp)" marker-end="url(#fpArrowDown)" />
        <line x1="52" y1="46" x2="52" y2="90" stroke="currentColor"
          stroke-width="0.6" stroke-dasharray="3 3" />
        <text x="16" y="99" font-size="13" fill="currentColor">d′sh</text>
        <defs>
          <marker id="fpArrowDown" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
            <path d="M0,0 L6,3 L0,6 Z" fill="currentColor" />
          </marker>
          <marker id="fpArrowUp" markerWidth="6" markerHeight="6" refX="1" refY="3" orient="auto">
            <path d="M6,0 L0,3 L6,6 Z" fill="currentColor" />
          </marker>
        </defs>
      </svg>
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
      <thead>
        <tr>
          <th></th>
          <th>{t('flex.in.levelDist')} [cm]</th>
          <th>n</th>
          <th>Ø</th>
          <th>As [cm²]</th>
        </tr>
      </thead>
      <tbody>
        {#each levels as lvl, k}
          <tr>
            <th>{k + 1}</th>
            <td><input type="number" bind:value={lvl.distanceFromBottom} min="0" step="1" /></td>
            <td>
              <input
                type="number" min="0" max="20" step="1"
                bind:value={levelBars[k].n}
                oninput={() => { if (levelBars[k].n > 0) lvl.areaCm2 = areaOf(levelBars[k].n, levelBars[k].dia); }}
              />
            </td>
            <td>
              <select
                bind:value={levelBars[k].dia}
                onchange={() => { if (levelBars[k].n > 0) lvl.areaCm2 = areaOf(levelBars[k].n, levelBars[k].dia); }}
              >
                {#each DIAMETERS as d}<option value={d}>{d}</option>{/each}
              </select>
            </td>
            <td><input type="number" bind:value={lvl.areaCm2} min="0" step="0.5" /></td>
          </tr>
        {/each}
      </tbody>
    </table>
    <p class="fp-levels-note">{t('flex.in.levelsNote')}</p>
  {/if}

  <h4 class="fp-heading fp-heading-row">
    {t('flex.section.demand')}
    <button
      class="fp-pick-btn"
      class:on={picking}
      onclick={() => (picking ? stopPicking() : startPicking())}
      title={picking ? t('flex.pick.cancel') : t('flex.pick.tooltip')}
      aria-label={picking ? t('flex.pick.cancel') : t('flex.pick.tooltip')}
      data-testid="flex-pick-loads"
    >⌖</button>
  </h4>
  {#if picking}
    <p class="fp-note fp-note-live">{t('flex.pick.armed')}</p>
  {:else if pickNote}
    <p class="fp-note">{pickNote}</p>
  {/if}
  <div class="fp-grid">
    {#if showsAxial}
      <label class="fp-field"><span>Pu [kN]</span><input type="number" bind:value={Pu} step="10" /></label>
    {/if}
    <label class="fp-field"><span>{kase === 'FCO' ? 'Mxu' : 'Mu'} [kN·m]</span><input type="number" bind:value={Mu} step="5" /></label>
    {#if kase === 'FCO'}
      <label class="fp-field"><span>Myu [kN·m]</span><input type="number" bind:value={Muy} step="5" /></label>
    {/if}
    {#if mode === 'verify' && !(kase === 'FCR' && levels.some((l) => l.areaCm2 > 0))}
      <!--
        Bars on the left, the area they come to on the right. The area is
        what the calculation reads — see the note by `astBars` — so it stays
        editable for a section whose steel is not a round bar count.
      -->
      <label class="fp-field fp-field-bars">
        <span>{t('flex.in.asBars')}</span>
        <span class="fp-bars-row">
          <input
            type="number" min="0" max="60" step="1"
            bind:value={astBars.n}
            oninput={() => { if (astBars.n > 0) AstGiven = areaOf(astBars.n, astBars.dia); }}
            data-testid="ast-bar-count"
          />
          <span class="fp-bars-x">Ø</span>
          <select
            bind:value={astBars.dia}
            onchange={() => { if (astBars.n > 0) AstGiven = areaOf(astBars.n, astBars.dia); }}
            data-testid="ast-bar-dia"
          >
            {#each DIAMETERS as d}<option value={d}>{d}</option>{/each}
          </select>
        </span>
      </label>
      <label class="fp-field"><span>{t('flex.in.asGiven')} [cm²]</span><input type="number" bind:value={AstGiven} min="0" step="1" data-testid="ast-given" /></label>
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
      barCount={out.r?.barChoice?.count ?? out.r?.bars.length ?? 4}
      perLayer={out.r?.barChoice?.perLayer}
      layerPitchM={((out.r?.barChoice?.diameter ?? 0) + 25) / 1000}
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
    {#if sheetRows.length > 0}
      <table class="fp-table" data-testid="flex-sheet-rows">
        <tbody>
          {#each sheetRows as [label, value]}
            <tr><th>{label}</th><td>{value}</td></tr>
          {/each}
        </tbody>
      </table>
    {/if}

    <!--
      The biaxial sheet tabulates every bar with its coordinates, because with
      three positions and a percentage split there is no other way to see where
      the steel ended up. The bars are already what the calculation used, so
      this is the arrangement itself rather than a description of it.
    -->
    {#if barTable.length > 0}
      <h4 class="fp-heading">{t('flex.out.barTable')}</h4>
      <table class="fp-table fp-bartable" data-testid="flex-bar-table">
        <thead>
          <tr><th>#</th><th>Asi [cm²]</th><th>X [m]</th><th>Y [m]</th></tr>
        </thead>
        <tbody>
          {#each barTable as bar (bar.n)}
            <tr>
              <th>{bar.n}</th>
              <td>{bar.area.toFixed(3)}</td>
              <td>{bar.x.toFixed(3)}</td>
              <td>{bar.y.toFixed(3)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}

    {#if extraRows.length > 0}
      <details class="fp-extras" data-testid="flex-extras">
        <summary>{t('flex.extras.title')}</summary>
        <p class="fp-extras-note">{t('flex.extras.note')}</p>
        <table class="fp-table">
          <tbody>
            {#each extraRows as [label, value]}
              <tr><th>{label}</th><td>{value}</td></tr>
            {/each}
          </tbody>
        </table>
      </details>
    {/if}
  </div>

  <details class="fp-memo">
    <summary>{t('flex.out.memo')}</summary>
    <ol>
      <!--
        The engine returns `{ key, params }`, never a sentence — see
        `lib/codes/message.ts`. Translation and number formatting happen
        here, at the boundary, which is why the memo now reads in the
        reader's own language instead of always in Spanish.
      -->
      {#each (out.r ? teAll(out.r.steps) : [out.err ?? '']) as step}<li>{step}</li>{/each}
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
  <!--
    ── Both lines belong to ONE edition ──────────────────────────────
    The attribution names CIRSOC 201-2005 and the scope describes how far it
    was checked against a 2005 workbook. Neither says anything true about a
    different code, so under a different code neither is shown — leaving
    them up would be the panel vouching for numbers it did not produce.

    The scope folds away because of what it is: a paragraph you read once,
    when deciding whether to trust the tool, and never again. Open by
    default it pushed the answer up the panel; gone altogether it would be
    the caveat quietly disappearing. A closed summary is the honest middle.
  -->
  {#if code?.key === DEFAULT_DESIGN_CODE}
    <p class="fp-attrib">{t('flex.attribution')}</p>
    <details class="fp-scope">
      <summary>{t('flex.scopeSummary')}</summary>
      <p>{t('flex.scope')}</p>
    </details>
  {/if}
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
  .fp-levels-note {
    margin: 0.25rem 0 0;
    font-size: 0.6rem;
    line-height: 1.4;
    color: var(--st-text-3);
  }

  .fp-bars-row {
    display: flex;
    align-items: center;
    gap: 0.2rem;
  }

  .fp-bars-row input { width: 3ch; }
  .fp-bars-row select { flex: 1; min-width: 0; }

  .fp-bars-x {
    color: var(--st-text-3);
    font-size: 0.7rem;
  }

  .fp-levels select {
    width: 100%;
    min-width: 0;
  }

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

  .fp-scheme {
    grid-column: 1 / -1;
    width: 100%; max-width: 190px; height: auto;
    color: var(--st-text-3); margin: 2px auto 6px;
  }

  .fp-bartable th, .fp-bartable td { text-align: right; font-variant-numeric: tabular-nums; }
  .fp-bartable thead th { color: var(--st-text-3); font-weight: 500; font-size: 0.66rem; }
  .fp-extras { margin-top: 8px; }
  .fp-extras summary {
    cursor: pointer; font-size: 0.7rem; color: var(--st-text-3);
    text-transform: uppercase; letter-spacing: 0.04em;
  }
  .fp-extras-note { font-size: 0.66rem; color: var(--st-text-3); line-height: 1.45; margin: 4px 0; }

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

  .fp-heading-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.4rem;
  }

  .fp-pick-btn {
    width: 18px;
    height: 18px;
    padding: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    line-height: 1;
    font-size: 0.72rem;
    border: 1px solid var(--st-hair-strong);
    border-radius: 3px;
    background: var(--st-surface-2);
    color: var(--st-text-3);
    cursor: pointer;
    transition: border-color 0.15s, color 0.15s;
  }

  .fp-pick-btn:hover,
  .fp-pick-btn.on {
    border-color: var(--st-accent);
    color: var(--st-accent);
  }

  .fp-note-live {
    color: var(--st-accent);
  }

  .fp-note {
    margin: -0.15rem 0 0.1rem;
    font-size: 0.6rem;
    line-height: 1.4;
    color: var(--st-text-3);
  }

  .fp-scope {
    font-size: 0.62rem;
    line-height: 1.5;
    color: var(--st-text-3);
    margin: -0.15rem 0 0;
  }

  .fp-scope summary {
    cursor: pointer;
    color: var(--st-text-3);
    list-style: none;
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    text-decoration: underline dotted;
    text-underline-offset: 2px;
  }

  .fp-scope summary::-webkit-details-marker { display: none; }

  .fp-scope summary::before {
    content: '▸';
    font-size: 0.55rem;
  }

  .fp-scope[open] summary::before { content: '▾'; }

  .fp-scope p {
    margin: 0.3rem 0 0;
  }

  .fp-attrib {
    margin: 0.2rem 0 0;
    color: var(--st-text-3);
    font-size: 0.62rem;
    line-height: 1.4;
  }
</style>
