<script lang="ts">
  import { modelStore } from '../../lib/store';
  import { detectFloorLevels } from '../../lib/engine/rigid-diaphragm';
  import { t } from '../../lib/i18n';

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
    // Parse terms: "nodeId:dof:coefficient, ..." e.g. "1:ux:1.0, 2:ux:-1.0".
    // Convert to the shape Rust expects: type discriminator `linearMPC`,
    // each term { nodeId, dof: usize-index, coefficient: f64 }. The constraint
    // sums to 0 by definition — no `rhs` field exists in LinearMPCConstraint.
    const parsed = mpcTerms.split(',').map(s => {
      const parts = s.trim().split(':');
      if (parts.length !== 3) return null;
      const nodeId = parseInt(parts[0]);
      const dofName = parts[1].trim();
      const coefficient = parseFloat(parts[2]);
      const dofIdx = dofLabels.indexOf(dofName as typeof dofLabels[number]);
      if (isNaN(nodeId) || isNaN(coefficient) || dofIdx < 0) return null;
      return { nodeId, dof: dofIdx, coefficient };
    }).filter(Boolean) as Array<{ nodeId: number; dof: number; coefficient: number }>;
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
    const ox = parseFloat(ecOffsetX);
    const oy = parseFloat(ecOffsetY);
    const oz = parseFloat(ecOffsetZ);
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

  function removeConstraint(index: number) {
    modelStore.removeConstraint(index);
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

  function dofIndicesToNames(dofs: unknown): string {
    if (!Array.isArray(dofs) || dofs.length === 0) return t('pro.allDofs');
    return dofs.map((d: unknown) => {
      // Indices are the canonical wire form; tolerate stale string entries
      // surfacing from older saved data, since name → index migration is
      // out of scope here.
      if (typeof d === 'number') return dofLabels[d] ?? String(d);
      return String(d);
    }).join(',');
  }

  function constraintLabel(c: any): string {
    if (c.type === 'rigidLink') return t('pro.constraintRigid').replace('{master}', c.masterNode).replace('{slave}', c.slaveNode).replace('{dofs}', dofIndicesToNames(c.dofs));
    if (c.type === 'diaphragm') return t('pro.constraintDiaph').replace('{plane}', c.plane ?? 'XZ').replace('{master}', c.masterNode).replace('{n}', String(c.slaveNodes?.length ?? 0));
    if (c.type === 'equalDOF') return t('pro.constraintEqDof').replace('{master}', c.masterNode).replace('{slave}', c.slaveNode).replace('{dofs}', dofIndicesToNames(c.dofs));
    if (c.type === 'linearMPC') return t('pro.constraintMpc').replace('{n}', String(c.terms?.length ?? 0));
    if (c.type === 'eccentricConnection') {
      const offset = `(${c.offsetX ?? 0}, ${c.offsetY ?? 0}, ${c.offsetZ ?? 0})`;
      const releasedDofs = (c.releases ?? []).map((r: boolean, i: number) => r ? dofLabels[i] : null).filter(Boolean).join(',');
      const releasesLabel = releasedDofs.length > 0 ? releasedDofs : t('pro.eccentricNoRelease');
      return t('pro.constraintEcc')
        .replace('{master}', c.masterNode)
        .replace('{slave}', c.slaveNode)
        .replace('{offset}', offset)
        .replace('{releases}', releasesLabel);
    }
    return t('pro.unknown');
  }

  function constraintTypeLabel(type: string): string {
    return constraintKinds.find(k => k.value === type)?.label ?? type;
  }

  function addConnector() {
    const ni = validateNode(connNodeI);
    const nj = validateNode(connNodeJ);
    if (ni === null || nj === null || ni === nj) return;
    const kA = parseFloat(connKAxial);
    const kS = parseFloat(connKShear);
    const kM = parseFloat(connKMoment);
    const kSz = parseFloat(connKShearZ);
    const kBy = parseFloat(connKBendY);
    const kBz = parseFloat(connKBendZ);
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
</script>

<div class="pro-cst">
  <div class="pro-cst-header">
    <span class="pro-cst-count">{t('pro.nConstraints').replace('{n}', String(constraints.length))}</span>
    {#if constraints.length > 0}
      <button class="pro-btn pro-btn-clear" onclick={() => modelStore.clearConstraints()}>{t('pro.clear')}</button>
    {/if}
  </div>

  <div class="pro-cst-form">
    <div class="pro-cst-row">
      <label>Tipo:
        <select bind:value={selectedKind} class="pro-select-sm">
          {#each constraintKinds as ck}
            <option value={ck.value}>{ck.label}</option>
          {/each}
        </select>
      </label>
    </div>

    {#if selectedKind === 'rigidLink'}
      <div class="pro-cst-row">
        <label>Master: <input type="text" bind:value={rlMaster} placeholder="ID" class="pro-input-sm" /></label>
        <label>{t('pro.slave')}: <input type="text" bind:value={rlSlave} placeholder="ID" class="pro-input-sm" /></label>
      </div>
      <div class="pro-cst-dofs">
        {#each dofLabels as dof, i}
          <label class="pro-dof-check">
            <input type="checkbox" bind:checked={rlDofs[i]} />
            <span>{dof}</span>
          </label>
        {/each}
      </div>

    {:else if selectedKind === 'diaphragm'}
      <div class="pro-cst-row">
        <label>Master: <input type="text" bind:value={dMaster} placeholder="ID" class="pro-input-sm" /></label>
        <label>{t('pro.plane')}:
          <select bind:value={dPlane} class="pro-select-sm">
            {#each planeOptions as p}
              <option value={p}>{p}</option>
            {/each}
          </select>
        </label>
      </div>
      <div class="pro-cst-row">
        <label class="pro-label-wide">{t('pro.slaves')}: <input type="text" bind:value={dSlaves} placeholder="1, 2, 3..." class="pro-input-wide" /></label>
      </div>

    {:else if selectedKind === 'equalDOF'}
      <div class="pro-cst-row">
        <label>Master: <input type="text" bind:value={eqMaster} placeholder="ID" class="pro-input-sm" /></label>
        <label>{t('pro.slave')}: <input type="text" bind:value={eqSlave} placeholder="ID" class="pro-input-sm" /></label>
      </div>
      <div class="pro-cst-dofs">
        {#each dofLabels as dof, i}
          <label class="pro-dof-check">
            <input type="checkbox" bind:checked={eqDofs[i]} />
            <span>{dof}</span>
          </label>
        {/each}
      </div>

    {:else if selectedKind === 'eccentricConnection'}
      <div class="pro-cst-row">
        <label>Master: <input type="text" bind:value={ecMaster} placeholder="ID" class="pro-input-sm" /></label>
        <label>{t('pro.slave')}: <input type="text" bind:value={ecSlave} placeholder="ID" class="pro-input-sm" /></label>
      </div>
      <div class="pro-cst-row">
        <label>{t('pro.offsetX')}: <input type="text" bind:value={ecOffsetX} placeholder="0" class="pro-input-sm" /></label>
        <label>{t('pro.offsetY')}: <input type="text" bind:value={ecOffsetY} placeholder="0" class="pro-input-sm" /></label>
        <label>{t('pro.offsetZ')}: <input type="text" bind:value={ecOffsetZ} placeholder="0" class="pro-input-sm" /></label>
      </div>
      <div class="pro-cst-row">
        <span class="pro-cst-sublabel">{t('pro.releases')}:</span>
      </div>
      <div class="pro-cst-dofs">
        {#each dofLabels as dof, i}
          <label class="pro-dof-check">
            <input type="checkbox" bind:checked={ecReleases[i]} />
            <span>{dof}</span>
          </label>
        {/each}
      </div>
      <div class="pro-cst-hint">{t('pro.eccentricHint')}</div>

    {:else if selectedKind === 'linearMPC'}
      <div class="pro-cst-row">
        <label class="pro-label-wide">{t('pro.terms')}: <input type="text" bind:value={mpcTerms} placeholder="nodo:dof:coeff, ..." class="pro-input-wide" /></label>
      </div>
      <div class="pro-cst-hint">{t('pro.formatHint')}</div>
    {/if}

    <div class="pro-cst-actions">
      <button class="pro-btn" onclick={addConstraint}>{t('pro.add')}</button>
      <button class="pro-btn pro-btn-auto" onclick={autoDetectDiaphragms} title={t('pro.autoDetectTitle')}>
        {t('pro.autoDetect')}
      </button>
    </div>
  </div>

  <div class="pro-cst-table-wrap">
    <table class="pro-cst-table">
      <thead>
        <tr>
          <th>#</th>
          <th>{t('pro.thType')}</th>
          <th>{t('pro.thDescription')}</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {#each constraints as c, i}
          <tr>
            <td class="col-id">{i + 1}</td>
            <td class="col-type">{constraintTypeLabel(c.type)}</td>
            <td class="col-desc">{constraintLabel(c)}</td>
            <td><button class="pro-delete-btn" onclick={() => removeConstraint(i)}>×</button></td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>

  <!-- ─── Connectors (joint/spring/bearing) ──────────────────────── -->
  <!-- Connectors are NOT structural members. They live alongside elements in -->
  <!-- the solver model, but they don't carry section properties, don't appear -->
  <!-- in M/V/N diagrams, and don't go through RC/steel design. The mental    -->
  <!-- model is "stiffness between two nodes in named directions". A zero in  -->
  <!-- a direction means sliding/flexibility there.                            -->
  <div class="pro-conn-section">
    <div class="pro-cst-header">
      <span class="pro-cst-count">{t('pro.nConnectors').replace('{n}', String(connectors.length))}</span>
      {#if connectors.length > 0}
        <button class="pro-btn pro-btn-clear" onclick={() => modelStore.clearConnectors()}>{t('pro.clear')}</button>
      {/if}
    </div>

    <div class="pro-cst-form">
      <div class="pro-cst-hint">{t('pro.connectorIntro')}</div>
      <div class="pro-cst-row">
        <label>{t('pro.nodeI')}: <input type="text" bind:value={connNodeI} placeholder="ID" class="pro-input-sm" /></label>
        <label>{t('pro.nodeJ')}: <input type="text" bind:value={connNodeJ} placeholder="ID" class="pro-input-sm" /></label>
      </div>
      <div class="pro-cst-row">
        <span class="pro-cst-sublabel">{t('pro.kInPlane')}:</span>
      </div>
      <div class="pro-cst-row">
        <label>kAxial: <input type="text" bind:value={connKAxial} placeholder="0" class="pro-input-sm" /></label>
        <label>kShear: <input type="text" bind:value={connKShear} placeholder="0" class="pro-input-sm" /></label>
        <label>kMoment: <input type="text" bind:value={connKMoment} placeholder="0" class="pro-input-sm" /></label>
      </div>
      <div class="pro-cst-row">
        <span class="pro-cst-sublabel">{t('pro.k3D')}:</span>
      </div>
      <div class="pro-cst-row">
        <label>kShearZ: <input type="text" bind:value={connKShearZ} placeholder="0" class="pro-input-sm" /></label>
        <label>kBendY: <input type="text" bind:value={connKBendY} placeholder="0" class="pro-input-sm" /></label>
        <label>kBendZ: <input type="text" bind:value={connKBendZ} placeholder="0" class="pro-input-sm" /></label>
      </div>
      <div class="pro-cst-hint">{t('pro.connectorHint')}</div>
      <div class="pro-cst-actions">
        <button class="pro-btn" onclick={addConnector}>{t('pro.addConnector')}</button>
      </div>
    </div>

    <div class="pro-cst-table-wrap">
      <table class="pro-cst-table">
        <thead>
          <tr>
            <th>#</th>
            <th>{t('pro.thNodes')}</th>
            <th>{t('pro.thStiffness')}</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {#each connectors as c}
            <tr>
              <td class="col-id">{c.id}</td>
              <td class="col-type">{c.nodeI} → {c.nodeJ}</td>
              <td class="col-desc">{connectorLabel(c)}</td>
              <td><button class="pro-delete-btn" onclick={() => removeConnector(c.id)}>×</button></td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </div>
</div>

<style>
  .pro-cst { display: flex; flex-direction: column; height: 100%; }

  .pro-cst-header {
    padding: 8px 10px;
    border-bottom: 1px solid #1a3050;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .pro-cst-count { font-size: 0.82rem; color: #4ecdc4; font-weight: 600; }

  .pro-cst-form {
    padding: 10px 12px;
    border-bottom: 1px solid #1a3050;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .pro-cst-row {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }

  .pro-cst-row label {
    font-size: 0.75rem;
    color: #888;
    display: flex;
    align-items: center;
    gap: 5px;
  }

  .pro-label-wide {
    flex: 1;
    min-width: 0;
  }

  .pro-input-sm {
    width: 55px;
    padding: 4px 6px;
    background: #0f2840;
    border: 1px solid #1a3050;
    border-radius: 3px;
    color: #ddd;
    font-size: 0.78rem;
    font-family: monospace;
  }

  .pro-input-sm:focus { border-color: #1a4a7a; outline: none; }

  .pro-input-wide {
    flex: 1;
    min-width: 100px;
    padding: 4px 6px;
    background: #0f2840;
    border: 1px solid #1a3050;
    border-radius: 3px;
    color: #ddd;
    font-size: 0.78rem;
    font-family: monospace;
  }

  .pro-input-wide:focus { border-color: #1a4a7a; outline: none; }

  .pro-select-sm {
    padding: 4px 6px;
    background: #0f2840;
    border: 1px solid #1a3050;
    border-radius: 3px;
    color: #ccc;
    font-size: 0.75rem;
    cursor: pointer;
  }

  .pro-cst-dofs {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    padding: 4px 0;
  }

  .pro-dof-check {
    display: flex;
    align-items: center;
    gap: 3px;
    font-size: 0.72rem;
    color: #aaa;
    cursor: pointer;
  }

  .pro-dof-check input[type="checkbox"] {
    width: 14px;
    height: 14px;
    accent-color: #4ecdc4;
    cursor: pointer;
  }

  .pro-cst-hint {
    font-size: 0.7rem;
    color: #668;
    font-style: italic;
  }

  .pro-cst-sublabel {
    font-size: 0.72rem;
    color: #888;
    font-weight: 600;
  }

  /* Connectors section sits below the constraints table; visually separated
   * with a top border + slight color shift so it reads as its own surface
   * inside the same right-side workflow. */
  .pro-conn-section {
    border-top: 2px solid #1a3050;
    background: #0a1828;
  }
  .pro-conn-section .pro-cst-header { background: #0a1828; }

  .pro-cst-actions {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }

  .pro-btn {
    padding: 5px 12px;
    font-size: 0.75rem;
    color: #ccc;
    background: #0f3460;
    border: 1px solid #1a4a7a;
    border-radius: 4px;
    cursor: pointer;
  }

  .pro-btn:hover { background: #1a4a7a; color: #fff; }

  .pro-btn-auto {
    font-size: 0.72rem;
    color: #4ecdc4;
    border-color: #2a5a6a;
  }

  .pro-btn-auto:hover { background: #1a4a6a; }

  .pro-btn-clear {
    font-size: 0.68rem;
    color: #ff6b6b;
    border-color: #5a2a2a;
    background: transparent;
    padding: 4px 8px;
  }

  .pro-btn-clear:hover { background: #3a1a1a; }

  .pro-cst-table-wrap { flex: 1; overflow: auto; }

  .pro-cst-table { width: 100%; border-collapse: collapse; font-size: 0.78rem; }
  .pro-cst-table thead { position: sticky; top: 0; z-index: 1; }
  .pro-cst-table th {
    padding: 6px 8px; text-align: left; font-size: 0.7rem; font-weight: 600;
    color: #888; text-transform: uppercase; background: #0a1a30; border-bottom: 1px solid #1a4a7a;
  }
  .pro-cst-table td { padding: 5px 8px; border-bottom: 1px solid #0f2030; color: #ccc; }
  .col-id { width: 34px; color: #666; font-family: monospace; text-align: center; }
  .col-type { font-size: 0.72rem; color: #4ecdc4; white-space: nowrap; }
  .col-desc { font-size: 0.72rem; color: #aaa; }
  .pro-delete-btn { background: none; border: none; color: #555; font-size: 1rem; cursor: pointer; padding: 0; }
  .pro-delete-btn:hover { color: #ff6b6b; }
</style>
