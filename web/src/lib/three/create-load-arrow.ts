// Create Three.js arrow helpers for structural loads
import * as THREE from 'three';
import { COLORS, createTextSprite } from './selection-helpers';

const ARROW_SCALE_MIN = 0.5;
const ARROW_SCALE_MAX = 2.5;
const ARROW_HEAD_LENGTH = 0.12;
const ARROW_HEAD_WIDTH = 0.05;

/** Clamp arrow length proportional to magnitude */
function arrowLength(magnitude: number, maxMag: number): number {
  if (maxMag < 1e-10) return 1.0;
  const t = Math.min(Math.abs(magnitude) / maxMag, 1);
  return ARROW_SCALE_MIN + t * (ARROW_SCALE_MAX - ARROW_SCALE_MIN);
}

/**
 * Create a double-headed arrow to represent a moment load.
 * Engineering convention: a straight arrow with TWO arrowheads at the SAME end,
 * both pointing in the same direction (like a double chevron >>---).
 * Direction follows the right-hand rule: thumb along the arrow = positive rotation.
 */
function createDoubleMomentArrow(
  origin: THREE.Vector3,
  axis: THREE.Vector3,
  val: number,
  color: number,
): THREE.Group {
  const momentGrp = new THREE.Group();
  const shaftLen = 0.7; // longer than force arrows (min 0.5) to distinguish moments

  // Direction: positive moment → right-hand rule → thumb along +axis
  const dir = axis.clone();
  if (val < 0) dir.negate();

  // Shaft: from tail to tip, centered on origin
  const tail = origin.clone().sub(dir.clone().multiplyScalar(shaftLen / 2));
  const tip = origin.clone().add(dir.clone().multiplyScalar(shaftLen / 2));

  const shaftGeo = new THREE.BufferGeometry().setFromPoints([tail, tip]);
  const shaftMat = new THREE.LineBasicMaterial({ color });
  momentGrp.add(new THREE.Line(shaftGeo, shaftMat));

  // Arrowhead 1: at the tip (outermost)
  const head1 = new THREE.ArrowHelper(
    dir,
    tip.clone().sub(dir.clone().multiplyScalar(ARROW_HEAD_LENGTH)),
    ARROW_HEAD_LENGTH, color, ARROW_HEAD_LENGTH, ARROW_HEAD_WIDTH,
  );
  momentGrp.add(head1);

  // Arrowhead 2: just behind head 1, same direction (double chevron >>)
  const head2 = new THREE.ArrowHelper(
    dir,
    tip.clone().sub(dir.clone().multiplyScalar(ARROW_HEAD_LENGTH * 2)),
    ARROW_HEAD_LENGTH, color, ARROW_HEAD_LENGTH, ARROW_HEAD_WIDTH,
  );
  momentGrp.add(head2);

  return momentGrp;
}

/**
 * Create arrows for a nodal load (forces + moments).
 * Forces: straight arrows pointing toward the node.
 * Moments: double-headed arrows (default) or curved torus rings.
 */
