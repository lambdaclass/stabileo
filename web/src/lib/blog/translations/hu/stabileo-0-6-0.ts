import type { PostBody } from '../../types';

const body: PostBody = {
  "title": "Stabileo 0.6.0: számítsa újra az érintett projekteket",
  "excerpt": "Számítsa újra az érintett analíziseket, és vizsgálja felül a már felhasznált eredményeket. Az SA-2026-048–SA-2026-063 közlemények ismertetik a teendőket; az SA-2026-056 továbbra sincs javítva.",
  "blocks": [
    {
      "k": "p",
      "t": "Számítsa újra az érintett tehereseteket, kombinációkat és a teljes nemlineáris vagy építési fázisos terheléstörténeteket. Hasonlítsa össze az elmozdulásokat, rúderőket, reakciókat és méretezési igénybevételeket a már felhasznált eredményekkel. Vizsgálja felül az átadott számításokat és az ezekre alapozott méretezést. Az érintett bemeneteket és a szükséges felhasználói teendőket az egyes biztonsági közlemények ismertetik. Az elutasítás vagy a nem elérhető mennyiség nem ad helyettesítő eredményt: nem jelent nulla igénybevételt vagy megfelelő ellenőrzést."
    },
    {
      "k": "note",
      "t": "Az SA-2026-048–SA-2026-063 közlemények a v0.5.0 után kerültek be. Az alábbi javításokat a 0.6.0 tartalmazza, kivéve az SA-2026-056 hibát, amely továbbra sincs javítva. Ellenőrizze újra az itt felsorolt funkciókat akkor is, ha a korábbi számítás konvergált, vagy az elmozdulásai hihetőnek tűntek."
    },
    {
      "k": "h",
      "t": "Biztonsági közlemények"
    },
    {
      "k": "table",
      "caption": "Safety advisories SA-2026-048 through SA-2026-063",
      "head": [
        "Közlemény",
        "Súlyosság",
        "Mi változott és mi a teendő"
      ],
      "rows": [
        [
          "SA-2026-048",
          "Magas",
          "A CIRSOC 301 rövidített, oldalirányban meg nem támasztott szakasz esetén minden szelvénynél kihagyta a végnyomatékokat az Mmax értékéből; az U és T szelvények esetén a kettős görbület előjelváltása is kimaradhatott. Ellenőrizzen újra minden olyan CIRSOC 301 rudat, amelynél a megadott Lb kisebb a rúd hosszánál, beleértve az acélellenőrzéseket és az optimalizáló javaslatait."
        ],
        [
          "SA-2026-049",
          "Magas",
          "A merev megtámasztás és az ugyanoda megadott rugó 3D-ben rugalmas támasszá válhatott. Válassza ki kifejezetten a kívánt peremfeltételt, és számítsa újra az érintett modelleket."
        ],
        [
          "SA-2026-050",
          "Közepes",
          "A sikertelen karcsúságszámítás nullává válhatott, és a több teheresetes eredmények nem véges számokat tartalmazhattak. Vesse el ezeket az értékeket, vizsgálja felül a bemeneteket, és számítson újra."
        ],
        [
          "SA-2026-051",
          "Magas",
          "A 3D mozgóterhek belső csúcsértékeket és a tengelyteher axiális összetevőjét hagyták ki. Számítsa újra a burkolókat, és vizsgálja felül a rudak méretezését és méretezési igénybevételeit."
        ],
        [
          "SA-2026-052",
          "Magas",
          "A 2D/3D mozgóterhek normálerő-burkolói kihagyták a megoszló terhek határait. Számítson újra, és ellenőrizze a belső normálerő-szélsőértékeket; önmagában a teherszerelvény lépésközének csökkentése nem elegendő."
        ],
        [
          "SA-2026-053",
          "Alacsony",
          "A mozgóteher-burkolók a rúdvégeken ható terheknél a külső oldali erőhatárértékeket is tartalmazták. Számítsa újra a normálerő- és nyíróerő-burkolókat, és vizsgálja felül a méretezést; az egyensúlyi ellenőrzésekben továbbra is vegye figyelembe a támaszreakciókat."
        ],
        [
          "SA-2026-054",
          "Magas",
          "A lineáris megoldás feloldhatatlan merevséghez tartozó választ adhatott vissza, vagy kihagyhatott egy teherkomponenst. Számítsa újra a statikus tehereseteket és kombinációkat; ha a javított megoldó elutasítja a számítást, független módszerrel ellenőrizze az igénybevételeket."
        ],
        [
          "SA-2026-055",
          "Magas",
          "A P-Delta alulbecsülte az erősítést a rúdhossz mentén ható axiális terheknél. Számítsa újra az érintett modelleket és az ezekből származtatott ellenőrzéseket, ellenőrizze a hálókonvergenciát, és vizsgálja felül a stabilitást."
        ],
        [
          "SA-2026-056",
          "Magas",
          "Javítatlan: a kényszerezett, vegyes rúd–héj modellek dinamikai eredményei egyenértékű modellleírások esetén változnak. Felhasználás előtt független módszerrel ellenőrizze az érintett igénybevételeket; igazolt konzervatív korrekciós tényező nincs."
        ],
        [
          "SA-2026-057",
          "Közepes",
          "A képlékeny eredmények megjelenítése egy intervallumon kívüli tényezőt az intervallumon belülinek jelölhetett. Futtassa újra a tanúsítást, és hasonlítsa össze a pontos végpontokat. Az erőforrás miatti elutasítás nem bizonyítja, hogy nem létezik mechanizmus."
        ],
        [
          "SA-2026-058",
          "Magas",
          "A nagy harmonikus modellekben pontatlan, kihagyott módusokból eredő válaszok maradtak. Számítsa újra a frekvenciasöpréseket, és vizsgálja felül az amplitúdót, a fázist és a csúcsértékeket, a csonkolási figyelmeztetés tartományán kívüli frekvenciákon is."
        ],
        [
          "SA-2026-059",
          "Magas",
          "A webes felület haladó számításai nyomási ellenállást adtak a kábeleknek. Használja a támogatott, külön kábelmegoldót vagy független számítást; a haladó kábeles munkafolyamatok most egyértelműen elutasítást adnak."
        ],
        [
          "SA-2026-060",
          "Magas",
          "Az építési fázisos számítás mesterséges elfordulási merevsége megváltoztatta az eltolódásokat és a rúdigénybevételeket. Rúdvégi felszabadítások vagy támaszrugók esetén számítsa újra a teljes fázistörténetet, és vizsgálja felül a származtatott méretezési igénybevételeket."
        ],
        [
          "SA-2026-061",
          "Magas",
          "A pályakövető megoldók reakciói hiányoztak, vagy hibás teherhez tartoztak; fázisos és dinamikus erők is hiányozhattak. Számítson újra, és vizsgálja felül a támaszok, kapcsolatok és alapozások igénybevételeit. A nem elérhető erő nem nulla; a teljes dinamikus reakciók továbbra sem érhetők el."
        ],
        [
          "SA-2026-062",
          "Magas",
          "A kezdeti rugalmas elutasítás sikeres, nulla nyers 3D képlékeny összeomlási tényezővé válhatott. Számítsa újra az érintett képlékeny modelleket; a numerikus elutasítás nem bizonyítja a nulla tehernél bekövetkező összeomlást."
        ],
        [
          "SA-2026-063",
          "Magas",
          "A kényszerek elveszítették a megtámasztott főcsomópont előírt mozgását. Számítsa újra a teljes történeteket, és az SA-2026-061 közleménnyel együtt vizsgálja felül az elmozdulásokat, rúderőket és reakciókat. A nem támogatott támaszmozgást a kábeles és időtörténeti munkafolyamatok most elutasítják."
        ]
      ]
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/README.md",
      "label": "Biztonsági közlemények",
      "t": "Az érintett bemenetek és a szükséges teendők az egyes közleményekben találhatók:"
    },
    {
      "k": "h",
      "t": "További, az eredményeket érintő változások"
    },
    {
      "k": "p",
      "t": "A 0.5.0 eredménynyilvántartása a 49 verziónál ér véget; a 0.6.0 a 78 verzióig jut. A táblázat további újraszámítandó változásokat sorol fel. Több értesítésnek lehet azonos verziója. Az elutasítás nem jelent nulla igénybevételt vagy megfelelő ellenőrzést."
    },
    {
      "k": "table",
      "caption": "Selected results-change notices since 0.5.0",
      "head": [
        "Eredményverzió",
        "Megváltozó eredmény"
      ],
      "rows": [
        [
          "50",
          "2D: a csak összekötők által elért, általuk szabadon hagyott elfordulások elutasításra kerülnek"
        ],
        [
          "52",
          "3D: az összekötő által csatolt, de szabadon hagyott csomóponti elfordulások elutasításra kerülnek"
        ],
        [
          "53",
          "A kihajlás már nem vesz geometriai merevséget a kerekítési hibából adódó normálerőkből 2D-ben és 3D-ben azok a rudak, amelyek normálerői nem különböztethetők meg a kerekítési hibától, nem adnak geometriai merevséget. A számítást a megoldó elutasítja, ha lehetséges nyomóerejük a kritikus tényezőt több mint 1 %-kal csökkenthetné."
        ],
        [
          "54",
          "A lépcsőzött csavarozott bekötés nettó keresztmetszete a legkedvezőtlenebb szakadási vonalat veszi, és a minden elemén bekötött végnek csavar kell a gerincben"
        ],
        [
          "56",
          "A 3D ferde támaszok a megtámasztásokat közös koordináta-rendszerben számolják"
        ],
        [
          "58",
          "A modális bázisok minden tömeg-Gram-elem saját kerekítési skáláját használják"
        ],
        [
          "59",
          "Az ellenőrzött 3D képlékeny analízis a tanúsított alsó korlátot adja vissza"
        ],
        [
          "61",
          "A betonszálas terhelésvezérlés finomítja a leállási intervallumát"
        ],
        [
          "63",
          "A generált síkbeli szerkezetek kifejezett megtámasztásokat kapnak, a csarnokok alapértelmezésben merevítést"
        ],
        [
          "65",
          "Az érvénytelen befagyasztott kontaktok és a kábeleket rúdként kezelő analízisek eredményei vissza vannak tartva"
        ],
        [
          "66",
          "A kihajlás kerekítési korlátai a tényleges kényszerkapcsolatot követik"
        ],
        [
          "67",
          "A kihajlási tényezők az eredeti merevségi mátrixpárból számítódnak"
        ],
        [
          "68",
          "A képlékeny egyensúly a megoldott modell azonosítóit használja, a tanúsítvány a tényleges jelöltekre szab keretet"
        ],
        [
          "69",
          "A kényszeres pontmodellek megengedett mozgási kategóriákat használnak"
        ],
        [
          "71",
          "A feltételes rúdegyensúly tartalmazza a rácsrudak keresztirányú hatásait"
        ],
        [
          "72",
          "Az ívhossz-folytatás átcsoportosítja a referenciateher aritmetikáját"
        ],
        [
          "73",
          "A modális vizsgálat megőrzi a fizikai tömegtartományt"
        ],
        [
          "75",
          "Az SSI javítja a rugalmas maradék platóit"
        ],
        [
          "76",
          "A kényszerredukció megőrzi az irányfüggő kerekítési bizonytalanságot"
        ],
        [
          "78",
          "A felszabadított elfordulások bázisának kiválasztása"
        ]
      ]
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/releases/v0.6.0.hu.md",
      "label": "Eredményváltozási nyilvántartás",
      "t": "Minden eredményváltozási értesítés, hatókörrel és bizonyítékokkal:"
    },
    {
      "k": "img",
      "base": "blog/results-recheck",
      "w": 1600,
      "h": 1000,
      "alt": "A Stabileo számítási eredményeinek felülvizsgálata",
      "caption": "Az érintett számításokat újra kell futtatni, és a már felhasznált eredményekkel össze kell hasonlítani."
    },
    {
      "k": "h",
      "t": "Két értesítés már a 0.5.0 verzióban meglévő viselkedést ír le"
    },
    {
      "k": "p",
      "t": "Ezt a két értesítést később vettük nyilvántartásba. A hozzájuk tartozó változások már a v0.5.0 részei voltak, így nem új számszerű változások ebben a kiadásban. A projektek újraellenőrzési értesítésében továbbra is megjelenhetnek."
    },
    {
      "k": "table",
      "caption": "Later notices for changes already shipped in 0.5.0",
      "head": [
        "Eredményverzió",
        "Megváltozó eredmény"
      ],
      "rows": [
        [
          "72",
          "A nyilvános lemezgaléria merev egyszerű támaszokat használ a falakon"
        ],
        [
          "72",
          "Az SSI támaszreakciókat ad, és a kényszererőkbe bevonja a talajrugókat"
        ]
      ]
    },
    {
      "k": "h",
      "t": "Ismert korlátok"
    },
    {
      "k": "ul",
      "items": [
        "Az SA-2026-056 továbbra sincs javítva: független módszerrel ellenőrizze azoknak a kényszerezett, vegyes rúd- és héjmodelleknek a dinamikus igénybevételeit, amelyek átszámozás, elforgatás vagy mértékegység-átváltás után lényegesen változnak. Nincs igazolt konzervatív korrekciós tényező.",
        "A 2D képlékeny összeomlás számítása a #758 lezárásáig elutasításra kerül, az SA-2026-044 szerint. A tanúsított 3D alsó korlát nem tanúsítja a nyers képlékenycsukló-történetet.",
        "Az időtörténet nem ad teljes dinamikus támaszigénybevételt. Használjon független, a tehetetlenséget, csillapítást és támaszterhelést is figyelembe vevő analízist. A nem támogatott kábelszámítások és a kábeles vagy időtörténeti munkafolyamatok nem nulla előírt támaszmozgásai kifejezett elutasítást adnak.",
        "Nem kerültek be térbeli ívhossz- és elmozdulásvezérelt megoldók. A meglévő figyelmeztetések és korlátozások továbbra is érvényesek."
      ]
    },
    {
      "k": "h",
      "t": "További változások"
    },
    {
      "k": "ul",
      "items": [
        "A generált síkbeli szerkezetek kifejezett megtámasztásokat kapnak, a csarnokok alapértelmezésben fizikai merevítést. Generálja újra, és vizsgálja felül a támaszokat és a merevítést; a mentett modellek nem változnak.",
        "A Fehér, Sipos és Várkonyi hajlított szalagjának alakvezérlési kísérlete interaktív megoldót, beavatkozópályákat és a tanulmánnyal való összehasonlítást kapott angolul, spanyolul és portugálul. A bevágott szalag összefoglalója is elérhető spanyolul és portugálul.",
        "A 0.5.0 kiadás blogbejegyzése teljes német, francia és török fordítást kapott. A képlékeny tanúsítvány figyelmeztetései és erőforrás miatti elutasításai minden kínált nyelven elérhetők."
      ]
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
