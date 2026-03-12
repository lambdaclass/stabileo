// Generate a downloadable DXF template for Mode 1: Plan -> 3D structural import
// Format: AutoCAD R12 (AC1009) — universally readable

// ─── Layer definitions ──────────────────────────────────────────

const LAYERS = {
  VIGAS:        { name: 'DED_P_VIGAS',        color: 4 },  // Cyan
  COLUMNAS:     { name: 'DED_P_COLUMNAS',     color: 6 },  // Magenta
  APOYOS_FIJOS: { name: 'DED_P_APOYOS_FIJOS', color: 1 },  // Red
  APOYOS_ART:   { name: 'DED_P_APOYOS_ART',   color: 1 },  // Red
  CARGA_DIST:   { name: 'DED_P_CARGA_DIST',   color: 3 },  // Green
  CARGA_NODAL:  { name: 'DED_P_CARGA_NODAL',  color: 3 },  // Green
  TEXTO:        { name: 'DED_P_TEXTO',         color: 7 },  // White
  AYUDA:        { name: 'DED_P_AYUDA',         color: 8 },  // Gray
} as const;

// ─── Low-level DXF helpers (R12 AC1009 compatible) ──────────────

function str(n: number): string {
  return n.toFixed(6);
}

function dxfHeader(): string[] {
  return ['0', 'SECTION', '2', 'HEADER', '9', '$ACADVER', '1', 'AC1009', '0', 'ENDSEC'];
}

function dxfLayerTable(layers: Array<{ name: string; color: number }>): string[] {
  const out: string[] = ['0', 'SECTION', '2', 'TABLES'];
  out.push('0', 'TABLE', '2', 'LAYER', '70', layers.length.toString());
  for (const l of layers) {
    out.push('0', 'LAYER', '2', l.name, '70', '0', '62', l.color.toString(), '6', 'CONTINUOUS');
  }
  out.push('0', 'ENDTAB', '0', 'ENDSEC');
  return out;
}

function dxfText(layer: string, x: number, y: number, height: number, text: string): string[] {
  return [
    '0', 'TEXT', '8', layer,
    '10', str(x), '20', str(y), '30', str(0),
    '40', str(height),
    '1', text,
  ];
}

function dxfPoint(layer: string, x: number, y: number): string[] {
  return ['0', 'POINT', '8', layer, '10', str(x), '20', str(y), '30', str(0)];
}

function dxfCircle(layer: string, cx: number, cy: number, radius: number): string[] {
  return [
    '0', 'CIRCLE', '8', layer,
    '10', str(cx), '20', str(cy), '30', str(0),
    '40', str(radius),
  ];
}

/** R12-compatible closed rectangle using POLYLINE + VERTEX + SEQEND */
function dxfRect(layer: string, x: number, y: number, w: number, h: number): string[] {
  const x2 = x + w;
  const y2 = y + h;
  const corners = [
    { x, y },
    { x: x2, y },
    { x: x2, y: y2 },
    { x, y: y2 },
  ];
  return dxfPolyline(layer, corners, true);
}

/** R12-compatible polyline using POLYLINE + VERTEX + SEQEND */
function dxfPolyline(layer: string, points: Array<{ x: number; y: number }>, closed = false): string[] {
  if (points.length < 2) return [];
  const out: string[] = [
    '0', 'POLYLINE',
    '8', layer,
    '66', '1',          // vertices-follow flag
    '70', closed ? '1' : '0',
  ];
  for (const p of points) {
    out.push(
      '0', 'VERTEX',
      '8', layer,
      '10', str(p.x), '20', str(p.y), '30', str(0),
    );
  }
  out.push('0', 'SEQEND', '8', layer);
  return out;
}

// ─── Template generation ────────────────────────────────────────

