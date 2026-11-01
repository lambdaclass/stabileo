import type { PostBody } from '../../types';

const body: PostBody = {
  "title": "Aynı model, aynı sayılar: determinizm ve köken bilgisi",
  "excerpt": "Aynı modelin aynı oturumdaki iki çözümü son basamaklarda farklılaşabiliyordu. Bunun neden olduğunu, nasıl düzelttiğimizi ve artık her raporun kendisini hangi sürümün ve hangi verilerin ürettiğini nasıl belirttiğini, böylece herkesin onu yeniden üretebildiğini anlatıyoruz.",
  "blocks": [
    {
      "k": "p",
      "t": "İmzalı bir hesap raporu yeniden üretilebilir olmalıdır. Biri projeyi bir yıl sonra yeniden açtığında ya da başka bir mühendis onu incelediğinde aynı model aynı sayıları vermeli ve bu sayıları programın hangi sürümünün ürettiği açıkça belli olmalıdır."
    },
    {
      "k": "p",
      "t": "Bunu ölçtüğümüzde her zaman geçerli olmadığını gördük: aynı modelin aynı oturumdaki iki çözümü son basamaklarda farklılaşabiliyor, bazı sonuçlar da farklı bir sırayla çıkıyordu. Farklar çok küçüktü; ama hiçbir şey değişmemişken değişen bir sayı, kontrol edilemeyen bir sayıdır."
    },
    {
      "k": "h",
      "t": "Fark nereden geliyordu"
    },
    {
      "k": "p",
      "t": "Hesap motoru düğümleri, çubukları, mesnetleri ve yükleri hash tablolarında tutar ve her tablo rastgele bir tohumla oluşturulur: iki kez okunan aynı dosya iki farklı sırayla dolaşılır. Kayan noktalı sayıları başka bir sırayla toplamak son biti değiştirebilir, çünkü bilgisayardaki toplama işlemi birleşmeli değildir. 3B rijitlik kurucuları çubukları zaten sıralıyordu; ama 2B olanlar, yük ve mesnet döngüleri ve diğer analizlerin çoğu sıralamıyordu."
    },
    {
      "k": "ul",
      "items": [
        "Bir girdi tablosu üzerindeki her dolaşma artık sabit bir sırayla, anahtarlarının sırasıyla yapılıyor: hesap motorunun genelinde 587 yer.",
        "Denge toplamları ve eğik mesnetlerin çapraz terimleri de sabit bir sırayla dolaşılıyor.",
        "Uyarılar rastgele değil, düğüm veya çubuk numarasına göre sıralı çıkıyor."
      ]
    },
    {
      "k": "table",
      "caption": "Hesap motorunda neyin değiştiği ve nasıl kontrol edildiği.",
      "head": [
        "Ne",
        "Sayı"
      ],
      "rows": [
        [
          "Sabit bir sıraya bağlanan girdi tablosu dolaşmaları",
          "587"
        ],
        [
          "Her rastgele modelin bit bit karşılaştırılan okuma sayısı",
          "6"
        ]
      ]
    },
    {
      "k": "p",
      "t": "Bir test her rastgele modeli altı kez okur, çözer ve sonuçları doğrusal, modal, burkulma ve P-Delta analizlerinde metin olarak, bit bit karşılaştırır. Bir sonucu değiştiren sırasız bir dolaşma, çalıştırmalar arasında bir fark olarak ortaya çıkar."
    },
    {
      "k": "h",
      "t": "Her rapor nereden geldiğini söyler"
    },
    {
      "k": "p",
      "t": "Her hesap raporu, PRO raporu, çalışma kitabı ve CSV dosyası artık bir köken bilgisi bloğu taşıyor: uygulamanın ve hesap motorunun sürümü ve commit'i, çözümü yapan WebAssembly modülünün SHA-256 parmak izi, tam modelin, ayarların ve gösterilen sonuçların parmak izi ile sertifikaların durumu (gezici yük zarfı daha azını kaydeder: modelini ve ayarlarını). Dışa aktarma hazırlanırken proje değiştiyse hiçbir şey dışa aktarılmaz: bir rapor hiçbir zaman bir durumun sayılarını başka bir durumun köken bilgisiyle taşımaz."
    },
    {
      "k": "p",
      "t": "Bu blok sayesinde uygulama bir raporu yeniden üretebilir: projeyi yeniden çözer ve her parmak izini karşılaştırır. Sonuç yalnızca hepsi eşleştiğinde “yeniden üretildi” olur (farklı bir WebAssembly derlemesi yanında belirtilir, fark sayılmaz); biri yeniden hesaplanamadıysa sonuç “yeniden üretildi” değil, “eksik” olur. Aynı girdiyi iki kez çözüp parmak izlerini kontrol eden bir komut satırı aracı da var."
    },
    {
      "k": "h",
      "t": "Eski projeler bunu belirtir"
    },
    {
      "k": "p",
      "t": "Kaydedilen her proje, hangi sonuç sürümüyle çözüldüğünü kaydeder. Özelliklerini ilgilendiren bir değişiklikten önce çözülmüş bir proje açıldığında uygulama bu değişiklikleri sizin dilinizde açıklayarak listeler ve proje yeniden çözülene kadar sonuçları güncelliğini yitirmiş olarak işaretler. Şüphe durumunda değişiklik geçerli sayılır: fazladan bir bildirim bir dakikaya mal olur, eksik bir bildirim ise değişmiş bir sayıyı gizleyebilir."
    },
    {
      "k": "h",
      "t": "Bir sınır"
    },
    {
      "k": "p",
      "t": "Uygulama her zaman WebAssembly'yi WebAssembly ile karşılaştırır. Yerel araç, test modelinde tarayıcının parmak izlerini bit bit yeniden üretti; ancak trigonometrik fonksiyonlar her platformda farklı kütüphanelerden gelir. Bu yüzden rijitlik matrisinin kurulmasında bu fonksiyonları iki kütüphanenin farklı yuvarladığı bir biçimde kullanan bir model, komut satırı ile tarayıcı arasında son bitte farklılaşabilir."
    },
    {
      "k": "link",
      "slug": "end-to-end-certificates",
      "t": "Bir sayıya güvenmenin öbür yarısı, onu modele karşı kontrol etmek:"
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/verification/PROVENANCE.md",
      "label": "PROVENANCE.md",
      "t": "Teknik açıklamanın tamamı:"
    }
  ]
};

export default body;
