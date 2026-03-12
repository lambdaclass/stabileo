/**
 * Excel Export Module
 * Generates a professional structural analysis report in Excel format
 * Supports both 2D and 3D analysis modes
 *
 * Sheets:
 * 1. Resumen - Project summary with key results
 * 2. Elementos - All elements with properties and internal forces
 * 3. Nodos - Node coordinates and displacements
 * 4. Reacciones - Support reactions
 * 5. Materiales - Material properties
 * 6. Secciones - Section properties
 */

import * as XLSX from 'xlsx';
import { modelStore, resultsStore, uiStore } from '../store';
import { t } from '../i18n';

interface ExcelExportOptions {
  filename?: string;
  includeResults?: boolean;
}

// Column width helpers
const COL_WIDTHS = {
  id: 6,
  name: 18,
  type: 10,
  value: 12,
  unit: 8,
};

function createSummarySheet(): XLSX.WorkSheet {
  const is3D = uiStore.analysisMode === '3d';
  const r3d = resultsStore.results3D;
  const r2d = resultsStore.results;
  const data: (string | number)[][] = [];

  data.push([`${t('excel.structuralAnalysis')} ${is3D ? '3D' : '2D'} - ${t('excel.summary')}`]);
  data.push([]);

  data.push([t('excel.model')]);
  data.push([t('excel.nodes'), modelStore.nodes.size]);
  data.push([t('excel.elements'), modelStore.elements.size]);
  data.push([t('excel.supports'), modelStore.supports.size]);
  data.push([t('excel.loads'), modelStore.loads.length]);
  data.push([]);

  if (is3D && r3d) {
    data.push([t('excel.maxResults')]);
    let maxDisp = 0, maxN = 0, maxVy = 0, maxVz = 0, maxMy = 0, maxMz = 0, maxMx = 0;
    for (const d of r3d.displacements) {
      const mag = Math.sqrt(d.ux ** 2 + d.uy ** 2 + d.uz ** 2);
      maxDisp = Math.max(maxDisp, mag);
    }
    for (const ef of r3d.elementForces) {
      maxN = Math.max(maxN, Math.abs(ef.nStart), Math.abs(ef.nEnd));
      maxVy = Math.max(maxVy, Math.abs(ef.vyStart), Math.abs(ef.vyEnd));
      maxVz = Math.max(maxVz, Math.abs(ef.vzStart), Math.abs(ef.vzEnd));
      maxMx = Math.max(maxMx, Math.abs(ef.mxStart), Math.abs(ef.mxEnd));
      maxMy = Math.max(maxMy, Math.abs(ef.myStart), Math.abs(ef.myEnd));
      maxMz = Math.max(maxMz, Math.abs(ef.mzStart), Math.abs(ef.mzEnd));
    }
    data.push([t('excel.maxDisplacement'), (maxDisp * 1000).toFixed(4), 'mm']);
    data.push([t('excel.maxN'), maxN.toFixed(2), 'kN']);
    data.push([t('excel.maxVy'), maxVy.toFixed(2), 'kN']);
    data.push([t('excel.maxVz'), maxVz.toFixed(2), 'kN']);
    data.push([t('excel.maxMx'), maxMx.toFixed(2), 'kN·m']);
    data.push([t('excel.maxMy'), maxMy.toFixed(2), 'kN·m']);
    data.push([t('excel.maxMz'), maxMz.toFixed(2), 'kN·m']);
    data.push([]);

    let sumFx = 0, sumFy = 0, sumFz = 0, sumMx2 = 0, sumMy2 = 0, sumMz2 = 0;
    for (const r of r3d.reactions) {
      sumFx += r.fx; sumFy += r.fy; sumFz += r.fz;
      sumMx2 += r.mx; sumMy2 += r.my; sumMz2 += r.mz;
    }
    data.push([t('excel.equilibriumCheck')]);
    data.push(['ΣFx', sumFx.toFixed(4), 'kN']);
    data.push(['ΣFy', sumFy.toFixed(4), 'kN']);
    data.push(['ΣFz', sumFz.toFixed(4), 'kN']);
    data.push(['ΣMx', sumMx2.toFixed(4), 'kN·m']);
    data.push(['ΣMy', sumMy2.toFixed(4), 'kN·m']);
    data.push(['ΣMz', sumMz2.toFixed(4), 'kN·m']);
  } else if (r2d) {
    data.push([t('excel.maxResults')]);
    data.push([t('excel.maxDisplacement'), (resultsStore.maxDisplacement * 1000).toFixed(4), 'mm']);
    data.push([t('excel.maxMoment'), resultsStore.maxMoment.toFixed(2), 'kN·m']);
    data.push([t('excel.maxShear'), resultsStore.maxShear.toFixed(2), 'kN']);

    let maxAxial = 0;
    for (const ef of r2d.elementForces) {
      maxAxial = Math.max(maxAxial, Math.abs(ef.nStart), Math.abs(ef.nEnd));
    }
    data.push([t('excel.maxAxial'), maxAxial.toFixed(2), 'kN']);
    data.push([]);

    let sumRx = 0, sumRy = 0, sumMz = 0;
    for (const r of r2d.reactions) {
      sumRx += r.rx; sumRy += r.ry; sumMz += r.mz;
    }
    data.push([t('excel.equilibriumCheck')]);
    data.push(['ΣRx', sumRx.toFixed(4), 'kN']);
    data.push(['ΣRy', sumRy.toFixed(4), 'kN']);
    data.push(['ΣMz', sumMz.toFixed(4), 'kN·m']);
  }

  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = [{ wch: 25 }, { wch: 15 }, { wch: 10 }];
  return ws;
}

