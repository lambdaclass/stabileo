import type { StandingPage } from '../../pages';

const body: StandingPage['i18n']['en'] = {
  "title": "Ingyenes, nyílt forráskódú alternatíva az ETABS helyett",
  "description": "Vesse össze a Stabileót az ETABS-munkafolyamatával: ingyenes számítás böngészőben, nyílt forráskód, ellenőrzési bizonyítékok, korlátok és tervezett import.",
  "eyebrow": "Ingyenes, nyílt forráskódú alternatíva az ETABS helyett",
  "lead": "A Stabileo ingyenes, nyílt forráskódú szerkezetszámítást kínál a böngészőben. Hogy illeszkedik-e az ETABS-munkafolyamatához, az attól függ, milyen számításokra és ellenőrzésekre van szüksége; ez nem a funkciók egyenértékűségének állítása.",
  "blocks": [
    {
      "k": "h",
      "t": "Mit fed le ma a Stabileo"
    },
    {
      "k": "p",
      "t": "A megoldó képességmátrixa rögzíti a 2D és 3D lineáris statikai számítást, a kereteket és rácsos tartókat, a teherkombinációkat és burkolókat, a P-Delta-, a kihajlási és a modális analízist. A lemez- és héjelemcsaládokat is dokumentálja. Az Alap és a PRO mód számítása elérhető; a szabvány szerinti méretezés és az MI-asszisztens fejlesztés alatt áll."
    },
    {
      "k": "p",
      "t": "Épületek esetében különítse el a megoldó lemez- és héjképességeit a PRO felülettől, amely a födémekhez, falakhoz és összetett modellekhez szolgál. A szabvány szerinti méretezés a PRO módban még fejlesztés alatt áll; attól, hogy a megoldó tud valamit, még nem áll készen a teljes épülettervezési munkafolyamat."
    },
    {
      "k": "h",
      "t": "Jelenlegi korlátok"
    },
    {
      "k": "p",
      "t": "A SAP2000/ETABS-modellek importálása tervezett, de még nem elérhető. Ne számítson arra, hogy .s2k vagy .e2k fájlokat megnyithat. A képességmátrix rögzíti a fennmaradó hiányosságokat a nemlineáris számítás robusztusságában, a vegyes rúd-/héjmodellekben és a nagyobb modellek validálásában. Az MI-asszisztens fejlesztés alatt áll, később érkezik."
    },
    {
      "k": "h",
      "t": "Hogyan ellenőrizzük az eredményeket"
    },
    {
      "k": "p",
      "t": "A közzétett referenciapéldák, a független implementációkkal végzett összehasonlítások és a tesztek eltérő szintű bizonyítékot adnak. A támogatott számításokhoz és méretezési ellenőrzésekhez gépileg ellenőrzött korlátok tartozhatnak; ez nem tanúsít minden eredményt, sem a mérnöki modellt. Az érettségi mátrix minden család bizonyítékait és nyitott kérdéseit felsorolja."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/BENCHMARKS.md#solver-capability-matrix",
      "label": "A megoldó képességei",
      "t": ""
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/verification/MATURITY.md",
      "label": "Az ellenőrzés érettsége",
      "t": ""
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/roadmap/PRODUCT_ROADMAP.md",
      "label": "Termékütemterv",
      "t": ""
    }
  ],
  "faqTitle": "Források és hatókör",
  "faq": [
    {
      "q": "Teljes értékű helyettesítője az ETABS-nek?",
      "a": "Nem állítjuk, hogy funkcióról funkcióra egyenértékű. Tekintse át a dokumentált képességeket és korlátokat a saját projektjéhez. Az ETABS nevét csak az összehasonlított munkafolyamat azonosítására említjük; ez semmilyen kapcsolatot vagy jóváhagyást nem jelent."
    }
  ]
};

export default body;
