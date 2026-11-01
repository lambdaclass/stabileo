import type { PostBody } from '../../types';

const body: PostBody = {
  "title": "Çubuk elemanlar mı, sonlu elemanlar mı? İki yöntem değil, iki model",
  "excerpt": "Prizmatik bir çubuk için rijitlik yöntemi, sonlu elemanlar yönteminin tam özel halidir. Değişen modeldir; yüksek bir kirişte çubuk modeli sehimi %19 ile %34 arasında küçük verir.",
  "blocks": [
    {
      "k": "p",
      "t": "“Rijitlik yöntemini mi kullanmalıyım, sonlu elemanları mı?” sorusu her sınıfta ve her proje bürosunda gündeme gelir ve yanlış bir sorudur. Sorun, ikisini birbirinin yerine kullanılabilecek seçenekler gibi ele almasıdır; oysa öyle değildirler."
    },
    {
      "k": "p",
      "t": "Rijitlik yöntemi, çubuklara uygulanmış sonlu elemanlar yöntemidir. Bir “çubuk” programını bir “sonlu eleman” programından ayıran şey modeldir. Bir çubuk eleman, bir çubuğun nasıl şekil değiştirdiğine dair tek boyutlu bir teori taşır; bir kabuk ağı ise ayrıklaştırılmış iki boyutlu bir süreklidir. Aralarında seçim yapmak bir mühendislik kararıdır; bu yazı bu kararın ne zaman verileceğini ve yanlış verilmesinin neye mal olduğunu anlatıyor."
    },
    {
      "k": "h",
      "t": "Doğru eksenli bir çubuk ağ gerektirmez"
    },
    {
      "k": "p",
      "t": "Sonlu elemanlarda her elemanın içindeki yer değiştirme şekil fonksiyonlarıyla yaklaşık olarak ifade edilir. Eğilme etkisindeki bir çubuk için kullanılanlar kübik Hermite polinomlarıdır. Açıklık boyunca yük bulunmadığında Euler-Bernoulli kiriş denkleminin çözümü de kübik bir polinomdur; dolayısıyla yaklaşım tam çözümle çakışır."
    },
    {
      "k": "p",
      "t": "Bu yüzden prizmatik bir çubuğun rijitlik matrisi, yani herhangi bir matris yapı analizi kitabındaki matris, tamdır ve bir çubuğu daha fazla elemana bölmek hiçbir şeyi iyileştirmez. Yayılı yük olduğunda da, eşdeğer düğüm yükleri tutarlı biçimde hesaplandığı sürece aynı durum düğümlerde geçerlidir."
    },
    {
      "k": "table",
      "caption": "Basit mesnetli 6 m kiriş, 20×60 kesit, 10 kN/m, E = 30.000 MPa. Kiriş farklı sayıda çubuk elemana bölündüğünde açıklık ortası sehimi.",
      "head": [
        "Kirişteki çubuk eleman sayısı",
        "Açıklık ortası sehimi [mm]"
      ],
      "rows": [
        [
          "2",
          "1,5625"
        ],
        [
          "4",
          "1,5625"
        ],
        [
          "10",
          "1,5625"
        ],
        [
          "50",
          "1,5625"
        ],
        [
          "Kapalı çözüm 5qL⁴/384EI",
          "1,5625"
        ]
      ]
    },
    {
      "k": "p",
      "t": "İki eleman da olsa elli eleman da, motor aynı sayıyı verir ve bu sayı kapalı çözümle örtüşür."
    },
    {
      "k": "quote",
      "t": "Doğru eksenli bir çubuğa ağ oluşturmak onu daha hassas yapmaz: daha yavaş yapar."
    },
    {
      "k": "note",
      "t": "Bu kesinlik kiriş teorisi içinde geçerlidir. Matris Euler-Bernoulli denklemini tam olarak çözer; ancak çubuk bir Euler-Bernoulli kirişi gibi davranmıyorsa bu denklemin tam çözümü işe yaramaz. Yazının geri kalanı bu durumlarla ilgili."
    },
    {
      "k": "h",
      "t": "Yollarının ayrıldığı yer"
    },
    {
      "k": "p",
      "t": "Euler-Bernoulli teorisi düzlem kesitlerin düzlem ve eksene dik kaldığını varsayar; bu da kayma şekil değiştirmesini ihmal etmek anlamına gelir. Narin bir kiriş için bu çok iyi bir yaklaşımdır. Yüksek bir kiriş için değildir."
    },
    {
      "k": "p",
      "t": "Aynı 6 m kirişi aynı yük altında aldık ve yüksekliğini adım adım artırdık. Her durum iki kez çözüldü: Temel modun yaptığı gibi çubuk elemanlarla ve PRO modun yapabildiği gibi kiriş düzleminde ağ oluşturulmuş MITC4 kabuk olarak."
    },
    {
      "k": "table",
      "caption": "Basit mesnetli 6 m kiriş, 20 cm genişlik, 10 kN/m, E = 30.000 MPa, ν = 0,2. Eksen üzerinde açıklık ortası sehimi.",
      "head": [
        "L/h",
        "Yükseklik h [m]",
        "Çubuk elemanlar [mm]",
        "Kabuklar [mm]",
        "Çubuk modelinin eksik kalması"
      ],
      "rows": [
        [
          "20",
          "0,30",
          "12,500",
          "12,567",
          "%0,5"
        ],
        [
          "10",
          "0,60",
          "1,5625",
          "1,5961",
          "%2,1"
        ],
        [
          "5",
          "1,20",
          "0,19531",
          "0,21206",
          "%7,9"
        ],
        [
          "3",
          "2,00",
          "0,042188",
          "0,052145",
          "%19,1"
        ],
        [
          "2",
          "3,00",
          "0,012500",
          "0,019017",
          "%34,3"
        ]
      ]
    },
    {
      "k": "p",
      "t": "Sıradan bir kiriş olan L/h = 10'da fark %2'dir. L/h = 5'te neredeyse %8'dir. L/h = 3'te çubuk modeli %19 daha küçük bir sehim verir, L/h = 2'de ise üçte bir daha küçük."
    },
    {
      "k": "quote",
      "t": "Çubuk modeli kirişi her zaman gerçekte olduğundan daha rijit yapar."
    },
    {
      "k": "h",
      "t": "Hesap makinesiyle kontrol etmek"
    },
    {
      "k": "p",
      "t": "Kabuğun sonucuna körü körüne güvenmeniz gerekmiyor. Timoshenko kiriş teorisi kayma şekil değiştirmesini hesaba katar ve düzgün yayılı yük altındaki basit mesnetli bir kiriş için sehime bir terim ekler: q·L² / (8·κ·G·A); burada dikdörtgen kesit için κ = 5/6 ve G = E / (2·(1+ν))."
    },
    {
      "k": "table",
      "caption": "L/h = 3 olan kiriş (6 m açıklık, 2 m yükseklik): aynı soruya dört cevap.",
      "head": [
        "Model",
        "Açıklık ortası sehimi [mm]"
      ],
      "rows": [
        [
          "Çubuk elemanlar (Euler-Bernoulli)",
          "0,0422"
        ],
        [
          "Çubuk elemanlar ve elle eklenen kayma terimi",
          "0,0530"
        ],
        [
          "MITC4 kabuklar",
          "0,0521"
        ],
        [
          "Düzlem elastisite, kapalı çözüm",
          "0,0523"
        ]
      ]
    },
    {
      "k": "p",
      "t": "L/h = 3'te bu terim 0,0108 mm'dir; Euler-Bernoulli'den gelen 0,0422 mm'ye eklendiğinde 0,0530 mm verir. Kabuk 0,0521 mm verir; Timoshenko ve Goodier'in kapalı düzlem elastisite çözümü ise 0,0523 mm. Kaymayı içeren üç cevap birbiriyle %2 içinde uyuşur. Kaymayı ihmal eden cevap %19 düşük kalır."
    },
    {
      "k": "note",
      "t": "Sehim meselenin tamamı değildir. Bu yükseklikte normal gerilme dağılımı artık doğrusal değildir; dolayısıyla Navier formülü de geçerli değildir. Bu nedenle CIRSOC 201'in temelini oluşturan ACI 318, net açıklığı yüksekliğinin en fazla dört katı olan her çubuğu yüksek kiriş olarak ele alır ve doğrusal olmayan birim şekil değiştirme dağılımını hesaba katan, örneğin bir çubuk-bağ modeliyle yapılan bir tasarım ister."
    },
    {
      "k": "h",
      "t": "Milimetrenin birkaç yüzde biri önemli mi?"
    },
    {
      "k": "p",
      "t": "Tek başına o kirişte pek değil. İzostatik bir yapıda rijitlik hatası yalnızca sehimi etkiler ve 2 m yüksekliğindeki bir kiriş zaten çok az sehim yapar. Hata, rijitliğin yüklerin nasıl dağılacağını belirlediği durumda önem kazanır; bu da her hiperstatik yapıda olan şeydir."
    },
    {
      "k": "p",
      "t": "Tipik durum perde duvardır. Bir çubuk modelinde perde çok geniş bir kolondur: perdenin atalet momentini alır ve perdenin eksenine yerleşir. Yüksekliğine göre uzun olan basık bir perdeyi çubuk eleman gerçekte olduğundan belirgin biçimde daha rijit yapar."
    },
    {
      "k": "table",
      "caption": "20 cm kalınlığında, tabanda ankastre perde; üst uçta yatay olarak 100 kN uygulanmış. Üst kenarın yer değiştirmesi.",
      "head": [
        "Perde, uzunluk × yükseklik [m]",
        "Yükseklik / uzunluk",
        "Çubuk eleman [mm]",
        "Kabuk [mm]",
        "Çubuk elemanın fazla rijitliği"
      ],
      "rows": [
        [
          "4 × 3",
          "0,75",
          "0,0281",
          "0,0627",
          "2,23 kat"
        ],
        [
          "3 × 3",
          "1,00",
          "0,0667",
          "0,1129",
          "1,69 kat"
        ],
        [
          "2 × 3",
          "1,50",
          "0,2250",
          "0,2943",
          "1,31 kat"
        ],
        [
          "3 × 6",
          "2,00",
          "0,533",
          "0,625",
          "1,17 kat"
        ],
        [
          "3 × 9",
          "3,00",
          "1,800",
          "1,937",
          "1,08 kat"
        ]
      ]
    },
    {
      "k": "p",
      "t": "4 m uzunluğunda ve 3 m yüksekliğinde, bir kat yüksekliğindeki bir perde, çubuk elemanla modellendiğinde 2,2 kat daha rijit çıkar. 3 m uzunluğunda ve 9 m yüksekliğinde, üç katlı bir perde ise yalnızca %8 daha rijittir. Fark en çok basık perdelerde önemlidir."
    },
    {
      "k": "p",
      "t": "Bu da kesme kuvvetinin nasıl paylaşıldığını değiştirir. Aynı aks üzerinde, biri 4 m diğeri 2 m uzunluğunda, ikisi de 3 m yüksekliğinde ve döşemeyle birbirine bağlı iki perde alalım. Çubuk elemanlarla kısa perde kesme kuvvetinin %11,1'ini alır. Kabuklarla %17,6'sını alır; bu, çubuk modelinin öngördüğünden %58 fazladır. Çubuk modelinin uzun perdeye yüklediği fazla yük kısa perdeden eksilir ve kısa perde, gerçekte taşıyacağından daha az kesme kuvvetine göre boyutlandırılmış olur."
    },
    {
      "k": "h",
      "t": "Bir çubuk modelinin cevaplayamayacağı sorular"
    },
    {
      "k": "p",
      "t": "Buraya kadar ele alınanlar, çubuk elemanların yanlış sayı verdiği durumlardı. Bazı durumlarda ise hiç sayı veremezler, çünkü sorunun modelde bir karşılığı yoktur."
    },
    {
      "k": "ul",
      "items": [
        "Kirişsiz döşeme. Momentin kolon şeridi ile orta şerit arasında nasıl paylaşıldığı ve ne kadarının her kolon üzerinde yoğunlaştığı iki boyutlu bir bilgidir. Bir kiriş ızgarası bunu yaklaşık olarak verebilir, ancak bu bilgi modelde yoktur.",
        "Boşluklu perde. Bir çubuk elemanın ekseni boyunca her noktada tek bir kesiti vardır; dolayısıyla perdenin ortasındaki bir pencerenin yerleşebileceği bir yer yoktur.",
        "Düğüm bölgesi. Bir çubuk modelinde kiriş-kolon birleşim bölgesi bir noktadır; bu yüzden en büyük moment eksen üzerinde çıkar. Gerçekte birleşim bölgesi kolon kadar büyüktür ve boyutlandırdığınız kesit kolon yüzündeki kesittir.",
        "Mesnede yakın tekil yük. Yüksek kirişteki nedenle aynı şekilde, bu bölgede düzlem kesitler düzlem kalmaz."
      ]
    },
    {
      "k": "h",
      "t": "Uyuşmak zorunda oldukları yer"
    },
    {
      "k": "p",
      "t": "Argümanın diğer yarısı da aynı ölçüde önemlidir. İlk satırdaki L/h = 20 olan narin kirişte çubuk elemanlar ile kabuklar arasındaki fark %0,5'tir. Kayma her zaman mevcut olduğu için sıfır değildir, ama ihmal edilebilir. Zaten öyle olmalıdır: iki model narin bir çubukta uyuşmuyorsa önce sonlu eleman modelini, özellikle de ağı kontrol edin."
    },
    {
      "k": "note",
      "t": "Kayma kilitlenmesi, başarısız olan bir elemanın klasik örneğidir. Saf bir yaklaşımla formüle edilmiş kalın plak dörtgeni, plak ince olduğunda olması gerekenden çok daha rijit hale gelir ve döşeme olduğundan daha kalınmış gibi davranır. Stabileo'daki MITC4 elemanı bunu önlemek için vardır: kayma birim şekil değiştirmelerini farklı biçimde interpole eder; böylece eleman kilitlenmez."
    },
    {
      "k": "link",
      "slug": "torsion-bredt-saint-venant",
      "t": "Teoriyi kalınlığa göre seçmek ve yanlış seçimin bedeli, burulmanın da gündeme getirdiği sorudur:"
    },
    {
      "k": "h",
      "t": "Tek programda iki model"
    },
    {
      "k": "p",
      "t": "Çubuk elemanları ve kabukları aynı programda bulundurmak yeni bir şey değil. SAP2000, ETABS, Robot ve midas ikisini tek bir modelde birleştirir ve bu, profesyonel yazılım için temel düzeydir. Ancak hesapladıklarını açıklamak için tasarlanmamışlardır. Diğer uçta Ftool ve MASTAN2 gibi eğitim araçları çubuk analizini çok iyi öğretir ama sonlu elemanlara geçmez."
    },
    {
      "k": "p",
      "t": "Stabileo iki modu tek programda sunar. Temel mod çubuk elemanlarla çözer ve rijitlik yöntemini dokuz adımda gösterir: serbestlik derecesi numaralandırması, yerel matrisler, dönüşüm, birleştirme, yük vektörü, sınır koşulları, çözüm, mesnet tepkileri ve iç kuvvetler. PRO mod ise sonlu elemanlarla, çubuk elemanların yanında MITC4 kabuklar ve DKT plaklar kullanarak çözer. İncelediğimiz araçlar arasında, analizin nasıl çalıştığını öğrenip ardından araç değiştirmeden daha kapsamlı bir modele uygulamanıza olanak tanıyan başka bir program bulamadık."
    },
    {
      "k": "embed",
      "query": "example=deep-beam-bar",
      "label": "Temel modda L/h = 3 olan kiriş: 6 m açıklık, 20×200 cm kesit ve 10 kN/m, iki çubuk eleman olarak modellenmiş. İmleci kirişin ortasına getirdiğinizde Euler-Bernoulli formülüyle örtüşen “uz: -0.042 mm” değeri görünür."
    },
    {
      "k": "embed",
      "query": "example=deep-beam-shell",
      "mode": "pro",
      "label": "Aynı kiriş PRO modda, 25 cm'lik 192 MITC4 elemanlı bir kabuk olarak modellenmiş. Analiz → Yer değiştirmeler altında 113 numaralı düğüm (açıklık ortasında, yüksekliğin ortasında) “-5.19e-5” m, yani 0,0519 mm gösterir. Yukarıdaki tablo daha sık bir ağ kullanır ve 0,0521 mm verir. PRO beta aşamasındadır."
    },
    {
      "k": "link",
      "slug": "conceptual-side-advanced-tools",
      "t": "Ücretsiz araçların neyi açıkladığı ve neyi açıklamadığı, araç araç:"
    },
    {
      "k": "h",
      "t": "Özetle"
    },
    {
      "k": "ol",
      "items": [
        "Prizmatik bir çubuk için rijitlik yöntemi, sonlu elemanların tam özel halidir. Seçtiğiniz şey modeldir.",
        "Doğru eksenli bir çubuk ağ gerektirmez. Bölmek sonucu değiştiriyorsa başka bir şey yanlıştır.",
        "L/h ≈ 5'in altında çubuk modeli sehimi %8'den fazla, 3'ün altında ise %19'dan fazla eksik hesaplar. Kirişi her zaman daha rijit yapar.",
        "Hiperstatik bir yapıda bu hata yüklerin nasıl dağıldığını değiştirir. Kirişlerden önce basık perdeleri kontrol edin.",
        "Kirişsiz döşemeler, boşluklu perdeler ve mesnetlere yakın yükler, bir çubuk modelinin cevaplayamayacağı sorular doğurur.",
        "Çubuğun narin olduğu yerde iki model uyuşmak zorundadır. Uyuşmuyorlarsa ağı kontrol edin."
      ]
    },
    {
      "k": "note",
      "t": "Sayıların nasıl hesaplandığı: hepsi Stabileo'nun motorundan, uygulamanın kullandığı motorun aynısından gelir. Çubuk elemanlar: Euler-Bernoulli, mesnetler eksen üzerinde. Kabuklar: kiriş düzleminde MITC4, yükseklik boyunca 24 eleman (16 eleman dördüncü haneyi değiştirir), yük üst kenarda ve mesnetler uç kesitlerin tüm yüksekliğine yayılmış. Perdeler: aynı formülasyon, taban tüm uzunluğu boyunca ankastre ve yatay yük üst kenar boyunca yayılmış. Kayma terimi ve düzlem elastisite çözümü, elle kontrol edebileceğiniz kapalı çözümlerdir."
    }
  ]
};

export default body;