function createElementsSheet(): XLSX.WorkSheet {
  const is3D = uiStore.analysisMode === '3d';
  const r3d = resultsStore.results3D;
  const r2d = resultsStore.results;
  const hasResults = is3D ? !!r3d : !!r2d;

  const headers = [
    'ID', t('excel.type'), t('excel.nodeI'), t('excel.nodeJ'), 'L (m)',
    t('excel.material'), 'E (MPa)',
    t('excel.section'), 'A (m²)', 'Iy (m⁴)',
  ];
  if (is3D) headers.push('Iz (m⁴)', 'J (m⁴)');
  headers.push(t('excel.hingeI'), t('excel.hingeJ'));

  if (hasResults && is3D) {
    headers.push(
      'Ni (kN)', 'Nj (kN)',
      'Vyi (kN)', 'Vyj (kN)',
      'Vzi (kN)', 'Vzj (kN)',
      'Mxi (kN·m)', 'Mxj (kN·m)',
      'Myi (kN·m)', 'Myj (kN·m)',
      'Mzi (kN·m)', 'Mzj (kN·m)',
    );
  } else if (hasResults) {
    headers.push(
      'Ni (kN)', 'Nj (kN)',
      'Vi (kN)', 'Vj (kN)',
      'Mi (kN·m)', 'Mj (kN·m)',
      '|N|max', '|V|max', '|M|max'
    );
  }

  const data: (string | number)[][] = [headers];

  for (const elem of modelStore.elements.values()) {
    const mat = modelStore.materials.get(elem.materialId);
    const sec = modelStore.sections.get(elem.sectionId);
    const L = modelStore.getElementLength(elem.id);

    const row: (string | number)[] = [
      elem.id,
      elem.type === 'frame' ? 'Frame' : 'Truss',
      elem.nodeI, elem.nodeJ,
      Number(L.toFixed(4)),
      mat?.name ?? '-', mat?.e ?? 0,
      sec?.name ?? '-', sec?.a ?? 0, sec?.iy ?? sec?.iz ?? 0,
    ];
    if (is3D) row.push(sec?.iz ?? 0, sec?.j ?? 0);
    row.push(elem.hingeStart ? t('excel.yes') : t('excel.no'), elem.hingeEnd ? t('excel.yes') : t('excel.no'));

    if (hasResults && is3D && r3d) {
      const f = r3d.elementForces.find(f => f.elementId === elem.id);
      if (f) {
        row.push(
          Number(f.nStart.toFixed(4)), Number(f.nEnd.toFixed(4)),
          Number(f.vyStart.toFixed(4)), Number(f.vyEnd.toFixed(4)),
          Number(f.vzStart.toFixed(4)), Number(f.vzEnd.toFixed(4)),
          Number(f.mxStart.toFixed(4)), Number(f.mxEnd.toFixed(4)),
          Number(f.myStart.toFixed(4)), Number(f.myEnd.toFixed(4)),
          Number(f.mzStart.toFixed(4)), Number(f.mzEnd.toFixed(4)),
        );
      } else {
        for (let i = 0; i < 12; i++) row.push('-');
      }
    } else if (hasResults && r2d) {
      const forces = r2d.elementForces.find(f => f.elementId === elem.id);
      if (forces) {
        row.push(
          Number(forces.nStart.toFixed(4)), Number(forces.nEnd.toFixed(4)),
          Number(forces.vStart.toFixed(4)), Number(forces.vEnd.toFixed(4)),
          Number(forces.mStart.toFixed(4)), Number(forces.mEnd.toFixed(4)),
          Number(Math.max(Math.abs(forces.nStart), Math.abs(forces.nEnd)).toFixed(4)),
          Number(Math.max(Math.abs(forces.vStart), Math.abs(forces.vEnd)).toFixed(4)),
          Number(Math.max(Math.abs(forces.mStart), Math.abs(forces.mEnd)).toFixed(4)),
        );
      } else {
        row.push('-', '-', '-', '-', '-', '-', '-', '-', '-');
      }
    }

    data.push(row);
  }

  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = headers.map(() => ({ wch: 12 }));
  return ws;
}

