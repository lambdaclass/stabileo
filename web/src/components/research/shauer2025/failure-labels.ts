import { researchLocale } from '../i18n';
const labels = {
  'frame-order': ['Missing or out-of-order frames', 'Fotogramas faltantes o desordenados', 'Quadros ausentes ou fora de ordem', 'Fehlende oder ungeordnete Frames', 'Images manquantes ou désordonnées', 'Eksik veya sırasız kareler', 'Hiányzó vagy rossz sorrendű képkockák', '帧缺失或顺序错误', '프레임 누락 또는 순서 오류'],
  'nonfinite-step': ['Invalid step results', 'Resultados de paso inválidos', 'Resultados de passo inválidos', 'Ungültige Schrittergebnisse', 'Résultats de pas invalides', 'Geçersiz adım sonuçları', 'Érvénytelen lépéseredmények', '步骤结果无效', '유효하지 않은 단계 결과'],
  nonconverged: ['Non-converged steps', 'Pasos sin convergencia', 'Passos sem convergência', 'Nicht konvergierte Schritte', 'Pas non convergés', 'Yakınsamayan adımlar', 'Nem konvergált lépések', '未收敛的步', '수렴하지 않은 단계'],
  'load-coordinate-mismatch': ['Time or displacement differs', 'Difiere el tiempo o desplazamiento', 'Tempo ou deslocamento diferente', 'Zeit oder Verschiebung abweichend', 'Temps ou déplacement différent', 'Zaman veya yer değiştirme farklı', 'Eltérő idő vagy elmozdulás', '时间或位移不同', '시간 또는 변위가 다름'],
  'damage-max': ['Maximum damage differs', 'Difiere el daño máximo', 'Dano máximo diferente', 'Maximaler Schaden abweichend', 'Endommagement maximal différent', 'En büyük hasar farklı', 'Eltérő legnagyobb károsodás', '最大损伤不同', '최대 손상이 다름'],
  fields: ['Nodal field or stress checks failed', 'Fallaron los campos nodales o tensiones', 'Falha nos campos nodais ou tensões', 'Knotenfeld- oder Spannungsprüfung fehlgeschlagen', 'Échec des champs nodaux ou contraintes', 'Düğüm alanı veya gerilme kontrolleri başarısız', 'Sikertelen csomóponti mező- vagy feszültségellenőrzés', '节点场或应力检查未通过', '절점 필드 또는 응력 검토 실패'],
  'force-relative': ['Relative force tolerance exceeded', 'Se superó la tolerancia relativa de fuerza', 'Tolerância relativa de força excedida', 'Relative Krafttoleranz überschritten', 'Tolérance relative de force dépassée', 'Bağıl kuvvet toleransı aşıldı', 'Relatív erőtűrés túllépve', '超出力的相对容差', '상대 힘 허용오차 초과'],
  'force-absolute': ['Absolute force tolerance exceeded', 'Se superó la tolerancia absoluta de fuerza', 'Tolerância absoluta de força excedida', 'Absolute Krafttoleranz überschritten', 'Tolérance absolue de force dépassée', 'Mutlak kuvvet toleransı aşıldı', 'Abszolút erőtűrés túllépve', '超出力的绝对容差', '절대 힘 허용오차 초과'],
  'peak-step': ['Peak occurs at a different step', 'El máximo ocurre en otro paso', 'O máximo ocorre em outro passo', 'Maximum bei anderem Schritt', 'Pic à un autre pas', 'Tepe farklı adımda', 'A csúcs más lépésben jelentkezik', '峰值出现在不同的步', '최댓값이 다른 단계에서 발생'],
  iterations: ['Iteration counts differ', 'Difieren las iteraciones', 'Contagens de iterações diferentes', 'Iterationszahlen abweichend', 'Nombres d’itérations différents', 'İterasyon sayıları farklı', 'Eltérő iterációszám', '迭代次数不同', '반복 횟수가 다름'],
} as const;
export type ComparisonFailure = keyof typeof labels;
export function comparisonFailureLabel(id: ComparisonFailure): string {
  return labels[id][['en', 'es', 'pt', 'de', 'fr', 'tr', 'hu', 'zh', 'ko'].indexOf(researchLocale())];
}
