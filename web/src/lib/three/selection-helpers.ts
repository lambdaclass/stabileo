// Color constants and helpers for 3D viewport selection/hover/highlight
import * as THREE from 'three';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { colourRampHex } from './colour-ramp';

/** Canonical axis palette — shared by the world-origin axes (grid.ts) and the
 *  per-member local-axis triads so the same axis never renders two colors.
 *  Z is deliberately NOT the frame color (0x4a9eff) so a local-z arrow stays
 *  visible against unselected members. */
export const AXIS_COLORS = { x: 0xff4444, y: 0x44ff44, z: 0x4488ff } as const;

/**
 * The 3D palette, matched to the 2D canvas and the landing.
 *
 * These were the old application colours — a navy background, bright blue
 * frames, orange trusses, cyan selection — so switching from 2D to 3D changed
 * products. Same rule as the 2D viewport now applies: geometry is quiet,
 * selection is the accent, and colour is spent on what carries meaning.
 *
 * Three.js wants numbers, and CSS custom properties are strings, so these are
 * literals rather than reads. They are the same values as the `--st-model-*`
 * tokens; if those move, move these with them.
 */
export const COLORS: Record<string, number> = {
  node:            0x8fa3b3,  /* --st-model-node */
  nodeSelected:    0xe5482a,  /* --st-selected */
  nodeHovered:     0xf4f7fa,  /* --st-text */
  frame:           0xc7d3dd,  /* --st-model-member */
  frameWire:       0xa8b8c6,  /* dimmer: a line reads heavier than a shaded solid */
  truss:           0x9fb2c2,  /* --st-model-truss */
  elementSelected: 0xe5482a,
  elementHovered:  0xf4f7fa,
  support:         0x8fa3b3,
  load:            0xe8705f,  /* --st-red-text */
  moment:          0xd9a441,  /* --st-amber-text */
  reaction:        0x2aa869,  /* --st-green-text */
  deformed:        0xe5482a,  /* the answer to the question, so it reads as the result */
  background:      0x0c1620,  /* --st-ink */
};

/** Give `obj` a private copy of a shared material before it gets recoloured.
 *
 *  Gizmo materials are shared across every instance of a support type, and the
 *  recolour path below mutates `material.color` in place — so without this,
 *  selecting one support repaints all of them. Copy-on-write keeps the sharing
 *  for everything that is never recoloured and pays a clone only for the object
 *  actually being highlighted. The clone is private, so `disposeObject` frees
 *  it normally. */
function privatiseMaterial(obj: THREE.Mesh | THREE.Line): void {
  // THREE.Material.clone() deep-copies userData, so the clone inherits
  // `shared: true` unless it is cleared. Leaving it set would defeat the whole
  // point twice over: disposeObject skips shared materials, so the private
  // clone would never be freed, and the next recolour would clone it again —
  // one leaked material per recolour, and syncSelection runs often.
  const privatise = (m: THREE.Material): THREE.Material => {
    const c = m.clone();
    delete c.userData.shared;
    return c;
  };

  const mat = obj.material;
  if (Array.isArray(mat)) {
    if (mat.some(m => m.userData?.shared)) {
      obj.material = mat.map(m => (m.userData?.shared ? privatise(m) : m));
    }
    return;
  }
  if (mat?.userData?.shared) obj.material = privatise(mat);
}

