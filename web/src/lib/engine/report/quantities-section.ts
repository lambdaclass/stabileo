/**
 * The report's quantities section, from `engine/quantities.ts`: concrete and structural steel by
 * material, reinforcement by diameter, and steel per cubic metre over the detailed members, with
 * how much of the concrete that is.
 */
import type { ProjectQuantities } from '../quantities';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function quantitiesSectionHtml(q: ProjectQuantities, tr: (k: string) => string, heading: string): string[] {
  const html: string[] = [];
  html.push(`<div class="page-break"></div>`);
  html.push(`<h1 id="sec-quantities">${esc(heading)}</h1>`);
  html.push(`<h3>${esc(tr('report.qty.byMaterial'))}</h3>`);
  html.push(`<table><thead><tr><th>${esc(tr('report.material'))}</th><th>${esc(tr('report.qty.members'))}</th><th>${esc(tr('report.qty.shells'))}</th><th>${esc(tr('report.qty.volume'))} (m³)</th><th>${esc(tr('report.qty.weight'))} (kN)</th></tr></thead><tbody>`);
  for (const m of q.model.byMaterial) {
    html.push(`<tr><td>${esc(m.name)}</td><td class="num">${m.memberCount}</td><td class="num">${m.shellCount}</td><td class="num">${m.volume.toFixed(3)}</td><td class="num">${m.weight.toFixed(1)}</td></tr>`);
  }
  html.push(`<tr style="font-weight:bold"><td>${esc(tr('report.qty.total'))}</td><td></td><td></td><td class="num">${q.model.totalVolume.toFixed(3)}</td><td class="num">${q.model.totalWeight.toFixed(1)}</td></tr>`);
  html.push(`</tbody></table>`);
  html.push(`<p>${esc(tr('report.concrete'))}: <strong>${q.model.concreteVolume.toFixed(2)} m³</strong> · ${esc(tr('report.qty.structuralSteel'))}: <strong>${(q.model.steelWeight / 9.80665).toFixed(2)} t</strong></p>`);

  if (q.reinforcement) {
    const r = q.reinforcement;
    html.push(`<h3>${esc(tr('report.qty.rebar'))}</h3>`);
    html.push(`<table><thead><tr><th>Ø (mm)</th><th>${esc(tr('report.qty.bars'))}</th><th>${esc(tr('report.qty.length'))} (m)</th><th>${esc(tr('report.qty.mass'))} (kg)</th></tr></thead><tbody>`);
    for (const d of r.byDiameter) html.push(`<tr><td class="num">${d.diameterMm}</td><td class="num">${d.quantity}</td><td class="num">${d.lengthM.toFixed(1)}</td><td class="num">${d.massKg.toFixed(1)}</td></tr>`);
    html.push(`</tbody></table>`);
    html.push(`<table><tbody>`);
    html.push(`<tr><td>${esc(tr('report.rebarLong'))}</td><td class="num">${r.longitudinalKg.toFixed(0)}</td><td>kg</td></tr>`);
    html.push(`<tr><td>${esc(tr('report.rebarStirrups'))}</td><td class="num">${r.transverseKg.toFixed(0)}</td><td>kg</td></tr>`);
    html.push(`<tr><td><strong>${esc(tr('report.steelTotal'))}</strong></td><td class="num"><strong>${r.totalKg.toFixed(0)}</strong></td><td>kg</td></tr>`);
    if (q.kgPerM3 !== null) html.push(`<tr><td>${esc(tr('report.steelRatio'))}</td><td class="num">${q.kgPerM3.toFixed(0)}</td><td>kg/m³</td></tr>`);
    html.push(`</tbody></table>`);
    html.push(`<p class="note">${esc(tr('report.qty.coverage').replace('{n}', String(r.members.length)).replace('{v}', q.detailedConcreteVolume.toFixed(2)).replace('{total}', q.model.concreteVolume.toFixed(2)))}</p>`);
  } else {
    html.push(`<p class="note">${esc(tr('report.qty.noDetailing'))}</p>`);
  }
  return html;
}
