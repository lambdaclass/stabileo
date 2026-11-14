import type { StandingPage } from '../../pages';
import { COMPANY } from '../../pages/legal-company';

const body: StandingPage['i18n']['en'] = {
  title: 'A Stabileo Felhasználási feltételei',
  description: 'A Stabileo használatának feltételei: a szolgáltató, az eredményekért viselt szakmai felelősség, az Ön fiókja és projektjei.',
  eyebrow: 'Jogi tudnivalók',
  lead: 'E feltételek szabályozzák a Stabileo használatát, a Stabileo SAS által a stabileo.com oldalon nyújtott tartószerkezeti számítási alkalmazást. 2026. október 27-től hatályosak. Fiókja létrehozásakor elfogadja őket, változásuk esetén pedig az alkalmazás további használata előtt ismét az elfogadásukat kérjük.',
  blocks: [
    { k: 'h', t: 'A szolgáltató' },
    { k: 'p', t: COMPANY },
    { k: 'h', t: 'Mi a Stabileo' },
    { k: 'p', t: 'A böngészőben futó, tartószerkezeti számításokat segítő eszköz. A számítómotor és az Alap mód az AGPL-3.0 licenc szerinti szabad szoftver. A közzétett kódra ez a licenc vonatkozik; a stabileo.com szolgáltatásának használatát e feltételek szabályozzák, beleértve a fiókokat és a kód részét nem képező szolgáltatásokat.' },
    { k: 'h', t: 'Felelősség az eredményekért' },
    { k: 'p', t: 'A Stabileo eredményei segítik a számítást, de nem helyettesítik a szakmai mérlegelést. Jogosultsággal rendelkező szakembernek kell ellenőriznie őket, aki a tervet aláírja és felelősséget vállal érte. A terheket, támaszokat, anyagokat és a modell idealizálását a számítást végző személy határozza meg. A Stabileo SAS nem garantálja az eredmények hibamentességét. Ha olyan hibát találunk, amely már felhasznált eredményeket érinthetett, biztonsági közleményben tesszük közzé.' },
    { k: 'h', t: 'Az Ön fiókja' },
    {
      k: 'ul',
      items: [
        'A megadott adatoknak valósnak kell lenniük, és a fiók személyes.',
        'Google-fiókjával jelentkezik be: gondoskodik annak biztonságáról, és jelzi nekünk, ha jogosulatlan hozzáférésre gyanakszik.',
        'Felfüggeszthetjük a szolgáltatás vagy mások károsítására használt, illetve e feltételeket megsértő fiókot.',
      ],
    },
    { k: 'h', t: 'Elfogadható használat' },
    {
      k: 'ul',
      items: [
        'Ne próbáljon mások adataihoz hozzáférni vagy a szolgáltatás biztonságát megsérteni.',
        'Ne terhelje túl a szolgáltatást automatizált eszközökkel.',
        'Ne használja a Stabileót jogellenes tevékenységre.',
      ],
    },
    { k: 'h', t: 'Az Ön projektjei' },
    { k: 'p', t: 'Az Ön által létrehozott modellek és projektek az Önéi. Ha a felhőbe menti őket, megőrizzük, hogy fiókjából megnyithassa őket, és bármikor törölheti is őket. E Feltételek elfogadásával hozzájárul mentett projektjei anonimizált felhasználásához a Stabileo fejlesztésére. Ez be van kapcsolva; ha nem kívánja, profilja Adatvédelem részében bármikor kikapcsolhatja. Bizalmas vagy ügyfélhez tartozó projekt esetén az Ön feladata a mentés előtti kikapcsolás. Az egyedi vállalati modulokra ez soha nem terjed ki.' },
    { k: 'h', t: 'Névtelen használati adatok' },
    { k: 'p', t: 'A Stabileo névtelen használati adatokat küld: mely eszközöket használják, hogyan végződnek a számítások, és mi az alkalmazás verziója. A modellek tartalmát soha nem küldi el. E Feltételek elfogadásával hozzájárul a küldéshez: ez be van kapcsolva, de ha nem kívánja, profilja Adatvédelem részében bármikor kikapcsolhatja. Fiók nélkül csak akkor küldjük, ha a megosztást választja. A teljes lista a „Milyen névtelen használati adatokat küld a Stabileo” oldalon, kezelésük pedig az Adatvédelmi tájékoztatóban található.' },
    { k: 'h', t: 'Elérhetőség' },
    { k: 'p', t: 'A Stabileo aktív fejlesztés alatt áll: változhat, kimaradások lehetnek, vagy egyes funkciók megszűnhetnek. Javasoljuk, hogy a .ded fájl letöltésével tartson másolatot projektjeiről.' },
    { k: 'h', t: 'A felelősség korlátozása' },
    { k: 'p', t: 'A Stabileo ingyenes és nyílt forráskódú szoftver (AGPL-3.0), amelyet jelen állapotában, bármiféle garancia nélkül nyújtunk. A jogszabályok által megengedett mértékben a Stabileo SAS nem felel az eredmények megfelelő szakmai ellenőrzés nélküli használatából eredő károkért, sem az olyan adatok elvesztéséért, amelyekről nem készített biztonsági másolatot. Mindez nem korlátozza az argentin 24.240. számú fogyasztóvédelmi törvény alapján Önt megillető jogokat, ahol az alkalmazandó.' },
    { k: 'h', t: 'A feltételek módosítása' },
    { k: 'p', t: 'Módosítás esetén közzétesszük az új változatot a dátumával, és fiókja további használata előtt az elfogadását kérjük.' },
    { k: 'h', t: 'Irányadó jog' },
    { k: 'p', t: 'E feltételekre az Argentin Köztársaság joga irányadó. Jogvita esetén Buenos Aires város rendes bíróságai illetékesek, kivéve, ha jogszabály az Ön javára más joghatóságot biztosít.' },
    { k: 'h', t: 'Kapcsolat' },
    { k: 'p', t: 'A stabileo.com oldalon közzétett kapcsolatfelvételi csatornákon érhet el minket.' },
  ],
  faqTitle: 'Gyakran ismételt kérdések',
  faq: [],
};

export default body;
