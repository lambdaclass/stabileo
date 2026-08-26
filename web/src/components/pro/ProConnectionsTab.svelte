<script lang="ts">
  import { untrack } from 'svelte';
  import { jointDesignStore } from '../../lib/store/joint-design.svelte';
  import { jointStateKey } from '../../lib/connection/joint-design';
  import { BOLT_GRADES } from '../../lib/connection/bolted-joint';
  import { TABULATED_DIAMETERS_MM } from '../../lib/connection/bolt-geometry';
  import { modelStore, resultsStore, uiStore } from '../../lib/store';
  import { steelStore } from '../../lib/store/steel.svelte';
  import { t, tp } from '../../lib/i18n';
  import { parseNumericInput, type NumericInputRules } from '../../lib/utils/numeric-input';
  /*
   * The concrete workflow's section shell, reused rather than reinvented.
   *
   * This panel was four ad-hoc blocks: a bare joint list, a headerless forces table, and two
   * `<details>` with a grey summary. Nothing said what a block was FOR, whether it had run, or
   * where it sat in the order — the same complaint `StageSection`'s own doc comment records
   * about the concrete panel before PR20 fixed it there.
   *
   * Reusing it buys the number, the purpose sentence, the state carried by a glyph AND a word
   * rather than by colour, and — the part that matters most here — its refusal to put a
   * `max-height` on an open section. Its comment explains why: a nested scroller at 720 px
   * makes the wheel ambiguous and parks a sticky header in the middle of the panel.
   */
  import StageSection from './design/StageSection.svelte';
  import {
    detectJoints, getJointForces, checkBoltGroup, checkFilletWeld,
    type BoltGrade, type BoltResult, type WeldResult,
    type JointInfo, type JointForces,
  } from '../../lib/engine/connection-design';

  /**
   * Which elements this panel is entitled to speak about.
   *
   * `checkBoltGroup` and `checkFilletWeld` are the only two calculations here, and both are
   * steel. Before this filter the joint list was every joint in the model, so a
   * reinforced-concrete beam-column joint was offered a bolt diameter, a grade 8.8 and an
   * Fexx. The arithmetic was not wrong; it was being offered for a joint that has no bolts.
   *
   * The classification is the one the metallic inventory already computes — same verdict,
   * same inference rules, same provenance — so this panel and the Profile design panel cannot
   * disagree about what is metallic. No `isSteel` re-filter here: the inventory only ever
   * contains steel verdicts (`steel-inventory.ts` skips every non-steel element).
   */
  const metallicElementIds = $derived(new Set(
    steelStore.members.map((m) => m.elementId),
  ));

  // ─── Joint detection (reactive) ──────────────
  const detected = $derived.by(() => {
    void(modelStore.nodes.size + modelStore.elements.size + modelStore.supports.size);
    return detectJoints(modelStore.nodes, modelStore.elements as any, modelStore.supports as any);
  });

  /**
   * One detection pass, two views of it.
   *
   * The unfiltered run returns every joint; the metallic split `detectJoints` would compute
   * from its `isMetallic` predicate is applied here instead, against the same set the
   * predicate would have closed over — a joint stays listed while at least one of its
   * members is metallic. Running detection a second time just to count what the filter
   * dropped would re-walk every node and element on every model change.
   *
   * Joints the filter removes are counted, not silently dropped. A panel that quietly
   * shows fewer rows than the model has joints is a panel a user will eventually
   * distrust. Saying "14 non-metallic joints are not listed here" is both the honest
   * version and the more useful one: it tells them the filter is working.
   */
  const joints = $derived(detected.flatMap((j) => {
    const metallic = j.elementIds.filter((id) => metallicElementIds.has(id));
    if (metallic.length === 0) return [];
    return [{
      ...j,
      metallicElementIds: metallic,
      nonMetallicElementIds: j.elementIds.filter((id) => !metallicElementIds.has(id)),
    }];
  }));
  const hiddenJointCount = $derived(detected.length - joints.length);

  /**
   * Why the list is empty, when it is.
   *
   * Three different absences, and until now they all rendered as "no joints":
   *
   *   · **`noModel`** — nothing is loaded, or nothing connects. Genuinely no joints.
   *   · **`noneMetallic`** — the model HAS joints and none of their members is classifiable as
   *     metal. This is the state the shipped industrial shed was in: 226 joints, 633 elements,
   *     and every element pointing at a material that declared no yield strength, so
   *     `materialFamilyOf` returned `unknown` and the filter removed all 226. A panel that says
   *     "no joints" there is telling the user something false about their model.
   *   · **`hasJoints`** — the ordinary case.
   *
   * The second one names the members' verdict rather than guessing, so the message can say what
   * to fix: a material with no strength and no grade.
   */
  const emptyReason = $derived.by((): 'hasJoints' | 'noModel' | 'noneMetallic' => {
    if (joints.length > 0) return 'hasJoints';
    return detected.length > 0 ? 'noneMetallic' : 'noModel';
  });

  /** How many members the app could not classify at all. The number that explains the absence. */
  const unclassifiedCount = $derived(
    steelStore.inventory.census.byFamily.unknown ?? 0,
  );

  let selectedJointId = $state<number | null>(null);

  /**
   * The design for the selected joint — from the shared store, recomputed on read.
   *
   * The same object the 3-D view draws and a document will tabulate. Nothing here holds a
   * capacity or a plate outline: those follow the model, so a design can never describe a model
   * that has since changed.
   */
  const design = $derived.by(() => {
    const j = selectedJoint;
    if (!j) return null;
    void modelStore.modelVersion;
    void resultsStore.results3D;
    return jointDesignStore.designFor(j.nodeId, j.elementIds);
  });

  /** The choices, so the form binds to what is stored rather than to a local copy. */
  const chosen = $derived(selectedJointId === null ? {} : jointDesignStore.choicesFor(selectedJointId));

  /**
   * The one field the user last typed something unusable into, and why.
   *
   * Kept as a single slot rather than a map: the panel shows one line, and a stale complaint
   * about a field the user has since fixed is worse than no complaint. Cleared as soon as the
   * same field parses.
   */
  let fieldProblem = $state<{ field: string; reasonKey: string } | null>(null);

  /**
   * Read one number out of the form.
   *
   * Every numeric handler in this panel goes through here, and none of them writes
   * `Number(value) || something` any more. That idiom is what turned a deliberate batten gap of
   * 0 into 10 — zero is falsy — and with it made §E.6.1's Group I, chords in continuous contact
   * carrying no battens at all, unreachable from the panel: the section went on claiming
   * battens for an arrangement the clause places none on.
   *
   * The three outcomes are kept apart on purpose. An empty field is a legitimate state on the
   * way to typing and usually means «not supplied». An invalid one — a negative length, a zero
   * where zero means the datum is absent — is SAID, never quietly reinterpreted, because a
   * negative thickness clamped to zero is a wrong answer wearing a right one's clothes. And a
   * real number is written through even when it is zero.
   */
  /**
   * Put the stored value back into the box.
   *
   * These inputs are one-way bound — `value={...}` and an `onchange`, not `bind:` — so when a
   * handler declines to store what was typed, Svelte has no reason to touch the DOM: the
   * expression it renders did not change. The box goes on showing the rejected text while the
   * model holds something else, which is the same disagreement between what is displayed and
   * what is stored that this whole audit is about, one layer up.
   */
  function reflect(el: HTMLInputElement, stored: number | undefined): void {
    el.value = stored === undefined ? '' : String(stored);
  }

  function readField(field: string, raw: string, rules: NumericInputRules = {}) {
    const parsed = parseNumericInput(raw, rules);
    if (parsed.kind === 'invalid') fieldProblem = { field, reasonKey: parsed.reasonKey };
    else if (fieldProblem?.field === field) fieldProblem = null;
    return parsed;
  }

  function setBolts(next: Partial<NonNullable<typeof chosen.bolts>>): void {
    if (selectedJointId === null) return;
    const current = chosen.bolts ?? {
      diameterMm: 20, grade: 'A325' as const, threads: 'included' as const,
      count: 4, rows: 2, spacingMm: 70, edgeDistanceMm: 40,
    };
    jointDesignStore.set(selectedJointId, { bolts: { ...current, ...next } });
  }

  function setPlate(next: { thicknessMm?: number; fuMPa?: number }): void {
    if (selectedJointId === null) return;
    jointDesignStore.set(selectedJointId, { plate: { ...(chosen.plate ?? {}), ...next } });
  }

  function setWeld(next: Parameters<typeof jointDesignStore.setWeld>[1]): void {
    if (selectedJointId === null) return;
    jointDesignStore.setWeld(selectedJointId, next);
  }

  function setBattens(next: Parameters<typeof jointDesignStore.setBattens>[1]): void {
    if (selectedJointId === null) return;
    jointDesignStore.setBattens(selectedJointId, next);
  }

  /**
   * The members meeting this joint, with what a user needs to tell them apart.
   *
   * Battens divide a MEMBER, and a joint sits at the end of several — so «the length» is
   * ambiguous until someone says which member. This list is what makes that choice explicit
   * instead of hidden inside a default.
   */
  const jointMembers = $derived.by(() => {
    const j = selectedJoint;
    if (!j) return [];
    return j.elementIds.flatMap((id) => {
      const el = modelStore.elements.get(id);
      if (!el) return [];
      const a = modelStore.nodes.get(el.nodeI);
      const b = modelStore.nodes.get(el.nodeJ);
      if (!a || !b) return [];
      const lengthM = Math.hypot(b.x - a.x, b.y - a.y,
        ((b as { z?: number }).z ?? 0) - ((a as { z?: number }).z ?? 0));
      const sec = modelStore.sections.get((el as { sectionId?: number }).sectionId ?? -1);
      return [{
        id,
        lengthM,
        family: (sec as { profileFamily?: string; name?: string } | undefined)?.profileFamily
          ?? (sec as { name?: string } | undefined)?.name ?? '—',
        /** Which end of the member is at this joint — the reference the stations start from. */
        end: el.nodeI === j.nodeId ? 'I' : 'J',
      }];
    }).sort((x, y) => y.lengthM - x.lengthM);
  });

  /**
   * The member the batten layout is detailed for.
   *
   * Preloaded with the LONGEST — a visible initial selection, not a normative decision. Battens
   * are usually detailed for the chord, and at a truss node the chord is the long member; but
   * that is a heuristic about typical models, not a rule, so it is shown as a choice a user can
   * change rather than folded into a number.
   */
  const referenceMember = $derived.by(() => {
    const chosenId = chosen.battens?.memberId;
    return jointMembers.find((m) => m.id === chosenId) ?? jointMembers[0];
  });

  const selectedJoint = $derived(joints.find(j => j.nodeId === selectedJointId) ?? null);

  // ─── Forces at selected joint ────────────────
  const jointForces = $derived.by((): JointForces | null => {
    if (!selectedJoint) return null;
    const r3d = resultsStore.results3D;
    if (!r3d?.elementForces) return null;
    return getJointForces(
      selectedJoint.nodeId,
      selectedJoint.elementIds,
      modelStore.elements as any,
      r3d.elementForces,
    );
  });

  // ─── Bolt config ─────────────────────────────
  let boltDia = $state(20);
  let boltGrade = $state<BoltGrade>('8.8');
  let boltCount = $state(4);
  let boltShearPlanes = $state(1);
  let boltThreadsInShear = $state(true);
  let boltPlateThickness = $state(10);
  let boltPlateFu = $state(440);
  let boltEdgeDist = $state(35);
  let boltVu = $state(0);
  let boltTu = $state(0);
  let boltResult = $state<BoltResult | null>(null);

  // ─── Weld config ─────────────────────────────
  let weldLeg = $state(6);
  let weldLength = $state(200);
  let weldFexx = $state(490);
  let weldPlateThickness = $state(10);
  let weldVu = $state(0);
  let weldResult = $state<WeldResult | null>(null);

  function selectJoint(nodeId: number) {
    selectedJointId = selectedJointId === nodeId ? null : nodeId;
    boltResult = null;
    weldResult = null;
  }

  function highlightJoint(j: JointInfo) {
    uiStore.setSelection(new Set([j.nodeId]), new Set(j.elementIds));
  }

  /**
   * The other direction: a node picked in the 3-D scene selects its joint here.
   *
   * List → scene already worked, because `highlightJoint` writes the shared selection. Scene →
   * list did not: `selectedJointId` was purely local, so clicking a node in the viewport
   * highlighted it and the panel went on describing whatever was chosen before — two surfaces
   * showing two different joints with nothing saying so.
   *
   * Only a SINGLE selected node counts. A box-select covering forty nodes has no one joint to
   * describe, and picking the first would be inventing a focus the user did not express.
   */
  $effect(() => {
    const picked = uiStore.selectedNodes;
    if (picked.size !== 1) return;
    const [nodeId] = picked;
    // Untracked: reading `joints` here would re-run this on every model change and fight the
    // user's own clicks in the list.
    const isJoint = untrack(() => joints.some((j) => j.nodeId === nodeId));
    if (isJoint && nodeId !== selectedJointId) {
      selectedJointId = nodeId;
      boltResult = null;
      weldResult = null;
    }
  });

  /** Auto-fill bolt forces from joint max shear */
  function autoFillBoltForces() {
    if (!jointForces) return;
    boltVu = Math.round(jointForces.maxV * 10) / 10;
    boltTu = 0;
  }

  /** Auto-fill weld forces from joint max shear */
  function autoFillWeldForces() {
    if (!jointForces) return;
    weldVu = Math.round(jointForces.maxV * 10) / 10;
  }

  function runBoltCheck() {
    boltResult = checkBoltGroup({
      diameter: boltDia,
      grade: boltGrade,
      count: boltCount,
      shearPlanes: boltShearPlanes,
      threadsInShear: boltThreadsInShear,
      plateThickness: boltPlateThickness,
      plateFu: boltPlateFu,
      edgeDistance: boltEdgeDist,
      Vu: boltVu,
      Tu: boltTu,
    });
  }

  function runWeldCheck() {
    weldResult = checkFilletWeld({
      legSize: weldLeg,
      length: weldLength,
      Fexx: weldFexx,
      Vu: weldVu,
      plateThickness: weldPlateThickness,
    });
  }

  function fmtN(n: number): string {
    if (Math.abs(n) < 0.01) return '0';
    return n.toFixed(1);
  }

  function statusClass(s: 'ok' | 'warn' | 'fail'): string {
    return `st-${s}`;
  }

  /**
   * The grades whose threads-excluded shear value the table does not carry.
   *
   * `BOLT_TABLE` gives `FvExcl: 0` for 4.6 and 5.6, and `checkBoltGroup` falls back to
   * `FvIncl` when it is zero. That fallback is correct — the conservative value is the right
   * one to use — but it is SILENT, and it is tied to a checkbox the user is actively
   * ticking. So the warning sits beside the result, conditioned on the grade, and not only in
   * the gap list at the bottom: a gap that lives only in a footnote is one nobody reads at the
   * moment it matters.
   */
  const GRADES_WITHOUT_FV_EXCL: BoltGrade[] = ['4.6', '5.6'];
  const fvExclUnavailable = $derived(GRADES_WITHOUT_FV_EXCL.includes(boltGrade));

  /**
   * The five gaps, confirmed by reading the code rather than by reviewing the UI.
   *
   * `affects` is the field that earns this list its place. "Torsion is not shown" and "base
   * metal rupture is not checked" are not the same kind of statement: one is a number that
   * exists and is not drawn, the other is a limit state nothing computes. A list that did not
   * separate them would be a list of apologies.
   */
  const GAPS = [
    { id: 'baseMetal', affects: true },
    { id: 'boltGeometry', affects: true },
    { id: 'torsion', affects: false },
    { id: 'aluminium', affects: true },
    { id: 'fvExcl', affects: true },
  ] as const;

  /** Which sub-section is open. Bound, so opening one does not close the reader's place. */
  let openJoints = $state(true);
  let openBolts = $state(false);
  let openWelds = $state(false);
  let openGaps = $state(false);
