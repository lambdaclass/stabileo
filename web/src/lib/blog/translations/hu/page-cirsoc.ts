import type { StandingPage } from '../../pages';

const body: StandingPage['i18n']['en'] = {
  "title": "CIRSOC szerinti méretezési ellenőrzések a böngészőben: mi érhető el és mi nem",
  "description": "A Stabileo böngészőben ellenőriz betont (CIRSOC 201) és acélt (CIRSOC 301, kísérleti), és CIRSOC 101–104 terheket generál. Mi érhető el és mi nem.",
  "eyebrow": "CIRSOC",
  "lead": "A Stabileo nyílt forráskódú szerkezetszámító szoftver, amely a vasbeton rudakat a CIRSOC 201 (2025-ös kiadás), az acélrudakat a CIRSOC 301-2018 szerint ellenőrzi, a terheket és kombinációkat pedig a CIRSOC 101-2025, a 102-2025, az INPRES-CIRSOC 103-2018 (I. rész) és a CIRSOC 104-2005, vagyis az argentin szerkezeti szabványok szerint generálja. Ugyanazt a modellt és megoldót használja, amellyel a számítás készül, a böngészőben fut, és nem kell telepíteni. A számítás mindenki számára ingyenes. A szabvány szerinti méretezés a PRO módban található, és még fejlesztés alatt áll. Fizetős, az egyetemeknek ingyenes.",
  "blocks": [
    {
      "k": "h",
      "t": "Mi érhető el, és milyen mértékben ellenőrzött"
    },
    {
      "k": "p",
      "t": "A tanúsított azt jelenti, hogy minden eredményhez intervallum-aritmetikával számított korlát tartozik a numerikus hibájára; nem jelenti azt, hogy a modell helyes, sem azt, hogy mérnök átnézte. A közzétett példák az INTI-CIRSOC mintapéldái."
    },
    {
      "k": "table",
      "caption": "Amit a Stabileo ma a CIRSOC szerint ellenőriz, az egyes részek ellenőrzési szintjével.",
      "head": [
        "Szabvány",
        "Mit végez",
        "Állapot"
      ],
      "rows": [
        [
          "CIRSOC 201 — vasbeton",
          "Gerendák és oszlopok: hajlítás, külpontos nyomás (normálerő és hajlítás), nyírás és minimális vasalás; keresztmetszetek, interakciós diagramok és födémek a motorból",
          "Elérhető a PRO módban. A gerendák hajlítása és nyírása tanúsított; a normálerő és hajlítás együttes hatása és a födémek tesztelve, nem tanúsítva. 5 pontból 3 ellenőrizve az INTI-CIRSOC 201-2005 példái alapján"
        ],
        [
          "CIRSOC 201-2025 — szerkesztési szabályok",
          "Lehorgonyzás, repedéskorlátozás, távolságok és a betonacélok elrendezése",
          "Elérhető a PRO módban. Tesztelve"
        ],
        [
          "CIRSOC 301-2018 — acél",
          "Húzás, nyomás (hajlítási és hajlító-csavaró kihajlás), hajlítás és nyírás",
          "Elérhető, független átvizsgálásig kísérleti jelöléssel. Tanúsított; 14 pontból 10 ellenőrizve az INTI-CIRSOC 301-2018 példái alapján"
        ],
        [
          "CIRSOC 301-2018 J — kapcsolatok",
          "Sarokvarratok és csavarozott kapcsolatok",
          "Fejlesztés alatt; 4 pontból 2 ellenőrizve publikált példák alapján"
        ],
        [
          "CIRSOC 201 — pontalapok",
          "Talajfeszültség, nyírás, átszúródás és hajlítás",
          "Fejlesztés alatt; egy második implementációval összevetve"
        ],
        [
          "CIRSOC 101-2025 — terhek és kombinációk",
          "A §2.3.2 hét kombinációja, állandó és hasznos terhek",
          "Ami implementálva van, pontról pontra ellenőrizve a hivatalos szöveg alapján; a jég, a rendkívüli események és néhány előírás nincs lefedve"
        ],
        [
          "CIRSOC 102-2025 — szél",
          "Nyomások és használati kombinációk",
          "Ami implementálva van, ellenőrizve a hivatalos szöveg alapján; néhány eset nincs lefedve"
        ],
        [
          "INPRES-CIRSOC 103-2018 I. rész — földrengés",
          "Spektrum, zónától függő módszer, szeizmikus súly és szeizmikus kombináció",
          "Ami implementálva van, ellenőrizve; néhány előírás nincs lefedve"
        ],
        [
          "CIRSOC 104-2005 — hó",
          "Hóterhek településenként",
          "A táblázatok alapján ellenőrizve"
        ]
      ]
    },
    {
      "k": "h",
      "t": "Hogyan működik"
    },
    {
      "k": "ul",
      "items": [
        "Egyetlen modell: megrajzolja vagy importálja a szerkezetet (DXF, IFC vagy Excel-sablon), és az ellenőrzések ugyanazokat az erőket használják, mint a számítás, anélkül hogy bármit kézzel át kellene másolni egy másik táblázatba.",
        "A CIRSOC 101, 102, 103 és 104 szerinti terhek és kombinációk a projekt adataiból generálódnak.",
        "Minden rúd a kihasználtságával és a mértékadó szabványponttal zárul, és minden lépés megtekinthető.",
        "A megoldó az Ön számítógépén fut: a modellt nem küldjük semmilyen szerverre megoldásra. A kód nyílt (AGPL-3.0).",
        "Ugyanaz a modell mindig ugyanazokat a számokat adja, és minden jelentés rögzíti a verziót és az adatokat, amelyekből készült."
      ]
    },
    {
      "k": "link",
      "slug": "verificacion-flexion-cirsoc-201",
      "t": "Egy kidolgozott példa lépésről lépésre, a szerkesztőben megnyitható modellel:"
    },
    {
      "k": "h",
      "t": "Hogyan validáljuk, és hol ér véget a validálás"
    },
    {
      "k": "ul",
      "items": [
        "A méretezési ellenőrzéseket pontról pontra összevetjük az INTI-CIRSOC mintapéldáival, a terheket pedig a hivatalos szövegekkel; minden eltérést az okával együtt dokumentálunk.",
        "A számítást hét másik végeselemes programmal vetjük össze.",
        "Jogosultsággal rendelkező statikus tervező még nem végzett független átvizsgálást, és az acél még kísérleti jelölésű.",
        "Egyetlen program sem ellenőrzi a modellt: a terhek, a támaszok és az idealizálás a mérnök döntései."
      ]
    },
    {
      "k": "link",
      "slug": "safety-advisories",
      "t": "Ha olyan hibát találunk, amely a már felhasznált eredményeket érinthette, közzétesszük, azzal együtt, hogy mit kell újraellenőrizni:"
    }
  ],
  "faqTitle": "Gyakori kérdések",
  "faq": [
    {
      "q": "Milyen szoftver ellenőrzi a szerkezeti méretezést a CIRSOC szabványok szerint?",
      "a": "A Stabileo a vasbetont a CIRSOC 201, az acélt a CIRSOC 301-2018 szerint ellenőrzi (kísérleti jelöléssel), a terheket és kombinációkat pedig a CIRSOC 101-2025, a 102-2025, az INPRES-CIRSOC 103-2018 és a CIRSOC 104-2005 szerint generálja. Nyílt forráskódú, a böngészőben fut, és fizetős méretezési modulokat kínál, amelyek az egyetemeknek ingyenesek."
    },
    {
      "q": "Ingyenes a Stabileo a CIRSOC szerinti ellenőrzésekhez?",
      "a": "Az alapprogram, amely a böngészőben végzi a szerkezetszámítást, nyílt forráskódú és mindenki számára ingyenes. Néhány speciális modul fizetős; az egyetemek ezeket a modulokat ingyen kapják. A Stabileo AI-t és a nagy felhőalapú számítási kapacitást mindenki fizeti, az egyetemek is, a költségeket fedező áron."
    },
    {
      "q": "Használhatom a Stabileót olyan számításhoz, amelyet aláírok?",
      "a": "A tervért bármely program használata esetén az aláíró mérnök felel. A Stabileo közzéteszi, mi ellenőrzött és milyen szinten; jogosultsággal rendelkező mérnök még nem vizsgálta át függetlenül, és az acél kísérleti jelölésű, ezért a mértékadó rudakat ellenőrizze kézzel."
    },
    {
      "q": "A CIRSOC 201 melyik kiadását használja?",
      "a": "A 2025-ös kiadást. Korábbi projektekhez a projekt szabványbeállításaiban a 2005-ös is kiválasztható, de a gerendák és oszlopok méretezése ezzel a kiadással még nem érhető el. A motor ellenőrzéseit az INTI-CIRSOC 201-2005 mintapéldáival vetjük össze."
    }
  ]
};

export default body;
