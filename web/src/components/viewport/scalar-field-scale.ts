export function scalarFieldScale(height: number, distance: number, fovDegrees: number): string {
  const visible = 2 * distance * Math.tan(fovDegrees * Math.PI / 360);
  return `${(height / visible).toPrecision(3)} px/unit`;
}
