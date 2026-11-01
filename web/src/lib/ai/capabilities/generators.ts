import type { ActionParams, BuildAction } from './actions';
import { Builder, resolveSection, resolveSupport, sectionToJson, type Snapshot } from './builder';
import { AiActionError } from './limits';
import { defaultColumnSection, defaultSection, trussSection } from './sections';

const range = (n: number): number[] => Array.from({ length: Math.max(0, n) }, (_, i) => i);
const nonZero = (v: number | undefined): v is number => v !== undefined && v !== 0;

export function generateBeam(p: ActionParams['create_beam']): Snapshot {
  const b = Builder.new2d(resolveSection(p.section));
  const n1 = b.addNode2d(0, 0);
  const n2 = b.addNode2d(p.span, 0);
  const eid = b.addFrame(n1, n2);
  b.addSupport(n1, resolveSupport(p.support_left, 'pinned'));
  b.addSupport(n2, resolveSupport(p.support_right, 'rollerX'));
  if (nonZero(p.q)) b.addDistributedLoad(eid, p.q);
  if (nonZero(p.p_tip)) b.addNodalLoad2d(n2, 0, p.p_tip);
  return b.toSnapshot();
}

export function generateCantilever(p: ActionParams['create_cantilever']): Snapshot {
  const b = Builder.new2d(resolveSection(p.section));
  const n1 = b.addNode2d(0, 0);
  const n2 = b.addNode2d(p.length, 0);
  const eid = b.addFrame(n1, n2);
  b.addSupport(n1, 'fixed');
  if (nonZero(p.q)) b.addDistributedLoad(eid, p.q);
  if (nonZero(p.p_tip)) b.addNodalLoad2d(n2, 0, p.p_tip);
  return b.toSnapshot();
}

export function generateContinuousBeam(p: ActionParams['create_continuous_beam']): Snapshot {
  const b = Builder.new2d(resolveSection(p.section));
  let x = 0;
  const nodeIds = [b.addNode2d(x, 0)];
  for (const span of p.spans) {
    x += span;
    nodeIds.push(b.addNode2d(x, 0));
  }
  for (const i of range(p.spans.length)) {
    const eid = b.addFrame(nodeIds[i], nodeIds[i + 1]);
    if (nonZero(p.q)) b.addDistributedLoad(eid, p.q);
  }
  b.addSupport(nodeIds[0], 'pinned');
  for (const id of nodeIds.slice(1)) b.addSupport(id, 'rollerX');
  return b.toSnapshot();
}

export function generatePortalFrame(p: ActionParams['create_portal_frame']): Snapshot {
  const bSec = resolveSection(p.beam_section);
  const cSec = resolveSection(p.column_section, defaultColumnSection);
  const supType = resolveSupport(p.base_support, 'fixed');
  const b = Builder.new2d(bSec);
  if (cSec.name !== bSec.name) b.sections.push(sectionToJson(2, cSec));
  const colSecId = cSec.name !== bSec.name ? 2 : 1;

  const n1 = b.addNode2d(0, 0);
  const n2 = b.addNode2d(0, p.height);
  const n3 = b.addNode2d(p.width, p.height);
  const n4 = b.addNode2d(p.width, 0);
  b.addFrame(n1, n2, colSecId);
  const beam = b.addFrame(n2, n3);
  b.addFrame(n4, n3, colSecId);
  b.addSupport(n1, supType);
  b.addSupport(n4, supType);
  if (nonZero(p.q_beam)) b.addDistributedLoad(beam, p.q_beam);
  if (nonZero(p.h_lateral)) b.addNodalLoad2d(n2, p.h_lateral, 0);
  return b.toSnapshot();
}