export function createNodalLoadArrow(
  pos: { x: number; y: number; z: number },
  fx: number, fy: number, fz: number,
  mx: number, my: number, mz: number,
  maxForce: number,
  loadIndex: number,
  momentStyle: 'double-arrow' | 'curved' = 'double-arrow',
): THREE.Group {
  const group = new THREE.Group();
  group.userData = { type: 'load', id: loadIndex };

  const origin = new THREE.Vector3(pos.x, pos.y, pos.z);

  // Force arrows
  const forces = [
    { val: fx, dir: new THREE.Vector3(1, 0, 0), label: 'Fx' },
    { val: fy, dir: new THREE.Vector3(0, 1, 0), label: 'Fy' },
    { val: fz, dir: new THREE.Vector3(0, 0, 1), label: 'Fz' },
  ];

  for (const f of forces) {
    if (Math.abs(f.val) < 1e-10) continue;
    const dir = f.dir.clone();
    if (f.val < 0) dir.negate();       // dir = direction force is applied
    const len = arrowLength(f.val, maxForce);

    // Arrow starts opposite to force dir and points TOWARD the node (tip = node)
    const farEnd = origin.clone().sub(dir.clone().multiplyScalar(len));
    const arrow = new THREE.ArrowHelper(
      dir, farEnd, len,
      COLORS.load, ARROW_HEAD_LENGTH, ARROW_HEAD_WIDTH,
    );
    group.add(arrow);

    // Label at the far end of the arrow (away from node)
    const label = createTextSprite(`${f.val.toFixed(1)} kN`, '#ff6666', 28);
    label.position.copy(farEnd).sub(dir.clone().multiplyScalar(0.15));
    group.add(label);
  }

  // Moment indicators
  const moments = [
    { val: mx, axis: new THREE.Vector3(1, 0, 0), label: 'Mx' },
    { val: my, axis: new THREE.Vector3(0, 1, 0), label: 'My' },
    { val: mz, axis: new THREE.Vector3(0, 0, 1), label: 'Mz' },
  ];

  for (const m of moments) {
    if (Math.abs(m.val) < 1e-10) continue;

    if (momentStyle === 'double-arrow') {
      // Double-headed arrow along moment axis (engineering convention)
      const dblArrow = createDoubleMomentArrow(origin, m.axis, m.val, COLORS.moment);
      group.add(dblArrow);
    } else {
      // Curved torus ring (270° arc) with arrowhead cone at tip
      const arcRadius = 0.2;
      const tubeRadius = 0.007; // thin tube matching force arrow line weight
      const arcAngle = Math.PI * 1.5; // 270°

      const ring = new THREE.TorusGeometry(arcRadius, tubeRadius, 8, 24, arcAngle);
      const mat = new THREE.MeshBasicMaterial({ color: COLORS.moment });
      const mesh = new THREE.Mesh(ring, mat);
      mesh.position.copy(origin);
      // Orient the torus so its normal aligns with the moment axis
      const quat = new THREE.Quaternion();
      quat.setFromUnitVectors(new THREE.Vector3(0, 0, 1), m.axis);
      mesh.quaternion.copy(quat);
      group.add(mesh);

      // Arrowhead cone at the tip of the arc
      // The torus arc goes from angle 0 to arcAngle in the XY plane (before rotation).
      // Tip is at angle = arcAngle on the torus circle.
      // Positive moment → CCW arrow (right-hand rule), negative → CW
      const ccw = m.val > 0;
      const tipAngle = ccw ? arcAngle : 0;
      // Position on torus ring (in local XY plane before quaternion rotation)
      const tipLocal = new THREE.Vector3(
        Math.cos(tipAngle) * arcRadius,
        Math.sin(tipAngle) * arcRadius,
        0,
      );
      // Tangent direction (perpendicular to radius, in arc direction)
      const tangentLocal = new THREE.Vector3(
        -Math.sin(tipAngle),
        Math.cos(tipAngle),
        0,
      );
      if (!ccw) tangentLocal.negate(); // flip for CW

      // Transform to world via quaternion
      const tipWorld = tipLocal.clone().applyQuaternion(quat).add(origin);
      const tangentWorld = tangentLocal.clone().applyQuaternion(quat).normalize();

      const coneHeight = 0.05;
      const coneRadius = 0.02;
      const coneGeo = new THREE.ConeGeometry(coneRadius, coneHeight, 8);
      const coneMesh = new THREE.Mesh(coneGeo, mat);
      coneMesh.position.copy(tipWorld);
      // Orient cone: default cone points along +Y, we want it along tangent
      const coneQuat = new THREE.Quaternion();
      coneQuat.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tangentWorld);
      coneMesh.quaternion.copy(coneQuat);
      group.add(coneMesh);
    }

    const label = createTextSprite(`${m.val.toFixed(1)} kN·m`, '#ffaa44', 24);
    label.position.copy(origin).add(m.axis.clone().multiplyScalar(0.35));
    group.add(label);
  }

  return group;
}

/**
 * Create a group of arrows for a distributed load along an element.
 *
 * For 3D loads, pass `localAxisDir` — the actual local ey or ez vector in global
 * coordinates — so arrows point in the correct direction (e.g. downward for gravity
 * loads on horizontal beams). For 2D loads, omit it to default to global Y.
 */
