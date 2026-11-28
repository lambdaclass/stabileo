import type { Translations } from '../../types';

const messages: Translations = {
  "seisDes.issue.confinementUnassessed": "Sargı doğrulanmadı. Kolonu detaylandırmadan önce kayıtlı eksenel kuvvetleri ve etriye düzenini kontrol edin.",
  "detailing.cutoff.unverified": "Kiriş {element}, x = {x} m. Yerel kesme dayanımı ve donatı, çubuğun burada sonlandırılabileceğini doğrulamıyor.",
  "detailing.schedule.spliceNote": "{mark} işaretli donatı ({length} m) {stock} m'lik ticari boydan uzun ve bindirme gerektirir.",
  'project.adoptedReinforcementIgnored': "Bu sürüm projede kayıtlı kabul edilmiş donatıyı dikkate almaz ve tasarım donatısını kullanır.",
  'wall.boundaryBarCount': "Perdenin her iki ucu için sıfır veya daha büyük bir tam sayı olarak uç donatısı adedini girin.",
  'wall.tensionAtOpenings': "Boşluklu perdede çekme kontrolü için net kesit ve bu kesitten geçen sürekli donatı gereklidir.",
  'wall.tensionRequiresBarLayout': "Çekme ve eğilmenin birlikte kontrolü için düşey donatı yerleşimi gereklidir.",
  'wall.tensionShearEdition': "{edition} sürümünde perde için birlikte etkiyen çekme ve kesme doğrulanamıyor.",
};

export default messages;
