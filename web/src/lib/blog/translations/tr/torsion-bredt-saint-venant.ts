import type { PostBody } from '../../types';

const body: PostBody = {
  "title": "Bredt mi, Saint-Venant mı: hangi burulma teorisi geçerli ve yanlış seçimin bedeli ne",
  "excerpt": "Üç formül, bir kesit, üç farklı sayı. Hangisinin geçerli olduğu cidara bağlıdır; ikisinin aynı anda geçerli olduğu yerde Bredt %2 ile %15 arasında düşük çıkar.",
  "blocks": [
    {
      "k": "p",
      "t": "Burulmadan kaynaklanan kayma gerilmesini üç farklı formül verir. Aynı kesit için mertebelerce farklı sonuçlar verebilirler ve hangisinin geçerli olduğu kesitin cidar tipine bağlıdır."
    },
    {
      "k": "p",
      "t": "Buraya kadarı her ders kitabında var. Nadiren açıklanan şey, üçünden ikisi aynı kesite uygulandığında ne olduğudur: farklı cevaplar verirler ve fark her zaman aynı yöndedir."
    },
    {
      "k": "h",
      "t": "Üç formül"
    },
    {
      "k": "ul",
      "items": [
        "Cauchy, τ = T·r / Iₚ. Yalnızca dairesel kesitler için ve orada tamdır: düzlem kesitlerin düzlem kaldığı tek durumdur. Gerilme yarıçapla doğrusal olarak artar; iç yüzde en küçük, dış yüzde en büyük değerini alır.",
        "Bredt, τ = T / (2·Aₘ·t). Kapalı ince cidarlı kesitler için. Burulma momenti, çevrelenen alanın etrafında dolaşan bir kayma akışıyla taşınır. Aₘ, cidarın dış yüzünün değil orta çizgisinin çevrelediği alandır; ikisini karıştırmak yaygın bir hatadır.",
        "Saint-Venant, τ = T·t / J, J = (1/3)·Σb·t³ ile. Açık ince cidarlı kesitler için. Kapalı bir yol olmadığından akış kalınlık boyunca kendi üzerine dönmek zorundadır; kalınlığın küp olarak yer almasının nedeni budur."
      ]
    },
    {
      "k": "note",
      "t": "Saint-Venant çoğu zaman “açık kesit teorisi” olarak sunulur, ama genel teoridir; diğer ikisi onun kapalı çözümü olan özel halleridir. Dairesel bir kesitte çözümü Cauchy ile tam olarak örtüşür, çünkü dairesel simetri kesitin çarpılmadığı anlamına gelir. İnce kapalı bir cidarda çözümü Bredt'inkidir."
    },
    {
      "k": "h",
      "t": "İkisi geçerli olduğunda uyuşmazlar"
    },
    {
      "k": "p",
      "t": "Dairesel bir boru alalım. Cauchy geçerlidir ve tamdır. Bredt de geçerlidir: cidar kapalıdır ve çevresinde bir kayma akışı dolaşır. Ancak Bredt gerilmenin kalınlık boyunca sabit olduğunu varsayar, Cauchy'de ise gerilme yarıçapla artar. Dolayısıyla Bredt ortalamayı, Cauchy en büyük değeri verir."
    },
    {
      "k": "table",
      "caption": "Dairesel boru kesit: Bredt'in tam değerin ne kadar altında kaldığı, bağıl cidar kalınlığına göre.",
      "head": [
        "t / rₘ",
        "Örnek (rₘ = 50 mm)",
        "τ Bredt / τ tam",
        "Bredt'in eksik kalması"
      ],
      "rows": [
        [
          "0,05",
          "2,5 mm cidar",
          "0,976",
          "%2,4"
        ],
        [
          "0,10",
          "5,0 mm cidar",
          "0,955",
          "%4,5"
        ],
        [
          "0,20",
          "10,0 mm cidar",
          "0,918",
          "%8,2"
        ],
        [
          "0,50",
          "25,0 mm cidar",
          "0,850",
          "%15,0"
        ]
      ]
    },
    {
      "k": "p",
      "t": "Bredt dört durumun hepsinde düşük kalıyor. Alışılmış pratik kurala göre hâlâ ince cidarlı sayılan, 5 mm cidarlı ve 50 mm ortalama yarıçaplı bir boruda gerçek gerilme hesaplanandan %4,5 daha yüksektir. 10 mm cidarla %8,2."
    },
    {
      "k": "quote",
      "t": "Hatanın işareti her zaman aynıdır: Bredt düşük çıkar."
    },
    {
      "k": "p",
      "t": "%4,5'lik bir fark bir tasarım kontrolünde göze çarpmaz; bu yüzden kontrolü sağlamayan bir çubuk sağlıyormuş gibi görünebilir."
    },
    {
      "k": "embed",
      "query": "example=torsion-tube&inspect=1&open=torsion",
      "label": "Aynı boru Stabileo'da: 1 kN·m burulma momenti altında CHS 105×5 konsol. Panel Burulma sekmesinde açılır ve Cauchy için 13,34 MPa, Bredt için 12,73 MPa gösterir; yukarıdaki tablodaki %95. Noktayı taşıyın veya kesiti değiştirin; üç değer de güncellenir."
    },
    {
      "k": "h",
      "t": "Cidarı açmak mertebeyi değiştirir"
    },
    {
      "k": "p",
      "t": "Örtüşen teoriler arasındaki fark yüzde birkaç düzeyindedir. Kapalı ve açık cidar arasındaki fark ise mertebelerce. 5 mm cidarlı 100×100 mm bir kare boru alıp boyuna doğrultuda yaralım: alanını, ağırlığını ve eğilme rijitliğinin neredeyse tamamını korur."
    },
    {
      "k": "table",
      "caption": "Aynı 100×100×5 kare boru, kapalı ve boyuna yarıklı halde, 1 kN·m burulma momenti altında.",
      "head": [
        "",
        "Kapalı",
        "Yarıklı",
        "Oran"
      ],
      "rows": [
        [
          "J [mm⁴]",
          "4.286.875",
          "15.833",
          "271"
        ],
        [
          "τ [MPa]",
          "11,08",
          "315,79",
          "29"
        ]
      ]
    },
    {
      "k": "p",
      "t": "Burulma rijitliği 271 kat düşer ve gerilme 29 kat artar. Aynı ağırlıktaki bir U profil ile bir kare boru burulmada çok farklı davranır."
    },
    {
      "k": "note",
      "t": "Çoğu zaman atlanan bir terim daha var: çarpılma. Açık bir kesit, ankastre olduğu için veya burulma momenti çubuk boyunca değiştiği için serbestçe çarpılamadığında, Saint-Venant burulmasına ek olarak çarpılma burulması ortaya çıkar. Bunu ihmal etmek de eksik bir tahmine yol açar."
    },
    {
      "k": "h",
      "t": "Stabileo bununla ne yapıyor"
    },
    {
      "k": "p",
      "t": "Stabileo üçünü de formülü, terimleri ve değeriyle birlikte gösterir. Geçerli olmayanlar da nedeniyle birlikte gösterilir. İkisi aynı kesit için geçerli olduğunda ise sessizce birini seçmek yerine aralarındaki farkı gösterir."
    },
    {
      "k": "p",
      "t": "Ağırlık merkezi, kayma merkezi ve kesit çekirdeği de aynı şekilde ele alınır: her biçim için ayrı bir formülden değil, kesitin gerçek poligonu üzerinde, adım adım ve her şey görünür halde hesaplanır."
    },
    {
      "k": "note",
      "t": "Görmek için düzenleyiciyi açın, bir çubuk çizin veya seçin ve Gelişmiş → Kesit analizi → Burulma'ya gidin. Dairesel bir boruda Cauchy ile Bredt'i, aralarındaki yüzde farkla birlikte yan yana görürsünüz. Bir U profilde Bredt'in uygulanamaz olarak işaretlendiğini ve nedenini görürsünüz."
    },
    {
      "k": "h",
      "t": "Özetle"
    },
    {
      "k": "ol",
      "items": [
        "Cidar kapalı bir devre oluşturuyor mu? Bredt; Aₘ orta çizgi üzerinde ölçülür.",
        "Açık mı? Saint-Venant; kalınlık küp olarak girer: en kalın cidar belirleyicidir.",
        "Dairesel mi? Cauchy ve tamdır. Bredt'i de kullanırsanız düşük çıkmasını bekleyin.",
        "Çarpılma engelleniyor mu? O zaman tek başına Saint-Venant yetmez."
      ]
    },
    {
      "k": "p",
      "t": "Her durumda, değerin yanına hangi teoriyi kullandığınızı not edin."
    },
    {
      "k": "link",
      "slug": "bars-or-finite-elements",
      "t": "Aynı soru (hangi teori geçerli ve yanlış seçimin bedeli ne) çubuk elemanlar ile sonlu elemanlar arasında seçim yaparken de ortaya çıkar:"
    },
    {
      "k": "note",
      "t": "Bu yazıdaki değerler, belirtilen kesitler için kapalı çözümlerden gelir: Aₘ orta çizgi üzerinde alınmış dairesel boru kesit ve kapalı J'si Bredt'ten, açık J'si Saint-Venant'tan hesaplanmış 100×100×5 kare boru. Aynı kesitlerle Stabileo'da yeniden üretebilirsiniz."
    }
  ]
};

export default body;