export function createDistributedLoadGroup(
  nI: { x: number; y: number; z: number },
  nJ: { x: number; y: number; z: number },
  qI: number, qJ: number,
  maxQ: number,
  loadIndex: number,
  axis: 'Y' | 'Z' = 'Y',
  localAxisDir?: { x: number; y: number; z: number },
): THREE.Group {
  const group = new THREE.Group();
  group.userData = { type: 'load', id: loadIndex };

  const pI = new THREE.Vector3(nI.x, nI.y, nI.z);
  const pJ = new THREE.Vector3(nJ.x, nJ.y, nJ.z);
  const elementDir = pJ.clone().sub(pI);
  const length = elementDir.length();
  if (length < 1e-10) return group;

  // Load direction: use actual local axis vector if provided, otherwise fall back to global
  const avgQ = (qI + qJ) / 2;
  const sign = avgQ < 0 ? -1 : 1;
  let loadDir: THREE.Vector3;
  if (localAxisDir) {
    // Local axis vector in global coordinates — sign of qI/qJ already encodes direction
    loadDir = new THREE.Vector3(localAxisDir.x, localAxisDir.y, localAxisDir.z)
      .normalize().multiplyScalar(sign);
  } else {
    // 2D fallback: global Y (vertical)
    loadDir = axis === 'Z'
      ? new THREE.Vector3(0, 0, sign)
      : new THREE.Vector3(0, sign, 0);
  }

  // Color: red for Y loads, orange for Z loads
  const arrowColor = axis === 'Z' ? 0xff8844 : COLORS.load;
  const labelColor = axis === 'Z' ? '#ff8844' : '#ff6666';

  const numArrows = 7;
  for (let i = 0; i <= numArrows; i++) {
    const t = i / numArrows;
    const pos = pI.clone().lerp(pJ, t);
    const q = qI + (qJ - qI) * t;
    if (Math.abs(q) < 1e-10) continue;

    const len = arrowLength(q, maxQ) * 0.6; // slightly shorter than nodal

    // Arrow starts opposite to load dir and points TOWARD the element (tip = element)
    const farEnd = pos.clone().sub(loadDir.clone().multiplyScalar(len));
    const arrow = new THREE.ArrowHelper(
      loadDir, farEnd, len,
      arrowColor, ARROW_HEAD_LENGTH * 0.8, ARROW_HEAD_WIDTH * 0.8,
    );
    group.add(arrow);
  }

  // Value labels at ends (at arrow tails, away from element)
  if (Math.abs(qI) > 1e-10) {
    const labelI = createTextSprite(`${qI.toFixed(1)} kN/m`, labelColor, 24);
    labelI.position.copy(pI).sub(loadDir.clone().multiplyScalar(arrowLength(qI, maxQ) * 0.6 + 0.2));
    group.add(labelI);
  }
  if (Math.abs(qJ) > 1e-10 && Math.abs(qJ - qI) > 0.01) {
    const labelJ = createTextSprite(`${qJ.toFixed(1)} kN/m`, labelColor, 24);
    labelJ.position.copy(pJ).sub(loadDir.clone().multiplyScalar(arrowLength(qJ, maxQ) * 0.6 + 0.2));
    group.add(labelJ);
  }

  // Connecting line between arrow tails (envelope outline)
  const envelopePoints: THREE.Vector3[] = [];
  for (let i = 0; i <= numArrows; i++) {
    const t = i / numArrows;
    const pos = pI.clone().lerp(pJ, t);
    const q = qI + (qJ - qI) * t;
    const len = Math.abs(q) > 1e-10 ? arrowLength(q, maxQ) * 0.6 : 0;
    envelopePoints.push(pos.clone().sub(loadDir.clone().multiplyScalar(len)));
  }
  const envGeo = new THREE.BufferGeometry().setFromPoints(envelopePoints);
  const envMat = new THREE.LineBasicMaterial({ color: arrowColor, transparent: true, opacity: 0.5 });
  group.add(new THREE.Line(envGeo, envMat));

  return group;
}

/**
 * Create an arrow for a reaction at a support.
 */
