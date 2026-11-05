import type { PostBody } from '../../types';

const body: PostBody = {
  title: 'Stabileo Basic’te yapı statiğini adım adım öğrenin',
  excerpt:
    'Basic’in içinde artık bir ders var: bir yöntem seçiyorsunuz, uygulama yapınızı ya da hazır bir örneği kâğıt üzerinde yapıldığı gibi adım adım çözüyor. Statik, kuvvet ve deplasman yöntemleri, tesir çizgileri, ikinci mertebe ve burkulma, plastik hesap ve dinamik. Ücretsiz, tarayıcıda.',
  blocks: [
    { k: 'p', t: 'Bir hesap programı sonuçları bir anda verir. Öğrenmek için tersi gerekir: her sayının nereden geldiğini, tahtada yapıldığı sırayla görmek. Stabileo Basic’in içinde artık yaşayan ders, “Açıklamalı adım adım”, tam olarak budur. Bir yöntem seçiyorsunuz, uygulama onu yapınıza uyguluyor ve o modelin denklemleri, şekilleri ve sayılarıyla adım adım geliştiriyor, sonunda da sonucu matris yöntemiyle karşılaştırıyor.' },
    { k: 'p', t: 'Dersi inşaat mühendisi Bautista Chesta (FIUBA) yazdı ve altı ünite halinde geliyor: ortak temel, statik ve klasik yöntemler, tesir çizgileri, ikinci mertebe ve burkulma, plastik hesap ve dinamik. Basic’in tamamı gibi ücretsizdir: tarayıcıda açılır, hiçbir şey kurmak ya da hesap açmak gerekmez, metinler İspanyolca, İngilizce, Portekizce, Almanca, Fransızca ve Türkçe olarak mevcuttur.' },

    { k: 'h', t: 'Nasıl açılır' },
    {
      k: 'ol',
      items: [
        'stabileo.com/app/basic adresine gidin.',
        'Gelişmiş’e dokunun. Telefonda alttaki şeritte yer alır.',
        '“Keşfet ve öğren” altında Açıklamalı adım adım’a dokunun. Konulara göre gruplanmış yöntem kataloğu açılır.',
        'Her yöntem, denemek için yapının nasıl olması gerektiğini ve modelinizin buna uyup uymadığını söyler; ? ne yaptığını açıklar. “Bir örnek aç” uygun bir model yükler ve yöntemi açar; “Aç” yöntemi ekrandaki modele uygular.',
        'Sonraki ve Önceki adımlar arasında gezinir, numaralı sekmeler birine atlar. Yöntemler kataloğa geri döner.',
      ],
    },
    { k: 'img', base: 'blog/course-catalog', w: 1600, h: 1000, alt: 'Yan panelde “Açıklamalı adım adım” kataloğu açık olan Stabileo Basic: yöntemler rijitlik yöntemi, esneklik yöntemi ve sürekli kirişler altında gruplanmış, her birinde yapının nasıl olması gerektiği ile Aç ve Bir örnek aç düğmeleri var.', caption: 'Katalog: her yöntem modelin neye ihtiyaç duyduğunu söyler ve buna uyan bir örnekle gelir.' },
    { k: 'note', t: 'Açıklamalı yöntemler düzlem modellerle çalışır. 3D çalışma alanında yalnızca iki sihirbaz, rijitlik ve esneklik, açılır; başka bir yöntemde “Bir örnek aç” önce düzleme geçer.' },

    { k: 'h', t: 'Statik, kuvvet yöntemi ve deplasman yöntemi' },
    { k: 'p', t: 'En büyük ünite budur: üç moment denklemi ve Cross yöntemiyle sürekli kirişler, açı yöntemi, yanal ötelemeli ve ötelemesiz moment dağıtma ve kinematik bilinmeyenlerle deplasman yöntemiyle çerçeveler, düğüm noktaları, kesim (Ritter) ve uygunluk matrisiyle kafes kirişler, ve çift integrasyon, moment alanı, virtüel iş ve Castigliano ile şekil değiştirmeler. Hiperstatiklik derecesi her yerde aynı şekilde sayılır (düzlem çerçevede GH = 3·m + r − 3·n − c, kafes kirişte GH = m + r − 2·n), iç mafsallar açıkça yazılır ve dış ile iç kısma ayrılır.' },
    { k: 'p', t: 'Kuvvet yönteminde esas sistemi siz seçersiniz: dereceye eşit sayıda bilinmeyen olana kadar mesnetleri ya da çubuk uçlarını serbest bırakırsınız, seçiminiz bir mekanizma bırakırsa uygulama çözmek yerine nedenini açıklar. Ardından eksenel rijitlik dahil ya da hariç, çubuklar ve yaylar terim terim yazılarak dokuz adımı izler. Virtüel iş; yaylar, mesnet çökmeleri ve sıcaklık dahil yer değiştirmeleri, dönmeleri ve göreli hareketleri hesaplar. Denemek için: Örnekler → Portal çerçeve, Gelişmiş → Açıklamalı adım adım → Kuvvet (esneklik) yöntemi → Aç.' },
    { k: 'img', base: 'blog/course-force-method', w: 1600, h: 1000, alt: 'Portal çerçeve örneğinde kuvvet yöntemi sihirbazı, esas sistem adımında: sağ mesnedin üç tepkisi serbest bırakılmış ve uygulama seçilen üç hiperstatik bilinmeyeni gösteriyor.', caption: 'Kuvvet yöntemi: esas sistemi siz seçersiniz, uygulama seçimin işe yarayıp yaramadığını söyler.' },

    { k: 'h', t: 'Tesir çizgileri' },
    { k: 'p', t: 'Örnekler → Sürekli kiriş, ardından Gelişmiş → Tesir çizgisi, ve kirişte bir kesite dokunun. Mesnet tepkileri, moment, kesme kuvveti, normal kuvvet, yer değiştirmeler ve dönmeler için, çubuk uçları dahil herhangi bir kesitte çizgiler vardır ve kesit sonradan taşınabilir. Panel, uç değerleri için çizgiyi sabit yük g, hareketli yük q ve tekil yük P ile yükler, çubuk boyunca zarfı çizer ve Müller-Breslau şekilleriyle adım adım açıklamayı açar. “Yükleme durumları ve zarflar” en büyük ve en küçük etkileri bulur. Moment çizgisi, statik diyagramdaki gibi alt lifi çektiği yerde pozitiftir.' },
    { k: 'img', base: 'blog/course-influence', w: 1600, h: 1000, alt: 'Sürekli kiriş örneğinde tesir çizgileri yüklenerek elde edilen moment zarfı, kırmızı en büyük ve mavi en küçük; panel sol mesnetten 2 m uzaktaki moment çizgisini g = 10 ve q = 5 kN/m ile yüklüyor: en büyük 20,00 kN·m ve en küçük 10,00 kN·m, her biri doğrudan bir çözümle doğrulanmış.', caption: 'Uç değerleri için yüklenmiş moment tesir çizgisi ve kiriş boyunca zarf.' },

    { k: 'h', t: 'İkinci mertebe ve burkulma' },
    { k: 'p', t: 'Yüklü bir çerçeveyle Gelişmiş → P-Δ (2. mertebe) ya da Pcr (Euler). “Nasıl hesaplanır” altında yöntemi seçersiniz: φ stabilite fonksiyonları, geometrik matris ya da kiriş matrisi (P/L), ve her çubuğun kaç elemana bölüneceği. P-Δ iterasyonlarını gösterir; B₂ = 1/(1 − 1/λ₁), aynı modelin aynı ayrıklaştırmadaki burkulmasından gelir ve en büyük yer değiştirme büyütmesinin yanında gösterilir. Burkulma varsayılan olarak çubuk başına dört eleman kullanır ve ayrıklaştırma katsayıyı temsil edemiyorsa onu bildirmek yerine reddeder. Katalogda “İkinci mertebe ve burkulma” grubu dört yöntem için hazırlanmış bir çerçeveyle gelir.' },

    { k: 'h', t: 'Plastik hesap' },
    { k: 'p', t: 'Örnekler → Portal çerçeve, ardından Gelişmiş → Plastik göçme. Uygulama her yük adımını, λ–yer değiştirme eğrisini, plastik dönmeleri ve model üzerinde çizilmiş, virtüel işle doğrulanmış mekanizmayı gösterir. Bir mekanizmayı kendiniz de seçebilirsiniz: mafsalların yerine dokunursunuz, uygulama λ değerini hesaplar ve uygun olup olmadığını söyler. Statik ve kinematik yöntemler katalogda açıklamalı belgeler olarak yer alır. Adım adım analiz göçmeyi çözemezse bir katsayı vermek yerine bunu söyler.' },
    {
      k: 'table',
      caption: 'Portal çerçeve örneği: uygulamanın hesapladığı göçme ve elle seçilmiş bir yanal ötelenme mekanizması.',
      head: ['Mekanizma', 'λ'],
      rows: [
        ['Adım adım analizin bulduğu', '71,30'],
        ['Elle seçilmiş yanal ötelenme, iki kolonun üstünde ve altında mafsallarla', '168,75'],
      ],
    },
    { k: 'p', t: 'Elle seçilen yanal ötelenme daha yüksek bir katsayı verir ve uygulama bunun neden göçme olmadığını açıklar: bu mekanizmada moment bir kesitte Mp’yi aşar, dolayısıyla λ yalnızca bir üst sınırdır; momentler ölçeklenerek bir alt sınır da elde edilir. Bu, ekranda ve modelin kendi sayılarıyla kinematik teoremdir.' },
    { k: 'img', base: 'blog/course-plastic', w: 1600, h: 1000, alt: 'Portal çerçeve örneğinde göçme mekanizması çizilmiş, dönmeleriyle dört mafsal; Plastik göçme panelinde λ–yer değiştirme eğrisi ve λ = 71,296 veren mekanizmanın virtüel işi görünüyor.', caption: 'Portal çerçevenin plastik göçmesi: λ–yer değiştirme eğrisi ve mekanizma.' },

    { k: 'h', t: 'Dinamik' },
    { k: 'p', t: 'Gelişmiş → Dinamik, dinamik panelini açar. Tek serbestlik dereceli bir sistem modelden alınır; serbest titreşimi ve harmonik bir yük altındaki zorlanmış yanıtıyla. Çok serbestlik dereceli sistem, kayma çerçevesi dahil, modal süperpozisyonla çözülür. Kütle modelleri, toplanmış ya da tutarlı ve yoğunlaştırmalı, motorun frekanslarıyla karşılaştırılır; düğümlere dönme ataletiyle birlikte noktasal kütleler konabilir ve modal analiz de bunları kullanır. Kataloğun “Yapı dinamiği” grubunda “Bir örnek aç”, ucunda kütle olan bir kolonu, iki katlı bir kayma çerçevesini ya da yayılı kütle için bir konsol kirişi yükler.' },
    { k: 'img', base: 'blog/course-dynamics', w: 1600, h: 1000, alt: 'Ucunda kütle olan konsol bir kolon ve modelden alınan tek serbestlik dereceli sistemde açık dinamik paneli: k = 2250 kN/m, m = 5 t, ω = 21,21 rad/s, sönümlü serbest titreşim ve harmonik bir kuvvete yanıt ile β katsayısı.', caption: 'Tek serbestlik derecesi: harmonik bir kuvvet altında ucunda kütle olan kolon.' },

    { k: 'h', t: 'Katalogda neler var' },
    {
      k: 'table',
      caption: '“Açıklamalı adım adım” yöntemleri, gruplara göre, katalog sırasıyla.',
      head: ['Grup', 'Yöntemler'],
      rows: [
        ['Rijitlik yöntemi', 'Matris yöntemi, sihirbaz olarak'],
        ['Esneklik yöntemi', 'Kuvvet yöntemi, sihirbaz olarak'],
        ['Sürekli kirişler', 'Üç moment (Clapeyron); Cross'],
        ['Çerçeveler', 'Kinematik bilinmeyenler; yanal ötelemesiz ve ötelemeli moment dağıtma; açı yöntemi'],
        ['Kafes kirişler', 'Düğüm noktaları; kesim (Ritter); uygunluk matrisi'],
        ['Şekil değiştirmeler ve enerji', 'Çift integrasyon; moment alanı; virtüel iş; Castigliano; kesim yöntemiyle iç kuvvetler'],
        ['Tesir çizgileri', 'Tesir çizgisi'],
        ['İkinci mertebe ve burkulma', 'φ fonksiyonlarıyla ve geometrik matrisle ikinci mertebe; mod sayımıyla ve özdeğerlerle burkulma'],
        ['Plastik hesap', 'Kinematik yöntem; statik yöntem'],
        ['Yapı dinamiği', 'Tek serbestlik derecesi; modal ayrıştırmayla çok serbestlik derecesi; yayılı kütle'],
      ],
    },
    { k: 'p', t: 'Yapı dersi veriyorsanız olduğu gibi derste kullanabilirsiniz: model bir bağlantıyla paylaşılır ve her öğrenci onu kendi tarayıcısında, kendi dilinde açar. Bir adım anlaşılmıyorsa ya da bir sayı elle bulduğunuzla uyuşmuyorsa bize yazın: tam olarak bilmemiz gereken şey bu.' },
    { k: 'link', slug: 'conceptual-side-advanced-tools', t: 'Sınıf için düşünülmüş bir başka araç, bir yapının neden mekanizma olduğunu açıklayan kinematik analiz:' },
  ],
};

export default body;