export function generateTruss(p: ActionParams['create_truss']): Snapshot {
  const nPanels = p.n_panels ?? 4;
  const b = Builder.new2d(defaultSection());
  b.sections.push(sectionToJson(2, trussSection()));
  const dx = p.span / nPanels;
  const pattern = p.pattern ?? 'pratt';

  const bottom = range(nPanels + 1).map((i) => b.addNode2d(i * dx, 0));
  let top: number[];

  if (pattern === 'warren') {
    top = range(nPanels).map((i) => b.addNode2d((i + 0.5) * dx, p.height));
    for (const i of range(nPanels)) b.addTruss(bottom[i], bottom[i + 1], 2);
    for (const i of range(nPanels - 1)) b.addTruss(top[i], top[i + 1], 2);
    for (const i of range(nPanels)) {
      b.addTruss(bottom[i], top[i], 2);
      b.addTruss(top[i], bottom[i + 1], 2);
    }
  } else {
    top = range(nPanels + 1).map((i) => b.addNode2d(i * dx, p.height));
    for (const i of range(nPanels)) b.addTruss(bottom[i], bottom[i + 1], 2);
    for (const i of range(nPanels)) b.addTruss(top[i], top[i + 1], 2);
    for (const i of range(nPanels + 1)) b.addTruss(bottom[i], top[i], 2);
    const mid = Math.floor(nPanels / 2);
    const howe = pattern === 'howe';
    for (const i of range(nPanels)) {
      if ((i < mid) === howe) b.addTruss(bottom[i], top[i + 1], 2);
      else b.addTruss(top[i], bottom[i + 1], 2);
    }
  }

  b.addSupport(bottom[0], 'pinned');
  b.addSupport(bottom[bottom.length - 1], 'rollerX');
  const load = p.top_load ?? -10;
  for (const id of top) b.addNodalLoad2d(id, 0, load);
  return b.toSnapshot();
}

export function generatePortalFrame3d(p: ActionParams['create_portal_frame_3d']): Snapshot {
  const b = Builder.new3d(resolveSection(p.beam_section), resolveSection(p.column_section, defaultColumnSection));
  const supType = resolveSupport(p.base_support, 'fixed3d');
  const { width: w, depth: d, height: h } = p;
  const n1 = b.addNode3d(0, 0, 0);
  const n2 = b.addNode3d(w, 0, 0);
  const n3 = b.addNode3d(w, d, 0);
  const n4 = b.addNode3d(0, d, 0);
  const n5 = b.addNode3d(0, 0, h);
  const n6 = b.addNode3d(w, 0, h);
  const n7 = b.addNode3d(w, d, h);
  const n8 = b.addNode3d(0, d, h);
  b.addFrame(n1, n5, 1);
  b.addFrame(n2, n6, 1);
  b.addFrame(n3, n7, 1);
  b.addFrame(n4, n8, 1);
  const beam1 = b.addFrame(n5, n6, 2);
  const beam2 = b.addFrame(n7, n8, 2);
  b.addFrame(n5, n8, 2);
  b.addFrame(n6, n7, 2);
  for (const n of [n1, n2, n3, n4]) b.addSupport(n, supType);
  if (nonZero(p.q_beam)) {
    b.addDistributedLoad(beam1, p.q_beam);
    b.addDistributedLoad(beam2, p.q_beam);
  }
  return b.toSnapshot();
}

export function generateMultiStoryFrame(p: ActionParams['create_multi_story_frame']): Snapshot {
  const bSec = resolveSection(p.beam_section);
  const cSec = resolveSection(p.column_section, defaultColumnSection);
  const b = Builder.new2d(bSec);
  if (cSec.name !== bSec.name) b.sections.push(sectionToJson(2, cSec));
  const colSecId = cSec.name !== bSec.name ? 2 : 1;

  const grid = range(p.n_floors + 1).map((f) =>
    range(p.n_bays + 1).map((c) => b.addNode2d(c * p.bay_width, f * p.floor_height)));
  for (const f of range(p.n_floors)) {
    for (const c of range(p.n_bays + 1)) b.addFrame(grid[f][c], grid[f + 1][c], colSecId);
  }
  for (const f of range(p.n_floors).map((i) => i + 1)) {
    for (const c of range(p.n_bays)) {
      const eid = b.addFrame(grid[f][c], grid[f][c + 1]);
      if (nonZero(p.q_beam)) b.addDistributedLoad(eid, p.q_beam);
    }
  }
  for (const c of range(p.n_bays + 1)) b.addSupport(grid[0][c], 'fixed');
  if (nonZero(p.h_lateral)) {
    for (const f of range(p.n_floors).map((i) => i + 1)) b.addNodalLoad2d(grid[f][0], p.h_lateral, 0);
  }
  return b.toSnapshot();
}

