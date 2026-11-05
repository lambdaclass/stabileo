import { researchLocale, rs } from '../i18n';
import { num } from '../shell/format';
export const checkMetadata = {
  "ex1: mesh identical to the reference (node and element fingerprints)": {
    "id": "mesh",
    "example": 1
  },
  "ex1: same number of load steps": {
    "id": "steps",
    "example": 1
  },
  "ex1: same number of staggered iterations at every step": {
    "id": "iterations",
    "example": 1
  },
  "ex1: maximum damage at every step": {
    "id": "damage",
    "example": 1
  },
  "ex1: stress at the bar centre at every step": {
    "id": "stress",
    "example": 1
  },
  "ex1: nodal damage at step 50": {
    "id": "damageField",
    "example": 1,
    "step": 50
  },
  "ex1: nodal damage at step 73": {
    "id": "damageField",
    "example": 1,
    "step": 73
  },
  "ex1: nodal displacement at step 50": {
    "id": "displacementField",
    "example": 1,
    "step": 50
  },
  "ex1: centre stress vs 1D AT2 homogeneous solution while max damage < 0.25": {
    "id": "analytic",
    "example": 1
  },
  "ex2: mesh identical to the reference (node and element fingerprints)": {
    "id": "mesh",
    "example": 2
  },
  "ex2: same number of load steps": {
    "id": "steps",
    "example": 2
  },
  "ex2: same number of staggered iterations at every step": {
    "id": "iterations",
    "example": 2
  },
  "ex2: peak force at the same load step": {
    "id": "peakStep",
    "example": 2
  },
  "ex2: peak force": {
    "id": "peak",
    "example": 2
  },
  "ex2: force at every step up to the peak": {
    "id": "preForce",
    "example": 2
  },
  "ex2: maximum damage at every step up to the peak": {
    "id": "preDamage",
    "example": 2
  },
  "ex2: force at every step, including fracture (comparison tolerance)": {
    "id": "force",
    "example": 2
  },
  "ex2: nodal damage at the peak step 56": {
    "id": "damageField",
    "example": 2,
    "step": 56
  },
  "ex2: nodal displacement at the peak step 56": {
    "id": "displacementField",
    "example": 2,
    "step": 56
  },
  "ex2: nodal damage at step 57, reference or its mirror image": {
    "id": "mirror",
    "example": 2,
    "step": 57
  },
  "ex2: nodal damage at step 78, reference or its mirror image": {
    "id": "mirror",
    "example": 2,
    "step": 78
  },
  "ex3: mesh identical to the reference (node and element fingerprints)": {
    "id": "mesh",
    "example": 3
  },
  "ex3: same number of load steps": {
    "id": "steps",
    "example": 3
  },
  "ex3: same number of staggered iterations at every step": {
    "id": "iterations",
    "example": 3
  },
  "ex3: peak force at the same load step": {
    "id": "peakStep",
    "example": 3
  },
  "ex3: force at every step up to the peak": {
    "id": "preForce",
    "example": 3
  },
  "ex3: force at every step, including fracture (comparison tolerance)": {
    "id": "force",
    "example": 3
  },
  "ex3: nodal damage at the peak step 56": {
    "id": "damageField",
    "example": 3,
    "step": 56
  },
  "ex3: nodal displacement at the peak step 56": {
    "id": "displacementField",
    "example": 3,
    "step": 56
  },
  "ex3: nodal damage at the last step 98, reference or its mirror image": {
    "id": "mirror",
    "example": 3,
    "step": 98
  }
} as const;
const labels: Record<string, Record<string, string>> = {
  "en": {
    "mesh": "Mesh fingerprints",
    "steps": "Load-step count",
    "iterations": "Iterations at every step",
    "damage": "Maximum damage at every step",
    "stress": "Centre stress at every step",
    "damageField": "Nodal damage",
    "displacementField": "Nodal displacement",
    "analytic": "Centre stress / 1D AT2 solution, max d < 0.25",
    "peakStep": "Peak-force step",
    "peak": "Peak force",
    "preForce": "Force through the peak",
    "preDamage": "Maximum damage through the peak",
    "force": "Force including fracture",
    "mirror": "Nodal damage, reference or mirror"
  },
  "es": {
    "mesh": "Huellas de malla",
    "steps": "Cantidad de pasos",
    "iterations": "Iteraciones en cada paso",
    "damage": "Daño máximo en cada paso",
    "stress": "Tensión central en cada paso",
    "damageField": "Daño nodal",
    "displacementField": "Desplazamiento nodal",
    "analytic": "Tensión central / solución AT2 1D, max d < 0.25",
    "peakStep": "Paso de fuerza máxima",
    "peak": "Fuerza máxima",
    "preForce": "Fuerza hasta el máximo",
    "preDamage": "Daño máximo hasta el pico",
    "force": "Fuerza incluida la fractura",
    "mirror": "Daño nodal, referencia o reflejo"
  },
  "pt": {
    "mesh": "Impressões da malha",
    "steps": "Quantidade de passos",
    "iterations": "Iterações em cada passo",
    "damage": "Dano máximo em cada passo",
    "stress": "Tensão central em cada passo",
    "damageField": "Dano nodal",
    "displacementField": "Deslocamento nodal",
    "analytic": "Tensão central / solução AT2 1D, max d < 0.25",
    "peakStep": "Passo de força máxima",
    "peak": "Força máxima",
    "preForce": "Força até o máximo",
    "preDamage": "Dano máximo até o pico",
    "force": "Força incluindo fratura",
    "mirror": "Dano nodal, referência ou espelho"
  },
  "de": {
    "mesh": "Netz-Prüfsummen",
    "steps": "Anzahl Lastschritte",
    "iterations": "Iterationen je Schritt",
    "damage": "Maximaler Schaden je Schritt",
    "stress": "Spannung in der Mitte je Schritt",
    "damageField": "Knotenschaden",
    "displacementField": "Knotenverschiebung",
    "analytic": "Spannung / 1D-AT2-Lösung, max d < 0.25",
    "peakStep": "Schritt der Spitzenkraft",
    "peak": "Spitzenkraft",
    "preForce": "Kraft bis zum Maximum",
    "preDamage": "Maximaler Schaden bis zum Maximum",
    "force": "Kraft einschließlich Bruch",
    "mirror": "Knotenschaden, Referenz oder Spiegelbild"
  },
  "fr": {
    "mesh": "Empreintes du maillage",
    "steps": "Nombre de pas",
    "iterations": "Itérations à chaque pas",
    "damage": "Endommagement maximal à chaque pas",
    "stress": "Contrainte centrale à chaque pas",
    "damageField": "Endommagement nodal",
    "displacementField": "Déplacement nodal",
    "analytic": "Contrainte / solution AT2 1D, max d < 0.25",
    "peakStep": "Pas du pic de force",
    "peak": "Force maximale",
    "preForce": "Force jusqu’au pic",
    "preDamage": "Endommagement maximal jusqu’au pic",
    "force": "Force, rupture comprise",
    "mirror": "Endommagement nodal, référence ou miroir"
  },
  "tr": {
    "mesh": "Ağ parmak izleri",
    "steps": "Yük adımı sayısı",
    "iterations": "Her adımdaki iterasyonlar",
    "damage": "Her adımda en büyük hasar",
    "stress": "Her adımda merkez gerilmesi",
    "damageField": "Düğüm hasarı",
    "displacementField": "Düğüm yer değiştirmesi",
    "analytic": "Merkez gerilmesi / 1D AT2 çözümü, max d < 0.25",
    "peakStep": "Tepe kuvvet adımı",
    "peak": "Tepe kuvvet",
    "preForce": "Tepeye kadar kuvvet",
    "preDamage": "Tepeye kadar en büyük hasar",
    "force": "Kırılma dahil kuvvet",
    "mirror": "Düğüm hasarı, referans veya ayna görüntüsü"
  }
};
const metrics: Record<string, Record<string, string>> = {
  "en": {
    "exact": "Exact",
    "relative difference": "Relative difference",
    "absolute difference / AT2 peak stress": "|Δσ| / σc",
    "max absolute difference": "max |Δd|",
    "max absolute difference / max |u|": "max |Δu| / max |u|",
    "absolute difference, kN": "|ΔF| (kN)"
  },
  "es": {
    "exact": "Exacto",
    "relative difference": "Diferencia relativa",
    "absolute difference / AT2 peak stress": "|Δσ| / σc",
    "max absolute difference": "max |Δd|",
    "max absolute difference / max |u|": "max |Δu| / max |u|",
    "absolute difference, kN": "|ΔF| (kN)"
  },
  "pt": {
    "exact": "Exato",
    "relative difference": "Diferença relativa",
    "absolute difference / AT2 peak stress": "|Δσ| / σc",
    "max absolute difference": "max |Δd|",
    "max absolute difference / max |u|": "max |Δu| / max |u|",
    "absolute difference, kN": "|ΔF| (kN)"
  },
  "de": {
    "exact": "Exakt",
    "relative difference": "Relative Differenz",
    "absolute difference / AT2 peak stress": "|Δσ| / σc",
    "max absolute difference": "max |Δd|",
    "max absolute difference / max |u|": "max |Δu| / max |u|",
    "absolute difference, kN": "|ΔF| (kN)"
  },
  "fr": {
    "exact": "Exact",
    "relative difference": "Écart relatif",
    "absolute difference / AT2 peak stress": "|Δσ| / σc",
    "max absolute difference": "max |Δd|",
    "max absolute difference / max |u|": "max |Δu| / max |u|",
    "absolute difference, kN": "|ΔF| (kN)"
  },
  "tr": {
    "exact": "Tam",
    "relative difference": "Bağıl fark",
    "absolute difference / AT2 peak stress": "|Δσ| / σc",
    "max absolute difference": "max |Δd|",
    "max absolute difference / max |u|": "max |Δu| / max |u|",
    "absolute difference, kN": "|ΔF| (kN)"
  }
};
export function checkLabel(name: string): string {
  const meta = checkMetadata[name as keyof typeof checkMetadata];
  if (!meta) throw new Error(`Unknown validation check: ${name}`);
  return `${num(meta.example)} · ${labels[researchLocale()][meta.id].replace('0.25', num(0.25))}${'step' in meta ? ` · ${rs().step} ${num(meta.step)}` : ''}`;
}
export function metricLabel(metric: string): string {
  const value = metrics[researchLocale()][metric];
  if (!value) throw new Error(`Unknown metric: ${metric}`);
  return value;
}
