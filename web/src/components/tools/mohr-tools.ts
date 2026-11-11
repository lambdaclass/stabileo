export const MOHR_IDS = ['mohr-2d', 'mohr-3d'] as const;
export type MohrToolId = typeof MOHR_IDS[number];
export const MOHR_UPDATED = '2026-11-11';

export const mohrToolTranslations: Record<string, Record<string, string>> = {
  en: {
    'tools.mohr-2d': 'Mohr circle 2D',
    'tools.mohr-2d.subtitle': 'Principal stresses, maximum shear and the stress on any rotated plane of a plane stress state, with the circle and the element drawn.',
    'tools.mohr-2d.case': 'plane stress transformation and principal stress calculator',
    'tools.mohr-3d': '3D stress state and Mohr circles',
    'tools.mohr-3d.subtitle': 'Principal stresses and directions of a 3D stress tensor, the traction on any plane, the stress vectors on the sphere of normals and Mohr’s three circles.',
    'tools.mohr-3d.case': 'principal stresses, von Mises and Mohr’s three circles',
  },
  es: {
    'tools.mohr-2d': 'Círculo de Mohr 2D',
    'tools.mohr-2d.subtitle': 'Tensiones principales, corte máximo y la tensión en cualquier plano rotado de un estado plano, con el círculo y el elemento dibujados.',
    'tools.mohr-2d.case': 'calculadora de transformación de tensiones y tensiones principales en estado plano',
    'tools.mohr-3d': 'Estado tensional 3D y círculos de Mohr',
    'tools.mohr-3d.subtitle': 'Tensiones y direcciones principales de un tensor 3D, el vector tensión en cualquier plano, los vectores sobre la esfera de normales y los tres círculos de Mohr.',
    'tools.mohr-3d.case': 'tensiones principales, von Mises y los tres círculos de Mohr',
  },
  pt: {
    'tools.mohr-2d': 'Círculo de Mohr 2D',
    'tools.mohr-2d.subtitle': 'Tensões principais, cisalhamento máximo e a tensão em qualquer plano rotacionado de um estado plano, com o círculo e o elemento desenhados.',
    'tools.mohr-2d.case': 'calculadora de transformação de tensões e tensões principais no estado plano',
    'tools.mohr-3d': 'Estado de tensões 3D e círculos de Mohr',
    'tools.mohr-3d.subtitle': 'Tensões e direções principais de um tensor 3D, o vetor tensão em qualquer plano, os vetores sobre a esfera de normais e os três círculos de Mohr.',
    'tools.mohr-3d.case': 'tensões principais, von Mises e os três círculos de Mohr',
  },
  de: {
    'tools.mohr-2d': 'Mohrscher Kreis 2D',
    'tools.mohr-2d.subtitle': 'Hauptspannungen, maximale Schubspannung und die Spannung auf jeder gedrehten Ebene eines ebenen Spannungszustands, mit Kreis und Element.',
    'tools.mohr-2d.case': 'Rechner für Spannungstransformation und Hauptspannungen im ebenen Zustand',
    'tools.mohr-3d': 'Räumlicher Spannungszustand und Mohrsche Kreise',
    'tools.mohr-3d.subtitle': 'Hauptspannungen und Hauptrichtungen eines räumlichen Spannungstensors, der Spannungsvektor auf jeder Ebene, die Vektoren auf der Normalenkugel und die drei Mohrschen Kreise.',
    'tools.mohr-3d.case': 'Hauptspannungen, Von-Mises-Spannung und die drei Mohrschen Kreise',
  },
  fr: {
    'tools.mohr-2d': 'Cercle de Mohr 2D',
    'tools.mohr-2d.subtitle': 'Contraintes principales, cisaillement maximal et contrainte sur tout plan tourné d’un état plan, avec le cercle et l’élément dessinés.',
    'tools.mohr-2d.case': 'calculateur de changement de repère et de contraintes principales en état plan',
    'tools.mohr-3d': 'État de contrainte 3D et cercles de Mohr',
    'tools.mohr-3d.subtitle': 'Contraintes et directions principales d’un tenseur 3D, le vecteur contrainte sur tout plan, les vecteurs sur la sphère des normales et les trois cercles de Mohr.',
    'tools.mohr-3d.case': 'contraintes principales, von Mises et les trois cercles de Mohr',
  },
  tr: {
    'tools.mohr-2d': 'Mohr dairesi 2B',
    'tools.mohr-2d.subtitle': 'Düzlem gerilme durumunun asal gerilmeleri, en büyük kayma gerilmesi ve döndürülmüş her düzlemdeki gerilme; daire ve eleman çizimiyle.',
    'tools.mohr-2d.case': 'düzlem gerilme dönüşümü ve asal gerilme hesaplayıcı',
    'tools.mohr-3d': '3B gerilme durumu ve Mohr daireleri',
    'tools.mohr-3d.subtitle': '3B gerilme tensörünün asal gerilmeleri ve doğrultuları, her düzlemdeki gerilme vektörü, normaller küresi üzerindeki vektörler ve üç Mohr dairesi.',
    'tools.mohr-3d.case': 'asal gerilmeler, von Mises ve üç Mohr dairesi',
  },
};
