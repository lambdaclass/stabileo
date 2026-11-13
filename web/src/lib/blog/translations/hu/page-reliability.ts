import type { StandingPage } from '../../pages';

const body: StandingPage['i18n']['en'] = {
  "title": "Mennyire megbízható a Stabileo? Hogyan ellenőrizzük az eredményeit",
  "description": "A Stabileo eredményeinek ellenőrzése: hét másik VEM-program, publikált példák, Leanben bizonyított hibakorlátok, nyilvános figyelmeztetések és ezek határai.",
  "eyebrow": "Megbízhatóság",
  "lead": "A Stabileo eredményeit öt, egymástól független módon ellenőrizzük, köztük hét másik végeselemes programmal való összevetéssel és olyan hibakorlátokkal, amelyek matematikai magja Leanben bizonyított. A már használatban lévő eredményeket esetleg érintő hibákat biztonsági figyelmeztetésként tesszük közzé (néhány megállapítás osztályozása még folyik, nyilvánosan), és mind a huszonnégy közzétett figyelmeztetésben leírt hiba javítva van (az utolsó négy a 0.4.0-s verzióban). Mint minden számítóprogram, a modelljét nem ellenőrzi: a terhek, a támaszok és az idealizálás a mérnök döntései.",
  "blocks": [
    {
      "k": "h",
      "t": "A hibakeresés öt módja"
    },
    {
      "k": "ul",
      "items": [
        "Összevetés más programokkal: ugyanazokat a modelleket, rögzítetteket és minden éjjel generált véletlenszerűeket, megoldjuk az OpenSees, a Code_Aster, a Frame3DD, a PyNite, a MYSTRAN, a Kratos és a CalculiX programmal is, és minden eltérést kivizsgálunk.",
        "Publikált referenciák: olyan esetek, amelyek eredményeit a szerzőik közzétették, és méretezési ellenőrzések publikált mintapéldákkal összevetve (INTI-CIRSOC, AISC és mások).",
        "Fizikai invariánsok: egy modell elforgatása, tükrözése, átszámozása vagy mértékegységeinek megváltoztatása pontosan úgy kell, hogy megváltoztassa a választ, ahogy a fizika előírja.",
        "Levezetések: a rúdelemek mátrixait szimbolikusan vezetjük le, és tagról tagra összevetjük a kóddal.",
        "Fuzzing és mutációs tesztelés: generált bemenetek milliói keresnek hibákat, és szándékosan hibákat viszünk be, hogy ellenőrizzük, a tesztek elkapják-e őket."
      ]
    },
    {
      "k": "h",
      "t": "Eredmények hibakorláttal"
    },
    {
      "k": "p",
      "t": "Azoknál az eredményeknél, amelyeknél ez lehetséges, a Stabileo intervallum-aritmetikával kiszámít egy korlátot, amely tartalmazza a megoldott egyenletrendszer pontos megoldását; ha ez nem sikerül, az eredményt tanúsítatlannak jelöli, az okkal együtt. A matematikai mag Leanben bizonyított a lineáris számításra, a kombinációkra, a modális analízisre és a képlékeny tönkremenetelre. A 0.3.0 óta keretek és rácsos tartók lineáris számításánál a korlátot magával a modellel is ellenőrizzük, független összeállítással."
    },
    {
      "k": "link",
      "slug": "end-to-end-certificates",
      "t": "Hogyan működik a modellel szembeni ellenőrzés:"
    },
    {
      "k": "h",
      "t": "Miért teszünk közzé biztonsági figyelmeztetéseket"
    },
    {
      "k": "p",
      "t": "Ez az ellenőrzés valódi hibákat talált, sokuk a biztonság kárára tévedett. Azokat tesszük közzé, amelyek a már használatban lévő eredményeket érinthették, leírva, hogyan ismerhető fel egy érintett modell és mit kell újraellenőrizni, mert egy hiba, amelyet senki sem jelent, benne marad a már leadott számításokban."
    },
    {
      "k": "ul",
      "items": [
        "Az SA-2026-001–004 a 0.2.0-s verzióban javult.",
        "Az SA-2026-005–020 a 0.3.0-s verzióban javult.",
        "Az SA-2026-021–024 a 0.4.0-s verzióban javult.",
        "Az SA-2026-025–047 a 0.5.0-s verzióval jelent meg és abban javult (az SA-2026-040 kezelve van: az ellenőrzés hiányosként van jelölve), kivéve az SA-2026-044-et: a 2D képlékeny tönkremenetel számítását a program a #758 lezárásáig elutasítja.",
        "Az alkalmazás egyszer jelzi, ha az eredmények megváltozhattak, és az érintett változás előtt mentett projektek megnyitáskor újraellenőrzést kérnek."
      ]
    },
    {
      "k": "link",
      "slug": "safety-advisories",
      "t": "A figyelmeztetések teljes listája:"
    },
    {
      "k": "h",
      "t": "Amit semmilyen ellenőrzés nem garantál"
    },
    {
      "k": "ul",
      "items": [
        "A hibakorlát a numerikus hibát korlátozza; nem bizonyítja, hogy a modell helyes, és nem korlátozza a háló diszkretizációs hibáját.",
        "Jogosultsággal rendelkező statikus tervező még nem végzett független átvizsgálást, és a CIRSOC 301 szerinti acéleredmények még kísérleti jelölésűek.",
        "Az anyagi nemlinearitást figyelembe vevő számítás teljes rúdra vonatkozó szekánsmodell.",
        "A PRO módon belüli szabvány szerinti méretezés (vasalás, szerkesztési szabályok és kapcsolatok) még fejlesztés alatt áll, és alapértelmezésben ki van kapcsolva.",
        "A nyitott biztonsági kérdések nyilvánosak a GitHubon, és minden számítás, elem és szabvány ellenőrzési szintje szerepel az érettségi mátrixban."
      ]
    },
    {
      "k": "p",
      "t": "Röviden: a Stabileo alkalmas keresztellenőrizhető számításokra, oktatásra és olyan tervezési munkára, ahol a mérnök átnézi a mértékadó eredményeket, mint bármely programnál. Ha a folyamata függetlenül átvizsgált vagy tanúsított kereskedelmi szoftvert követel meg, a Stabileo még nem tart ott, és ezt ki is mondjuk."
    },
    {
      "k": "link",
      "slug": "how-stabileo-checks-its-results",
      "t": "Az egyes ellenőrzések részletesen, a határaikkal együtt:"
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/verification/MATURITY.md",
      "label": "Érettségi mátrix",
      "t": "Minden rész ellenőrzési szintje:"
    }
  ],
  "faqTitle": "Gyakori kérdések",
  "faq": [
    {
      "q": "Megbízható a Stabileo valódi szerkezettervezési munkára?",
      "a": "Az eredményeit öt, egymástól független módon ellenőrizzük, köztük hét másik végeselemes programmal való összevetéssel és Leanben bizonyított hibakorlátokkal, a már használatban lévő eredményeket esetleg érintő hibákat pedig közzétesszük; az osztályozás alatt állók nyilvánosak a GitHubon. Jogosultsággal rendelkező mérnök még nem vizsgálta át függetlenül, és a szabvány szerinti méretezés még fejlesztés alatt áll, ezért, mint bármely programnál, a modellt és a mértékadó eredményeket a mérnök nézi át."
    },
    {
      "q": "Miért tesz közzé a Stabileo biztonsági figyelmeztetéseket?",
      "a": "Mert az ellenőrzése valódi hibákat talált, sokuk a biztonság kárára tévedett, és egy hiba, amelyet senki sem jelent, benne marad a már leadott számításokban. Minden figyelmeztetés leírja, hogyan ismerhető fel egy érintett modell és mit kell újraellenőrizni."
    },
    {
      "q": "Javítva vannak a közzétett figyelmeztetésekben leírt hibák?",
      "a": "Kettő kivételével mind. Az SA-2026-001–004 a 0.2.0-s verzióban javult, az SA-2026-005–020 a 0.3.0-sban, az SA-2026-021–024 a 0.4.0-sban, az SA-2026-025–047 pedig a 0.5.0-sban, kivéve az SA-2026-040-et és az SA-2026-044-et. Az SA-2026-040 kezelve van: az ellenőrzés hiányosként van jelölve. Az SA-2026-044 nincs javítva: a 2D képlékeny tönkremenetel számítását a program a #758 lezárásáig elutasítja."
    }
  ]
};

export default body;
