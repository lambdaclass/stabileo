import { buildFootprintGrid, sideStations, type ColumnFootprint, type FootprintCells, type FootprintCorner } from './column-footprints';

function triangles(cells: number[][], c: number[], i: number, j: number): void {
  if ((i + j) % 2 === 0) cells.push([c[0]!, c[1]!, c[2]!], [c[0]!, c[2]!, c[3]!]);
  else cells.push([c[0]!, c[1]!, c[3]!], [c[1]!, c[2]!, c[3]!]);
}

export function physicalFootprintGrid(corners: readonly FootprintCorner[], cell: FootprintCells, columns: readonly ColumnFootprint[], forced: { xs: readonly number[]; ys: readonly number[] }) {
  return buildFootprintGrid(corners, columns, (a, b, faces, axis) =>
    axis === 'x' ? sideStations(a, b, cell.ax, [...faces, ...forced.xs]) : sideStations(a, b, cell.ay, [...faces, ...forced.ys]),
  cell.element === 'tri' ? triangles : undefined);
}
