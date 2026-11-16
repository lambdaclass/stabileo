import type { PostBody } from '../../types';

const body: PostBody = {
  "title": "Amit az ingyenes szoftverek kiszámítanak, és amit nem magyaráznak el",
  "excerpt": "Vannak ingyenes szerkezetszámító programok, és jók: modelleznek, számítanak, megmutatják az eredményeket. Olyat viszont nem találtunk, amely a haladó eszközöket a fogalmi oldalról közelítené meg.",
  "blocks": [
    {
      "k": "p",
      "t": "Érdemes azzal kezdeni, ami létezik: abból sok van, és jó. Aki ma tartószerkezeteket tanít, első osztályú ingyenes eszközök közül választhat, és több közülük jobban végzi a dolgát, mint mi a miénket."
    },
    {
      "k": "h",
      "t": "Mit fednek le valójában az ingyenes eszközök"
    },
    {
      "k": "table",
      "caption": "Ingyenes szerkezetszámító eszközök, és amit az eredményen túl mutatnak.",
      "head": [
        "Eszköz",
        "Ingyenes",
        "Amiben nagyon jó",
        "Fogalmi oldal"
      ],
      "rows": [
        [
          "Ftool",
          "Igen",
          "Síkbeli keretek modellezése, igénybevételi ábrák és hatásvonalak olvasása, olyan gördülékenyen, amilyenre kevés program képes",
          "A viselkedést mutatja, nem a mögötte álló gondolatmenetet"
        ],
        [
          "MASTAN2",
          "Igen (MATLAB-on vagy annak futtatókörnyezetén)",
          "Lineáris és nemlineáris mátrixos analízis, McGuire, Gallagher és Ziemian könyvéhez kötve",
          "Az elmélet a könyvben van; a program a számítást futtatja"
        ],
        [
          "SkyCiv",
          "Ingyenes csomag",
          "Lépésről lépésre haladó kézi számítások: szabadtestábrák, egyensúlyi egyenletek a behelyettesítés előtt, nyomatékosztás határozatlan gerendákra",
          "Képletekbe helyettesített számok, az alapvető statikához"
        ],
        [
          "sectionproperties",
          "Igen, nyílt forráskódú",
          "Öblösödés, nyírási középpont és Saint-Venant-féle állandó végeselemekkel",
          "Python-könyvtár: számokat ad vissza, felület és magyarázat nélkül"
        ]
      ]
    },
    {
      "k": "p",
      "t": "A listából a SkyCiv áll a legközelebb ahhoz, amit „a levezetés bemutatásának” szoktunk nevezni, és ezt ki kell mondani: a kézi számításai jók. Megrajzolja a szabadtestábrát, felírja a ΣM = 0 egyenletet, mielőtt bármilyen szám bekerülne, és nyomatékosztással old meg, ha a gerenda határozatlan. Aki azt állítja, hogy egyetlen ingyenes program sem mutatja a lépéseit, azt a SkyCiv-vel nagyjából egy perc alatt meg lehet cáfolni."
    },
    {
      "k": "h",
      "t": "A lépések bemutatása nem elég, ha a program nem szól, amikor a képlet már nem érvényes"
    },
    {
      "k": "p",
      "t": "Számokat behelyettesíteni egy helyes képletbe és megmagyarázni, miért az a helyes képlet, két különböző dolog. Az első megspórolja a számolást. A második attól a hibától óv meg, amelyet a számolás nem tud elkapni, mert a hiba egy szinttel feljebb van."
    },
    {
      "k": "p",
      "t": "Az interneten található csavarási kalkulátorok fordítva szemléltetik ugyanezt: kiválasztja a keresztmetszet típusát (tömör, zárt cső, téglalap), és a program az ennek megfelelő képletet alkalmazza. Az általunk látottak közül egyik sem mondja meg, hogy rosszul választott, mit adott volna a másik elmélet, vagy a hiba melyik oldalán áll."
    },
    {
      "k": "quote",
      "t": "Egy program, amely csak számol, sosem fogja jelezni, hogy rossz dolgot számol."
    },
    {
      "k": "h",
      "t": "Három funkció, amelynek nem találtunk megfelelőjét"
    },
    {
      "k": "ul",
      "items": [
        "Kinematikai analízis, elmagyarázva. Kerestünk, és nem találtunk ingyenes eszközt, amely ezt tudná: amit találni, az PDF-ben elérhető jegyzet. Az a „kinematikai analízishez készült oktatószoftver”, amelyet megtaláltunk, gépi mechanizmusokhoz (csuklós rudazatokhoz és forgattyúkhoz) való, nem szerkezetek osztályozásához.",
        "Vasalási részletezés. Az egyetlen ingyenes lehetőség, amit találtunk, az AutoRebar, ez pedig AutoCAD-bővítmény, így az ingyenes rész használatához drága licenc kell. Ráadásul az Ön rajzából dolgozik: Ön helyezi el a vasakat, ő elkészíti a kivonatot. Minden más hétnapos próbaverzió vagy kereskedelmi szoftver. Nyílt forráskódú lehetőséget nem találtunk.",
        "Keresztmetszeti analízis, levezetve. Itt van egy komoly ingyenes lehetőség, a sectionproperties, és az öblösödés végeselemes számításában valószínűleg jobb nálunk. De felület nélküli könyvtár: megadja a nyírási középpontot, anélkül hogy elmagyarázná, miért ott van, ahol van."
      ]
    },
    {
      "k": "p",
      "t": "Az általunk áttekintett eszközök közül egyik sem fedi le a három közül kettőt, és nem találtunk olyat, amely akár csak egyet is a fogalmi oldalról közelítene meg. Ezt a hiányt látjuk, és ez szűkebb és pontosabb, mint az, hogy „csak mi tanítunk”."
    },
    {
      "k": "h",
      "t": "Egy képernyő, amelyen az egész különbség látszik"
    },
    {
      "k": "p",
      "t": "Lent egy három támaszon fekvő, kétmezős gerenda látható. Mindhárom támasz csak a függőleges elmozdulást gátolja. Ez a tankönyvi eset, és egyben az is, amelyet a leggyakrabban láttam helyesként elfogadni egy vizsgán."
    },
    {
      "k": "p",
      "t": "A határozatlansági fok képlete GH = 3·m + r − 3·n − c = 3×2 + 3 − 3×3 − 0 = 0 értéket ad. A nulla statikailag határozott szerkezetet jelent, és minden program, amely megáll a képletnél, pontosan ezt fogja jelenteni. Csakhogy vízszintesen semmi sem tartja a gerendát: mechanizmus, és nem számítható."
    },
    {
      "k": "table",
      "caption": "Mit ad vissza a kinematikai analízis erre a gerendára, lépésről lépésre.",
      "head": [
        "Lépés",
        "Mit vizsgál",
        "Eredmény"
      ],
      "rows": [
        [
          "2 · Statikai határozatlanság",
          "GH = 3·m + r − 3·n − c",
          "0"
        ],
        [
          "3 · Merevségi mátrix",
          "Észlelt mechanizmusmódok",
          "1"
        ],
        [
          "3 · Merevségi mátrix",
          "Meg nem támasztott szabadságfokok",
          "1"
        ],
        [
          "4 · Javaslatok",
          "Ítélet a képernyőn",
          "Nem számítható"
        ]
      ]
    },
    {
      "k": "p",
      "t": "Az alkalmazás nem csak közli a nullát, és mossa kezeit. Ugyanabban a 2. lépésben, amelyben előállította, ellent is mond neki: „A képlet GH = 0 értéket ad (a statikai határozottság szükséges feltétele), de NEM elégséges”. A 3. lépés összeállítja a globális merevségi mátrixot, itt 6×6-osat, és a GH = 0 ≥ 0 ellenére jelzi: „1 mechanizmusmódot észleltünk”. Megnevezi a 3-as csomópontot és annak vízszintes elmozdulását, rámutat, hogy a 2. lépés egyenlete megszámolja a kényszereket, de nem nézi meg, hol vannak, és így zárul: „✗ Mechanizmus – nem számítható”."
    },
    {
      "k": "img",
      "base": "blog/hidden-mechanism",
      "w": 1600,
      "h": 1000,
      "alt": "Stabileo Alap mód egy három vízszintes görgős támaszon fekvő, kétmezős gerendával, 10 kN/m teher alatt. A kinematikai analízis panelje GH = 3·2 + 3 − 3·3 = 0 értéket mutat, és egy üzenet szerint: „Instabil szerkezet (mechanizmus): egyik támasznál sincs vízszintes megtámasztás”.",
      "caption": "Ugyanez a gerenda az alkalmazásban: a képlet nullát ad, a megoldó mégis mechanizmusként utasítja el."
    },
    {
      "k": "embed",
      "query": "example=hidden-mechanism&kin=1",
      "label": "A gerenda három függőleges támaszon, nyitott kinematikai analízis panellel. Járja végig a négy lépést: a második GH = 0 értéket ad, a harmadik megtalálja a mechanizmust, amelyet ez a nulla elrejt. Próbálja ki, hogy az egyik támaszt csuklósra cseréli, és futtassa újra: a fok 1 lesz, és a mechanizmus eltűnik."
    },
    {
      "k": "h",
      "t": "Miért érdekelheti ez a tanszékeket"
    },
    {
      "k": "p",
      "t": "Az a hallgató, aki megtanulja a határozatlansági fok képletét, de sosem látja az elégséges feltételt elbukni, hiányos szabállyal megy tovább, és nem is tud róla. Táblánál nehéz megmutatni, mert az a példa, amelyen elbukik, elírásnak tűnik. Itt egyetlen képernyőn látszik, a szám és az ellentmondás egymás mellett."
    },
    {
      "k": "p",
      "t": "Semmit sem kell telepíteni vagy licencelni, és a tanszéknek semmit sem kell megvásárolnia. Böngészőben nyílik meg, a modellt pedig hivatkozásként lehet megosztani."
    },
    {
      "k": "note",
      "t": "Hogy világos legyen: mindez nem jelenti, hogy jobbak lennénk. Az Ftool gyorsabban és kevesebb súrlódással modellez, mint mi. A MASTAN2 mögött egy tankönyv áll, amelyet nem mi írtunk. A SkyCiv kézi számításai szebben vannak tálalva, mint több panelünk. A sectionproperties pedig végeselemekkel oldja meg az öblösödést, ahol mi közelítünk. Amit állítunk, az szűkebb és egészen konkrét: az általunk áttekintett ingyenes eszközök közül egyik sem közelíti meg a haladó eszközöket a fogalmi oldalról. Ha ismer olyan ingyenes eszközt, amely elmagyarázza a kinematikai analízist, vaskivonatot készít, vagy levezeti a keresztmetszeti analízist, írjon nekünk, és kijavítjuk ezt a bejegyzést."
    }
  ]
};

export default body;
