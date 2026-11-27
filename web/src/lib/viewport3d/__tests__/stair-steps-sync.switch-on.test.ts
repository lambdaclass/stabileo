/**
 * The viewport draws the steps of every plate declared a flight, before the analysis meshes it and
 * after, keeps them while nothing about them changes, hides them with the flight's shells and takes
 * them away with their plate.
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { modelStore } from '../../store/model.svelte';
import { uiStore } from '../../store/ui.svelte';
import '../../store';
import { initSolver } from '../../engine/wasm-solver';
import { galleryExample } from '../../data/__tests__/gallery-examples';
import { physicalPlates, preparePlatesForAnalysis } from '../../store/physical-plates';
import { meshBeforeAnalysis } from '../../store/mesh-policy.svelte';
import { syncStairSteps } from '../stair-steps-sync';
import { viewVisibility } from '../../store/view-state.svelte';

beforeAll(async () => { await initSolver(); });
beforeEach(() => { uiStore.analysisMode = 'pro'; modelStore.clear(); });
afterEach(() => { uiStore.analysisMode = '3d'; });

const nodeAt = (id: number) => { const n = modelStore.nodes.get(id); return n ? { x: n.x, y: n.y, z: n.z ?? 0 } : null; };
const drawn = (parent: THREE.Group) => parent.children.map((c) => c.userData.stairSteps as number).sort((a, b) => a - b);

describe('the steps the viewport draws', () => {
  it('are those of the building\'s twelve flights, meshed or not, rebuilt only when what they show changes', async () => {
    await galleryExample('pro-rc-party-wall').load();
    const flights = physicalPlates().filter((p) => p.physical.stair).map((p) => p.id).sort((a, b) => a - b);
    expect(flights).toHaveLength(12);
    expect(physicalPlates().filter((p) => p.physical.stair).every((p) => p.name.startsWith('Tramo') && p.physical.stair!.steps === 9)).toBe(true);
    const parent = new THREE.Group();
    syncStairSteps(parent, 'solid', nodeAt);
    expect(drawn(parent)).toEqual(flights);
    const first = parent.children[0];
    syncStairSteps(parent, 'solid', nodeAt);
    expect(parent.children[0]).toBe(first);
    syncStairSteps(parent, 'sections', nodeAt);
    expect(parent.children).not.toContain(first);
    expect(drawn(parent)).toEqual(flights);

    meshBeforeAnalysis.value = true;
    expect(preparePlatesForAnalysis().ok).toBe(true);
    syncStairSteps(parent, 'sections', nodeAt);
    expect(drawn(parent)).toEqual(flights);

    const flight = physicalPlates().find((p) => p.id === flights[1])!;
    viewVisibility.hide({ nodes: [], elements: [], shells: (flight.group.members.quads ?? []).map((q) => `q${q}`) });
    syncStairSteps(parent, 'sections', nodeAt);
    expect(drawn(parent)).toEqual(flights.filter((id) => id !== flights[1]));
    viewVisibility.showAll();
    modelStore.model.groups = new Map([...modelStore.model.groups].filter(([id]) => id !== flights[0]));
    syncStairSteps(parent, 'sections', nodeAt);
    expect(drawn(parent)).toEqual(flights.slice(1));
  }, 120_000);
});
