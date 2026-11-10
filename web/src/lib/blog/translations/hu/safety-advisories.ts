import type { PostBody } from '../../types';

const body: PostBody = {
  "title": "Biztonsági figyelmeztetések: mely eredmények változtak és mi a teendő",
  "excerpt": "A Stabileo azon hibái, amelyek hibás vagy a biztonság kárára tévedő eredményt adhattak: kiket érintenek, hogyan derül ki, hogy egy modell érintett-e, mi a teendő addig, és mikor javították őket.",
  "blocks": [
    {
      "k": "p",
      "t": "A Stabileo eredményeit valódi szerkezetek tervezéséhez használják. Ha olyan hibát találunk, amely hibás, különösen a biztonság kárára tévedő eredményt adhatott, biztonsági figyelmeztetésként tesszük közzé: mi volt a hiba, mely modelleket érinti, hogyan ismerhetők fel, mi a teendő, amíg a javítás élesbe nem kerül, és mit kell újraellenőrizni a már felhasznált eredményekben."
    },
    {
      "k": "p",
      "t": "Ezeknek a hibáknak szinte mindegyikét a saját ellenőrzési programunk találta meg: összevetés hét másik végeselemes programmal, publikált mintapéldák, fizikai invariánsokra épülő tesztek és minden elem levezetésének átvizsgálása. A közzétételük ennek a munkának a része: egy hiba, amelyet nem jelentenek, benne marad a már leadott számításokban."
    },
    {
      "k": "note",
      "t": "Állapot 2026. november 9-én: az SA-2026-001–020 a 0.3.0-s, az SA-2026-021–024 a 0.4.0-s, az SA-2026-025–047 pedig a 0.5.0-s verzióban javult (az SA-2026-040 kezelve van: az ellenőrzés hiányosként van jelölve), kivéve az SA-2026-044-et: a 2D képlékeny tönkremenetel számítását a program a #758 lezárásáig elutasítja. Az SA-2026-048 a 0.5.0-s verzió után javult, és 2026. november 8. óta él a stabileo.com-on. Az SA-2026-049, az SA-2026-050, az SA-2026-051, az SA-2026-052 és az SA-2026-053 a 0.5.0-s verzió után javult, és 2026. november 9. óta él a stabileo.com-on. A közzétételük annak része, ahogyan az eredményeket ellenőrizzük, nem annak jele, hogy még nyitottak. Egy figyelmeztetés akkor számít javítottnak, amikor a javítás élesben fut a stabileo.com-on, nem akkor, amikor a módosítás elkészült. Amíg egy figyelmeztetés nyitott, alkalmazza a benne leírt kerülőmegoldást, és aláírás előtt ellenőrizze kézzel az érintett eredményt."
    },
    {"k": "img", "base": "blog/recheck-stale", "w": 1600, "h": 1000, "alt": "Stabileo PRO egy vasbeton kerettel, amelyet még az eredmények verziózása előtt mentettek. Alul egy sáv jelzi, hogy az eredmények elavultak, mert a projektet legutóbb egy régebbi verzióval számították, és 19 nyilvántartott változás érinti; mellette a változások megtekintésére és az újraszámításra szolgáló gombok.", "caption": "Így jut el egy javítás egy mentett projekthez: amíg újra nem számítják, az eredményei elavultként vannak jelölve, és az őt érintő változások egy kattintásnyira vannak."},
    {
      "k": "h",
      "t": "Összefoglaló"
    },
    {
      "k": "table",
      "caption": "Közzétett figyelmeztetések. Súlyosság: kritikus, ha a teherbírás vagy az igénybevétel látható jel nélkül jelentősen a biztonság kárára térhetett el.",
      "head": [
        "Figyelmeztetés",
        "Tárgy",
        "Súlyosság",
        "Állapot"
      ],
      "rows": [
        [
          "SA-2026-021",
          "Szabadon álló tetők: gerincirányú szél nem volt, keresztirányban pedig kevesebb a §2.1.5 szerinti minimumnál (20 m/s-nál annak 17%-a)",
          "Magas",
          "Javítva: 0.4.0"
        ],
        [
          "SA-2026-022",
          "H földnyomás esetén hiányzott az a kombináció, amelyben az állandó teher ellenáll neki (egy példában 27–45%-kal kevesebb)",
          "Magas",
          "Javítva: 0.4.0"
        ],
        [
          "SA-2026-023",
          "Vasbeton oszlopok: az ellenőrzés a nyomatéknak csak az egyik előjelét vette figyelembe; az aszimmetrikus vasalási elrendezések (6, 10, 14…) az erősebb oldalon megfeleltek",
          "Kritikus",
          "Javítva: 0.4.0"
        ],
        [
          "SA-2026-024",
          "Az alapok, csomópontok, födémek, falak és az acél-optimalizáló a parciális tényezők nélküli terhekre méretezett, ha a kombinációk definiálva voltak, de nem voltak kiszámítva (élő számítás, sikertelen kombinációszámítás vagy üres aktív lista)",
          "Magas",
          "Javítva: 0.4.0"
        ],
        [
          "SA-2026-039",
          "Excel- és IFC-import: a téglalap- és csőszelvények Iy és Iz értéke fel volt cserélve (egy 20 × 40-es konzol 4-szer túl hajlékony, egy 40 × 20-as 4-szer túl merev)",
          "Magas",
          "Javítva: 0.5.0"
        ],
        [
          "SA-2026-027",
          "Héjak burkolója: a legnagyobb von Mises-feszültségű kombinációt tartotta meg, nem az egyes komponensek szélsőértékét (egy példában mx 14%-kal kevesebb)",
          "Magas",
          "Javítva: 0.5.0"
        ],
        [
          "SA-2026-028",
          "EN 1992-1-1 hajlítás (PRO, egyéb szabványok, tanúsított): feltételezte, hogy a húzott vasalás megfolyik, és nem iterált a felső betonacélokra; MRd akár 22%-kal több",
          "Magas",
          "Javítva: 0.5.0"
        ],
        [
          "SA-2026-029",
          "3D: az alkalmazás a CIRSOC 201 szerinti oszlopokat Mz-re a keresztmetszet magassága mentén méretezte (egy példában 36%-kal kevesebb vasalás); a motor tanúsított 3D ellenőrzései az oldalirányú Vy nyíróerőt gerincnyírásként olvasták",
          "Kritikus",
          "Javítva: 0.5.0"
        ],
        [
          "SA-2026-030",
          "CIRSOC 301 nyomás: egy keresztmetszet, amelynek területe kisebb a lemezei összegénél, negatív Qa-t és a képlékeny nyomási teherbírásnál nagyobb teherbírást kapott, és megfelelt",
          "Magas",
          "Javítva: 0.5.0"
        ],
        [
          "SA-2026-031",
          "Időtörténeti analízis: a t = 0-kor tömeg nélküli szabadságfokra működtetett teher az első lépésben elveszett (a reciprocitás akár 33-szoros eltéréssel, egy kétszabadságfokú lánc 24%-kal eltért a zárt alakú megoldástól)",
          "Közepes",
          "Javítva: 0.5.0"
        ],
        [
          "SA-2026-032",
          "Modális analízis: egy mechanizmus nulla frekvenciájú rezgésalakja kimaradt, a többi rezgésalakot pedig teljesként adta vissza",
          "Közepes",
          "Javítva: 0.5.0"
        ],
        [
          "SA-2026-035",
          "3D-ről 2D-re váltás: a metszet a rudakat a keresztmetszet rossz tengelye körül hajlította (egy Y–Z síkú portálkeret 13,5-szer túl merev)",
          "Magas",
          "Javítva: 0.5.0"
        ],
        [
          "SA-2026-040",
          "ACI 318 és EN 1992 szerinti ellenőrzések: a vasbeton rudak a csavarás ellenőrzése nélkül feleltek meg",
          "Magas",
          "Kezelve: 0.5.0"
        ],
        [
          "SA-2026-041",
          "Vasbeton oszlopok: a legnagyobb nyomatékot csak a legnagyobb nyomóerővel együtt ellenőrizte",
          "Magas",
          "Javítva: 0.5.0"
        ],
        [
          "SA-2026-033",
          "Tehergenerátor: az a födém, amelynek egy része fölött egy alacsony rúd haladt, a teljes felületi terhét elvesztette (egy példában egy 6 × 6 m-es födém 36 m²-e); a rácsos tartók nem számítottak tetőszerkezetnek",
          "Magas",
          "Javítva: 0.5.0"
        ],
        [
          "SA-2026-034",
          "Az egyensúlyi ellenőrzés egyezőnek jelezte a terheket és a támaszerőket olyan eseteknél is, amelyeknél az ellenőrzés terheket hagyott ki; a hasonló emeletek szerkesztése a másik típus rúdjaira is hatott, a másolatok pedig elvesztették a csuklóikat",
          "Közepes",
          "Javítva: 0.5.0"
        ],
        [
          "SA-2026-038",
          "3D kihajlás: azoknál a rudaknál, amelyekben a tengelyirányú terhek miatt a nyomóerő a rúd mentén nő, a tényező túl nagy lett (egy rúdnál +43%), a csak a végei között nyomott rudat pedig elutasította",
          "Magas",
          "Javítva: 0.5.0"
        ],
        [
          "SA-2026-042",
          "2D kihajlás: azoknál a rudaknál, amelyekben a tengelyirányú terhek miatt a nyomóerő a rúd mentén nő, a tényező túl nagy lett (egy rúdnál +43% és +68% között)",
          "Magas",
          "Javítva: 0.5.0"
        ],
        [
          "SA-2026-044",
          "2D képlékeny tönkremenetel: a tönkremeneteli tényező változott a csomópontok számozásával, a rúdirányokkal és a mértékegységekkel (ugyanazon a szerkezeten akár 4,6-szeresére)",
          "Magas",
          "A 0.5.0-ban nincs javítva: a 2D képlékeny tönkremenetel a #758 lezárásáig nem érhető el; a határteherbírás-számítás benne van a 0.5.0-ban"
        ],
        [
          "SA-2026-043",
          "Harmonikus analízis: az elhagyott rezgésalakok korrekciója elvesztette a pontosságát, ha egy rezgésalak sokkal hajlékonyabb volt a többinél (egy példában 79-szeres eltérés 2,3 Hz-en)",
          "Magas",
          "Javítva: 0.5.0"
        ],
        [
          "SA-2026-045",
          "3D képlékeny tönkremenetel: a használható képlékeny nyomaték nélküli rudat soha meg nem folyó rúdként kezelte (egy példában 6-szor nagyobb, és tanúsítva)",
          "Magas",
          "Javítva: 0.5.0"
        ],
        [
          "SA-2026-046",
          "Harmonikus analízis: terhenként választott a modális szuperpozíció és a közvetlen megoldás között, így a szuperpozíció és a reciprocitás sérült (egy példában 107% egy csomópontban); a stabileo.com és a main ág motor/WASM buildjei 2026. november 5-től a javításig",
          "Magas",
          "Javítva: 0.5.0"
        ],
        [
          "SA-2026-047",
          "Héjak: az a tehereset, amely támaszelmozdulást írt elő, elvesztette a héjfeszültségeit, a kombinációk és burkolók pedig csak a többi eset héjfeszültségeit összegezték (a biztonság kárára tévedhetett, figyelmeztetés nélkül); 0.2.0–0.4.0",
          "Magas",
          "Javítva: 0.5.0"
        ],
        [
          "SA-2026-048",
          "CIRSOC 301 acél: a Cb nem vette figyelembe az előjelváltást a rúdnál rövidebb, megadott megtámasztatlan hossz végein (egy kétszeres görbületű U-szelvény Cb = 2,55-öt kapott 1 helyett, így túlbecsülte a kifordulási teherbírást); 0.2.0–0.5.0, az asztali alfaverziók és a stabileo.com 2026. november 8-ig",
          "Magas",
          "0.5.0 után javítva; 2026. november 8. óta a stabileo.com-on"
        ],
        [
          "SA-2026-049",
          "Támaszok pozitív rugóval és merev megtámasztással ugyanazon a szabadságfokon: 3D-ben a rugó feloldotta a megtámasztást és megváltoztatta a peremfeltételt; a motor kódja a 0.2.0–0.5.0 verziókban",
          "Magas",
          "0.5.0 után javítva; 2026. november 9. óta a stabileo.com-on"
        ],
        [
          "SA-2026-050",
          "A kihajlásszámítás egy sikertelen karcsúságszámítást nullává alakíthatott, a többeseti analízis pedig nem véges értékeket adhatott vissza egy sikeres eredményen belül",
          "Közepes",
          "0.5.0 után javítva; 2026. november 9. óta a stabileo.com-on"
        ],
        [
          "SA-2026-051",
          "3D mozgó terhek: a burkolók nem találták meg a belső igénybevételi csúcsokat, és ferde rudakon elvesztették a tengelyterhelés tengelyirányú összetevőjét, így figyelmeztetés nélkül alábecsülhették az igénybevételt; 0.2.0–0.5.0 és desktop-v0.1.0-alpha.1–alpha.3",
          "Magas",
          "0.5.0 után javítva; 2026. november 9. óta a stabileo.com-on"
        ],
        [
          "SA-2026-052",
          "A motor 2D és 3D mozgó terhei: állandó, részleges tengelyirányú megoszló terhek mellett a normálerő-burkolók nem találták meg a szélsőértékeket a teherszakaszok határain, az állomások között, így figyelmeztetés nélkül alábecsülhették az igénybevételt; kiadott verzióhoz kötött határt nem állítunk",
          "Magas",
          "0.5.0 után javítva; 2026. november 9. óta a stabileo.com-on"
        ],
        [
          "SA-2026-053",
          "2D és 3D mozgó terhek: a végpontokon álló koncentrált erők a rúdon kívüli erőket is beszámították a burkolókba, hamis normál- és nyíróerő-szélsőértékeket adva és túlbecsülve az igénybevételt; kiadott verzióhoz kötött határt nem állítunk",
          "Alacsony",
          "0.5.0 után javítva; 2026. november 9. óta a stabileo.com-on"
        ],
        [
          "SA-2026-037",
          "3D korotációs analízis: az elfordulásvektorokat kivonta egymásból (a Bathe–Bolourchi-féle ív 1,3%-kal eltért, és sűrítéssel sem csökkent)",
          "Közepes",
          "Javítva: 0.5.0"
        ],
        [
          "SA-2026-036",
          "3D-ről 2D-re váltás Y–Z vagy X–Y síkban: a kényszereket úgy olvasta, mintha a keret az X–Z síkban állna (az oldalirányú kapcsolatok kimaradtak vagy síkon kívül hatottak)",
          "Magas",
          "Javítva: 0.5.0"
        ],
        [
          "SA-2026-013",
          "Görbült héjak: a hajlítónyomatékok nullaként jelentek meg; a feszültségek megtartották a szabad hőmérsékleti alakváltozást",
          "Magas",
          "Javítva: 0.3.0"
        ],
        [
          "SA-2026-014",
          "3D képlékeny tönkremenetel: a tényező az elemek számozásától függött (akár a tönkremeneteli teher 2,4-szerese)",
          "Magas",
          "Javítva: 0.3.0"
        ],
        [
          "SA-2026-015",
          "Önsúllyal terhelt kötelek túl kis húzóerőt kaptak statikailag határozatlan szerkezetekben",
          "Magas",
          "Javítva: 0.3.0"
        ],
        [
          "SA-2026-011",
          "Rugóból befogásra vagy csuklóra átállított 3D támasz rugóként számítva",
          "Magas",
          "Javítva: 2026. október 20."
        ],
        [
          "SA-2026-017",
          "Talaj–szerkezet kölcsönhatás: a p-y, t-z és q-z görbék eltértek a hivatkozott forrásoktól",
          "Magas",
          "Javítva: 0.3.0"
        ],
        [
          "SA-2026-008",
          "Válaszspektrum: CQC mellett SRSS szerinti talpnyíróerő; a részvételi tényezők a támaszokhoz kapcsolt tömeg nélkül",
          "Magas",
          "Javítva: 2026. október 21."
        ],
        [
          "SA-2026-007",
          "3D kihajlás csavarási és hajlító-csavaró kihajlási alakok nélkül",
          "Magas",
          "Javítva: 2026. október 21."
        ],
        [
          "SA-2026-006",
          "3D-ben számított síkbeli modell: a csomóponti nyomatékok és az előírt elfordulások előjele megfordult",
          "Magas",
          "Javítva: 2026. október 21."
        ],
        [
          "SA-2026-005",
          "Ferde 2D rudak: normálerő a teher rúdirányú összetevője nélkül",
          "Magas",
          "Javítva: 2026. október 21."
        ],
        [
          "SA-2026-019",
          "Rudak hőmérsékleti terhei (motor és WASM; az alkalmazás 2026.10.07. óta kompenzálta): az acél α-ja és egy tömör téglalap magassága",
          "Közepes",
          "Javítva: 0.3.0"
        ],
        [
          "SA-2026-012",
          "Anyagi nemlinearitást figyelembe vevő analízis (csak motor és WASM): rugalmas rúderők a megfolyás után",
          "Közepes",
          "Javítva: 0.3.0"
        ],
        [
          "SA-2026-016",
          "Ívek (a motor görbe rúdjai, az alkalmazás ív eszköze): Iy és Iz felcserélve a közel függőleges szakaszokon",
          "Közepes",
          "Javítva: 0.3.0"
        ],
        [
          "SA-2026-018",
          "MITC9 héjak (csak motor és WASM) görbült geometrián merevtest-mozgásból alakváltozást kaptak",
          "Közepes",
          "Javítva: 0.3.0"
        ],
        [
          "SA-2026-020",
          "3D anyagi nemlinearitást figyelembe vevő analízis (csak motor és WASM): a folyási felület kevésbé konzervatív, mint 2D-ben",
          "Közepes",
          "Javítva: 0.3.0"
        ],
        [
          "SA-2026-025",
          "AISC 360 G2 nyírás (csak motor és WASM): gerincterület nélkül 0 kihasználtsággal megfelelt, és tanúsított volt",
          "Közepes",
          "Javítva: 0.5.0"
        ],
        [
          "SA-2026-026",
          "EC3 6.2.6 nyírás (csak motor és WASM): nyírt terület nélkül Av = 0,5·A-t vett fel, HEB 300-nál Vpl,Rd 57%-kal nagyobb, és tanúsított",
          "Közepes",
          "Javítva: 0.5.0"
        ],
        [
          "SA-2026-010",
          "A spektrális tanúsítvány nem véges eredményeket is elfogadott",
          "Közepes",
          "Javítva: 2026. október 19."
        ],
        [
          "SA-2026-009",
          "Az SHB8 tömör héjelem vékonylemez-hajlításban 22%-kal túl merev (a lehajlások 18%-kal kisebbek)",
          "Közepes (statikailag határozatlan szerkezetekben magasabb)",
          "Javítva: 2026. október 19."
        ],
        [
          "SA-2026-004",
          "A modell egy részét figyelmen kívül hagyó számítások (dinamika, kihajlás, képlékeny tönkremenetel)",
          "Kritikus",
          "Javítva: 0.2.0"
        ],
        [
          "SA-2026-003",
          "Az acél-, hidegen alakított szelvényű és kapcsolati ellenőrzések túlbecsülték a teherbírást",
          "Kritikus",
          "Javítva: 0.2.0"
        ],
        [
          "SA-2026-002",
          "A betonellenőrzések (CIRSOC 201, ACI 318) túlbecsülték a teherbírást",
          "Kritikus",
          "Javítva: 0.2.0"
        ],
        [
          "SA-2026-001",
          "A generált kombinációk és terhek (CIRSOC 101, 102, 103) a biztonság kárára tévedtek",
          "Magas",
          "Javítva: 0.2.0"
        ]
      ]
    },
    {
      "k": "table",
      "caption": "Az egyes figyelmeztetésekben dokumentált esetek: a helyes érték és az, amelyet a Stabileo közölt.",
      "head": [
        "Figyelmeztetés",
        "Eset",
        "Helyes",
        "Közölt",
        "Mértékegység"
      ],
      "rows": [
        [
          "SA-2026-024",
          "6 × 4 m-es portálkeret, 20 kN/m állandó teher a gerendán, 15 kN szél, 1,2D + 1,6W, élő számítás melletti szerkesztés után: a szél felőli alap függőleges támaszereje",
          "65,61",
          "56,01",
          "kN"
        ],
        [
          "SA-2026-023",
          "30×30 cm-es oszlop, 6 Ø20 (három az alsó oldalon), Nu = 100 kN: φMn nyomott hárombetonacélos oldallal",
          "78,57",
          "101,57",
          "kN·m"
        ],
        [
          "SA-2026-013",
          "Négy görbült héjelemből álló konzol, 4 × 1 × 0,2 m, 10 kN a végén: mx a befogási elemben",
          "35,0",
          "0",
          "kN·m/m"
        ],
        [
          "SA-2026-014",
          "10 rudas térbeli keret (frame3d-2), átszámozva: képlékeny tönkremeneteli tényező",
          "176,47",
          "424,3",
          "—"
        ],
        [
          "SA-2026-015",
          "20 m-es kipányvázott árboc, 1 cm²-es acél kikötőkötél, 5 kN a csúcson: a kötélerő",
          "5,18",
          "4,34",
          "kN"
        ],
        [
          "SA-2026-011",
          "Gerenda 0, 4 és 8 m-nél, a 8 m-es támasz befogásként rajzolva: lehajlás ennél a támasznál",
          "0",
          "-14,4",
          "mm"
        ],
        [
          "SA-2026-017",
          "Puha agyag, c = 20 kPa, D = 1 m, z = 4 m: a talaj határellenállása, p_u",
          "124",
          "84",
          "kN/m"
        ],
        [
          "SA-2026-008",
          "Két rezgésalak ω-nál és 1,1ω-nál: talpnyíróerő a CQC-értékhez viszonyítva",
          "1,00",
          "0,81",
          "—"
        ],
        [
          "SA-2026-007",
          "200×10 mm-es kereszt szelvényű oszlop, 1,5 m: kritikus teher",
          "2993",
          "5860",
          "kN"
        ],
        [
          "SA-2026-006",
          "Portálkeret csomóponti nyomatékokkal és erőkkel: oldalirányú elmozdulás",
          "0,92",
          "2,52",
          "mm"
        ],
        [
          "SA-2026-005",
          "Nyeregtető szarufája: normálerő a talpnál",
          "-56,67",
          "-41,67",
          "kN"
        ],
        [
          "SA-2026-019",
          "Mindkét végén befogott IPE 300, 20 °C-os hőmérséklet-különbség: végnyomaték",
          "14,04",
          "9,76",
          "kN·m"
        ],
        [
          "SA-2026-012",
          "Megfolyt 4 m-es konzol, végteher 1,2·Mp/L: nyomaték a befogásnál",
          "1012,5",
          "101250",
          "kN·m"
        ],
        [
          "SA-2026-016",
          "Félkör alakú, 5 m-es ív az Y–Z síkban, 40 szakasz: a tetőpont lehajlása",
          "-7,29",
          "-6,18",
          "mm"
        ],
        [
          "SA-2026-018",
          "2×2 m-es hengeres MITC9-folt, 0,2 m-es ívmagasság, acél, 50 mm, 1 mrad merev elfordulás: a legnagyobb csomóponti von Mises-feszültség",
          "0",
          "101",
          "MPa"
        ],
        [
          "SA-2026-020",
          "4 m-es 3D konzol, N = 0,5·Np, végteher: a teher az első megfolyáskor",
          "158,2",
          "182,7",
          "kN"
        ],
        [
          "SA-2026-009",
          "Hajlított vékony lemez, ν = 0,3: merevség a helyes értékhez viszonyítva",
          "1,000",
          "1,225",
          "—"
        ]
      ]
    },
    {
      "k": "h",
      "t": "SA-2026-021: minimális szélteher szabadon álló tetőkön"
    },
    {
      "k": "p",
      "t": "Egy szabadon álló tető (nyitott szín, gépkocsibeálló, előtető) csak a 2.4-4–2.4-7. ábra szerinti, a tetőre merőleges nettó nyomásokat kapta. A CIRSOC 102-2025 §2.1.5 azt is előírja, hogy egy nyitott épületre ható szélerő legalább 0,75 kN/m² × Af legyen, külön vízszintes teheresetként. E minimum nélkül gerincirányú szélnél a vízszintes erő nulla volt, keresztirányban pedig kis és közepes sebességeknél a minimum alá esett. Most minden irányhoz tartozik ilyen tehereset."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-021-free-roof-wind-minimum.md",
      "label": "Az SA-2026-021 teljes szövege",
      "t": "A figyelmeztetés, a mérésekkel:"
    },
    {
      "k": "h",
      "t": "SA-2026-022: az állandó teher által ellensúlyozott földnyomás"
    },
    {
      "k": "p",
      "t": "H terhek esetén a CIRSOC 101-2025 a nem működő terhek hatásait is megköveteli. A 0,9 D + 1,6 H és az 1,2 D + 1,6 H kombináció sosem generálódott, így ahol az állandó teher ellenáll a földnyomásnak (egy fal felborulásánál vagy elcsúszásánál), a hatás túl kicsire jött ki. Most generálódnak, akár van szél vagy földrengés a modellben, akár nincs."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-022-earth-pressure-dead-load-resisting.md",
      "label": "Az SA-2026-022 teljes szövege",
      "t": "A figyelmeztetés, a példával:"
    },
    {
      "k": "h",
      "t": "SA-2026-023: vasbeton oszlopok aszimmetrikus vasalási elrendezéssel"
    },
    {
      "k": "p",
      "t": "A metszeti nyomatékok abszolút értékként jutnak el az oszlopellenőrzéshez, a normálerő és egytengelyű hajlítás melletti teherbírást viszont csak az egyik előjelre számította, nyomott felső oldallal. 6, 10, 14, 18 vagy 22 betonacél esetén a méretező a többlet betonacélokat az alsó és a jobb oldalra teszi, így ez az erős előjel: fordított nyomatéknál a teherbírás kisebb, és ezt sosem ellenőrizte. Egy 30×30 cm-es, 6 Ø20-szal vasalt oszlop 100 kN nyomóerő mellett az egyik irányban 101,57 kN·m-t, a másikban 78,57-et visel el, és Mu = 100 kN·m-re megfelelt. A CIRSOC 201 szerinti, egytengelyű hajlításra végzett oszlopellenőrzést érinti (a rúdban lévő vasalásét, a méretezőét és a motor utóellenőrzéséét); a kéttengelyű ellenőrzés már eddig is a legkedvezőtlenebb negyedet vette."
    },
    {
      "k": "ul",
      "items": [
        "Hogyan derül ki, hogy érinti-e: a modellben CIRSOC 201 szerint ellenőrzött betonoszlopok vannak, amelyek vasalása nem szimmetrikus a hajlítás tengelyére: a méretező 6, 10, 14, 18 vagy 22 betonacélos elrendezése, vagy kézzel megadott oldalak, ahol a szemközti oldalakon eltér a betonacélok száma.",
        "Mi a teendő: a javítás előtti verzióban használjon szimmetrikus elrendezést (4, 8, 12, 16, 20 vagy 24 betonacél, vagy egyforma szemközti oldalak), vagy ellenőrizze az oszlopot tükrözött vasalással is: a két teherbírás közül a kisebb a mértékadó.",
        "Állapot: javítva a 0.4.0-s verzióban, 2026. október 25. óta él a stabileo.com-on. A motor mindkét előjelet kiszámítja, és a gyengébbet veszi; a szimmetrikus elrendezések pontosan ugyanazt adják, mint korábban."
      ]
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-023-column-moment-sign.md",
      "label": "Az SA-2026-023 teljes szövege",
      "t": "A figyelmeztetés, a tesztesettel:"
    },
    {
      "k": "h",
      "t": "SA-2026-024: alapok, csomópontok, födémek és falak parciális tényezők nélküli terhekre méretezve"
    },
    {
      "k": "p",
      "t": "Ha voltak definiált kombinációk, de egyiket sem számították ki, az alapok és a csomópontok a képernyőn látható eredményt olvasták, ami ilyenkor az összes teher 1-es tényezővel: a használati terhekre méreteztek a tényezős kombinációk helyett. Ez történt bekapcsolt élő számításnál (szerkesztés után csak az „Összes teher” esetet számítja újra, amíg az egyedi nézet látszik), vagy ha a kombinációk számítása sikertelen volt, és az egyedi számítás lépett a helyébe. Egy portálkeretben 1,2D + 1,6W mellett egy alap támaszereje 15%-kal kisebbre jött ki; állandó és hasznos teherrel 29–38%-kal. Ugyanez történt a födémekkel és a falakkal, az acél-optimalizálóval és üres aktív kombinációlista esetén. Most minden méretezés megtagadja a futást, és megmondja, miért, amíg a kombinációk nincsenek kiszámítva."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-024-design-on-unfactored-results.md",
      "label": "Az SA-2026-024 teljes szövege",
      "t": "A figyelmeztetés, a példával:"
    },
    {
      "k": "h",
      "t": "SA-2026-014: a 3D képlékeny tönkremenetel függött a számozástól"
    },
    {
      "k": "p",
      "t": "Kéttengelyű hajlításnál azok az ellenőrzések, amelyek bezárják a visszafelé forduló csuklót, és újranyitják a folyási felületen kívülre tolt zárt csuklót, ciklusba kerülhettek. A megoldó abból az állapotból folytatta, amelyben az elemek sorrendje hagyta, és egy zárt keresztmetszetet átnyomott a folyási felületen: ugyanaz a szerkezet átszámozva 75,9 és 424,3 közötti tönkremeneteli tényezőket adott a tanúsított 176,47 helyett. Az analízis most az utolsó konzisztens állapotban megáll, és azt a tényezőt alsó korlátként adja meg, figyelmeztetéssel, bármilyen számozás mellett ugyanazt. A Pro lap 3D pushover-analízisét érinti."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-014-plastic-3d-element-order.md",
      "label": "Az SA-2026-014 teljes szövege",
      "t": "A figyelmeztetés, a tesztmodellel és a tanúsított értékkel:"
    },
    {
      "k": "h",
      "t": "SA-2026-011: rugóról befogásra átállított 3D támasz"
    },
    {
      "k": "p",
      "t": "Egy rugós támasz típusának megváltoztatásakor a rugóállandók megmaradtak. 3D módban a megtámasztással együtt eljutottak a megoldóhoz, amely azt a szabadságfokot rugalmasnak tekintette: a befogásként rajzolt támaszt rugóként számította. A 3D módban számított modelleket érinti, beleértve a 3D-ben számított síkbeli modelleket is; a 2D módot nem."
    },
    {
      "k": "ul",
      "items": [
        "Hogyan derül ki, hogy érintett-e: egy támasz előbb rugó volt (vagy rugóállandói voltak), majd befogásra, csuklós vagy görgős támaszra változtatták, vagy valamelyik szabadságfokát megtámasztottként jelölték be. Az eredményekben ennél a támasznál nem nulla elmozdulás vagy elfordulás látszik.",
        "Mi a teendő: számítsa újra a stabileo.com-on azokat a 3D modelleket, amelyek támaszait rugósról merevre szerkesztették, és vesse össze a támaszok környéki eredményeket a már felhasználtakkal.",
        "Állapot: javítva a stabileo.com-on 2026. október 20-án. Minden megtámasztott szabadságfokot megtámasztottként számít, a korábban mentett projektekben is."
      ]
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-011-springs-on-fixed-supports.md",
      "label": "Az SA-2026-011 teljes szövege",
      "t": "A figyelmeztetés a reprodukcióval és a tesztmodellel:"
    },
    {
      "k": "h",
      "t": "SA-2026-013: görbült héjak nyomatékai és hőmérsékleti feszültségei"
    },
    {
      "k": "p",
      "t": "A görbült héjak (görbültként jelölt négyszögelemek) a hajlítástól függetlenül mx = my = mxy = 0 értéket adtak, hőmérsékleti teher alatt pedig a feszültségeik megtartották a szabad hőmérsékleti alakváltozást: egy szabadon táguló héj E·α·ΔT/(1−ν) feszültséget mutatott, egy megtámasztott pedig semmit. Az alkalmazás ráadásul a görbült négyszögelem hőmérsékletét sík négyszögelemként küldte, amit a motor elvetett: a héjat felmelegítés nélkül számította. Ezeket az eredményeket a héjak szintvonalas ábrái (az exportált ábrákon is), a Pro eredménytáblázata és PDF-jelentése, valamint a födémméretezés olvasta, ha egy mező görbült négyszögelem volt; az eredményeket tartalmazó munkafüzet és a CSV ezeket a nyomatékokat már eddig is üresen hagyta."
    },
    {
      "k": "ul",
      "items": [
        "Hogyan derül ki, hogy érinti-e: a modellben görbült négyszögelemek vannak, és felhasználta a nyomatékaikat (szintvonalas ábrák, a Pro táblázata vagy jelentése, födémméretezés), vagy egy görbült négyszögelemen hőmérsékleti teher van.",
        "Mi a teendő: futtassa újra ezeket a modelleket, és ismételjen meg minden méretezést vagy ellenőrzést, amely a nyomatékaikat vagy a hőmérsékleti teher alatti feszültségeiket használta. Addig modellezze a felületet sík négyszögelemekkel (MITC4).",
        "Állapot: javítva a 0.3.0-s verzióban, 2026. október 21. óta él a stabileo.com-on."
      ]
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-013-curved-shell-moments-and-thermal.md",
      "label": "Az SA-2026-013 teljes szövege",
      "t": "A figyelmeztetés, a tesztkonzollal és a hőmérsékleti esetekkel:"
    },
    {
      "k": "h",
      "t": "SA-2026-017: talajgörbék a talaj–szerkezet kölcsönhatásban"
    },
    {
      "k": "p",
      "t": "A talajgörbék nem követték a hivatkozott forrásokat. A puha agyagnál hiányzott Matlock J tagja (a határellenállás a felszín közelében harmadával-felével kisebb); a homok mindig a ciklikus A = 0,9 tényezőt és lépcsős k-táblázatot használt; a merev agyag y50-nél ugrott a fél ellenállásról a teljesre, azon túl pedig 70%-ra esett. A t-z és q-z görbékből (csak motor és WASM) hiányzott a cölöpköpeny kerülete és a csúcs területe. A PRO → Haladó → Talaj–szerkezet kölcsönhatás funkciót érinti. A panel most bekéri a J-t és a homok terhelési módját, a motor pedig elutasítja a hiányzó bemenetű görbét ahelyett, hogy feltételezne valamit. Mi a teendő: futtassa újra ezeket a modelleket, és ellenőrizze újra a cölöpök elmozdulásait és nyomatékait."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-017-soil-curves.md",
      "label": "Az SA-2026-017 teljes szövege",
      "t": "A figyelmeztetés, minden görbe előtte és utána értékeivel:"
    },
    {
      "k": "h",
      "t": "SA-2026-019: hőmérsékleti terhek rudakon"
    },
    {
      "k": "p",
      "t": "A motor minden rúd hőmérsékleti terhét α = 12·10⁻⁶ /°C-kal (az acélé) és az egyenértékű tömör téglalap √(12·I/A) magasságával számította. Egy IPE-szelvényen a hőmérséklet-különbségből eredő nyomaték 30%-kal kisebbre jött ki, alumíniumon pedig a hőmérsékletből eredő normálerő majdnem a felére. Az alkalmazás 2026. október 7. óta mindkettőt kompenzálta, így ez a motor vagy a WASM API közvetlen használatát érinti, valamint az alkalmazásban e dátum előtt számított hőmérsékleti modelleket."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-019-frame-thermal-alpha-depth.md",
      "label": "Az SA-2026-019 teljes szövege",
      "t": "A figyelmeztetés, a tesztesetekkel:"
    },
    {
      "k": "h",
      "t": "SA-2026-012: rúderők az anyagi nemlinearitást figyelembe vevő analízisben"
    },
    {
      "k": "p",
      "t": "Miután egy rúd megfolyt, a megoldó a csökkentett merevséggel egyensúlyozta ki a terheket, de a rugalmas merevséggel számított erőket közölte. Az elmozdulások és a támaszerők helyesek voltak; a rúderők és a kihasználtság nem: egy konzolnál a közölt nyomaték a valódi 100-szorosa volt. Ez a megoldó csak a motorból vagy a WASM API-ból érhető el: az alkalmazás egyik képernyője sem hívja, így a stabileo.com-on kapott eredményeket nem érinti."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-012-material-nonlinear-member-forces.md",
      "label": "Az SA-2026-012 teljes szövege",
      "t": "A figyelmeztetés, a tesztkonzollal:"
    },
    {
      "k": "h",
      "t": "SA-2026-016: keresztmetszeti tengelyek egy ív közel függőleges szakaszain"
    },
    {
      "k": "p",
      "t": "Egy ív egyenes szakaszai az egyenes rúd alapértelmezett helyi tengelyeit kapták, amelyek a függőlegestől 2,56°-on belüli rúdnál a globális X tengelyt veszik referenciának. Az X–Z síkon kívüli ívnél ez a vállaknál lévő, közel függőleges szakaszok keresztmetszetét 90°-kal elforgatta: ott Iy és Iz felcserélődött. Egy 40 szakaszos, Y–Z síkú félkörívnél a tetőpont lehajlása 15%-kal kisebbre jött ki. A motor görbe rúdjait és a Rudak lap (PRO) ív eszközével rajzolt íveket érinti, ha egy szakasz közel függőleges; az alaprajzi görbéket nem. A korábban mentett ívek a projekt megnyitásakor megkapják a javított tengelyeket."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-016-curved-member-axes.md",
      "label": "Az SA-2026-016 teljes szövege",
      "t": "A figyelmeztetés, a tesztívvel:"
    },
    {
      "k": "h",
      "t": "SA-2026-015: önsúllyal terhelt kötelek húzóereje"
    },
    {
      "k": "p",
      "t": "A kötélszámítás az Ernst-modulust, vagyis a saját súlya alatt belógó kötél húrtörvényének érintőjét úgy használta, mintha az egyenes húrtól mért szelő lenne. A belógás húrhosszt köt le, így egy adott megnyúláshoz a kötélnek nagyobb húzóerő kell, mint EA·ε, nem kisebb. Ahol a kötélerőt egyedül az egyensúly határozza meg, a húzóerő helyes volt; ahol a kötél más rudakkal osztozik a terhen (kipányvázott árboc, keretet merevítő kötél), a kötél túl kis húzóerőt kapott, a mellette lévő rudak pedig túl nagyot: a tesztárbocban 5,18 kN helyett 4,34 kN-t, kisebb terheknél pedig az iteráció nem konvergált. Az alkalmazásban azokat a 3D modelleket érinti, amelyekben „kötél” viselkedésű rudak vannak, és az anyaguknak van sűrűsége."
    },
    {
      "k": "ul",
      "items": [
        "Hogyan derül ki: a modellben „kötél” viselkedésű rudak vannak, az anyaguknak van sűrűsége, és nem a kötél az egyetlen teherút.",
        "Mi a teendő: ellenőrizze kézzel a mértékadó kötél- és lehorgonyzási erőket, vagy számítson a kötél anyagának sűrűsége nélkül (súly nélkül a törvény helyes volt); a javítás közzététele után futtassa újra.",
        "Állapot: javítva a 0.3.0-s verzióban. A kötélszámítás most magát a húrtörvényt oldja meg Newton-iterációval."
      ]
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-015-cable-tension-chord-law.md",
      "label": "Az SA-2026-015 teljes szövege",
      "t": "A figyelmeztetés, a tesztárboccal és annak zárt alakú megoldásával:"
    },
    {
      "k": "h",
      "t": "SA-2026-018: MITC9 héjak görbült geometrián"
    },
    {
      "k": "p",
      "t": "Az MITC9 elem sík: a kilenc csomópontját egy síkra vetíti. Ha az oldalfelező vagy a középső csomópontok kívül estek ezen a síkon (bármely görbült MITC9-hálónál), a vetítésből hiányzott az MITC4 merev kapcsolati korrekciója, így egy merev elfordulás alakváltozást okozott az elemben: a görbült háló ellenállt az elemei elfordulásainak, és feszültségeket közölt rájuk (egy 1 mrad-dal elforgatott tesztfolton 101 MPa-t). Ezt az elemet csak a motorból vagy a WASM API-ból használják: az alkalmazás nem hoz létre kilenccsomópontos elemeket, így a stabileo.com-on kapott eredményeket nem érinti."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-018-mitc9-curved-rigid-motion.md",
      "label": "Az SA-2026-018 teljes szövege",
      "t": "A figyelmeztetés, a tesztfolttal és a félgömbbel:"
    },
    {
      "k": "h",
      "t": "SA-2026-020: a 3D anyagi nemlinearitást figyelembe vevő analízis folyási felülete"
    },
    {
      "k": "p",
      "t": "2D-ben egy rúd akkor folyik meg, ha (N/Np)² + |M|/Mp meghaladja az 1-et. 3D-ben a megoldó az (N/Np)² + (My/Mpy)² + (Mz/Mpz)² kifejezést használta, a nyomatéki arányok négyzetével, így normálerő vagy kéttengelyű hajlítás esetén egy 3D rúd később folyt meg, mint ugyanaz a rúd 2D-ben, és a közölt kihasználtság alacsony volt: N = 0,5·Np mellett az első megfolyás terhe 15%-kal nagyobbra jött ki. A 3D most az (N/Np)² + |My|/Mpy + |Mz|/Mpz kifejezést használja, amely egytengelyű hajlításra a 2D-s felület. Ez a megoldó csak a motorból vagy a WASM API-ból érhető el: az alkalmazás egyik képernyője sem hívja, így a stabileo.com-on kapott eredményeket nem érinti."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-020-material-nonlinear-3d-yield-surface.md",
      "label": "Az SA-2026-020 teljes szövege",
      "t": "A figyelmeztetés, a tesztesetekkel:"
    },
    {
      "k": "h",
      "t": "SA-2026-008: talpnyíróerő és modális részvétel a spektrális analízisben"
    },
    {
      "k": "p",
      "t": "CQC szabály mellett a közölt talpnyíróerőt továbbra is SRSS szerint kombinálta. Az egy irányba eső modális talpnyíróerők azonos előjelűek, így a CQC többet ad, mint az SRSS: két közeli rezgésalaknál a közölt érték 19%-kal kisebb volt. A részvételi tényezőkből ráadásul kimaradt az a tömeg, amelyet a konzisztens tömegmátrix a támaszokhoz kapcsol, ami alábecsülte a választ azokban a modellekben, ahol oszloponként kevés elem van."
    },
    {
      "k": "ul",
      "items": [
        "Hogyan derül ki, hogy érintett-e: CQC-vel futtatott spektrális analízist, és felhasználta a közölt talpnyíróerőt (például a statikus talpnyíróerőhöz való skálázáshoz), vagy konzisztens tömeget használt egy- vagy kételemes oszlopokkal.",
        "Mi a teendő: számítsa újra az érintett modelleket a stabileo.com-on, és vesse össze a már felhasznált eredményekkel. A figyelmeztetésben a javítás előtt megadott kerülőmegoldás már nem érvényes.",
        "Állapot: javítva a stabileo.com-on 2026. október 21-én."
      ]
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-008-spectral-combination.md",
      "label": "Az SA-2026-008 teljes szövege",
      "t": "A figyelmeztetés, a két hibával külön-külön:"
    },
    {
      "k": "h",
      "t": "SA-2026-007: csavarási és hajlító-csavaró kihajlás 3D-ben"
    },
    {
      "k": "p",
      "t": "A 3D rudak geometriai merevségében csak a hajlítási tagok szerepeltek: sem Wagner-tag, sem nyírási középponti csatolás nem volt. Csavarási és hajlító-csavaró kihajlás sosem jelent meg, helyette az Euler-féle teher jelent meg. Egy kereszt szelvényű oszlopnál a közölt teher 96%-kal nagyobb volt a mértékadónál."
    },
    {
      "k": "ul",
      "items": [
        "Hogyan derül ki, hogy érintett-e: a 3D kihajlási tényezőt vagy a 3D P-Delta-analízist kis csavarási merevségű, nyitott, vékonyfalú szelvényekből álló szerkezetekre használta: kereszt szelvények, egyes vagy kettős szögacélok, T-szelvények, U-szelvények. A kétszeresen szimmetrikus I-szelvényeket, amelyeknél a hajlítási kihajlás a mértékadó, nem érinti. Azokat a méretezési ellenőrzéseket sem érinti, amelyek maguk számítják a csavarási kihajlást (CIRSOC 301 E.4, a 0.2.0 óta).",
        "Mi a teendő: számítsa újra az érintett modelleket a stabileo.com-on, és vesse össze a már felhasznált eredményekkel. A figyelmeztetésben a javítás előtt megadott kerülőmegoldás már nem érvényes.",
        "Állapot: javítva a stabileo.com-on 2026. október 21-én."
      ]
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-007-torsional-buckling.md",
      "label": "Az SA-2026-007 teljes szövege",
      "t": "A figyelmeztetés, a kereszt szelvényű oszlop kidolgozott példájával:"
    },
    {
      "k": "h",
      "t": "SA-2026-006: 3D-ben számított síkbeli modell csomóponti nyomatékokkal"
    },
    {
      "k": "p",
      "t": "A 3D megoldóval számított síkbeli modell az X–Z síkban áll, ahol a síkbeli elfordulás a −Y tengely körüli elfordulás. A csomóponti nyomatékoknak és az előírt elfordulásoknak előjelet kellett volna váltaniuk, de nem váltottak, így a tükörképükként hatottak. Erőkkel kombinálva ahelyett, hogy kioltanák egymást, összeadódhatnak."
    },
    {
      "k": "ul",
      "items": [
        "Hogyan derül ki, hogy érintett-e: a modell sík (minden csomópont egy síkban van), 3D módban számították, és csomóponti nyomatékok vagy előírt támaszelfordulások vannak benne. A forgási rugókat nem érinti.",
        "Mi a teendő: számítsa újra az érintett modelleket a stabileo.com-on, és vesse össze a már felhasznált eredményekkel. A figyelmeztetésben a javítás előtt megadott kerülőmegoldás már nem érvényes.",
        "Állapot: javítva a stabileo.com-on 2026. október 21-én."
      ]
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-006-mirrored-moments-2d-in-3d.md",
      "label": "Az SA-2026-006 teljes szövege",
      "t": "A figyelmeztetés, a három tesztesettel:"
    },
    {
      "k": "h",
      "t": "SA-2026-005: normálerő ferde 2D rudakban"
    },
    {
      "k": "p",
      "t": "A 2D teherösszeállító a ferde rúdra ható teher rúdirányú összetevőjét a rúd végcsomópontjaira helyezte át. A támaszerők és az elmozdulások helyesek voltak, de a rúd a fesztávolságán nem érzékelte ezt a terhet, így a normálereje állandó maradt, a valódi végértékeinek átlagán: egy szarufa talpánál 26%-kal kisebb. Ezt az értéket használta az ábra, az ellenőrző panel, a jelentés, az Excel-export és a méretezés is. Ráadásul egy rúdra működtetett erőpár elveszett, ha egy síkbeli modellt 3D-ben számítottak."
    },
    {
      "k": "ul",
      "items": [
        "Hogyan derül ki, hogy érintett-e: 2026. szeptember 25. óta számított 2D modell ferde rudakkal (szarufák, lépcsők, merevítők, szakaszokból rajzolt ívek), amelyeken rúdirányú összetevővel rendelkező megoszló, koncentrált vagy önsúlyteher van; vagy 3D-ben számított síkbeli modell, amelyben egy rúdon erőpár működik. A nyomásra méretezett rudak a leginkább kitettek.",
        "Mi a teendő: számítsa újra az érintett modelleket a stabileo.com-on, és vesse össze a már felhasznált eredményekkel. A figyelmeztetésben a javítás előtt megadott kerülőmegoldás már nem érvényes.",
        "Állapot: javítva a stabileo.com-on 2026. október 21-én."
      ]
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-005-inclined-member-loads.md",
      "label": "Az SA-2026-005 teljes szövege",
      "t": "A figyelmeztetés, a szarufával és a 3-4-5 rúddal:"
    },
    {
      "k": "h",
      "t": "Javítva 2026. október 19-én"
    },
    {
      "k": "ul",
      "items": [
        "SA-2026-009: az SHB8 tömör héjelem vékonylemez-hajlításban 22%-kal túl merev volt (Poisson-féle vastagsági reteszelődés), így mintegy 18%-kal alábecsülte a lehajlásokat. Ellenőrizze újra a lehajlásra és a rezgésekre vonatkozó következtetéseket az e dátum előtt számított, tömör héjelemes lemezeket tartalmazó modelleknél; az MITC4, az MITC9, a DKT és a görbült héj nem érintett.",
        "SA-2026-010: a spektrális analízis tanúsítványa nem véges (NaN) eredményeket is elfogadhatott. A számok láthatóan érvénytelenek voltak; az ellenőrzésről tett állítás volt hibás. Semmit sem kell újraellenőrizni, hacsak egy leadott eredményben nem szerepeltek nem véges értékek."
      ]
    },
    {
      "k": "h",
      "t": "Javítva a 0.2.0-s verzióban"
    },
    {
      "k": "p",
      "t": "A 2026. október 18-i 0.2.0-s verzió javította a négy visszamenőleges figyelmeztetést. Mindegyik a 2026. október 17. előtt számított projekteket érinti, és a teendő mindegyiknél ugyanaz: generálja újra a terheket és kombinációkat, számítson, nézze át a méretezési ellenőrzéseket, és ellenőrizze újra minden korábbi verzióval kiadott munkarészt."
    },
    {
      "k": "ul",
      "items": [
        "SA-2026-001: a CIRSOC 101, 102 és 103 szerint generált kombinációk és terhek a biztonság kárára tévedtek (egy példában egy oszlop normálereje 29%-kal kisebb volt).",
        "SA-2026-002: a CIRSOC 201 és ACI 318 szerinti betonellenőrzések túlbecsülték a teherbírást (φMn akár 18%-kal nagyobb).",
        "SA-2026-003: az acél-, hidegen alakított szelvényű és kapcsolati ellenőrzések túlbecsülték a teherbírást (gerincnyírás akár 60%-kal nagyobb).",
        "SA-2026-004: a modell egy részét figyelmen kívül hagyó számítások (a gyorsulási időtörténettel végzett analízis a földrengési tehernek akár a felét elvesztette; a 3D képlékeny tönkremenetel akár 2,3-szor a biztonság kárára tévedett)."
      ]
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/README.md",
      "label": "Az összes figyelmeztetés",
      "t": "A teljes lista, minden figyelmeztetéssel, a javításával és a súlyosságával:"
    },
    {
      "k": "link",
      "slug": "how-stabileo-checks-its-results",
      "t": "Hogyan találtuk meg ezeket a hibákat, és mit nem garantálhat semmilyen ellenőrzés:"
    }
  ]
};

export default body;
