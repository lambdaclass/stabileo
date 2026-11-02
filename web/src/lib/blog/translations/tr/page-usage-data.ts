import type { StandingPage } from '../../pages';

const body: StandingPage['i18n']['en'] = {
  "title": "Stabileo hangi anonim kullanım verilerini gönderir",
  "description": "Stabileo'nun gönderdiği anonim kullanım verilerinin tam listesi, asla neleri göndermediği ve bunun nasıl kapatılacağı.",
  "eyebrow": "Gizlilik",
  "lead": "Stabileo varsayılan olarak anonim kullanım verilerini paylaşır ve bunu istediğiniz zaman Ayarlar'dan veya profilinizden kapatabilirsiniz. Bu veriler hangi araçların kullanıldığını ve hangilerinin hata verdiğini bize gösterir; böylece önce neyi geliştireceğimize karar verebiliriz. Gönderilenlerin tam listesi aşağıdadır.",
  "blocks": [
    {
      "k": "h",
      "t": "Neler gönderilir"
    },
    {
      "k": "ul",
      "items": [
        "Hangi aracı seçtiğiniz (örneğin eleman, mesnet veya yük) ve hangi diyagramı gösterdiğiniz.",
        "Her hesap: başarılı mı yoksa başarısız mı olduğu, ne kadar sürdüğü, 2D mi 3D mi olduğu ve aralıklar halinde modelin boyutu (örneğin 11 ile 50 arası eleman).",
        "Açtığınız örnekler, kullandığınız ileri analizler ve adım adım yöntemler.",
        "Dışa aktarmalar, biçimleriyle birlikte.",
        "Kaydetmek, dışa aktarmak veya paylaşmak için sizden hesap istendiğinde bunun hangi işlem olduğu ve devam edip etmediğiniz; bir bulut projesini kaydettiğinizde veya açtığınızda, modu ve kayıtlı bir projeyi güncelleyip güncellemediği ya da değiştirip değiştirmediği.",
        "Mod (Basic veya PRO), uygulama sürümü ve dil.",
        "Bu ziyaret için rastgele bir kimlik. Bildirime “Anladım” yanıtını verirseniz, farklı tarayıcıları saymak için bu tarayıcıda saklanan, tarayıcıya ait bir kimlik daha. Hiçbiri hesabınızla ilişkilendirilmez."
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
        "Olaylarla birlikte adınız, e-postanız veya IP adresiniz."
      ]
    },
    {
      "k": "h",
      "t": "Ne kadar süre saklanır"
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
      "t": "Ayarlar'da Gizlilik bölümünden veya hesabınız varsa profilinizden. Paylaşmayı bırakırsanız henüz gönderilmemiş olaylar silinir."
    }
  ],
  "faqTitle": "Sıkça sorulan sorular",
  "faq": []
};

export default body;
