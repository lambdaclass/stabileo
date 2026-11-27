import type { Translations } from '../../types';

const messages: Translations = {
  "foundation.inconsistentPlateSprings": "Düğüm yayları her plağın yatak katsayısı, kalkma ayarı ve yatay kısıtlarıyla uyumlu olmalıdır. Plakları denetleyip temel ayarlarını yeniden uygulayın.",
  "foundation.mixedSoilSelection": "Tek bir kabuk elemanı ve yaylarla desteklenen tam bir plak aynı temel düğümünü kullanıyor. Atamaları ayırın veya uyumlu tam plakları seçin.",
  "diag.model.flangeTwice": "Ayrıca modellenmiş bir döşemenin altında T kesitli kirişler: başlık rijitlikte iki kez sayılır. Gövdeyi dikdörtgen, döşemeyi kabuk olarak modelleyin; başlık tasarımda Tasarım verilerinden dikkate alınır.",
  "diag.tooltip.MODEL_FLANGE_TWICE": "T kesit ve modellenmiş döşeme: başlık iki kez sayılır",
  'pro.plates.diag.looseCorner': "Başka hiçbir şeye bağlanmayan düğümleri olan plak (çubuk, mesnet ya da başka plak yok): orada yük aktarılmaz",
  "plates.meshedAtAnalysisKept": "Analizden önce {n} plak ağlandı ({cells} eleman); diğer {kept} plak ağını korudu.",
  'svc.engine.conflictingConstraints': '{node} düğümünün {dof} serbestlik derecesi {n} kısıtla bağlı; yalnızca sonuncusu geçerli',
  'diag.detail.nodes': 'düğümler',
  'diag.detail.cases': 'durumlar',
  'diag.detail.computed': 'hesaplanan',
  'diag.detail.limit': 'sınır',
  'diag.detail.ratio': 'oran',
  'diag.detail.value': 'değer',
  'diag.detail.dofIndices': 'serbestlik dereceleri',
  'diag.detail.n': 'sayı',
  'diag.detail.add': 'eklenecek',
  'diag.detail.change': 'değiştirilecek',
  'diag.detail.remove': 'kaldırılacak',
  "plates.analysisStale": "Bu plaklar güncel olmayan ağlarıyla çözüldü: {names}. Hâlâ geçerli bir ağ, ancak modelin son değişikliklerini izlemiyor; ağlarını oluşturun veya “Analizden önce ağ oluştur” seçeneğini açın.",
  'xls.err.duplicatePhysicalColumn': '{k} fiziksel büyüklük sütunu birden fazla kez yer alıyor.',
  'xls.err.duplicateLoadSheet': '{sheet} adlı yalnızca bir sayfaya izin verilir.',
  'plates.diag.looseCorner': "Başka hiçbir şeye bağlanmayan düğümleri olan plak (çubuk, mesnet ya da başka plak yok): orada yük aktarılmaz",
};

export default messages;
