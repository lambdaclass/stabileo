import type { PostBody } from '../../types';

const body: PostBody = {
  "title": "A determinizmushatár: miért nem szabad, hogy egy MI-ágens számoljon",
  "excerpt": "Egy nyelvi modell nem tudja garantálni, hogy egy szám helyes. A szerkezettervezésre javasolt architektúránkban az ágens értelmez és javasol, minden szám pedig egy ellenőrzött megoldóból származik.",
  "blocks": [
    {
      "k": "p",
      "t": "A kereskedelmi szoftverek évtizedei gyorssá tették a szerkezetszámítás tisztán numerikus részét. Egy merevségi mátrix összeállítása és egy lineáris egyenletrendszer megoldása jól ismert és olcsón kiszámítható feladat. A mérnök ideje másra megy el: a modell felépítésére, újraépítésére minden építészeti változásnál, a terhek és kombinációk megadására, minden elem szabvány szerinti ellenőrzésére, valamint a statikai számítás és a rajzok elkészítésére."
    },
    {
      "k": "p",
      "t": "A szűk keresztmetszet ez a számítás körüli kézi munka. A modell felépítése, módosítása, ellenőrzése és dokumentálása az, ahol egy MI-ágens segíthet, egy feltétellel: magához a számításhoz soha nem nyúlhat."
    },
    {
      "k": "h",
      "t": "Amit egy nyelvi modell nem tud garantálni"
    },
    {
      "k": "p",
      "t": "Egy nyelvi modell valószínűségi alapon generál szöveget. Nincs tudása a fizikáról vagy arról, hogyan viselkednek a valós rendszerek, és hallucinálhat: hihetőnek hangzó, de értelmetlen válaszokat adhat. A szerkezetszámításban ez a kockázat nagyon is kézzelfogható. A modellezés térbeli gondolkodást és topológiai következetességet igényel, és ha egy modell több lépésben épül fel, a hibák halmozódnak."
    },
    {
      "k": "p",
      "t": "A legerősebb kényszer azonban a szakmai gyakorlatból fakad. Minden szerkezeti eredményt aláírnak, az aláírással járó szerzőséggel és jogi felelősséggel. Az a szám, amely egy oszlopot méretez, a jogosultsággal rendelkező mérnök vállalása, aki jóváhagyja. Egy ágens, amely ellenőrizetlen eredményeket ad át, a szakemberre hárítja annak kockázatát, hogy olyan számítást írjon alá, amelyet senki sem ellenőrzött."
    },
    {
      "k": "quote",
      "t": "A helyességnek a megoldó tulajdonságának kell lennie, nem a nyelvé."
    },
    {
      "k": "h",
      "t": "A determinizmushatár"
    },
    {
      "k": "p",
      "t": "Az architektúra elválasztja a természetes nyelvű gondolkodást a numerikus számítástól. Az ágens terveket és forgatókönyveket javasol, de egy eredmény csak akkor számít, ha olyan programból jött ki, amelyet az ágens nem módosíthat, és amely a feladat fizikáját kódolja. A modell kiválasztja, melyik determinisztikus eszközt hívja meg és milyen paraméterekkel, és azzal dolgozik, amit az eszköz visszaad. Soha nem állít elő saját számot, és soha nem talál ki geometriát."
    },
    {
      "k": "p",
      "t": "A gyakorlatban ehhez három réteg kell. A szándékréteg az ágens: értelmezi a természetes nyelvet, pontosító kérdéseket tesz fel, és típusos műveleteket ad ki. A determinisztikus számítási réteg tartalmaz mindent, ami mérnöki adatot állít elő: a megoldót, a szabvány szerinti ellenőrzéseket végző CIRSOC-modulokat és a generátorokat, amelyek egy szerkezettípusból teljes modellt bontanak ki. A dokumentációs réteg a már kiszámított eredményekből jelentéseket, rajzokat és mennyiségkimutatásokat készít."
    },
    {
      "k": "p",
      "t": "Ez nem új minta. Uralja a mérnöki ágensekről szóló friss szakirodalmat, és szomszédos területeken is megjelenik: a programozó ágensek azért működnek, mert egy fordító és egy tesztsor megmondja nekik, hogy a kód lefordul-e és átmegy-e, az AlphaProof pedig azért bizonyít tételeket, mert egy formális ellenőrző egyetlen hibát sem enged át. Mi tudatosan, tervezési elvként alkalmazzuk."
    },
    {
      "k": "h",
      "t": "Mit garantál a határ, és mi esik kívül rajta"
    },
    {
      "k": "p",
      "t": "Érdemes pontosan megmondani, mit garantál ez a határ, és mit hagy ki. Amit garantál:"
    },
    {
      "k": "ul",
      "items": [
        "Minden szám, amelyet az ágens közöl, visszavezethető egy konkrét megoldóeredményre: kombinációra, metszetre, elemre.",
        "Minden MI-kimenetet az importálás előtt a modellséma alapján validálunk, és elutasítunk, ha hibás formátumú vagy ismeretlen mezőket tartalmaz.",
        "Ha az MI-szolgáltatás nem elérhető, a megoldó, a szerkesztő és a szabvány szerinti ellenőrzések tovább működnek."
      ]
    },
    {
      "k": "p",
      "t": "Amit nem garantál: hogy az idealizált modell a megfelelő a valós feladatra (ez mérnöki döntés), hogy a terv optimális, hogy a terhek és a feltevések teljesek, vagy hogy a szabvány értelmezését nem kell felülvizsgálni."
    },
    {
      "k": "note",
      "t": "A határ lehetővé teszi annak ellenőrzését, honnan származik minden eredmény; azt nem garantálja, hogy a felállított modell helyesen képviseli a valós feladatot. Az ágens úgy dolgozik, mint egy szerkesztő asszisztens: módosítást javasol, a felhasználó összefoglalót lát arról, mi fog megváltozni, és alkalmazhatja, újrapróbálhatja vagy elvetheti. Minden alkalmazott módosítás egyetlen visszavonási lépés."
    },
    {
      "k": "h",
      "t": "Egy eset, amelyben a modellt újra ki kell számítani"
    },
    {
      "k": "p",
      "t": "A mérnök leír egy 6 m fesztávú, 4 m magas, befogott oszloplábú vasbeton keretállást, a gerendán megoszló teherrel. Az ágens rákérdez arra, ami hiányzik: acél vagy beton? Befogott vagy csuklós oszlopláb? Van-e vízszintes teher? Ezután kiadja a keretet létrehozó műveletet. A háttérrendszer ezt determinisztikusan bontja ki egy 4 csomópontból, 3 elemből és 6 szabad szabadságfokból álló modellé. A terv H-21 betont, kezdetben 25×40 cm-es gerendát, 30×30 cm-es oszlopokat és a gerendán 30 kN/m terhet használ."
    },
    {
      "k": "p",
      "t": "A modell kiszámítása után mindkét oszlop 90 kN függőleges támaszerőt kap, és a globális egyensúly pontosan teljesül: ΣRz = 180 kN = q·L. A gerenda mértékadó nyomatéka Mu = 80,8 kN·m a fesztáv közepén. A 3Ø16 vasalású 25×40-es gerenda CIRSOC 201 szerinti hajlítási ellenőrzése φMn = 73,3 kN·m teherbírást ad, így a gerenda nem felel meg."
    },
    {
      "k": "img",
      "base": "blog/determinism-portal",
      "w": 1600,
      "h": 1000,
      "alt": "Stabileo Alap mód egy 6 m széles, 4 m magas, befogott oszloplábú betonkeretállással, kiszámítva a gerendán működő 30 kN/m alatt. A nyomatéki ábrán a fesztáv közepén 80,8 kN·m, a gerendavégeken −54,2 kN·m, az oszloplábaknál 27,0 kN·m olvasható.",
      "caption": "Az e szakaszban szereplő keret a Stabileóban (H-21, 30×30-as oszlopok, 25×40-es gerenda): a megoldó a fent idézett 80,8 kN·m-es fesztávközépi nyomatékot adja."
    },
    {
      "k": "table",
      "caption": "A keret gerendájának hajlítási ellenőrzése a javítás előtt és után.",
      "head": [
        "Állapot",
        "Keresztmetszet",
        "Vasalás",
        "Mu [kN·m]",
        "φMn [kN·m]",
        "D/C",
        "Megfelel"
      ],
      "rows": [
        [
          "Kezdeti",
          "25×40 cm",
          "3Ø16",
          "80,8",
          "73,3",
          "1,10",
          "Nem"
        ],
        [
          "Javított",
          "30×55 cm",
          "3Ø16",
          "105,6",
          "108,6",
          "0,97",
          "Igen"
        ]
      ]
    },
    {
      "k": "p",
      "t": "Nézze meg az Mu oszlopot. Ha a gerendát 25×40-ről 30×55-re növeljük, az igénybevétel 80,8-ről 105,6 kN·m-re nő. Statikailag határozatlan keretben a statika rögzíti a végnyomaték és a fesztávközépi nyomaték összegét; a merevség csak azt változtatja meg, hogyan oszlik meg ez az összeg. Az oszlopaihoz képest merevebb gerenda kevesebb végbefogást kap tőlük, és inkább kéttámaszú gerendaként viselkedik, így a fesztávközépi nyomatéka, amely itt a mértékadó, megnő."
    },
    {
      "k": "quote",
      "t": "Egy ágens, amely újraszámítás nélkül becsülné meg a hatást, tévedne, és közben ugyanolyan meggyőzően hangzana."
    },
    {
      "k": "p",
      "t": "A példa megmutatja, miért kell a modellt újra kiszámítani, az új keresztmetszet teherbírásának újraszámításán túl. Határozatlan szerkezetben egy keresztmetszet növelése megváltoztatja az igénybevételek eloszlását, és az igénybevétel éppen abban az elemben nőhet, amelyet tehermentesíteni akartunk."
    },
    {
      "k": "h",
      "t": "Egy oszlop eltávolítása egy már megtervezett épületből"
    },
    {
      "k": "p",
      "t": "A második eset egy négy 5 m-es mezőből és három 3 m-es szintből álló keretből indul, befogott oszloplábakkal, 25×50 cm-es gerendákkal (4Φ16), 35×35 cm-es oszlopokkal és minden gerendán 25 kN/m-rel: 20 csomópont, 27 elem és 45 szabad szabadságfok. Kiszámítás és ellenőrzés után minden gerenda bőven megfelel."
    },
    {
      "k": "p",
      "t": "Egy építészeti változtatás eltávolít egy belső földszinti oszlopot. A szerkesztési művelet szerkezeti integritási validációval törli, és a modellt újra kiszámítjuk; a globális egyensúly előtte és utána is teljesül (ΣRz = 1500 kN). Az oszlopra támaszkodó gerendák most 10 m-t hidalnak át, és a fölöttük lévő gerendákkal együtt átveszik az elvesztett megtámasztást. Hat gerenda lépi túl a D/C = 1 értéket."
    },
    {
      "k": "table",
      "caption": "Az épület mértékadó gerendája a három állapotában.",
      "head": [
        "Állapot",
        "Keresztmetszet",
        "Mu [kN·m]",
        "φMn [kN·m]",
        "D/C",
        "Megfelel"
      ],
      "rows": [
        [
          "Ép",
          "25×50 (4Φ16)",
          "54,2",
          "125,3",
          "0,43",
          "Igen"
        ],
        [
          "Oszlop eltávolítva",
          "25×50 (4Φ16)",
          "203,9",
          "125,3",
          "1,63",
          "Nem"
        ],
        [
          "Újraméretezve",
          "30×65 (5Φ20)",
          "189,8",
          "313,7",
          "0,61",
          "Igen"
        ]
      ]
    },
    {
      "k": "p",
      "t": "A mértékadó gerenda nyomatéka csaknem a négyszeresére nő. Az érintett gerendákban 30×65 cm-rel és 5Φ20-szal, valamint egy új számítással minden gerenda újra megfelel. Az eset azt is megmutatja, hogy egy olyan változtatás, amely kézzel sok elem újramodellezését, újraszámítását, újraellenőrzését és újrarészletezését jelenti, egy rövid beszélgetésben elintézhető, úgy, hogy minden szám visszavezethető a megoldóra, és a mérnök jóváhagyásától függ."
    },
    {
      "k": "h",
      "t": "Négy tervezési döntés a határ mögött"
    },
    {
      "k": "ol",
      "items": [
        "Típusos műveletek szabad kódgenerálás helyett. Több korábbi rendszerben a modell Python-szkripteket ír, amelyeket aztán egy külső megoldón futtatnak. Itt az ágens kimenete hívások zárt halmazára korlátozódik, explicit bemeneti és kimeneti szerződésekkel, és mindegyiket futtatás előtt egy séma alapján validáljuk. Ez a határ szűkebb, mint a tetszőleges kód, és könnyebb auditálni.",
        "Saját megoldó, nem egy réteg valaki más megoldója fölött. A motort a nulláról írtuk Rustban, külső lineáris algebrai függőségek nélkül, és saját ellenőrző tesztsora van analitikus megoldásokkal és referencia-benchmarkokkal szemben: mintegy 6800 sikeres teszt, valamint ugyanazokon a modelleken egy kereskedelmi programmal végzett összevetés, 0,1 % alatti eltérésekkel.",
        "Natív szabványmegfelelés. Ellenőrzések a CIRSOC 201 és 301 szerint, amelyeket egyetlen nyílt forráskódú szoftverben sem találtunk natívan implementálva. A betonmodul implementált és tesztelt; az acélmodul még csak a frontendben él, és nincs külön tesztsora. Ezt azért mondjuk ki, hogy ne túlozzuk el, mennyire érett.",
        "Böngészőben fut. A motor WebAssemblyre fordul, és helyben, a felhasználó gépén fut, számítási szerver és telepítés nélkül."
      ]
    },
    {
      "k": "note",
      "t": "Frissítés, 2026. október 20.: a 0.2.0-s verzió óta a motor minden CIRSOC 301 szerinti acélellenőrzést újraellenőriz (az általa meg nem erősített eredmény nem megfelelőként vagy nem ellenőrzöttként jelenik meg), a modult pedig publikált, kidolgozott példákkal szemben teszteljük; független felülvizsgálatig kísérleti jelölést kapnak. A bejegyzés számai a publikált cikkből valók, a 2026. augusztusi verzióval számítva, a betonellenőrzések 0.2.0-s javításai előtt (SA-2026-002 figyelmeztetés); úgy idézzük őket, ahogy ott szerepelnek."
    },
    {
      "k": "h",
      "t": "A tesztelt megoldótól a bizonyítottig"
    },
    {
      "k": "p",
      "t": "A határ garantálja, hogy az ágens minden állítása visszavezethető egy megoldókimenetre. Ez a garancia egy korlátot is örököl: a megoldó azért megbízható, mert alaposan tesztelt, de a helyessége nincs formálisan bizonyítva. Egy tesztsor, bármilyen alapos, csak azokat az eseteket fedi le, amelyekre a szerzői gondoltak."
    },
    {
      "k": "p",
      "t": "Ebben az összefüggésben ez még fontosabb. Egy ágens modelleket épít, több lépésben módosítja őket, és az eredmények alapján új műveleteket javasol; közben a megoldó olyan bemeneteket kap, amelyeket egyetlen mérnök sem nézett át, mielőtt a motorhoz értek. Ha a motor egy szélső esetben (közel szinguláris merevségi mátrix, elfajult geometria, szélsőséges teherkombináció) hibásan viselkedik, az ágens figyelmeztetés nélkül idézheti az eredményt."
    },
    {
      "k": "p",
      "t": "Két technika szűkítheti ezt a rést. A tulajdonságalapú fuzzing ezerszámra generál érvényes véletlen modelleket, és olyan invariánsokat ellenőriz, amelyeknek bármely bemenetre teljesülniük kell:"
    },
    {
      "k": "ul",
      "items": [
        "Globális egyensúly: ΣR = P, a geometriától, az anyagoktól és a támaszoktól függetlenül.",
        "A merevségi mátrix szimmetriája: K = Kᵀ, konstrukció szerint.",
        "K pozitív definitsége minden mechanizmus nélküli szerkezetre.",
        "Invariancia merevtest-transzformációkkal szemben: egy modell eltolása vagy elforgatása nem változtatja meg az igénybevételeket."
      ]
    },
    {
      "k": "p",
      "t": "A formális verifikáció a másik oldalról közelít ugyanehhez a réshez: megírja ezeknek a tulajdonságoknak a matematikai specifikációját, és egy bizonyításasszisztenssel, például a Lean 4-gyel bizonyítja, hogy az implementáció kielégíti. A tesztelés hibákat találhat; a formális verifikáció megmutathatja, hogy a specifikált tartományon belül nincsenek hibák. A kettő kiegészíti egymást: ha a fuzzer olyan bemenetet talál, amely megsért egy tulajdonságot, az a tulajdonság bizonyításjelölt lesz."
    },
    {
      "k": "note",
      "t": "A cél egy olyan megoldó, amelynek kritikus numerikus magja formálisan verifikált. Ekkor a determinizmushatár matematikai garanciává válna: a statikai számításban idézett minden szám egy bizonyítottan helyes számításra lenne visszavezethető."
    },
    {
      "k": "h",
      "t": "Hol tart ez ma"
    },
    {
      "k": "p",
      "t": "Zárásként: mi érhető el, és mi nem. A megoldó, a szerkesztő, a CIRSOC-ellenőrzések, az oktatási mód, valamint a jelentés- és rajzkészítés ma a böngészőben fut a stabileo.com-on, telepítés és fiók nélkül. Az ágensréteg aktív fejlesztés alatt áll: útvonalai fejlesztési és tesztkörnyezetben a saját háttérrendszerünkön futnak, ugyanazon a megoldón és ugyanazokkal a számokkal, mint minden más, de ez a háttérrendszer még nem része a nyilvános oldalnak."
    },
    {
      "k": "p",
      "t": "A zárt, megoldót a hurokban tartó ciklus, amelyben az ágens emberi beavatkozás nélkül javasol, számít, értékel és módosít, szerepel az ütemtervben, de nincs implementálva. A natív szabványlefedettség a CIRSOC 201-re és 301-re korlátozódik; a többi jövőbeli munka."
    },
    {
      "k": "p",
      "t": "A CAD átvette a rajzolás mechanikus részét, a táblázatkezelő az ismétlődő számolást, a mérnöki ítélőképesség pedig a mérnöknél maradt. Az ágens a következő lépés ezen a vonalon: átvállalja a modell felépítését és módosítását, a terhek bevitelét, az ellenőrzések futtatását és a dokumentáció előkészítését. Mindez semmilyen felelősséget nem ruház át: az aláírt szám továbbra is a mérnöké."
    },
    {
      "k": "note",
      "t": "Ez az írás a JAIE 2026-on bemutatott „Desarrollo de un agente estructural de cálculo sobre un solver verificado” (Chesta, Bertero, Carrone és Kingston) című cikk átdolgozása. Az idézett számok a Stabileo megoldójának és CIRSOC 201 moduljának kimenetei, abból a cikkből átvéve."
    }
  ]
};

export default body;
