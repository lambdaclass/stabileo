import type { PostBody } from '../../types';

const body: PostBody = {
  "title": "Stabileo 0.3.0: on altı düzeltme daha ve yayımlanan tüm bildirimler",
  "excerpt": "0.2.0'dan bu yana neler değişti: yanlış sonuç verebilecek on altı kusur düzeltildi ve güvenlik bildirimi olarak yayımlandı; sonucu modele karşı kontrol eden sertifikalar geldi; her çözümde aynı sayılar elde ediliyor.",
  "blocks": [
    {
      "k": "p",
      "t": "0.3.0 sürümü 21 Ekim 2026'da yayımlandı. 0.2.0'dan bu yana çözücüyü birbirinden bağımsız birkaç yolla kontrol etmeye devam ettik ve yanlış sonuç verebilecek on altı kusur daha bulduk. Hepsi düzeltildi ve her biri için neyin yanlış olduğunu, kimi etkilediğini ve neyin yeniden kontrol edilmesi gerektiğini anlatan bir güvenlik bildirimi yayımlandı."
    },
    {
      "k": "note",
      "t": "stabileo.com her değişikliği birleştirildiği anda yayına alır; bu düzeltmeler de 19, 20 veya 21 Ekim'den beri canlıdır. Uygulama, sonuçların değişmiş olabileceğini bir kez bildirir; kendilerini ilgilendiren bir değişiklikten önce kaydedilmiş projeler ise açıldıklarında yeniden kontrol edilmeyi ister."
    },
    {
      "k": "h",
      "t": "Projelerinizi yeniden çözün"
    },
    {
      "k": "p",
      "t": "Bir tasarım sonucunu en çok değiştirebilecek durumlar bunlardır. Her bildirimde çözümlü örneğin tamamı ve daha önce teslim ettiğiniz sonuçlarla ilgili ne yapılması gerektiği yer alır."
    },
    {
      "k": "table",
      "caption": "0.3.0 düzeltmelerinden bazıları: doğru değer ve önceki sürümün verdiği değer.",
      "head": [
        "Bildirim",
        "Durum",
        "Doğru",
        "Önceki"
      ],
      "rows": [
        [
          "SA-2026-005",
          "Beşik çatı merteği: tabandaki eksenel kuvvet (kN)",
          "-56,67",
          "-41,67"
        ],
        [
          "SA-2026-007",
          "1,5 m haç kesitli kolon: kritik yük (kN)",
          "2993",
          "5860"
        ],
        [
          "SA-2026-014",
          "Yeniden numaralandırılmış uzay çerçeve: plastik göçme çarpanı",
          "176,47",
          "424,3"
        ],
        [
          "SA-2026-015",
          "Gergili direk: gergi halatındaki çekme kuvveti (kN)",
          "5,18",
          "4,34"
        ],
        [
          "SA-2026-013",
          "Eğrisel kabuklardan konsol: ankastre kesitteki moment (kN·m/m)",
          "35,0",
          "0"
        ]
      ]
    },
    {
      "k": "p",
      "t": "Diğer bildirimler şunları kapsar: CQC ile tepki spektrumu, düğüm momentleri olan ve 3B olarak çözülen düzlem modeller, yaydan rijide çevrilen mesnetler, X–Z düzleminin dışındaki kemerler, p-y, t-z ve q-z zemin eğrileri, ince plaklarda katı kabuk eleman ve hesap motorunu ya da API'sini doğrudan kullananlar için malzeme bakımından doğrusal olmayan analiz, eğrisel MITC9 elemanları ve çubuklardaki sıcaklık yükleri."
    },
    {
      "k": "h",
      "t": "Sessizce yanlış yerine uyarılı"
    },
    {
      "k": "ul",
      "items": [
        "Henüz açık bir kusurun etkileyebileceği bir sonuç, o kusuru adıyla anan bir uyarı taşır ve bu uyarı sizin dilinizdedir. Geriye bir tane kaldı: malzeme bakımından doğrusal olmayan analiz, çubuğun tamamı için tek bir sekant modelidir.",
        "Bir sıcaklık yükünde genleşme katsayısı veya kesit yüksekliği belirtilmemişse, sonuç hangi değerin varsayıldığını söyler.",
        "Çözümü olmayan durumlar reddedilir: hiçbir şeyin döndüremediği bir düğüme etkiyen moment, başka tipteki bir elemana verilen kabuk yükü, dayandığı kaynağın gerektirdiği girdiler olmadan tanımlanan bir zemin eğrisi."
      ]
    },
    {
      "k": "h",
      "t": "Daha derin kontrol"
    },
    {
      "k": "ul",
      "items": [
        "Çerçeveler ve kafes kirişler için uçtan uca sertifikalar: bağımsız bir denetleyici rijitliği ve yükleri modelden yeniden kurar ve yer değiştirmeleri yalnızca hesap motorunun kurduğu matrislere karşı değil, modele karşı sertifikalandırır. Şimdiden motor ile modelin uyuşmadığı üç durum buldu.",
        "Aynı model her zaman bit bit aynı sayıları verir; her rapor, çalışma kitabı ve CSV dosyası kendisini hangi sürümün ve hangi verilerin ürettiğini kaydeder.",
        "CIRSOC 201 betonarme boyutlandırması hesap motorundaki tek bir uygulamadan gelir.",
        "Plaklar ve kabuklar için ağ hatası tahminleri, sertifikalı olarak değil, her zaman tahmin olarak gösterilir."
      ]
    },
    {
      "k": "link",
      "slug": "safety-advisories",
      "t": "Bildirimlerin tam listesi ve her biri için neyin yeniden kontrol edilmesi gerektiği:"
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/releases/v0.3.0.md",
      "label": "0.3.0 sürüm notları",
      "t": "Bilinen sınırlamalarla birlikte notların tamamı:"
    }
  ]
};

export default body;
