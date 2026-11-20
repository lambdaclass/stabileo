import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { hideAllBut, showAgain } from '../scene-solo';
import { sceneHost } from '../scene-host.svelte';
import { viewCategories, VIEW_CATEGORIES } from '../../store/view-categories.svelte';
import { createRebarLayer } from '../../three/rebar-3d-layer';
import { buildGhostGroup, createGhostLayer, GHOST_EDGE_OPACITY, GHOST_FILL_OPACITY } from '../../three/rebar-ghost-layer';
import { ghostCorners, type Ghost3d } from '../../rc-sheets/rebar-3d-ghost';
import type { Rebar3d } from '../../rc-sheets/rebar-3d';

function modelScene() {
  const scene = new THREE.Scene();
  const light = new THREE.DirectionalLight(), members = new THREE.Group(), nodes = new THREE.Group(), off = new THREE.Group(), footings = new THREE.Group();
  const helper = new THREE.Mesh(new THREE.CylinderGeometry(), new THREE.MeshBasicMaterial());
  helper.userData.pickingHelper = true;
  members.add(helper);
  off.visible = false;
  scene.add(new THREE.AmbientLight(), light, members, nodes, off, footings);
  return { scene, members, nodes, off, footings };
}

const flags = (o: THREE.Object3D) => { const out: boolean[] = []; o.traverse((c) => out.push(c.visible)); return out; };

const bar: Rebar3d = { element: 'C1', rows: ['C1'], family: 'column', kind: 'column', tone: 'column', dia: 16, mandrel: 0.1, segments: [[[0, 0, 0], [0, 0, 3]]] };
const ghost = (o: [number, number, number]): Ghost3d => ({ element: 'C1', rows: ['C1'], family: 'column', frame: { o, x: [0, 1, 0], y: [-1, 0, 0], z: [0, 0, 1] }, from: [-0.2, -0.15, 0], to: [0.2, 0.15, 3] });

describe('the bars drawn alone', () => {
  it('a frame hides everything at the top of the scene but the solo layers and the lights, and puts back exactly what it hid', () => {
    const { scene, members, nodes, off, footings } = modelScene();
    const solo = new THREE.Group();
    solo.userData.solo = true;
    scene.add(solo);
    const before = flags(scene);
    const hidden = hideAllBut(scene);
    expect(new Set(hidden)).toEqual(new Set([members, nodes, footings]));
    expect(scene.children.filter((o) => o.visible).map((o) => o.type)).toEqual(['AmbientLight', 'DirectionalLight', 'Group']);
    expect(solo.visible).toBe(true);
    expect(members.children[0]!.visible).toBe(true);
    showAgain(hidden);
    expect(flags(scene)).toEqual(before);
    expect(off.visible).toBe(false);
  });

  it('the bars\' layers mark themselves solo, and turning the view on and off leaves the scene, the categories and the selection-free state as they were', () => {
    const { scene } = modelScene();
    const redraw = vi.fn();
    const host = { scene, redraw };
    sceneHost.attach(host);
    viewCategories.set('loads', 'halftone');
    const states = VIEW_CATEGORIES.map((c) => viewCategories.state(c));
    const children = [...scene.children], before = flags(scene);
    const bars = createRebarLayer(), ghosts = createGhostLayer();
    sceneHost.setSolo(true);
    bars.show(host, [bar]);
    ghosts.show(host, [ghost([1, 2, 0])]);
    expect(sceneHost.solo).toBe(true);
    expect(scene.children.filter((o) => o.userData.solo).map((o) => o.name)).toEqual(['sheetRebar', 'sheetRebarGhost']);
    expect(VIEW_CATEGORIES.map((c) => viewCategories.state(c))).toEqual(states);
    bars.clear(host);
    ghosts.clear(host);
    sceneHost.setSolo(false);
    expect(sceneHost.solo).toBe(false);
    expect(scene.children).toEqual(children);
    expect(flags(scene)).toEqual(before);
    expect(VIEW_CATEGORIES.map((c) => viewCategories.state(c))).toEqual(states);
    expect(redraw).toHaveBeenCalled();
    viewCategories.reset();
    sceneHost.attach(null);
  });

  it('the ghost: one merged mesh and one set of edges for all the elements, faint, not writing depth, each box at its corners', () => {
    const gs = [ghost([0, 0, 0]), ghost([5, 0, 0]), ghost([5, 5, 3])];
    const group = buildGhostGroup(gs, new THREE.Color('#0c1620'));
    const [fill, edges] = group.children as [THREE.Mesh, THREE.LineSegments];
    expect(group.children).toHaveLength(2);
    expect(fill.geometry.getAttribute('position').count).toBe(36 * gs.length);
    expect(edges.geometry.getAttribute('position').count).toBe(24 * gs.length);
    const fm = fill.material as THREE.MeshLambertMaterial, em = edges.material as THREE.LineBasicMaterial;
    expect([fm.opacity, fm.transparent, fm.depthWrite]).toEqual([GHOST_FILL_OPACITY, true, false]);
    expect([em.opacity, em.transparent, em.depthWrite]).toEqual([GHOST_EDGE_OPACITY, true, false]);
    expect(GHOST_FILL_OPACITY).toBeLessThanOrEqual(0.1);
    fill.geometry.computeBoundingBox();
    const box = fill.geometry.boundingBox!;
    expect(box.min.toArray()).toEqual([-0.15, -0.2, 0].map((v) => expect.closeTo(v, 6)));
    expect(box.max.toArray()).toEqual([5.15, 5.2, 6].map((v) => expect.closeTo(v, 6)));
    expect(ghostCorners(gs[0]!)[7]).toEqual([expect.closeTo(-0.15, 9), expect.closeTo(0.2, 9), 3]);
  });

  it('the ghost\'s faces face out whichever hand its frame is', () => {
    const left: Ghost3d = { ...ghost([0, 0, 0]), frame: { o: [0, 0, 0], x: [0, 1, 0], y: [1, 0, 0], z: [0, 0, 1] } };
    for (const g of [ghost([0, 0, 0]), left]) {
      const fill = buildGhostGroup([g]).children[0] as THREE.Mesh;
      const pos = fill.geometry.getAttribute('position'), normals = fill.geometry.getAttribute('normal');
      for (let i = 0; i < 36; i += 3) {
        const c = new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i)).sub(new THREE.Vector3(0, 0, 1.5));
        expect(c.dot(new THREE.Vector3(normals.getX(i), normals.getY(i), normals.getZ(i)))).toBeGreaterThan(0);
      }
    }
  });

  it('the ghost reads light on a dark ground and dark on a light one', () => {
    const lum = (c: THREE.Color) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
    const onDark = (buildGhostGroup([ghost([0, 0, 0])], new THREE.Color('#0c1620')).children[0] as THREE.Mesh).material as THREE.MeshLambertMaterial;
    const onLight = (buildGhostGroup([ghost([0, 0, 0])], new THREE.Color('#f4f7fa')).children[0] as THREE.Mesh).material as THREE.MeshLambertMaterial;
    expect(lum(onDark.color)).toBeGreaterThan(0.5);
    expect(lum(onLight.color)).toBeLessThan(0.5);
  });
});
