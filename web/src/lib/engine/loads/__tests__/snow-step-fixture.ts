import { auditRoof } from './snow-slope-audit-fixture';

export function stepRoof(lowerSlope = 20, upperSlope = 0, height = 0.45, angle = 0) {
  const model = auditRoof('gable', lowerSlope);
  for (const n of model.nodes.values()) {
    n.y /= 3;
    if ((n.z ?? 0) >= 3) n.z = 3 + ((n.z ?? 0) - 3) / 3;
  }
  if (upperSlope === 0) {
    const ring = [[-6, 0], [0, 0], [0, 2], [-6, 2]];
    for (const [k, [x, y]] of ring.entries()) model.nodes.set(100 + k, { id: 100 + k, x: x!, y: y!, z: 3 + height });
    for (let k = 0; k < 4; k++) model.elements.set(100 + k, { id: 100 + k, nodeI: 100 + k, nodeJ: 100 + (k + 1) % 4, sectionId: 1, materialId: 1 });
  } else {
    const upper = auditRoof('gable', upperSlope);
    for (const n of upper.nodes.values()) model.nodes.set(n.id + 100, {
      ...n, id: n.id + 100, x: n.x - 6, y: n.y / 3,
      z: (n.z ?? 0) >= 3 ? 3 + height + ((n.z ?? 0) - 3) / 3 : 0,
    });
    for (const e of upper.elements.values()) model.elements.set(e.id + 100, { ...e, id: e.id + 100, nodeI: e.nodeI + 100, nodeJ: e.nodeJ + 100 });
  }
  if (lowerSlope > 0) {
    for (const [id, y] of [[500, 0], [501, 1]]) model.nodes.set(id!, { id: id!, x: 0.1, y: y!, z: 3 + y! * Math.tan(lowerSlope * Math.PI / 180) });
    model.elements.set(500, { id: 500, nodeI: 500, nodeJ: 501, sectionId: 1, materialId: 1 });
  }
  for (const n of model.nodes.values()) {
    const x = n.x, y = n.y;
    n.x = x * Math.cos(angle) - y * Math.sin(angle);
    n.y = x * Math.sin(angle) + y * Math.cos(angle);
  }
  return model;
}

