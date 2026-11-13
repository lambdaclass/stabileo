import type { StandingPage } from '../../pages';

const body: StandingPage['i18n']['en'] = {
  "title": "Ingyenes, nyílt forráskódú alternatíva a SAP2000 helyett számításhoz, a böngészőben",
  "description": "Stabileo: ingyenes, nyílt forráskódú szerkezetszámítás a böngészőben. 2D/3D keretek, héjak, P-Delta, modális és spektrum; méretezés fizetős modulokban.",
  "eyebrow": "SAP2000-alternatíva",
  "lead": "A Stabileo ingyenes, nyílt forráskódú (AGPL-3.0) szerkezetszámító szoftver, amely a böngészőben fut, telepítés, licenckulcs és fiók nélkül. A megoldó Rust nyelven készült és WebAssemblyre van fordítva, így a modellt a saját számítógépe oldja meg. Az Alap módban 2D és 3D kereteket és rácsos tartókat lehet modellezni, terhelni, kiszámítani és az eredményeiket kiolvasni; a PRO mód ehhez födémeket és falakat, DXF- és IFC-importot, szabvány szerinti terheket és rúdellenőrzéseket ad. A számítás mindenki számára ingyenes; a méretezési modulok fizetősek, az egyetemeknek ingyenesek.",
  "blocks": [
    {
      "k": "h",
      "t": "Mikor jó alternatíva"
    },
    {
      "k": "ul",
      "items": [
        "Keretek, rácsos tartók és épületek számítása licencdíj és telepítés nélkül, bármely operációs rendszeren, amelyen fut egy modern böngésző.",
        "Egy másik program eredményeinek ellenőrzése: a Stabileót hét másik végeselemes programmal vetjük össze, és a kódjának minden sora elolvasható.",
        "Oktatás és tanulás: lépésről lépésre mutatja a merevségi módszert.",
        "Acél- és vasbeton rudak ellenőrzése az AISC 360, az EN 1993-1-1, az AISI S100, az ACI 318, az EN 1992-1-1 és az argentin CIRSOC szabványok szerint, PRO módban."
      ]
    },
    {
      "k": "h",
      "t": "Mikor még nem"
    },
    {
      "k": "ul",
      "items": [
        "Ha egy bevált kereskedelmi program szabványválasztékára és évtizedes múltjára van szüksége: a szabvány szerinti méretezés a Stabileóban még fejlesztés alatt áll.",
        "Ha a cége megköveteli, hogy a szoftvert jogosultsággal rendelkező mérnök függetlenül átvizsgálja: ilyen átvizsgálás még nem történt."
      ]
    },
    {
      "k": "link",
      "slug": "how-stabileo-checks-its-results",
      "t": "Hogyan ellenőrizzük az eredményeket, és hol érnek véget az ellenőrzések:"
    }
  ],
  "faqTitle": "Gyakori kérdések",
  "faq": [
    {
      "q": "Mi a legjobb ingyenes alternatíva a SAP2000 helyett?",
      "a": "Attól függ, mire használja a SAP2000-et. Böngészőben futó, telepítést nem igénylő 2D és 3D keret-, rácsostartó- és héjszámításhoz a Stabileo ingyenes és nyílt forráskódú. Szkriptekkel vezérelt nemlineáris kutatási számításokhoz régóta az OpenSees a nyílt forráskódú lehetőség."
    },
    {
      "q": "Használhatom a Stabileót SAP2000- vagy ETABS-licenc vásárlása helyett?",
      "a": "Keretek, rácsos tartók és sok épület számításához, valamint az AISC 360, az ACI 318, az Eurocode-ok és a CIRSOC szerinti rúdellenőrzésekhez igen. A számítás ingyenes; a speciális méretezési modulok fizetősek, az egyetemeknek ingyenesek. A szabványok teljes választékát és a hosszú gyakorlati múltat tekintve a kereskedelmi programok még többet nyújtanak; a szabvány szerinti méretezés a Stabileóban még fejlesztés alatt áll."
    },
    {
      "q": "Tényleg ingyenes a Stabileo?",
      "a": "Az alapprogram, amely a böngészőben végzi a szerkezetszámítást, nyílt forráskódú és mindenki számára ingyenes. Néhány speciális modul fizetős; az egyetemek ezeket a modulokat ingyen kapják. A Stabileo AI-t és a nagy felhőalapú számítási kapacitást mindenki fizeti, az egyetemek is, a költségeket fedező áron."
    },
    {
      "q": "Fut Macen vagy Linuxon?",
      "a": "Igen. Bármely modern böngészőben, bármely operációs rendszeren fut."
    }
  ]
};

export default body;