export function generatePlanTemplate(): string {
  const lines: string[] = [];

  // Header
  lines.push(...dxfHeader());

  // Layer table
  const allLayers = Object.values(LAYERS).map(l => ({ name: l.name, color: l.color }));
  lines.push(...dxfLayerTable(allLayers));

  // Entities section
  lines.push('0', 'SECTION', '2', 'ENTITIES');

  // ── Grid layout (meters) ──
  //
  //   C1 (0,4) ── V1 ── C2 (5,4) ── V2 ── C3 (10,4)
  //   |                  |                   |
  //   V5                 V6                  V7
  //   |                  |                   |
  //   C4 (0,0) ── V3 ── C5 (5,0) ── V4 ── C6 (10,0)

  const cols: Record<string, { x: number; y: number; w: number; h: number; label: string; circular: boolean; diameter?: number }> = {
    C1: { x: 0,  y: 4, w: 0.30, h: 0.30, label: 'C01 - 30x30', circular: false },
    C2: { x: 5,  y: 4, w: 0.30, h: 0.30, label: 'C02 - 30x30', circular: false },
    C3: { x: 10, y: 4, w: 0.30, h: 0.30, label: 'C03 - 30x30', circular: false },
    C4: { x: 0,  y: 0, w: 0.30, h: 0.40, label: 'C04 - 30x40', circular: false },
    C5: { x: 5,  y: 0, w: 0,    h: 0,    label: 'C05 - D40',    circular: true, diameter: 0.40 },
    C6: { x: 10, y: 0, w: 0.30, h: 0.40, label: 'C06 - 30x40', circular: false },
  };

  // Beams: each defined by start column, end column, width (bxh in m), label
  const beams = [
    // Horizontal beams (top row)
    { x1: 0, y1: 4, x2: 5,  y2: 4, bw: 0.20, bh: 0.40, label: 'V01 - 20x40' },
    { x1: 5, y1: 4, x2: 10, y2: 4, bw: 0.20, bh: 0.40, label: 'V02 - 20x40' },
    // Horizontal beams (bottom row)
    { x1: 0, y1: 0, x2: 5,  y2: 0, bw: 0.25, bh: 0.50, label: 'V03 - 25x50' },
    { x1: 5, y1: 0, x2: 10, y2: 0, bw: 0.25, bh: 0.50, label: 'V04 - 25x50' },
    // Vertical beams (left, center, right)
    { x1: 0,  y1: 0, x2: 0,  y2: 4, bw: 0.20, bh: 0.40, label: 'V05 - 20x40' },
    { x1: 5,  y1: 0, x2: 5,  y2: 4, bw: 0.20, bh: 0.40, label: 'V06 - 20x40' },
    { x1: 10, y1: 0, x2: 10, y2: 4, bw: 0.20, bh: 0.40, label: 'V07 - 20x40' },
  ];

  const LY_VIGAS = LAYERS.VIGAS.name;
  const LY_COLUMNAS = LAYERS.COLUMNAS.name;
  const LY_APOYOS = LAYERS.APOYOS_FIJOS.name;
  const LY_CARGA_DIST = LAYERS.CARGA_DIST.name;
  const LY_TEXTO = LAYERS.TEXTO.name;
  const LY_AYUDA = LAYERS.AYUDA.name;

  // ── Draw beams (closed rectangles on DED_P_VIGAS) ──

  for (const b of beams) {
    const dx = b.x2 - b.x1;
    const dy = b.y2 - b.y1;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 1e-6) continue;

    // Unit direction along beam
    const ux = dx / len;
    const uy = dy / len;
    // Perpendicular (to the left)
    const px = -uy;
    const py = ux;

    // Half-width offset perpendicular to beam axis
    const hw = b.bw / 2;

    // Four corners of the beam rectangle
    const corners = [
      { x: b.x1 + px * hw, y: b.y1 + py * hw },
      { x: b.x2 + px * hw, y: b.y2 + py * hw },
      { x: b.x2 - px * hw, y: b.y2 - py * hw },
      { x: b.x1 - px * hw, y: b.y1 - py * hw },
    ];
    lines.push(...dxfPolyline(LY_VIGAS, corners, true));

    // Text label near midpoint, offset to avoid overlapping the rectangle
    const mx = (b.x1 + b.x2) / 2;
    const my = (b.y1 + b.y2) / 2;
    const textOffset = hw + 0.15;
    lines.push(...dxfText(LY_TEXTO, mx + px * textOffset, my + py * textOffset, 0.12, b.label));
  }

  // ── Draw columns (rectangles or circles on DED_P_COLUMNAS) ──

  for (const [, col] of Object.entries(cols)) {
    if (col.circular) {
      const r = col.diameter! / 2;
      lines.push(...dxfCircle(LY_COLUMNAS, col.x, col.y, r));
    } else {
      // Draw rectangle centered on column position
      lines.push(...dxfRect(LY_COLUMNAS, col.x - col.w / 2, col.y - col.h / 2, col.w, col.h));
    }

    // Column label
    lines.push(...dxfText(LY_TEXTO, col.x + 0.25, col.y + 0.25, 0.12, col.label));
  }

  // ── Draw supports (POINT on DED_P_APOYOS_FIJOS at column centers) ──

  for (const [, col] of Object.entries(cols)) {
    lines.push(...dxfPoint(LY_APOYOS, col.x, col.y));
  }

  // ── Distributed load example on V1 ──
  // V1 runs from (0,4) to (5,4), width 0.20m
  // Draw a thin rectangle on top of the beam to represent the load
  {
    const loadThickness = 0.08; // thin visual indicator
    const beamHw = 0.20 / 2;   // half-width of V1
    const yBase = 4 + beamHw;  // top edge of beam
    lines.push(...dxfRect(LY_CARGA_DIST, 0, yBase, 5, loadThickness));
    // Load magnitude text
    lines.push(...dxfText(LY_CARGA_DIST, 2.0, yBase + loadThickness + 0.10, 0.12, '15'));
  }

  // ── Help text on DED_P_AYUDA ──

  const helpLines = [
    'TEMPLATE DEDALIANO - Planta Estructural',
    '',
    'Capas disponibles:',
    '  DED_P_VIGAS        - Vigas (rectangulos cerrados POLYLINE)',
    '  DED_P_COLUMNAS     - Columnas (rectangulos o circulos)',
    '  DED_P_APOYOS_FIJOS - Apoyos empotrados (POINT en centro de columna)',
    '  DED_P_APOYOS_ART   - Apoyos articulados (POINT en centro de columna)',
    '  DED_P_CARGA_DIST   - Cargas distribuidas (rectangulo + texto kN/m)',
    '  DED_P_CARGA_NODAL  - Cargas nodales',
    '  DED_P_TEXTO        - Anotaciones de seccion',
    '  DED_P_AYUDA        - Texto de ayuda (ignorado al importar)',
    '',
    'Las vigas se dibujan como rectangulos (POLYLINE cerrada)',
    'Las columnas rectangulares como rectangulos, circulares como CIRCLE',
    'Textos de seccion: \'V01 - 20x40\' (bxh en cm) o \'C01 - D40\' (diametro en cm)',
    'Cargas distribuidas: rectangulo fino sobre viga + texto con magnitud en kN/m',
  ];

  const helpX = -2;
  let helpY = -1.5;
  const helpLineSpacing = 0.30;
  const helpTextHeight = 0.15;

  for (const hl of helpLines) {
    if (hl === '') {
      helpY -= helpLineSpacing;
      continue;
    }
    lines.push(...dxfText(LY_AYUDA, helpX, helpY, helpTextHeight, hl));
    helpY -= helpLineSpacing;
  }

  // End entities + EOF
  lines.push('0', 'ENDSEC');
  lines.push('0', 'EOF');

  return lines.join('\n');
}

// ─── Download helper ────────────────────────────────────────────

export function downloadPlanTemplate(): void {
  const dxf = generatePlanTemplate();
  const blob = new Blob([dxf], { type: 'application/dxf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'dedaliano-planta-template.dxf';
  a.click();
  URL.revokeObjectURL(url);
}