function createNodesSheet(): XLSX.WorkSheet {
  const is3D = uiStore.analysisMode === '3d';
  const r3d = resultsStore.results3D;
  const r2d = resultsStore.results;
  const hasResults = is3D ? !!r3d : !!r2d;

  const headers = is3D ? ['ID', 'X (m)', 'Y (m)', 'Z (m)'] : ['ID', 'X (m)', 'Y (m)'];
  if (hasResults) {
    if (is3D) {
      headers.push('ux (mm)', 'uy (mm)', 'uz (mm)', 'θx (mrad)', 'θy (mrad)', 'θz (mrad)');
    } else {
      headers.push('ux (mm)', 'uy (mm)', 'θz (mrad)');
    }
  }

  const data: (string | number)[][] = [headers];

  for (const node of modelStore.nodes.values()) {
    const row: (string | number)[] = [
      node.id,
      Number(node.x.toFixed(4)),
      Number(node.y.toFixed(4)),
    ];
    if (is3D) row.push(Number((node.z ?? 0).toFixed(4)));

    if (hasResults && is3D && r3d) {
      const d = r3d.displacements.find(d => d.nodeId === node.id);
      if (d) {
        row.push(
          Number((d.ux * 1000).toFixed(4)), Number((d.uy * 1000).toFixed(4)),
          Number((d.uz * 1000).toFixed(4)), Number((d.rx * 1000).toFixed(4)),
          Number((d.ry * 1000).toFixed(4)), Number((d.rz * 1000).toFixed(4)),
        );
      } else {
        row.push('-', '-', '-', '-', '-', '-');
      }
    } else if (hasResults && r2d) {
      const disp = r2d.displacements.find(d => d.nodeId === node.id);
      if (disp) {
        row.push(
          Number((disp.ux * 1000).toFixed(4)),
          Number((disp.uy * 1000).toFixed(4)),
          Number((disp.rz * 1000).toFixed(4)),
        );
      } else {
        row.push('-', '-', '-');
      }
    }

    data.push(row);
  }

  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = headers.map(() => ({ wch: 12 }));
  return ws;
}