</script>

<div class="conn-tab">
  <!--
    Stated before any number is shown, not after.

    `connection-design.ts` has no tests, no mapped clauses and no external benchmark, and it
    sits outside the app's maturity model. The arithmetic is offered because an engineer who
    can see the assumptions can review it — the same bargain `steel.panel.experimentalBanner`
    strikes. It is not a verification, and this panel must never read as one.
  -->
  <div class="conn-banner" role="note" data-testid="conn-experimental-banner">
    {t('conn.experimentalBanner')}
  </div>

  <!-- ── 1 · Joint detection ─────────────────────────────────────── -->
  <StageSection
    step={1}
    title={t('conn.sec.joints.title')}
    purpose={t('conn.sec.joints.purpose')}
    state={joints.length > 0 ? 'done' : 'blocked'}
    blockedBy={emptyReason === 'noneMetallic'
      ? tp('conn.jointsNotShown', { n: hiddenJointCount })
      : t('conn.sec.joints.blocked')}
    badge={joints.length}
    testid="conn-sec-joints"
    badgeTestid="conn-joint-count"
    bind:open={openJoints}
  >
    <p class="conn-explain" data-testid="conn-joints-what">{t('conn.joints.what')}</p>
    <!--
      The filter says so. A list shorter than the model's joint count, with no explanation, is
      the kind of thing a user discovers at the worst possible moment.
    -->
    {#if hiddenJointCount > 0}
      <p class="conn-filtered" data-testid="conn-filtered-note">
        {tp('conn.nonMetallicHidden', { n: hiddenJointCount })}
      </p>
    {/if}
    {#if joints.length === 0}
      {#if emptyReason === 'noneMetallic'}
        <!--
          The model has joints. None of them could be shown, and the reason is a property of the
          MATERIALS, not of the topology — so the message names the count on both sides and what
          would fix it.
        -->
        <div class="conn-empty conn-empty-blocked" data-testid="conn-none-metallic">
          <p>{tp('conn.jointsNotShown', { n: hiddenJointCount })}</p>
          {#if unclassifiedCount > 0}
            <p class="conn-why" data-testid="conn-none-metallic-why">
              {tp('conn.jointsUnclassified', { n: unclassifiedCount })}
            </p>
          {/if}
        </div>
      {:else}
        <div class="conn-empty" data-testid="conn-no-joints">{t('conn.noJoints')}</div>
      {/if}
    {:else}
      <div class="conn-joint-list">
        {#each joints as j}
          <button
            class="conn-joint-row"
            class:active={selectedJointId === j.nodeId}
            onclick={() => { selectJoint(j.nodeId); highlightJoint(j); }}
          >
            <span class="conn-node-id">N{j.nodeId}</span>
            <span class="conn-elem-count">{j.elementCount} {t('conn.elementsShort')}</span>
            {#if j.hasSupport}<span class="conn-support-badge">{t('conn.support')}</span>{/if}
            <span class="conn-coords">({fmtN(j.x)}, {fmtN(j.y)}, {fmtN(j.z)})</span>
          </button>
        {/each}
      </div>
    {/if}

    {#if selectedJoint}
      <!--
        Which members meet here, split by material.

        The split is the whole reason a mixed joint is offered at all: a steel beam framing
        into a concrete column is a real detail, and the panel has to be able to say which
        half of it these calculations are about.
      -->
      <div class="conn-members" data-testid="conn-joint-members">
        <span class="conn-members-title">{t('conn.joints.membersTitle')}</span>
        <span class="conn-members-metallic" data-testid="conn-members-metallic">
          {selectedJoint.metallicElementIds.map((id) => `E${id}`).join(', ')}
          <em>{t('conn.joints.metallic')}</em>
        </span>
        {#if selectedJoint.nonMetallicElementIds.length > 0}
          <span class="conn-members-other" data-testid="conn-members-nonmetallic">
            {selectedJoint.nonMetallicElementIds.map((id) => `E${id}`).join(', ')}
            <em>{t('conn.joints.nonMetallic')}</em>
          </span>
        {/if}
      </div>
      {#if selectedJoint.nonMetallicElementIds.length > 0}
        <p class="conn-explain" data-testid="conn-mixed-note">{t('conn.joints.mixedNote')}</p>
      {/if}

      <!-- ── The design: the governing demand, the choices, and the verdicts ── -->
      {#if design}
        <section class="jd" data-testid="joint-design">
          <header class="jd-head">
            <span class="jd-title">{t('conn.design.title')}</span>
            <!--
              The state comes from the clauses, not from this panel. `verified` is a state the
              key can name and nothing can produce.
            -->
            <span class="jd-state" data-state={design.state} data-testid="joint-design-state">
              {t(jointStateKey(design.state))}
            </span>
          </header>

          <!-- What governs, and where it came from. An envelope with no provenance is a number
               nobody can argue with. -->
          <dl class="jd-demands" data-testid="joint-demands">
            <!-- Typed explicitly: a mixed tuple array widens to `string | GoverningDemand` and
                 the template then cannot read `.value` off either half. -->
            {#each [
              { key: 'axial', d: design.demands.axial },
              { key: 'shear', d: design.demands.shear },
              { key: 'moment', d: design.demands.moment },
            ] as { key, d } (key)}
              <dt>{t(`conn.demand.${key}`)}</dt>
              <dd data-testid={`joint-demand-${key}`}>
                {#if d}
                  <span class="mono">{d.value.toFixed(1)} {key === 'moment' ? 'kN·m' : 'kN'}</span>
                  <span class="jd-from">
                    {d.comboName ?? t('conn.demand.singleCase')} · E{d.elementId} · {d.end}
                  </span>
                {:else}—{/if}
              </dd>
            {/each}
          </dl>
          {#if design.demands.membersWithoutForces.length > 0}
            <p class="conn-explain" data-testid="joint-demand-gaps">
              {tp('conn.demand.membersWithoutForces', { n: design.demands.membersWithoutForces.length })}
            </p>
          {/if}

          <!-- The choices. Bound to the shared store, so the viewport draws what is chosen. -->
          <div class="jd-form">
            <label>
              <span>{t('conn.design.diameter')}</span>
              <select
                data-testid="jd-diameter"
                value={String(chosen.bolts?.diameterMm ?? 20)}
                onchange={(e) => setBolts({ diameterMm: Number(e.currentTarget.value) })}
              >
                <!-- Only the diameters Tabla J.3.4 tabulates: offering one the code does not
                     would offer a bolt whose edge distance cannot be checked. -->
                {#each TABULATED_DIAMETERS_MM as d (d)}<option value={d}>{d} mm</option>{/each}
              </select>
            </label>
            <label>
              <span>{t('conn.design.grade')}</span>
              <select
                data-testid="jd-grade"
                value={chosen.bolts?.grade ?? 'A325'}
                onchange={(e) => setBolts({ grade: e.currentTarget.value as never })}
              >
                {#each BOLT_GRADES as g (g)}<option value={g}>{g}</option>{/each}
              </select>
            </label>
            <label>
              <span>{t('conn.design.count')}</span>
              <input
                type="number" min="1" step="1" data-testid="jd-count"
                value={chosen.bolts?.count ?? 4}
                onchange={(e) => {
                  // A count is never absent: the field always holds a number, so an unusable
                  // entry keeps the last good one and the input reverts to it visibly.
                  const r = readField('count', e.currentTarget.value, { min: 1 });
                  if (r.kind === 'value') setBolts({ count: r.value });
                  else reflect(e.currentTarget, chosen.bolts?.count);
                }}
              />
            </label>
            <label>
              <span>{t('conn.design.rows')}</span>
              <input
                type="number" min="1" step="1" data-testid="jd-rows"
                value={chosen.bolts?.rows ?? 2}
                onchange={(e) => {
                  const r = readField('rows', e.currentTarget.value, { min: 1 });
                  if (r.kind === 'value') setBolts({ rows: r.value });
                  else reflect(e.currentTarget, chosen.bolts?.rows);
                }}
              />
            </label>
            <label>
              <span>{t('conn.design.spacing')}</span>
              <input
                type="number" min="0" step="1" data-testid="jd-spacing"
                value={chosen.bolts?.spacingMm ?? 70}
                onchange={(e) => {
                  // Zero is passed through rather than refused here: a spacing of 0 is what
                  // §J.3.3's `s ≥ 3d` exists to reject, and a check reporting it is a better
                  // place for that refusal than an input silently swallowing it.
                  const r = readField('spacing', e.currentTarget.value, { min: 0 });
                  if (r.kind === 'value') setBolts({ spacingMm: r.value });
                  else reflect(e.currentTarget, chosen.bolts?.spacingMm);
                }}
              />
            </label>
            <label>
              <span>{t('conn.design.edge')}</span>
              <input
                type="number" min="0" step="1" data-testid="jd-edge"
                value={chosen.bolts?.edgeDistanceMm ?? 40}
                onchange={(e) => {
                  // Likewise: a bolt at the plate edge is §J.3.4's business, not the input's.
                  const r = readField('edge', e.currentTarget.value, { min: 0 });
                  if (r.kind === 'value') setBolts({ edgeDistanceMm: r.value });
                  else reflect(e.currentTarget, chosen.bolts?.edgeDistanceMm);
                }}
              />
            </label>
            <label>
              <span>{t('conn.design.plateThickness')}</span>
              <input
                type="number" min="0" step="1" data-testid="jd-plate-t"
                value={chosen.plate?.thicknessMm ?? ''}
                onchange={(e) => {
                  // A 0 mm plate is not a thin plate, it is no plate — and a capacity computed
                  // from it would read as an ordinary overstress instead of a missing input.
                  const r = readField('plate-t', e.currentTarget.value, { zero: 'invalid' });
                  if (r.kind === 'value') setPlate({ thicknessMm: r.value });
                  else if (r.kind === 'empty') setPlate({ thicknessMm: undefined });
                  else reflect(e.currentTarget, chosen.plate?.thicknessMm);
                }}
              />
            </label>
            <label>
              <span>{t('conn.design.plateFu')}</span>
              <input
                type="number" min="0" step="10" data-testid="jd-plate-fu"
                value={chosen.plate?.fuMPa ?? ''}
                onchange={(e) => {
                  const r = readField('plate-fu', e.currentTarget.value, { zero: 'invalid' });
                  if (r.kind === 'value') setPlate({ fuMPa: r.value });
                  else if (r.kind === 'empty') setPlate({ fuMPa: undefined });
                  else reflect(e.currentTarget, chosen.plate?.fuMPa);
                }}
              />
            </label>
          </div>
          
          <!--
            What the panel could not use, said out loud.
          
            The alternative — and what this replaces — is a field that looks accepted while holding
            something else. A batten gap typed as 0 became 10, and the only visible consequence was
            battens appearing on an arrangement §E.6.1 places none on. An input that refuses has to
            say so, or it is indistinguishable from one that agreed.
          -->
          {#if fieldProblem && (!fieldProblem.field.includes('-') || fieldProblem.field.startsWith('plate-'))}
            <p class="jd-problem" role="status" data-testid="jd-input-problem">
              {t(fieldProblem.reasonKey)}
            </p>
          {/if}

          <!-- Every check, with its clause. A check that could not run says why. -->
          <table class="jd-checks" data-testid="joint-checks">
            <tbody>
              {#each design.bolts.checks as c (c.id)}
                <tr data-state={c.state} data-testid={`jd-check-${c.id}`}>
                  <th scope="row">{t(`conn.check.${c.id}`)}</th>
                  <td class="mono">
                    {#if c.capacityKN !== null && c.demandKN !== null}
                      {c.demandKN.toFixed(1)} / {c.capacityKN.toFixed(1)} kN
                    {:else if c.ratio !== null}
                      {(c.ratio * 100).toFixed(0)} %
                    {:else}—{/if}
                  </td>
                  <td class="jd-clause">§{c.clause}</td>
                  <td class="jd-state-cell">{t(`conn.checkState.${c.state}`)}</td>
                </tr>
                {#if c.noteKeys.length > 0}
                  <tr class="why"><td colspan="4">{c.noteKeys.map((k) => t(k)).join(' · ')}</td></tr>
                {/if}
              {/each}
            </tbody>
          </table>

          {#if design.bolts.missingKeys.length > 0}
            <ul class="jd-missing" data-testid="joint-missing">
              {#each design.bolts.missingKeys as k (k)}<li>{t(k)}</li>{/each}
            </ul>
          {/if}

          <!-- The plate: the same entity the viewport extrudes. -->
          <!-- ── Weld ─────────────────────────────────────────────── -->
          <section class="jd-sub" data-testid="joint-weld">
            <header class="jd-head">
              <span class="jd-title">{t('conn.weld.title')}</span>
              {#if design.weld}
                <span class="jd-state" data-state={design.weld.state} data-testid="joint-weld-state">
                  {t(`joint.state.${design.weld.state}`)}
                </span>
              {:else}
                <button
                  type="button" class="jd-add" data-testid="joint-weld-add"
                  onclick={() => setWeld({ legMm: 6, lengthMm: 200, runs: 2, process: 'manual', loading: 'other' })}
                >{t('conn.weld.add')}</button>
              {/if}
            </header>

            {#if !design.weld}
              <!-- An absent weld is absent, not incomplete. Most bolted joints have none. -->
              <p class="conn-explain" data-testid="joint-weld-none">{t('conn.weld.none')}</p>
            {:else}
              <div class="jd-form">
                <label>
                  <span>{t('conn.weld.leg')}</span>
                  <input
                    type="number" min="0" step="1" data-testid="jw-leg"
                    value={design.weld.throatMm !== null ? (chosen.weld?.legMm ?? 6) : ''}
                    onchange={(e) => {
                      const r = readField('w-leg', e.currentTarget.value, { zero: 'invalid' });
                      if (r.kind === 'value') setWeld({ legMm: r.value });
                      else if (r.kind === 'empty') setWeld({ legMm: undefined });
                      else reflect(e.currentTarget, chosen.weld?.legMm);
                    }}
                  />
                </label>
                <label>
                  <span>{t('conn.weld.length')}</span>
                  <input
                    type="number" min="0" step="10" data-testid="jw-length"
                    value={chosen.weld?.lengthMm ?? 200}
                    onchange={(e) => {
                      const r = readField('w-length', e.currentTarget.value, { zero: 'invalid' });
                      if (r.kind === 'value') setWeld({ lengthMm: r.value });
                      else if (r.kind === 'empty') setWeld({ lengthMm: undefined });
                      else reflect(e.currentTarget, chosen.weld?.lengthMm);
                    }}
                  />
                </label>
                <label>
                  <span>{t('conn.weld.runs')}</span>
                  <!-- One run or two: a fillet on one side of the plate, or on both. Nothing
                       else is a run count a detailer names. -->
                  <select
                    data-testid="jw-runs"
                    value={String(chosen.weld?.runs ?? 2)}
                    onchange={(e) => setWeld({ runs: Number(e.currentTarget.value) })}
                  >
                    <option value="1">{t('conn.weld.runsOne')}</option>
                    <option value="2">{t('conn.weld.runsTwo')}</option>
                  </select>
                </label>
                <label>
                  <span>{t('conn.weld.fexx')}</span>
                  <input
                    type="number" min="0" step="10" data-testid="jw-fexx"
                    value={chosen.weld?.fexxMPa ?? ''}
                    onchange={(e) => {
                      const r = readField('w-fexx', e.currentTarget.value, { zero: 'invalid' });
                      if (r.kind === 'value') setWeld({ fexxMPa: r.value });
                      else if (r.kind === 'empty') setWeld({ fexxMPa: undefined });
                      else reflect(e.currentTarget, chosen.weld?.fexxMPa);
                    }}
                  />
                </label>
                <label>
                  <span>{t('conn.weld.thicker')}</span>
                  <input
                    type="number" min="0" step="1" data-testid="jw-thicker"
                    value={chosen.weld?.thickerPartMm ?? ''}
                    onchange={(e) => {
                      const r = readField('w-thicker', e.currentTarget.value, { zero: 'invalid' });
                      if (r.kind === 'value') setWeld({ thickerPartMm: r.value });
                      else if (r.kind === 'empty') setWeld({ thickerPartMm: undefined });
                      else reflect(e.currentTarget, chosen.weld?.thickerPartMm);
                    }}
                  />
                </label>
                <label>
                  <span>{t('conn.weld.thinner')}</span>
                  <input
                    type="number" min="0" step="1" data-testid="jw-thinner"
                    value={chosen.weld?.thinnerPartMm ?? ''}
                    onchange={(e) => {
                      const r = readField('w-thinner', e.currentTarget.value, { zero: 'invalid' });
                      if (r.kind === 'value') setWeld({ thinnerPartMm: r.value });
                      else if (r.kind === 'empty') setWeld({ thinnerPartMm: undefined });
                      else reflect(e.currentTarget, chosen.weld?.thinnerPartMm);
                    }}
                  />
                </label>
                <label>
                  <span>{t('conn.weld.process')}</span>
                  <!-- The clause makes the effective throat differ by up to 41 % between these
                       two, so it is a choice and not an assumption. -->
                  <select
                    data-testid="jw-process"
                    value={chosen.weld?.process ?? 'manual'}
                    onchange={(e) => setWeld({ process: e.currentTarget.value as never })}
                  >
                    <option value="manual">{t('conn.weld.processManual')}</option>
                    <option value="submergedArc">{t('conn.weld.processSaw')}</option>
                  </select>
                </label>
                <label>
                  <span>{t('conn.weld.loading')}</span>
                  <select
                    data-testid="jw-loading"
                    value={chosen.weld?.loading ?? 'other'}
                    onchange={(e) => setWeld({ loading: e.currentTarget.value as never })}
                  >
                    <option value="other">{t('conn.weld.loadingOther')}</option>
                    <option value="endLoaded">{t('conn.weld.loadingEnd')}</option>
                  </select>
                </label>
              </div>
              
              <!--
                What the panel could not use, said out loud.
              
                The alternative — and what this replaces — is a field that looks accepted while holding
                something else. A batten gap typed as 0 became 10, and the only visible consequence was
                battens appearing on an arrangement §E.6.1 places none on. An input that refuses has to
                say so, or it is indistinguishable from one that agreed.
              -->
              {#if fieldProblem && fieldProblem.field.startsWith('w-')}
                <p class="jd-problem" role="status" data-testid="jw-input-problem">
                  {t(fieldProblem.reasonKey)}
                </p>
              {/if}

              <!--
                The effective throat, shown because it is what the process control changes and
                because §J.2.2(a) makes that difference up to 41 %: for submerged arc the throat
                is the LEG itself up to 9 mm, against 0,707·w for a manual fillet.
              -->
              <dl class="jd-demands" data-testid="joint-weld-derived">
                <dt>{t('conn.weld.throat')}</dt>
                <dd class="mono" data-testid="jw-throat">
                  {design.weld.throatMm !== null ? `${design.weld.throatMm.toFixed(2)} mm` : '—'}
                </dd>
                <dt>{t('conn.weld.effectiveLength')}</dt>
                <dd class="mono" data-testid="jw-effective-length">
                  {design.weld.effectiveLengthMm !== null
                    ? `${design.weld.effectiveLengthMm.toFixed(0)} mm` : '—'}
                </dd>
                <dt>{t('conn.weld.area')}</dt>
                <dd class="mono" data-testid="jw-area">
                  {design.weld.effectiveAreaCm2 !== null
                    ? `${design.weld.effectiveAreaCm2.toFixed(2)} cm²` : '—'}
                </dd>
              </dl>

              <table class="jd-checks" data-testid="joint-weld-checks">
                <tbody>
                  {#each design.weld.checks as c (c.id)}
                    <tr data-state={c.state} data-testid={`jw-check-${c.id}`}>
                      <th scope="row">{t(`conn.weldCheck.${c.id}`)}</th>
                      <td class="mono">
                        {#if c.value !== null && c.limit !== null}
                          {c.value.toFixed(1)} / {c.limit.toFixed(1)}
                        {:else}—{/if}
                      </td>
                      <td class="jd-clause">§{c.clause}</td>
                      <td class="jd-state-cell">{t(`conn.checkState.${c.state}`)}</td>
                    </tr>
                    {#if c.noteKeys.length > 0}
                      <tr class="why"><td colspan="4">{c.noteKeys.map((k) => t(k)).join(' · ')}</td></tr>
                    {/if}
                  {/each}
                </tbody>
              </table>

              {#if design.weld.missingKeys.length > 0}
                <ul class="jd-missing" data-testid="joint-weld-missing">
                  {#each design.weld.missingKeys as k (k)}<li>{t(k)}</li>{/each}
                </ul>
              {/if}

              <!--
                Why a complete, adequate fillet still cannot be called designed. Stated on the
                surface rather than left in the state word, because «notVerifiable» does not say
                WHICH limit state was skipped.
              -->
              {#if design.weld.state === 'notVerifiable'}
                <p class="conn-explain warn" data-testid="joint-weld-j4">{t('conn.weld.j4Pending')}</p>
              {/if}
              <button
                type="button" class="jd-add" data-testid="joint-weld-remove"
                onclick={() => setWeld(null)}
              >{t('conn.weld.remove')}</button>
            {/if}
          </section>

          <!-- ── Battens ──────────────────────────────────────────── -->
          <section class="jd-sub" data-testid="joint-battens">
            <header class="jd-head">
              <span class="jd-title">{t('battens.title')}</span>
              {#if !chosen.battens}
                <button
                  type="button" class="jd-add" data-testid="joint-battens-add"
                  onclick={() => setBattens({
                    arrangement: 'doubleBack', gapMm: 10, segments: 3,
                    memberId: referenceMember?.id, lengthM: referenceMember?.lengthM,
                  })}
                >{t('conn.battens.add')}</button>
              {/if}
            </header>

            {#if !chosen.battens}
              <p class="conn-explain" data-testid="joint-battens-none">{t('conn.battens.none')}</p>
            {:else}
              <!--
                The form is OUTSIDE the available/unavailable split, and that is the point.
              
                It used to sit inside the `available` branch, so typing a gap of 0 — Group I, chords in
                continuous contact — removed the layout AND the gap box with it. The state was correct and
                the user was stuck in it: the only control that could undo the choice had been unmounted
                by the choice. Group I became a one-way door.
              
                These fields describe what the user CHOSE, not what the clause produced, so they belong to
                the section rather than to one of its two outcomes.
              -->
              <div class="jd-form">
                <label>
                  <span>{t('conn.battens.member')}</span>
                  <!--
                    The member the layout is for, named rather than implied.
                    Offered as a selector whenever more than one member meets the joint: with one
                    member there is nothing to choose, and a control with a single option teaches
                    a reader that a decision exists where none does.
                  -->
                  {#if jointMembers.length > 1}
                    <select
                      data-testid="jb-member"
                      value={String(referenceMember?.id ?? '')}
                      onchange={(e) => {
                        const id = Number(e.currentTarget.value);
                        const m = jointMembers.find((x) => x.id === id);
                        setBattens({ memberId: id, lengthM: m?.lengthM });
                      }}
                    >
                      {#each jointMembers as m (m.id)}
                        <option value={m.id}>E{m.id} · {m.family} · {m.lengthM.toFixed(2)} m</option>
                      {/each}
                    </select>
                  {:else}
                    <span class="mono" data-testid="jb-member">
                      E{referenceMember?.id ?? '—'} · {referenceMember?.family ?? '—'}
                    </span>
                  {/if}
                </label>
                <label>
                  <span>{t('conn.battens.segments')}</span>
                  <!-- Three is the code's minimum, and the control offers nothing below it:
                       §E.6.3.2(b)(2) does not permit two. -->
                  <select
                    data-testid="jb-segments"
                    value={String(chosen.battens.segments ?? 3)}
                    onchange={(e) => setBattens({ segments: Number(e.currentTarget.value) })}
                  >
                    {#each [3, 4, 5, 6, 8] as n (n)}<option value={n}>{n}</option>{/each}
                  </select>
                </label>
                <label>
                  <span>{t('conn.battens.chordRi')}</span>
                  <input
                    type="number" min="0" step="0.1" data-testid="jb-chord-ri"
                    value={chosen.battens.chordRiMm ?? ''}
                    onchange={(e) => {
                      // A radius of gyration of zero is not a slender chord; it is no chord.
                      const r = readField('b-chord-ri', e.currentTarget.value, { zero: 'invalid' });
                      if (r.kind === 'value') setBattens({ chordRiMm: r.value });
                      else if (r.kind === 'empty') setBattens({ chordRiMm: undefined });
                      else reflect(e.currentTarget, chosen.battens?.chordRiMm);
                    }}
                  />
                </label>
                <label>
                  <span>{t('conn.battens.gap')}</span>
                  <!--
                    Zero is a real value here, not an empty field: chords in continuous contact
                    are §E.6.1's Group I, joined by bolts or welds rather than by battens. The
                    `|| 1` fallback this replaces turned a deliberate 0 into a 1 and made that
                    configuration unreachable from the panel — the section then claimed battens
                    for an arrangement §E.6 places none on.
                  -->
                  <input
                    type="number" min="0" step="1" data-testid="jb-gap"
                    value={chosen.battens.gapMm ?? 10}
                    onchange={(e) => {
                      const r = readField('b-gap', e.currentTarget.value, { min: 0, zero: 'valid' });
                      if (r.kind === 'value') setBattens({ gapMm: r.value });
                      // A cleared field is the one case that may fall back to the default: the
                      // user has expressed nothing, so the panel proposes the usual 10 mm. A
                      // negative one does not — it is reported, and the stored gap is untouched.
                      else if (r.kind === 'empty') {
                        setBattens({ gapMm: 10 });
                        reflect(e.currentTarget, 10);
                      } else reflect(e.currentTarget, chosen.battens?.gapMm);
                    }}
                  />
                </label>
              </div>
                
                <!--
                  What the panel could not use, said out loud.
                
                  The alternative — and what this replaces — is a field that looks accepted while holding
                  something else. A batten gap typed as 0 became 10, and the only visible consequence was
                  battens appearing on an arrangement §E.6.1 places none on. An input that refuses has to
                  say so, or it is indistinguishable from one that agreed.
                -->
                {#if fieldProblem && fieldProblem.field.startsWith('b-')}
                  <p class="jd-problem" role="status" data-testid="jb-input-problem">
                    {t(fieldProblem.reasonKey)}
                  </p>
                {/if}

              <!--
                The reference member, spelled out. «Longitud» alone was the ambiguity this
                replaces: a joint has several members and only one of them is being battened.
              -->
              <p class="conn-explain" data-testid="jb-reference">
                {tp('conn.battens.reference', {
                  id: referenceMember?.id ?? 0,
                  family: referenceMember?.family ?? '—',
                  length: (referenceMember?.lengthM ?? 0).toFixed(2),
                  end: referenceMember?.end ?? '—',
                })}
              </p>
              {#if jointMembers.length > 1 && chosen.battens.memberId === undefined}
                <p class="conn-explain" data-testid="jb-preloaded">{t('conn.battens.preloaded')}</p>
              {/if}

              {#if design.battens?.state === 'available'}
              <dl class="jd-demands" data-testid="joint-battens-layout">
                <dt>{t('battens.spacing')}</dt>
                <dd class="mono">{(design.battens.layout.spacingM * 1000).toFixed(0)} mm</dd>
                <dt>{t('battens.planes')}</dt>
                <dd class="mono">{design.battens.layout.planes}</dd>
                <dt>{t('conn.battens.stations')}</dt>
                <dd class="mono" data-testid="jb-stations">
                  {design.battens.layout.stations.map((st) => st.atM.toFixed(2)).join(' · ')} m
                </dd>
                <dt>{t('battens.rule.chordUnbracedLengthIsA')}</dt>
                <dd class="mono">{(design.battens.layout.chordUnbracedLengthM * 1000).toFixed(0)} mm</dd>
                <!--
                  §E.6.3.2(b)(3): «las presillas de cada plano se colocarán enfrentadas». Stated
                  because it is a fabrication instruction that no dimension carries.
                -->
                <dt>{t('conn.battens.facing')}</dt>
                <dd data-testid="jb-facing">{t('battens.rule.facedAcrossPlanes')}</dd>
                <!--
                  `a / ri` — §E.6.3.1(b)'s λ₁, the chord's slenderness between battens. Shown with
                  the chord radius as an input, because the app cannot know which of the members
                  meeting a joint is the chord being battened.
                -->
                <dt>{t('conn.battens.slenderness')}</dt>
                <dd class="mono" data-testid="jb-slenderness">
                  {chosen.battens?.chordRiMm && chosen.battens.chordRiMm > 0
                    ? (design.battens.layout.chordUnbracedLengthM * 1000 / chosen.battens.chordRiMm).toFixed(1)
                    : '—'}
                </dd>
              </dl>

              <!--
                The plate §E.6 does not dimension. Shown with the condition it would have to
                satisfy, so a reader knows what is missing rather than that something is.
              -->
              <p class="jd-plate warn" data-testid="joint-battens-plate">
                {design.battens.layout.plate.state} ·
                {design.battens.layout.plate.missingKeys.map((k) => t(k)).join(' · ')} ·
                §{design.battens.layout.plate.conditionClause}
              </p>
              <button
                type="button" class="jd-add" data-testid="joint-battens-remove"
                onclick={() => setBattens(null)}
              >{t('conn.battens.remove')}</button>
              {:else}
              <p class="conn-explain warn" data-testid="joint-battens-unavailable">
                {(design.battens?.state === 'UNAVAILABLE' ? design.battens.missingKeys : [])
                  .map((k) => t(k)).join(' · ')}
              </p>
              <button
                type="button" class="jd-add" data-testid="joint-battens-remove"
                onclick={() => setBattens(null)}
              >{t('conn.battens.remove')}</button>
              {/if}
            {/if}
          </section>

          {#if design.plate.state === 'available'}
            <p class="jd-plate" data-testid="joint-plate">
              {tp('conn.design.plateSummary', {
                l: (design.plate.plate.lengthM * 1000).toFixed(0),
                w: (design.plate.plate.widthM * 1000).toFixed(0),
                t: (design.plate.plate.thicknessM * 1000).toFixed(0),
                n: design.plate.plate.holesM.length,
              })}
            </p>
          {:else}
            <p class="jd-plate warn" data-testid="joint-plate-unavailable">
              GEOMETRY_UNAVAILABLE · {design.plate.missingKeys.map((k) => t(k)).join(' · ')}
            </p>
          {/if}
        </section>
      {/if}

      <div class="conn-forces-block">
        <span class="conn-label-title">{t('conn.forcesAt')} N{selectedJoint.nodeId}</span>
      {#if jointForces}
        <div class="conn-forces-table">
          <table>
            <thead><tr><th>Elem</th><th>End</th><th>N</th><th>Vy</th><th>Vz</th><th>My</th><th>Mz</th></tr></thead>
            <tbody>
              {#each jointForces.elements as ef}
                <tr>
                  <td class="mono">E{ef.elementId}</td>
                  <td class="mono">{ef.end}</td>
                  <td class="mono">{fmtN(ef.N)}</td>
                  <td class="mono">{fmtN(ef.Vy)}</td>
                  <td class="mono">{fmtN(ef.Vz)}</td>
                  <td class="mono">{fmtN(ef.My)}</td>
                  <td class="mono">{fmtN(ef.Mz)}</td>
                </tr>
              {/each}
            </tbody>
          </table>
          <div class="conn-force-summary">
            V<sub>max</sub>={fmtN(jointForces.maxV)} kN &nbsp;|&nbsp;
            N<sub>max</sub>={fmtN(jointForces.maxN)} kN &nbsp;|&nbsp;
            M<sub>max</sub>={fmtN(jointForces.maxM)} kN·m
          </div>
        </div>
      {:else}
        <div class="conn-no-results">{t('conn.noResults')}</div>
      {/if}
      </div>
    {/if}
  </StageSection>

  <!-- ── 2 · Bolts ───────────────────────────────────────────────── -->
  <StageSection
    step={2}
    title={t('conn.sec.bolts.title')}
    purpose={t('conn.sec.bolts.purpose')}
    state={boltResult ? 'done' : selectedJoint ? 'current' : 'blocked'}
    blockedBy={t('conn.sec.bolts.blocked')}
    badge={boltResult ? `${(boltResult.governingRatio * 100).toFixed(0)}%` : undefined}
    testid="conn-sec-bolts"
    bind:open={openBolts}
  >
    {#if selectedJoint}
      <p class="conn-explain" data-testid="conn-bolt-grades">{t('conn.bolts.grades')}</p>

        <div class="conn-form-grid">
          <label>∅ (mm) <input type="number" class="conn-inp" bind:value={boltDia} min={6} max={36} step={2} /></label>
          <label>{t('conn.grade')} <select class="conn-sel" bind:value={boltGrade}><option value="4.6">4.6</option><option value="5.6">5.6</option><option value="8.8">8.8</option><option value="10.9">10.9</option></select></label>
          <label>n <input type="number" class="conn-inp" bind:value={boltCount} min={1} max={50} /></label>
          <label>{t('conn.shearPlanes')} <input type="number" class="conn-inp" bind:value={boltShearPlanes} min={1} max={2} /></label>
          <label>t (mm) <input type="number" class="conn-inp" bind:value={boltPlateThickness} min={3} max={50} /></label>
          <label>Fu (MPa) <input type="number" class="conn-inp" bind:value={boltPlateFu} min={300} max={700} step={10} /></label>
          <label>Le (mm) <input type="number" class="conn-inp" bind:value={boltEdgeDist} min={15} max={100} /></label>
          <label class="conn-check-label"><input type="checkbox" bind:checked={boltThreadsInShear} /> {t('conn.threadsInShear')}</label>
        </div>
        <div class="conn-force-inputs">
          <label>Vu (kN) <input type="number" class="conn-inp" bind:value={boltVu} step={1} /></label>
          <label>Tu (kN) <input type="number" class="conn-inp" bind:value={boltTu} min={0} step={1} /></label>
          {#if jointForces}
            <button class="conn-btn-auto" onclick={autoFillBoltForces}>{t('conn.autoFill')}</button>
          {/if}
          <button class="conn-btn-verify" onclick={runBoltCheck}>{t('conn.verify')}</button>
        </div>
        {#if boltResult}
          <div class="conn-result-card {statusClass(boltResult.status)}">
            <div class="conn-result-row"><span>{t('conn.shear')}</span><span>φRn={fmtN(boltResult.phiRnShear)} kN — {(boltResult.ratioShear * 100).toFixed(0)}%</span></div>
            <div class="conn-result-row"><span>{t('conn.tension')}</span><span>φRn={fmtN(boltResult.phiRnTension)} kN — {(boltResult.ratioTension * 100).toFixed(0)}%</span></div>
            <div class="conn-result-row"><span>{t('conn.bearing')}</span><span>φRn={fmtN(boltResult.phiRnBearing)} kN — {(boltResult.ratioBearing * 100).toFixed(0)}%</span></div>
            <div class="conn-result-row"><span>{t('conn.interaction')}</span><span>{(boltResult.ratioInteraction * 100).toFixed(0)}%</span></div>
            <div class="conn-result-governing">
              {t('conn.governing')}: {(boltResult.governingRatio * 100).toFixed(0)}%
              <span class="conn-status-icon {statusClass(boltResult.status)}">
                {boltResult.status === 'ok' ? '✓' : boltResult.status === 'warn' ? '⚠' : '✗'}
              </span>
            </div>
          </div>
        {/if}

      <p class="conn-explain" data-testid="conn-bolt-explain">{t('conn.bolts.resultsExplain')}</p>
      <!--
        Beside the result, not only in the gap list.

        The fallback to the threads-included value is correct and conservative, and it is
        silent — and it is bound to a checkbox the user is at that moment ticking. A warning
        that only appeared at the bottom of the panel would be true and useless.
      -->
      {#if fvExclUnavailable}
        <p class="conn-warn" role="note" data-testid="conn-fvexcl-warning">
          {tp('conn.bolts.fvExclWarning', { grade: boltGrade })}
        </p>
      {/if}
      <p class="conn-experimental" data-testid="conn-bolts-experimental">{t('conn.experimentalCalc')}</p>
    {:else}
      <p class="conn-empty-note" data-testid="conn-bolts-empty">{t('conn.sec.bolts.blocked')}</p>
    {/if}
  </StageSection>

  <!-- ── 3 · Welds ───────────────────────────────────────────────── -->
  <StageSection
    step={3}
    title={t('conn.sec.welds.title')}
    purpose={t('conn.sec.welds.purpose')}
    state={weldResult ? 'done' : selectedJoint ? 'current' : 'blocked'}
    blockedBy={t('conn.sec.welds.blocked')}
    badge={weldResult ? `${(weldResult.ratio * 100).toFixed(0)}%` : undefined}
    testid="conn-sec-welds"
    bind:open={openWelds}
  >
    {#if selectedJoint}
      <p class="conn-explain" data-testid="conn-weld-explain">{t('conn.welds.explain')}</p>

        <div class="conn-form-grid">
          <label>a (mm) <input type="number" class="conn-inp" bind:value={weldLeg} min={3} max={25} /></label>
          <label>L (mm) <input type="number" class="conn-inp" bind:value={weldLength} min={20} max={3000} /></label>
          <label>Fexx (MPa) <input type="number" class="conn-inp" bind:value={weldFexx} min={350} max={700} step={10} /></label>
          <label>t (mm) <input type="number" class="conn-inp" bind:value={weldPlateThickness} min={3} max={50} /></label>
        </div>
        <div class="conn-force-inputs">
          <label>Vu (kN) <input type="number" class="conn-inp" bind:value={weldVu} step={1} /></label>
          {#if jointForces}
            <button class="conn-btn-auto" onclick={autoFillWeldForces}>{t('conn.autoFill')}</button>
          {/if}
          <button class="conn-btn-verify" onclick={runWeldCheck}>{t('conn.verify')}</button>
        </div>
        {#if weldResult}
          <div class="conn-result-card {statusClass(weldResult.status)}">
            <div class="conn-result-row"><span>{t('conn.throat')}</span><span>te={weldResult.throatEff.toFixed(1)} mm</span></div>
            <div class="conn-result-row"><span>{t('conn.capacity')}</span><span>φRn={fmtN(weldResult.phiRn)} kN</span></div>
            <div class="conn-result-row"><span>{t('conn.sizeRange')}</span><span>{weldResult.minSize}–{weldResult.maxSize} mm {weldResult.sizeOk ? '✓' : '✗'}</span></div>
            <div class="conn-result-row"><span>L ≥ 4a</span><span>{weldResult.lengthOk ? '✓' : '✗'}</span></div>
            <div class="conn-result-governing">
              {t('conn.utilization')}: {(weldResult.ratio * 100).toFixed(0)}%
              <span class="conn-status-icon {statusClass(weldResult.status)}">
                {weldResult.status === 'ok' ? '✓' : weldResult.status === 'warn' ? '⚠' : '✗'}
              </span>
            </div>
          </div>
        {/if}

      <p class="conn-experimental" data-testid="conn-welds-experimental">{t('conn.experimentalCalc')}</p>
    {:else}
      <p class="conn-empty-note" data-testid="conn-welds-empty">{t('conn.sec.welds.blocked')}</p>
    {/if}
  </StageSection>

  <!-- ── 4 · Limitations and known gaps ──────────────────────────── -->
  <StageSection
    step={4}
    title={t('conn.sec.gaps.title')}
    purpose={t('conn.sec.gaps.purpose')}
    state="optional"
    badge={GAPS.length}
    testid="conn-sec-gaps"
    bind:open={openGaps}
  >
    <!--
      Five entries, each answering the same four questions, because a limitation that only
      says what is missing leaves the reader unable to tell whether their result is usable.
      `affects` is the field that does the work: torsion is a number computed and not drawn,
      base metal rupture is a limit state nothing computes, and those are not the same thing.
    -->
    <ul class="conn-gaps" data-testid="conn-gaps">
      {#each GAPS as g (g.id)}
        <li class="conn-gap" data-testid="conn-gap-{g.id}" data-affects={g.affects}>
          <p class="conn-gap-title">{t(`conn.gap.${g.id}.title`)}</p>
          <dl class="conn-gap-facets">
            <dt>{t('conn.gap.exists')}</dt>
            <dd data-testid="conn-gap-{g.id}-exists">{t(`conn.gap.${g.id}.exists`)}</dd>
            <dt>{t('conn.gap.missing')}</dt>
            <dd data-testid="conn-gap-{g.id}-missing">{t(`conn.gap.${g.id}.missing`)}</dd>
            <dt>{t('conn.gap.affects')}</dt>
            <dd data-testid="conn-gap-{g.id}-affects">
              {g.affects ? t('conn.gap.affectsYes') : t('conn.gap.affectsNo')}
            </dd>
            <dt>{t('conn.gap.scope')}</dt>
            <dd data-testid="conn-gap-{g.id}-scope">{t(`conn.gap.${g.id}.scope`)}</dd>
          </dl>
          <p class="conn-gap-note">{t(`conn.gap.${g.id}.note`)}</p>
        </li>
      {/each}
    </ul>
    <p class="conn-experimental" data-testid="conn-gaps-not-certifiable">
      {t('conn.gap.notCertifiable')}
    </p>
  </StageSection>
</div>

<style>
  /* Same role and same weight as the metallic panel's banner: this is a maturity statement,
     not a decoration, and the two surfaces must not disagree about how loud it is. */
  .conn-banner {
    margin: 0 0 8px; padding: 7px 9px; border-radius: 4px;
    background: rgba(221, 170, 0, 0.10); border: 1px solid var(--st-warn);
    color: var(--st-text); font-size: 0.68rem; line-height: 1.45;
  }
  /* One sentence explaining a section, in the panel's own secondary colour. */
  .conn-explain {
    margin: 0 0 6px; font-size: 0.66rem; line-height: 1.45; color: var(--st-text-2);
  }
  /* Which members meet, split by material — the fact a mixed joint turns on. */
  .conn-members {
    display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 10px;
    margin: 0 0 6px; font-size: 0.66rem;
  }
  .conn-members-title { color: var(--st-text-2); font-weight: 600; }
  .conn-members-metallic { color: var(--st-text); font-family: var(--st-mono, monospace); }
  .conn-members-other { color: var(--st-text-3); font-family: var(--st-mono, monospace); }
  .conn-members em { font-style: normal; font-family: var(--st-sans); font-size: 0.62rem; }
  .conn-forces-block { margin-top: 8px; }
  /* A result-side warning: louder than an explanation, quieter than a failure. */
  .conn-warn {
    margin: 6px 0 0; padding: 5px 8px; border-left: 2px solid var(--st-warn);
    font-size: 0.66rem; line-height: 1.45; color: var(--st-text);
    background: rgba(221, 170, 0, 0.08);
  }
  /* The maturity line each calculating section repeats. Never green, never a tick. */
  .conn-experimental {
    margin: 8px 0 0; font-size: 0.63rem; line-height: 1.45; color: var(--st-warn);
  }
  .conn-empty-note {
    margin: 4px 0; font-size: 0.66rem; color: var(--st-text-3); line-height: 1.45;
  }
  .conn-gaps { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
  .conn-gap { border-left: 2px solid var(--st-hair-strong); padding-left: 8px; }
  /* Affects the result: the border says so before the words do — and the words still do. */
  .conn-gap[data-affects='true'] { border-left-color: var(--st-warn); }
  .conn-gap-title { margin: 0 0 4px; font-size: 0.7rem; font-weight: 600; color: var(--st-text); }
  .conn-gap-facets {
    display: grid; grid-template-columns: auto 1fr; gap: 2px 8px; margin: 0;
    font-size: 0.64rem; line-height: 1.4;
  }
  .conn-gap-facets dt { color: var(--st-text-3); font-weight: 600; white-space: nowrap; }
  .conn-gap-facets dd { margin: 0; color: var(--st-text-2); }
  .conn-gap-note { margin: 4px 0 0; font-size: 0.63rem; color: var(--st-text-3); line-height: 1.4; }

  .conn-filtered {
    margin: 4px 0 6px; font-size: 0.66rem; line-height: 1.4; color: var(--st-text-2);
  }

  .conn-tab { display: flex; flex-direction: column; height: 100%; overflow-y: auto; }
  .conn-section { border-bottom: 1px solid var(--st-surface-3); }
  .conn-section-header { padding: 8px 10px; }
  .conn-label-title { font-size: 0.78rem; color: var(--st-text-2); font-weight: 600; }
  /* A blocked emptiness is not the same as an ordinary one, and reads differently. */
  .conn-empty-blocked { color: var(--st-warn); text-align: left; }
  .conn-empty-blocked p { margin: 0 0 4px; line-height: 1.4; }
  .conn-why { color: var(--st-text-2); font-size: 0.68rem; }

  .jd-sub { display: flex; flex-direction: column; gap: 4px; margin-top: 8px;
    border-top: 1px solid var(--st-hair); padding-top: 6px; }
  .jd-add {
    padding: 2px 8px; font-size: 0.64rem; cursor: pointer;
    background: transparent; color: var(--st-text-2);
    border: 1px solid var(--st-hair); border-radius: 3px;
  }
  .conn-explain.warn { color: var(--st-warn); }

  .jd { display: flex; flex-direction: column; gap: 6px; margin: 8px 0; }
  .jd-head { display: flex; align-items: baseline; justify-content: space-between; }
  .jd-title { font-size: 0.72rem; font-weight: 600; color: var(--st-text-2); }
  /* A state is a word, never a colour alone — and `designed` is not green: it is not an approval. */
  .jd-state { font-size: 0.68rem; color: var(--st-text-2); }
  .jd-state[data-state='exceeded'] { color: var(--st-danger, var(--st-warn)); }
  .jd-state[data-state='notVerifiable'], .jd-state[data-state='incomplete'] { color: var(--st-warn); }
  .jd-demands { display: grid; grid-template-columns: auto 1fr; gap: 2px 8px; margin: 0; font-size: 0.7rem; }
  .jd-demands dt { color: var(--st-text-2); }
  .jd-demands dd { margin: 0; }
  .jd-from { color: var(--st-text-3); font-size: 0.64rem; margin-left: 6px; }
  /* Warning-coloured and inline with the form it belongs to, not a toast: the field the user
     just left is still under their eye, and a message that scrolls away with the panel is a
     message they will act on after the value is already stored. */
  .jd-problem {
    grid-column: 1 / -1; margin: 2px 0 0; font-size: 0.65rem;
    color: var(--st-warn); line-height: 1.35;
  }
  .jd-form { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 8px; }
  .jd-form label { display: flex; align-items: center; gap: 4px; font-size: 0.68rem; color: var(--st-text-2); }
  .jd-form label > span { min-width: 5.5rem; }
  .jd-form input, .jd-form select {
    background: var(--st-bg); color: var(--st-text); border: 1px solid var(--st-surface-3);
    border-radius: 3px; padding: 2px 4px; font-size: 0.68rem; width: 5rem;
  }
  .jd-checks { width: 100%; border-collapse: collapse; font-size: 0.68rem; }
  .jd-checks th[scope='row'] { text-align: left; font-weight: 400; color: var(--st-text-2); padding: 2px 0; }
  .jd-checks td { padding: 2px 0 2px 8px; }
  .jd-clause { color: var(--st-text-3); font-size: 0.64rem; white-space: nowrap; }
  .jd-checks tr[data-state='exceeded'] .jd-state-cell { color: var(--st-warn); }
  .jd-checks tr.why td { padding: 0 0 4px; color: var(--st-text-3); font-size: 0.62rem; line-height: 1.3; }
  .jd-missing { margin: 0; padding-left: 1.1em; font-size: 0.66rem; color: var(--st-warn); }
  .jd-plate { margin: 0; font-size: 0.68rem; color: var(--st-text-2); }
  .jd-plate.warn { color: var(--st-warn); }
  .mono { font-family: var(--st-mono, monospace); }

  .conn-empty { text-align: center; color: var(--st-text-3); font-style: italic; padding: 20px 10px; font-size: 0.78rem; }

  .conn-joint-list { max-height: 180px; overflow-y: auto; }
  .conn-joint-row {
    display: flex; align-items: center; gap: 8px; width: 100%;
    padding: 5px 10px; font-size: 0.72rem; color: var(--st-text-2); background: transparent;
    border: none; border-bottom: 1px solid var(--st-surface-2); cursor: pointer; text-align: left;
  }
  .conn-joint-row:hover { background: rgba(127, 212, 204, 0.05); }
  .conn-joint-row.active { background: rgba(127, 212, 204, 0.1); color: var(--st-text); }
  .conn-node-id { font-weight: 600; color: var(--st-value); min-width: 35px; }
  .conn-elem-count { color: var(--st-text-3); }
  .conn-support-badge { font-size: 0.6rem; padding: 1px 5px; background: rgba(217, 164, 65, 0.2); color: var(--st-warn); border-radius: 3px; }
  .conn-coords { color: var(--st-text-3); font-family: monospace; font-size: 0.65rem; margin-left: auto; }

  .conn-forces-table { padding: 6px 10px; }
  .conn-forces-table table { width: 100%; border-collapse: collapse; font-size: 0.7rem; }
  .conn-forces-table th { font-size: 0.62rem; color: var(--st-text-3); text-transform: uppercase; font-weight: 600; text-align: right; padding: 3px 4px; border-bottom: 1px solid var(--st-surface-3); }
  .conn-forces-table td { padding: 3px 4px; border-bottom: 1px solid var(--st-surface-2); color: var(--st-text-2); }
  .mono { font-family: monospace; text-align: right; font-size: 0.7rem; }
  .conn-force-summary { font-size: 0.68rem; color: var(--st-text-3); padding: 4px 0; font-family: monospace; }
  .conn-no-results { font-size: 0.72rem; color: var(--st-text-3); font-style: italic; padding: 10px; }

  .conn-check-details { border-bottom: 1px solid var(--st-surface-3); }
  .conn-check-summary {
    padding: 8px 10px; font-size: 0.75rem; color: var(--st-text-2); cursor: pointer;
    display: flex; align-items: center; gap: 8px;
  }
  .conn-check-summary:hover { color: var(--st-text); }
  .conn-check-body { padding: 6px 10px 10px; }

  .conn-form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 5px; margin-bottom: 6px; }
  .conn-form-grid label { font-size: 0.68rem; color: var(--st-text-3); display: flex; align-items: center; gap: 4px; }
  .conn-inp {
    width: 60px; padding: 3px 5px; background: var(--st-surface-3); border: 1px solid var(--st-surface-3);
    border-radius: 3px; color: var(--st-text); font-size: 0.72rem; font-family: monospace; text-align: right;
  }
  .conn-inp:focus { border-color: var(--st-value); outline: none; }
  .conn-sel {
    padding: 3px 5px; background: var(--st-surface-3); border: 1px solid var(--st-surface-3);
    border-radius: 3px; color: var(--st-text); font-size: 0.72rem;
  }
  .conn-sel:focus { border-color: var(--st-text-2); outline: none; }
  .conn-check-label { font-size: 0.68rem; color: var(--st-text-3); display: flex; align-items: center; gap: 4px; cursor: pointer; }
  .conn-check-label input { accent-color: var(--st-text-2); }

  .conn-force-inputs { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-bottom: 6px; }
  .conn-force-inputs label { font-size: 0.68rem; color: var(--st-text-3); display: flex; align-items: center; gap: 4px; }
  .conn-btn-auto {
    padding: 3px 8px; font-size: 0.65rem; color: var(--st-text-2); background: transparent;
    border: 1px solid var(--st-value); border-radius: 3px; cursor: pointer;
  }
  .conn-btn-auto:hover { background: rgba(127, 212, 204, 0.1); }
  .conn-btn-verify {
    padding: 4px 12px; font-size: 0.72rem; font-weight: 600; color: var(--st-text);
    background: var(--st-surface-3); border:  1px solid var(--st-info); border-radius: 4px; cursor: pointer;
  }
  .conn-btn-verify:hover { background: var(--st-hair-strong); }

  .conn-ratio-badge {
    font-size: 0.62rem; font-weight: 700; padding: 1px 6px; border-radius: 8px; margin-left: auto;
    /* Transparent, so the three states are the same size and a change of status does not shift
       the row. `OutcomeBadge` reserves its border the same way, for the same reason. */
    border: 1px solid transparent;
  }
  /*
    ── The three ratio badges: the role moves to the border, the label goes neutral ──

    Each of these reports the governing demand/capacity ratio of a bolt group or a weld, as a
    label on a tinted fill. A 0.62rem chip has no room for a rule beside it, so the fill is the
    signal — and each used to carry its role colour AS THE LABEL. Composited over the two grounds
    this panel sits on, that does not hold:

        .st-ok    --st-ok      3.75 / 3.64   ✗ under AA
        .st-warn  --st-warn    5.22 / 5.03   ✓
        .st-fail  --st-accent  3.55 / 3.41   ✗ under AA — and the brand colour, not the status red

    Two of the three were illegible, and the failing one was also reaching for `--st-accent`: the
    primary-action vermillion rather than `--st-danger`. Swapping in the status red does not rescue
    it either, because at this alpha it is 4.46 over `--st-surface-2`.

    `--st-danger-bg` at the contract's 0.14 would give 4.96, but that token landed in H1's
    `dfa20d8b` and is not on this branch yet; referencing it here would be an undefined custom
    property, which draws nothing at all and is the failure `design-tokens-resolve.test.ts` exists
    to catch. So the tints stay literal and migrating them is one line in the commit that adopts
    the contract here.

    What changes is where the role lives. `--st-text` on these fills is 10.3–13.1, and the role
    keeps a border, which needs only the 3:1 WCAG 2.1 §1.4.11 asks of a non-text boundary and
    clears it on all three. It is the pattern H1's own migration settled on for
    `DesignToolbar .banner-block`: a status surface, a status border, neutral text.

    All three are changed rather than only the failing one. They are a set read one after another,
    and leaving `.st-warn` as the single badge whose label carries the hue would make the
    difference between states look like it meant something it does not.
  */
  .conn-ratio-badge.st-ok {
    background: rgba(34, 204, 102, 0.2); color: var(--st-text); border-color: var(--st-ok);
  }
  .conn-ratio-badge.st-warn {
    background: rgba(217, 164, 65, 0.2); color: var(--st-text); border-color: var(--st-warn);
  }
  .conn-ratio-badge.st-fail {
    background: rgba(229, 72, 42, 0.2); color: var(--st-text); border-color: var(--st-danger);
  }

  .conn-result-card {
    padding: 6px 8px; border-radius: 4px; font-size: 0.7rem;
    background: rgba(127, 212, 204, 0.05); border: 1px solid var(--st-surface-3);
  }
  .conn-result-card.st-fail { border-color: rgba(229, 72, 42, 0.3); background: rgba(229, 72, 42, 0.05); }
  .conn-result-card.st-warn { border-color: rgba(217, 164, 65, 0.3); background: rgba(217, 164, 65, 0.05); }
  .conn-result-row { display: flex; justify-content: space-between; padding: 2px 0; color: var(--st-text-2); }
  .conn-result-governing { display: flex; justify-content: space-between; padding: 4px 0 0; font-weight: 600; color: var(--st-text); border-top: 1px solid var(--st-surface-3); margin-top: 4px; }
  .conn-status-icon { font-size: 0.85rem; }
  .conn-status-icon.st-ok { color: var(--st-ok); }
  .conn-status-icon.st-warn { color: var(--st-warn); }
  .conn-status-icon.st-fail { color: var(--st-danger); }
</style>
