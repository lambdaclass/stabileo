import type { PostBody } from '../../types';

const body: PostBody = {
  "title": "Stabileo 0.5.0: újabb huszonhárom figyelmeztetés, minden nyitott hibára jelzés vagy elutasítás",
  "excerpt": "Mi változott a 0.4.0 óta: huszonhárom hiba, amely hibás vagy a biztonság kárára tévedő eredményt adhatott, figyelmeztetésként leírva, egy kivételével mind javítva; jelzés vagy elutasítás minden még nyitott hibára; és a lépésről lépésre haladó tananyag az Alap módban.",
  "blocks": [
    {
      "k": "p",
      "t": "A 0.4.0 óta egyszerre több oldalról ellenőriztük tovább a Stabileót: a megoldót publikált megoldásokkal és más programokkal szemben, a méretezési ellenőrzéseket kidolgozott példákkal szemben, ugyanazt a szerkezetet átszámozva, átskálázva és elmozdítva, valamint a korábbi kiadások által mentett fájlokat. Így további huszonhárom olyan hibát találtunk, amely hibás vagy a biztonság kárára tévedő eredményt adhatott. Mindegyikhez tartozik egy figyelmeztetés, amely leírja, mi volt a hiba, kit érint, és mit kell újraellenőrizni. Huszonkettőt kijavítottunk; a 2D képlékeny tönkremenetelt (SA-2026-044) a #758 javításáig továbbra is elutasítjuk."
    },
    {
      "k": "note",
      "t": "A stabileo.com minden változtatást azonnal közzétesz, amint beolvasztják, így e javítások többsége már élesben van, mindegyik a beolvasztása napjától. Az érintett változtatás előtt mentett projektek megnyitáskor újraellenőrzést kérnek, az olvasó nyelvén. Két javítás erre nem képes: a #1295 előtt 3D-ből kivágott 2D modell értesítés nélkül nyílik meg, mert maga a modell volt hibás (SA-2026-035). Vágja ki újra a 3D-ből, vagy számítsa ki 3D-ben. Ugyanez érvényes a #1310 előtt Excelből vagy IFC-ből importált téglalapra vagy csőre (SA-2026-039): importálja újra."
    },
    {
      "k": "img",
      "base": "blog/results-recheck",
      "w": 1600,
      "h": 1000,
      "alt": "Stabileo Alap mód egy példák közül megnyitott síkbeli kerettel, amelyet kiszámítva mentettek a 15-ös eredményverzióval. Az „Az eredmények megváltoztak a projekt legutóbbi számítása óta” című párbeszédablak felsorolja az őt érintő változásokat, köztük a változó normálerejű rudak 2D kihajlásának javítását és a valódi csúcsértéknél leolvasott mértékadó értéket, mindegyiket a magyarázatával, és kéri az „Elolvastam ezeket a változásokat” bejelölését, mielőtt folytatná vagy újrafuttatná a számítást.",
      "caption": "Az érintett változtatás előtt mentett projekt megnyitáskor újraellenőrzést kér, és minden változást felsorol."
    },
    {
      "k": "h",
      "t": "Futtassa újra a projektjeit"
    },
    {
      "k": "p",
      "t": "Ezek azok az esetek, amelyek a legjobban elmozdítanak egy méretezési eredményt. Minden figyelmeztetés tartalmazza a kidolgozott esetet, és azt, hogy mit kell tenni a már leadott eredményekkel."
    },
    {
      "k": "table",
      "caption": "A 0.5.0 néhány javítása, ahogy az egyes figyelmeztetések dokumentálják őket, azzal az eredményverzióval, amely bevezette őket; az SA-2026-035-nek nincs ilyenje, így a figyelmeztetése az egyetlen értesítés.",
      "head": [
        "Figyelmeztetés",
        "Eredményverzió",
        "Mi volt a hiba",
        "Súlyosság"
      ],
      "rows": [
        [
          "SA-2026-029",
          "7",
          "A 3D méretezési ellenőrzések az oldalirányú nyomatékot vagy nyíróerőt olvasták: egy Mz körül hajlított CIRSOC 201 szerinti oszlopot a magassága mentén ellenőriztek, egy példában 36%-kal kevesebb acéllal",
          "Kritikus"
        ],
        [
          "SA-2026-028",
          "8",
          "Az EN 1992-1-1 szerinti hajlítás feltételezte, hogy a húzott acél megfolyik: az MRd akár 22%-kal túl magas",
          "Magas"
        ],
        [
          "SA-2026-030",
          "12",
          "CIRSOC 301 szerinti nyomás: egy Qa ≤ 0 keresztmetszet a képlékeny nyomási teherbírásánál nagyobb teherbírást kapott, és megfelelt",
          "Magas"
        ],
        [
          "SA-2026-041",
          "19",
          "A vasbeton oszlop ellenőrzése a legnagyobb nyomatékot csak a legnagyobb nyomóerővel párosította: egy példában akár 15%-kal a biztonság kárára",
          "Magas"
        ],
        [
          "SA-2026-042",
          "23",
          "A 2D kihajlás túlbecsülte azoknak a rudaknak a tényezőjét, amelyekben a nyomóerő a hosszuk mentén nő: egy rúdnál +43%-tól +68%-ig",
          "Magas"
        ],
        [
          "SA-2026-038",
          "35",
          "A 3D kihajlás minden rúd átlagos normálerejét használta: +43% egy hossza mentén terhelt rúd tényezőjén",
          "Magas"
        ],
        [
          "SA-2026-043",
          "32",
          "A harmonikus analízis elvesztette az elhagyott módusok korrekcióját, ha az egyik módus sokkal lágyabb volt a többinél: egy példában 2,3 Hz-en 79-szeres eltérés",
          "Magas"
        ],
        [
          "SA-2026-035",
          "—",
          "A 3D-ből 2D-be vágás a rudakat a rossz keresztmetszeti tengely körül hajlította: egy Y–Z keretállás 13,5-szer túl merev",
          "Magas"
        ],
        [
          "SA-2026-033",
          "20",
          "A tehergenerátor kihagyta egy födém teljes felületi terhét, ha egy alacsonyabb rúd állt annak egy része fölött",
          "Magas"
        ],
        [
          "SA-2026-027",
          "11",
          "A héjburkoló a legnagyobb Von Mises-feszültségű kombinációt tartotta meg, nem az egyes komponensek szélsőértékét: egy példában az mx 14%-kal alacsonyabb",
          "Magas"
        ],
        [
          "SA-2026-047",
          "49",
          "Héjakat tartalmazó modellben az a tehereset, amely támaszelmozdulást írt elő, elvesztette az összes héjfeszültségét, így a kombinációk és a burkolók csak a többi teheresetek héjfeszültségeit összegezték: a kombinált héjfeszültségek figyelmeztetés nélkül a biztonság kárára tévedhettek. A 0.2.0, 0.3.0 és 0.4.0 verzióban (#1676)",
          "Magas"
        ]
      ]
    },
    {
      "k": "p",
      "t": "Minden héjakat tartalmazó, a #1676 előtt kiszámított projekt megnyitáskor megnevezi az SA-2026-047-et (#1691): érintettként, ha a modellben van támaszelmozdulást előíró tehereset és teherkombináció, egyébként esetleg érintettként, mert egy mentett projekt nem tudja igazolni, hogy soha nem volt benne ilyen tehereset. Az újraszámítás megszünteti az értesítést; utána vesse össze azoknak a kombinációknak a héjfeszültségeit, amelyek ezt a teheresetet tartalmazzák."
    },
    {
      "k": "p",
      "t": "A többi figyelmeztetés a következőket érinti: csavart betonelemek az ACI 318 és az EN 1992 szerint (SA-2026-040), Y–Z vagy X–Y síkból 2D-be vágott modell kényszerei (SA-2026-036), 3D korotációs analízis nagy elfordulásokkal (SA-2026-037), t = 0 időpontban működő teher tömeg nélküli csomóponton időtörténeti analízisben (SA-2026-031), egy mechanizmus zérus módusa a modális analízisben (SA-2026-032), a jelentés egyensúlyi ellenőrzése az analízis után (SA-2026-034), a 2D képlékeny tönkremenetel, amelyet a #758 javításáig továbbra is elutasítunk (SA-2026-044), a 3D képlékeny tönkremenetel olyan rúddal, amelynek nincs használható képlékeny nyomatéka, ezt most elutasítjuk (SA-2026-045), a harmonikus analízis, amely terhenként választott a modális szuperpozíció és a közvetlen megoldás között, így a szuperpozíció sérült (SA-2026-046), Excelből vagy IFC-ből felcserélt Iy-nal és Iz-vel importált téglalapok és csövek (SA-2026-039), valamint azoknak, akik közvetlenül hívják a motort, az acél nyírási ellenőrzése nyírási terület nélkül az AISC 360 és az EN 1993 szerint (SA-2026-025 és 026)."
    },
    {
      "k": "h",
      "t": "Egyéb változások, amelyek elmozdítják az eredményeket"
    },
    {
      "k": "p",
      "t": "Más változások is elmozdítanak számokat, ezért mindegyik szerepel az újraellenőrzési értesítésben; a legtöbbnek nincs saját figyelmeztetése, a modális zérus módus pedig a fenti SA-2026-032:"
    },
    {
      "k": "ul",
      "items": [
        "Egy rúd mértékadó értéke és a 2D burkoló az ábra valódi csúcsértékét olvassa le, nem a 21 metszet közül a legközelebbit: a dokumentált esetekben háromszög alakú teher alatt 0,23%-kal, rövid részleges teher alatt 1,05%-kal nőhetnek, és soha nem csökkennek.",
        "A mechanizmusokat megoldás helyett elutasítja: 2D-ben merev kapcsolat vagy tárcsa mögött, 2D-ben kapcsolóelem mögött (#1415), valamint a modális analízisben, amely korábban elhagyta a zérus módust, és a többit teljesként adta vissza, beleértve egy ferde támaszokon elcsúszó mechanizmust is.",
        "A 3D anyagi nemlinearitású analízis egymás mellett számítja ki a gátolt csavarási állandóval rendelkező és anélküli kereteket, valamint a csak rácsrudakkal elért csomópontokat, ahelyett hogy összeomlana vagy elutasítaná őket; a korábban is számítható modellek ugyanazokat a számokat adják.",
        "Az ismétlődő sajátértékek megtartják a multiplicitásukat, a statikai és modális eredmények pedig megjelenítés előtt ellenőrzik a saját egyensúlyukat és ortogonalitásukat.",
        "Az Alap módban a P-Δ és a kritikus teher minden rudat elemekre bont, a képlékeny tönkremenetel bezárja a tehermentesülő csuklókat, és a hajlítónyomaték hatásvonala az alul húzott nyomatékot veszi pozitívnak, mint az Alap mód minden más nyomatéka.",
        "A ki nem értékelhető méretezési ellenőrzést elutasítja, ahelyett hogy megfelelőnek venné, és egy lágy, de valós csomóponti elfordulás már nem rögzül, ha a modellnek van egy sokkal merevebb része.",
        "A lineáris analízis figyelmeztet, ha egy elfordulás meghaladja a 0,1 rad-ot, a rúd fesztávján belül is (beleértve a nyírási alakváltozás által a tengely hajlásához adott részt és a hőmérsékleti gradiens görbületét egy felszabadított végen, #1569) és egy kombináció saját elmozdulásain is, továbbá ha a nyomás 10%-nál jobban felnagyíthatja a nyomatékait; amíg ez a második figyelmeztetés látható, a CIRSOC 301 szerinti ellenőrzések szünetelnek. Ahol elfordulásra figyelmeztet, futtasson geometriailag nemlineáris (nagy elfordulású) analízist; ahol a nagyításra, P-Δ vagy más másodrendű analízist."
      ]
    },
    {
      "k": "h",
      "t": "Jelzés vagy elutasítás, amíg minden javítás el nem készül"
    },
    {
      "k": "p",
      "t": "Minden nyitott hiba, amely hibás eredményt adhat, most jelzést vagy elutasítást kap minden olyan helyen, ahol eljuthat a mérnökig (#807). A jelzés megtartja az eredményt, és mellette megnevezi a hibát; az elutasítás visszatartja az eredményt, és megmondja, miért. A tárolóban egy nyilvántartás sorol fel minden nyitott biztonsági hibát a jelzésével vagy elutasításával, az azt kiváltó feltétellel és a teszttel, amely bizonyítja, hogy működik, egy teszt pedig összhangban tartja a motorral."
    },
    {
      "k": "ul",
      "items": [
        "Elutasítva: a 2D képlékeny tönkremeneteli tényező, amely a számozástól, a rudak irányától és a mértékegységektől függően akár 4,6-szeresére is változhat (#758); a saját tanúsítványának korlátain kívül eső kihajlási tényező (#741); MITC4 héjak torzult hálón, jelentős síkbeli hajlítás alatt (#798); valamint MITC4 és MITC9 héjak csavart geometrián (#1057).",
        "Jelezve: többek között az időtörténeti analízis, a 3D modális szuperpozíció, a közel szinguláris modellek, a kontaktus, az anyagi nemlinearitású analízis és az eltérő merevségű kapcsolóelemek.",
        "Az elutasításokon kívül a hibák elszigetelése egyetlen számot változtat meg: egy olyan süllyedő támasz 2D támaszereje, amely a süllyedés irányában rugót is hordoz, most tartalmazza a rugó erejét. Az eredménygyűjtemény 145 515 értéke közül az összes többi azonos."
      ]
    },
    {
      "k": "note",
      "t": "Két elutasítás olyan eredményeket vesz el, amelyeket egyes olvasók használnak. A síkbeli keretek képlékeny tönkremeneteli tényezőit a #758 javításáig visszatartjuk. Néhány torzult héjháló eredményeit is visszatartjuk, amelyek 2%-on belül voltak a referenciájukhoz képest: inkább választottunk egy fölösleges elutasítást, mint egy figyelmeztetés nélkül megjelenített hibás merevséget, és ennek szűkítése szerepel az ütemtervben."
    },
    {
      "k": "h",
      "t": "A 0.5.0 további újdonságai"
    },
    {
      "k": "ul",
      "items": [
        "Az Alap mód lépésről lépésre tanítja a szerkezetszámítást: statika, az erő- és az elmozdulásmódszer, hatásvonalak, másodrendű analízis és kihajlás, képlékeny analízis és dinamika, mindegyik lépésről lépésre elmagyarázva az alkalmazásban. A képlékeny tönkremenetelről szóló egységét a 2D képlékeny tönkremenetel többi részével együtt a #758 javításáig visszatartjuk.",
        "A német, a francia és a török nyelv ismét elérhető.",
        "Az MI-asszisztens a saját Anthropic- vagy OpenAI-kulcsával működik, amelyet csak a böngészője tárol, a /examples oldalon pedig élő modellek vannak, amelyeket a motor egy csúszka mozgatásakor újra kiszámít.",
        "PRO: mester- és hasonló szintek, egységnyi szélességre vonatkozó lemezeredmények főnyomatékokkal és főirányokkal, a jelentés az analízis után, csak olvasható megjelenítő a „Másolat és szerkesztés” funkcióval, valamint 3D referenciaként megrajzolt csatolt IFC.",
        "A 0.2.0, 0.3.0 és 0.4.0 által mentett fájlok minden változtatásnál megnyílnak, migrálódnak és ugyanazokat az eredményeket adják, kivéve, ahol egy nyilvántartott eredményváltozás érvényes; egy újabb verzióval mentett fájlt egy ezt közlő üzenettel elutasít.",
        "Ugyanannak az átskálázott, átszámozott, megfordított vagy elmozdított szerkezetnek ugyanazt a választ kell adnia; ezt 17 analízistípuson minden változtatásnál, és minden éjjel 8192 generált modellen ellenőrizzük.",
        "Szintén javítva: a talaj–szerkezet kölcsönhatás közli a támaszerőit, amelyeket korábban üresen adott vissza (#1675); a két családba tartozó, azonos számozású héjakat a kombinációk és a burkolók elutasítják, ahelyett hogy az egyiket a másik helyett kombinálnák (#1669); a héjak Von Mises- és főfeszültségei pedig szélsőséges nagyságrendeknél már nem csordulnak túl vagy alul, a normál tartományba eső eredmények bitre azonosak (#1688).",
        "Az a projekt, amelyet olyan verzióval számítottak ki, amelynek egy általa használt funkciójában ismert, hibás eredményt adó hiba volt, az újraszámításig megnevezi a figyelmeztetést (#1657), a projektek pedig rögzítik az összes lefuttatott analízisüket, így egy analízisről szóló figyelmeztetés addig marad, amíg az az analízis újra le nem fut (#1663).",
        "Gyorsabb: a 30 s-onkénti automatikus mentés kihagyja a változatlan projektet (#1664), egy nagy 3D munkaterület kevesebb összegyűjtendő szeméttel nyílik meg újra (#1668), a közzétett 3D eredmények pedig befagyasztottak, így az ismert hibák miatti elutasítás ellenőrzése eredményenként egyszer fut le (#1689).",
        "További motorellenőrzések: reciprocitás nyomatékokkal, tényezős kombinációk és minden héjfeszültség-komponens szuperpozíciója (#1665), valamint analízisenként egy eredményrekord minden csomópontra, támaszra, elemre és héjra (#1674), amelyek megtalálták a fenti talaj–szerkezet kölcsönhatási és héjkombinációs hibákat.",
        "Stabileo Research és Stabileo Tools: publikált cikkek és benchmarkok futtatható reprodukciói, három bíráló átnézése után átdolgozva, valamint ingyenes kalkulátorok, amelyek ugyanazon a motoron futnak."
      ]
    },
    {
      "k": "link",
      "slug": "safety-advisories",
      "t": "Hogyan működnek a figyelmeztetések, és az első huszonnégy:"
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/README.md",
      "label": "A biztonsági figyelmeztetések jegyzéke",
      "t": "Minden figyelmeztetés, a súlyosságával, a hibajegyével és a javításával:"
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/CHANGELOG.md",
      "label": "Változásnapló",
      "t": "A teljes műszaki nyilvántartás:"
    }
  ]
};

export default body;
