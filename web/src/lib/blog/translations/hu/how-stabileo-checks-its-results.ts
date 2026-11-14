import type { PostBody } from '../../types';

const body: PostBody = {
  "title": "Hogyan ellenőrizzük a Stabileo eredményeit, és hol érnek véget az ellenőrzések",
  "excerpt": "A megoldó, a formális verifikáció és a mesterséges intelligencia: hogyan keressük a hibákat a Stabileo által adott számokban, mit bizonyítanak a tanúsítványok, és mit nem garantálhat semmilyen ellenőrzés.",
  "blocks": [
    {
      "k": "p",
      "t": "Egy szerkezetszámító program látható jel nélkül is adhat hibás számot. Az elmúlt hetekben a Stabileo minden részét több, egymástól független módon teszteltük, több tucat valódi hibát találtunk, közülük sok a biztonság kárára tévedett, és a legtöbbjüket kijavítottuk. Mindegyiket osztályozzuk, és ha érinthette a már használatban lévő eredményeket, biztonsági figyelmeztetésként tesszük közzé, azzal együtt, mit kell addig tenni; néhány osztályozása még folyamatban van. Ez a bejegyzés elmagyarázza, hogyan keressük ezeket a hibákat, mit bizonyítanak az eredményekhez tartozó tanúsítványok, és ugyanilyen nyíltan azt is, mi esik kívül minden ellenőrzésen."
    },
    {
      "k": "h",
      "t": "Egyetlen motor"
    },
    {
      "k": "p",
      "t": "A megoldó Rustban íródott, és WebAssemblyre van fordítva: a felhasználó saját számítógépén fut, telepítés nélkül, és anélkül, hogy a modellt bármilyen szerverre elküldené. Ugyanez a kód fut a folyamatos integrációban. 2026 októberében eltávolítottuk a párhuzamos TypeScript-számításokat, amelyek csendben helyettesítették a motort, ha az nem volt elérhető: az alkalmazás most ezt jelzi, ahelyett hogy egy nem ellenőrzött másolattal számolna."
    },
    {
      "k": "h",
      "t": "A hibakeresés öt módja"
    },
    {
      "k": "p",
      "t": "Egyetlen teszt sem talál meg minden hibát, ezért többet használunk, amelyek különböző módon buknak el:"
    },
    {
      "k": "ul",
      "items": [
        "Összevetés más programokkal. Ugyanazokat a modelleket, rögzítetteket és minden éjjel generált véletleneket, OpenSeesszel, Code_Asterrel, Frame3DD-vel, PyNite-tal, MYSTRAN-nal, Kratosszal és CalculiX-szel is kiszámítjuk. Minden eltérést addig vizsgálunk, amíg ki nem derül, hogy a hiba a miénk, vagy a két program eltérően modellezi az esetet.",
        "Publikált referenciák. Egy elfogadási tesztsor olyan esetekből, amelyek eredményeit a szerzőik publikálták, nem egy másik kereskedelmi program, a forrásban közölt pontosság szerint megállapított tűrésekkel. A méretezési ellenőrzéseket publikált, kidolgozott példákkal (INTI-CIRSOC, AISC és mások) vetjük össze.",
        "Fizikai invariánsok. Egy modell elforgatásának, tükrözésének, átszámozásának vagy mértékegységei megváltoztatásának pontosan úgy kell megváltoztatnia a választ, ahogy a fizika előírja; a szuperpozíciónak, a reciprocitásnak és az energiamérlegnek teljesülnie kell. Ezekhez a tesztekhez egyáltalán nincs szükség referenciaértékre.",
        "Levezetések. A rúdelemek mátrixait első elvekből szimbolikusan vezetjük le, és tagról tagra összevetjük a kódban szereplőkkel; a többi elemhez írásos levezetések vannak, hogy egy másik mérnök átnézhesse őket.",
        "Fuzzing és mutációs tesztelés. Generált bemenetek milliói keresnek összeomlásokat és nem véges eredményeket, és szándékosan hibákat juttatunk a kódba, hogy ellenőrizzük, a tesztek elkapják-e őket."
      ]
    },
    {
      "k": "table",
      "caption": "Az ellenőrzési munka néhány adata a tárolóban lévő dokumentumokból.",
      "head": [
        "Mi",
        "Szám"
      ],
      "rows": [
        [
          "Független végeselemes programok az összevetésben",
          "7"
        ],
        [
          "Elfogadási esetek publikált eredményekkel",
          "12"
        ],
        [
          "Publikált referenciaértékek ezekben az esetekben",
          "105"
        ],
        [
          "Lean-tételek, amelyek axiómáit a folyamatos integráció ellenőrzi",
          "37"
        ]
      ]
    },
    {
      "k": "note",
      "t": "A 105 referenciaérték többnyire épületkeretek sajátfrekvenciája (SAC, IASC-ASCE, Bathe és Wilson). Jól lefedik a keretek modális és lineáris analízisét; más analízisfajtákra nem szolgálnak bizonyítékul."
    },
    {
      "k": "h",
      "t": "Tanúsítványok: eredmény hibakorláttal"
    },
    {
      "k": "p",
      "t": "Az ezt támogató eredményeknél a Stabileo a háttérben tanúsítványt is megkísérel: egy intervallumaritmetikával számított korlátot, amely tartalmazza az általa megoldott rendszer pontos megoldását. Ha ez nem sikerül, az eredményt tanúsítatlanként jelöli, az okkal együtt. A korlát a numerikus hibára vonatkozik, nem a háló vagy az időlépés diszkretizációs hibájára. A lineáris analízis, a kombinációk, a modális analízis és a képlékeny tönkremenetel esetén e korlát matematikai magja Leanben bizonyított, egy bizonyításasszisztensben, amelyben a számítógép minden lépést ellenőriz; néhány lépés (a kényszerek, a modális ellenőrzés egyik feltétele) még nincs formalizálva. A P-Delta, a spektrális, a harmonikus és az időtörténeti analízis szintén kap tanúsítványt, de ezek matematikája még nincs Leanben formalizálva. A folyamatos integráció elutasít minden hiányos bizonyítást vagy hozzáadott axiómát, és bizonyos tanúsítványfajtáknál az ellenőrző, amely fut, maga az a Lean-kód, amelyről a bizonyítások szólnak."
    },
    {
      "k": "img",
      "base": "blog/certificate",
      "w": 1600,
      "h": 1000,
      "alt": "Stabileo Alap mód a kiszámított keretállás-példával. Az eredménypanel a csomópontok elmozdulásait mutatja, az Eredményellenőrzések alatt pedig a „Tanúsítva: elmozdulási hiba ≤ 3,41e-16” sort a tanúsítvány letöltésére szolgáló hivatkozással, valamint a „Végponttól végpontig ellenőrizve: a modell független újra-összeállítása egyezik” sort.",
      "caption": "Egy kiszámított keret: a tanúsítvány korlátja az elmozdulási hibára és a végponttól végpontig tartó ellenőrzés, az Eredményellenőrzések alatt."
    },
    {
      "k": "h",
      "t": "Amit a tanúsítványok nem mondanak"
    },
    {
      "k": "ul",
      "items": [
        "Egy tanúsítvány a rendszer megoldásának hibáját korlátozza, úgy, ahogy a rendszert összeállították. Azt nem bizonyítja, hogy a rendszer a modellt képviseli: a merevségi mátrix és a terhek összeállítását a fenti módokon teszteljük, de nem tanúsítjuk. Amikor a csavarási kihajlás hiányzott (SA-2026-007), a tanúsítvány a rossz feladatot tanúsította. A 0.3.0 óta a végponttól végpontig tartó tanúsítványok keretekre és rácsos tartókra függetlenül újra összeállítják a rendszert, és az eredményt magával a modellel vetik össze; a héjakra, tömör testekre és kapcsolóelemekre ez még nem terjed ki.",
        "A Lean a matematikát bizonyítja; azt, hogy a Rust-kód pontosan ezt az algoritmust valósítja meg, nem bizonyítjuk, kivéve azokat az ellenőrzőket, amelyek maguk Lean-kódok.",
        "A tanúsított méretezési ellenőrzések intervallumaritmetikával értékelik ki a képleteiket, de maguk a képletek nincsenek formalizálva: ahol van ilyen, publikált, kidolgozott példákkal vetjük össze őket, és minden szabvány lefedettsége (mely cikkek, mely példák) az érettségi mátrixban szerepel. A falazott szerkezetek, a kapcsolatok, az alapozások és a használhatósági ellenőrzések nincsenek tanúsítva.",
        "A program semmilyen ellenőrzése nem ellenőrzi a modellt. A terhek, a támaszok és az idealizálás a mérnök döntései; a modell áttekintése figyelmeztet a gyakori hibákra, de nem helyettesíti a mérnöki ítélőképességet.",
        "Jogosultsággal rendelkező szerkezettervező mérnök független felülvizsgálata még nem történt. A CIRSOC 301 szerinti eredmények továbbra is kísérleti jelölést kapnak."
      ]
    },
    {
      "k": "h",
      "t": "A mesterséges intelligencia vázol és átnéz, de nem számol"
    },
    {
      "k": "p",
      "t": "Az MI-asszisztens leírásból modellvázlatot készít, és átnézi a meglévő modelleket, de eredményeket nem számít: a számok a megoldóból és az alkalmazás méretezési ellenőrző moduljaiból származnak. Magyarázatai nyelvimodell-szövegek, és tévesek lehetnek; azok az értékek számítanak, amelyek az eredményekben szerepelnek. Egy módosítás alkalmazása előtt megmutatja, mit fog megváltoztatni, és egy lépésben visszavonható. Az MI-funkciók a leírást és a modellt egy szerverre küldik, amely egy nyelvi modellt kérdez le; a megoldónak, az eredményeknek és az ellenőrzéseknek nincs rá szükségük, és internetkapcsolat nélkül is működnek."
    },
    {
      "k": "link",
      "slug": "the-determinism-boundary",
      "t": "Miért nem szabad, hogy egy MI-ágens számoljon, egy kidolgozott esettel:"
    },
    {
      "k": "h",
      "t": "Ha valami elromlik"
    },
    {
      "k": "p",
      "t": "Azokat a hibákat, amelyek érinthették a már használatban lévő eredményeket, biztonsági figyelmeztetésként tesszük közzé, azzal együtt, hogyan ismerhető fel egy érintett modell, és mit kell addig tenni; a többi biztonsági hiba osztályozása folyamatban van, és felkerülnek, ha indokolt. A nyitott figyelmeztetéseket akkor zárjuk le, amikor a javítás élesben van a stabileo.com-on."
    },
    {
      "k": "link",
      "slug": "safety-advisories",
      "t": "A közzétett figyelmeztetések és állapotuk:"
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/verification/TRUSTED_BASE.md",
      "label": "A tanúsítványok megbízható bázisa",
      "t": "Mi bizonyított, mi tesztelt és miben bízunk, komponensenként:"
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/verification/MATURITY.md",
      "label": "Ellenőrzési érettségi mátrix",
      "t": "Minden analízisre, elemre és méretezési szabványra az elért ellenőrzési szint és a bizonyítékok:"
    }
  ]
};

export default body;
