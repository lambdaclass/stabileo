import type { PostBody } from '../../types';

const body: PostBody = {
  "title": "Stabileo 0.6.1: javított rúdellenőrzések és hóterhek",
  "excerpt": "Ismételje meg az érintett beton- és acélellenőrzéseket. Generált hóterhek esetén előbb állítsa elő újra a terheket, majd számítsa újra az érintett tehereseteket, kombinációkat, burkolókat és méretezési ellenőrzéseket.",
  "blocks": [
    {
      "k": "p",
      "t": "Ismételje meg az érintett beton- és acélellenőrzéseket. Generált hóterhek esetén előbb állítsa elő újra a terheket, majd számítsa újra az érintett tehereseteket, kombinációkat, burkolókat és méretezési ellenőrzéseket. A korábban mentett terhekkel végzett újraszámítás önmagában nem javítja ki azokat. Hasonlítsa össze az igénybevételeket, teherbírásokat, vasalást, kihasználtságot, mértékadó kombinációkat és tanúsítványokat a már felhasznált eredményekkel. Vizsgálja felül az átadott számításokat és az ezekre alapozott méretezést. Az elutasítás, a nem elérhető mennyiség vagy az ellenőrizetlen vasalás nem jelent megfelelő eredményt, és nem jelent nulla igénybevételt."
    },
    {
      "k": "note",
      "t": "Az alábbi öt, Magas súlyosságú biztonsági közlemény hibáit a 0.6.1 javítja. Kövesse az egyes közlemények érintett bemenetekre és felhasználói teendőkre vonatkozó útmutatását akkor is, ha a korábbi eredmények megfelelőek voltak vagy tanúsítványt kaptak."
    },
    {
      "k": "h",
      "t": "Biztonsági közlemények"
    },
    {
      "k": "table",
      "caption": "Biztonsági közlemények",
      "head": [
        "Közlemény",
        "Súlyosság",
        "Mi változott és mi a teendő"
      ],
      "rows": [
        [
          "SA-2026-064",
          "Magas",
          "Az acélszerkezeti Cb érték másik kombinációból vagy ismert megtámasztási helyek nélküli rövid, oldalirányban meg nem támasztott szakaszból származhatott (#1316, #2088). Ismételje meg a CIRSOC 301 acélellenőrzéseket, és vizsgálja felül a hajlítási teherbírást, az interakció kihasználtságát és a mértékadó kombinációkat."
        ],
        [
          "SA-2026-065",
          "Magas",
          "A tetőlépcsőnél keletkező hófelhalmozódás kimaradhatott a ferde fogadó tetőfelületen (#2082). Állítsa elő újra a CIRSOC 104 hóterheket, és ismételje meg az érintett analíziseket és ellenőrzéseket."
        ],
        [
          "SA-2026-066",
          "Magas",
          "A beton Cm értéke a támaszok közötti keresztirányú teher mellett is kedvezményt kaphatott a végnyomatékok alapján (#2089). Ellenőrizze újra a karcsú betonoszlopokat és falakat, a megnövelt nyomatékokat és a vasalást."
        ],
        [
          "SA-2026-067",
          "Magas",
          "Az alaprajzi elforgatás megváltoztathatta a generált hóterheket (#2093). A tényleges tetőgeometriával állítsa elő újra a terheket, majd ismételje meg az analíziseket és ellenőrzéseket; a régi modell visszaforgatása nem javítja ki a hibát."
        ],
        [
          "SA-2026-068",
          "Magas",
          "A csavarási ellenőrzés elégtelen méretezett kengyelezés mellett is megfelelő eredményt adhatott (#2141). Ismételje meg a betonméretezési ellenőrzéseket, és vizsgálja felül a tényleges keresztirányú teherbírást, a kengyeltávolságot és a csavarási elégtelenségeket. Az ellenőrizetlen hosszirányú vasalás nem jelent megfelelő vasalási kosarat."
        ]
      ]
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/README.md",
      "label": "Biztonsági közlemények jegyzéke",
      "t": "Biztonsági közlemények:"
    },
    {
      "k": "h",
      "t": "Minden eredményváltozási értesítés a v0.6.0 óta"
    },
    {
      "k": "p",
      "t": "A v0.6.0 nyilvántartása a 78-as eredményverziónál ér véget; ez a kiadás a 80-asig jut el. A táblázat mind a 24 új értesítést felsorolja. Több értesítés ugyanahhoz a verzióhoz tartozik. Ismételjen meg minden alkalmazandó ellenőrzést; a hóra vonatkozó értesítéseknél az újraszámítás előtt állítsa elő újra a terheket."
    },
    {
      "k": "table",
      "caption": "Minden eredményváltozási értesítés a v0.6.0 óta",
      "head": [
        "Eredményverzió",
        "Változó eredmény"
      ],
      "rows": [
        [
          "79",
          "A hófelhalmozódás lefedettsége követi a folytonos tetőéleket"
        ],
        [
          "79",
          "A hóteher-felülbírálások megőrzik az aszimmetrikus oldalakat és a tetőszakaszokat"
        ],
        [
          "79",
          "A lapos tetők hóteher-koordinátarendszerei követik az összefüggő tetőszakaszokat"
        ],
        [
          "79",
          "A hóterhek figyelembe veszik a helyi pozíciókat és a hófelhalmozódás határait"
        ],
        [
          "79",
          "A hóteher-tényezők követik az egyes tetők tájolását"
        ],
        [
          "79",
          "A hóteheresetek lefedik a tetőgerinc minden tájolását"
        ],
        [
          "79",
          "A hógyűjtési hossz követi a folytonos tetőket és a kiválasztott geometriát"
        ],
        [
          "79",
          "A hóterhek megőrzik nagyságukat az alaprajzi elforgatás során"
        ],
        [
          "79",
          "A tetőlépcsőnél keletkező hófelhalmozódás a fogadó tető síkját használja"
        ],
        [
          "79",
          "A hóterhek követik az egyes összefüggő tetőfelületeket"
        ],
        [
          "79",
          "A hóteherhez tartozó tehergyűjtő területek a tető belső felületeit használják"
        ],
        [
          "80",
          "A rúdellenőrzésekhez minden aktív kombináció szükséges"
        ],
        [
          "80",
          "A rúdellenőrzésekhez teljes keresztmetszeti állomásadatok szükségesek"
        ],
        [
          "80",
          "Az egyidejű ellenőrzések megőrzik a mértékadó igénybevételeket"
        ],
        [
          "80",
          "A méretezés a kiválasztott betonacélokat és az ismert szakaszterhelést használja"
        ],
        [
          "80",
          "Az interakciós ellenőrzések az azonos állomáshoz tartozó egyidejű igénybevételeket használják"
        ],
        [
          "80",
          "A betonellenőrzések megőrzik a másodlagos karcsúságot"
        ],
        [
          "80",
          "Az egyidejű teheresetek megőrzik az összes szükséges csavarási vasalást"
        ],
        [
          "80",
          "A rögzített vasalás mellett megmarad a gyakorlati felső korlát ellenőrzése"
        ],
        [
          "80",
          "A méretezési igénybevételek figyelembe veszik a viselkedést és az övszakaszokat"
        ],
        [
          "80",
          "A csavarási ellenőrzés minden kiadott kengyelezési kosarat ellenőriz"
        ],
        [
          "80",
          "A közös gerendák megőrzik tengelyeiket; a meglévő csavarási vasalást meg kell adni"
        ],
        [
          "80",
          "Az acél interakciós ellenőrzés Cb értéke a saját kombinációjának ábráját használja"
        ],
        [
          "80",
          "Az acél keresztmetszeti állomásai fizikai hosszakat használnak, és megőrzik a nyírási igénybevételeket"
        ]
      ]
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/releases/v0.6.1.hu.md",
      "label": "A 0.6.1 teljes kiadási megjegyzései",
      "t": "Minden eredményváltozási értesítés a v0.6.0 óta:"
    },
    {
      "k": "img",
      "base": "blog/results-recheck",
      "w": 1600,
      "h": 1000,
      "alt": "Eredmény-felülvizsgálati párbeszédablak a Stabileo Basic felületén, amely egy korábban mentett projektet érintő változásokat sorol fel.",
      "caption": "Az eredmények megváltozhatnak: számítsa újra az érintett projekteket"
    },
    {
      "k": "h",
      "t": "További változások"
    },
    {
      "k": "p",
      "t": "A beton- és acélellenőrzések megőrzik az azonos kombinációhoz és keresztmetszeti állomáshoz tartozó igénybevételeket. A hiányos kombináció- vagy állomásadatokat a program most elutasítja, ahelyett hogy egy végpont eredményét használná fel. A szükséges és a meglévő vasalás állapota elkülönül, és a hiányzó hosszirányú csavarási vasalás megadását a program kifejezetten jelzi."
    },
    {
      "k": "h",
      "t": "Ismert korlátozások"
    },
    {
      "k": "ul",
      "items": [
        "Az ismert hibás eredmények továbbra is nyitottak: #2096, #2142, #2143 és #2144. Ez a kiadás nem javítja őket. Nézze meg az érintett bemenetek körét, és felhasználás előtt függetlenül ellenőrizze az érintett eredményeket.",
        "Az SA-2026-056 továbbra sincs javítva: függetlenül ellenőrizze azokat a kényszerekkel összekapcsolt rúd-héj modellekhez tartozó dinamikus igénybevételeket, amelyek átszámozás, elforgatás vagy mértékegység-átváltás után jelentősen megváltoznak. Konzervatív korrekciós tényező nincs igazolva.",
        "A 2D képlékeny összeomlás továbbra is elutasított a #758 megoldásáig, az SA-2026-044 szerint. Egy tanúsított 3D alsó korlát nem tanúsítja a nyers képlékenycsukló-történetet.",
        "Az időtörténeti analízis nem ad teljes dinamikus támaszigénybevételeket. Használjon független analízist, amely figyelembe veszi a tehetetlenséget, a csillapítást és a támaszterhelést. A nem támogatott kábelanalíziseket és a kábel- vagy időtörténeti eljárásokban megadott nem nulla támaszmozgásokat a program kifejezetten elutasítja.",
        "A térbeli ívhossz- és elmozdulásvezérelt megoldók nem kerültek be. A meglévő figyelmeztetések és korlátozások továbbra is érvényesek."
      ]
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/CHANGELOG.md",
      "label": "Változásnapló",
      "t": "Változásnapló:"
    }
  ]
};

export default body;
