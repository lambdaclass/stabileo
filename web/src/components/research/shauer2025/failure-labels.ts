import { researchLocale } from '../i18n';
const labels = {
  'frame-order': ['Missing or out-of-order frames', 'Fotogramas faltantes o desordenados', 'Quadros ausentes ou fora de ordem', 'Fehlende oder ungeordnete Frames', 'Images manquantes ou désordonnées', 'Eksik veya sırasız kareler', 'Hiányzó vagy rossz sorrendű képkockák'],
  'nonfinite-step': ['Invalid step results', 'Resultados de paso inválidos', 'Resultados de passo inválidos', 'Ungültige Schrittergebnisse', 'Résultats de pas invalides', 'Geçersiz adım sonuçları', 'Érvénytelen lépéseredmények'],
  nonconverged: ['Non-converged steps', 'Pasos sin convergencia', 'Passos sem convergência', 'Nicht konvergierte Schritte', 'Pas non convergés', 'Yakınsamayan adımlar', 'Nem konvergált lépések'],
  'load-coordinate-mismatch': ['Time or displacement differs', 'Difiere el tiempo o desplazamiento', 'Tempo ou deslocamento diferente', 'Zeit oder Verschiebung abweichend', 'Temps ou déplacement différent', 'Zaman veya yer değiştirme farklı', 'Eltérő idő vagy elmozdulás'],
  'damage-max': ['Maximum damage differs', 'Difiere el daño máximo', 'Dano máximo diferente', 'Maximaler Schaden abweichend', 'Endommagement maximal différent', 'En büyük hasar farklı', 'Eltérő legnagyobb károsodás'],
  fields: ['Nodal field or stress checks failed', 'Fallaron los campos nodales o tensiones', 'Falha nos campos nodais ou tensões', 'Knotenfeld- oder Spannungsprüfung fehlgeschlagen', 'Échec des champs nodaux ou contraintes', 'Düğüm alanı veya gerilme kontrolleri başarısız', 'Sikertelen csomóponti mező- vagy feszültségellenőrzés'],
  'force-relative': ['Relative force tolerance exceeded', 'Se superó la tolerancia relativa de fuerza', 'Tolerância relativa de força excedida', 'Relative Krafttoleranz überschritten', 'Tolérance relative de force dépassée', 'Bağıl kuvvet toleransı aşıldı', 'Relatív erőtűrés túllépve'],
  'force-absolute': ['Absolute force tolerance exceeded', 'Se superó la tolerancia absoluta de fuerza', 'Tolerância absoluta de força excedida', 'Absolute Krafttoleranz überschritten', 'Tolérance absolue de force dépassée', 'Mutlak kuvvet toleransı aşıldı', 'Abszolút erőtűrés túllépve'],
  'peak-step': ['Peak occurs at a different step', 'El máximo ocurre en otro paso', 'O máximo ocorre em outro passo', 'Maximum bei anderem Schritt', 'Pic à un autre pas', 'Tepe farklı adımda', 'A csúcs más lépésben jelentkezik'],
  iterations: ['Iteration counts differ', 'Difieren las iteraciones', 'Contagens de iterações diferentes', 'Iterationszahlen abweichend', 'Nombres d’itérations différents', 'İterasyon sayıları farklı', 'Eltérő iterációszám'],
} as const;
export type ComparisonFailure = keyof typeof labels;
export function comparisonFailureLabel(id: ComparisonFailure): string {
  return labels[id][['en', 'es', 'pt', 'de', 'fr', 'tr', 'hu'].indexOf(researchLocale())];
}
