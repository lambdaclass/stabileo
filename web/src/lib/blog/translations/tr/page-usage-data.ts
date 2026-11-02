import type { StandingPage } from '../../pages';

const body: StandingPage['i18n']['en'] = {
  "title": "Stabileo hangi anonim kullanım verisini gönderir",
  "description": "Stabileo'nun gönderdiği anonim kullanım verisinin tam listesi, asla göndermedikleri ve nasıl kapatılacağı.",
  "eyebrow": "Gizlilik",
  "lead": "Stabileo varsayılan olarak anonim kullanım verisi paylaşır ve bunu istediğiniz zaman Ayarlar'dan veya profilinizden kapatabilirsiniz. Hangi araçların kullanıldığını ve hangilerinin başarısız olduğunu bize söyler; böylece önce neyi geliştireceğimize karar verebiliriz. Gönderilenlerin tam listesi şudur.",
  "blocks": [
    {
      "k": "h",
      "t": "Neler gönderiliyor"
    },
    {
      "k": "ul",
      "items": [
        "Seçtiğiniz araç (örneğin çubuk, mesnet veya yük) ve gösterdiğiniz diyagram.",
        "Her hesaplama: başarılı olup olmadığı, ne kadar sürdüğü, 2D mi 3D mi olduğu ve modelin boyutu aralıklar hâlinde (örneğin 11 ile 50 çubuk arası).",
        "Açtığınız örnekler, kullandığınız gelişmiş analizler ve adım adım yöntemler.",
        "Dışa aktarmalar ve biçimleri.",
        "Mod (Basic veya PRO), uygulama sürümü ve dil.",
        "Bu ziyaret için rastgele bir kimlik. Bildirimi “Anladım” ile yanıtlarsanız ayrıca bu tarayıcı için de bir kimlik gönderilir; farklı tarayıcıları saymak için tarayıcıda saklanır. İkisi de hesabınıza bağlı değildir."
      ]
    },
    {
      "k": "h",
      "t": "Asla gönderilmeyenler"
    },
    {
      "k": "ul",
      "items": [
        "Geometri, yükler, kesitler veya modellerinizdeki herhangi bir değer.",
        "Projelerinizin veya dosyalarınızın adları.",
        "Adınız, e-postanız veya IP adresiniz, olaylarla birlikte."
      ]
    },
    {
      "k": "h",
      "t": "Ne kadar süre saklanıyor"
    },
    {
      "k": "p",
      "t": "Olaylar en fazla on üç ay saklanır ve toplu olarak analiz edilir."
    },
    {
      "k": "h",
      "t": "Nasıl değiştirilir"
    },
    {
      "k": "p",
      "t": "Ayarlar'da Gizlilik altından veya hesabınız varsa profilinizden. Paylaşmayı bırakırsanız, henüz gönderilmemiş olaylar atılır."
    }
  ],
  "faqTitle": "Sık sorulan sorular",
  "faq": []
};

export default body;
