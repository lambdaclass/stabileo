import type { PostBody } from '../../types';

const body: PostBody = {
  "title": "Tanulja meg a szerkezetszámítást lépésről lépésre a Stabileo Alap módjában",
  "excerpt": "Az Alap módban már tananyag is van: válasszon egy módszert, és az alkalmazás lépésről lépésre, mint papíron, megoldja az Ön szerkezetét vagy egy példát. Statika, hatásvonalak, másodrendű analízis, képlékeny analízis és dinamika. Ingyenes.",
  "blocks": [
    {
      "k": "p",
      "t": "A számítóprogramok egyszerre adják meg az összes eredményt. A tanuláshoz az ellenkezője kell: látni, honnan származik minden szám, abban a sorrendben, ahogy a táblán csinálnánk. Erről szól a „Lépésről lépésre, magyarázattal”, a tananyag, amely most a Stabileo Alap módjában kapott helyet. Kiválaszt egy módszert, az alkalmazás alkalmazza az Ön szerkezetére, és lépésről lépésre végigvezeti rajta, az adott modell egyenleteivel, ábráival és számaival, a végén pedig összeveti az eredményt a mátrixos módszerével."
    },
    {
      "k": "p",
      "t": "A tananyagot Bautista Chesta építőmérnök (FIUBA) írta, és hat egységből áll: a közös alapok, a statika és a klasszikus módszerek, a hatásvonalak, a másodrendű analízis és a kihajlás, a képlékeny analízis és a dinamika. Ingyenes, mint az egész Alap mód: böngészőben nyílik meg, semmit sem kell telepíteni, fiók sem kell, a szövegek pedig spanyolul, angolul, portugálul, németül, franciául és törökül érhetők el."
    },
    {
      "k": "h",
      "t": "Hogyan nyitható meg"
    },
    {
      "k": "ol",
      "items": [
        "Nyissa meg a stabileo.com/app/basic oldalt.",
        "Nyomja meg a Haladó gombot. Telefonon az alsó szalagon található.",
        "A „Felfedezés és tanulás” alatt nyomja meg a Lépésről lépésre, magyarázattal elemet. Megnyílik a módszerek katalógusa, témák szerint csoportosítva.",
        "Minden módszer megmondja, milyennek kell lennie a szerkezetnek a kipróbálásához, és hogy az Ön modellje megfelel-e ennek; a ? elmagyarázza, mit csinál. A „Példa megnyitása” betölt egy megfelelő modellt, és megnyitja a módszert; a „Megnyitás” a képernyőn lévő modellre alkalmazza.",
        "A Következő és az Előző gomb a lépések között lépked, a számozott fülekkel egy adott lépésre lehet ugrani. A Módszerek gomb visszavisz a katalógushoz."
      ]
    },
    {
      "k": "img",
      "base": "blog/course-catalog",
      "w": 1600,
      "h": 1000,
      "alt": "Stabileo Alap mód, az oldalpanelen nyitott „Lépésről lépésre, magyarázattal” katalógussal: a módszerek a merevségi módszer, a hajlékonysági módszer és a folytatólagos gerendák csoportjában, mindegyiknél az, hogy milyennek kell lennie a szerkezetnek, valamint a Megnyitás és a Példa megnyitása gomb.",
      "caption": "A katalógus: minden módszer megmondja, mire van szüksége a modellnek, és tartozik hozzá egy példa, amely ennek megfelel."
    },
    {
      "k": "note",
      "t": "A magyarázott módszerek síkbeli modelleken működnek. A 3D munkaterületen csak a két varázsló nyílik meg, a merevségi és a hajlékonysági; bármely más módszernél a „Példa megnyitása” előbb visszavált síkbeli nézetre."
    },
    {
      "k": "h",
      "t": "Statika, az erőmódszer és az elmozdulásmódszer"
    },
    {
      "k": "p",
      "t": "Ez a legnagyobb egység: folytatólagos gerendák a háromnyomatéki egyenlettel és nyomatékosztással, keretek a szögelfordulási módszerrel, nyomatékosztással oldalkitérés nélkül és oldalkitéréssel, valamint az elmozdulásmódszerrel, rácsos tartók csomóponti módszerrel, átmetszéssel (Ritter) és a kompatibilitási mátrixszal, továbbá alakváltozások kettős integrálással, a nyomatéki területek módszerével, virtuális munkával és Castigliano-tétellel. A határozatlansági fokot mindenhol ugyanígy számoljuk (síkbeli keretre GH = 3·m + r − 3·n − c, rácsos tartóra GH = m + r − 2·n), a belső csuklókat kiírva, külső és belső részre bontva."
    },
    {
      "k": "p",
      "t": "Az erőmódszerben Ön választja meg az alaprendszert: támaszokat vagy rúdvégeket szabadít fel, amíg annyi fölös ismeretlen nem lesz, amennyi a határozatlansági fok, és ha a választása mechanizmust hagy, az alkalmazás megoldás helyett elmagyarázza, miért. Ezután végigmegy a kilenc lépésen, a normálmerevséggel vagy anélkül, a rudakat és a rugókat tagról tagra kiírva. A virtuális munka elmozdulásokat, elfordulásokat és relatív mozgásokat számít, rugókkal, támaszsüllyedésekkel és hőmérséklettel is. Kipróbálásához: Példák → Keretállás, Haladó → Lépésről lépésre, magyarázattal → Erőmódszer → Megnyitás."
    },
    {
      "k": "img",
      "base": "blog/course-force-method",
      "w": 1600,
      "h": 1000,
      "alt": "Az erőmódszer varázslója a Keretállás példán, az alaprendszer lépésénél: a jobb oldali támasz három támaszereje fel van szabadítva, és az alkalmazás felsorolja a kiválasztott három fölös ismeretlent.",
      "caption": "Erőmódszer: Ön választja meg az alaprendszert, és az alkalmazás megmondja, hogy a választás működik-e."
    },
    {
      "k": "h",
      "t": "Hatásvonalak"
    },
    {
      "k": "p",
      "t": "Példák → Folytatólagos gerenda, majd Haladó → Hatásvonal, és koppintson a gerenda egy keresztmetszetére. Vannak hatásvonalak a támaszerőkre, a nyomatékra, a nyíróerőre, a normálerőre, az elmozdulásokra és az elfordulásokra, bármely keresztmetszetben, a rúdvégeket is beleértve, és a keresztmetszet utólag áthelyezhető. A panel a szélsőértékek meghatározásához a g állandó teherrel, a q hasznos teherrel és egy P koncentrált erővel terheli a hatásvonalat, megrajzolja a burkolót a rúd mentén, és megnyitja a lépésről lépésre haladó magyarázatot a Müller-Breslau-ábrákkal. A „Teheresetek és burkolók” megkeresi a legnagyobb és a legkisebb hatásokat. A nyomatéki hatásvonal ott pozitív, ahol az alsó szálat húzza, ahogy a statikai ábra is."
    },
    {
      "k": "img",
      "base": "blog/course-influence",
      "w": 1600,
      "h": 1000,
      "alt": "A Folytatólagos gerenda példa a hatásvonalak terhelésével kapott nyomatéki burkolóval, pirossal a maximum, kékkel a minimum, és a panel, amely a bal oldali támasztól 2 m-re lévő nyomatéki hatásvonalat terheli g = 10 és q = 5 kN/m értékkel: a maximum 20,00 kN·m, a minimum 10,00 kN·m, mindkettőt közvetlen számítás erősíti meg.",
      "caption": "A nyomatéki hatásvonal a szélsőértékeire terhelve, és a burkoló a gerenda mentén."
    },
    {
      "k": "h",
      "t": "Másodrendű analízis és kihajlás"
    },
    {
      "k": "p",
      "t": "Egy terhelt kerettel: Haladó → P-Δ (másodrendű) vagy Pcr (Euler). A „Hogyan számítjuk” alatt kiválasztja a módszert, φ stabilitási függvényekkel, geometriai mátrixszal vagy húrmátrixszal (P/L), és azt, hány elemből álljon egy-egy rúd. A P-Δ megmutatja az iterációit, a B₂ = 1/(1 − 1/λ₁) pedig ugyanannak a modellnek ugyanazon a diszkretizáción számított kihajlásából adódik, annak a csomópontnak az elmozdulásnagyítása mellett, amely elsőrendű számításban a legtöbbet mozdul. A kihajlás alapértelmezésben rudanként négy elemet használ, és ha a diszkretizáció nem tudja visszaadni a tényezőt, inkább elutasítja, mint hogy közölje. A katalógusban a „Másodrendű analízis és kihajlás” csoporthoz egy mind a négy módszerhez előkészített keret tartozik."
    },
    {
      "k": "h",
      "t": "Képlékeny analízis"
    },
    {
      "k": "p",
      "t": "Példák → Keretállás, majd Haladó → Képlékeny tönkremenetel. Az egység meg van írva: minden teherlépés, a λ–elmozdulás görbe, a képlékeny elfordulások, a modellre rajzolt és virtuális munkával ellenőrzött mechanizmus, valamint egy saját mechanizmus, amelyet a csuklók helyére koppintva választ ki. Az eredményeit egyelőre visszatartjuk. Kiderült, hogy a mögötte álló határállapot-analízis akár 4,6-szor eltérő tönkremeneteli tényezőt is adhat, ha a rudakat átszámozzák vagy megfordítják, illetve ha megváltoznak a mértékegységek (#758). Amíg ezt ki nem javítjuk, a panel ezt jelzi, és hivatkozik a hibajegyre, a katalógus statikai és kinematikai módszere pedig ugyanezzel az indoklással ki van kapcsolva: inkább ne legyen szám, mint olyan, amely attól függ, hogyan rajzolták meg a modellt."
    },
    {
      "k": "img",
      "base": "blog/course-plastic",
      "w": 1600,
      "h": 1000,
      "alt": "Stabileo Alap mód a Keretállás példával és a kiválasztott Haladó → Képlékeny tönkremenetel menüponttal: nem jelenik meg sem görbe, sem mechanizmus; egy keretes üzenet közli, hogy az eredmények vissza vannak tartva, mert a 2D képlékeny tönkremeneteli tényező a számozástól, a rúdirányoktól vagy a mértékegységektől függően akár 4,6-szeresére is változhat, és hivatkozik a #758-as hibajegyre.",
      "caption": "A keretállás képlékeny tönkremenetele, visszatartva a #758 javításáig."
    },
    {
      "k": "h",
      "t": "Dinamika"
    },
    {
      "k": "p",
      "t": "A Haladó → Dinamika megnyitja a dinamikai panelt. Egy egy szabadságfokú rendszert a modellből vesz át, szabad rezgésével és harmonikus teherre adott kényszerrezgési válaszával; a több szabadságfokú rendszert modális szuperpozícióval oldja meg, a nyírási épületmodellt is beleértve. A tömegmodelleket, koncentrált vagy konzisztens tömeggel és kondenzációval, összeveti a motor sajátfrekvenciáival, és a csomópontokba koncentrált tömegek is helyezhetők, forgási tehetetlenségükkel együtt, amelyet a modális analízis is felhasznál. A katalógus „Szerkezetdinamika” csoportjában a „Példa megnyitása” egy csúcstömeggel ellátott oszlopot, egy kétszintes nyírási keretet vagy, megoszló tömeg esetén, egy konzolt tölt be."
    },
    {
      "k": "img",
      "base": "blog/course-dynamics",
      "w": 1600,
      "h": 1000,
      "alt": "Egy csúcstömeggel ellátott konzolos oszlop, a dinamikai panel a modellből átvett egy szabadságfokú rendszerre nyitva: k = 2250 kN/m, m = 5 t, ω = 21,21 rad/s, a csillapított szabad rezgés és egy harmonikus erőre adott válasz a β tényezővel.",
      "caption": "Egy szabadságfok: a csúcstömeggel ellátott oszlop harmonikus erő alatt."
    },
    {
      "k": "h",
      "t": "A katalógus teljes tartalma"
    },
    {
      "k": "table",
      "caption": "A „Lépésről lépésre, magyarázattal” módszerei csoportonként, a katalógus sorrendjében.",
      "head": [
        "Csoport",
        "Szám",
        "Módszerek"
      ],
      "rows": [
        [
          "Merevségi módszer",
          "1",
          "Mátrixos módszer, varázslóként"
        ],
        [
          "Hajlékonysági módszer",
          "1",
          "Erőmódszer, varázslóként"
        ],
        [
          "Folytatólagos gerendák",
          "2",
          "Háromnyomatéki egyenlet (Clapeyron); nyomatékosztás (Hardy Cross)"
        ],
        [
          "Keretek",
          "4",
          "Kinematikai ismeretlenek; nyomatékosztás oldalkitérés nélkül és oldalkitéréssel; szögelfordulási módszer"
        ],
        [
          "Rácsos tartók",
          "3",
          "Csomóponti módszer; átmetszés (Ritter); kompatibilitási mátrix"
        ],
        [
          "Alakváltozások és energia",
          "5",
          "Kettős integrálás; nyomatéki területek módszere; virtuális munka; Castigliano; igénybevételek átmetszéssel"
        ],
        [
          "Hatásvonalak",
          "1",
          "Hatásvonal"
        ],
        [
          "Másodrendű analízis és kihajlás",
          "2",
          "Másodrendű analízis φ függvényekkel és geometriai mátrixszal; kihajlás módusszámlálással és sajátértékekkel"
        ],
        [
          "Képlékeny analízis",
          "2",
          "Kinematikai módszer; statikai módszer (visszatartva a #758 javításáig)"
        ],
        [
          "Szerkezetdinamika",
          "3",
          "Egy szabadságfok; több szabadságfok modális felbontással; megoszló tömeg"
        ]
      ]
    },
    {
      "k": "p",
      "t": "Ha tartószerkezeteket tanít, órán úgy használhatja, ahogy van: a modellt hivatkozással lehet megosztani, és minden hallgató a saját böngészőjében, a saját nyelvén nyitja meg. Ha egy lépés nem világos, vagy egy szám nem egyezik azzal, amit kézzel kap, írjon nekünk: pontosan erre van szükségünk."
    },
    {
      "k": "link",
      "slug": "conceptual-side-advanced-tools",
      "t": "Egy másik, tanteremre szánt eszköz, a kinematikai analízis, amely elmagyarázza, miért mechanizmus egy szerkezet:"
    }
  ]
};

export default body;