export function generateMultiStoryFrame3d(p: ActionParams['create_multi_story_frame_3d']): Snapshot {
  const b = Builder.new3d(resolveSection(p.beam_section), resolveSection(p.column_section, defaultColumnSection));
  const supType = resolveSupport(p.base_support, 'fixed3d');
  const nx = p.n_bays_x;
  const nz = p.n_bays_z;
  const floorsAbove = range(p.n_floors).map((i) => i + 1);

  const grid = range(p.n_floors + 1).map((f) => {
    const z = f * p.floor_height;
    return range(nz + 1).map((iz) => range(nx + 1).map((ix) => b.addNode3d(ix * p.bay_width, iz * p.bay_width, z)));
  });

  for (const f of range(p.n_floors)) {
    for (const iz of range(nz + 1)) {
      for (const ix of range(nx + 1)) b.addFrame(grid[f][iz][ix], grid[f + 1][iz][ix], 1);
    }
  }
  for (const f of floorsAbove) {
    for (const iz of range(nz + 1)) {
      for (const ix of range(nx)) {
        const eid = b.addFrame(grid[f][iz][ix], grid[f][iz][ix + 1], 2);
        if (nonZero(p.q_beam)) b.addDistributedLoad(eid, p.q_beam);
      }
    }
  }
  for (const f of floorsAbove) {
    for (const ix of range(nx + 1)) {
      for (const iz of range(nz)) {
        const eid = b.addFrame(grid[f][iz][ix], grid[f][iz + 1][ix], 2);
        if (nonZero(p.q_beam)) b.addDistributedLoad(eid, p.q_beam);
      }
    }
  }
  for (const f of range(p.n_floors)) {
    for (const iz of [0, nz]) {
      for (const ix of range(nx)) {
        b.addTruss(grid[f][iz][ix], grid[f + 1][iz][ix + 1], 2);
        b.addTruss(grid[f][iz][ix + 1], grid[f + 1][iz][ix], 2);
      }
    }
    for (const ix of [0, nx]) {
      for (const iz of range(nz)) {
        b.addTruss(grid[f][iz][ix], grid[f + 1][iz + 1][ix], 2);
        b.addTruss(grid[f][iz + 1][ix], grid[f + 1][iz][ix], 2);
      }
    }
  }
  for (const iz of range(nz + 1)) {
    for (const ix of range(nx + 1)) b.addSupport(grid[0][iz][ix], supType);
  }
  if (nonZero(p.h_lateral)) {
    for (const f of floorsAbove) {
      for (const iz of range(nz + 1)) b.addNodalLoad3d(grid[f][iz][0], p.h_lateral / (nz + 1), 0, 0);
    }
  }
  return b.toSnapshot();
}

export function executeAction(a: BuildAction): Snapshot {
  switch (a.action) {
    case 'create_beam': return generateBeam(a.params);
    case 'create_cantilever': return generateCantilever(a.params);
    case 'create_continuous_beam': return generateContinuousBeam(a.params);
    case 'create_portal_frame': return generatePortalFrame(a.params);
    case 'create_truss': return generateTruss(a.params);
    case 'create_multi_story_frame': return generateMultiStoryFrame(a.params);
    case 'create_multi_story_frame_3d': return generateMultiStoryFrame3d(a.params);
    case 'create_portal_frame_3d': return generatePortalFrame3d(a.params);
    case 'unsupported':
      throw new AiActionError('I can build: beams, cantilevers, continuous beams, portal frames, trusses, and simple 3D frames. Please describe one of these structures.');
    default:
      throw new AiActionError('Edit actions require an existing model snapshot');
  }
}
