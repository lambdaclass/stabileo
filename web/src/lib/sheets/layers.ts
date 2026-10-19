/**
 * The layers of every sheet, declared once: name, colour (ACI, the DXF colour index), lineweight (mm) and line
 * type. The drawings already draw on the RC-* layers (`drawings.ts`, `structure-drawings.ts`);
 * the paper adds its frame and title block. The DXF writes this table, and the SVG and the PDF take
 * colour and weight from it, so the three agree.
 */
export interface LayerDef { name: string; color: number; weight: number; dashed?: boolean }

export const LAYERS: readonly LayerDef[] = [
  { name: 'SHEET-FRAME', color: 7, weight: 0.5 },
  { name: 'SHEET-TITLE', color: 7, weight: 0.25 },
  { name: 'RC-OUTLINE', color: 7, weight: 0.35 },
  { name: 'RC-BAR', color: 1, weight: 0.35 },
  { name: 'RC-STIRRUP', color: 1, weight: 0.25 },
  { name: 'RC-DIM', color: 3, weight: 0.18 },
  { name: 'RC-TEXT', color: 7, weight: 0.18 },
  { name: 'RC-MARK', color: 2, weight: 0.18 },
  { name: 'RC-CONFLICT', color: 6, weight: 0.35 },
  { name: 'RC-TITLE', color: 7, weight: 0.25 },
  { name: 'RC-PUNCHING', color: 4, weight: 0.25 },
  { name: 'RC-OPENING', color: 8, weight: 0.25, dashed: true },
  { name: 'RC-COVER', color: 8, weight: 0.13, dashed: true },
  { name: 'RC-CUT-BAR', color: 1, weight: 0.35 },
  { name: 'RC-PROJECTED', color: 8, weight: 0.18, dashed: true },
  { name: 'RC-GRID', color: 8, weight: 0.13, dashed: true },
  { name: 'ST-MEMBER', color: 5, weight: 0.35 },
  { name: 'ST-PLATE', color: 5, weight: 0.25 },
  { name: 'ST-BOLT', color: 7, weight: 0.18 },
  { name: 'ST-ANCHOR', color: 1, weight: 0.25 },
  { name: 'ST-TEXT', color: 7, weight: 0.18 },
  // Construction plans: formwork outlines, members hidden under the slab, designations and levels.
  { name: 'FW-OUTLINE', color: 7, weight: 0.35 },
  { name: 'FW-HIDDEN', color: 8, weight: 0.18, dashed: true },
  { name: 'FW-TAG', color: 2, weight: 0.18 },
  { name: 'FW-LEVEL', color: 3, weight: 0.18 },
  { name: 'FW-AXIS', color: 1, weight: 0.13, dashed: true },
  // Post-tensioning: the tendons and the chairs that hold them at height.
  { name: 'PT-TENDON', color: 6, weight: 0.35 },
  { name: 'PT-CHAIR', color: 6, weight: 0.13 },
  // Tables and notes drawn on the sheet.
  { name: 'TB-LINE', color: 7, weight: 0.18 },
  { name: 'TB-TEXT', color: 7, weight: 0.18 },
  { name: 'NOTE-TEXT', color: 7, weight: 0.18 },
];

const BY = new Map(LAYERS.map((l) => [l.name, l]));
export const layerDef = (name: string): LayerDef => BY.get(name) ?? { name, color: 7, weight: 0.25 };

/** DXF colour index (ACI) to RGB, for the indices the table uses. */
export function aciRgb(i: number): [number, number, number] {
  switch (i) {
    case 1: return [204, 0, 0]; case 2: return [170, 150, 0]; case 3: return [0, 140, 0]; case 4: return [0, 150, 150];
    case 5: return [0, 60, 200]; case 6: return [190, 0, 190]; case 8: return [128, 128, 128]; default: return [0, 0, 0];
  }
}
