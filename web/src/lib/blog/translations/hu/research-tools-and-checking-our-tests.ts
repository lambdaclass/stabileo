import type { PostBody } from '../../types';

const body: PostBody = {
  "title": "Kutatás, eszközök és a saját tesztjeink ellenőrzése",
  "excerpt": "Amit az elmúlt napokban kiadtunk: futtatható kutatás, nyolc kalkulátor és magukra a referenciamodellekre vonatkozó ellenőrzések. Mi működik, mi volt hibás, és mit kell még átnézni.",
  "blocks": [
    {
      "k": "p",
      "t": "Az elmúlt napokban elindítottuk a Stabileo Researchöt és a Stabileo Toolst, és szigorítottuk a mögöttük álló ellenőrzéseket. A Stabileo ingyenes, nyílt forráskódú, mesterséges intelligenciával támogatott szerkezettervező szoftver, amelyet az Ergodic Group ad ki. A fejlesztést a LambdaClass végzi."
    },
    {
      "k": "h",
      "t": "Futtatható kutatás"
    },
    {
      "k": "p",
      "t": "Publikált szerkezetmérnöki cikkeket és klasszikus referenciafeladatokat teszünk elérhetővé a böngészőben, a Stabileo saját megjelenítőjével. Minden oldal megadja, mit reprodukál, hogyan ellenőriztük, és hol vannak az összevetés határai. Azokat az oldalakat, amelyeken még nyitott összevetések szerepelnek, folyamatosan kiegészítjük."
    },
    {"k": "img", "base": "blog/research", "w": 1600, "h": 1000, "alt": "A Stabileo Research oldala, „Kutatás a szerkezetmérnöki tudományban”, a „Kutatás, nem tervezőeszköz.” megjegyzéssel és az első futtatható bejegyzéssel, a Lee-kerettel (1968), a megrajzolt egyensúlyi úttal.", "caption": "stabileo.com/research: minden oldal megadja, mit reprodukál és hogyan ellenőriztük."},
    {
      "k": "p",
      "t": "Az élő cikkoldalak: Shauer (2025) fázismezős törésmechanika; Grossman és Boudaoud (2026) rugóhálózatok; Andreassen és mtsai (2011) topológiaoptimalizálás; Ferrari és Sigmund (2025) a Roorda-keret stabilitása; Pastrana és mtsai (2026) kötélhálók alakkeresése; Zmyślony, Khan és Biggins (2026) átpattanó ívek; valamint Fairclough és mtsai (2026) rácshéjak."
    },
    {
      "k": "p",
      "t": "A motor klasszikus feladatai: MacNeal–Harder, a héjak „akadálypályája”, Mattiasson elasztikája, Riks/Crisfield, Newmark, CQC, képlékeny tönkremenetel, a Navier-lemez, a Lee-keret és a DaDeppo–Schmidt-ív. Az oldalak megkülönböztetik az élő számítást a rögzített visszajátszástól, és megmutatják az összevetés határait. Ferrari Koiter-féle összevetése befejezetlen; a Fairclough-oldal egyetlen ötcsomópontos példát fed le; az átpattanó ív egyensúlyi ugrása nem tranziens szimuláció."
    },
    {
      "k": "p",
      "t": "Közzétesszük a hatókört és a bizonyítékokat, és nyilvánosan nézzük át őket. A kutatási eredmények nem tervezési eredmények, a referenciafeladatokkal való egyezés pedig nem tanúsítás."
    },
    {
      "k": "table",
      "caption": "Ma élesben:",
      "head": [
        "Kínálat",
        "Darab"
      ],
      "rows": [
        [
          "Futtatható cikkoldalak",
          "7"
        ],
        [
          "A motor referenciaoldalai",
          "10"
        ],
        [
          "Kalkulátorok",
          "8"
        ]
      ]
    },
    {
      "k": "h",
      "t": "A teszteket is ellenőrizni kell"
    },
    {
      "k": "p",
      "t": "Néhány oldal azért volt hibás, mert a tesztmodelljeink voltak hibásak. A motor minden referenciaoldala és a hozzá tartozó CI-teszt most ugyanazt az esetfájlt olvassa, így egy modelljavítás mindkettőt frissíti. Néhány ideiglenes összevetést a CI kifejezetten figyelmen kívül hagy, és ezek még nem akadályozzák a beolvasztást; ezeket az összevetéseket most fejezzük be."
    },
    {
      "k": "p",
      "t": "Kijavítottuk a Mattiasson-referenciákat és a tengelyirányú megnyúlás kezelését (#845), egy merev csomópontú keretet, amelyet csak normálerős rácsostartó-képlettel vetettünk össze (#846), valamint hibás héjtámaszokat és terhelési modelleket (#810). Átalakítjuk a referenciafeladatok felépítését, hogy ez a fajta hiba többé ne csúszhasson át. Az első rész már bent van: minden referenciafeladat egy specifikáció két független referenciával, amelyeknek egyezniük kell, valamint a működtetett teher, a támaszerők egyensúlya és a szimmetria automatikus ellenőrzésével, beleértve a fél modell és a teljes modell összevetését. Hozzáadjuk a konvergencia vizsgálatát három vagy több hálón, egy előjelhiba-tesztet, amely bizonyítja, hogy minden referenciafeladat elbukhat, és az alapkészlet mérnöki jóváhagyását."
    },
    {"k": "img", "base": "blog/research-mattiasson", "w": 1600, "h": 1000, "alt": "A Mattiasson-féle (1981) konzolelasztika referenciaoldala, Eredmények lap: u/L és v/L a PL²/EI függvényében, a Stabileo görbéivel és az analitikus referenciák köreivel, valamint az értékek táblázata a relatív hibákkal. Bal oldalt „5 ellenőrzésből 5 sikeres” és „Kutatás, nem tervezőeszköz.”", "caption": "A javított Mattiasson-oldal: a motor válasza két független analitikus referenciával összevetve."},
    {
      "k": "p",
      "t": "A mértékegységeket is beépítjük a típusrendszerbe (#864), így a kN/N vagy m/mm keveredések fordításkor kiderülnek. Az első szelet, a 2D keretek anyag- és keresztmetszeti útvonalára, november 3-án került be."
    },
    {
      "k": "h",
      "t": "2. kör: minden oldal újra átnézve"
    },
    {
      "k": "p",
      "t": "Ezután minden élő kutatási oldal egy második átnézésen ment át, három MI-modell egymás után végezte (Kimi, aztán Codex, aztán Claude), és minden megállapítást, amelyet ellenőrizni tudtunk, kijavítottunk. Tizenöt oldalt dolgoztunk át együtt, és november 4-én tettük közzé (#1068): hat cikket (Shauer, Pastrana, Ferrari, Zmyślony, Grossman és Fairclough) és kilenc motor-referenciafeladatot (Newmark, Riks/Crisfield, Navier, Lee, MacNeal–Harder, DaDeppo–Schmidt, a Horne nyomán készült képlékeny tönkremeneteli példa, SRSS/CQC és Mattiasson, amely harmadik kört is kapott). Egyetlen tűrést sem lazítottunk, és egyetlen tesztet sem töröltünk. A gyakorló mérnökök átnézése még hátravan."
    },
    {
      "k": "ul",
      "items": [
        "A MacNeal–Harder abszolút értékeket vetett össze, így egy rossz előjelű eredmény is megfelelt volna. A referenciák most előjelesek, és egy teszt minden esetre elutasítja a megfordított választ.",
        "A Riks/Crisfield a teher csökkenése nélkül is jelezhetett határpontot. A határponthoz most a konvergált lépések közötti csökkenés kell; az oldal azt mondja, hogy a futtatás túljut a felső határponton, nem azt, hogy „követi az átpattanást”, a tűrései pedig 5%-ról 5e-3 és 1e-5 közé szigorodtak.",
        "A Navier-oldal elmagyarázta az MITC4 hibáját ahelyett, hogy megmérte volna. Most egy független Reissner–Mindlin-sorral vetjük össze, és az MITC4 hibája merev megtámasztásnál 4×4-es hálón −1,951%-ról 32×32-es hálón −0,036%-ra csökken, másodrendben.",
        "Az oldalak megmondják, mivel vetjük össze őket. A Newmarkot pontos, zárt alakú megoldásokkal ellenőrizzük, nem „a szerző kódjával”; az SRSS/CQC módszerbemutató, nem a cikkbeli épület reprodukciója; a képlékeny tönkremeneteli korlátok a saját kézi levezetéseink, nem idézetek; a Lee-keret 1,83 kN-os referenciája egy publikált ábráról leolvasott érték, ezért csak egész százalékos eltéréseket állítunk."
      ]
    },
    {
      "k": "h",
      "t": "Telefonon és táblagépen"
    },
    {
      "k": "p",
      "t": "Az élő honlapon mérve a kutatási oldalak telefonon nem lógtak ki, de a kísérlet a teljes cikk alatt volt, a megjelenítő szűk volt (356×189 px egy négyzet alakú lemezhez), és minden oldalon 25–40 vezérlő volt 32 px alatt és 14–20 szövegelem 12 px alatt. Most a kísérlet közvetlenül a cím után következik, a megjelenítő a modellhez igazodik, a vezérlők legalább 44 px-esek, a szöveg legalább 12 px-es (#831)."
    },
    {"k": "img", "base": "blog/research-phone", "w": 1600, "h": 1000, "alt": "Két telefonos képernyőkép a Stabileo Researchről egymás mellett, 390 px szélesen. Bal oldalt a Pastrana és mtsai (2026) nyomán készült kötélhálós oldal, „Négy kötél, egy egyensúly”, a megjelenítővel közvetlenül a cím alatt; jobb oldalt a Navier-lemez referenciafeladata, amelynek megjelenítője kitölti a képernyő szélességét, és a lemez lefelé irányuló elmozdulását mutatja.", "caption": "Research telefonon: a kísérlet a cím után, és a képernyővel azonos szélességű megjelenítő."},
    {
      "k": "p",
      "t": "Egy állandó ellenőrzés a galériát és minden futtatható oldalt 360, 390, 844×390 és 810 px-en jeleníti meg, spanyolul, angolul és portugálul, és elbukik vízszintes túlcsordulásnál, kis vezérlőknél, kis szövegnél, vagy ha a megjelenítő hiányzik, túl kicsi vagy túl lent van. Az első futtatásai valódi hibákat találtak, és az elrendezéseket javítottuk, nem az ellenőrzést: a Mattiasson-megjelenítő fekvő telefonon 187 px magas volt, most 280 px, egy konvergenciaábra pedig 9 px-es feliratokat nyomtatott. Egy újratördelési teszt kimutatta, hogy a Shauer-oldal lapjai portugálul és törökül 360 px-en kilógtak."
    },
    {
      "k": "h",
      "t": "Nyolc kalkulátor, átjárással a szerkesztőbe"
    },
    {
      "k": "p",
      "t": "A Stabileo Toolsban most ingyenes kalkulátorok vannak kéttámaszú tartókhoz, konzolokhoz, oszlopok rugalmas kihajlásához, többtámaszú tartókhoz, egynyílású portálkeretekhez, síkbeli rácsos tartókhoz, mozgó teher hatásvonalaihoz és gerendák hajlítási sajátfrekvenciáihoz. Az éles motort használják, független klasszikus összevetéseket mutatnak, és megadják a feltevéseiket. Mindegyik megnyitja a modelljét a teljes szerkesztőben. Ezek számítóeszközök, nem teljes szabvány szerinti méretezési ellenőrzések."
    },
    {"k": "img", "base": "blog/tools", "w": 1600, "h": 1000, "alt": "A Stabileo Tools oldala, „Ingyenes mérnöki kalkulátorok”, a kéttámaszú tartó kalkulátorával az elején: megoszló teherrel terhelt gerenda a deformált alakjával és egy Megnyitás gombbal.", "caption": "stabileo.com/tools: nyolc kalkulátor az éles motoron."},
    {
      "k": "h",
      "t": "A hibás eredmények behatárolása"
    },
    {
      "k": "p",
      "t": "Minden ismert, hibás eredményt adó problémát behatárolunk: a motor elutasításai vagy figyelmeztetései az ismert hiba azonosítóját hordozzák ahelyett, hogy ellenőrizetlen számot adnának vissza (#807, beolvasztva november 5-én). Minden elutasítás tesztelve van, beleértve a nem támogatott, rúd- vagy héjkülpontosságot tartalmazó dinamikai modelleket is."
    },
    {
      "k": "p",
      "t": "A metamorf tesztek invarianciahibákat tártak fel: egyenértékű modelleket utasíthatott el a program elforgatás, tükrözés vagy mértékegység-skálázás után. Most minden változásnál lefuttatjuk a metamorf tesztcsomagot, hogy elkapjuk az ilyen regressziókat. Bevezetünk egy éjszakai futtatást véletlen modellekkel, amely a megállapításokat kiváltó ok szerint csoportosítja, és kiváltó okonként egy issue-t nyit."
    },
    {
      "k": "h",
      "t": "Azóta: november 1–3."
    },
    {
      "k": "ul",
      "items": [
        "A PRO számítási módja elkészült. A figyelmeztetés nélkül hibás eredmények javítva: a tehergenerátor már nem terheli födémként egy csarnok ereszét, egy szint szeizmikus súlya pedig most tartalmazza a héjként rajzolt födémeket és falakat, amelyeket korábban kihagyott (#1076).",
        "Az exportálás valódi épületeken is működik. A nagy Excel-munkalapokat soronként írja, és egy hatszintes épület jelentése négy perc helyett körülbelül tíz másodperc alatt készül el. Az „Exportált jelentés ellenőrzése” most a nyomtatott számokat is összeveti, nem csak az ujjlenyomatokat (#1076).",
        "A PRO kikapcsolható beépített súgót, mentési állapotjelzőt a fejlécben, számítás utáni jelentést, lemezeredményeket és a megosztott modellekhez csak olvasható megjelenítőt kapott „Duplikálás és szerkesztés” lehetőséggel (#1077, #1078).",
        "A független tanúsítású felső korlátja feletti kihajlási tényezőt most elutasítja, 2D-ben és 3D-ben (#817, 6-os eredményverzió). Mielőtt egy korábbi kihajlási tanúsítványra támaszkodna, futtassa újra a tanúsítást.",
        "A nem véges számokat tartalmazó, vagy olyan rudakat, támaszokat vagy terheket tartalmazó megosztási hivatkozásokat, amelyek valami hiányzóra mutatnak, megnyitás helyett elutasítja (#1058).",
        "Az invarianciacsomag most hat kiemelt analízist ellenőriz elforgatásra, tükrözésre és szuperpozícióra, közülük négyet egyenletes merevségskálázásra is (#1060)."
      ]
    },
    {
      "k": "h",
      "t": "Ellenőrzések, amelyek húsz perc alatt választ adnak"
    },
    {
      "k": "p",
      "t": "Mielőtt a main ágba kerülne, a Stabileo minden változása átmegy azokon az ellenőrzéseken, amelyeket érinthet, a motor változása pedig mindegyiken: motortesztek, webes egységtesztek, éles buildek, böngészős végponttól végpontig tartó tesztek, az eredmény-pillanatképek és a determinizmusellenőrzés. Egy biztonsági javítás csak olyan gyors, mint ezek az ellenőrzések, ezért november 4-én a sebességükön dolgoztunk. Előbb mértünk. Egy tiszta, 44–47 perces beolvasztási sor futtatásában a motor- és egységtesztek 8–15 perccel a vége előtt befejeződtek, így ha többet futtattunk volna belőlük párhuzamosan, semmit sem nyertünk volna. Az idő a kutatási csomagok egymás utáni buildelésére és a leglassabb végponttól végpontig tartó szeletre ment el. Miután ezek rövidebbek lettek, a leglassabb szelet az előkészítés miatt volt lassú: egy futtatásban a 16 percéből 7,2-t töltött tesztekkel és hat és felet böngészőcsomagok letöltésével egy lassú tükörszerverről."
    },
    {
      "k": "ul",
      "items": [
        "Egyszer buildelni, és azt tesztelni, ami elkészült. Az éles build tesztjei még öt saját buildet készítettek, ebből négyet ugyanarról a fáról, amelyet a CI éppen lebuildelt; ez a négy most azt a buildet olvassa (#1411). Minden build bélyegzőt hordoz mindarról, amiből készült, és egy teszt elbukik, sosem ugrik át, ha a bélyegző nem egyezik azzal a fával, amelyen fut.",
        "Gyorsítótárazás bemenet szerint. Minden kutatási csomag a saját bemeneteiből képzett kulcs alatt kerül gyorsítótárba, beleértve a motort, amelyet minden csomag linkel, így egy cikk változása csak azt a cikket buildeli újra, a motor változása pedig mindet. Egy pull request újrahasznosítja azokat a csomagokat, amelyeket a beolvasztási sor már ugyanazokból a bemenetekből buildelt, miután minden fájlt összevetett az ellenőrzőösszegével, és ezt a gyorsítótárat olvashatja, de sosem írhatja (#1395). A böngészőcsomagok is gyorsítótárból jönnek a tükörszerver helyett (#1413).",
        "Csak azt futtatni, amit egy változás érinthet. A dokumentáció változása semmit sem buildel, egy-két perc alatt egy teljes futtatás helyett. Ha csak a honlap változik, a motor feladatai kimaradnak, de minden végponttól végpontig tartó szelet megmarad, mert a 281 specifikációból 59 a képernyőn megjelenő szöveget olvassa (#1381). A sorban minden bejegyzés hatókörét a saját, az előtte álló bejegyzéshez viszonyított diffje határozza meg, ami azért megbízható, mert egy bejegyzés csak akkor olvad be, ha minden előtte álló átment; ha a diff hiányzik vagy nem egyértelmű, mindent lefuttat (#1400).",
        "A leglassabb út kiegyensúlyozása. A végponttól végpontig tartó tesztek 10 helyett 14 szeletben futnak, mért időtartamok alapján kiegyensúlyozva (#1382). A régi időtáblázat 41,5 perc tesztet jósolt ott, ahol egy futtatás 69,8 percig tartott."
      ]
    },
    {
      "k": "table",
      "caption": "Az összes feladatot lefuttató sikeres CI-futtatások valós ideje a létrehozástól az utolsó feladatig, a GitHub Actions API-val mérve. Előtte: november 4., 08:00 UTC-től (pull requestek) vagy 13:48 UTC-től (beolvasztási sor) 21:10 UTC-ig; utána: 21:15 UTC-től november 5., 03:00 UTC-ig.",
      "head": [
        "Futtatások",
        "Darab",
        "Medián",
        "Tartomány"
      ],
      "rows": [
        [
          "Beolvasztási sor, előtte",
          "20",
          "42 perc",
          "25–56 perc"
        ],
        [
          "Beolvasztási sor, utána",
          "10",
          "20 perc",
          "15–26 perc"
        ],
        [
          "Pull requestek (első próbálkozás), előtte",
          "69",
          "59 perc",
          "35–127 perc"
        ],
        [
          "Pull requestek (első próbálkozás), utána",
          "19",
          "27 perc",
          "16–45 perc"
        ]
      ]
    },
    {
      "k": "h",
      "t": "Piros ellenőrzés, amely nem a változás hibája"
    },
    {
      "k": "p",
      "t": "A hálózat vagy egy elveszett gép okozta hiba zaj, de egyben piros ellenőrzés is, amelyet valakinek meg kell néznie, és a piros ellenőrzések újrafuttatásának szokása az, ahogyan egy valódi hiba átcsúszik. Ezért egy pull request sikertelen feladatait csak egyszer, automatikusan futtatjuk újra, és csak akkor, ha minden sikertelen feladat pozitív bizonyítékot hordoz infrastruktúra-hibára: időtúllépés egy letöltési lépésben, feladat közben elveszett CI-gép, hálózati hiba, amely egy letöltés utolsó kísérletét zárja (#1380). Bármi, ami a naplóban bárhol teszthibának tűnik, megakadályozza az újrafuttatást, és ugyanígy bármi, amit az osztályozó nem ismer fel. Ez óvatossá teszi: legfeljebb egyszer futtat újra, és sosem sikertelen tesztlépés után. Nem garancia: egy időszakos hiba, amelyet az osztályozó tévesen infrastruktúra-hibának olvas, az újrafuttatáskor átmehet, ezért akadályozza meg az újrafuttatást bármi, amit nem ismer fel."
    },
    {
      "k": "p",
      "t": "Két további javítás téves riasztásokat szüntetett meg. Egy pull request futtatása, amelyet azért töröltek, mert ugyanazon a commiton egy újabb futtatás váltotta fel, korábban piros kötelező ellenőrzést mutatott; most átugorja ezt az ellenőrzést, de csak miután megbizonyosodott róla, hogy az újabb futtatás létezik és nem bukott el, mert egy átugrott kötelező ellenőrzés sikeresnek számít (#1397). Egy elakadt letöltés pedig olyan folyamatot hagyhatott hátra, amely a csomagkezelő zárolását tartotta, így az újrapróbálkozás a zároláson bukott el, nem a letöltésen; egy kísérlet most csak percekig tartó kimenet nélküli várakozás után számít elakadtnak, mindennel együtt leáll, amit elindított, az újrapróbálkozás pedig megvárja a zárolás feloldását (#1408)."
    },
    {
      "k": "h",
      "t": "Mi következik"
    },
    {
      "k": "p",
      "t": "Befejezzük a nyitott összevetéseket, és gyorsabbá tesszük a honlapot és a megoldót. Az ütemtervben következő lépés egy Python-csomag (pip install stabileo) és a referenciafeladatokból generált nyilvános ellenőrzési kézikönyv."
    }
  ]
};

export default body;