function createReactionsSheet(): XLSX.WorkSheet {
  const is3D = uiStore.analysisMode === '3d';
  const r3d = resultsStore.results3D;
  const r2d = resultsStore.results;

  if (!r3d && !r2d) {
    return XLSX.utils.aoa_to_sheet([[t('excel.noResults')]]);
  }

  if (is3D && r3d) {
    const headers = [t('excel.node'), t('excel.type'), 'Fx (kN)', 'Fy (kN)', 'Fz (kN)', 'Mx (kN·m)', 'My (kN·m)', 'Mz (kN·m)'];
    const data: (string | number)[][] = [headers];

    for (const r of r3d.reactions) {
      const sup = [...modelStore.supports.values()].find(s => s.nodeId === r.nodeId);
      data.push([
        r.nodeId, sup?.type ?? '-',
        Number(r.fx.toFixed(4)), Number(r.fy.toFixed(4)), Number(r.fz.toFixed(4)),
        Number(r.mx.toFixed(4)), Number(r.my.toFixed(4)), Number(r.mz.toFixed(4)),
      ]);
    }

    const totals = r3d.reactions.reduce(
      (a, r) => ({ fx: a.fx + r.fx, fy: a.fy + r.fy, fz: a.fz + r.fz, mx: a.mx + r.mx, my: a.my + r.my, mz: a.mz + r.mz }),
      { fx: 0, fy: 0, fz: 0, mx: 0, my: 0, mz: 0 }
    );
    data.push([]);
    data.push([
      t('excel.total'), '',
      Number(totals.fx.toFixed(4)), Number(totals.fy.toFixed(4)), Number(totals.fz.toFixed(4)),
      Number(totals.mx.toFixed(4)), Number(totals.my.toFixed(4)), Number(totals.mz.toFixed(4)),
    ]);

    const ws = XLSX.utils.aoa_to_sheet(data);
    ws['!cols'] = headers.map(() => ({ wch: 12 }));
    return ws;
  }

  // 2D fallback
  const headers = [t('excel.node'), t('excel.supportType'), 'Rx (kN)', 'Ry (kN)', 'Mz (kN·m)'];
  const data: (string | number)[][] = [headers];

  for (const r of r2d!.reactions) {
    const sup = [...modelStore.supports.values()].find(s => s.nodeId === r.nodeId);
    const supType = sup ? {
      fixed: t('excel.fixed'), pinned: t('excel.pinned'),
      rollerX: t('excel.rollerX'), rollerY: t('excel.rollerY'), spring: t('excel.spring'),
    }[sup.type] ?? sup.type : '-';

    data.push([
      r.nodeId, supType,
      Number(r.rx.toFixed(4)), Number(r.ry.toFixed(4)), Number(r.mz.toFixed(4)),
    ]);
  }

  const totals = r2d!.reactions.reduce(
    (acc, r) => ({ rx: acc.rx + r.rx, ry: acc.ry + r.ry, mz: acc.mz + r.mz }),
    { rx: 0, ry: 0, mz: 0 }
  );
  data.push([]);
  data.push([t('excel.total'), '', Number(totals.rx.toFixed(4)), Number(totals.ry.toFixed(4)), Number(totals.mz.toFixed(4))]);

  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = [{ wch: 8 }, { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 14 }];
  return ws;
}

function createMaterialsSheet(): XLSX.WorkSheet {
  const headers = ['ID', t('excel.name'), 'E (MPa)', 'ν', 'ρ (kN/m³)', 'fy (MPa)'];
  const data: (string | number)[][] = [headers];

  for (const mat of modelStore.materials.values()) {
    data.push([mat.id, mat.name, mat.e, mat.nu, mat.rho, mat.fy ?? '-']);
  }

  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = [{ wch: 5 }, { wch: 20 }, { wch: 12 }, { wch: 8 }, { wch: 12 }, { wch: 12 }];
  return ws;
}

function createSectionsSheet(): XLSX.WorkSheet {
  const is3D = uiStore.analysisMode === '3d';
  const headers = ['ID', t('excel.name'), t('excel.shape'), 'A (m²)', 'Iy (m⁴)'];
  if (is3D) headers.push('Iz (m⁴)', 'J (m⁴)');
  headers.push('b (m)', 'h (m)', 'tw (m)', 'tf (m)');

  const data: (string | number)[][] = [headers];

  for (const sec of modelStore.sections.values()) {
    const row: (string | number)[] = [sec.id, sec.name, sec.shape ?? 'rect', sec.a, sec.iy ?? sec.iz];
    if (is3D) row.push(sec.iz, sec.j ?? '-');
    row.push(sec.b ?? '-', sec.h ?? '-', sec.tw ?? '-', sec.tf ?? '-');
    data.push(row);
  }

  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = headers.map(() => ({ wch: 12 }));
  return ws;
}

export function exportToExcel(options: ExcelExportOptions = {}): void {
  const {
    filename = 'analisis-estructural.xlsx',
    includeResults = true,
  } = options;

  const is3D = uiStore.analysisMode === '3d';
  const hasResults = is3D ? !!resultsStore.results3D : !!resultsStore.results;

  const wb = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(wb, createSummarySheet(), t('excel.sheetSummary'));
  XLSX.utils.book_append_sheet(wb, createElementsSheet(), t('excel.sheetElements'));
  XLSX.utils.book_append_sheet(wb, createNodesSheet(), t('excel.sheetNodes'));

  if (includeResults && hasResults) {
    XLSX.utils.book_append_sheet(wb, createReactionsSheet(), t('excel.sheetReactions'));
  }

  XLSX.utils.book_append_sheet(wb, createMaterialsSheet(), t('excel.sheetMaterials'));
  XLSX.utils.book_append_sheet(wb, createSectionsSheet(), t('excel.sheetSections'));

  XLSX.writeFile(wb, filename);
}
