<script lang="ts">
  import { modelStore } from '../../lib/store';
  import { t } from '../../lib/i18n';
  import { selectShellFamily } from '../../lib/engine/shell-family-selector';
  import type { ShellFamily, ShellRecommendation } from '../../lib/engine/types-3d';
  import { AVAILABLE_SHELL_FAMILIES } from '../../lib/engine/types-3d';
  import type { Vec3 } from '../../lib/engine/shell-family-selector';

  // --- Plate (DKT triangle) creator state ---
  let plateNodes = $state<[string, string, string]>(['', '', '']);
  let plateMaterialId = $state(1);
  let plateThickness = $state(0.2);
  let plateFamily = $state<ShellFamily | 'auto'>('auto');
  let plateRecommendation = $state<ShellRecommendation | null>(null);

  // --- Quad (MITC4) creator state ---
  let quadNodes = $state<[string, string, string, string]>(['', '', '', '']);
  let quadMaterialId = $state(1);
  let quadThickness = $state(0.2);
  let quadFamily = $state<ShellFamily | 'auto'>('auto');
  let quadRecommendation = $state<ShellRecommendation | null>(null);

  // --- Quick mesh generator state ---
  let meshCorners = $state<[string, string, string, string]>(['', '', '', '']);
  let meshNx = $state(2);
  let meshNy = $state(2);
  let meshMaterialId = $state(1);
  let meshThickness = $state(0.2);
  let meshError = $state<string | null>(null);
  let meshSuccess = $state<string | null>(null);

  // --- Error states ---
  let plateError = $state<string | null>(null);
  let quadError = $state<string | null>(null);

  // Available materials
  const materials = $derived([...modelStore.materials.values()]);

  // Existing plates and quads from store
  const plates = $derived(
    modelStore.model.plates ? [...modelStore.model.plates.values()] : []
  );
  const quads = $derived(
    modelStore.model.quads ? [...modelStore.model.quads.values()] : []
  );
  const plateCount = $derived(plates.length);
  const quadCount = $derived(quads.length);

  function validateNodeIds(ids: string[], count: number): number[] | null {
    const parsed = ids.slice(0, count).map(s => parseInt(s));
    if (parsed.some(isNaN)) return null;
    if (new Set(parsed).size !== count) return null;
    if (parsed.some(id => !modelStore.nodes.has(id))) return null;
    return parsed;
  }

  /** Get Vec3 positions from node IDs */
  function getNodePositions(ids: number[]): Vec3[] | null {
    const positions: Vec3[] = [];
    for (const id of ids) {
      const n = modelStore.nodes.get(id);
      if (!n) return null;
      positions.push({ x: n.x, y: n.y, z: n.z ?? 0 });
    }
    return positions;
  }

  /** Run the selector and update recommendation state */
  function updatePlateRecommendation() {
    const nodeIds = validateNodeIds(plateNodes, 3);
    if (!nodeIds || plateThickness <= 0) { plateRecommendation = null; return; }
    const positions = getNodePositions(nodeIds);
    if (!positions) { plateRecommendation = null; return; }
    plateRecommendation = selectShellFamily({ nodes: positions, thickness: plateThickness });
  }

  function updateQuadRecommendation() {
    const nodeIds = validateNodeIds(quadNodes, 4);
    if (!nodeIds || quadThickness <= 0) { quadRecommendation = null; return; }
    const positions = getNodePositions(nodeIds);
    if (!positions) { quadRecommendation = null; return; }
    quadRecommendation = selectShellFamily({ nodes: positions, thickness: quadThickness });
  }

  function addPlate() {
    plateError = null;
    const nodeIds = validateNodeIds(plateNodes, 3);
    if (!nodeIds) {
      plateError = t('pro.err3Nodes');
      return;
    }
    if (!modelStore.materials.has(plateMaterialId)) {
      plateError = t('pro.errMaterial');
      return;
    }
    if (plateThickness <= 0) {
      plateError = t('pro.errThickness');
      return;
    }
    // Resolve shell family: auto → use recommendation, else use override
    const family: ShellFamily = plateFamily === 'auto'
      ? (plateRecommendation?.family ?? 'DKT')
      : plateFamily;
    modelStore.addPlate(nodeIds as [number, number, number], plateMaterialId, plateThickness);
    // Set family on the just-created plate
    const plates = [...modelStore.model.plates.values()];
    const last = plates[plates.length - 1];
    if (last) last.shellFamily = family;
    plateNodes = ['', '', ''];
    plateRecommendation = null;
  }

  function addQuad() {
    quadError = null;
    const nodeIds = validateNodeIds(quadNodes, 4);
    if (!nodeIds) {
      quadError = t('pro.err4Nodes');
      return;
    }
    if (!modelStore.materials.has(quadMaterialId)) {
      quadError = t('pro.errMaterial');
      return;
    }
    if (quadThickness <= 0) {
      quadError = t('pro.errThickness');
      return;
    }
    const family: ShellFamily = quadFamily === 'auto'
      ? (quadRecommendation?.family ?? 'MITC4')
      : quadFamily;
    modelStore.addQuad(nodeIds as [number, number, number, number], quadMaterialId, quadThickness);
    const quads = [...modelStore.model.quads.values()];
    const last = quads[quads.length - 1];
    if (last) last.shellFamily = family;
    quadNodes = ['', '', '', ''];
    quadRecommendation = null;
  }

  function deletePlate(id: number) {
    modelStore.removePlate(id);
  }

  function deleteQuad(id: number) {
    modelStore.removeQuad(id);
  }

  /**
   * Quick mesh generator: given 4 corner node IDs defining a rectangular region
   * and nx x ny subdivisions, creates intermediate nodes and quad elements.
   *
   * Corner ordering:
   *   n3 --- n2
   *   |       |
   *   n0 --- n1
   *
   * Bilinear interpolation is used to place intermediate nodes, so corners
   * don't need to form a perfect rectangle — any quadrilateral works.
   */
  function generateMesh() {
    meshError = null;
    meshSuccess = null;

    const cornerIds = validateNodeIds(meshCorners, 4);
    if (!cornerIds) {
      meshError = t('pro.err4Corners');
      return;
    }
    if (meshNx < 1 || meshNy < 1) {
      meshError = t('pro.errSubdivisions');
      return;
    }
    if (!modelStore.materials.has(meshMaterialId)) {
      meshError = t('pro.errMaterial');
      return;
    }
    if (meshThickness <= 0) {
      meshError = t('pro.errThickness');
      return;
    }

    // Get corner positions
    const corners = cornerIds.map(id => modelStore.nodes.get(id)!);
    const [c0, c1, c2, c3] = corners;

    // Build grid of node IDs: (nx+1) x (ny+1)
    const nodeGrid: number[][] = [];

    for (let j = 0; j <= meshNy; j++) {
      const row: number[] = [];
      const v = j / meshNy;
      for (let i = 0; i <= meshNx; i++) {
        const u = i / meshNx;

        // Check if this is a corner node — reuse existing node
        if (i === 0 && j === 0) { row.push(cornerIds[0]); continue; }
        if (i === meshNx && j === 0) { row.push(cornerIds[1]); continue; }
        if (i === meshNx && j === meshNy) { row.push(cornerIds[2]); continue; }
        if (i === 0 && j === meshNy) { row.push(cornerIds[3]); continue; }

        // Bilinear interpolation
        const x = (1 - u) * (1 - v) * c0.x + u * (1 - v) * c1.x + u * v * c2.x + (1 - u) * v * c3.x;
        const y = (1 - u) * (1 - v) * c0.y + u * (1 - v) * c1.y + u * v * c2.y + (1 - u) * v * c3.y;
        const z0 = c0.z ?? 0, z1 = c1.z ?? 0, z2 = c2.z ?? 0, z3 = c3.z ?? 0;
        const z = (1 - u) * (1 - v) * z0 + u * (1 - v) * z1 + u * v * z2 + (1 - u) * v * z3;

        const nodeId = modelStore.addNode(x, y, z !== 0 ? z : undefined);
        row.push(nodeId);
      }
      nodeGrid.push(row);
    }

    // Create quad elements for each cell
    let quadCount = 0;
    for (let j = 0; j < meshNy; j++) {
      for (let i = 0; i < meshNx; i++) {
        const n0 = nodeGrid[j][i];
        const n1 = nodeGrid[j][i + 1];
        const n2 = nodeGrid[j + 1][i + 1];
        const n3 = nodeGrid[j + 1][i];
        modelStore.addQuad([n0, n1, n2, n3], meshMaterialId, meshThickness);
        quadCount++;
      }
    }

    const nodeCount = (meshNx + 1) * (meshNy + 1) - 4; // minus 4 reused corners
    meshSuccess = t('pro.meshSuccess').replace('{nodes}', String(nodeCount)).replace('{quads}', String(quadCount));
  }

  // Collapse states for sections
  let showPlateCreator = $state(true);
  let showQuadCreator = $state(true);
  let showMeshGen = $state(false);
  let showTable = $state(true);

  function getMaterialName(id: number): string {
    const m = modelStore.materials.get(id);
    return m ? m.name : `#${id}`;
  }
