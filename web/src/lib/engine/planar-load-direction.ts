export function planarLoadDirection(degrees: number): { sin: number; cos: number } {
  switch (degrees % 360) {
    case 0: return { sin: 0, cos: 1 };
    case 90:
    case -270: return { sin: 1, cos: 0 };
    case 180:
    case -180: return { sin: 0, cos: -1 };
    case 270:
    case -90: return { sin: -1, cos: 0 };
  }
  const radians = degrees * Math.PI / 180;
  return { sin: Math.sin(radians), cos: Math.cos(radians) };
}
