import { researchLocale } from '../i18n';
const labels = {
  'frame-order': ['Missing or out-of-order frames', 'Fotogramas faltantes o desordenados', 'Quadros ausentes ou fora de ordem', 'Fehlende oder ungeordnete Frames', 'Images manquantes ou désordonnées', 'Eksik veya sırasız kareler', 'Hiányzó vagy rossz sorrendű képkockák', '帧缺失或顺序错误', 'フレームの欠落または順序の乱れ'],
  'nonfinite-step': ['Invalid step results', 'Resultados de paso inválidos', 'Resultados de passo inválidos', 'Ungültige Schrittergebnisse', 'Résultats de pas invalides', 'Geçersiz adım sonuçları', 'Érvénytelen lépéseredmények', '步骤结果无效', '無効なステップ結果'],
  nonconverged: ['Non-converged steps', 'Pasos sin convergencia', 'Passos sem convergência', 'Nicht konvergierte Schritte', 'Pas non convergés', 'Yakınsamayan adımlar', 'Nem konvergált lépések', '未收敛的步', '収束しないステップ'],
  'load-coordinate-mismatch': ['Time or displacement differs', 'Difiere el tiempo o desplazamiento', 'Tempo ou deslocamento diferente', 'Zeit oder Verschiebung abweichend', 'Temps ou déplacement différent', 'Zaman veya yer değiştirme farklı', 'Eltérő idő vagy elmozdulás', '时间或位移不同', '時刻または変位が異なる'],
  'damage-max': ['Maximum damage differs', 'Difiere el daño máximo', 'Dano máximo diferente', 'Maximaler Schaden abweichend', 'Endommagement maximal différent', 'En büyük hasar farklı', 'Eltérő legnagyobb károsodás', '最大损伤不同', '最大損傷が異なる'],
  fields: ['Nodal field or stress checks failed', 'Fallaron los campos nodales o tensiones', 'Falha nos campos nodais ou tensões', 'Knotenfeld- oder Spannungsprüfung fehlgeschlagen', 'Échec des champs nodaux ou contraintes', 'Düğüm alanı veya gerilme kontrolleri başarısız', 'Sikertelen csomóponti mező- vagy feszültségellenőrzés', '节点场或应力检查未通过', '節点量または応力度のチェックに失敗'],
  'force-relative': ['Relative force tolerance exceeded', 'Se superó la tolerancia relativa de fuerza', 'Tolerância relativa de força excedida', 'Relative Krafttoleranz überschritten', 'Tolérance relative de force dépassée', 'Bağıl kuvvet toleransı aşıldı', 'Relatív erőtűrés túllépve', '超出力的相对容差', '相対力の許容差を超過'],
  'force-absolute': ['Absolute force tolerance exceeded', 'Se superó la tolerancia absoluta de fuerza', 'Tolerância absoluta de força excedida', 'Absolute Krafttoleranz überschritten', 'Tolérance absolue de force dépassée', 'Mutlak kuvvet toleransı aşıldı', 'Abszolút erőtűrés túllépve', '超出力的绝对容差', '絶対力の許容差を超過'],
  'peak-step': ['Peak occurs at a different step', 'El máximo ocurre en otro paso', 'O máximo ocorre em outro passo', 'Maximum bei anderem Schritt', 'Pic à un autre pas', 'Tepe farklı adımda', 'A csúcs más lépésben jelentkezik', '峰值出现在不同的步', 'ピークが別のステップで発生'],
  iterations: ['Iteration counts differ', 'Difieren las iteraciones', 'Contagens de iterações diferentes', 'Iterationszahlen abweichend', 'Nombres d’itérations différents', 'İterasyon sayıları farklı', 'Eltérő iterációszám', '迭代次数不同', '反復回数が異なる'],
} as const;
export type ComparisonFailure = keyof typeof labels;
export function comparisonFailureLabel(id: ComparisonFailure): string {
  return labels[id][['en', 'es', 'pt', 'de', 'fr', 'tr', 'hu', 'zh', 'ja'].indexOf(researchLocale())];
}
