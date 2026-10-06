<script lang="ts">
  import { parseDecimal } from '../../lib/utils/numeric-input';
  /**
   * Specifications › Node links: ties between the degrees of freedom of nodes (rigid links,
   * diaphragms, equal DOFs, eccentric connections, linear MPCs) and connectors, stiffness between
   * two nodes. Drawn with the PRO panel kit, as every other part of Specifications: a card to
   * make one, the model's list under it.
   */
  import { modelStore } from '../../lib/store';
  import { detectFloorLevels } from '../../lib/engine/rigid-diaphragm';
  import DataTable from '../DataTable.svelte';
  import { t, tp } from '../../lib/i18n';

  /** Comma-tolerant numeric parse (same rule as ProLoadsTab.parseNum):
   *  '0,5' must read as 0.5, not silently truncate to 0 via parseFloat. */
  function parseNum(value: string): number {
    return parseDecimal(String(value)) ?? NaN;
  }

  // Discriminator strings must match the Rust Constraint variant rename
  // in engine/src/types/input.rs. Both `equalDOF` and `linearMPC` keep
  // the all-caps acronym; using camelCase here surfaces as a runtime
  // `Parse error: unknown variant ...` from the solver.
  type ConstraintKind = 'rigidLink' | 'diaphragm' | 'equalDOF' | 'linearMPC' | 'eccentricConnection';

  const constraintKinds = $derived([
    { value: 'rigidLink' as ConstraintKind, label: t('pro.rigidLink') },
    { value: 'diaphragm' as ConstraintKind, label: t('pro.diaphragm') },
    { value: 'equalDOF' as ConstraintKind, label: t('pro.equalDof') },
    { value: 'eccentricConnection' as ConstraintKind, label: t('pro.eccentricConnection') },
    { value: 'linearMPC' as ConstraintKind, label: t('pro.linearMpc') },
  ]);

  // 3D DOF order MUST mirror EccentricConnectionConstraint.releases ordering
  // in engine/src/types/input.rs: 3D = [ux, uy, uz, rx, ry, rz].
  const dofLabels = ['ux', 'uy', 'uz', 'rx', 'ry', 'rz'] as const;
  const planeOptions = ['XY', 'XZ', 'YZ'] as const;

  let selectedKind = $state<ConstraintKind>('rigidLink');

  // Rigid Link state
  let rlMaster = $state('');
  let rlSlave = $state('');
  let rlDofs = $state([true, true, true, true, true, true]);

  // Diaphragm state
  let dMaster = $state('');
  let dSlaves = $state('');
  let dPlane = $state<'XY' | 'XZ' | 'YZ'>('XY');

  // Equal DOF state
  let eqMaster = $state('');
  let eqSlave = $state('');
  let eqDofs = $state([true, true, true, false, false, false]);

  // Linear MPC state
  let mpcTerms = $state('');

  // Eccentric Connection state — translational releases live here, mirroring the
  // solver's EccentricConnectionConstraint shape: master/slave nodes coupled with
  // a rigid offset, with per-DOF release flags at the connection point.
  // releases[i] === true means DOF i is released (NOT constrained), so the slave
  // is free in that DOF — that's how a sliding bearing along ux is expressed.
  let ecMaster = $state('');
  let ecSlave = $state('');
  let ecOffsetX = $state('0');
  let ecOffsetY = $state('0');
  let ecOffsetZ = $state('0');
  let ecReleases = $state([false, false, false, false, false, false]); // [ux, uy, uz, rx, ry, rz]

  // ─── Connector (joint/spring/bearing) state ──────────────────
  // Six stiffness components mirror Rust ConnectorElement. Setting a component
  // to 0 produces sliding/flexibility in that direction — this is the explicit
  // way to express a sliding bearing in the "joint/connection" mental model:
  // pick which directions are stiff, leave the others at 0.
  let connNodeI = $state('');
  let connNodeJ = $state('');
  let connKAxial = $state('0');
  let connKShear = $state('0');
  let connKMoment = $state('0');
  let connKShearZ = $state('0');
  let connKBendY = $state('0');
  let connKBendZ = $state('0');

  const connectors = $derived([...modelStore.connectors.values()]);

  const constraints = $derived(modelStore.model.constraints ?? []);

  function validateNode(idStr: string): number | null {
    const id = parseInt(idStr);
    if (isNaN(id) || !modelStore.nodes.has(id)) return null;
    return id;
  }

  function addRigidLink() {
    const master = validateNode(rlMaster);
    const slave = validateNode(rlSlave);
    if (master === null || slave === null || master === slave) return;
    // Rust RigidLinkConstraint.dofs is Vec<usize> — emit integer indices
    // (3D: 0=ux, 1=uy, 2=uz, 3=rx, 4=ry, 5=rz), NOT name strings.
    const activeDofs = dofLabels.map((_, i) => i).filter(i => rlDofs[i]);
    if (activeDofs.length === 0) return;
    modelStore.addConstraint({
      type: 'rigidLink',
      masterNode: master,
      slaveNode: slave,
      dofs: activeDofs,
    });
    rlMaster = '';
    rlSlave = '';
  }

  function addDiaphragm() {
    const master = validateNode(dMaster);
    if (master === null) return;
    const slaveIds = dSlaves.split(',').map(s => parseInt(s.trim())).filter(id => !isNaN(id) && modelStore.nodes.has(id) && id !== master);
    if (slaveIds.length === 0) return;
    modelStore.addConstraint({
      type: 'diaphragm',
      masterNode: master,
      slaveNodes: slaveIds,
      plane: dPlane,
    });
    dMaster = '';
    dSlaves = '';
  }

  function addEqualDof() {
    const master = validateNode(eqMaster);
    const slave = validateNode(eqSlave);
    if (master === null || slave === null || master === slave) return;
    // Rust EqualDOFConstraint.dofs is Vec<usize>. Same indexing as RigidLink.
    const activeDofs = dofLabels.map((_, i) => i).filter(i => eqDofs[i]);
    if (activeDofs.length === 0) return;
    modelStore.addConstraint({
      // Rust serde rename: equalDOF (all-caps acronym), NOT equalDof.
      type: 'equalDOF',
      masterNode: master,
      slaveNode: slave,
      dofs: activeDofs,
    });
    eqMaster = '';
    eqSlave = '';
  }

  function addLinearMpc() {
    // Parse terms: "nodeId:dof:coefficient; ..." e.g. "1:ux:1.0; 2:ux:-1.0".
    // Convert to the shape Rust expects: type discriminator `linearMPC`,
    // each term { nodeId, dof: usize-index, coefficient: f64 }. The constraint
    // sums to 0 by definition — no `rhs` field exists in LinearMPCConstraint.
    //
    // Separator: ';' when present, ',' otherwise (legacy). With comma
    // separators a decimal comma in a coefficient ('-0,5') would be split as
    // a term boundary and the coefficient silently read as '-0' — so when
    // commas separate terms, a malformed fragment must ABORT the add (not be
    // dropped) to avoid committing a corrupted equation.
    const separator = mpcTerms.includes(';') ? ';' : ',';
    const fragments = mpcTerms.split(separator).filter(s => s.trim().length > 0);
    const parsed: Array<{ nodeId: number; dof: number; coefficient: number }> = [];
    for (const s of fragments) {
      const parts = s.trim().split(':');
      if (parts.length !== 3) return; // malformed fragment → reject the whole input
      const nodeId = parseInt(parts[0]);
      const dofName = parts[1].trim();
      const coefficient = parseNum(parts[2]);
      const dofIdx = dofLabels.indexOf(dofName as typeof dofLabels[number]);
      if (isNaN(nodeId) || isNaN(coefficient) || dofIdx < 0) return;
      parsed.push({ nodeId, dof: dofIdx, coefficient });
    }
    if (parsed.length === 0) return;
    modelStore.addConstraint({
      type: 'linearMPC',
      terms: parsed,
    });
    mpcTerms = '';
  }

  function addEccentricConnection() {
    const master = validateNode(ecMaster);
    const slave = validateNode(ecSlave);
    if (master === null || slave === null || master === slave) return;
    const ox = parseNum(ecOffsetX);
    const oy = parseNum(ecOffsetY);
    const oz = parseNum(ecOffsetZ);
    if (isNaN(ox) || isNaN(oy) || isNaN(oz)) return;
    modelStore.addConstraint({
      type: 'eccentricConnection',
      masterNode: master,
      slaveNode: slave,
      offsetX: ox,
      offsetY: oy,
      offsetZ: oz,
      // Pass the full 6-bool array — solver Vec<bool> length must match dimension.
      releases: [...ecReleases],
    });
    ecMaster = '';
    ecSlave = '';
    ecOffsetX = '0';
    ecOffsetY = '0';
    ecOffsetZ = '0';
    ecReleases = [false, false, false, false, false, false];
  }

  function addConstraint() {
    if (selectedKind === 'rigidLink') addRigidLink();
    else if (selectedKind === 'diaphragm') addDiaphragm();
    else if (selectedKind === 'equalDOF') addEqualDof();
    else if (selectedKind === 'eccentricConnection') addEccentricConnection();
    else if (selectedKind === 'linearMPC') addLinearMpc();
  }


  function autoDetectDiaphragms() {
    const tolerance = 0.05;
    const levels = detectFloorLevels(modelStore.nodes as any, tolerance);
    if (levels.length === 0) return;

    for (const z of levels) {
      // Collect nodes at this level
      const nodeIds: number[] = [];
      for (const [id, n] of modelStore.nodes) {
        if (Math.abs((n.z ?? 0) - z) < tolerance) {
          nodeIds.push(id);
        }
      }
      if (nodeIds.length < 2) continue;

      // Find centroid to pick master node
      let sx = 0, sy = 0;
      for (const id of nodeIds) {
        const n = modelStore.nodes.get(id)!;
        sx += n.x;
        sy += n.y;
      }
      const cx = sx / nodeIds.length;
      const cy = sy / nodeIds.length;

      // Master = node closest to centroid
      let masterId = nodeIds[0];
      let minDist = Infinity;
      for (const id of nodeIds) {
        const n = modelStore.nodes.get(id)!;
        const dist = Math.sqrt((n.x - cx) ** 2 + (n.y - cy) ** 2);
        if (dist < minDist) {
          minDist = dist;
          masterId = id;
        }
      }

      const slaveIds = nodeIds.filter(id => id !== masterId);
      modelStore.addConstraint({
        type: 'diaphragm',
        masterNode: masterId,
        slaveNodes: slaveIds,
        plane: 'XY',
      });
    }
  }




  function addConnector() {
    const ni = validateNode(connNodeI);
    const nj = validateNode(connNodeJ);
    if (ni === null || nj === null || ni === nj) return;
    const kA = parseNum(connKAxial);
    const kS = parseNum(connKShear);
    const kM = parseNum(connKMoment);
    const kSz = parseNum(connKShearZ);
    const kBy = parseNum(connKBendY);
    const kBz = parseNum(connKBendZ);
    if ([kA, kS, kM, kSz, kBy, kBz].some(v => isNaN(v))) return;
    // Disallow all-zero connectors — that's a fully disconnected pair, almost
    // certainly a user error and a guaranteed mechanism.
    if (kA === 0 && kS === 0 && kM === 0 && kSz === 0 && kBy === 0 && kBz === 0) return;
    modelStore.addConnector({
      nodeI: ni, nodeJ: nj,
      kAxial: kA, kShear: kS, kMoment: kM,
      kShearZ: kSz, kBendY: kBy, kBendZ: kBz,
    });
    connNodeI = '';
    connNodeJ = '';
    connKAxial = '0'; connKShear = '0'; connKMoment = '0';
    connKShearZ = '0'; connKBendY = '0'; connKBendZ = '0';
  }

  function removeConnector(id: number) {
    modelStore.removeConnector(id);
  }

  function fmtStiff(v: number | undefined): string {
    if (v === undefined || v === 0) return '0';
    if (Math.abs(v) >= 1e5) return v.toExponential(1);
    return String(v);
  }

  function connectorLabel(c: { kAxial?: number; kShear?: number; kMoment?: number; kShearZ?: number; kBendY?: number; kBendZ?: number }): string {
    return `kAxial=${fmtStiff(c.kAxial)}, kShear=${fmtStiff(c.kShear)}, kMoment=${fmtStiff(c.kMoment)}, kShearZ=${fmtStiff(c.kShearZ)}, kBendY=${fmtStiff(c.kBendY)}, kBendZ=${fmtStiff(c.kBendZ)}`;
  }
  /** Clearing every link or connector at once asks first, in place. */
  let asking = $state<'constraints' | 'connectors' | null>(null);
