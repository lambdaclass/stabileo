<script lang="ts">
  import { modelStore } from '../../lib/store';
  import { detectFloorLevels } from '../../lib/engine/rigid-diaphragm';
  import { t } from '../../lib/i18n';

  type ConstraintKind = 'rigidLink' | 'diaphragm' | 'equalDof' | 'linearMpc';

  const constraintKinds = $derived([
    { value: 'rigidLink' as ConstraintKind, label: t('pro.rigidLink') },
    { value: 'diaphragm' as ConstraintKind, label: t('pro.diaphragm') },
    { value: 'equalDof' as ConstraintKind, label: t('pro.equalDof') },
    { value: 'linearMpc' as ConstraintKind, label: t('pro.linearMpc') },
  ]);

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
  let mpcRhs = $state('0');

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
    const activeDofs = dofLabels.filter((_, i) => rlDofs[i]) as string[];
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
    const activeDofs = dofLabels.filter((_, i) => eqDofs[i]) as string[];
    if (activeDofs.length === 0) return;
    modelStore.addConstraint({
      type: 'equalDof',
      masterNode: master,
      slaveNode: slave,
      dofs: activeDofs,
    });
    eqMaster = '';
    eqSlave = '';
  }

  function addLinearMpc() {
    const rhs = parseFloat(mpcRhs);
    if (isNaN(rhs)) return;
    // Parse terms: "nodeId:dof:coeff, ..." e.g. "1:ux:1.0, 2:ux:-1.0"
    const parsed = mpcTerms.split(',').map(t => {
      const parts = t.trim().split(':');
      if (parts.length !== 3) return null;
      const nodeId = parseInt(parts[0]);
      const dof = parts[1].trim();
      const coeff = parseFloat(parts[2]);
      if (isNaN(nodeId) || isNaN(coeff) || !dofLabels.includes(dof as any)) return null;
      return { nodeId, dof, coeff };
    }).filter(Boolean) as { nodeId: number; dof: string; coeff: number }[];
    if (parsed.length === 0) return;
    modelStore.addConstraint({
      type: 'linearMpc',
      terms: parsed,
      rhs,
    });
    mpcTerms = '';
    mpcRhs = '0';
  }

  function addConstraint() {
    if (selectedKind === 'rigidLink') addRigidLink();
    else if (selectedKind === 'diaphragm') addDiaphragm();
    else if (selectedKind === 'equalDof') addEqualDof();
    else if (selectedKind === 'linearMpc') addLinearMpc();
  }

  function removeConstraint(index: number) {
    modelStore.removeConstraint(index);
  }

  function autoDetectDiaphragms() {
    const tolerance = 0.05;
    const levels = detectFloorLevels(modelStore.nodes, tolerance);
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

  function constraintLabel(c: any): string {
    if (c.type === 'rigidLink') return t('pro.constraintRigid').replace('{master}', c.masterNode).replace('{slave}', c.slaveNode).replace('{dofs}', c.dofs ? c.dofs.join(',') : t('pro.allDofs'));
    if (c.type === 'diaphragm') return t('pro.constraintDiaph').replace('{plane}', c.plane ?? 'XZ').replace('{master}', c.masterNode).replace('{n}', String(c.slaveNodes?.length ?? 0));
    if (c.type === 'equalDof') return t('pro.constraintEqDof').replace('{master}', c.masterNode).replace('{slave}', c.slaveNode).replace('{dofs}', c.dofs ? c.dofs.join(',') : t('pro.allDofs'));
    if (c.type === 'linearMpc') return t('pro.constraintMpc').replace('{n}', String(c.terms?.length ?? 0)).replace('{rhs}', String(c.rhs ?? 0));
    return t('pro.unknown');
  }

  function constraintTypeLabel(type: string): string {
    return constraintKinds.find(k => k.value === type)?.label ?? type;
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

    {:else if selectedKind === 'equalDof'}
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

    {:else if selectedKind === 'linearMpc'}
      <div class="pro-cst-row">
        <label class="pro-label-wide">{t('pro.terms')}: <input type="text" bind:value={mpcTerms} placeholder="nodo:dof:coeff, ..." class="pro-input-wide" /></label>
      </div>
      <div class="pro-cst-row">
        <label>RHS: <input type="text" bind:value={mpcRhs} placeholder="0" class="pro-input-sm" /></label>
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
