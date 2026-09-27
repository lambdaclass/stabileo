/**
 * Starting assemblies for the drawing: the sections people build from plates and profiles most
 * often, as parts to edit rather than as fixed templates. Every one is plain parts, so what the
 * user changes afterwards is exactly what they see.
 *
 * Dimensions are metres. The defaults are ordinary sizes, not values from any table.
 */
import type { DrawnPart, Pt, ProfileOutline } from './drawn';
import { attachOffset } from './drawn';

export type StarterId = 'weldedI' | 'box' | 'tee' | 'coverPlated' | 'cutTee' | 'doubleAngle' | 'doubleChannel' | 'lippedC' | 'filledTube';

export const STARTERS: readonly StarterId[] = ['weldedI', 'box', 'tee', 'coverPlated', 'cutTee', 'doubleAngle', 'doubleChannel', 'lippedC', 'filledTube'];

const plate = (id: number, b: number, h: number, at: Pt): DrawnPart => ({ id, shape: { kind: 'rect', b, h }, at, rotationDeg: 0 });

/** The parts of a starter. `profile` resolves a catalogue outline for the profile-based ones. */
export function starterParts(id: StarterId, profile: ProfileOutline, profileName = 'IPE 300'): DrawnPart[] {
  switch (id) {
    case 'weldedI': {
      const h = 0.5, b = 0.25, tw = 0.008, tf = 0.016;
      return [plate(1, b, tf, [0, h / 2 - tf / 2]), plate(2, tw, h - 2 * tf, [0, 0]), plate(3, b, tf, [0, -h / 2 + tf / 2])];
    }
    case 'box': {
      const h = 0.4, b = 0.3, tw = 0.01, tf = 0.012, gap = 0.2;
      return [
        plate(1, b, tf, [0, h / 2 - tf / 2]),
        plate(2, tw, h - 2 * tf, [-gap / 2, 0]),
        plate(3, tw, h - 2 * tf, [gap / 2, 0]),
        plate(4, b, tf, [0, -h / 2 + tf / 2]),
      ];
    }
    case 'tee': {
      const h = 0.3, b = 0.2, tw = 0.008, tf = 0.012;
      return [plate(1, b, tf, [0, h / 2 - tf / 2]), plate(2, tw, h - tf, [0, -tf / 2])];
    }
    case 'coverPlated': {
      const base: DrawnPart = { id: 1, shape: { kind: 'profile', name: profileName }, at: [0, 0], rotationDeg: 0 };
      const top = plate(2, 0.2, 0.012, [0, 0]), bottom = plate(3, 0.2, 0.012, [0, 0]);
      const atTop = attachOffset(top, base, 'top', 'centre', profile);
      const atBottom = attachOffset(bottom, base, 'bottom', 'centre', profile);
      return atTop && atBottom ? [base, { ...top, at: atTop }, { ...bottom, at: atBottom }] : [base];
    }
    case 'cutTee': {
      // The top half of an I, cut at mid-depth: the usual chord of a light truss.
      const outline = profile(profileName);
      if (!outline) return [];
      const zs = outline.flat(2).map((p) => p[1]);
      const at = (Math.max(...zs) - Math.min(...zs)) / 2;
      return [{ id: 1, shape: { kind: 'profile', name: profileName, cut: { keep: 'top', at } }, at: [0, 0], rotationDeg: 0 }];
    }
    case 'doubleChannel': {
      // Two channels back to back, their webs 10 mm apart for a gusset.
      const name = 'UPN 200', gap = 0.01;
      const outline = profile(name);
      if (!outline) return [];
      const ys = outline.flat(2).map((p) => p[0]);
      const w = Math.max(...ys) - Math.min(...ys);
      const right: DrawnPart = { id: 1, shape: { kind: 'profile', name }, at: [gap / 2 + w / 2, 0], rotationDeg: 0 };
      const left: DrawnPart = { id: 2, shape: { kind: 'profile', name }, at: [-gap / 2 - w / 2, 0], rotationDeg: 0, mirror: true };
      // The catalogue draws a channel with its web on the left; the right-hand one keeps it, so
      // its back faces the gap, and the left-hand one is mirrored.
      return [right, left];
    }
    case 'doubleAngle': {
      // Two 75 × 8 angles back to back with a 10 mm gusset gap, drawn on their centrelines.
      const t = 0.008, leg = 0.075, gap = 0.01;
      const L = (pid: number, mirror: boolean): DrawnPart => ({
        id: pid, rotationDeg: 0, mirror,
        shape: { kind: 'polyline', points: [[t / 2, leg - t / 2], [t / 2, t / 2], [leg - t / 2, t / 2]], t },
        at: [mirror ? -gap / 2 : gap / 2, 0],
      });
      return [L(1, false), L(2, true)];
    }
    case 'lippedC': {
      const h = 0.2, b = 0.075, c = 0.02, t = 0.002;
      const y = b - t / 2, z = h / 2 - t / 2;
      return [{
        id: 1, rotationDeg: 0, at: [0, 0],
        shape: { kind: 'polyline', points: [[y, z - c + t / 2], [y, z], [0, z], [0, -z], [y, -z], [y, -z + c - t / 2]], t },
      }];
    }
    case 'filledTube': {
      // The fill is its own part so it can be given the concrete; the tube keeps the reference.
      const d = 0.2191, t = 0.0063;
      return [
        { id: 1, shape: { kind: 'tube', d, t }, at: [0, 0], rotationDeg: 0 },
        { id: 2, shape: { kind: 'circle', d: d - 2 * t }, at: [0, 0], rotationDeg: 0 },
      ];
    }
  }
}
