import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { createLinkedLayer } from '../linked-layer';
import { sceneHost } from '../../viewport3d/scene-host.svelte';

const ref = { meshes: [{ type: 'IfcWall', color: [0.5, 0.5, 0.5], positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), indices: new Uint32Array([0, 1, 2]) }], symbols: [] } as never;

describe('the linked models layer', () => {
  it('leaves the shared scene, and its view category, when it is cleared', () => {
    const scene = new THREE.Scene();
    let redraws = 0;
    const host = { scene, redraw: () => { redraws++; } };
    const layer = createLinkedLayer();
    layer.show(host, [ref]);
    const drawn = scene.getObjectByName('linkedModels');
    expect(drawn).toBeDefined();
    expect(sceneHost.toned.get(drawn!)).toBe('linked');
    layer.show(host, [ref, ref]);
    expect(scene.children.filter((c) => c.name === 'linkedModels')).toHaveLength(1);
    const before = redraws;
    layer.clear(host);
    expect(scene.getObjectByName('linkedModels')).toBeUndefined();
    expect([...sceneHost.toned.keys()].some((o) => o.name === 'linkedModels')).toBe(false);
    expect(redraws).toBeGreaterThan(before);
  });

  it('redraws the scene it was shown on when cleared without a host, as on unmount', () => {
    const scene = new THREE.Scene();
    let redraws = 0;
    const layer = createLinkedLayer();
    layer.show({ scene, redraw: () => { redraws++; } }, [ref]);
    const before = redraws;
    layer.clear(null);
    expect(scene.getObjectByName('linkedModels')).toBeUndefined();
    expect(redraws).toBe(before + 1);
  });

  it('redraws the scene it left when shown with no host', () => {
    const scene = new THREE.Scene();
    let redraws = 0;
    const layer = createLinkedLayer();
    layer.show({ scene, redraw: () => { redraws++; } }, [ref]);
    const before = redraws;
    layer.show(null, [ref]);
    expect(scene.getObjectByName('linkedModels')).toBeUndefined();
    expect(redraws).toBe(before + 1);
  });
});
