// Color constants and helpers for 3D viewport selection/hover/highlight
import * as THREE from 'three';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';

export const COLORS: Record<string, number> = {
  node:            0xdddddd,
  nodeSelected:    0x00ffff,
  nodeHovered:     0xffff44,
  frame:           0x6699bb,
  truss:           0x88aa66,
  elementSelected: 0x00ffff,
  elementHovered:  0xffff44,
  support:         0x778899,
  load:            0xff4444,
  moment:          0xff8844,
  reaction:        0x44ff88,
  deformed:        0xff8800,
  background:      0x1a1a2e,
};

/** Set emissive+color on a single Mesh's material (MeshStandard or LineMaterial) */
export function setMeshColor(mesh: THREE.Mesh, color: number): void {
  const mat = mesh.material;
  if (mat instanceof THREE.MeshStandardMaterial) {
    mat.color.setHex(color);
    mat.needsUpdate = true;
  } else if (mat instanceof LineMaterial) {
    mat.color.setHex(color);
    mat.needsUpdate = true;
  }
}

/** Set color on all Mesh children of a Group */
export function setGroupColor(group: THREE.Group, color: number): void {
  group.traverse((child) => {
    // Skip invisible picking helpers
    if (child.userData?.pickingHelper) return;
    if (child instanceof THREE.Mesh) {
      setMeshColor(child, color);
    }
    if (child instanceof THREE.Line) {
      const mat = child.material;
      if (mat instanceof THREE.LineBasicMaterial) {
        mat.color.setHex(color);
        mat.needsUpdate = true;
      }
    }
  });
}

/** Walk up the parent chain to find userData with a `type` field */
export function findUserData(obj: THREE.Object3D): { type: string; id: number } | null {
  let current: THREE.Object3D | null = obj;
  while (current) {
    if (current.userData && current.userData.type) {
      return current.userData as { type: string; id: number };
    }
    current = current.parent;
  }
  return null;
}

/** Create a canvas-based text sprite (for labels) */
export function createTextSprite(
  text: string,
  color: string = '#ffffff',
  fontSize: number = 36,
): THREE.Sprite {
  const canvas = document.createElement('canvas');
  const size = 128;
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = color;
  ctx.font = `bold ${fontSize}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, size / 2, size / 2);
  const texture = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(0.6, 0.6, 1);
  return sprite;
}

/**
 * Heatmap color: norm ∈ [0,1] → blue(0) → green(0.5) → red(1)
 * Used for stress ratio, moment magnitude, etc.
 */
export function heatmapColor(norm: number): number {
  const clamped = Math.max(0, Math.min(1, norm));
  const hue = (1 - clamped) * 0.667; // HSL: 0.667=blue → 0=red
  const c = new THREE.Color().setHSL(hue, 1.0, 0.5);
  return c.getHex();
}

/**
 * Verification status color: ok → green, warn → yellow, fail → red.
 * Ratio-based: uses continuous gradient from green(0) → yellow(0.8) → red(1.2+).
 */
export function verificationColor(ratio: number | null): number {
  if (ratio === null) return 0x888888; // no verification → gray
  if (ratio <= 0.5) return 0x22cc66;     // green (safe)
  if (ratio <= 0.9) return 0x88cc22;     // yellow-green
  if (ratio <= 1.0) return 0xddaa00;     // amber (near limit)
  if (ratio <= 1.1) return 0xff6600;     // orange (marginal fail)
  return 0xee2222;                        // red (fail)
}

/**
 * Axial force color: tension (positive) → red, compression (negative) → blue, ~zero → gray
 */
export function axialForceColor(nAvg: number): number {
  if (nAvg > 1e-6) return 0xff4444;   // tension = red
  if (nAvg < -1e-6) return 0x4488ff;  // compression = blue
  return 0x888888;                      // ~zero = gray
}

/** Dispose of all geometries and materials in an Object3D tree */
export function disposeObject(obj: THREE.Object3D): void {
  obj.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.geometry?.dispose();
      if (child.material instanceof THREE.Material) {
        child.material.dispose();
      } else if (Array.isArray(child.material)) {
        child.material.forEach(m => m.dispose());
      }
    }
    if (child instanceof THREE.Line) {
      child.geometry?.dispose();
      if (child.material instanceof THREE.Material) {
        child.material.dispose();
      }
    }
    if (child instanceof THREE.Sprite) {
      (child.material as THREE.SpriteMaterial).map?.dispose();
      child.material.dispose();
    }
  });
}
