import { auditRoof } from './snow-slope-audit-fixture';

export function stepRoof(lowerSlope = 20, upperSlope = 0, height = 0.45, angle = 0) {
  const model = auditRoof('gable', lowerSlope);
  for (const n of model.nodes.values()) {
    n.y /= 3;
    if ((n.z ?? 0) >= 3) n.z = 3 + ((n.z ?? 0) - 3) / 3;
  }
  const upper = auditRoof('gable', upperSlope);
  for (const n of upper.nodes.values()) model.nodes.set(n.id + 100, {
    ...n, id: n.id + 100, x: n.x - 6, y: n.y / 3,
    z: (n.z ?? 0) >= 3 ? 3 + height + ((n.z ?? 0) - 3) / 3 : 0,
  });
  for (const e of upper.elements.values()) model.elements.set(e.id + 100, { ...e, id: e.id + 100, nodeI: e.nodeI + 100, nodeJ: e.nodeJ + 100 });
  for (const n of model.nodes.values()) {
    const x = n.x, y = n.y;
    n.x = x * Math.cos(angle) - y * Math.sin(angle);
    n.y = x * Math.sin(angle) + y * Math.cos(angle);
  }
  return model;
}

