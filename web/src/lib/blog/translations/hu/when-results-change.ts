import type { PostBody } from '../../types';

const body: PostBody = {
  "title": "Ha egy eredmény megváltozik: eredményverziók, újraellenőrzések és figyelmeztetések",
  "excerpt": "Hogyan jelzi a Stabileo, mely projektjeit érinti egy javítás, hogyan tartja vissza a javítás elkészültéig azt az eredményt, amelyről tudja, hogy hibás lehet, és hogyan teszi közzé a javítást, a november 4-én és 5-én beolvasztott tizennégy eredményverzióval.",
  "blocks": [
    {
      "k": "p",
      "t": "Egy szerkezetszámító megoldó minden javítása megváltoztat egy számot, amelyet valaki talán már felhasznált. Egy túl nagy kihajlási tényező most kisebb; egy modell, amely korábban lefutott, most elutasításra kerül. Ha egy javítás csendben kerül be az alkalmazásba, a régi szám benne marad a már leadott számításokban, és a mérnöknek, aki készítette őket, semmi oka újra megnézni őket."
    },
    {
      "k": "p",
      "t": "Ez a bejegyzés azt írja le, mit tesz ezzel a Stabileo, attól a pillanattól, hogy egy hibát megtalálunk, addig, amíg a javítását közzétesszük. A példák valódiak: 2026. november 4-én és 5-én tizennégy eredményverzió, a 16-ostól a 29-esig, került ki a stabileo.com-ra."
    },
    {
      "k": "h",
      "t": "Mi az az eredményverzió"
    },
    {
      "k": "p",
      "t": "Az eredményverzió egy egész szám, amely független az alkalmazás verziójától. Eggyel nő minden alkalommal, amikor olyan változás kerül ki a honlapra, amely miatt ugyanaz a mentett modell más számokat ad, vagy elutasít egy modellt, amely korábban lefutott. Minden ilyen változást a következőkkel rögzítünk:"
    },
    {
      "k": "ul",
      "items": [
        "a verzió, amellyel bekerült, a dátuma és a pull requestjei;",
        "mely modelleket érinti, modelljellemzőkként megfogalmazva: síkbeli modell kényszerekkel, 2D kihajlásszámítás rúdirányú terhekkel, CIRSOC 201 szerint ellenőrzött betonrúd;",
        "cím és magyarázat a mérnöknek az alkalmazás mind a hat nyelvén, azzal együtt, hogy mit kell újraellenőrizni;",
        "hivatkozás a teljes leírásra: figyelmeztetésre, eredményváltozási feljegyzésre vagy a változásnaplóra."
      ]
    },
    {
      "k": "p",
      "t": "Minden számítás bélyegzővel látja el a projektet: az eredményverzióval, amely előállította, az alkalmazás verziójával, a commit azonosítójával, a motor verziójával, a motor binárisának hash-ével és a lefutott analízisekkel. A bélyegző a projekttel együtt utazik: a mentett fájl, az automatikus mentés, a nyitott lap és a megosztási hivatkozás egyaránt hordozza."
    },
    {
      "k": "note",
      "t": "Egy eredményverziót sosem használunk újra. A fő ágba történő minden beolvasztás élesbe kerül, és amit számít, azt az aktuális verzióval bélyegzi, így egy már a honlapon lévő verzióhoz utólag hozzáadott bejegyzés sosem jutna el azokhoz a projektekhez, amelyeket az a verzió bélyegzett. Egy teszt elbukik egy ilyen hozzáadásnál."
    },
    {
      "k": "h",
      "t": "Miért változik egy verzió"
    },
    {
      "k": "p",
      "t": "A legtöbb változás javítás: egy eredmény hibás volt, és most helyes. Némelyik elutasítás: egy modell, amely korábban számot adott, most helyette egyértelmű üzenetet ad, mert a szám semmit sem jelentett. És egy verzió vissza is vonhat: a 15-ös verzió visszavonta a 14-es verzió három változását, amelyekkel az átnézés során készült javításaik nem kerültek ki a honlapra, a 27–29-es verziók pedig átnézve visszahozták őket. A 14-es verzióval számított projekt mindkettőről értesül."
    },
    {
      "k": "table",
      "caption": "A 16–29-es eredményverziók, beolvasztva 2026. november 4-én és 5-én.",
      "head": [
        "Verzió",
        "Változás",
        "Típus"
      ],
      "rows": [
        [
          "16",
          "Alumínium: a gyenge tengelyű nyírást ellenőrzi",
          "Javítás"
        ],
        [
          "17",
          "Acél csomópontok: a gyenge tengely körüli nyomatékokat már nem hagyja figyelmen kívül",
          "Elutasítás"
        ],
        [
          "18",
          "ACI 318 és EN 1992: a csavart betonrudakat nem ellenőrzöttként jelöli",
          "Elutasítás"
        ],
        [
          "19",
          "A vasbeton oszlopokat a legkisebb nyomóerejük mellett is ellenőrzi (SA-2026-041)",
          "Javítás"
        ],
        [
          "20",
          "Tehergenerátor: az alacsony tetőszerkezet alá részben benyúló födém megtartja a felületi terheit (SA-2026-033)",
          "Javítás"
        ],
        [
          "21",
          "Az exportált héjábrák a képernyőn látható mezőt és skálát mutatják",
          "Javítás"
        ],
        [
          "22",
          "2D: a merev kapcsolat vagy tárcsa mögötti mechanizmust elutasítja",
          "Elutasítás"
        ],
        [
          "23",
          "Azoknak a rudaknak a 2D kihajlása, amelyek normálereje a hosszuk mentén változik (SA-2026-042)",
          "Javítás"
        ],
        [
          "24",
          "3D korotációs analízis több tengely körüli nagy elfordulásokkal (SA-2026-037)",
          "Javítás"
        ],
        [
          "25",
          "Y–Z vagy X–Y síkból kivágott 2D modell kényszerei (SA-2026-036)",
          "Javítás"
        ],
        [
          "26",
          "Egy rúd mértékadó értéke és a 2D burkoló a valódi csúcsot olvassa ki",
          "Javítás"
        ],
        [
          "27–29",
          "Visszatér az Alap mód három, a 15-ös verzió által visszavont változása, átnézve: képlékeny tönkremenetel, P-Δ és a nyomatéki hatásvonalak előjele",
          "Javítás"
        ]
      ]
    },
    {
      "k": "h",
      "t": "Az újraellenőrzési értesítés"
    },
    {
      "k": "p",
      "t": "Egy projekt megnyitásakor az alkalmazás összeveti a bélyegzőjét a nyilvántartással, és felsorolja azokat az azóta történt változásokat, amelyek az adott modellt érintik. Egy kihajlásszámítást tartalmazó síkbeli keret értesül a 2D kihajlás javításáról; egy beton nélküli acélkeret nem értesül a vasbeton oszlopok ellenőrzéséről. A lista nem egy eltűnő felugró üzenet: az értesítésnek nincs bezárógombja, figyelmen kívül hagyja az Esc billentyűt és a rajta kívüli kattintásokat, és csak úgy zárható be, ha bejelöli az „Elolvastam ezeket a változásokat” mezőt, és a folytatást vagy az újraszámítást választja."
    },
    {
      "k": "img",
      "base": "blog/results-recheck",
      "w": 1600,
      "h": 1000,
      "alt": "A Stabileo Alap módja megnyit egy síkbeli keretet a példák közül, amelyet a 15-ös eredményverzióval számítottan mentettek. Egy „Az eredmények megváltoztak a projekt legutóbbi számítása óta” című párbeszédablak felsorolja az őt érintő változásokat, köztük a változó normálerejű rudak 2D kihajlásának javítását és a valódi csúcsnál kiolvasott mértékadó értéket, mindegyiket a magyarázatával, és kéri, hogy a folytatás vagy az újraszámítás előtt jelölje be az „Elolvastam ezeket a változásokat” mezőt.",
      "caption": "A 15-ös verzióval számított síkbeli keret ma megnyitva: csak az ezt a modellt érintő változások szerepelnek a listán, mindegyik azzal, hogy mit kell újraellenőrizni."
    },
    {
      "k": "p",
      "t": "Amíg a modellt újra nem számítják, az eredményei elavultként vannak jelölve: egy sáv jelzi ezt, és minden közben exportált jelentés, munkafüzet és CSV STALE figyelmeztetést nyomtat az eredetadatai közé. Az „Analízis és méretezés újrafuttatása” újraszámít, és a PRO módban a már kiválasztott vasalással újraellenőrzi a betonrudakat; nem méretezi újra őket, mert az felülírná a mérnök betonacéljait."
    },
    {
      "k": "p",
      "t": "November 4. óta (#1406) az értesítés minden változást az olvasó nyelvén magyaráz el, az alkalmazás mind a hat nyelvén. Előtte a német, francia és török olvasók angolul kapták a címet és a magyarázatot: a 72 nyilvántartott változásból 66-nak nem volt szövege ezeken a nyelveken. Minden fordítást úgy ellenőriztünk, hogy az eredeti nélkül visszafordítottuk angolra, és összevetettük a jelentést: számok, előjelek, melyik teher, melyik ellenőrzés, biztonságos vagy a biztonság kárára tévedő oldal. Ez az ellenőrzés mindhárom nyelven javított mondatokat, és kimutatta, hogy négy angol magyarázat már a forrásban kétértelmű volt; ezeket mind a hat nyelven kijavítottuk."
    },
    {
      "k": "h",
      "t": "A javítás előtt: figyelmeztetés vagy elutasítás"
    },
    {
      "k": "p",
      "t": "Egy hibát általában a javítása előtt találunk meg, néha napokkal előtte. Ez idő alatt az általa érintett eredmény még látható a képernyőn. A szabály, amelyet követünk: előbb behatárolni, aztán javítani (#447-es issue): minden nyitott hiba, amely hibás eredményt adhat, minden általa érintett belépési ponton vagy figyelmeztetést, vagy elutasítást kap."
    },
    {
      "k": "ul",
      "items": [
        "A figyelmeztetés megtartja az eredményt, és mellette megmutatja, melyik ismert hiba érintheti, és mit kell kézzel ellenőrizni.",
        "Az elutasítás visszatartja az eredményt, és megmondja, miért, ha a szám nagy szorzóval tévedhet úgy, hogy a kimenetből ezt nem lehet észrevenni, például egy tényező, amely a rudak számozásától függően többszörösére változik."
      ]
    },
    {
      "k": "img",
      "base": "blog/results-refusal",
      "w": 1600,
      "h": 1000,
      "alt": "A Stabileo Alap módja a rejtett mechanizmus példájával: kétnyílású gerenda három, mind vízszintesen elmozduló görgős támaszon, 10 kN/m egyenletesen megoszló teherrel. A Számítás után nem rajzolódik ábra; a sarokban egy piros üzenet: „Instabil szerkezet (mechanizmus): egyik támasznál sincs vízszintes megtámasztás.”, és egy gomb a kinematikai vizsgálat megtekintéséhez.",
      "caption": "Ugyanez a szabály a nyilvántartáson kívül: a mechanizmust alkotó modell üzenetet kap, amely megmondja, miért, számokat viszont nem."
    },
    {
      "k": "p",
      "t": "A behatárolást egy nyilvántartás rögzíti, amely felsorol minden nyitott biztonsági kérdést, a hozzá tartozó figyelmeztetést vagy elutasítást, az azt kiváltó feltételt és a tesztet, amely igazolja, hogy működésbe lép, vagy a bizonyítékot arra, hogy nincs szükség behatárolásra. Egy teszt összhangban tartja a nyilvántartást és a motor ismert hibáinak listáját, egy ütemezett feladat pedig összeveti a nyilvántartást a GitHubon nyitott issue-kkal. A feltételek szándékosan szűkek: az eredménykorpusz 39 modellje közül minden figyelmeztetés legfeljebb kettőnél lép működésbe. A pull request, amely minden nyitott issue-ra teljessé teszi ezt a nyilvántartást (#807), november 5-én, a 0.5.0-s kiadás előtt került be."
    },
    {
      "k": "p",
      "t": "A behatárolás akkor ér véget, amikor a javítása bekerül, és ugyanabban a pull requestben ér véget. Ezen a héten a #1295 megszüntette azoknak a 3D-ről 2D-re vágásoknak az elutasítását, amelyek a rudakat rossz tengely körül hajlították, mert a vágás most már helyes; a #1301 a minden 3D korotációs számításnál megjelenő figyelmeztetést egy olyanra cserélte, amely csak akkor lép működésbe, ha egy rúdvég 0,02 radiánnál többet fordul el a húrjához képest, ahol a megmaradó közelítés számíthat."
    },
    {
      "k": "h",
      "t": "Az e heti javítások"
    },
    {
      "k": "p",
      "t": "2D kihajlás rúdirányú tengelyirányú terhekkel (#1324, 23-as verzió). Minden rúd geometriai merevsége az átlagos normálerejét használta. Ahol a nyomóerő a jobban elforduló vég felé nő, például szarufán a gravitációs terhek alatt, vagy a fesztávon belüli tengelyirányú koncentrált erőnél, a kihajlási tényező túl nagyra jött ki, és semmi sem figyelmeztetett rá. Most minden rúd integrálja a változó normálerejét."
    },
    {
      "k": "table",
      "caption": "Egyetlen rúd, λP·L²/EI. Forrás: SA-2026-042.",
      "head": [
        "Eset",
        "Pontos",
        "Előtte",
        "Most"
      ],
      "rows": [
        [
          "Konzol, a nyomóerő a támasznál 0-ról a végen P-re nő",
          "3,477",
          "4,972 (+43%)",
          "3,542 (+1,9%)"
        ],
        [
          "Konzol, P nyomóerő a végen és vele ellentétes P tengelyirányú teher a fesztáv közepén: P nyomóerő csak a fesztáv közepétől a végig",
          "2,961",
          "4,972 (+68%)",
          "3,056 (+3,2%)"
        ],
        [
          "Euler nehéz oszlopa, a nyomóerő a támasznál a legnagyobb",
          "7,837",
          "4,972 (−37%)",
          "7,889 (+0,7%)"
        ]
      ]
    },
    {
      "k": "p",
      "t": "A megmaradó néhány százalék a rudanként egy elemmel végzett diszkretizálás szokásos hibája, és csökken, ha a rudat felosztják. A P-Delta továbbra is az átlagos normálerőt használja, a rúdirányú terhekkel végzett 3D kihajlásszámítás pedig a saját javításáig megtartja a figyelmeztetését."
    },
    {
      "k": "p",
      "t": "3D korotációs analízis (#1301, 24-es verzió). A rúdvégek elfordulásait elfordulásvektorokként vonta ki, ami csak akkor pontos, ha minden elfordulás közös tengely körül történik. A Bathe–Bolourchi-féle 45°-os ív 1,3%-kal eltért a publikált megoldásától, és a háló sűrítése eltávolította a referenciáktól ahelyett, hogy közelítette volna. Az elfordulásokat most elfordulási mátrixokként komponálja: ugyanaz az ív két független publikált megoldástól 0,4%-on belül van, és a kettő között konvergál. Azt a rudat, amelynek végei egymáshoz képest 0,9π-nél többet fordulnak el, elutasítja, mert az eredményből nem derül ki, melyik teljes fordulatról van szó."
    },
    {
      "k": "p",
      "t": "Rejtett mechanizmus 2D-ben (#1298, 22-es verzió). Egy olyan csomópontból induló merev kapcsolat vagy tárcsa, amelynek minden rúdja csuklósan csatlakozik egy rácsrúd végéhez, mechanizmus, de a megoldó egy apró mesterséges rugóval megtartotta, és több száz kilométeres elmozdulásokat adott vissza, amelyeket aztán a tanúsítvány tanúsított. Az ilyen modellt most elutasítja. A javítás ehhez nem javasolt figyelmeztetést: a talált esetekben az elmozdulások abszurdak voltak, nagyjából 10⁵ m-esek, és az alkalmazás valószínű mechanizmusra utaló figyelmeztetésével együtt jelentek meg. Ez ezekről az esetekről alkotott ítélet, nem bizonyíték arra, hogy egyetlen érintett eredmény sem tűnt hihetőnek. Ami hibás volt, az a tanúsítvány állítása, és a verzióbejegyzés értesíti az érintett projekteket. Utána találtunk egy hasonló esetet, amelyben merev kapcsolat helyett összekötő elem szerepel (#1414); a javítása (#1415) november 5-én került be."
    },
    {
      "k": "p",
      "t": "Egy 3D modell 2D-re vágása (#1295). A vágás minden rúdnál a keresztmetszet erős tengelyére vett inerciáját használta, így az Y–Z vágásban az oszlopok, az X–Y vágásban a gerendák és a 90°-kal elforgatott rudak rossz tengely körül hajlottak: egy Y–Z síkban álló IPN 300-as portálkeret 2D-ben 0,96 mm-t lengett ki, 3D-ben 13,0 mm-t. Most minden rúd 2D-ben ugyanazon tengely körül hajlik, mint 3D-ben, és azokat a vágásokat, amelyeket egy síkbeli modell nem tud ábrázolni, elutasítja. Ennek a javításnak nincs eredményverziója, és ez szándékos: egy mentett 2D modell pontosan úgy számít, mint korábban, mert ami hibás volt, az a vágással előállított modell. Az újraellenőrzési értesítés nem éri el ezeket a fájlokat, ezért a figyelmeztetés (SA-2026-035) a csatorna: vágja ki újra a modellt a 3D-ből, vagy számítsa 3D-ben."
    },
    {
      "k": "h",
      "t": "A javítás után: figyelmeztetések"
    },
    {
      "k": "p",
      "t": "Az a hiba, amely egy kiadott verzióban hibás vagy a biztonság kárára tévedő eredményt adhatott, biztonsági figyelmeztetést kap: mi volt a hiba, mely modelleket érinti, hogyan ismerhetők fel, mit kell újraellenőrizni a már leadott eredményekben, és az eset, amely reprodukálja. Az e heti javításokhoz tartozó figyelmeztetések tervezete már a tárolóban van, és a 0.5.0-s kiadással jelenik meg, ahogy az SA-2026-001–024 a 0.3.0-val és a 0.4.0-val."
    },
    {
      "k": "table",
      "caption": "A 2026. november 4-én és 5-én beolvasztott javításokhoz készült figyelmeztetéstervezetek.",
      "head": [
        "Figyelmeztetés",
        "Mi volt a hiba",
        "Súlyosság"
      ],
      "rows": [
        [
          "SA-2026-033",
          "A tehergenerátor kihagyta egy födém felületi terheit, ha egy része fölött egy alacsony rúd haladt",
          "Magas"
        ],
        [
          "SA-2026-034",
          "Az egyensúlyi ellenőrzés egyezést mutatott olyan eseteknél, amelyeknél az ellenőrzés terheket hagyott ki",
          "Közepes"
        ],
        [
          "SA-2026-035",
          "A 3D-ről 2D-re vágás a rudakat a keresztmetszet rossz tengelye körül hajlította",
          "Magas"
        ],
        [
          "SA-2026-036",
          "Az Y–Z vagy X–Y síkban végzett 3D-ről 2D-re vágás úgy olvasta a kényszereket, mintha a keret az X–Z síkban állna",
          "Magas"
        ],
        [
          "SA-2026-037",
          "A 3D korotációs analízis kivonta egymásból az elfordulásvektorokat",
          "Közepes"
        ],
        [
          "SA-2026-040",
          "Az ACI 318 és EN 1992 szerinti ellenőrzések a csavarás ellenőrzése nélkül fogadták el a betonrudakat",
          "Magas"
        ],
        [
          "SA-2026-041",
          "A vasbeton oszlopok ellenőrzése a legnagyobb nyomatékot csak a legnagyobb nyomóerővel párosította",
          "Magas"
        ],
        [
          "SA-2026-042",
          "A 2D kihajlás túlbecsülte azoknak a rudaknak a tényezőjét, amelyekben a nyomóerő a hosszuk mentén nő",
          "Magas"
        ]
      ]
    },
    {
      "k": "img",
      "base": "blog/results-changelog",
      "w": 1600,
      "h": 1000,
      "alt": "A Stabileo változásnaplójának oldala a honlapon: elöl a legújabb, november 6-i bejegyzés, „Hibás eredmények javítva a méretezési ellenőrzésekben és a dinamikában, javított generált terhek, és teljessé vált a PRO számítási módja” címmel, amely a motor változásaival kezdődik, bal oldalon pedig területenkénti szűrők.",
      "caption": "A változásnapló oldala, elöl a legújabbal, amely az e heti, eredményt megváltoztató javításokkal kezdődik."
    },
    {
      "k": "h",
      "t": "Amit ez nem tesz meg"
    },
    {
      "k": "ul",
      "items": [
        "Az értesítés csak a nyilvántartott változásokról tud. A még meg nem talált hiba egyetlen nyilvántartásban sem szerepel; erre szolgál a megoldó mögötti ellenőrzés, és ezt fedi le a behatárolás, amint valamit megtalálunk.",
        "A modell jellemzőit a mentett fájlból olvassa ki, és ha nem tudja eldönteni, a jellemzőt meglévőnek tekinti: jobb egy értesítéssel több, mint egy változás, amely rejtve marad az általa érintett modell elől.",
        "Nem tudja követni a számot, ha az elhagyja az alkalmazást, egy rajzban, egy táblázatban vagy egy már leadott jelentésben. Erre szolgál a figyelmeztetés.",
        "Akár behatárolt, akár elutasított, akár javított, az eredményt aláírás előtt továbbra is a mérnöknek kell ellenőriznie."
      ]
    },
    {
      "k": "link",
      "slug": "safety-advisories",
      "t": "Minden közzétett figyelmeztetés, mindegyiknél azzal, hogy mit kell újraellenőrizni:"
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/verification/PROVENANCE.md",
      "label": "Újraellenőrzési értesítés, eredet és reprodukálhatóság",
      "t": "Hogyan működnek az eredményverziók, a bélyegzők és az értesítés, részletesen:"
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/README.md",
      "label": "A biztonsági figyelmeztetések jegyzéke",
      "t": "A figyelmeztetések, a 0.5.0-hoz készült tervezetekkel együtt:"
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/issues/447",
      "label": "#447-es issue: előbb behatárolni, aztán javítani",
      "t": "A behatárolási irányelv és a haladása:"
    }
  ]
};

export default body;