/** Set emissive+color on a single Mesh's material (MeshStandard or LineMaterial) */
export function setMeshColor(mesh: THREE.Mesh, color: number): void {
  privatiseMaterial(mesh);
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
    // Skip section profile edge outlines — they keep a constant dark color.
    if (child.userData?.sectionEdge) return;
    // Skip released-joint glyphs — they keep their distinct orange so the
    // release stays visible while the element is selected.
    if (child.userData?.jointGlyph) return;
    if (child instanceof THREE.Mesh) {
      setMeshColor(child, color); // privatises internally
    }
    if (child instanceof THREE.Line) {
      privatiseMaterial(child);
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

// ── Cached text sprites ──────────────────────────────────────
// Load-heavy scenes repeat the same few label texts hundreds of times
// ("5.0 kN/m²" on every quad). Creating a canvas + CanvasTexture per sprite is
// the CPU/GPU-memory cost that makes syncLoads rebuilds stutter, so textures
// are shared by (text, color, fontSize). Sprites made here carry
// userData.sharedTexture so disposeObject() leaves the shared map alive.
const TEXTURE_CACHE_MAX = 500;
const textTextureCache = new Map<string, THREE.CanvasTexture>();

function labelTexture(text: string, color: string, fontSize: number): THREE.CanvasTexture {
  const key = `${text}|${color}|${fontSize}`;
  const cached = textTextureCache.get(key);
  if (cached) {
    // Refresh recency (Map iteration is insertion-ordered for eviction).
    textTextureCache.delete(key);
    textTextureCache.set(key, cached);
    return cached;
  }
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
  textTextureCache.set(key, texture);
  if (textTextureCache.size > TEXTURE_CACHE_MAX) {
    const oldest = textTextureCache.keys().next().value!;
    textTextureCache.get(oldest)?.dispose();
    textTextureCache.delete(oldest);
  }
  return texture;
}

/** Like createTextSprite but with a shared cached texture (see above). */
export function createTextSpriteCached(
  text: string,
  color: string = '#ffffff',
  fontSize: number = 36,
): THREE.Sprite {
  const texture = labelTexture(text, color, fontSize);
  const mat = new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(0.6, 0.6, 1);
  sprite.userData.sharedTexture = true;
  return sprite;
}

/**
 * Heatmap color: norm ∈ [0,1] over the shared colour ramp (blue → red), and
 * magenta above 1 — the "past the top of the scale" every painter agrees on.
 * Used for stress ratio, moment magnitude, etc.
 */
export function heatmapColor(norm: number): number {
  return colourRampHex(norm);
}

/**
 * Verification status color: ok → green, warn → amber, fail → red.
 * Utilization convention is demand/capacity: <= 1.0 passes.
 */
export function verificationColor(ratio: number | null): number {
  if (ratio === null) return VERIFICATION_UNAVAILABLE_COLOR; // nothing verified → gray
  if (ratio <= 0.5) return 0x22cc66;     // green (safe)
  if (ratio <= 0.9) return 0x88cc22;     // yellow-green
  if (ratio <= 0.95) return 0xbfcc11;    // yellow (approaching)
  if (ratio <= 1.0) return 0xddaa00;     // amber (warn band 0.95–1.00)
  if (ratio <= 1.1) return 0xff6600;     // orange (marginal fail)
  return 0xee2222;                        // red (fail)
}

/** "Nothing was verified here" — never green, visually distinct from a pass. */
export const VERIFICATION_UNAVAILABLE_COLOR = 0x888888;

/**
 * Desaturate a status colour toward gray for the STALE state (approved decision:
 * desaturated status colours plus hatch/glyph). Keeps the ratio information
 * legible while making "not current" unmistakable, and never turns a failing
 * member green.
 */
export function desaturateTowardGray(hex: number, amount = 0.55): number {
  const r = (hex >> 16) & 0xff, g = (hex >> 8) & 0xff, b = hex & 0xff;
  const lum = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
  const mix = (c: number) => Math.round(c + (lum - c) * amount);
  return (mix(r) << 16) | (mix(g) << 8) | mix(b);
}

/** Three-state verification colour for the viewport overlay. */
export function verificationStateColor(
  ratio: number | null,
  state: 'current' | 'stale' | 'unavailable',
): number {
  if (state === 'unavailable') return VERIFICATION_UNAVAILABLE_COLOR;
  const base = verificationColor(ratio);
  return state === 'stale' ? desaturateTowardGray(base) : base;
}

/**
 * Axial force color: tension (positive) → red, compression (negative) → blue, ~zero → gray
 */
export function axialForceColor(nAvg: number): number {
  if (nAvg > 1e-6) return 0xe5482a;   // tension, --st-tension = red
  if (nAvg < -1e-6) return 0x2c6cb4;  // compression = blue, --st-compression
  return 0x888888;                      // ~zero = gray
}

/** Dispose of all geometries and materials in an Object3D tree */
/** Mark a geometry or material as shared between objects so `disposeObject`
 *  leaves it alone. Support gizmos reuse one geometry per shape across every
 *  instance — disposing it with the first deleted support would blank every
 *  other support in the model. Same reasoning as the cached label textures
 *  below. */
export function markShared<T extends { userData: Record<string, unknown> }>(resource: T): T {
  resource.userData.shared = true;
  return resource;
}

function isShared(r: { userData?: Record<string, unknown> } | null | undefined): boolean {
  return r?.userData?.shared === true;
}

function disposeIfPrivate(r: { userData?: Record<string, unknown>; dispose(): void } | null | undefined): void {
  if (r && !isShared(r)) r.dispose();
}

export function disposeObject(obj: THREE.Object3D): void {
  obj.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      disposeIfPrivate(child.geometry);
      if (child.material instanceof THREE.Material) {
        disposeIfPrivate(child.material);
      } else if (Array.isArray(child.material)) {
        child.material.forEach(m => disposeIfPrivate(m));
      }
    }
    if (child instanceof THREE.Line) {
      disposeIfPrivate(child.geometry);
      if (child.material instanceof THREE.Material) {
        disposeIfPrivate(child.material);
      }
    }
    if (child instanceof THREE.Sprite) {
      // Cached-label textures are shared across sprites — disposing one would
      // corrupt every other sprite using it. Only dispose private maps.
      if (!child.userData?.sharedTexture) {
        (child.material as THREE.SpriteMaterial).map?.dispose();
      }
      child.material.dispose();
    }
  });
}