</script>

<div class="pro-shells">
  <!-- Header -->
  <div class="pro-shells-header">
    <span class="pro-shells-count">{t('pro.nPlatesQuads').replace('{plates}', String(plateCount)).replace('{quads}', String(quadCount))}</span>
  </div>

  <div class="pro-shells-scroll">
    <!-- Plate (DKT triangle) creator -->
    <div class="section">
      <button class="section-toggle" onclick={() => showPlateCreator = !showPlateCreator}>
        <span class="toggle-arrow">{showPlateCreator ? '\u25BE' : '\u25B8'}</span>
        {t('pro.plateTriDKT')}
      </button>
      {#if showPlateCreator}
        <div class="section-body">
          <div class="input-row">
            <label>{t('pro.nodes')}:</label>
            <input type="text" bind:value={plateNodes[0]} placeholder="N1" class="node-input" oninput={updatePlateRecommendation} />
            <input type="text" bind:value={plateNodes[1]} placeholder="N2" class="node-input" oninput={updatePlateRecommendation} />
            <input type="text" bind:value={plateNodes[2]} placeholder="N3" class="node-input" oninput={updatePlateRecommendation} />
          </div>
          <div class="input-row">
            <label>{t('pro.thMaterial')}:</label>
            <select bind:value={plateMaterialId} class="mat-select">
              {#each materials as m}
                <option value={m.id}>{m.name}</option>
              {/each}
            </select>
          </div>
          <div class="input-row">
            <label>{t('pro.thickness')}:</label>
            <input type="number" bind:value={plateThickness} step="0.01" min="0.001" class="thick-input" oninput={updatePlateRecommendation} />
          </div>
          <div class="input-row">
            <label>Family:</label>
            <select bind:value={plateFamily} class="family-select">
              <option value="auto">Auto{plateRecommendation ? ` (${plateRecommendation.family})` : ''}</option>
              <option value="DKT">DKT (Kirchhoff)</option>
              <option value="DKMT" disabled>DKMT (Mindlin) — planned</option>
            </select>
          </div>
          {#if plateRecommendation}
            <div class="recommendation" class:warn={plateRecommendation.confidence !== 'high'}>
              <span class="rec-icon">{plateRecommendation.confidence === 'high' ? '\u2713' : '\u26A0'}</span>
              <span class="rec-text">{plateRecommendation.reason}</span>
            </div>
            {#each plateRecommendation.warnings as w}
              <div class="rec-warning">{w}</div>
            {/each}
          {/if}
          {#if plateError}
            <div class="field-error">{plateError}</div>
          {/if}
          <button class="pro-btn pro-btn-accent" onclick={addPlate}>{t('pro.addPlate')}</button>
        </div>
      {/if}
    </div>

    <!-- Quad (MITC4) creator -->
    <div class="section">
      <button class="section-toggle" onclick={() => showQuadCreator = !showQuadCreator}>
        <span class="toggle-arrow">{showQuadCreator ? '\u25BE' : '\u25B8'}</span>
        {t('pro.quadMITC4')}
      </button>
      {#if showQuadCreator}
        <div class="section-body">
          <div class="input-row">
            <label>{t('pro.nodes')}:</label>
            <input type="text" bind:value={quadNodes[0]} placeholder="N1" class="node-input" oninput={updateQuadRecommendation} />
            <input type="text" bind:value={quadNodes[1]} placeholder="N2" class="node-input" oninput={updateQuadRecommendation} />
            <input type="text" bind:value={quadNodes[2]} placeholder="N2" class="node-input" oninput={updateQuadRecommendation} />
            <input type="text" bind:value={quadNodes[3]} placeholder="N4" class="node-input" oninput={updateQuadRecommendation} />
          </div>
          <div class="input-row">
            <label>{t('pro.thMaterial')}:</label>
            <select bind:value={quadMaterialId} class="mat-select">
              {#each materials as m}
                <option value={m.id}>{m.name}</option>
              {/each}
            </select>
          </div>
          <div class="input-row">
            <label>{t('pro.thickness')}:</label>
            <input type="number" bind:value={quadThickness} step="0.01" min="0.001" class="thick-input" oninput={updateQuadRecommendation} />
          </div>
          <div class="input-row">
            <label>Family:</label>
            <select bind:value={quadFamily} class="family-select">
              <option value="auto">Auto{quadRecommendation ? ` (${quadRecommendation.family})` : ''}</option>
              <option value="MITC4">MITC4 (4-node)</option>
              <option value="MITC9" disabled>MITC9 (9-node) — planned</option>
              <option value="SHB8PS" disabled>SHB8PS (solid-shell) — planned</option>
            </select>
          </div>
          {#if quadRecommendation}
            <div class="recommendation" class:warn={quadRecommendation.confidence !== 'high'}>
              <span class="rec-icon">{quadRecommendation.confidence === 'high' ? '\u2713' : '\u26A0'}</span>
              <span class="rec-text">{quadRecommendation.reason}</span>
            </div>
            {#each quadRecommendation.warnings as w}
              <div class="rec-warning">{w}</div>
            {/each}
          {/if}
          {#if quadError}
            <div class="field-error">{quadError}</div>
          {/if}
          <button class="pro-btn pro-btn-accent" onclick={addQuad}>{t('pro.addQuad')}</button>
        </div>
      {/if}
    </div>

    <!-- Quick mesh generator -->
    <div class="section">
      <button class="section-toggle" onclick={() => showMeshGen = !showMeshGen}>
        <span class="toggle-arrow">{showMeshGen ? '\u25BE' : '\u25B8'}</span>
        {t('pro.meshGenerator')}
      </button>
      {#if showMeshGen}
        <div class="section-body">
          <div class="mesh-hint">
            {t('pro.meshHint')}
          </div>
          <div class="input-row">
            <label>{t('pro.corners')}:</label>
            <input type="text" bind:value={meshCorners[0]} placeholder="N0" class="node-input" />
            <input type="text" bind:value={meshCorners[1]} placeholder="N1" class="node-input" />
            <input type="text" bind:value={meshCorners[2]} placeholder="N2" class="node-input" />
            <input type="text" bind:value={meshCorners[3]} placeholder="N3" class="node-input" />
          </div>
          <div class="input-row">
            <label>{t('pro.subdivisions')}:</label>
            <input type="number" bind:value={meshNx} min="1" max="50" class="sub-input" />
            <span class="x-label">&times;</span>
            <input type="number" bind:value={meshNy} min="1" max="50" class="sub-input" />
          </div>
          <div class="input-row">
            <label>{t('pro.thMaterial')}:</label>
            <select bind:value={meshMaterialId} class="mat-select">
              {#each materials as m}
                <option value={m.id}>{m.name}</option>
              {/each}
            </select>
          </div>
          <div class="input-row">
            <label>{t('pro.thickness')}:</label>
            <input type="number" bind:value={meshThickness} step="0.01" min="0.001" class="thick-input" />
          </div>
          {#if meshError}
            <div class="field-error">{meshError}</div>
          {/if}
          {#if meshSuccess}
            <div class="field-success">{meshSuccess}</div>
          {/if}
          <button class="pro-btn pro-btn-accent" onclick={generateMesh}>{t('pro.generateMesh')}</button>
        </div>
      {/if}
    </div>

    <!-- Table of existing shells -->
    <div class="section">
      <button class="section-toggle" onclick={() => showTable = !showTable}>
        <span class="toggle-arrow">{showTable ? '\u25BE' : '\u25B8'}</span>
        {t('pro.elemTable').replace('{n}', String(plateCount + quadCount))}
      </button>
      {#if showTable}
        <div class="section-body">
          {#if plates.length > 0}
            <div class="table-label">{t('pro.triPlatesDKT')}</div>
            <div class="pro-shells-table-wrap">
              <table class="pro-shells-table">
                <thead>
                  <tr>
                    <th class="col-id">ID</th>
                    <th class="col-nodes">Nodos</th>
                    <th class="col-family">Family</th>
                    <th class="col-mat">Material</th>
                    <th class="col-thick">Esp. (m)</th>
                    <th class="col-actions"></th>
                  </tr>
                </thead>
                <tbody>
                  {#each plates as plate}
                    <tr>
                      <td class="col-id">{plate.id}</td>
                      <td class="col-nodes">{plate.nodes.join(', ')}</td>
                      <td class="col-family">{plate.shellFamily ?? 'DKT'}</td>
                      <td class="col-mat">{getMaterialName(plate.materialId)}</td>
                      <td class="col-thick">{plate.thickness.toFixed(3)}</td>
                      <td class="col-actions">
                        <button class="pro-delete-btn" onclick={() => deletePlate(plate.id)}>&times;</button>
                      </td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          {/if}

          {#if quads.length > 0}
            <div class="table-label">{t('pro.quadsMITC4')}</div>
            <div class="pro-shells-table-wrap">
              <table class="pro-shells-table">
                <thead>
                  <tr>
                    <th class="col-id">ID</th>
                    <th class="col-nodes">Nodos</th>
                    <th class="col-family">Family</th>
                    <th class="col-mat">Material</th>
                    <th class="col-thick">Esp. (m)</th>
                    <th class="col-actions"></th>
                  </tr>
                </thead>
                <tbody>
                  {#each quads as quad}
                    <tr>
                      <td class="col-id">{quad.id}</td>
                      <td class="col-nodes">{quad.nodes.join(', ')}</td>
                      <td class="col-family">{quad.shellFamily ?? 'MITC4'}</td>
                      <td class="col-mat">{getMaterialName(quad.materialId)}</td>
                      <td class="col-thick">{quad.thickness.toFixed(3)}</td>
                      <td class="col-actions">
                        <button class="pro-delete-btn" onclick={() => deleteQuad(quad.id)}>&times;</button>
                      </td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          {/if}

          {#if plates.length === 0 && quads.length === 0}
            <div class="pro-empty">{t('pro.emptyShells')}</div>
          {/if}
        </div>
      {/if}
    </div>
  </div>
</div>

<style>
  .pro-shells {
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  .pro-shells-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 10px;
    border-bottom: 1px solid #1a3050;
    flex-shrink: 0;
  }

  .pro-shells-count {
    font-size: 0.82rem;
    color: #4ecdc4;
    font-weight: 600;
  }

  .pro-shells-scroll {
    flex: 1;
    overflow-y: auto;
  }

  /* Collapsible sections */
  .section {
    border-bottom: 1px solid #1a3050;
  }

  .section-toggle {
    width: 100%;
    text-align: left;
    padding: 8px 12px;
    font-size: 0.78rem;
    font-weight: 600;
    color: #aaa;
    background: #0a1a30;
    border: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .section-toggle:hover {
    color: #ddd;
    background: #0f2840;
  }

  .toggle-arrow {
    font-size: 0.65rem;
    color: #666;
  }

  .section-body {
    padding: 10px 12px 12px;
    background: #0f2840;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  /* Input rows */
  .input-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .input-row label {
    font-size: 0.75rem;
    color: #888;
    min-width: 70px;
    flex-shrink: 0;
  }

  .node-input {
    width: 48px;
    padding: 4px 6px;
    background: #0a1a30;
    border: 1px solid #1a3050;
    border-radius: 3px;
    color: #ddd;
    font-size: 0.78rem;
    font-family: monospace;
    text-align: center;
  }

  .node-input:focus {
    border-color: #1a4a7a;
    outline: none;
  }

  .mat-select {
    flex: 1;
    padding: 4px 6px;
    background: #0a1a30;
    border: 1px solid #1a3050;
    border-radius: 3px;
    color: #ccc;
    font-size: 0.75rem;
    cursor: pointer;
  }

  .mat-select:focus {
    border-color: #1a4a7a;
    outline: none;
  }

  .thick-input {
    width: 75px;
    padding: 4px 6px;
    background: #0a1a30;
    border: 1px solid #1a3050;
    border-radius: 3px;
    color: #ddd;
    font-size: 0.78rem;
    font-family: monospace;
  }

  .thick-input:focus {
    border-color: #1a4a7a;
    outline: none;
  }

  .sub-input {
    width: 44px;
    padding: 3px 5px;
    background: #0a1a30;
    border: 1px solid #1a3050;
    border-radius: 3px;
    color: #ddd;
    font-size: 0.72rem;
    font-family: monospace;
    text-align: center;
  }

  .sub-input:focus {
    border-color: #1a4a7a;
    outline: none;
  }

  .x-label {
    font-size: 0.72rem;
    color: #666;
  }

  /* Buttons */
  .pro-btn {
    padding: 5px 14px;
    font-size: 0.75rem;
    font-weight: 500;
    color: #ccc;
    background: #0f3460;
    border: 1px solid #1a4a7a;
    border-radius: 3px;
    cursor: pointer;
    align-self: flex-start;
  }

  .pro-btn:hover {
    background: #1a4a7a;
    color: #fff;
  }

  .pro-btn-accent {
    background: #0f3460;
    border-color: #4ecdc4;
    color: #4ecdc4;
  }

  .pro-btn-accent:hover {
    background: #1a4a7a;
    color: #fff;
  }

  /* Errors / success */
  .field-error {
    font-size: 0.68rem;
    color: #ff8a9e;
    padding: 2px 0;
  }

  .field-success {
    font-size: 0.68rem;
    color: #4ecdc4;
    padding: 2px 0;
  }

  .mesh-hint {
    font-size: 0.72rem;
    color: #668;
    font-style: italic;
    line-height: 1.4;
  }

  /* Tables */
  .table-label {
    font-size: 0.65rem;
    font-weight: 600;
    color: #888;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    margin-top: 4px;
    margin-bottom: 2px;
  }

  .pro-shells-table-wrap {
    overflow-x: auto;
  }

  .pro-shells-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.72rem;
  }

  .pro-shells-table thead {
    position: sticky;
    top: 0;
    z-index: 1;
  }

  .pro-shells-table th {
    padding: 4px 4px;
    text-align: left;
    font-size: 0.6rem;
    font-weight: 600;
    color: #888;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    background: #0a1a30;
    border-bottom: 1px solid #1a4a7a;
    white-space: nowrap;
  }

  .pro-shells-table td {
    padding: 3px 4px;
    border-bottom: 1px solid #0f2030;
  }

  .pro-shells-table tr:hover {
    background: rgba(78, 205, 196, 0.04);
  }

  .col-id {
    width: 30px;
    color: #666;
    font-family: monospace;
    font-size: 0.68rem;
    text-align: center;
  }

  .col-nodes {
    font-family: monospace;
    font-size: 0.68rem;
    color: #ccc;
  }

  .col-mat {
    font-size: 0.68rem;
    color: #aaa;
  }

  .col-thick {
    font-family: monospace;
    font-size: 0.68rem;
    color: #aaa;
    text-align: right;
  }

  .col-actions {
    width: 20px;
    text-align: center;
  }

  .pro-delete-btn {
    background: none;
    border: none;
    color: #555;
    font-size: 1rem;
    cursor: pointer;
    padding: 0;
    line-height: 1;
  }

  .pro-delete-btn:hover {
    color: #ff6b6b;
  }

  .pro-empty {
    text-align: center;
    color: #555;
    font-style: italic;
    padding: 16px 10px;
    font-size: 0.72rem;
  }

  /* Shell family selector */
  .family-select {
    flex: 1;
    padding: 4px 6px;
    background: #0a1a30;
    border: 1px solid #1a3050;
    border-radius: 3px;
    color: #ccc;
    font-size: 0.75rem;
    cursor: pointer;
  }

  .family-select:focus {
    border-color: #1a4a7a;
    outline: none;
  }

  .family-select option:disabled {
    color: #555;
    font-style: italic;
  }

  /* Recommendation display */
  .recommendation {
    display: flex;
    align-items: flex-start;
    gap: 6px;
    padding: 6px 8px;
    background: rgba(78, 205, 196, 0.06);
    border: 1px solid rgba(78, 205, 196, 0.15);
    border-radius: 4px;
    font-size: 0.68rem;
    line-height: 1.45;
    color: #8ab4b0;
  }

  .recommendation.warn {
    background: rgba(251, 191, 36, 0.06);
    border-color: rgba(251, 191, 36, 0.15);
    color: #c4a94d;
  }

  .rec-icon {
    flex-shrink: 0;
    font-size: 0.72rem;
  }

  .rec-text {
    flex: 1;
  }

  .rec-warning {
    font-size: 0.65rem;
    color: #c4a94d;
    padding: 2px 8px 2px 22px;
    line-height: 1.4;
  }

  .rec-warning::before {
    content: '\26A0 ';
  }

  .col-family {
    font-size: 0.65rem;
    font-weight: 600;
    color: #4ecdc4;
    font-family: monospace;
    white-space: nowrap;
  }
</style>