export function createReactionArrow(
  pos: { x: number; y: number; z: number },
  fx: number, fy: number, fz: number,
  mx: number, my: number, mz: number,
  maxReaction: number,
): THREE.Group {
  const group = new THREE.Group();
  const origin = new THREE.Vector3(pos.x, pos.y, pos.z);

  const forces = [
    { val: fx, dir: new THREE.Vector3(1, 0, 0) },
    { val: fy, dir: new THREE.Vector3(0, 1, 0) },
    { val: fz, dir: new THREE.Vector3(0, 0, 1) },
  ];

  for (const f of forces) {
    if (Math.abs(f.val) < 1e-10) continue;
    const dir = f.dir.clone();
    if (f.val < 0) dir.negate();
    const len = arrowLength(f.val, maxReaction) * 0.8;

    // Arrow starts away from node and points TOWARD the node (tip = node)
    // Same convention as loads and 2D reactions
    const farEnd = origin.clone().sub(dir.clone().multiplyScalar(len));
    const arrow = new THREE.ArrowHelper(
      dir, farEnd, len,
      COLORS.reaction, ARROW_HEAD_LENGTH, ARROW_HEAD_WIDTH,
    );
    group.add(arrow);

    // Label at the far end of the arrow (away from node)
    const label = createTextSprite(`${f.val.toFixed(2)} kN`, '#44ff88', 24);
    label.position.copy(farEnd).sub(dir.clone().multiplyScalar(0.2));
    group.add(label);
  }

  // Moment reactions (simplified labels)
  const moments = [
    { val: mx, axis: new THREE.Vector3(1, 0, 0), name: 'Mx' },
    { val: my, axis: new THREE.Vector3(0, 1, 0), name: 'My' },
    { val: mz, axis: new THREE.Vector3(0, 0, 1), name: 'Mz' },
  ];

  for (const m of moments) {
    if (Math.abs(m.val) < 1e-10) continue;
    const label = createTextSprite(`${m.name}=${m.val.toFixed(2)} kN·m`, '#ffaa44', 22);
    label.position.copy(origin).add(m.axis.clone().multiplyScalar(0.5));
    group.add(label);
  }

  return group;
}

const CONSTRAINT_COLOR = 0xf0a500;

const DOF_DIR: Record<string, THREE.Vector3> = {
  ux: new THREE.Vector3(1, 0, 0),
  uy: new THREE.Vector3(0, 1, 0),
  uz: new THREE.Vector3(0, 0, 1),
  rx: new THREE.Vector3(1, 0, 0),
  ry: new THREE.Vector3(0, 1, 0),
  rz: new THREE.Vector3(0, 0, 1),
};

/**
 * Create an arrow for a constraint force at a node.
 * Similar to reaction arrows but with a distinct orange color.
 */
export function createConstraintForceArrow(
  pos: { x: number; y: number; z: number },
  dof: string,
  force: number,
  maxForce: number,
): THREE.Group {
  const group = new THREE.Group();
  const origin = new THREE.Vector3(pos.x, pos.y, pos.z);
  const baseDir = DOF_DIR[dof];
  if (!baseDir || Math.abs(force) < 1e-10) return group;

  const isRotational = dof.startsWith('r');

  if (isRotational) {
    // Moment-type constraint force — show as label only (like reaction moments)
    const axisName = dof.toUpperCase().replace('R', 'M'); // rx -> MX
    const label = createTextSprite(`${axisName}=${force.toFixed(2)} kN·m`, '#f0a500', 22);
    label.position.copy(origin).add(baseDir.clone().multiplyScalar(0.5));
    group.add(label);
  } else {
    // Translational constraint force — show as arrow
    const dir = baseDir.clone();
    if (force < 0) dir.negate();
    const len = arrowLength(force, maxForce) * 0.8;

    // Arrow starts away from node and points TOWARD the node (tip = node)
    const farEnd = origin.clone().sub(dir.clone().multiplyScalar(len));
    const arrow = new THREE.ArrowHelper(
      dir, farEnd, len,
      CONSTRAINT_COLOR, ARROW_HEAD_LENGTH, ARROW_HEAD_WIDTH,
    );
    group.add(arrow);

    // Label at the far end of the arrow
    const unit = 'kN';
    const label = createTextSprite(`${force.toFixed(2)} ${unit}`, '#f0a500', 24);
    label.position.copy(farEnd).sub(dir.clone().multiplyScalar(0.2));
    group.add(label);
  }

  return group;
}
