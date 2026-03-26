/**
 * Camera / view utility functions extracted from Viewport3D.svelte.
 *
 * Every function is pure (no component-level state) — the caller passes in
 * the mutable objects (camera, controls, orthoCamera, etc.) and the function
 * operates on them directly.
 */

import * as THREE from 'three';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { setLineResolution } from '../three/create-element-mesh';
import { projectNodeToScene, setCameraUp, shouldProjectModelToXZ, TOP_VIEW_UP_VECTOR } from '../geometry/coordinate-system';
import { uiStore } from '../store';

// ─── Types ──────────────────────────────────────────────────

/** Minimal node data needed for bounding-box calculation. */
export interface NodePosition {
  x: number;
  y: number;
  z?: number;
}

// ─── getModelBounds ─────────────────────────────────────────

export function getModelBounds(
  nodes: Map<number, NodePosition>,
): { center: THREE.Vector3; size: THREE.Vector3; maxDim: number } {
  const project2D = shouldProjectModelToXZ({ analysisMode: uiStore.analysisMode, nodes: nodes.values() });
  const box = new THREE.Box3();
  for (const [, node] of nodes) {
    const pos = projectNodeToScene(node, project2D);
    box.expandByPoint(new THREE.Vector3(pos.x, pos.y, pos.z));
  }
  if (box.isEmpty()) {
    box.expandByPoint(new THREE.Vector3(-5, 0, -5));
    box.expandByPoint(new THREE.Vector3(5, 5, 5));
  }
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z, 2);
  return { center, size, maxDim };
}

// ─── syncOrthoFrustum ───────────────────────────────────────

export function syncOrthoFrustum(
  orthoCamera: THREE.OrthographicCamera,
  cameraPosition: THREE.Vector3,
  controlsTarget: THREE.Vector3,
  containerAspect: number,
  aspect?: number,
): void {
  const ar = aspect ?? containerAspect;
  const dist = cameraPosition.distanceTo(controlsTarget);
  // Use half of the distance as frustum size, clamped
  const frustumHalf = Math.max(1, dist * 0.5);
  orthoCamera.left = -frustumHalf * ar;
  orthoCamera.right = frustumHalf * ar;
  orthoCamera.top = frustumHalf;
  orthoCamera.bottom = -frustumHalf;
  orthoCamera.updateProjectionMatrix();
}

// ─── zoomToFit ──────────────────────────────────────────────

export function zoomToFit(
  camera: THREE.Camera,
  controls: OrbitControls,
  nodes: Map<number, NodePosition>,
  orthoCamera: THREE.OrthographicCamera,
  container?: HTMLElement | null,
): void {
  if (!camera || !controls) return;
  const { center, maxDim } = getModelBounds(nodes);
  const dist = maxDim * 1.5;
  const project2D = shouldProjectModelToXZ({ analysisMode: uiStore.analysisMode, nodes: nodes.values() });
  if (project2D) {
    // Angled view for flat 2D models in 3D: camera on -Y side looking toward +Y.
    // Screen right = +X, screen up = +Z, Y goes away from viewer.
    camera.position.set(center.x + dist * 0.1, center.y - dist, center.z + dist * 0.25);
  } else {
    camera.position.set(center.x + dist, center.y + dist, center.z + dist * 0.6);
  }
  setCameraUp(camera);
  controls.target.copy(center);
  controls.update();
  // Adjust clip planes so large models (bridges, stadiums) aren't clipped
  if ((camera as THREE.PerspectiveCamera).isPerspectiveCamera) {
    const persp = camera as THREE.PerspectiveCamera;
    persp.near = Math.max(0.1, dist * 0.001);
    persp.far = Math.max(1000, dist * 10);
    persp.updateProjectionMatrix();
  }
  if (camera === orthoCamera) {
    const containerAspect = container ? container.clientWidth / container.clientHeight : 1;
    syncOrthoFrustum(orthoCamera, camera.position, controls.target, containerAspect);
  }
}

// ─── setView ────────────────────────────────────────────────

export function setView(
  view: 'top' | 'front' | 'side' | 'iso',
  camera: THREE.Camera,
  controls: OrbitControls,
  nodes: Map<number, NodePosition>,
): void {
  if (!camera || !controls) return;
  const { center, maxDim } = getModelBounds(nodes);
  const dist = maxDim * 1.8;

  switch (view) {
    case 'top':
      camera.position.set(center.x, center.y, center.z + dist);
      camera.up.copy(TOP_VIEW_UP_VECTOR);
      break;
    case 'front':
      camera.position.set(center.x, center.y - dist, center.z);
      setCameraUp(camera);
      break;
    case 'side':
      camera.position.set(center.x + dist, center.y, center.z);
      setCameraUp(camera);
      break;
    case 'iso':
      camera.position.set(center.x + dist * 0.7, center.y + dist * 0.7, center.z + dist * 0.5);
      setCameraUp(camera);
      break;
  }
  controls.target.copy(center);
  controls.update();
}

// ─── handleResize ───────────────────────────────────────────

export function handleResize(
  container: HTMLElement,
  renderer: THREE.WebGLRenderer,
  perspCamera: THREE.PerspectiveCamera,
  orthoCamera: THREE.OrthographicCamera,
  camera: THREE.Camera,
  controls: OrbitControls,
): void {
  const w = container.clientWidth;
  const h = container.clientHeight;
  if (w === 0 || h === 0) return;
  renderer.setSize(w, h);
  const aspect = w / h;
  perspCamera.aspect = aspect;
  perspCamera.updateProjectionMatrix();
  // Sync ortho frustum from distance to target
  syncOrthoFrustum(orthoCamera, camera.position, controls.target, aspect, aspect);
  // Update fat-line resolution (shared by axes + element wireframes)
  setLineResolution(w, h);
}
