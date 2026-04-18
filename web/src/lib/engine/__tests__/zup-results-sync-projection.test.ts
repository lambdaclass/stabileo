/**
 * Z-up coordinate projection tests for results-sync.ts.
 *
 * Bug: Several functions in results-sync.ts use raw node.y for positioning
 * instead of going through projectNodeToScene(). In 2D models embedded in
 * the 3D viewport (Z-up), node.y must be projected to scene.z, not scene.y.
 *
 * The correct mapping for 2D-in-3D is:
 *   scene.x = node.x, scene.y = 0, scene.z = node.y
 *
 * Five locations are checked:
 * 1. computeStructureBBox — bounding box for mode shape scaling
 * 2. syncVerificationLabels — midpoint positioning of ratio labels
 * 3. applyFrameHeatmap — heatmap cylinder orientation
 * 4. syncReactions — reaction arrow positioning
 * 5. syncConstraintForces — constraint force arrow positioning
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

describe('results-sync.ts must project all node positions through projectNodeToScene', () => {
  const src = readFileSync(
    new URL('../../viewport3d/results-sync.ts', import.meta.url),
    'utf8',
  );

  // ── Helper: extract a named function body from source ───────────
  function extractFunction(name: string): string {
    const re = new RegExp(`(export\\s+)?function\\s+${name}\\s*\\(`);
    const match = re.exec(src);
    if (!match) throw new Error(`Function ${name} not found`);
    let depth = 0;
    let started = false;
    let start = match.index;
    for (let i = match.index; i < src.length; i++) {
      if (src[i] === '{') { depth++; started = true; }
      if (src[i] === '}') depth--;
      if (started && depth === 0) return src.slice(start, i + 1);
    }
    throw new Error(`Unbalanced braces in ${name}`);
  }

  it('computeStructureBBox should use projected node coordinates, not raw node.y', () => {
    const body = extractFunction('computeStructureBBox');

    // Must NOT iterate modelStore.nodes and read raw n.y / n.x / n.z
    // directly — those are model coordinates that ignore the 2D→XZ swap.
    // Instead it should use projectNodeToScene or getProjectedNodes.
    expect(body, 'computeStructureBBox must not read raw n.y (model Y)')
      .not.toMatch(/\bn\.y\b/);
    expect(body, 'computeStructureBBox must project nodes to scene coordinates')
      .toMatch(/projectNodeToScene|getProjectedNodes/);
  });

  it('syncVerificationLabels should use projected coordinates for midpoint, not raw nI.y/nJ.y', () => {
    const body = extractFunction('syncVerificationLabels');

    // Must not compute midpoint from raw node model coordinates
    expect(body, 'syncVerificationLabels must not read raw nI.y')
      .not.toMatch(/\bnI\.y\b/);
    expect(body, 'syncVerificationLabels must not read raw nJ.y')
      .not.toMatch(/\bnJ\.y\b/);
    // Must use projection
    expect(body, 'syncVerificationLabels must project nodes')
      .toMatch(/projectNodeToScene|getProjectedNodes/);
  });

  it('applyFrameHeatmap should use projected coordinates, not raw nI/nJ model coords', () => {
    const body = extractFunction('applyFrameHeatmap');

    // The orientHeatmapMesh call must not pass raw node coordinates
    expect(body, 'applyFrameHeatmap must not pass raw nI.y to orientHeatmapMesh')
      .not.toMatch(/\bnI\.y\b/);
    expect(body, 'applyFrameHeatmap must not pass raw nJ.y to orientHeatmapMesh')
      .not.toMatch(/\bnJ\.y\b/);
    // Must use projection
    expect(body, 'applyFrameHeatmap must project nodes')
      .toMatch(/projectNodeToScene|getProjectedNodes/);
  });

  it('syncReactions should use projected coordinates, not raw node.y', () => {
    const body = extractFunction('syncReactions');

    // Must not pass raw node model coordinates to createReactionArrow
    expect(body, 'syncReactions must not read raw node.y')
      .not.toMatch(/\bnode\.y\b/);
    // Must use projection
    expect(body, 'syncReactions must project nodes')
      .toMatch(/projectNodeToScene|getProjectedNodes/);
  });

  it('syncConstraintForces should use projected coordinates, not raw node.y', () => {
    const body = extractFunction('syncConstraintForces');

    // Must not pass raw node model coordinates to createConstraintForceArrow
    expect(body, 'syncConstraintForces must not read raw node.y')
      .not.toMatch(/\bnode\.y\b/);
    // Must use projection
    expect(body, 'syncConstraintForces must project nodes')
      .toMatch(/projectNodeToScene|getProjectedNodes/);
  });
});