</script>

<div class="pk" data-testid="spec-links">
  <section class="pk-card" data-testid="links-new">
    <h4 class="pk-heading">{t('spec.links.new')}</h4>
    <label class="ln-field">
      <span class="pk-label">{t('adv.type')}</span>
      <select bind:value={selectedKind} data-testid="links-kind">
        {#each constraintKinds as ck (ck.value)}
          <option value={ck.value}>{ck.label}</option>
        {/each}
      </select>
    </label>

    {#if selectedKind === 'linearMPC'}
      <label class="ln-field">
        <span class="pk-label">{t('pro.terms')}</span>
        <input type="text" bind:value={mpcTerms} placeholder={t('pro.mpcPlaceholder')} />
      </label>
      <p class="pk-hint">{t('pro.formatHint')}</p>
    {:else}
      <div class="pk-row ln-fields">
        {#if selectedKind === 'rigidLink'}
          <label class="ln-field"><span class="pk-label">{t('pro.master')}</span><input class="ln-id" type="text" bind:value={rlMaster} placeholder="ID" /></label>
          <label class="ln-field"><span class="pk-label">{t('pro.slave')}</span><input class="ln-id" type="text" bind:value={rlSlave} placeholder="ID" /></label>
        {:else if selectedKind === 'diaphragm'}
          <label class="ln-field"><span class="pk-label">{t('pro.master')}</span><input class="ln-id" type="text" bind:value={dMaster} placeholder="ID" /></label>
          <label class="ln-field"><span class="pk-label">{t('pro.plane')}</span>
            <select bind:value={dPlane}>
              {#each planeOptions as p (p)}<option value={p}>{p}</option>{/each}
            </select>
          </label>
          <label class="ln-field pk-grow"><span class="pk-label">{t('pro.slaves')}</span><input type="text" bind:value={dSlaves} placeholder="1, 2, 3..." /></label>
        {:else if selectedKind === 'equalDOF'}
          <label class="ln-field"><span class="pk-label">{t('pro.master')}</span><input class="ln-id" type="text" bind:value={eqMaster} placeholder="ID" /></label>
          <label class="ln-field"><span class="pk-label">{t('pro.slave')}</span><input class="ln-id" type="text" bind:value={eqSlave} placeholder="ID" /></label>
        {:else if selectedKind === 'eccentricConnection'}
          <label class="ln-field"><span class="pk-label">{t('pro.master')}</span><input class="ln-id" type="text" bind:value={ecMaster} placeholder="ID" /></label>
          <label class="ln-field"><span class="pk-label">{t('pro.slave')}</span><input class="ln-id" type="text" bind:value={ecSlave} placeholder="ID" /></label>
        {/if}
      </div>

      {#if selectedKind === 'eccentricConnection'}
        <span class="pk-label">{t('spec.links.offset')}</span>
        <div class="pk-row">
          <input class="ln-num" type="text" bind:value={ecOffsetX} placeholder="0" aria-label="X" />
          <input class="ln-num" type="text" bind:value={ecOffsetY} placeholder="0" aria-label="Y" />
          <input class="ln-num" type="text" bind:value={ecOffsetZ} placeholder="0" aria-label="Z" />
        </div>
      {/if}

      {#if selectedKind === 'rigidLink' || selectedKind === 'equalDOF' || selectedKind === 'eccentricConnection'}
        <span class="pk-label">{selectedKind === 'eccentricConnection' ? t('pro.releases') : t('spec.links.dofs')}</span>
        <div class="ln-dofs">
          {#each dofLabels as dof, i (dof)}
            <label class="pk-check">
              {#if selectedKind === 'rigidLink'}<input type="checkbox" bind:checked={rlDofs[i]} />
              {:else if selectedKind === 'equalDOF'}<input type="checkbox" bind:checked={eqDofs[i]} />
              {:else}<input type="checkbox" bind:checked={ecReleases[i]} />{/if}
              {dof}
            </label>
          {/each}
        </div>
        {#if selectedKind === 'eccentricConnection'}<p class="pk-hint">{t('pro.eccentricHint')}</p>{/if}
      {/if}
    {/if}

    <div class="pk-row">
      <button class="pk-btn pk-btn-primary" onclick={addConstraint} data-testid="links-add">{t('pro.add')}</button>
      <button class="pk-btn" onclick={autoDetectDiaphragms} title={t('pro.autoDetectTitle')}>{t('pro.autoDetect')}</button>
    </div>
  </section>

  <!--
    The tools above, the shared table below: the shape every modelling panel has. Connectors keep
    their own list: they are a different entity, stiffness between two nodes rather than a tie
    between degrees of freedom.
  -->
  <section class="pk-card">
    <div class="pk-row ln-head">
      <h4 class="pk-heading pk-grow">{t('pro.nConstraints').replace('{n}', String(constraints.length))}</h4>
      {#if constraints.length > 0}
        {#if asking === 'constraints'}
          <span class="pk-row">{tp('pro.clearAsk', { n: modelStore.constraints.length })}
            <button class="pk-btn ln-danger" onclick={() => { modelStore.clearConstraints(); asking = null; }} data-testid="links-clear-yes">{t('pro.clearYes')}</button>
            <button class="pk-btn" onclick={() => (asking = null)}>{t('pro.examples.cancel')}</button></span>
        {:else}
          <button class="pk-btn ln-danger" onclick={() => (asking = 'constraints')} data-testid="links-clear">{t('pro.clear')}</button>
        {/if}
      {/if}
    </div>
    <div class="ln-table"><DataTable pinned="constraints" /></div>
  </section>

  <!-- Connectors are not structural members: they carry no section, appear in no M/V/N diagram
       and go through no design. A zero in a direction means sliding or flexibility there. -->
  <section class="pk-card" data-testid="links-connectors">
    <div class="pk-row ln-head">
      <h4 class="pk-heading pk-grow">{t('pro.nConnectors').replace('{n}', String(connectors.length))}</h4>
      {#if connectors.length > 0}
        {#if asking === 'connectors'}
          <span class="pk-row">{tp('pro.clearAsk', { n: modelStore.model.connectors?.size ?? 0 })}
            <button class="pk-btn ln-danger" onclick={() => { modelStore.clearConnectors(); asking = null; }}>{t('pro.clearYes')}</button>
            <button class="pk-btn" onclick={() => (asking = null)}>{t('pro.examples.cancel')}</button></span>
        {:else}
          <button class="pk-btn ln-danger" onclick={() => (asking = 'connectors')}>{t('pro.clear')}</button>
        {/if}
      {/if}
    </div>
    <p class="pk-hint">{t('pro.connectorIntro')}</p>
    <div class="pk-row ln-fields">
      <label class="ln-field"><span class="pk-label">{t('pro.nodeI')}</span><input class="ln-id" type="text" bind:value={connNodeI} placeholder="ID" /></label>
      <label class="ln-field"><span class="pk-label">{t('pro.nodeJ')}</span><input class="ln-id" type="text" bind:value={connNodeJ} placeholder="ID" /></label>
    </div>
    <span class="pk-label">{t('pro.kInPlane')}</span>
    <div class="pk-row ln-fields">
      <label class="ln-field"><span class="pk-label">kAxial</span><input class="ln-num" type="text" bind:value={connKAxial} placeholder="0" /></label>
      <label class="ln-field"><span class="pk-label">kShear</span><input class="ln-num" type="text" bind:value={connKShear} placeholder="0" /></label>
      <label class="ln-field"><span class="pk-label">kMoment</span><input class="ln-num" type="text" bind:value={connKMoment} placeholder="0" /></label>
    </div>
    <span class="pk-label">{t('pro.k3D')}</span>
    <div class="pk-row ln-fields">
      <label class="ln-field"><span class="pk-label">kShearZ</span><input class="ln-num" type="text" bind:value={connKShearZ} placeholder="0" /></label>
      <label class="ln-field"><span class="pk-label">kBendY</span><input class="ln-num" type="text" bind:value={connKBendY} placeholder="0" /></label>
      <label class="ln-field"><span class="pk-label">kBendZ</span><input class="ln-num" type="text" bind:value={connKBendZ} placeholder="0" /></label>
    </div>
    <p class="pk-hint">{t('pro.connectorHint')}</p>
    <div class="pk-row">
      <button class="pk-btn pk-btn-primary" onclick={addConnector} data-testid="connector-add">{t('pro.addConnector')}</button>
    </div>
    {#if connectors.length > 0}
      <table class="ln-conn">
        <thead><tr><th>#</th><th>{t('pro.thNodes')}</th><th>{t('pro.thStiffness')}</th><th></th></tr></thead>
        <tbody>
          {#each connectors as c (c.id)}
            <tr>
              <td class="ln-cid">{c.id}</td>
              <td class="ln-nowrap">{c.nodeI} → {c.nodeJ}</td>
              <td>{connectorLabel(c)}</td>
              <td><button class="ln-del" onclick={() => removeConnector(c.id)} aria-label={t('pro.clear')}>×</button></td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  </section>
</div>

<style>
  .ln-field { display: flex; flex-direction: column; gap: 2px; }
  .ln-fields { align-items: flex-end; gap: 0.5rem; }
  .ln-id { width: 64px; }
  .ln-num { width: 72px; }
  .ln-dofs { display: grid; grid-template-columns: repeat(3, max-content); gap: 4px 14px; }
  .ln-head { gap: 0.5rem; }
  .ln-head .pk-heading { margin-bottom: 0; }
  .ln-danger { color: var(--st-danger); }
  /* The shared table sits inside the card, edge to edge. */
  .ln-table { margin: 0 -0.7rem -0.7rem; border-top: 1px solid var(--st-hair); max-height: 320px; overflow: auto; }
  .ln-conn { width: 100%; border-collapse: collapse; font-size: 0.68rem; }
  .ln-conn th { padding: 4px 6px; text-align: left; font-family: var(--st-mono); font-size: 0.62rem; font-weight: 400; letter-spacing: 0.08em; text-transform: uppercase; color: var(--st-text-3); border-bottom: 1px solid var(--st-hair); }
  .ln-conn td { padding: 4px 6px; border-bottom: 1px solid var(--st-hair); color: var(--st-text-2); }
  .ln-cid { width: 28px; color: var(--st-text-3); font-family: var(--st-mono); }
  .ln-nowrap { white-space: nowrap; }
  .ln-del { background: none; border: none; color: var(--st-text-3); font-size: 0.9rem; cursor: pointer; padding: 0; }
  .ln-del:hover { color: var(--st-danger); }
</style>
